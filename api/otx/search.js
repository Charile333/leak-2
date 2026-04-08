import { applyCors, sendJson } from '../_lib/http.js';
import { getOtxApiKey } from '../_lib/runtime-config.js';
import { getCveIntelUserEmail, listCveIntelAssets } from '../_lib/cve-intel-assets.js';
import { sendApiError } from '../_lib/api-errors.js';

const OTX_API_BASE = 'https://otx.alienvault.com/api/v1';
const DEFAULT_TIMEOUT_MS = 15000;
const searchCache = new Map();
const searchCacheTtlMs = 5 * 60 * 1000;

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9.+#/_:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const readCachedValue = (key) => {
  const record = searchCache.get(key);
  if (!record) return null;
  if (Date.now() - record.timestamp > searchCacheTtlMs) {
    searchCache.delete(key);
    return null;
  }
  return record.value;
};

const writeCachedValue = (key, value) => {
  searchCache.set(key, {
    value,
    timestamp: Date.now(),
  });
};

const createTimeoutSignal = (timeoutMs) => AbortSignal.timeout(timeoutMs || DEFAULT_TIMEOUT_MS);

const buildOtxHeaders = () => {
  const apiKey = getOtxApiKey();
  if (!apiKey) {
    const error = new Error('OTX_API_KEY is not configured');
    error.statusCode = 500;
    throw error;
  }

  return {
    Accept: 'application/json',
    'X-OTX-API-KEY': apiKey,
  };
};

const fetchJson = async (url, { timeoutMs, allow404 = false } = {}) => {
  const response = await fetch(url, {
    method: 'GET',
    headers: buildOtxHeaders(),
    signal: createTimeoutSignal(timeoutMs),
  });

  if (allow404 && response.status === 404) {
    return {};
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(`OTX request failed with status ${response.status}`);
    error.statusCode = response.status;
    error.details = text;
    throw error;
  }

  return response.json();
};

const fetchIndicatorSection = async (type, query, section, params = {}, options = {}) => {
  const normalizedQuery =
    type === 'url'
      ? encodeURIComponent(String(query || '').replace(/^https?:\/\//i, '').replace(/\/$/, ''))
      : encodeURIComponent(String(query || '').trim());

  const otxType =
    type === 'ip'
      ? String(query || '').includes(':')
        ? 'IPv6'
        : 'IPv4'
      : type;

  const searchParams = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  });

  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const url = `${OTX_API_BASE}/indicators/${otxType}/${normalizedQuery}/${section}${suffix}`;
  return fetchJson(url, { allow404: true, ...options });
};

const inferSeverityFromText = (text) => {
  const normalized = normalizeText(text);
  if (/\bcritical\b|\brce\b|\bremote code execution\b|\b0day\b|\bzero day\b/.test(normalized)) return 'critical';
  if (/\bhigh\b|\bprivilege escalation\b|\bexploit\b|\bactive\b/.test(normalized)) return 'high';
  if (/\bmedium\b|\bdenial of service\b|\bdos\b/.test(normalized)) return 'medium';
  return 'low';
};

const severityToScore = (severity) => {
  if (severity === 'critical') return 9.4;
  if (severity === 'high') return 8.1;
  if (severity === 'medium') return 5.6;
  return 3.2;
};

const extractReferences = (pulse) => {
  const references = [];
  if (Array.isArray(pulse?.references)) {
    references.push(...pulse.references.filter((value) => typeof value === 'string'));
  }
  if (Array.isArray(pulse?.tags)) {
    references.push(...pulse.tags.filter((value) => typeof value === 'string' && /^cve-\d{4}-\d{4,7}$/i.test(value)));
  }
  return Array.from(new Set(references));
};

const buildPushAssessment = ({ severity, otxMentionCount, latestSeen, hasKev }) => {
  let pushScore = 0;
  const reasons = [];

  if (severity === 'critical') {
    pushScore += 45;
    reasons.push('critical severity');
  } else if (severity === 'high') {
    pushScore += 30;
    reasons.push('high severity');
  } else if (severity === 'medium') {
    pushScore += 18;
  }

  if (otxMentionCount >= 5) {
    pushScore += 20;
    reasons.push('multiple OTX mentions');
  } else if (otxMentionCount >= 2) {
    pushScore += 10;
  }

  if (hasKev) {
    pushScore += 20;
    reasons.push('known exploited');
  }

  if (latestSeen) {
    const ageMs = Date.now() - new Date(latestSeen).getTime();
    if (!Number.isNaN(ageMs) && ageMs <= 3 * 24 * 60 * 60 * 1000) {
      pushScore += 15;
      reasons.push('recently observed');
    }
  }

  const pushLevel = pushScore >= 60 ? 'high' : pushScore >= 30 ? 'medium' : 'low';

  return {
    pushScore,
    pushLevel,
    pushRecommended: pushScore >= 45,
    pushReasons: reasons,
  };
};

const extractCvesFromPulse = (pulse) => {
  const sourceText = [
    pulse?.name,
    pulse?.description,
    ...(Array.isArray(pulse?.tags) ? pulse.tags : []),
    ...(Array.isArray(pulse?.references) ? pulse.references : []),
  ]
    .filter(Boolean)
    .join(' ');

  const matches = sourceText.match(/CVE-\d{4}-\d{4,7}/gi) || [];
  return Array.from(new Set(matches.map((value) => value.toUpperCase())));
};

const buildCveFeedItems = (pulses, windowKey) => {
  const now = Date.now();
  const maxAgeMs =
    windowKey === '24h' ? 24 * 60 * 60 * 1000 : windowKey === '7d' ? 7 * 24 * 60 * 60 * 1000 : Infinity;

  const grouped = new Map();

  for (const pulse of Array.isArray(pulses) ? pulses : []) {
    const pulseTime = new Date(pulse?.modified || pulse?.created || 0).getTime();
    if (!Number.isNaN(pulseTime) && now - pulseTime > maxAgeMs) {
      continue;
    }

    const cveIds = extractCvesFromPulse(pulse);
    for (const cveId of cveIds) {
      const current = grouped.get(cveId) || {
        cveId,
        title: pulse?.name || cveId,
        summary: pulse?.description || '',
        published: pulse?.created || null,
        lastModified: pulse?.modified || pulse?.created || null,
        latestSeen: pulse?.modified || pulse?.created || null,
        cvssScore: null,
        severity: null,
        hasKev: false,
        otxMentionCount: 0,
        sourceTags: new Set(),
        references: new Set(),
        sourceDetails: {
          otx: [],
        },
      };

      current.otxMentionCount += 1;
      if (!current.summary && pulse?.description) current.summary = pulse.description;
      if (!current.title || current.title === cveId) current.title = pulse?.name || cveId;
      if (!current.published && pulse?.created) current.published = pulse.created;
      if (pulse?.modified && (!current.latestSeen || new Date(pulse.modified) > new Date(current.latestSeen))) {
        current.latestSeen = pulse.modified;
        current.lastModified = pulse.modified;
      }

      const references = extractReferences(pulse);
      references.forEach((reference) => current.references.add(reference));
      if (Array.isArray(pulse?.tags)) {
        pulse.tags.forEach((tag) => {
          if (typeof tag === 'string') current.sourceTags.add(tag);
        });
      }

      current.sourceDetails.otx.push({
        id: pulse?.id || null,
        name: pulse?.name || cveId,
        modified: pulse?.modified || pulse?.created || null,
        author: pulse?.author_name || null,
      });

      grouped.set(cveId, current);
    }
  }

  return Array.from(grouped.values())
    .map((item) => {
      const severity = inferSeverityFromText(`${item.title} ${item.summary} ${Array.from(item.sourceTags).join(' ')}`);
      const cvssScore = severityToScore(severity);
      const push = buildPushAssessment({
        severity,
        otxMentionCount: item.otxMentionCount,
        latestSeen: item.latestSeen,
        hasKev: item.hasKev,
      });

      return {
        cveId: item.cveId,
        title: item.title,
        summary: item.summary || item.cveId,
        published: item.published,
        lastModified: item.lastModified,
        latestSeen: item.latestSeen,
        cvssScore,
        severity,
        hasKev: item.hasKev,
        otxMentionCount: item.otxMentionCount,
        sourceTags: Array.from(item.sourceTags),
        references: Array.from(item.references),
        sourceDetails: item.sourceDetails,
        ...push,
      };
    })
    .sort((a, b) => {
      const aTime = new Date(a.latestSeen || a.lastModified || a.published || 0).getTime();
      const bTime = new Date(b.latestSeen || b.lastModified || b.published || 0).getTime();
      return bTime - aTime || b.pushScore - a.pushScore;
    });
};

const buildCveHaystack = (item) =>
  normalizeText([
    item?.cveId,
    item?.title,
    item?.summary,
    ...(Array.isArray(item?.sourceTags) ? item.sourceTags : []),
    ...(Array.isArray(item?.references) ? item.references : []),
  ].join(' '));

const filterItemsByAssets = (items, assets) => {
  if (!Array.isArray(assets) || assets.length === 0) return items;

  return items.filter((item) => {
    const haystack = buildCveHaystack(item);
    return assets.some((asset) => {
      if (!asset || asset.enabled === false) return false;
      const needle = normalizeText(asset.value);
      return needle.length >= 2 && haystack.includes(needle);
    });
  });
};

const listCveIntelAssetsSafely = async (userEmail) => {
  if (!userEmail) return [];

  try {
    return await listCveIntelAssets(userEmail);
  } catch (error) {
    console.warn('[api/otx/search] failed to load CVE intel assets:', error);
    return [];
  }
};

const buildIndicatorSummary = (type, query, generalPayload, extraSections = {}) => {
  const pulseEntries =
    type === 'cve'
      ? Array.isArray(extraSections.top_n_pulses?.top_n_pulses)
        ? extraSections.top_n_pulses.top_n_pulses
        : []
      : Array.isArray(generalPayload?.pulse_info?.pulses)
        ? generalPayload.pulse_info.pulses
        : [];

  const passiveDns = Array.isArray(extraSections.passive_dns?.passive_dns) ? extraSections.passive_dns.passive_dns : [];
  const urlList = Array.isArray(extraSections.url_list?.url_list) ? extraSections.url_list.url_list : [];
  const malware = Array.isArray(extraSections.malware?.malware) ? extraSections.malware.malware : [];

  const data = {
    indicator:
      generalPayload?.indicator ||
      generalPayload?.indicator_value ||
      generalPayload?.base_indicator?.indicator ||
      String(query || '').trim(),
    type,
    ...generalPayload,
    passive_dns: passiveDns,
    url_list: urlList,
    malware,
    top_n_pulses: type === 'cve' ? pulseEntries : undefined,
    pulse_info: {
      ...(generalPayload?.pulse_info || {}),
      count:
        typeof generalPayload?.pulse_info?.count === 'number'
          ? generalPayload.pulse_info.count
          : pulseEntries.length,
      pulses: type === 'cve' ? undefined : pulseEntries,
    },
    derived: {
      passive_dns_count: passiveDns.length,
      url_count: urlList.length,
      malware_count: malware.length,
      dns_resolutions: passiveDns.length,
      tags:
        type === 'cve'
          ? Array.from(
              new Set(
                pulseEntries.flatMap((pulse) => (Array.isArray(pulse?.tags) ? pulse.tags.filter((tag) => typeof tag === 'string') : []))
              )
            ).slice(0, 12)
          : Array.from(
              new Set(
                pulseEntries.flatMap((pulse) => (Array.isArray(pulse?.tags) ? pulse.tags.filter((tag) => typeof tag === 'string') : []))
              )
            ).slice(0, 12),
      top_level_domains: Array.from(
        new Set(
          passiveDns
            .map((record) => String(record?.hostname || '').toLowerCase().trim())
            .filter(Boolean)
            .map((hostname) => {
              const parts = hostname.split('.');
              return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
            })
        )
      ).slice(0, 8),
    },
    section_states: {
      pulses: {
        status: pulseEntries.length > 0 ? 'success' : 'empty',
        message: pulseEntries.length > 0 ? '' : 'No OTX pulse records found.',
      },
      passive_dns: {
        status: passiveDns.length > 0 ? 'success' : type === 'cve' ? 'not_supported' : 'empty',
        message: type === 'cve' ? 'Passive DNS is not supported for CVE indicators.' : 'No passive DNS records found.',
      },
      url_list: {
        status: urlList.length > 0 ? 'success' : type === 'cve' ? 'not_supported' : 'empty',
        message: type === 'cve' ? 'URL list is not supported for CVE indicators.' : 'No related URLs found.',
      },
      malware: {
        status: malware.length > 0 ? 'success' : type === 'cve' ? 'not_supported' : 'empty',
        message: type === 'cve' ? 'Malware samples are not supported for CVE indicators.' : 'No malware records found.',
      },
      http_scans: {
        status: 'empty',
        message: 'HTTP scans are not currently collected in the lightweight search route.',
      },
    },
  };

  data.__raw = {
    general: generalPayload,
    ...extraSections,
  };

  return data;
};

const handleCveFeedRequest = async (req, res) => {
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 12));
  const windowKey = String(req.query.window || '7d').trim().toLowerCase();
  const noCache = String(req.query.noCache || '').trim().toLowerCase() === '1';
  const userEmail = getCveIntelUserEmail(req);
  const cacheKey = `cve-feed:${limit}:${windowKey}:${userEmail || 'anon'}`;

  if (!noCache) {
    const cached = readCachedValue(cacheKey);
    if (cached) {
      return sendJson(res, 200, {
        success: true,
        ...cached,
        cached: true,
      });
    }
  }

  const activity = await fetchJson(`${OTX_API_BASE}/pulses/activity`, { timeoutMs: 20000 });
  const allItems = buildCveFeedItems(activity?.results || [], windowKey);
  const assets = await listCveIntelAssetsSafely(userEmail);
  const filteredItems = filterItemsByAssets(allItems, assets).slice(0, limit);

  const payload = {
    items: filteredItems,
    meta: {
      totalSignals: filteredItems.length,
      matchedAssetCount: assets.length,
      recommendedCount: filteredItems.filter((item) => item.pushRecommended).length,
      source: 'otx-pulses',
      window: windowKey,
    },
  };

  writeCachedValue(cacheKey, payload);

  return sendJson(res, 200, {
    success: true,
    ...payload,
    cached: false,
  });
};

const handleStructuredSearch = async (req, res) => {
  const type = String(req.query.type || '').trim().toLowerCase();
  const query = String(req.query.query || '').trim();
  const coreOnly = String(req.query.coreOnly || '').trim().toLowerCase() === '1';
  const noCache = String(req.query.noCache || '').trim().toLowerCase() === '1';

  if (!query || !['ip', 'domain', 'url', 'cve'].includes(type)) {
    return sendJson(res, 400, {
      error: 'Invalid Request',
      message: 'type and query are required',
    });
  }

  const cacheKey = `search:${type}:${query}:${coreOnly ? 'core' : 'full'}`;
  if (!noCache) {
    const cached = readCachedValue(cacheKey);
    if (cached) {
      return sendJson(res, 200, {
        source: 'intel-lite',
        cached: true,
        data: cached,
      });
    }
  }

  const sections = [];
  if (type === 'cve') {
    sections.push('general');
    if (!coreOnly) sections.push('top_n_pulses');
  } else {
    sections.push('general');
    if (!coreOnly) {
      sections.push('passive_dns', 'url_list', 'malware');
      if (type === 'domain') sections.push('whois');
    }
  }

  const sectionResults = await Promise.all(
    sections.map(async (section) => {
      const data = await fetchIndicatorSection(type, query, section, {}, { timeoutMs: 18000 });
      return [section, data];
    })
  );

  const extraSections = Object.fromEntries(sectionResults);
  const data = buildIndicatorSummary(type, query, extraSections.general || {}, extraSections);

  writeCachedValue(cacheKey, data);

  return sendJson(res, 200, {
    source: 'intel-lite',
    cached: false,
    noCache,
    coreOnly,
    data,
  });
};

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { success: true });
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, {
      error: 'Method Not Allowed',
      message: 'Only GET requests are allowed for this endpoint',
    });
  }

  try {
    const mode = String(req.query.mode || '').trim().toLowerCase();
    if (mode === 'cve-feed') {
      return await handleCveFeedRequest(req, res);
    }

    return await handleStructuredSearch(req, res);
  } catch (error) {
    console.error('[api/otx/search] failed:', error);
    return sendApiError(res, error, {
      status: 500,
      error: 'Intel Search Failed',
      message: 'Failed to search intelligence source',
    });
  }
}
