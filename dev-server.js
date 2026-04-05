import http from 'http';
import https from 'https';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';

// 加载环境变量
dotenv.config();

// JWT配置
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '5m'; // 5分钟过期

// 邮件配置 - 支持SendGrid
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.sendgrid.net',
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
  secure: process.env.SMTP_SECURE === 'true', // 使用TLS
  auth: {
    user: process.env.SMTP_USER || 'apikey', // SendGrid使用apikey作为用户名
    pass: process.env.SMTP_PASS || '' // SendGrid API密钥
  }
};

// 创建邮件传输器
const transporter = nodemailer.createTransport(SMTP_CONFIG);

// 获取API密钥和白名单（从环境变量）
const LEAKRADAR_API_KEY = process.env.LEAKRADAR_API_KEY || process.env.VITE_LEAKRADAR_API_KEY;

// 解析白名单，支持JSON数组和逗号分隔格式
let WHITELISTED_USERS = [];
try {
  if (process.env.WHITELISTED_USERS) {
    const whitelistValue = process.env.WHITELISTED_USERS;
    
    // 尝试解析为JSON数组
    try {
      WHITELISTED_USERS = JSON.parse(whitelistValue);
      if (!Array.isArray(WHITELISTED_USERS)) {
        throw new Error("Parsed whitelist is not an array");
      }
    } catch (jsonError) {
      // 解析为逗号分隔字符串
      if (typeof whitelistValue === 'string') {
        WHITELISTED_USERS = whitelistValue
          .split(',')
          .map(email => email.trim())
          .filter(email => email.length > 0);
        console.log('[Dev Server] Using comma-separated whitelist:', WHITELISTED_USERS);
      } else {
        throw jsonError;
      }
    }
  }
} catch (e) {
  console.error('[Dev Server] Error parsing whitelist:', e.message);
  WHITELISTED_USERS = [];
}

const OTX_API_KEY = process.env.OTX_API_KEY || process.env.VITE_OTX_API_KEY;
const TRENDRADAR_API_URL = process.env.TRENDRADAR_API_URL; // TrendRadar API 地址
const OTX_UPSTREAM_URL = 'https://otx.alienvault.com/api/v1';
const OTX_SEARCH_CACHE_TTL = 10 * 60 * 1000;
const otxSearchCache = new Map();

// 白名单用户密码配置（开发环境使用）
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN || '';
const GITEE_ACCESS_TOKEN = process.env.GITEE_ACCESS_TOKEN || process.env.VITE_GITEE_ACCESS_TOKEN || '';

const USER_PASSWORDS = {
  'konaa2651@gmail.com': 'password123',
  'Lysirsec@outlook.com': 'password123'
};

const getCacheKey = (type, query) => `${type}:${String(query).trim().toLowerCase()}`;

const getCachedOtxSearch = (type, query) => {
  const cached = otxSearchCache.get(getCacheKey(type, query));
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    otxSearchCache.delete(getCacheKey(type, query));
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

const getCollection = (payload, key) => {
  const collection = pickFirstValue(
    getValueAtPath(payload, key),
    getValueAtPath(payload, `data.${key}`),
    getValueAtPath(payload, `result.${key}`),
    getValueAtPath(payload, 'data')
  );
  return Array.isArray(collection) ? collection : [];
};

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
  const scans = pickFirstValue(
    getValueAtPath(payload, 'http_scans'),
    getValueAtPath(payload, 'data.http_scans'),
    getValueAtPath(payload, 'result.http_scans'),
    getValueAtPath(payload, 'data'),
    payload
  );

  return Array.isArray(scans) ? scans : [];
};

async function requestOtxSection(endpoint) {
  const response = await fetch(`${OTX_UPSTREAM_URL}${endpoint}`, {
    headers: {
      'X-OTX-API-KEY': OTX_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Lysir-Security-Platform/1.0',
    },
  });

  if (response.status === 404) {
    return {};
  }

  if (!response.ok) {
    throw new Error(`OTX request failed: ${response.status}`);
  }

  return response.json();
}

async function buildStructuredOtxResult(type, query) {
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
        passive_dns: buildSectionState(passiveDns.length > 0 ? 'success' : 'no_data', passiveDns.length > 0 ? '已返回 Passive DNS。' : '当前对象没有 Passive DNS 记录。'),
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
    const malware = getCollection(malwarePayload, 'malware');
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
      malware,
      url_list: [],
      derived: {
        dns_resolutions: passiveDns.length,
        top_level_domains: getTopLevelDomains(passiveDns),
        tags: getUnifiedTags(pulses),
      },
      section_states: {
        pulses: buildSectionState(pulses.length > 0 ? 'success' : 'no_data', pulses.length > 0 ? '已返回关联情报。' : '当前对象没有关联 Pulses。'),
        passive_dns: buildSectionState(passiveDns.length > 0 ? 'success' : 'no_data', passiveDns.length > 0 ? '已返回 Passive DNS。' : '当前对象没有 Passive DNS 记录。'),
        url_list: buildSectionState('not_supported', '域名查询结果页当前不展示 URL 列表。'),
        malware: buildSectionState(malware.length > 0 ? 'success' : 'no_data', malware.length > 0 ? '已返回恶意样本。' : '当前对象没有恶意样本。'),
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
    const urlList = getCollection(urlListPayload, 'url_list');
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
      url_list: urlList,
      derived: {
        dns_resolutions: 0,
        top_level_domains: [],
        tags: getUnifiedTags(pulses),
      },
      section_states: {
        pulses: buildSectionState(pulses.length > 0 ? 'success' : 'no_data', pulses.length > 0 ? '已返回关联情报。' : '当前对象没有关联 Pulses。'),
        passive_dns: buildSectionState('not_supported', 'URL 查询当前不提供 Passive DNS。'),
        url_list: buildSectionState(urlList.length > 0 ? 'success' : 'no_data', urlList.length > 0 ? '已返回关联 URL。' : '当前对象没有关联 URL。'),
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
        passive_dns: buildSectionState('not_supported', 'CVE 查询不提供 Passive DNS。'),
        url_list: buildSectionState('not_supported', 'CVE 查询不提供关联 URL。'),
        malware: buildSectionState('not_supported', 'CVE 查询不提供恶意样本列表。'),
      },
    };
  }

  throw new Error(`Unsupported OTX search type: ${type}`);
}

async function buildStructuredOtxResultV2(type, query) {
  if (type === 'ip') {
    const ipVersion = query.includes(':') ? 'IPv6' : 'IPv4';
    const [generalPayload, reputationPayload, geoPayload, passiveDnsPayload, malwarePayload, urlListPayload, httpScansPayload] = await Promise.all([
      requestOtxSection(`/indicators/${ipVersion}/${query}/general`),
      requestOtxSection(`/indicators/${ipVersion}/${query}/reputation`),
      requestOtxSection(`/indicators/${ipVersion}/${query}/geo`),
      requestOtxSection(`/indicators/${ipVersion}/${query}/passive_dns`),
      requestOtxSection(`/indicators/${ipVersion}/${query}/malware`),
      requestOtxSection(`/indicators/${ipVersion}/${query}/url_list`),
      requestOtxSection(`/indicators/${ipVersion}/${query}/http_scans`),
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
        pulses: buildSectionState(pulses.length > 0 ? 'success' : 'no_data', pulses.length > 0 ? 'Linked pulses found.' : 'No linked pulses found.'),
        passive_dns: buildSectionState(passiveDns.length > 0 ? 'success' : 'no_data', passiveDns.length > 0 ? 'Passive DNS records available.' : 'No Passive DNS records found.'),
        url_list: buildSectionState(urlList.length > 0 ? 'success' : 'no_data', urlList.length > 0 ? 'Related URLs found.' : 'No related URLs found.'),
        malware: buildSectionState(malware.length > 0 ? 'success' : 'no_data', malware.length > 0 ? 'Malware samples available.' : 'No malware samples found.'),
        http_scans: buildSectionState(httpScans.length > 0 ? 'success' : 'no_data', httpScans.length > 0 ? 'HTTP scan records available.' : 'No HTTP scan records found.'),
      },
    };
  }

  if (type === 'domain') {
    const [generalPayload, geoPayload, passiveDnsPayload, whoisPayload, malwarePayload, urlListPayload, httpScansPayload] = await Promise.all([
      requestOtxSection(`/indicators/domain/${query}/general`),
      requestOtxSection(`/indicators/domain/${query}/geo`),
      requestOtxSection(`/indicators/domain/${query}/passive_dns`),
      requestOtxSection(`/indicators/domain/${query}/whois`),
      requestOtxSection(`/indicators/domain/${query}/malware`),
      requestOtxSection(`/indicators/domain/${query}/url_list`),
      requestOtxSection(`/indicators/domain/${query}/http_scans`),
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
        pulses: buildSectionState(pulses.length > 0 ? 'success' : 'no_data', pulses.length > 0 ? 'Linked pulses found.' : 'No linked pulses found.'),
        passive_dns: buildSectionState(passiveDns.length > 0 ? 'success' : 'no_data', passiveDns.length > 0 ? 'Passive DNS records available.' : 'No Passive DNS records found.'),
        url_list: buildSectionState(urlList.length > 0 ? 'success' : 'no_data', urlList.length > 0 ? 'Related URLs found.' : 'No related URLs found.'),
        malware: buildSectionState(malware.length > 0 ? 'success' : 'no_data', malware.length > 0 ? 'Malware samples available.' : 'No malware samples found.'),
        http_scans: buildSectionState(httpScans.length > 0 ? 'success' : 'no_data', httpScans.length > 0 ? 'HTTP scan records available.' : 'No HTTP scan records found.'),
      },
    };
  }

  if (type === 'url') {
    const sanitizedQuery = query.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const encodedQuery = encodeURIComponent(sanitizedQuery);
    const [generalPayload, urlListPayload] = await Promise.all([
      requestOtxSection(`/indicators/url/${encodedQuery}/general`),
      requestOtxSection(`/indicators/url/${encodedQuery}/url_list`),
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
        pulses: buildSectionState(pulses.length > 0 ? 'success' : 'no_data', pulses.length > 0 ? 'Linked pulses found.' : 'No linked pulses found.'),
        passive_dns: buildSectionState('not_supported', 'Passive DNS is not available for URL lookups.'),
        url_list: buildSectionState(urlList.length > 0 ? 'success' : 'no_data', urlList.length > 0 ? 'Related URLs found.' : 'No related URLs found.'),
        malware: buildSectionState('not_supported', 'Malware samples are not returned for URL lookups.'),
        http_scans: buildSectionState('not_supported', 'HTTP scans are not returned for URL lookups.'),
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
      http_scans: [],
      derived: {
        dns_resolutions: 0,
        top_level_domains: [],
        tags: getUnifiedTags(pulses),
        http_scan_count: 0,
      },
      section_states: {
        pulses: buildSectionState(pulses.length > 0 ? 'success' : 'no_data', pulses.length > 0 ? 'Linked pulses found.' : 'No linked pulses found.'),
        passive_dns: buildSectionState('not_supported', 'Passive DNS is not available for CVE lookups.'),
        url_list: buildSectionState('not_supported', 'Related URLs are not available for CVE lookups.'),
        malware: buildSectionState('not_supported', 'Malware samples are not returned for CVE lookups.'),
        http_scans: buildSectionState('not_supported', 'HTTP scans are not returned for CVE lookups.'),
      },
    };
  }

  throw new Error(`Unsupported OTX search type: ${type}`);
}

console.log('🔍 环境变量检查：');
console.log('   LEAKRADAR_API_KEY:', LEAKRADAR_API_KEY ? '已找到' : '未找到');
console.log('   WHITELISTED_USERS:', WHITELISTED_USERS.length > 0 ? `已找到 ${WHITELISTED_USERS.length} 个用户` : '未找到');
console.log('   OTX_API_KEY:', OTX_API_KEY ? '已找到' : '未找到');
console.log('   TRENDRADAR_API_URL:', TRENDRADAR_API_URL ? '已找到' : '未配置 (舆情分析功能将不可用)');

if (!LEAKRADAR_API_KEY) {
  console.error('❌ 错误：LEAKRADAR_API_KEY 或 VITE_LEAKRADAR_API_KEY 未在环境变量中设置');
  process.exit(1);
}

// 如果白名单为空，添加示例用户
if (WHITELISTED_USERS.length === 0) {
  console.warn('⚠️  警告：WHITELISTED_USERS 未设置，添加示例用户到白名单');
  WHITELISTED_USERS.push('konaa2651@gmail.com');
  console.log('   示例用户已添加：konaa2651@gmail.com');
}

// 开发环境默认密码提示
console.log('📝 开发环境默认密码：');
for (const email of WHITELISTED_USERS) {
  console.log(`   ${email}: ${USER_PASSWORDS[email] || 'password123'}`);
}

// 创建HTTP服务器
const server = http.createServer((req, res) => {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-API-Key'
  );

  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = req.url;
  
  console.log(`[Dev Server] ${req.method} ${url}`);
  
  // 健康检查
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      message: 'Development server is running',
      whitelist: {
        count: WHITELISTED_USERS.length,
        users: WHITELISTED_USERS
      }
    }));
    return;
  }
  
  // 处理白名单API请求
  if (url === '/api/auth/whitelist') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        whitelist: WHITELISTED_USERS,
        count: WHITELISTED_USERS.length,
        lastUpdated: new Date().toISOString()
      }));
      return;
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Method Not Allowed',
        message: 'Only GET requests are allowed for this endpoint'
      }));
      return;
    }
  }
  
  // 处理登录API请求 - 密码验证登录
  if (url === '/api/auth/login') {
    if (req.method === 'POST') {
      // 读取请求体
      getRequestBody(req).then(body => {
        try {
          const { email, password } = JSON.parse(body);
          
          // 白名单验证
          if (!WHITELISTED_USERS.includes(email)) {
            console.log(`[Whitelist] User ${email} denied access (not in whitelist)`);
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'Forbidden',
              message: '您的邮箱不在白名单中，无法登录'
            }));
            return;
          }
          
          // 密码验证
          const expectedPassword = USER_PASSWORDS[email] || 'password123';
          if (password !== expectedPassword) {
            console.log(`[Login] User ${email} failed password validation`);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'Unauthorized',
              message: '密码错误，请重新输入'
            }));
            return;
          }
          
          console.log(`[Login] User ${email} authenticated successfully`);
          
          // 返回登录成功响应
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: '登录成功',
            user: {
              email: email,
              name: email.split('@')[0],
              role: 'user'
            }
          }));
          return;
        } catch (error) {
          console.error('[Dev Server Error] Invalid JSON:', error.message);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Bad Request',
            message: '无效的请求体格式'
          }));
        }
      }).catch(error => {
        console.error('[Dev Server Error] Reading request body:', error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Internal Server Error',
          message: '读取请求体失败'
        }));
      });
      return;
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Method Not Allowed',
        message: 'Only POST requests are allowed for this endpoint'
      }));
      return;
    }
  }
  
  // 登录链接验证API已移除，使用密码验证方式
  
  // 只处理/api请求
  if (url === '/api/code-leak/search') {
    if (req.method === 'POST') {
      handleCodeLeakSearch(req, res);
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Method Not Allowed',
      message: 'Only POST requests are allowed for this endpoint'
    }));
    return;
  }

  if (!url.startsWith('/api')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Not Found',
      message: 'The requested resource was not found'
    }));
    return;
  }
  
  // 处理其他API请求
  handleApiRequest(req, res);
});

// 处理API请求
async function handleApiRequest(req, res) {
  try {
    const url = req.url;

    if (url.startsWith('/api/otx/search')) {
      const requestUrl = new URL(url, 'http://localhost');
      const type = String(requestUrl.searchParams.get('type') || '').trim().toLowerCase();
      const query = String(requestUrl.searchParams.get('query') || '').trim();

      if (!query || !['ip', 'domain', 'url', 'cve'].includes(type)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Invalid Request',
          message: 'type and query are required'
        }));
        return;
      }

      const cachedResult = getCachedOtxSearch(type, query);
      if (cachedResult) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          source: 'intel',
          cached: true,
          data: cachedResult
        }));
        return;
      }

      const structuredResult = await buildStructuredOtxResultV2(type, query);
      setCachedOtxSearch(type, query, structuredResult);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        source: 'intel',
        cached: false,
        data: structuredResult
      }));
      return;
    }
    
    // 构建目标URL
    let upstreamUrl;
    let targetUrl;
    let headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    
    // 处理OTX API请求
    if (url.startsWith('/api/otx')) {
      upstreamUrl = 'https://otx.alienvault.com/api/v1';
      targetUrl = `${upstreamUrl}${url.replace(/^\/api\/otx/, '')}`;
      headers['X-OTX-API-KEY'] = OTX_API_KEY;
      
      // 添加额外的OTX API所需的头部
      headers['Accept'] = 'application/json';
      headers['User-Agent'] = 'Lysir-Security-Platform/1.0';
      
      if (!OTX_API_KEY) {
        console.error('[Dev Server] OTX API Key is missing!');
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Authentication Error',
          message: 'OTX API Key未配置',
          details: '请在.env文件中设置VITE_OTX_API_KEY'
        }));
        return;
      }
    } else if (url.startsWith('/api/opinion')) {
      // 处理 TrendRadar API 请求 (舆情分析)
      if (!TRENDRADAR_API_URL) {
        throw new Error('TrendRadar API URL not configured');
      }
      
      // 移除 /api/opinion 前缀，保留后续路径
      upstreamUrl = TRENDRADAR_API_URL.replace(/\/$/, '');
      targetUrl = `${upstreamUrl}${url.replace(/^\/api\/opinion/, '')}`;
      
      // TrendRadar 可能需要的鉴权头
      // headers['Authorization'] = `Bearer ${process.env.TRENDRADAR_API_KEY}`;
    } else {
      // 处理LeakRadar API请求
      upstreamUrl = 'https://api.leakradar.io';
      let leakradarTargetUrl = `${upstreamUrl}${url.replace(/^\/api/, '')}`;
      
      // 演示模式：强制限制每次查询最多10条结果
      // 将targetUrl转换为URL对象，方便操作查询参数
      const urlObj = new URL(leakradarTargetUrl);
      
      // 对于非URL和非子域名的请求，限制page_size为10
      // 对于URL和子域名请求，不修改page_size，确保获取正确的计数
      if (!url.includes('/urls') && !url.includes('/subdomains')) {
        urlObj.searchParams.set('page_size', '10');
      }
      
      // 如果是解锁请求，添加限制参数
      // 根据API文档，解锁操作应该使用max参数，而不是limit参数
      if (leakradarTargetUrl.includes('/unlock')) {
        urlObj.searchParams.set('max', '10');
      }
      // 转换回字符串
      targetUrl = urlObj.toString();
      
      // 智能判断 Key 类型并设置头部
      // 强制使用 Bearer Token 方式，因为用户确认 Key 是有效的 JWT
      headers['Authorization'] = `Bearer ${LEAKRADAR_API_KEY}`;
      // 移除 X-API-Key，避免干扰
      delete headers['X-API-Key'];
    }
    
    console.log(`[Dev Server] -> ${targetUrl}`);
    
    // 获取请求数据
    const body = await getRequestBody(req);
    
    // 发送请求到上游API
    const options = {
      method: req.method,
      headers: headers,
      timeout: 10000,
    };
    
    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }
    
    console.log(`[Dev Server] Request URL: ${targetUrl}`);
    console.log(`[Dev Server] Request Method: ${req.method}`);
    console.log(`[Dev Server] Request Headers:`, JSON.stringify(headers, null, 2));
    if (body) {
      console.log(`[Dev Server] Request Body:`, body);
    }
    
    const protocol = upstreamUrl.startsWith('https') ? https : http;
    
    const upstreamReq = protocol.request(targetUrl, options, (upstreamRes) => {
      console.log(`[Dev Server] <- ${upstreamRes.statusCode} ${targetUrl}`);
      console.log(`[Dev Server] Upstream Headers:`, JSON.stringify(upstreamRes.headers, null, 2));
      
      // 检查空响应或错误状态码
      if (!upstreamRes.statusCode || upstreamRes.statusCode === 0) {
        console.error('[Dev Server Error] Empty response from upstream');
        if (!res.writableEnded && !res.destroyed) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Bad Gateway',
            message: '上游服务器返回空响应',
            details: 'OTX API可能暂时不可用或请求格式不正确',
            targetUrl: targetUrl
          }));
        }
        return;
      }
      
      // 设置响应头
      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        res.setHeader(key, value);
      }
      
      // 设置CORS头
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      // 设置响应状态码
      res.writeHead(upstreamRes.statusCode || 200);
      
      // 收集响应数据以便调试
      let upstreamBody = '';
      upstreamRes.on('data', (chunk) => {
        upstreamBody += chunk;
        // 安全地写入响应
        if (!res.writableEnded && !res.destroyed) {
          try {
            res.write(chunk);
          } catch (writeError) {
            console.error('[Dev Server Error] Error writing to response:', writeError.message);
          }
        }
      });
      
      upstreamRes.on('end', () => {
        console.log(`[Dev Server] Upstream Response Body:`, upstreamBody.substring(0, 500) + (upstreamBody.length > 500 ? '...' : ''));
        if (!res.writableEnded && !res.destroyed) {
          res.end();
        }
      });

      upstreamRes.on('error', (err) => {
        console.error('[Dev Server Error] Upstream response error:', err.message);
        if (!res.writableEnded && !res.destroyed) {
          res.end();
        }
      });
    });
    
    upstreamReq.on('error', (error) => {
      console.error(`[Dev Server Error] ${req.method} ${url}:`, error.message);
      console.error(`[Dev Server Error] Stack:`, error.stack);
      console.error(`[Dev Server Error] Target URL:`, targetUrl);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Proxy Error',
        message: '无法连接到上游服务器',
        details: error.message,
        targetUrl: targetUrl
      }));
    });
    
    upstreamReq.end(body);
    
  } catch (error) {
    console.error(`[Dev Server Error] ${req.method} ${req.url}:`, error.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Proxy Error',
      message: '无法处理API请求',
      details: error.message
    }));
  }
}

// 获取请求体
async function handleCodeLeakSearch(req, res) {
  try {
    const rawBody = await getRequestBody(req);
    const parsed = rawBody ? JSON.parse(rawBody) : {};
    const assets = Array.isArray(parsed.assets) ? parsed.assets : [];
    const query = typeof parsed.query === 'string' ? parsed.query.trim() : '';

    const terms = Array.from(new Set([
      ...(query ? [query] : []),
      ...assets
        .filter((asset) => asset && asset.enabled !== false && typeof asset.value === 'string')
        .map((asset) => asset.value.trim())
        .filter(Boolean),
    ])).slice(0, 6);

    if (terms.length === 0) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, findings: [], sources: ['GitHub', 'Gitee'] }));
      return;
    }

    const [githubRepoFindings, githubCodeFindings, giteeRepoFindings] = await Promise.all([
      searchGitHubRepositories(terms),
      searchGitHubCode(terms),
      searchGiteeRepositories(terms),
    ]);

    const findings = dedupeCodeLeakFindings([
      ...githubRepoFindings,
      ...githubCodeFindings,
      ...giteeRepoFindings,
    ]);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      findings,
      meta: {
        usedTerms: terms,
        githubCodeEnabled: Boolean(GITHUB_TOKEN),
      },
    }));
  } catch (error) {
    console.error('[Dev Server] Code leak search failed:', error.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Code leak search failed',
      details: error.message,
    }));
  }
}

async function searchGitHubRepositories(terms) {
  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'Lysir-Security-Platform/1.0',
  };

  if (GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
    headers['X-GitHub-Api-Version'] = '2022-11-28';
  }

  const findings = [];

  for (const term of terms) {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(term)}&sort=updated&order=desc&per_page=3`;
    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.warn(`[Dev Server] GitHub repository search failed for term "${term}": ${response.status}`);
      continue;
    }

    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    for (const item of items) {
      findings.push({
        id: `github-repo-${item.id}-${term}`,
        assetLabel: term,
        severity: classifySeverity(term, item.description || ''),
        status: 'new',
        source: 'GitHub',
        exposure: classifyExposure(term, `${item.name} ${item.description || ''}`),
        title: `公开仓库命中关键词 “${term}”`,
        repository: item.name || 'unknown-repository',
        owner: item.owner?.login || 'unknown-owner',
        path: 'Repository metadata',
        branch: item.default_branch || 'main',
        match: term,
        snippet: item.description || item.full_name || 'No repository description available.',
        firstSeen: item.created_at || new Date().toISOString(),
        lastSeen: item.updated_at || item.pushed_at || new Date().toISOString(),
        url: item.html_url,
        confidence: 0.58,
        notes: [
          '公开仓库元数据命中监控对象',
          '建议继续查看 README、配置文件与提交历史',
        ],
      });
    }
  }

  return findings;
}

async function searchGitHubCode(terms) {
  if (!GITHUB_TOKEN) {
    return [];
  }

  const headers = {
    'Accept': 'application/vnd.github.text-match+json',
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'User-Agent': 'Lysir-Security-Platform/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const findings = [];

  for (const term of terms) {
    const url = `https://api.github.com/search/code?q=${encodeURIComponent(`${term} in:file`)}&per_page=3`;
    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.warn(`[Dev Server] GitHub code search failed for term "${term}": ${response.status}`);
      continue;
    }

    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    for (const item of items) {
      const textMatch = Array.isArray(item.text_matches) && item.text_matches.length > 0
        ? item.text_matches[0].fragment
        : `${item.repository?.full_name || ''} ${item.path || ''}`.trim();

      findings.push({
        id: `github-code-${item.sha || item.url}-${term}`,
        assetLabel: term,
        severity: classifySeverity(term, textMatch),
        status: 'new',
        source: 'GitHub',
        exposure: classifyExposure(term, `${item.path || ''} ${textMatch}`),
        title: `代码搜索命中 “${term}”`,
        repository: item.repository?.name || 'unknown-repository',
        owner: item.repository?.owner?.login || 'unknown-owner',
        path: item.path || 'Unknown path',
        branch: item.repository?.default_branch || 'main',
        match: term,
        snippet: textMatch || 'No text match fragment returned.',
        firstSeen: item.repository?.created_at || new Date().toISOString(),
        lastSeen: item.repository?.updated_at || new Date().toISOString(),
        url: item.html_url || item.repository?.html_url,
        confidence: 0.84,
        notes: [
          'GitHub code search returned a direct file-level match',
          '建议优先核对片段是否包含真实凭据或内部配置',
        ],
      });
    }
  }

  return findings;
}

async function searchGiteeRepositories(terms) {
  const findings = [];

  for (const term of terms) {
    const params = new URLSearchParams({
      q: term,
      page: '1',
      per_page: '3',
    });

    if (GITEE_ACCESS_TOKEN) {
      params.set('access_token', GITEE_ACCESS_TOKEN);
    }

    const url = `https://gitee.com/api/v5/search/repositories?${params.toString()}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Lysir-Security-Platform/1.0',
      },
    });

    if (!response.ok) {
      console.warn(`[Dev Server] Gitee repository search failed for term "${term}": ${response.status}`);
      continue;
    }

    const data = await response.json();
    const items = Array.isArray(data) ? data : [];
    for (const item of items) {
      findings.push({
        id: `gitee-repo-${item.id}-${term}`,
        assetLabel: term,
        severity: classifySeverity(term, item.description || ''),
        status: 'new',
        source: 'Gitee',
        exposure: classifyExposure(term, `${item.full_name || ''} ${item.description || ''}`),
        title: `公开 Gitee 仓库命中关键词 “${term}”`,
        repository: item.name || 'unknown-repository',
        owner: item.namespace?.name || item.owner?.login || 'unknown-owner',
        path: 'Repository metadata',
        branch: item.default_branch || 'master',
        match: term,
        snippet: item.description || item.full_name || 'No repository description available.',
        firstSeen: item.created_at || new Date().toISOString(),
        lastSeen: item.updated_at || item.pushed_at || new Date().toISOString(),
        url: item.html_url,
        confidence: 0.54,
        notes: [
          'Gitee 公开仓库元数据命中监控对象',
          '建议继续检查 README、配置目录和 Issues 讨论内容',
        ],
      });
    }
  }

  return findings;
}

function classifySeverity(term, text) {
  const haystack = `${term} ${text}`.toLowerCase();
  if (/(api[_-]?key|secret|token|password|passwd|postgres:\/\/|mysql:\/\/|private[_-]?key|access[_-]?key)/.test(haystack)) {
    return 'critical';
  }
  if (/(prod|production|internal|admin|credential|db_|jdbc|redis|akia|ghp_)/.test(haystack)) {
    return 'high';
  }
  if (/(config|env|tenant|repo|mirror|backup)/.test(haystack)) {
    return 'medium';
  }
  return 'low';
}

function classifyExposure(term, text) {
  const haystack = `${term} ${text}`.toLowerCase();
  if (/(api[_-]?key|secret|token|private[_-]?key|access[_-]?key)/.test(haystack)) return 'secret';
  if (/(password|credential|jdbc|postgres:\/\/|mysql:\/\/|redis)/.test(haystack)) return 'credential';
  if (/(env|config|tfvars|yaml|yml|ini|properties)/.test(haystack)) return 'config';
  if (/(mirror|repo|repository|backup|fork)/.test(haystack)) return 'repository';
  return 'source';
}

function dedupeCodeLeakFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.source}:${finding.url}:${finding.match}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    
    req.on('data', (chunk) => {
      body += chunk;
    });
    
    req.on('end', () => {
      resolve(body);
    });
    
    req.on('error', (error) => {
      reject(error);
    });
  });
}

// 启动服务器
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 开发服务器已启动，监听端口 ${PORT}`);
  console.log(`📡 健康检查: http://localhost:${PORT}/health`);
  console.log(`🔑 LeakRadar API Key: ${LEAKRADAR_API_KEY ? '已配置' : '未配置'}`);
  console.log(`📋 白名单用户数量: ${WHITELISTED_USERS.length}`);
  console.log(`🔑 OTX API Key: ${OTX_API_KEY ? '已配置' : '未配置'}`);
  console.log(`✨ 服务已准备就绪，等待前端请求...`);
  console.log(`📝 白名单用户: ${WHITELISTED_USERS.join(', ')}`);
});
