import http from 'http';
import https from 'https';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import { promises as fs } from 'fs';
import path from 'path';
import { neon } from '@neondatabase/serverless';
import fileLeakAssetsHandler from './api/file-leak/assets.js';
import cveIntelAssetsHandler from './api/cve-intel/assets.js';
import fileLeakSearchHandler from './api/file-leak/search.js';
import webhookConfigHandler from './api/notifications/webhook.js';
import scheduledScanTasksHandler from './api/scheduled-scans/tasks.js';
import { buildLatestCveIntelFeed, enrichWithNvd } from './api/_lib/intel.js';

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
const OTX_INTERNAL_UPSTREAM_URL = 'https://otx.alienvault.com/otxapi';
const OTX_SEARCH_CACHE_TTL = 10 * 60 * 1000;
const SECTION_TIMEOUT_MS = 5000;
const SLOW_SECTION_TIMEOUT_MS = 2500;
const otxSearchCache = new Map();

// 白名单用户密码配置（开发环境使用）
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN || '';
const GITEE_ACCESS_TOKEN = process.env.GITEE_ACCESS_TOKEN || process.env.VITE_GITEE_ACCESS_TOKEN || '';
const CODE_LEAK_ASSETS_FILE = path.join(process.cwd(), '.data', 'code-leak-assets.json');
const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '';
const neonSql = DATABASE_URL ? neon(DATABASE_URL) : null;

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

const getCollectionCount = (payload, key, fallback = 0) => {
  const count = pickFirstValue(
    getValueAtPath(payload, 'count'),
    getValueAtPath(payload, 'full_size'),
    getValueAtPath(payload, 'actual_size'),
    getValueAtPath(payload, `data.count`),
    getValueAtPath(payload, `result.count`)
  );

  if (typeof count === 'number' && !Number.isNaN(count)) {
    return count;
  }

  const collection = getCollection(payload, key);
  return Array.isArray(collection) ? collection.length : fallback;
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

async function requestOtxSection(endpoint, options = {}) {
  const { internal = false, graceful = false, timeoutMs = SECTION_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${internal ? OTX_INTERNAL_UPSTREAM_URL : OTX_UPSTREAM_URL}${endpoint}`, {
      headers: {
        ...(internal ? {} : { 'X-OTX-API-KEY': OTX_API_KEY }),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Lysir-Security-Platform/1.0',
      },
      signal: controller.signal,
    });

    if (response.status === 404) {
      return {};
    }

    if (!response.ok) {
      if (graceful) {
        return { __section_error: 'upstream_error', __status: response.status };
      }
      throw new Error(`OTX request failed: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    if (graceful) {
      if (error?.name === 'AbortError') {
        return { __section_error: 'timeout' };
      }
      return { __section_error: 'upstream_error' };
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function requestOtxCandidates(candidates, options = {}) {
  const normalizedCandidates = Array.isArray(candidates) ? candidates : [candidates];
  let lastError = null;
  for (let index = 0; index < normalizedCandidates.length; index += 1) {
    const candidate = normalizedCandidates[index];
    try {
      const result = await requestOtxSection(candidate.endpoint, { ...options, internal: candidate.internal });
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
  if (options.graceful) {
    return { __section_error: 'upstream_error' };
  }
  throw lastError || new Error('OTX candidate request failed');
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
        passive_dns: buildSectionState(passiveDns.length > 0 ? 'success' : 'no_data', passiveDns.length > 0 ? '已返回被动 DNS 记录。' : '当前对象没有被动 DNS 记录。'),
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
        passive_dns: buildSectionState('not_supported', 'URL 查询当前不提供被动 DNS 记录。'),
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
        passive_dns: buildSectionState('not_supported', 'CVE 查询不提供被动 DNS 记录。'),
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
      requestOtxCandidates([{ endpoint: `/indicators/ip/general/${query}`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/general`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/${ipVersion}/reputation/${query}`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/reputation`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/${ipVersion}/geo/${query}`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/geo`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/${ipVersion}/passive_dns/${query}`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/passive_dns`, internal: false }], { graceful: true, timeoutMs: SLOW_SECTION_TIMEOUT_MS }),
      requestOtxCandidates([{ endpoint: `/indicators/${ipVersion}/malware/${query}?limit=10&page=1`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/malware`, internal: false }], { graceful: true, timeoutMs: SLOW_SECTION_TIMEOUT_MS }),
      requestOtxCandidates([{ endpoint: `/indicators/${ipVersion}/url_list/${query}`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/url_list`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/${ipVersion}/http_scans/${query}`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/http_scans`, internal: false }], { graceful: true, timeoutMs: SLOW_SECTION_TIMEOUT_MS }),
    ]);
    const general = unwrapPayload(generalPayload);
    const reputation = unwrapPayload(reputationPayload);
    const geo = unwrapPayload(geoPayload);
    const pulses = Array.isArray(general?.pulse_info?.pulses) ? general.pulse_info.pulses : [];
    const passiveDns = getCollection(passiveDnsPayload, 'passive_dns');
    const malware = getCollection(malwarePayload, 'malware');
    const urlList = getCollection(urlListPayload, 'url_list');
    const httpScans = getHttpScans(httpScansPayload);
    const passiveDnsCount = getCollectionCount(passiveDnsPayload, 'passive_dns', passiveDns.length);
    const malwareCount = getCollectionCount(malwarePayload, 'malware', malware.length);
    const urlCount = getCollectionCount(urlListPayload, 'url_list', urlList.length);
    const httpScanCount = getCollectionCount(httpScansPayload, 'http_scans', httpScans.length);

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
        dns_resolutions: passiveDnsCount,
        passive_dns_count: passiveDnsCount,
        malware_count: malwareCount,
        url_count: urlCount,
        top_level_domains: getTopLevelDomains(passiveDns),
        tags: getUnifiedTags(pulses),
        http_scan_count: httpScanCount,
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
      requestOtxCandidates([{ endpoint: `/indicators/domain/passive_dns/${query}`, internal: true }, { endpoint: `/indicators/domain/${query}/passive_dns`, internal: false }], { graceful: true, timeoutMs: SLOW_SECTION_TIMEOUT_MS }),
      requestOtxCandidates([{ endpoint: `/indicators/domain/whois/${query}`, internal: true }, { endpoint: `/indicators/domain/${query}/whois`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/domain/malware/${query}?limit=10&page=1`, internal: true }, { endpoint: `/indicators/domain/${query}/malware`, internal: false }], { graceful: true, timeoutMs: SLOW_SECTION_TIMEOUT_MS }),
      requestOtxCandidates([{ endpoint: `/indicators/domain/url_list/${query}`, internal: true }, { endpoint: `/indicators/domain/${query}/url_list`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/domain/http_scans/${query}`, internal: true }, { endpoint: `/indicators/domain/${query}/http_scans`, internal: false }], { graceful: true, timeoutMs: SLOW_SECTION_TIMEOUT_MS }),
    ]);
    const general = unwrapPayload(generalPayload);
    const geo = unwrapPayload(geoPayload);
    const pulses = Array.isArray(general?.pulse_info?.pulses) ? general.pulse_info.pulses : [];
    const passiveDns = getCollection(passiveDnsPayload, 'passive_dns');
    const malware = getCollection(malwarePayload, 'malware');
    const urlList = getCollection(urlListPayload, 'url_list');
    const httpScans = getHttpScans(httpScansPayload);
    const indicator = pickFirstPath(general, ['indicator', 'domain', 'hostname'], query);
    const passiveDnsCount = getCollectionCount(passiveDnsPayload, 'passive_dns', passiveDns.length);
    const malwareCount = getCollectionCount(malwarePayload, 'malware', malware.length);
    const urlCount = getCollectionCount(urlListPayload, 'url_list', urlList.length);
    const httpScanCount = getCollectionCount(httpScansPayload, 'http_scans', httpScans.length);

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
        dns_resolutions: passiveDnsCount,
        passive_dns_count: passiveDnsCount,
        malware_count: malwareCount,
        url_count: urlCount,
        top_level_domains: getTopLevelDomains(passiveDns, [indicator]),
        tags: getUnifiedTags(pulses),
        http_scan_count: httpScanCount,
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
    const urlCount = getCollectionCount(urlListPayload, 'url_list', urlList.length);

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
        passive_dns_count: 0,
        malware_count: 0,
        url_count: urlCount,
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
        passive_dns_count: 0,
        malware_count: 0,
        url_count: 0,
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
    if (new URL(req.url, 'http://localhost').pathname.startsWith('/api/code-leak/assets')) {
      handleCodeLeakAssets(req, res);
      return;
    }

    if (new URL(req.url, 'http://localhost').pathname.startsWith('/api/file-leak/assets')) {
      const pathParts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
      req.query = pathParts.length >= 4 ? { id: decodeURIComponent(pathParts[3]) } : {};
      fileLeakAssetsHandler(req, res);
      return;
    }

    if (new URL(req.url, 'http://localhost').pathname.startsWith('/api/cve-intel/assets')) {
      const pathParts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
      req.query = pathParts.length >= 4 ? { id: decodeURIComponent(pathParts[3]) } : {};
      cveIntelAssetsHandler(req, res);
      return;
    }

    if (new URL(req.url, 'http://localhost').pathname.startsWith('/api/scheduled-scans/tasks')) {
      const pathParts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
      req.query = pathParts.length >= 4 ? { id: decodeURIComponent(pathParts[3]) } : {};
      scheduledScanTasksHandler(req, res);
      return;
    }

    if (new URL(req.url, 'http://localhost').pathname === '/api/notifications/webhook') {
      webhookConfigHandler(req, res);
      return;
    }

    if (new URL(req.url, 'http://localhost').pathname === '/api/code-leak/search') {
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

  if (!new URL(req.url, 'http://localhost').pathname.startsWith('/api')) {
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

    if (new URL(url, 'http://localhost').pathname.startsWith('/api/otx/search')) {
      const requestUrl = new URL(url, 'http://localhost');
      const type = String(requestUrl.searchParams.get('type') || '').trim().toLowerCase();
      const query = String(requestUrl.searchParams.get('query') || '').trim();
      const noCache = String(requestUrl.searchParams.get('noCache') || '').trim().toLowerCase() === '1';

      if (!query || !['ip', 'domain', 'url', 'cve'].includes(type)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Invalid Request',
          message: 'type and query are required'
        }));
        return;
      }

      const cachedResult = noCache ? null : getCachedOtxSearch(type, query);
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
        noCache,
        data: structuredResult
      }));
      return;
    }

    if (new URL(url, 'http://localhost').pathname.startsWith('/api/otx/cve-feed')) {
      const requestUrl = new URL(url, 'http://localhost');
      const limit = Number(requestUrl.searchParams.get('limit') || 12);
      const window = String(requestUrl.searchParams.get('window') || '7d');
      const noCache = String(requestUrl.searchParams.get('noCache') || '').trim().toLowerCase() === '1';

      const data = await buildLatestCveIntelFeed({
        limit,
        window,
        noCache,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        ...data,
      }));
      return;
    }

    if (new URL(url, 'http://localhost').pathname === '/api/file-leak/search') {
      if (req.method === 'POST') {
        fileLeakSearchHandler(req, res);
        return;
      }

      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Method Not Allowed',
        message: 'Only POST requests are allowed for this endpoint'
      }));
      return;
    }

    if (new URL(url, 'http://localhost').pathname === '/api/notifications/webhook') {
      webhookConfigHandler(req, res);
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
async function ensureCodeLeakAssetsStore() {
  await fs.mkdir(path.dirname(CODE_LEAK_ASSETS_FILE), { recursive: true });
  try {
    await fs.access(CODE_LEAK_ASSETS_FILE);
  } catch {
    await fs.writeFile(CODE_LEAK_ASSETS_FILE, '{}', 'utf8');
  }
}

async function readCodeLeakAssetsStore() {
  await ensureCodeLeakAssetsStore();
  try {
    const raw = await fs.readFile(CODE_LEAK_ASSETS_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeCodeLeakAssetsStore(store) {
  await ensureCodeLeakAssetsStore();
  await fs.writeFile(CODE_LEAK_ASSETS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

let codeLeakAssetsTableReady = false;

async function ensureCodeLeakAssetsTable() {
  if (!neonSql || codeLeakAssetsTableReady) return;

  await neonSql`
    CREATE TABLE IF NOT EXISTS code_leak_assets (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      label TEXT NOT NULL,
      value TEXT NOT NULL,
      type TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await neonSql`
    CREATE UNIQUE INDEX IF NOT EXISTS code_leak_assets_user_value_idx
    ON code_leak_assets (user_email, value)
  `;

  codeLeakAssetsTableReady = true;
}

async function readCodeLeakAssetsByUser(email) {
  if (neonSql) {
    await ensureCodeLeakAssetsTable();
    const rows = await neonSql`
      SELECT id, label, value, type, enabled
      FROM code_leak_assets
      WHERE user_email = ${email}
      ORDER BY created_at ASC
    `;
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      value: row.value,
      type: row.type,
      enabled: Boolean(row.enabled),
    }));
  }

  const store = await readCodeLeakAssetsStore();
  return Array.isArray(store[email]) ? store[email] : [];
}

async function writeCodeLeakAssetForUser(email, asset) {
  if (neonSql) {
    await ensureCodeLeakAssetsTable();
    await neonSql`
      INSERT INTO code_leak_assets (id, user_email, label, value, type, enabled)
      VALUES (${asset.id}, ${email}, ${asset.label}, ${asset.value}, ${asset.type}, ${asset.enabled})
      ON CONFLICT (id) DO UPDATE SET
        label = EXCLUDED.label,
        value = EXCLUDED.value,
        type = EXCLUDED.type,
        enabled = EXCLUDED.enabled,
        updated_at = NOW()
    `;
    return readCodeLeakAssetsByUser(email);
  }

  const store = await readCodeLeakAssetsStore();
  const currentAssets = Array.isArray(store[email]) ? store[email] : [];
  store[email] = [...currentAssets, asset];
  await writeCodeLeakAssetsStore(store);
  return store[email];
}

async function deleteCodeLeakAssetForUser(email, assetId) {
  if (neonSql) {
    await ensureCodeLeakAssetsTable();
    await neonSql`
      DELETE FROM code_leak_assets
      WHERE user_email = ${email} AND id = ${assetId}
    `;
    return readCodeLeakAssetsByUser(email);
  }

  const store = await readCodeLeakAssetsStore();
  const currentAssets = Array.isArray(store[email]) ? store[email] : [];
  store[email] = currentAssets.filter((asset) => asset.id !== assetId);
  await writeCodeLeakAssetsStore(store);
  return store[email];
}

function getCodeLeakUserEmail(req, parsedBody = null) {
  const headerEmail = typeof req.headers['x-user-email'] === 'string' ? req.headers['x-user-email'].trim() : '';
  const bodyEmail = parsedBody && typeof parsedBody.userEmail === 'string' ? parsedBody.userEmail.trim() : '';
  return (headerEmail || bodyEmail).toLowerCase();
}

async function handleCodeLeakAssets(req, res) {
  try {
    const urlObject = new URL(req.url, 'http://localhost');
    const pathParts = urlObject.pathname.split('/').filter(Boolean);
    const rawBody = req.method === 'POST' ? await getRequestBody(req) : '';
    const parsedBody = rawBody ? JSON.parse(rawBody) : {};
    const email = getCodeLeakUserEmail(req, parsedBody);

    if (!email) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized', message: '缺少当前登录用户信息。' }));
      return;
    }

    const currentAssets = await readCodeLeakAssetsByUser(email);

    if (req.method === 'GET' && pathParts.length === 3) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, assets: currentAssets }));
      return;
    }

    if (req.method === 'POST' && pathParts.length === 3) {
      const value = typeof parsedBody.value === 'string' ? parsedBody.value.trim() : '';
      const label = typeof parsedBody.label === 'string' ? parsedBody.label.trim() : value;
      const type = typeof parsedBody.type === 'string' ? parsedBody.type : 'company';

      if (!value) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Request', message: '监测对象不能为空。' }));
        return;
      }

      const duplicated = currentAssets.some((asset) => String(asset.value || '').toLowerCase() === value.toLowerCase());
      const newAsset = {
        id: `asset-${Date.now()}`,
        label,
        value,
        type,
        enabled: true,
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        assets: duplicated
          ? currentAssets
          : await writeCodeLeakAssetForUser(email, newAsset),
      }));
      return;
    }

    if (req.method === 'DELETE' && pathParts.length === 4) {
      const assetId = decodeURIComponent(pathParts[3]);
      const nextAssets = await deleteCodeLeakAssetForUser(email, assetId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, assets: nextAssets }));
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed', message: 'Unsupported assets operation.' }));
  } catch (error) {
    console.error('[Dev Server] Code leak assets failed:', error.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal Server Error', message: '监测对象持久化失败。' }));
  }
}

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
