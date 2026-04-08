import {
  CODE_SENSITIVE_SEARCH_PATTERNS_V1,
  evaluateCodeLeak,
  evaluateFileLeak,
  evaluateRepositoryAssociation,
} from './leak-rules.js';

const OTX_UPSTREAM_URL = 'https://otx.alienvault.com/api/v1';
const OTX_INTERNAL_UPSTREAM_URL = 'https://otx.alienvault.com/otxapi';
const USE_OTX_INTERNAL_API = process.env.OTX_USE_INTERNAL_API === '1';

const otxSearchCache = globalThis.__otxSearchCache || new Map();
globalThis.__otxSearchCache = otxSearchCache;
const cveIntelCache = globalThis.__cveIntelCache || new Map();
globalThis.__cveIntelCache = cveIntelCache;
const nvdCveCache = globalThis.__nvdCveCache || new Map();
globalThis.__nvdCveCache = nvdCveCache;
const aliyunCveCache = globalThis.__aliyunCveCache || new Map();
globalThis.__aliyunCveCache = aliyunCveCache;

const OTX_SEARCH_CACHE_TTL = 10 * 60 * 1000;
const CVE_INTEL_CACHE_TTL = 15 * 60 * 1000;
const NVD_CVE_CACHE_TTL = 30 * 60 * 1000;
const ALIYUN_CVE_CACHE_TTL = 30 * 60 * 1000;

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

const getCveIntelCacheKey = ({ limit = 12, window = '7d' } = {}) => `cve-intel:${window}:${limit}`;

const getCachedCveIntel = (options = {}) => {
  const cacheKey = getCveIntelCacheKey(options);
  const cached = cveIntelCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    cveIntelCache.delete(cacheKey);
    return null;
  }
  return cached.value;
};

const setCachedCveIntel = (options, value) => {
  cveIntelCache.set(getCveIntelCacheKey(options), {
    value,
    expiresAt: Date.now() + CVE_INTEL_CACHE_TTL,
  });
};

const getCachedNvdCve = (cveId) => {
  const cached = nvdCveCache.get(cveId);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    nvdCveCache.delete(cveId);
    return null;
  }
  return cached.value;
};

const setCachedNvdCve = (cveId, value) => {
  nvdCveCache.set(cveId, {
    value,
    expiresAt: Date.now() + NVD_CVE_CACHE_TTL,
  });
};

const getCachedAliyunCve = (key) => {
  const cached = aliyunCveCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    aliyunCveCache.delete(key);
    return null;
  }
  return cached.value;
};

const setCachedAliyunCve = (key, value) => {
  aliyunCveCache.set(key, {
    value,
    expiresAt: Date.now() + ALIYUN_CVE_CACHE_TTL,
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

const SECTION_TIMEOUT_MS = 10000;
const SLOW_SECTION_TIMEOUT_MS = 7000;
const OPTIONAL_SECTION_TIMEOUT_MS = 8000;
const OTX_TIMEOUT_RETRIES = 1;

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
  const { graceful = false, timeoutMs = SECTION_TIMEOUT_MS, internal = false, retryCount = 0 } = options;
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
    if (error?.name === 'AbortError' && retryCount < OTX_TIMEOUT_RETRIES) {
      return requestOtxSection(endpoint, {
        ...options,
        retryCount: retryCount + 1,
        timeoutMs: Math.round(timeoutMs * 1.35),
      });
    }

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

const requestJson = async (url, options = {}) => {
  const { timeoutMs = SECTION_TIMEOUT_MS, graceful = false, headers = {} } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Lysir-Security-Platform/1.0',
        ...headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      if (graceful) {
        return null;
      }
      throw new Error(`Request failed: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    if (graceful) return null;
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const requestText = async (url, options = {}) => {
  const { timeoutMs = SECTION_TIMEOUT_MS, graceful = false, headers = {} } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Lysir-Security-Platform/1.0',
        ...headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      if (graceful) {
        return '';
      }
      throw new Error(`Request failed: ${response.status}`);
    }

    return response.text();
  } catch (error) {
    if (graceful) return '';
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const extractCveIds = (...values) => {
  const matches = new Set();
  values
    .filter(Boolean)
    .forEach((value) => {
      String(value)
        .match(/CVE-\d{4}-\d{4,7}/gi)
        ?.forEach((match) => matches.add(match.toUpperCase()));
    });
  return Array.from(matches);
};

const extractEnglishDescription = (descriptions = []) => {
  const english = descriptions.find(
    (item) => item?.lang === 'en' && typeof item.value === 'string' && item.value.trim()
  );
  return english?.value?.trim() || '';
};

const extractCvssMetrics = (metrics = {}) => {
  const candidates = [
    ...(Array.isArray(metrics.cvssMetricV31) ? metrics.cvssMetricV31 : []),
    ...(Array.isArray(metrics.cvssMetricV30) ? metrics.cvssMetricV30 : []),
    ...(Array.isArray(metrics.cvssMetricV2) ? metrics.cvssMetricV2 : []),
  ];

  for (const candidate of candidates) {
    const baseScore = candidate?.cvssData?.baseScore;
    if (typeof baseScore === 'number') {
      return {
        score: baseScore,
        severity:
          candidate?.cvssData?.baseSeverity ||
          candidate?.baseSeverity ||
          (baseScore >= 9 ? 'CRITICAL' : baseScore >= 7 ? 'HIGH' : baseScore >= 4 ? 'MEDIUM' : 'LOW'),
        vector: candidate?.cvssData?.vectorString || '',
      };
    }
  }

  return {
    score: null,
    severity: '',
    vector: '',
  };
};

const normalizePublishedDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
};

const getPushLevel = (score) => {
  if (score >= 70) return '楂樹紭鍏?;
  if (score >= 45) return '寤鸿鍏虫敞';
  return '鎯呮姤瑙傚療';
};

const buildPushAssessment = ({ cvssScore, hasKev, otxMentionCount, summary, title }) => {
  let score = 0;
  const reasons = [];
  const haystack = `${title || ''} ${summary || ''}`.toLowerCase();

  if (hasKev) {
    score += 40;
    reasons.push('宸茶繘鍏?KEV');
  }

  if (typeof cvssScore === 'number') {
    if (cvssScore >= 9) {
      score += 25;
      reasons.push('CVSS 鏋侀珮鍗?);
    } else if (cvssScore >= 7) {
      score += 15;
      reasons.push('CVSS 楂樺嵄');
    }
  }

  if (otxMentionCount >= 5) {
    score += 15;
    reasons.push('杩戞湡鎯呮姤鐑害杈冮珮');
  } else if (otxMentionCount >= 2) {
    score += 8;
    reasons.push('杩戞湡琚鏉℃儏鎶ユ彁鍙?);
  }

  if (/(rce|remote code execution|actively exploited|exploit|poc|ransomware|0day|zero-day)/i.test(haystack)) {
    score += 12;
    reasons.push('瀛樺湪楂橀闄╁埄鐢ㄧ嚎绱?);
  }

  return {
    score,
    level: getPushLevel(score),
    recommended: score >= 45,
    reasons,
  };
};

export const enrichWithNvd = async (cveId) => {
  const cached = getCachedNvdCve(cveId);
  if (cached) {
    return cached;
  }

  const data = await requestJson(`https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(cveId)}`, {
    timeoutMs: 6000,
    graceful: true,
  });

  const vulnerability = Array.isArray(data?.vulnerabilities) ? data.vulnerabilities[0]?.cve : null;
  if (!vulnerability) {
    return null;
  }

  const descriptions = Array.isArray(vulnerability.descriptions) ? vulnerability.descriptions : [];
  const description = extractEnglishDescription(descriptions);
  const metrics = extractCvssMetrics(vulnerability.metrics || {});
  const weaknesses = Array.isArray(vulnerability.weaknesses) ? vulnerability.weaknesses : [];
  const cwe = weaknesses
    .flatMap((item) => (Array.isArray(item?.description) ? item.description : []))
    .find((item) => item?.lang === 'en' && typeof item.value === 'string')?.value;

  const normalized = {
    cveId,
    description,
    published: normalizePublishedDate(vulnerability.published),
    lastModified: normalizePublishedDate(vulnerability.lastModified),
    cvssScore: metrics.score,
    severity: metrics.severity,
    vector: metrics.vector,
    hasKev: Boolean(vulnerability.cisaExploitAdd),
    kevDate: normalizePublishedDate(vulnerability.cisaExploitAdd),
    cwe: cwe || '',
    references: Array.isArray(vulnerability.references)
      ? vulnerability.references
          .map((item) => item?.url)
          .filter(Boolean)
          .slice(0, 6)
      : [],
  };

  setCachedNvdCve(cveId, normalized);
  return normalized;
};

const parseAliyunSeverity = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/[涓ラ噸|绱ф€/.test(text)) return 'CRITICAL';
  if (/楂?.test(text)) return 'HIGH';
  if (/涓?.test(text)) return 'MEDIUM';
  if (/浣?.test(text)) return 'LOW';
  return text.toUpperCase();
};

const enrichWithAliyunAvd = async (cveId) => {
  const normalizedId = String(cveId || '').trim().toUpperCase();
  if (!normalizedId) return null;

  const cached = getCachedAliyunCve(normalizedId);
  if (cached) {
    return cached;
  }

  const html = await requestText('https://avd.aliyun.com/', {
    timeoutMs: 7000,
    graceful: true,
  });

  if (!html) {
    return null;
  }

  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    if (!new RegExp(normalizedId, 'i').test(row)) {
      continue;
    }

    const hrefMatch = row.match(/href="([^"]+)"/i);
    const textCells = Array.from(row.matchAll(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi))
      .map((match) =>
        String(match[1] || '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter(Boolean);

    const normalized = {
      cveId: normalizedId,
      title: textCells[1] || '',
      published: normalizePublishedDate(textCells[2] || ''),
      severity: parseAliyunSeverity(textCells[4] || textCells[3] || ''),
      sourceUrl: hrefMatch?.[1] ? `https://avd.aliyun.com${hrefMatch[1]}` : '',
      sourceName: 'Aliyun AVD',
    };

    setCachedAliyunCve(normalizedId, normalized);
    return normalized;
  }

  setCachedAliyunCve(normalizedId, null);
  return null;
};

export const buildLatestCveIntelFeed = async (options = {}) => {
  const limit = Math.max(4, Math.min(20, Number(options.limit) || 12));
  const window = ['24h', '7d', 'all'].includes(String(options.window || '7d')) ? String(options.window) : '7d';
  const noCache = options.noCache === true;

  if (!noCache) {
    const cached = getCachedCveIntel({ limit, window });
    if (cached) {
      return { ...cached, cached: true };
    }
  }

  const activityPayload = await requestOtxSection('/pulses/activity', {
    timeoutMs: 10000,
    graceful: true,
  });
  const results = isSectionErrorPayload(activityPayload)
    ? []
    : Array.isArray(activityPayload?.results)
      ? activityPayload.results
      : [];
  const now = Date.now();
  const maxAge =
    window === '24h' ? 24 * 60 * 60 * 1000 : window === '7d' ? 7 * 24 * 60 * 60 * 1000 : Number.POSITIVE_INFINITY;

  const cveMap = new Map();

  results.forEach((pulse) => {
    const eventTime = new Date(pulse?.modified || pulse?.created || '').getTime();
    if (!Number.isNaN(eventTime) && eventTime < now - maxAge) {
      return;
    }

    const cveIds = extractCveIds(
      pulse?.name,
      pulse?.description,
      ...(Array.isArray(pulse?.indicators) ? pulse.indicators.map((indicator) => indicator?.indicator) : [])
    );

    cveIds.forEach((cveId) => {
      const existing = cveMap.get(cveId) || {
        cveId,
        latestSeen: pulse?.modified || pulse?.created || '',
        latestPulseName: pulse?.name || '',
        latestPulseSummary: pulse?.description || '',
        otxMentionCount: 0,
        tags: new Set(),
        references: new Set(),
        sourceTags: new Set(['OTX']),
      };

      existing.otxMentionCount += 1;
      if ((pulse?.modified || pulse?.created || '') > existing.latestSeen) {
        existing.latestSeen = pulse?.modified || pulse?.created || '';
        existing.latestPulseName = pulse?.name || existing.latestPulseName;
        existing.latestPulseSummary = pulse?.description || existing.latestPulseSummary;
      }

      (Array.isArray(pulse?.tags) ? pulse.tags : []).forEach((tag) => {
        if (typeof tag === 'string' && tag.trim()) existing.tags.add(tag.trim());
      });
      (Array.isArray(pulse?.references) ? pulse.references : []).forEach((reference) => {
        if (typeof reference === 'string' && reference.trim()) existing.references.add(reference.trim());
      });

      cveMap.set(cveId, existing);
    });
  });

  const rankedSignals = Array.from(cveMap.values())
    .sort((a, b) => new Date(b.latestSeen).getTime() - new Date(a.latestSeen).getTime())
    .slice(0, limit);

  const enrichedItems = await Promise.all(
    rankedSignals.map(async (signal) => {
      const nvd = await enrichWithNvd(signal.cveId);
      const aliyun = await enrichWithAliyunAvd(signal.cveId);
      const summary = nvd?.description || signal.latestPulseSummary || '';
      const title = aliyun?.title || signal.latestPulseName || signal.cveId;
      const push = buildPushAssessment({
        cvssScore: nvd?.cvssScore ?? null,
        hasKev: Boolean(nvd?.hasKev),
        otxMentionCount: signal.otxMentionCount,
        summary,
        title,
      });

      const sourceTags = new Set(signal.sourceTags);
      if (nvd) sourceTags.add('NVD');
      if (nvd?.hasKev) sourceTags.add('KEV');
      if (aliyun) sourceTags.add('Aliyun AVD');

      return {
        cveId: signal.cveId,
        title,
        summary,
        published: nvd?.published || aliyun?.published || '',
        lastModified: nvd?.lastModified || signal.latestSeen,
        latestSeen: signal.latestSeen,
        cvssScore: nvd?.cvssScore ?? null,
        severity: nvd?.severity || aliyun?.severity || '',
        vector: nvd?.vector || '',
        cwe: nvd?.cwe || '',
        hasKev: Boolean(nvd?.hasKev),
        kevDate: nvd?.kevDate || '',
        otxMentionCount: signal.otxMentionCount,
        latestPulseName: signal.latestPulseName,
        tags: Array.from(signal.tags).slice(0, 8),
        references: Array.from(
          new Set([...(nvd?.references || []), ...(aliyun?.sourceUrl ? [aliyun.sourceUrl] : []), ...Array.from(signal.references)])
        ).slice(0, 8),
        sourceTags: Array.from(sourceTags),
        sourceDetails: {
          aliyun: aliyun || null,
          nvd: nvd ? { severity: nvd.severity, cvssScore: nvd.cvssScore } : null,
        },
        pushScore: push.score,
        pushLevel: push.level,
        pushRecommended: push.recommended,
        pushReasons: push.reasons,
      };
    })
  );

  const sortedItems = enrichedItems.sort((a, b) => {
    if (b.pushScore !== a.pushScore) return b.pushScore - a.pushScore;
    return new Date(b.lastModified || b.latestSeen).getTime() - new Date(a.lastModified || a.latestSeen).getTime();
  });

  const payload = {
    cached: false,
    generatedAt: new Date().toISOString(),
    meta: {
      totalSignals: sortedItems.length,
      recommendedCount: sortedItems.filter((item) => item.pushRecommended).length,
      kevCount: sortedItems.filter((item) => item.hasKev).length,
      highSeverityCount: sortedItems.filter((item) => typeof item.cvssScore === 'number' && item.cvssScore >= 7).length,
      sourceTags: ['OTX', 'NVD', 'KEV', 'Aliyun AVD'],
      window,
      upstreamStatus: isSectionErrorPayload(activityPayload) ? getSectionErrorType(activityPayload) : 'success',
    },
    items: sortedItems,
  };

  setCachedCveIntel({ limit, window }, payload);
  return payload;
};

export const buildStructuredOtxResult = async (type, query, options = {}) => {
  const { coreOnly = false } = options;
  if (type === 'ip') {
    const ipVersion = query.includes(':') ? 'IPv6' : 'IPv4';
    const [generalPayload, reputationPayload, geoPayload, passiveDnsPayload, malwarePayload, urlListPayload, httpScansPayload] = await Promise.all([
      requestOtxCandidates([{ endpoint: `/indicators/ip/general/${query}`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/general`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/${ipVersion}/reputation/${query}`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/reputation`, internal: false }], { graceful: true, timeoutMs: OPTIONAL_SECTION_TIMEOUT_MS }),
      requestOtxCandidates([{ endpoint: `/indicators/${ipVersion}/geo/${query}`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/geo`, internal: false }], { graceful: true, timeoutMs: OPTIONAL_SECTION_TIMEOUT_MS }),
        coreOnly ? Promise.resolve({}) : requestOtxCandidates([{ endpoint: `/indicators/${ipVersion}/passive_dns/${query}`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/passive_dns`, internal: false }], { graceful: true, timeoutMs: SLOW_SECTION_TIMEOUT_MS }),
        coreOnly ? Promise.resolve({}) : requestOtxCandidates([{ endpoint: `/indicators/${ipVersion}/malware/${query}?limit=10&page=1`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/malware`, internal: false }], { graceful: true, timeoutMs: SLOW_SECTION_TIMEOUT_MS }),
        coreOnly ? Promise.resolve({}) : requestOtxCandidates([{ endpoint: `/indicators/${ipVersion}/url_list/${query}`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/url_list`, internal: false }], { graceful: true, timeoutMs: OPTIONAL_SECTION_TIMEOUT_MS }),
        coreOnly ? Promise.resolve({}) : requestOtxCandidates([{ endpoint: `/indicators/${ipVersion}/http_scans/${query}`, internal: true }, { endpoint: `/indicators/${ipVersion}/${query}/http_scans`, internal: false }], { graceful: true, timeoutMs: SLOW_SECTION_TIMEOUT_MS }),
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
        pulses: buildSectionState(pulses.length > 0 ? 'success' : 'no_data', pulses.length > 0 ? '宸叉壘鍒板叧鑱旀儏鎶ャ€? : '鏈壘鍒板叧鑱旀儏鎶ャ€?),
        passive_dns: buildSectionState(
          getSectionErrorType(passiveDnsPayload) === 'timeout' ? 'timeout' : passiveDnsCount > 0 ? 'success' : 'no_data',
          getSectionErrorType(passiveDnsPayload) === 'timeout'
            ? '琚姩 DNS 鏌ヨ瓒呮椂锛屾儏鎶ユ簮鏈湪闄愬畾鏃堕棿鍐呰繑鍥炴暟鎹€?
            : passiveDnsCount > 0
              ? '宸茶幏鍙栬鍔?DNS 璁板綍銆?
              : '鎯呮姤婧愭湭杩斿洖琚姩 DNS 璁板綍銆?
        ),
        url_list: buildSectionState(urlList.length > 0 ? 'success' : 'no_data', urlList.length > 0 ? '宸叉壘鍒板叧鑱?URL銆? : '鏈壘鍒板叧鑱?URL銆?),
        malware: buildSectionState(
          getSectionErrorType(malwarePayload) === 'timeout' ? 'timeout' : malwareCount > 0 ? 'success' : 'no_data',
          getSectionErrorType(malwarePayload) === 'timeout'
            ? '鎭舵剰鏍锋湰鏌ヨ瓒呮椂锛屾儏鎶ユ簮鏈湪闄愬畾鏃堕棿鍐呰繑鍥炴暟鎹€?
            : malwareCount > 0
              ? '宸茶幏鍙栨伓鎰忔牱鏈褰曘€?
              : '鎯呮姤婧愭湭杩斿洖鎭舵剰鏍锋湰璁板綍銆?
        ),
        http_scans: buildSectionState(
          getSectionErrorType(httpScansPayload) === 'timeout' ? 'timeout' : httpScanCount > 0 ? 'success' : 'no_data',
          getSectionErrorType(httpScansPayload) === 'timeout'
            ? 'HTTP 鎵弿鏌ヨ瓒呮椂锛屾儏鎶ユ簮鏈湪闄愬畾鏃堕棿鍐呰繑鍥炴暟鎹€?
            : httpScanCount > 0
              ? '宸茶幏鍙?HTTP 鎵弿璁板綍銆?
              : '鏈壘鍒?HTTP 鎵弿璁板綍銆?
        ),
      },
    };
  }

  if (type === 'domain') {
    const [generalPayload, geoPayload, passiveDnsPayload, whoisPayload, malwarePayload, urlListPayload, httpScansPayload] = await Promise.all([
      requestOtxCandidates([{ endpoint: `/indicators/domain/general/${query}`, internal: true }, { endpoint: `/indicators/domain/${query}/general`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/domain/geo/${query}`, internal: true }, { endpoint: `/indicators/domain/${query}/geo`, internal: false }], { graceful: true, timeoutMs: OPTIONAL_SECTION_TIMEOUT_MS }),
        coreOnly ? Promise.resolve({}) : requestOtxCandidates([{ endpoint: `/indicators/domain/passive_dns/${query}`, internal: true }, { endpoint: `/indicators/domain/${query}/passive_dns`, internal: false }], { graceful: true, timeoutMs: SLOW_SECTION_TIMEOUT_MS }),
      requestOtxCandidates([{ endpoint: `/indicators/domain/whois/${query}`, internal: true }, { endpoint: `/indicators/domain/${query}/whois`, internal: false }], { graceful: true, timeoutMs: OPTIONAL_SECTION_TIMEOUT_MS }),
        coreOnly ? Promise.resolve({}) : requestOtxCandidates([{ endpoint: `/indicators/domain/malware/${query}?limit=10&page=1`, internal: true }, { endpoint: `/indicators/domain/${query}/malware`, internal: false }], { graceful: true, timeoutMs: SLOW_SECTION_TIMEOUT_MS }),
        coreOnly ? Promise.resolve({}) : requestOtxCandidates([{ endpoint: `/indicators/domain/url_list/${query}`, internal: true }, { endpoint: `/indicators/domain/${query}/url_list`, internal: false }], { graceful: true, timeoutMs: OPTIONAL_SECTION_TIMEOUT_MS }),
        coreOnly ? Promise.resolve({}) : requestOtxCandidates([{ endpoint: `/indicators/domain/http_scans/${query}`, internal: true }, { endpoint: `/indicators/domain/${query}/http_scans`, internal: false }], { graceful: true, timeoutMs: SLOW_SECTION_TIMEOUT_MS }),
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
        pulses: buildSectionState(pulses.length > 0 ? 'success' : 'no_data', pulses.length > 0 ? '宸叉壘鍒板叧鑱旀儏鎶ャ€? : '鏈壘鍒板叧鑱旀儏鎶ャ€?),
        passive_dns: buildSectionState(
          getSectionErrorType(passiveDnsPayload) === 'timeout' ? 'timeout' : passiveDnsCount > 0 ? 'success' : 'no_data',
          getSectionErrorType(passiveDnsPayload) === 'timeout'
            ? '琚姩 DNS 鏌ヨ瓒呮椂锛屾儏鎶ユ簮鏈湪闄愬畾鏃堕棿鍐呰繑鍥炴暟鎹€?
            : passiveDnsCount > 0
              ? '宸茶幏鍙栬鍔?DNS 璁板綍銆?
              : '鎯呮姤婧愭湭杩斿洖琚姩 DNS 璁板綍銆?
        ),
        url_list: buildSectionState(urlList.length > 0 ? 'success' : 'no_data', urlList.length > 0 ? '宸叉壘鍒板叧鑱?URL銆? : '鏈壘鍒板叧鑱?URL銆?),
        malware: buildSectionState(
          getSectionErrorType(malwarePayload) === 'timeout' ? 'timeout' : malwareCount > 0 ? 'success' : 'no_data',
          getSectionErrorType(malwarePayload) === 'timeout'
            ? '鎭舵剰鏍锋湰鏌ヨ瓒呮椂锛屾儏鎶ユ簮鏈湪闄愬畾鏃堕棿鍐呰繑鍥炴暟鎹€?
            : malwareCount > 0
              ? '宸茶幏鍙栨伓鎰忔牱鏈褰曘€?
              : '鎯呮姤婧愭湭杩斿洖鎭舵剰鏍锋湰璁板綍銆?
        ),
        http_scans: buildSectionState(
          getSectionErrorType(httpScansPayload) === 'timeout' ? 'timeout' : httpScanCount > 0 ? 'success' : 'no_data',
          getSectionErrorType(httpScansPayload) === 'timeout'
            ? 'HTTP 鎵弿鏌ヨ瓒呮椂锛屾儏鎶ユ簮鏈湪闄愬畾鏃堕棿鍐呰繑鍥炴暟鎹€?
            : httpScanCount > 0
              ? '宸茶幏鍙?HTTP 鎵弿璁板綍銆?
              : '鏈壘鍒?HTTP 鎵弿璁板綍銆?
        ),
      },
    };
  }

  if (type === 'url') {
    const sanitizedQuery = query.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const encodedQuery = encodeURIComponent(sanitizedQuery);
    const [generalPayload, urlListPayload] = await Promise.all([
      requestOtxCandidates([{ endpoint: `/indicators/url/general/${encodedQuery}`, internal: true }, { endpoint: `/indicators/url/${encodedQuery}/general`, internal: false }]),
          coreOnly ? Promise.resolve({}) : requestOtxCandidates([{ endpoint: `/indicators/url/url_list/${encodedQuery}`, internal: true }, { endpoint: `/indicators/url/${encodedQuery}/url_list`, internal: false }], { graceful: true, timeoutMs: OPTIONAL_SECTION_TIMEOUT_MS }),
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
        pulses: buildSectionState(pulses.length > 0 ? 'success' : 'no_data', pulses.length > 0 ? '宸叉壘鍒板叧鑱旀儏鎶ャ€? : '鏈壘鍒板叧鑱旀儏鎶ャ€?),
        passive_dns: buildSectionState('not_supported', 'URL 鏌ヨ鏆備笉鎻愪緵琚姩 DNS 璁板綍銆?),
        url_list: buildSectionState(urlList.length > 0 ? 'success' : 'no_data', urlList.length > 0 ? '宸叉壘鍒板叧鑱?URL銆? : '鏈壘鍒板叧鑱?URL銆?),
        malware: buildSectionState('not_supported', 'URL 鏌ヨ鏆備笉鎻愪緵鎭舵剰鏍锋湰璁板綍銆?),
        http_scans: buildSectionState('not_supported', 'URL 鏌ヨ鏆備笉鎻愪緵 HTTP 鎵弿璁板綍銆?),
      },
    };
  }

  if (type === 'cve') {
    const normalizedQuery = String(query).toUpperCase();
    const [generalPayload, pulsesPayload] = await Promise.all([
      requestOtxCandidates([{ endpoint: `/indicators/cve/general/${normalizedQuery}`, internal: true }, { endpoint: `/indicators/cve/${normalizedQuery}/general`, internal: false }]),
      requestOtxCandidates([{ endpoint: `/indicators/cve/top_n_pulses/${normalizedQuery}`, internal: true }, { endpoint: `/indicators/cve/${normalizedQuery}/top_n_pulses`, internal: false }], { graceful: true, timeoutMs: OPTIONAL_SECTION_TIMEOUT_MS }),
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
        pulses: buildSectionState(pulses.length > 0 ? 'success' : 'no_data', pulses.length > 0 ? '宸叉壘鍒板叧鑱旀儏鎶ャ€? : '鏈壘鍒板叧鑱旀儏鎶ャ€?),
        passive_dns: buildSectionState('not_supported', 'CVE 鏌ヨ鏆備笉鎻愪緵琚姩 DNS 璁板綍銆?),
        url_list: buildSectionState('not_supported', 'CVE 鏌ヨ鏆備笉鎻愪緵鍏宠仈 URL銆?),
        malware: buildSectionState('not_supported', 'CVE 鏌ヨ鏆備笉鎻愪緵鎭舵剰鏍锋湰璁板綍銆?),
        http_scans: buildSectionState('not_supported', 'CVE 鏌ヨ鏆備笉鎻愪緵 HTTP 鎵弿璁板綍銆?),
      },
    };
  }

  throw new Error(`Unsupported OTX search type: ${type}`);
};

const dedupeCodeLeakFindings = (findings) => {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.source}:${finding.repository}:${finding.path}:${finding.match}`;
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
        title: `鍏紑浠撳簱鍛戒腑鍏抽敭璇嶁€?{term}鈥漙,
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
        notes: ['鍏紑浠撳簱鍏冩暟鎹懡涓洃鎺у璞?, '寤鸿缁х画鏌ョ湅 README銆侀厤缃枃浠朵笌鎻愪氦鍘嗗彶'],
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
        title: `浠ｇ爜鎼滅储鍛戒腑鈥?{term}鈥漙,
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
        notes: ['GitHub code search returned a direct file-level match', '寤鸿浼樺厛鏍稿鐗囨鏄惁鍖呭惈鐪熷疄鍑嵁鎴栧唴閮ㄩ厤缃?],
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
        title: `鍏紑 Gitee 浠撳簱鍛戒腑鍏抽敭璇嶁€?{term}鈥漙,
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
        notes: ['Gitee 鍏紑浠撳簱鍏冩暟鎹懡涓洃鎺у璞?, '寤鸿缁х画妫€鏌?README銆侀厤缃洰褰曞拰 Issues 璁ㄨ鍐呭'],
      });
    }
  }

  return findings;
};

export const searchCodeLeaks = async (assets = [], query = '') => {
  const normalizedAssets = normalizeCodeLeakAssets(assets, query);

  if (normalizedAssets.length === 0) {
    return {
      success: true,
      findings: [],
      meta: {
        usedTerms: [],
        githubCodeEnabled: Boolean(process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN || ''),
      },
    };
  }

  const [githubRepositoryCandidates, giteeRepositoryCandidates] = await Promise.all([
    searchAssociatedGitHubRepositories(normalizedAssets),
    searchAssociatedGiteeRepositories(normalizedAssets),
  ]);

  const githubCodeFindings = await searchSensitiveGitHubRepositoryContent(githubRepositoryCandidates);
  const giteeRepositoryFindings = giteeRepositoryCandidates.map((candidate) => ({
    id: `gitee-repo-${candidate.repository}-${candidate.asset.id}`,
    assetLabel: candidate.asset.label,
    severity: 'medium',
    status: 'new',
    source: 'Gitee',
    exposure: 'repository',
    title: `${candidate.repository} related repository candidate`,
    repository: candidate.repository,
    owner: candidate.owner,
    path: 'Repository metadata',
    branch: candidate.branch,
    match: candidate.asset.value,
    snippet: candidate.description || 'Repository metadata requires manual verification.',
    firstSeen: candidate.firstSeen,
    lastSeen: candidate.lastSeen,
    url: candidate.url,
    confidence: Math.min(0.82, 0.44 + candidate.association.confidenceBoost),
    matchedRules: candidate.association.matchedRules,
    notes: [
      `Repository appears related to monitored asset ${candidate.asset.type}:${candidate.asset.value}`,
      ...candidate.association.notes,
      'Gitee source is currently repository-level only; sensitive file verification still needs manual review.',
    ],
  }));

  return {
    success: true,
    findings: dedupeCodeLeakFindings([
      ...githubCodeFindings,
      ...giteeRepositoryFindings,
    ]),
    meta: {
      usedTerms: normalizedAssets.map((asset) => asset.value),
      githubCodeEnabled: Boolean(process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN || ''),
      repositoryCandidates: githubRepositoryCandidates.length + giteeRepositoryCandidates.length,
    },
  };
};

const normalizeCodeLeakAssets = (assets = [], query = '') =>
  Array.from(
    new Map(
      [
        ...assets
          .filter((asset) => asset && asset.enabled !== false && typeof asset.value === 'string' && asset.value.trim())
          .map((asset) => [
            `${asset.type}:${asset.value.trim().toLowerCase()}`,
            {
              ...asset,
              label: asset.label || asset.value.trim(),
              value: asset.value.trim(),
            },
          ]),
        ...(query && query.trim()
          ? [[`query:${query.trim().toLowerCase()}`, { id: `query-${query.trim().toLowerCase()}`, label: query.trim(), value: query.trim(), type: 'repository', enabled: true }]]
          : []),
      ]
    ).values()
  ).slice(0, 8);

const buildRepositorySearchTerms = (asset) => {
  const rawValue = String(asset?.value || '').trim().toLowerCase();
  if (!rawValue) return [];

  const terms = new Set([rawValue]);
  const sanitized = rawValue.replace(/^@/, '').replace(/^https?:\/\//, '').replace(/^www\./, '');
  if (sanitized) terms.add(sanitized);

  if (asset.type === 'domain' || asset.type === 'email_suffix') {
    const domain = sanitized.replace(/^@/, '').split('/')[0];
    if (domain) {
      terms.add(domain);
      const rootDomain = domain.split('.').slice(-2).join('.');
      if (rootDomain) terms.add(rootDomain);
      const ownerToken = domain.split('.')[0];
      if (ownerToken && ownerToken.length >= 3) terms.add(ownerToken);
    }
  } else {
    sanitized
      .split(/[^a-z0-9]+/i)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3)
      .forEach((part) => terms.add(part));
  }

  return Array.from(terms).filter(Boolean).slice(0, 4);
};

const createRepositoryCandidateKey = (source, owner, repository) =>
  `${source}:${String(owner || '').toLowerCase()}:${String(repository || '').toLowerCase()}`;

const searchAssociatedGitHubRepositories = async (assets = []) => {
  const githubToken = process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN || '';
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Lysir-Security-Platform/1.0',
  };

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
    headers['X-GitHub-Api-Version'] = '2022-11-28';
  }

  const candidates = [];
  const seen = new Set();

  for (const asset of assets) {
    const terms = buildRepositorySearchTerms(asset);
    for (const term of terms) {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(term)}&sort=updated&order=desc&per_page=3`;
      const response = await fetch(url, { headers });
      if (!response.ok) continue;
      const data = await response.json();
      const items = Array.isArray(data.items) ? data.items : [];

      for (const item of items) {
        const association = evaluateRepositoryAssociation({
          asset,
          repository: item.name || '',
          owner: item.owner?.login || item.full_name || '',
          text: `${item.description || ''} ${item.full_name || ''}`,
          homepage: item.homepage || '',
        });

        if (!association.associated) continue;

        const key = createRepositoryCandidateKey('GitHub', item.owner?.login, item.name);
        if (seen.has(key)) continue;
        seen.add(key);

        candidates.push({
          source: 'GitHub',
          owner: item.owner?.login || 'unknown-owner',
          repository: item.name || 'unknown-repository',
          branch: item.default_branch || 'main',
          url: item.html_url,
          fullName: item.full_name || `${item.owner?.login || 'unknown-owner'}/${item.name || 'unknown-repository'}`,
          description: item.description || '',
          firstSeen: item.created_at || new Date().toISOString(),
          lastSeen: item.updated_at || item.pushed_at || new Date().toISOString(),
          asset,
          association,
        });
      }
    }
  }

  return candidates;
};

const searchSensitiveGitHubRepositoryContent = async (repositoryCandidates = []) => {
  const githubToken = process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN || '';
  if (!githubToken) return [];

  const headers = {
    Accept: 'application/vnd.github.text-match+json',
    Authorization: `Bearer ${githubToken}`,
    'User-Agent': 'Lysir-Security-Platform/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const findings = [];
  for (const candidate of repositoryCandidates.slice(0, 8)) {
    for (const pattern of CODE_SENSITIVE_SEARCH_PATTERNS_V1) {
      const scopedQuery = `repo:${candidate.fullName} ${pattern.query}`;
      const url = `https://api.github.com/search/code?q=${encodeURIComponent(scopedQuery)}&per_page=2`;
      const response = await fetch(url, { headers });
      if (!response.ok) continue;
      const data = await response.json();
      const items = Array.isArray(data.items) ? data.items : [];

      for (const item of items) {
        const textMatch = Array.isArray(item.text_matches) && item.text_matches.length > 0
          ? item.text_matches[0].fragment
          : `${item.repository?.full_name || ''} ${item.path || ''}`.trim();
        const ruleResult = evaluateCodeLeak({
          term: candidate.asset.value,
          text: textMatch,
          path: item.path || pattern.label,
        });

        findings.push({
          id: `github-code-${item.sha || item.url}-${candidate.asset.id}-${pattern.id}`,
          assetLabel: candidate.asset.label,
          severity: ruleResult.matchedRules.length > 0 ? ruleResult.severity : pattern.severity,
          status: 'new',
          source: 'GitHub',
          exposure: ruleResult.matchedRules.length > 0 ? ruleResult.exposure : pattern.exposure,
          title: `${candidate.repository} sensitive content match`,
          repository: candidate.repository,
          owner: candidate.owner,
          path: item.path || 'Unknown path',
          branch: candidate.branch,
          match: candidate.asset.value,
          snippet: textMatch || `Sensitive repository search matched ${pattern.label}.`,
          firstSeen: candidate.firstSeen,
          lastSeen: candidate.lastSeen,
          url: item.html_url || candidate.url,
          confidence: Math.min(0.99, 0.76 + candidate.association.confidenceBoost + ruleResult.confidenceBoost),
          matchedRules: Array.from(new Set([...candidate.association.matchedRules, pattern.id, ...ruleResult.matchedRules])),
          notes: [
            `Repository association asset: ${candidate.asset.type}:${candidate.asset.value}`,
            ...candidate.association.notes,
            `Sensitive repository query matched: ${pattern.label}`,
            ...ruleResult.notes,
          ],
        });
      }
    }
  }

  return findings;
};

const searchAssociatedGiteeRepositories = async (assets = []) => {
  const giteeToken = process.env.GITEE_ACCESS_TOKEN || process.env.VITE_GITEE_ACCESS_TOKEN || '';
  const candidates = [];
  const seen = new Set();

  for (const asset of assets) {
    const terms = buildRepositorySearchTerms(asset);
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
        const association = evaluateRepositoryAssociation({
          asset,
          repository: item.name || '',
          owner: item.namespace?.name || item.owner?.login || '',
          text: `${item.description || ''} ${item.full_name || ''}`,
          homepage: item.html_url || '',
        });

        if (!association.associated) continue;

        const key = createRepositoryCandidateKey('Gitee', item.namespace?.name || item.owner?.login, item.name);
        if (seen.has(key)) continue;
        seen.add(key);

        candidates.push({
          source: 'Gitee',
          owner: item.namespace?.name || item.owner?.login || 'unknown-owner',
          repository: item.name || 'unknown-repository',
          branch: item.default_branch || 'master',
          url: item.html_url,
          description: item.description || '',
          firstSeen: item.created_at || new Date().toISOString(),
          lastSeen: item.updated_at || item.pushed_at || new Date().toISOString(),
          asset,
          association,
        });
      }
    }
  }

  return candidates;
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
        if (!ruleResult.eligible) continue;

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
        if (!ruleResult.eligible) continue;
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
