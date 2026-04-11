import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { buildLatestCveIntelFeed, enrichWithNvd } from './api/_lib/intel.js';

// 加载环境变量
dotenv.config();

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 3001;
const UPSTREAM_TIMEOUT = 45000;

// 配置CORS
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', 'http://13.236.132.48'],
  credentials: true
}));

// 解析JSON请求体
app.use(express.json());

// 获取API密钥（从环境变量）
let LEAKRADAR_API_KEY = process.env.LEAKRADAR_API_KEY;
let OTX_API_KEY = process.env.OTX_API_KEY;
let TRENDRADAR_API_URL = process.env.TRENDRADAR_API_URL; // TrendRadar API 地址
const OTX_UPSTREAM_URL = 'https://otx.alienvault.com/api/v1';
const OTX_INTERNAL_UPSTREAM_URL = 'https://otx.alienvault.com/otxapi';
const OTX_SEARCH_CACHE_TTL = 10 * 60 * 1000;
const otxSearchCache = new Map();

// 从.env文件加载密钥
if (!LEAKRADAR_API_KEY) {
  LEAKRADAR_API_KEY = process.env.VITE_LEAKRADAR_API_KEY;
}

if (!OTX_API_KEY) {
  OTX_API_KEY = process.env.VITE_OTX_API_KEY;
}

const getCacheKey = (type, query) => `${type}:${String(query).trim().toLowerCase()}`;

const getCachedOtxSearch = (type, query) => {
  const cacheKey = getCacheKey(type, query);
  const cached = otxSearchCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    otxSearchCache.delete(cacheKey);
    return null;
  }
  return cached.value;
};

const setCachedOtxSearch = (type, query, value) => {
  otxSearchCache.set(getCacheKey(type, query), {
    value,
    expiresAt: Date.now() + OTX_SEARCH_CACHE_TTL,
  });
};

const isDisplayableValue = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return !Number.isNaN(value);
  if (typeof value === 'boolean') return true;
  return false;
};

const pickFirstValue = (...values) => values.find((value) => isDisplayableValue(value));

const getValueAtPath = (source, path) => {
  if (!source || typeof source !== 'object') return undefined;
  return path.split('.').reduce((current, key) => (current && current[key] !== undefined ? current[key] : undefined), source);
};

const pickFirstPath = (source, paths, fallback) => {
  const value = pickFirstValue(...paths.map((path) => getValueAtPath(source, path)));
  return value === undefined ? fallback : value;
};

const unwrapPayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload || {};
  return payload.general || payload.data || payload.result || payload;
};

const extractFirstArray = (...candidates) => {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (!candidate || typeof candidate !== 'object') continue;

    for (const value of Object.values(candidate)) {
      if (Array.isArray(value)) return value;
    }
  }

  return [];
};

const getCollection = (payload, key) =>
  extractFirstArray(
    getValueAtPath(payload, key),
    getValueAtPath(payload, `data.${key}`),
    getValueAtPath(payload, `result.${key}`),
    getValueAtPath(payload, `results.${key}`),
    getValueAtPath(payload, 'items'),
    getValueAtPath(payload, 'entries'),
    getValueAtPath(payload, 'records'),
    getValueAtPath(payload, 'list'),
    getValueAtPath(payload, 'data'),
    getValueAtPath(payload, 'result'),
    getValueAtPath(payload, 'results')
  );

const formatDisplayDate = (value) => {
  if (!value || typeof value === 'object') return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
};

const getTopLevelDomainFromHost = (host) => {
  if (typeof host !== 'string') return '';
  const normalizedHost = host.trim().toLowerCase();
  if (!normalizedHost || !normalizedHost.includes('.')) return '';
  const parts = normalizedHost.split('.');
  return parts.slice(-2).join('.');
};

const getTopLevelDomains = (passiveDns, fallbackHosts = []) => {
  const tlds = new Set();
  passiveDns.forEach((record) => {
    const tld = getTopLevelDomainFromHost(record?.hostname);
    if (tld) tlds.add(tld);
  });
  fallbackHosts.forEach((host) => {
    const tld = getTopLevelDomainFromHost(host);
    if (tld) tlds.add(tld);
  });
  return Array.from(tlds).slice(0, 8);
};

const getUnifiedTags = (pulses) => {
  const tags = new Set();
  pulses.forEach((pulse) => {
    if (!Array.isArray(pulse?.tags)) return;
    pulse.tags.forEach((tag) => {
      if (typeof tag === 'string' && tag.trim()) tags.add(tag.trim());
    });
  });
  return Array.from(tags).slice(0, 12);
};

const buildSectionState = (status, message) => ({ status, message });

const getHttpScans = (payload) => {
  const candidates = [
    getValueAtPath(payload, 'http_scans'),
    getValueAtPath(payload, 'data.http_scans'),
    getValueAtPath(payload, 'result.http_scans'),
    getValueAtPath(payload, 'data'),
    payload,
  ];

  const scans = candidates.find((candidate) => {
    if (Array.isArray(candidate)) return true;
    return Boolean(candidate && typeof candidate === 'object');
  });

  if (Array.isArray(scans)) return scans;
  if (!scans || typeof scans !== 'object') return [];

  return Object.entries(scans)
    .filter(([key, value]) => isDisplayableValue(key) && isDisplayableValue(value))
    .map(([key, value]) => ({
      key,
      name: key,
      value: typeof value === 'object' ? JSON.stringify(value) : String(value),
    }));
};

const requestOtxSection = async (endpoint, options = {}) => {
  const { internal = false } = options;
  try {
    const response = await axios.get(`${internal ? OTX_INTERNAL_UPSTREAM_URL : OTX_UPSTREAM_URL}${endpoint}`, {
      headers: {
        ...(internal ? {} : { 'X-OTX-API-KEY': OTX_API_KEY }),
        'Content-Type': 'application/json',
      },
      timeout: UPSTREAM_TIMEOUT,
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return {};
    }
    throw error;
  }
};

const requestOtxCandidates = async (candidates) => {
  const normalizedCandidates = Array.isArray(candidates) ? candidates : [candidates];
  let lastError = null;

  for (let index = 0; index < normalizedCandidates.length; index += 1) {
    const candidate = normalizedCandidates[index];
    try {
      const result = await requestOtxSection(candidate.endpoint, { internal: candidate.internal });
      const shouldFallback =
        candidate.internal &&
        index < normalizedCandidates.length - 1 &&
        result &&
        typeof result === 'object' &&
        !Array.isArray(result) &&
        Object.keys(result).length === 0;

      if (shouldFallback) {
        continue;
      }

      return result;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('OTX candidate request failed');
};

const buildStructuredOtxResult = async (type, query) => {
  if (type === 'ip') {
    const ipVersion = query.includes(':') ? 'IPv6' : 'IPv4';
    const [generalPayload, passiveDnsPayload, malwarePayload, urlListPayload] = await Promise.all([
      requestOtxSection(`/indicators/${ipVersion}/${query}/general`),
      requestOtxSection(`/indicators/${ipVersion}/${query}/passive_dns`),
      requestOtxSection(`/indicators/${ipVersion}/${query}/malware`),
      requestOtxSection(`/indicators/${ipVersion}/${query}/url_list`),
    ]);
    const general = unwrapPayload(generalPayload);
    const pulses = Array.isArray(general?.pulse_info?.pulses) ? general.pulse_info.pulses : [];
    const passiveDns = getCollection(passiveDnsPayload, 'passive_dns');
    const malware = getCollection(malwarePayload, 'malware');
    const urlList = getCollection(urlListPayload, 'url_list');
    return {
      type,
      query,
      indicator: pickFirstPath(general, ['indicator', 'ip', 'address'], query),
      reputation: pickFirstPath(general, ['reputation', 'reputation_label']),
      asn: pickFirstPath(general, ['asn', 'asn_info.asn', 'geo.asn', 'as_number']),
      asn_org: pickFirstPath(general, ['asn_info.name', 'asn_info.organization', 'asn_info.org_name', 'organization', 'org_name']),
      country: pickFirstPath(general, ['country_name', 'country', 'geo.country_name', 'location.country']),
      city: pickFirstPath(general, ['city', 'geo.city', 'location.city']),
      pulse_info: {
        count: pickFirstPath(general, ['pulse_info.count', 'pulse_count'], pulses.length || 0),
        pulses,
      },
      passive_dns: passiveDns,
      malware,
      url_list: urlList,
      derived: {
        dns_resolutions: passiveDns.length,
        top_level_domains: getTopLevelDomains(passiveDns),
        tags: getUnifiedTags(pulses),
      },
      section_states: {
        pulses: buildSectionState(pulses.length > 0 ? 'success' : 'no_data', pulses.length > 0 ? '已返回关联情报。' : '当前对象没有关联 Pulses。'),
        passive_dns: buildSectionState(passiveDns.length > 0 ? 'success' : 'no_data', passiveDns.length > 0 ? '已返回被动 DNS 记录。' : '当前对象没有被动 DNS 记录。'),
        url_list: buildSectionState(urlList.length > 0 ? 'success' : 'no_data', urlList.length > 0 ? '已返回关联 URL。' : '当前对象没有关联 URL。'),
        malware: buildSectionState(malware.length > 0 ? 'success' : 'no_data', malware.length > 0 ? '已返回恶意样本。' : '当前对象没有恶意样本。'),
      },
    };
  }

  if (type === 'domain') {
    const [generalPayload, passiveDnsPayload, whoisPayload, malwarePayload] = await Promise.all([
      requestOtxSection(`/indicators/domain/${query}/general`),
      requestOtxSection(`/indicators/domain/${query}/passive_dns`),
      requestOtxSection(`/indicators/domain/${query}/whois`),
      requestOtxSection(`/indicators/domain/${query}/malware`),
    ]);
    const general = unwrapPayload(generalPayload);
    const pulses = Array.isArray(general?.pulse_info?.pulses) ? general.pulse_info.pulses : [];
    const passiveDns = getCollection(passiveDnsPayload, 'passive_dns');
    return {
      type,
      query,
      indicator: pickFirstPath(general, ['indicator', 'domain', 'hostname'], query),
      reputation: pickFirstPath(general, ['reputation', 'reputation_label']),
      whois: unwrapPayload(whoisPayload) || {},
      pulse_info: {
        count: pickFirstPath(general, ['pulse_info.count', 'pulse_count'], pulses.length || 0),
        pulses,
      },
      passive_dns: passiveDns,
      malware: getCollection(malwarePayload, 'malware'),
      url_list: [],
      derived: {
        dns_resolutions: passiveDns.length,
        top_level_domains: getTopLevelDomains(passiveDns),
        tags: getUnifiedTags(pulses),
      },
      section_states: {
        pulses: buildSectionState(pulses.length > 0 ? 'success' : 'no_data', pulses.length > 0 ? '已返回关联情报。' : '当前对象没有关联 Pulses。'),
        passive_dns: buildSectionState(passiveDns.length > 0 ? 'success' : 'no_data', passiveDns.length > 0 ? '已返回被动 DNS 记录。' : '当前对象没有被动 DNS 记录。'),
        url_list: buildSectionState('not_supported', '域名查询结果页当前不展示 URL 列表。'),
        malware: buildSectionState(getCollection(malwarePayload, 'malware').length > 0 ? 'success' : 'no_data', getCollection(malwarePayload, 'malware').length > 0 ? '已返回恶意样本。' : '当前对象没有恶意样本。'),
      },
    };
  }

  if (type === 'url') {
    const encodedQuery = encodeURIComponent(query.replace(/^https?:\/\//, '').replace(/\/$/, ''));
    const [generalPayload, urlListPayload] = await Promise.all([
      requestOtxSection(`/indicators/url/${encodedQuery}/general`),
      requestOtxSection(`/indicators/url/${encodedQuery}/url_list`),
    ]);
    const general = unwrapPayload(generalPayload);
    const pulses = Array.isArray(general?.pulse_info?.pulses) ? general.pulse_info.pulses : [];
    return {
      type,
      query,
      indicator: pickFirstPath(general, ['indicator', 'url', 'urlworker.url', 'urlworker.result.url'], query),
      domain: pickFirstPath(general, ['domain', 'hostname', 'urlworker.domain', 'urlworker.result.domain']),
      ip: pickFirstPath(general, ['ip', 'address', 'urlworker.ip', 'urlworker.result.ip']),
      reputation: pickFirstPath(general, ['reputation', 'reputation_label']),
      pulse_info: {
        count: pickFirstPath(general, ['pulse_info.count', 'pulse_count'], pulses.length || 0),
        pulses,
      },
      passive_dns: [],
      malware: [],
      url_list: getCollection(urlListPayload, 'url_list'),
      derived: {
        dns_resolutions: 0,
        top_level_domains: [],
        tags: getUnifiedTags(pulses),
      },
      section_states: {
        pulses: buildSectionState(pulses.length > 0 ? 'success' : 'no_data', pulses.length > 0 ? '已返回关联情报。' : '当前对象没有关联 Pulses。'),
        passive_dns: buildSectionState('not_supported', 'URL 查询当前不提供被动 DNS 记录。'),
        url_list: buildSectionState(getCollection(urlListPayload, 'url_list').length > 0 ? 'success' : 'no_data', getCollection(urlListPayload, 'url_list').length > 0 ? '已返回关联 URL。' : '当前对象没有关联 URL。'),
        malware: buildSectionState('not_supported', 'URL 查询当前不提供恶意样本列表。'),
      },
    };
  }

  if (type === 'cve') {
    const normalizedQuery = String(query).toUpperCase();
    const [generalPayload, pulsesPayload] = await Promise.all([
      requestOtxSection(`/indicators/cve/${normalizedQuery}/general`),
      requestOtxSection(`/indicators/cve/${normalizedQuery}/top_n_pulses`),
    ]);
    const general = unwrapPayload(generalPayload);
    const pulses = getCollection(pulsesPayload, 'top_n_pulses');
    return {
      type,
      query: normalizedQuery,
      indicator: pickFirstPath(general, ['indicator', 'name', 'id', 'cve'], normalizedQuery),
      base_score: pickFirstPath(general, ['base_score', 'cvss_score', 'cvss.base_score', 'cvss.score', 'cvss.cvssV3.baseScore', 'cvss3.base_score', 'cvss3.score']),
      published: formatDisplayDate(pickFirstPath(general, ['published', 'published_date', 'release_date', 'created', 'modified', 'updated'])),
      description: pickFirstPath(general, ['description', 'details', 'summary'], ''),
      pulse_info: {
        count: pickFirstPath(general, ['pulse_info.count', 'pulse_count'], pulses.length || 0),
        pulses: [],
      },
      top_n_pulses: pulses,
      passive_dns: [],
      malware: [],
      url_list: [],
      derived: {
        dns_resolutions: 0,
        top_level_domains: [],
        tags: getUnifiedTags(pulses),
      },
      section_states: {
        pulses: buildSectionState(pulses.length > 0 ? 'success' : 'no_data', pulses.length > 0 ? '已返回关联情报。' : '当前 CVE 没有关联 Pulses。'),
        passive_dns: buildSectionState('not_supported', 'CVE 查询不提供被动 DNS 记录。'),
        url_list: buildSectionState('not_supported', 'CVE 查询不提供关联 URL。'),
        malware: buildSectionState('not_supported', 'CVE 查询不提供恶意样本列表。'),
      },
    };
  }

  throw new Error(`Unsupported OTX search type: ${type}`);
};

const buildStructuredOtxResultV2 = async (type, query) => {
  if (type === 'ip') {
    const ipVersion = query.includes(':') ? 'IPv6' : 'IPv4';
    const [generalPayload, reputationPayload, geoPayload, passiveDnsPayload, malwarePayload, urlListPayload, httpScansPayload] = await Promise.all([
      requestOtxCandidates([{ endpoint: `/indicators/ip/general/${query}`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/general`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/${ipVersion}/reputation/${query}`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/reputation`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/${ipVersion}/geo/${query}`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/geo`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/${ipVersion}/passive_dns/${query}`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/passive_dns`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/${ipVersion}/malware/${query}?limit=10&page=1`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/malware`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/${ipVersion}/url_list/${query}`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/url_list`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/${ipVersion}/http_scans/${query}`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/http_scans`, internal: false }]),
    ]);
    const general = unwrapPayload(generalPayload);
    const reputation = unwrapPayload(reputationPayload);
    const geo = unwrapPayload(geoPayload);
    const pulses = Array.isArray(general?.pulse_info?.pulses) ? general.pulse_info.pulses : [];
    const passiveDns = getCollection(passiveDnsPayload, 'passive_dns');
    const malware = getCollection(malwarePayload, 'malware');
    const urlList = getCollection(urlListPayload, 'url_list');
    const httpScans = getHttpScans(httpScansPayload);

    return {
      type,
      query,
      indicator: pickFirstPath(general, ['indicator', 'ip', 'address'], query),
      reputation: pickFirstPath(reputation, ['reputation', 'reputation_label', 'score'], pickFirstPath(general, ['reputation', 'reputation_label'])),
      reputation_details: reputation,
      asn: pickFirstPath(geo, ['asn', 'as_number'], pickFirstPath(general, ['asn', 'asn_info.asn', 'geo.asn', 'as_number'])),
      asn_org: pickFirstPath(geo, ['asn_name', 'organization', 'org_name'], pickFirstPath(general, ['asn_info.name', 'asn_info.organization', 'asn_info.org_name', 'organization', 'org_name'])),
      country: pickFirstPath(geo, ['country_name', 'country'], pickFirstPath(general, ['country_name', 'country', 'geo.country_name', 'location.country'])),
      city: pickFirstPath(geo, ['city'], pickFirstPath(general, ['city', 'geo.city', 'location.city'])),
      geo,
      pulse_info: {
        count: pickFirstPath(general, ['pulse_info.count', 'pulse_count'], pulses.length || 0),
        pulses,
      },
      passive_dns: passiveDns,
      malware,
      url_list: urlList,
      http_scans: httpScans,
      derived: {
        dns_resolutions: passiveDns.length,
        top_level_domains: getTopLevelDomains(passiveDns),
        tags: getUnifiedTags(pulses),
        http_scan_count: httpScans.length,
      },
      section_states: {
        pulses: buildSectionState(pulses.length > 0 ? 'success' : 'no_data', pulses.length > 0 ? '已找到关联情报。' : '未找到关联情报。'),
        passive_dns: buildSectionState(passiveDnsCount > 0 ? 'success' : 'no_data', passiveDnsCount > 0 ? '已获取被动 DNS 记录。' : '未找到被动 DNS 记录。'),
        url_list: buildSectionState(urlList.length > 0 ? 'success' : 'no_data', urlList.length > 0 ? '已找到关联 URL。' : '未找到关联 URL。'),
        malware: buildSectionState(malwareCount > 0 ? 'success' : 'no_data', malwareCount > 0 ? '已获取恶意样本记录。' : '未找到恶意样本记录。'),
        http_scans: buildSectionState(httpScanCount > 0 ? 'success' : 'no_data', httpScanCount > 0 ? '已获取 HTTP 扫描记录。' : '未找到 HTTP 扫描记录。'),
      },
    };
  }

  if (type === 'domain') {
    const [generalPayload, geoPayload, passiveDnsPayload, whoisPayload, malwarePayload, urlListPayload, httpScansPayload] = await Promise.all([
      requestOtxCandidates([{ endpoint: `/indicators/domain/general/${query}`, internal: true }, { endpoint: `/indicators/domain/${query}/general`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/domain/geo/${query}`, internal: true }, { endpoint: `/indicators/domain/${query}/geo`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/domain/passive_dns/${query}`, internal: true }, { endpoint: `/indicators/domain/${query}/passive_dns`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/domain/whois/${query}`, internal: true }, { endpoint: `/indicators/domain/${query}/whois`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/domain/malware/${query}?limit=10&page=1`, internal: true }, { endpoint: `/indicators/domain/${query}/malware`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/domain/url_list/${query}`, internal: true }, { endpoint: `/indicators/domain/${query}/url_list`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/domain/http_scans/${query}`, internal: true }, { endpoint: `/indicators/domain/${query}/http_scans`, internal: false }]),
    ]);
    const general = unwrapPayload(generalPayload);
    const geo = unwrapPayload(geoPayload);
    const pulses = Array.isArray(general?.pulse_info?.pulses) ? general.pulse_info.pulses : [];
    const passiveDns = getCollection(passiveDnsPayload, 'passive_dns');
    const malware = getCollection(malwarePayload, 'malware');
    const urlList = getCollection(urlListPayload, 'url_list');
    const httpScans = getHttpScans(httpScansPayload);
    const indicator = pickFirstPath(general, ['indicator', 'domain', 'hostname'], query);

    return {
      type,
      query,
      indicator,
      reputation: pickFirstPath(general, ['reputation', 'reputation_label']),
      country: pickFirstPath(geo, ['country_name', 'country'], pickFirstPath(general, ['country_name', 'country', 'geo.country_name', 'location.country'])),
      city: pickFirstPath(geo, ['city'], pickFirstPath(general, ['city', 'geo.city', 'location.city'])),
      geo,
      whois: unwrapPayload(whoisPayload) || {},
      pulse_info: {
        count: pickFirstPath(general, ['pulse_info.count', 'pulse_count'], pulses.length || 0),
        pulses,
      },
      passive_dns: passiveDns,
      malware,
      url_list: urlList,
      http_scans: httpScans,
      derived: {
        dns_resolutions: passiveDns.length,
        top_level_domains: getTopLevelDomains(passiveDns, [indicator]),
        tags: getUnifiedTags(pulses),
        http_scan_count: httpScans.length,
      },
      section_states: {
        pulses: buildSectionState(pulses.length > 0 ? 'success' : 'no_data', pulses.length > 0 ? '已找到关联情报。' : '未找到关联情报。'),
        passive_dns: buildSectionState(passiveDnsCount > 0 ? 'success' : 'no_data', passiveDnsCount > 0 ? '已获取被动 DNS 记录。' : '未找到被动 DNS 记录。'),
        url_list: buildSectionState(urlList.length > 0 ? 'success' : 'no_data', urlList.length > 0 ? '已找到关联 URL。' : '未找到关联 URL。'),
        malware: buildSectionState(malwareCount > 0 ? 'success' : 'no_data', malwareCount > 0 ? '已获取恶意样本记录。' : '未找到恶意样本记录。'),
        http_scans: buildSectionState(httpScanCount > 0 ? 'success' : 'no_data', httpScanCount > 0 ? '已获取 HTTP 扫描记录。' : '未找到 HTTP 扫描记录。'),
      },
    };
  }

  if (type === 'url') {
    const sanitizedQuery = query.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const encodedQuery = encodeURIComponent(sanitizedQuery);
    const [generalPayload, urlListPayload] = await Promise.all([
      requestOtxCandidates([{ endpoint: `/indicators/url/general/${encodedQuery}`, internal: true }, { endpoint: `/indicators/url/${encodedQuery}/general`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/url/url_list/${encodedQuery}`, internal: true }, { endpoint: `/indicators/url/${encodedQuery}/url_list`, internal: false }]),
    ]);
    const general = unwrapPayload(generalPayload);
    const pulses = Array.isArray(general?.pulse_info?.pulses) ? general.pulse_info.pulses : [];
    const urlList = getCollection(urlListPayload, 'url_list');
    const domain = pickFirstPath(general, ['domain', 'hostname', 'urlworker.domain', 'urlworker.result.domain']);

    return {
      type,
      query,
      indicator: pickFirstPath(general, ['indicator', 'url', 'urlworker.url', 'urlworker.result.url'], query),
      domain,
      ip: pickFirstPath(general, ['ip', 'address', 'urlworker.ip', 'urlworker.result.ip']),
      reputation: pickFirstPath(general, ['reputation', 'reputation_label']),
      pulse_info: {
        count: pickFirstPath(general, ['pulse_info.count', 'pulse_count'], pulses.length || 0),
        pulses,
      },
      passive_dns: [],
      malware: [],
      url_list: urlList,
      http_scans: [],
      derived: {
        dns_resolutions: 0,
        top_level_domains: getTopLevelDomains([], [domain || sanitizedQuery]),
        tags: getUnifiedTags(pulses),
        http_scan_count: 0,
      },
      section_states: {
        pulses: buildSectionState(pulses.length > 0 ? 'success' : 'no_data', pulses.length > 0 ? '已找到关联情报。' : '未找到关联情报。'),
        passive_dns: buildSectionState('not_supported', 'URL 查询暂不提供被动 DNS 记录。'),
        url_list: buildSectionState(urlList.length > 0 ? 'success' : 'no_data', urlList.length > 0 ? '已找到关联 URL。' : '未找到关联 URL。'),
        malware: buildSectionState('not_supported', 'URL 查询暂不提供恶意样本记录。'),
        http_scans: buildSectionState('not_supported', 'URL 查询暂不提供 HTTP 扫描记录。'),
      },
    };
  }

  if (type === 'cve') {
    const normalizedQuery = String(query).toUpperCase();
    const [generalPayload, pulsesPayload] = await Promise.all([
      requestOtxCandidates([{ endpoint: `/indicators/cve/general/${normalizedQuery}`, internal: true }, { endpoint: `/indicators/cve/${normalizedQuery}/general`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/cve/top_n_pulses/${normalizedQuery}`, internal: true }, { endpoint: `/indicators/cve/${normalizedQuery}/top_n_pulses`, internal: false }]),
    ]);
    const general = unwrapPayload(generalPayload);
    const pulses = getCollection(pulsesPayload, 'top_n_pulses');
    const nvd = await enrichWithNvd(normalizedQuery);

    return {
      type,
      query: normalizedQuery,
      indicator: pickFirstPath(general, ['indicator', 'name', 'id', 'cve'], normalizedQuery),
      base_score: pickFirstValue(
        pickFirstPath(general, ['base_score', 'cvss_score', 'cvss.base_score', 'cvss.score', 'cvss.cvssV3.baseScore', 'cvss3.base_score', 'cvss3.score']),
        nvd?.cvssScore
      ),
      published: formatDisplayDate(
        pickFirstValue(pickFirstPath(general, ['published', 'published_date', 'release_date', 'created', 'modified', 'updated']), nvd?.published)
      ),
      description: pickFirstPath(general, ['description', 'details', 'summary'], nvd?.description || ''),
      pulse_info: {
        count: pickFirstPath(general, ['pulse_info.count', 'pulse_count'], pulses.length || 0),
        pulses: [],
      },
      top_n_pulses: pulses,
      passive_dns: [],
      malware: [],
      url_list: [],
      http_scans: [],
      derived: {
        dns_resolutions: 0,
        top_level_domains: [],
        tags: getUnifiedTags(pulses),
        http_scan_count: 0,
      },
      section_states: {
        pulses: buildSectionState(pulses.length > 0 ? 'success' : 'no_data', pulses.length > 0 ? '已找到关联情报。' : '未找到关联情报。'),
        passive_dns: buildSectionState('not_supported', 'CVE 查询暂不提供被动 DNS 记录。'),
        url_list: buildSectionState('not_supported', 'CVE 查询暂不提供关联 URL。'),
        malware: buildSectionState('not_supported', 'CVE 查询暂不提供恶意样本记录。'),
        http_scans: buildSectionState('not_supported', 'CVE 查询暂不提供 HTTP 扫描记录。'),
      },
    };
  }

  throw new Error(`Unsupported OTX search type: ${type}`);
};

console.log('🔍 环境变量检查：');
console.log('   LEAKRADAR_API_KEY:', LEAKRADAR_API_KEY ? '已找到' : '未找到');
console.log('   VITE_LEAKRADAR_API_KEY:', process.env.VITE_LEAKRADAR_API_KEY ? '已找到' : '未找到');
console.log('   OTX_API_KEY:', OTX_API_KEY ? '已找到' : '未找到');
console.log('   TRENDRADAR_API_URL:', TRENDRADAR_API_URL ? '已找到' : '未配置 (舆情分析功能将不可用)');

if (!LEAKRADAR_API_KEY) {
  console.error('❌ 错误：LEAKRADAR_API_KEY 或 VITE_LEAKRADAR_API_KEY 未在环境变量中设置');
  console.error('   请在.env文件中添加以下配置：');
  console.error('   VITE_LEAKRADAR_API_KEY=your_api_key_here');
  process.exit(1);
}

// 健康检查端点
app.get('/health', (req, res) => {
  console.log(`[Health Check] ${req.method} ${req.originalUrl}`);
  res.status(200).json({
    status: 'ok',
    message: 'Server is running'
  });
});

// 处理所有API请求的中间件
app.use((req, res, next) => {
  // 只处理/api开头的请求
  if (!req.originalUrl.startsWith('/api')) {
    return next();
  }
  
  // 调用API处理函数
  handleApiRequest(req, res);
});

// 所有/api/*请求的处理函数
async function handleApiRequest(req, res) {
  try {
    const url = req.originalUrl;
    
    console.log(`[Backend Proxy] ${req.method} ${url}`);
    
    if (url.startsWith('/api/otx/search')) {
      const type = String(req.query.type || '').trim().toLowerCase();
      const query = String(req.query.query || '').trim();

      if (!query || !['ip', 'domain', 'url', 'cve'].includes(type)) {
        return res.status(400).json({
          error: 'Invalid Request',
          message: 'type and query are required',
        });
      }

      const cachedResult = getCachedOtxSearch(type, query);
      if (cachedResult) {
        return res.status(200).json({
          source: 'otx',
          cached: true,
          data: cachedResult,
        });
      }

      const structuredResult = await buildStructuredOtxResultV2(type, query);
      setCachedOtxSearch(type, query, structuredResult);

      return res.status(200).json({
        source: 'otx',
        cached: false,
        data: structuredResult,
      });
    }

    // 处理OTX API请求
    if (url.startsWith('/api/otx/cve-feed')) {
      const limit = Number(req.query.limit || 12);
      const window = String(req.query.window || '7d');
      const noCache = String(req.query.noCache || '').trim().toLowerCase() === '1';

      const data = await buildLatestCveIntelFeed({
        limit,
        window,
        noCache,
      });

      return res.status(200).json({
        success: true,
        ...data,
      });
    }

    if (url.startsWith('/api/otx')) {
      const upstreamUrl = OTX_UPSTREAM_URL;
      const targetUrl = `${upstreamUrl}${url.replace(/^\/api\/otx/, '')}`;
      
      console.log(`[Backend Proxy] -> ${targetUrl}`);
      
      // 构建请求头
      const headers = {
        ...req.headers,
        host: new URL(upstreamUrl).host,
        'X-OTX-API-KEY': OTX_API_KEY,
        // 移除可能导致问题的头
        'content-length': undefined,
        'transfer-encoding': undefined
      };
      
      // 发送请求到上游API
      const response = await axios({
        method: req.method,
        url: targetUrl,
        headers,
        data: req.body,
        timeout: UPSTREAM_TIMEOUT,
        responseType: 'stream'
      });
      
      // 设置响应头
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      
      // 设置响应状态码
      res.status(response.status);
      
      // 转发响应数据
      response.data.pipe(res);
      return;
    }
    
    // 处理 TrendRadar API 请求 (舆情分析)
    if (url.startsWith('/api/opinion')) {
      if (!TRENDRADAR_API_URL) {
        throw new Error('TrendRadar API URL not configured');
      }

      // 移除 /api/opinion 前缀，保留后续路径
      // 例如：/api/opinion/search -> /search
      // 假设 TrendRadar API 也是直接暴露在根路径或 /api 下，这里需要根据实际部署调整
      // 如果 TrendRadar 的 API 是 /api/v1/search，则需要调整 targetUrl 拼接方式
      const upstreamUrl = TRENDRADAR_API_URL.replace(/\/$/, ''); // 移除末尾斜杠
      const targetUrl = `${upstreamUrl}${url.replace(/^\/api\/opinion/, '')}`;
      
      console.log(`[Backend Proxy] -> ${targetUrl}`);
      
      const headers = {
        ...req.headers,
        host: new URL(upstreamUrl).host,
        // TrendRadar 可能需要的鉴权头，如果有的话可以在这里添加
        // 'Authorization': `Bearer ${process.env.TRENDRADAR_API_KEY}`,
        'content-length': undefined,
        'transfer-encoding': undefined
      };
      
      const response = await axios({
        method: req.method,
        url: targetUrl,
        headers,
        data: req.body,
        timeout: UPSTREAM_TIMEOUT,
        responseType: 'stream'
      });
      
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      
      res.status(response.status);
      response.data.pipe(res);
      return;
    }

    // 处理LeakRadar API请求
    const upstreamUrl = 'https://api.leakradar.io';
    let targetUrl = `${upstreamUrl}${url.replace(/^\/api/, '')}`;
    
    // 演示模式：强制限制每次查询最多10条结果
    // 将targetUrl转换为URL对象，方便操作查询参数
    const urlObj = new URL(targetUrl);
    urlObj.searchParams.set('page_size', '10');
    // 如果是解锁请求，添加限制参数
    // 根据API文档，解锁操作应该使用max参数，而不是limit参数
    if (targetUrl.includes('/unlock')) {
      urlObj.searchParams.set('max', '10');
    }
    // 转换回字符串
    targetUrl = urlObj.toString();
    
    console.log(`[Backend Proxy] -> ${targetUrl}`);
    
    // 构建请求头
    const headers = {
      ...req.headers,
      host: new URL(upstreamUrl).host,
      'Authorization': `Bearer ${LEAKRADAR_API_KEY}`,
      'X-API-Key': LEAKRADAR_API_KEY,
      // 移除可能导致问题的头
      'content-length': undefined,
      'transfer-encoding': undefined
    };
    
    // 发送请求到上游API
    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers,
      data: req.body,
      timeout: UPSTREAM_TIMEOUT,
      responseType: 'stream'
    });
    
    // 设置响应头
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    
    // 设置响应状态码
    res.status(response.status);
    
    // 转发响应数据
    response.data.pipe(res);
  } catch (error) {
    console.error(`[Backend Proxy Error] ${req.method} ${req.originalUrl}:`, error.message);
    
    // 发送错误响应
    res.status(error.response?.status || 500).json({
      error: 'Proxy Error',
      message: '无法连接到上游服务器',
      details: error.message
    });
    if (error.code === 'ECONNABORTED') {
      return;
    }
  }
}

// 404处理
app.use((req, res) => {
  console.log(`[404] ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found'
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 后端服务已启动，监听端口 ${PORT}`);
  console.log(`📡 健康检查: http://localhost:${PORT}/health`);
  console.log(`🔑 LeakRadar API Key: ${LEAKRADAR_API_KEY ? '已配置' : '未配置'}`);
  console.log(`🔑 OTX API Key: ${OTX_API_KEY ? '已配置' : '未配置'}`);
  console.log(`✨ 服务已准备就绪，等待前端请求...`);
});
