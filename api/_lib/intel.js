import { evaluateCodeLeak, evaluateFileLeak } from './leak-rules.js';

const OTX_UPSTREAM_URL = 'https://otx.alienvault.com/api/v1';
const OTX_INTERNAL_UPSTREAM_URL = 'https://otx.alienvault.com/otxapi';
const USE_OTX_INTERNAL_API = process.env.OTX_USE_INTERNAL_API === '1';

const otxSearchCache = globalThis.__otxSearchCache || new Map();
globalThis.__otxSearchCache = otxSearchCache;

const OTX_SEARCH_CACHE_TTL = 10 * 60 * 1000;

export const applyCors = (res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-API-Key, X-User-Email'
  );
};

export const sendJson = (res, status, data) => {
  res.setHeader('Content-Type', 'application/json');
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(data);
  }

  if (typeof res.writeHead === 'function' && typeof res.end === 'function') {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return res;
  }

  throw new Error('Unsupported response object');
};

export const readJsonBody = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body;

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

const getCacheKey = (type, query) => `${type}:${String(query).trim().toLowerCase()}`;

export const getCachedOtxSearch = (type, query) => {
  const cached = otxSearchCache.get(getCacheKey(type, query));
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    otxSearchCache.delete(getCacheKey(type, query));
    return null;
  }
  return cached.value;
};

export const setCachedOtxSearch = (type, query, value) => {
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

const SECTION_TIMEOUT_MS = 5000;
const SLOW_SECTION_TIMEOUT_MS = 2500;

const isSectionErrorPayload = (payload) =>
  Boolean(payload && typeof payload === 'object' && payload.__section_error);

const getSectionErrorType = (payload) =>
  isSectionErrorPayload(payload) ? payload.__section_error : null;

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
  const { graceful = false, timeoutMs = SECTION_TIMEOUT_MS, internal = false } = options;
  const apiKey = process.env.OTX_API_KEY || process.env.VITE_OTX_API_KEY;
  if (!apiKey) {
    throw new Error('OTX_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${internal ? OTX_INTERNAL_UPSTREAM_URL : OTX_UPSTREAM_URL}${endpoint}`, {
      headers: {
        ...(internal ? {} : { 'X-OTX-API-KEY': apiKey }),
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Lysir-Security-Platform/1.0',
      },
      signal: controller.signal,
    });

    if (response.status === 404) return {};
    if (!response.ok) {
      let errorDetail = '';
      try {
        const rawText = await response.text();
        if (rawText) {
          errorDetail = ` - ${rawText.slice(0, 240)}`;
        }
      } catch {
        errorDetail = '';
      }

      if (graceful) {
        return { __section_error: 'upstream_error', __status: response.status, __detail: errorDetail };
      }
      throw new Error(`OTX request failed: ${response.status}${errorDetail}`);
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
};

const requestOtxCandidates = async (candidates, options = {}) => {
  const normalizedCandidates = (Array.isArray(candidates) ? candidates : [candidates]).filter(
    (candidate) => USE_OTX_INTERNAL_API || !candidate.internal
  );
  let lastError = null;

  if (normalizedCandidates.length === 0) {
    if (options.graceful) {
      return { __section_error: 'upstream_error' };
    }

    throw new Error('No OTX candidates available for request');
  }

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
};

export const buildStructuredOtxResult = async (type, query) => {
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
    const passiveDns = isSectionErrorPayload(passiveDnsPayload) ? [] : getCollection(passiveDnsPayload, 'passive_dns');
    const malware = isSectionErrorPayload(malwarePayload) ? [] : getCollection(malwarePayload, 'malware');
    const urlList = getCollection(urlListPayload, 'url_list');
    const httpScans = isSectionErrorPayload(httpScansPayload) ? [] : getHttpScans(httpScansPayload);
    const passiveDnsCount = isSectionErrorPayload(passiveDnsPayload) ? 0 : getCollectionCount(passiveDnsPayload, 'passive_dns', passiveDns.length);
    const malwareCount = isSectionErrorPayload(malwarePayload) ? 0 : getCollectionCount(malwarePayload, 'malware', malware.length);
    const urlCount = getCollectionCount(urlListPayload, 'url_list', urlList.length);
    const httpScanCount = isSectionErrorPayload(httpScansPayload) ? 0 : getCollectionCount(httpScansPayload, 'http_scans', httpScans.length);

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
        passive_dns: buildSectionState(
          getSectionErrorType(passiveDnsPayload) === 'timeout' ? 'timeout' : passiveDnsCount > 0 ? 'success' : 'no_data',
          getSectionErrorType(passiveDnsPayload) === 'timeout'
            ? '被动 DNS 查询超时，情报源未在限定时间内返回数据。'
            : passiveDnsCount > 0
              ? '已获取被动 DNS 记录。'
              : '情报源未返回被动 DNS 记录。'
        ),
        url_list: buildSectionState(urlList.length > 0 ? 'success' : 'no_data', urlList.length > 0 ? '已找到关联 URL。' : '未找到关联 URL。'),
        malware: buildSectionState(
          getSectionErrorType(malwarePayload) === 'timeout' ? 'timeout' : malwareCount > 0 ? 'success' : 'no_data',
          getSectionErrorType(malwarePayload) === 'timeout'
            ? '恶意样本查询超时，情报源未在限定时间内返回数据。'
            : malwareCount > 0
              ? '已获取恶意样本记录。'
              : '情报源未返回恶意样本记录。'
        ),
        http_scans: buildSectionState(
          getSectionErrorType(httpScansPayload) === 'timeout' ? 'timeout' : httpScanCount > 0 ? 'success' : 'no_data',
          getSectionErrorType(httpScansPayload) === 'timeout'
            ? 'HTTP 扫描查询超时，情报源未在限定时间内返回数据。'
            : httpScanCount > 0
              ? '已获取 HTTP 扫描记录。'
              : '未找到 HTTP 扫描记录。'
        ),
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
    const passiveDns = isSectionErrorPayload(passiveDnsPayload) ? [] : getCollection(passiveDnsPayload, 'passive_dns');
    const malware = isSectionErrorPayload(malwarePayload) ? [] : getCollection(malwarePayload, 'malware');
    const urlList = getCollection(urlListPayload, 'url_list');
    const httpScans = isSectionErrorPayload(httpScansPayload) ? [] : getHttpScans(httpScansPayload);
    const indicator = pickFirstPath(general, ['indicator', 'domain', 'hostname'], query);
    const passiveDnsCount = isSectionErrorPayload(passiveDnsPayload) ? 0 : getCollectionCount(passiveDnsPayload, 'passive_dns', passiveDns.length);
    const malwareCount = isSectionErrorPayload(malwarePayload) ? 0 : getCollectionCount(malwarePayload, 'malware', malware.length);
    const urlCount = getCollectionCount(urlListPayload, 'url_list', urlList.length);
    const httpScanCount = isSectionErrorPayload(httpScansPayload) ? 0 : getCollectionCount(httpScansPayload, 'http_scans', httpScans.length);

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
        passive_dns: buildSectionState(
          getSectionErrorType(passiveDnsPayload) === 'timeout' ? 'timeout' : passiveDnsCount > 0 ? 'success' : 'no_data',
          getSectionErrorType(passiveDnsPayload) === 'timeout'
            ? '被动 DNS 查询超时，情报源未在限定时间内返回数据。'
            : passiveDnsCount > 0
              ? '已获取被动 DNS 记录。'
              : '情报源未返回被动 DNS 记录。'
        ),
        url_list: buildSectionState(urlList.length > 0 ? 'success' : 'no_data', urlList.length > 0 ? '已找到关联 URL。' : '未找到关联 URL。'),
        malware: buildSectionState(
          getSectionErrorType(malwarePayload) === 'timeout' ? 'timeout' : malwareCount > 0 ? 'success' : 'no_data',
          getSectionErrorType(malwarePayload) === 'timeout'
            ? '恶意样本查询超时，情报源未在限定时间内返回数据。'
            : malwareCount > 0
              ? '已获取恶意样本记录。'
              : '情报源未返回恶意样本记录。'
        ),
        http_scans: buildSectionState(
          getSectionErrorType(httpScansPayload) === 'timeout' ? 'timeout' : httpScanCount > 0 ? 'success' : 'no_data',
          getSectionErrorType(httpScansPayload) === 'timeout'
            ? 'HTTP 扫描查询超时，情报源未在限定时间内返回数据。'
            : httpScanCount > 0
              ? '已获取 HTTP 扫描记录。'
              : '未找到 HTTP 扫描记录。'
        ),
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
};

const dedupeCodeLeakFindings = (findings) => {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.source}:${finding.url}:${finding.match}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const searchGitHubRepositories = async (terms) => {
  const githubToken = process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN || '';
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Lysir-Security-Platform/1.0',
  };

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
    headers['X-GitHub-Api-Version'] = '2022-11-28';
  }

  const findings = [];
  for (const term of terms) {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(term)}&sort=updated&order=desc&per_page=3`;
    const response = await fetch(url, { headers });
    if (!response.ok) continue;
    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];

    for (const item of items) {
      const ruleResult = evaluateCodeLeak({
        term,
        text: item.description || item.full_name || '',
        path: item.name || '',
      });
      findings.push({
        id: `github-repo-${item.id}-${term}`,
        assetLabel: term,
        severity: ruleResult.severity,
        status: 'new',
        source: 'GitHub',
        exposure: ruleResult.exposure,
        title: `公开仓库命中关键词“${term}”`,
        repository: item.name || 'unknown-repository',
        owner: item.owner?.login || 'unknown-owner',
        path: 'Repository metadata',
        branch: item.default_branch || 'main',
        match: term,
        snippet: item.description || item.full_name || 'No repository description available.',
        firstSeen: item.created_at || new Date().toISOString(),
        lastSeen: item.updated_at || item.pushed_at || new Date().toISOString(),
        url: item.html_url,
        confidence: Math.min(0.95, 0.58 + ruleResult.confidenceBoost),
        matchedRules: ruleResult.matchedRules,
        notes: ['公开仓库元数据命中监控对象', '建议继续查看 README、配置文件与提交历史'],
      });
    }
  }

  return findings;
};

const searchGitHubCode = async (terms) => {
  const githubToken = process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN || '';
  if (!githubToken) return [];

  const headers = {
    Accept: 'application/vnd.github.text-match+json',
    Authorization: `Bearer ${githubToken}`,
    'User-Agent': 'Lysir-Security-Platform/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const findings = [];
  for (const term of terms) {
    const url = `https://api.github.com/search/code?q=${encodeURIComponent(`${term} in:file`)}&per_page=3`;
    const response = await fetch(url, { headers });
    if (!response.ok) continue;
    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];

    for (const item of items) {
      const textMatch = Array.isArray(item.text_matches) && item.text_matches.length > 0
        ? item.text_matches[0].fragment
        : `${item.repository?.full_name || ''} ${item.path || ''}`.trim();
      const ruleResult = evaluateCodeLeak({
        term,
        text: textMatch,
        path: item.path || '',
      });

      findings.push({
        id: `github-code-${item.sha || item.url}-${term}`,
        assetLabel: term,
        severity: ruleResult.severity,
        status: 'new',
        source: 'GitHub',
        exposure: ruleResult.exposure,
        title: `代码搜索命中“${term}”`,
        repository: item.repository?.name || 'unknown-repository',
        owner: item.repository?.owner?.login || 'unknown-owner',
        path: item.path || 'Unknown path',
        branch: item.repository?.default_branch || 'main',
        match: term,
        snippet: textMatch || 'No text match fragment returned.',
        firstSeen: item.repository?.created_at || new Date().toISOString(),
        lastSeen: item.repository?.updated_at || new Date().toISOString(),
        url: item.html_url || item.repository?.html_url,
        confidence: Math.min(0.98, 0.84 + ruleResult.confidenceBoost),
        matchedRules: ruleResult.matchedRules,
        notes: ['GitHub code search returned a direct file-level match', '建议优先核对片段是否包含真实凭据或内部配置'],
      });
    }
  }

  return findings;
};

const searchGiteeRepositories = async (terms) => {
  const giteeToken = process.env.GITEE_ACCESS_TOKEN || process.env.VITE_GITEE_ACCESS_TOKEN || '';
  const findings = [];

  for (const term of terms) {
    const params = new URLSearchParams({ q: term, page: '1', per_page: '3' });
    if (giteeToken) params.set('access_token', giteeToken);

    const response = await fetch(`https://gitee.com/api/v5/search/repositories?${params.toString()}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Lysir-Security-Platform/1.0' },
    });
    if (!response.ok) continue;

    const data = await response.json();
    const items = Array.isArray(data) ? data : [];
    for (const item of items) {
      const ruleResult = evaluateCodeLeak({
        term,
        text: item.description || item.full_name || '',
        path: item.name || '',
      });
      findings.push({
        id: `gitee-repo-${item.id}-${term}`,
        assetLabel: term,
        severity: ruleResult.severity,
        status: 'new',
        source: 'Gitee',
        exposure: ruleResult.exposure,
        title: `公开 Gitee 仓库命中关键词“${term}”`,
        repository: item.name || 'unknown-repository',
        owner: item.namespace?.name || item.owner?.login || 'unknown-owner',
        path: 'Repository metadata',
        branch: item.default_branch || 'master',
        match: term,
        snippet: item.description || item.full_name || 'No repository description available.',
        firstSeen: item.created_at || new Date().toISOString(),
        lastSeen: item.updated_at || item.pushed_at || new Date().toISOString(),
        url: item.html_url,
        confidence: Math.min(0.92, 0.54 + ruleResult.confidenceBoost),
        matchedRules: ruleResult.matchedRules,
        notes: ['Gitee 公开仓库元数据命中监控对象', '建议继续检查 README、配置目录和 Issues 讨论内容'],
      });
    }
  }

  return findings;
};

export const searchCodeLeaks = async (assets = [], query = '') => {
  const terms = Array.from(
    new Set([
      ...(query ? [query.trim()] : []),
      ...assets
        .filter((asset) => asset && asset.enabled !== false && typeof asset.value === 'string')
        .map((asset) => asset.value.trim())
        .filter(Boolean),
    ])
  ).slice(0, 6);

  if (terms.length === 0) {
    return {
      success: true,
      findings: [],
      meta: {
        usedTerms: [],
        githubCodeEnabled: Boolean(process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN || ''),
      },
    };
  }

  const [githubRepoFindings, githubCodeFindings, giteeRepoFindings] = await Promise.all([
    searchGitHubRepositories(terms),
    searchGitHubCode(terms),
    searchGiteeRepositories(terms),
  ]);

  return {
    success: true,
    findings: dedupeCodeLeakFindings([
      ...githubRepoFindings,
      ...githubCodeFindings,
      ...giteeRepoFindings,
    ]),
    meta: {
      usedTerms: terms,
      githubCodeEnabled: Boolean(process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN || ''),
    },
  };
};

const FILE_LEAK_TYPES = [
  { extension: 'pdf', kind: 'document', sensitivity: 'high' },
  { extension: 'docx', kind: 'document', sensitivity: 'high' },
  { extension: 'xlsx', kind: 'spreadsheet', sensitivity: 'critical' },
  { extension: 'csv', kind: 'dataset', sensitivity: 'high' },
  { extension: 'zip', kind: 'archive', sensitivity: 'critical' },
  { extension: 'sql', kind: 'database', sensitivity: 'critical' },
  { extension: 'bak', kind: 'backup', sensitivity: 'critical' },
];

const classifyFileLeakSeverity = (extension, path, snippet) => {
  const text = `${path} ${snippet}`.toLowerCase();
  if (extension === 'sql' || extension === 'bak' || extension === 'zip') return 'critical';
  if (text.includes('employee') || text.includes('credential') || text.includes('payroll')) return 'critical';
  if (extension === 'xlsx' || extension === 'csv') return 'high';
  if (text.includes('contract') || text.includes('invoice') || text.includes('confidential')) return 'high';
  return 'medium';
};

const deriveFileLeakNotes = (extension, item) => {
  const notes = [`Matched a public file candidate with extension .${extension}`];
  if (item.path) notes.push(`Detected path: ${item.path}`);
  if (item.repository?.full_name) notes.push(`Repository context: ${item.repository.full_name}`);
  return notes;
};

const dedupeFileLeakFindings = (findings) => {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.url}::${finding.path}::${finding.match}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const searchGitHubFiles = async (terms) => {
  const githubToken = process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN || '';
  if (!githubToken) return [];

  const headers = {
    Accept: 'application/vnd.github.text-match+json',
    Authorization: `Bearer ${githubToken}`,
    'User-Agent': 'Lysir-Security-Platform/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const findings = [];

  for (const term of terms) {
    for (const fileType of FILE_LEAK_TYPES) {
      const query = `${term} extension:${fileType.extension}`;
      const url = `https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=2`;
      const response = await fetch(url, { headers });
      if (!response.ok) continue;

      const data = await response.json();
      const items = Array.isArray(data.items) ? data.items : [];

      for (const item of items) {
        const textMatch = Array.isArray(item.text_matches) && item.text_matches.length > 0
          ? item.text_matches[0].fragment
          : `${item.repository?.full_name || ''} ${item.path || ''}`.trim();
        const ruleResult = evaluateFileLeak({
          term,
          text: textMatch,
          path: item.path || '',
          extension: fileType.extension,
        });

        findings.push({
          id: `github-file-${item.sha || item.url}-${term}-${fileType.extension}`,
          assetLabel: term,
          severity: ruleResult.severity,
          status: 'new',
          source: 'GitHub',
          exposure: fileType.kind,
          title: `${term} related public file candidate`,
          repository: item.repository?.name || 'unknown-repository',
          owner: item.repository?.owner?.login || 'unknown-owner',
          path: item.path || 'Unknown path',
          match: term,
          snippet: textMatch || 'No text match fragment returned.',
          url: item.html_url || item.repository?.html_url,
          fileType: fileType.extension.toUpperCase(),
          sensitivity: ruleResult.sensitivity,
          channel: 'public-repository',
          sourceSite: item.repository?.html_url || item.html_url || '',
          firstSeen: item.repository?.created_at || new Date().toISOString(),
          lastSeen: item.repository?.updated_at || new Date().toISOString(),
          confidence: Math.min(0.96, (fileType.extension === 'sql' || fileType.extension === 'bak' ? 0.88 : 0.76) + ruleResult.confidenceBoost),
          matchedRules: ruleResult.matchedRules,
          notes: [...deriveFileLeakNotes(fileType.extension, item), ...ruleResult.notes],
        });
      }
    }
  }

  return findings;
};

const searchGiteeFileRepositories = async (terms) => {
  const giteeToken = process.env.GITEE_ACCESS_TOKEN || process.env.VITE_GITEE_ACCESS_TOKEN || '';
  const findings = [];

  for (const term of terms) {
    for (const fileType of FILE_LEAK_TYPES.slice(0, 4)) {
      const params = new URLSearchParams({ q: `${term} ${fileType.extension}`, page: '1', per_page: '2' });
      if (giteeToken) params.set('access_token', giteeToken);

      const response = await fetch(`https://gitee.com/api/v5/search/repositories?${params.toString()}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'Lysir-Security-Platform/1.0' },
      });
      if (!response.ok) continue;

      const data = await response.json();
      const items = Array.isArray(data) ? data : [];

      for (const item of items) {
        const ruleResult = evaluateFileLeak({
          term,
          text: item.description || item.full_name || '',
          path: item.full_name || '',
          extension: fileType.extension,
        });
        findings.push({
          id: `gitee-file-${item.id}-${term}-${fileType.extension}`,
          assetLabel: term,
          severity: ruleResult.severity,
          status: 'new',
          source: 'Gitee',
          exposure: fileType.kind,
          title: `${term} related repository candidate`,
          repository: item.name || 'unknown-repository',
          owner: item.namespace?.name || item.owner?.login || 'unknown-owner',
          path: `Repository metadata (.${fileType.extension})`,
          match: term,
          snippet: item.description || item.full_name || 'Repository metadata only.',
          url: item.html_url,
          fileType: fileType.extension.toUpperCase(),
          sensitivity: ruleResult.sensitivity,
          channel: 'repository-metadata',
          sourceSite: item.html_url,
          firstSeen: item.created_at || new Date().toISOString(),
          lastSeen: item.updated_at || item.pushed_at || new Date().toISOString(),
          confidence: Math.min(0.88, 0.48 + ruleResult.confidenceBoost),
          matchedRules: ruleResult.matchedRules,
          notes: [
            `Repository search matched ${term} with a likely .${fileType.extension} context`,
            'Requires manual verification from the repository page.',
            ...ruleResult.notes,
          ],
        });
      }
    }
  }

  return findings;
};

export const searchFileLeaks = async (assets = [], query = '') => {
  const terms = Array.from(
    new Set([
      ...(query ? [query.trim()] : []),
      ...assets
        .filter((asset) => asset && asset.enabled !== false && typeof asset.value === 'string')
        .map((asset) => asset.value.trim())
        .filter(Boolean),
    ])
  ).slice(0, 6);

  if (terms.length === 0) {
    return {
      success: true,
      findings: [],
      meta: {
        usedTerms: [],
        githubCodeEnabled: Boolean(process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN || ''),
      },
    };
  }

  const [githubFileFindings, giteeFileFindings] = await Promise.all([
    searchGitHubFiles(terms),
    searchGiteeFileRepositories(terms),
  ]);

  return {
    success: true,
    findings: dedupeFileLeakFindings([
      ...githubFileFindings,
      ...giteeFileFindings,
    ]),
    meta: {
      usedTerms: terms,
      githubCodeEnabled: Boolean(process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN || ''),
    },
  };
};
