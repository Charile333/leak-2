const OTX_UPSTREAM_URL = 'https://otx.alienvault.com/api/v1';

const otxSearchCache = globalThis.__otxSearchCache || new Map();
globalThis.__otxSearchCache = otxSearchCache;

const OTX_SEARCH_CACHE_TTL = 10 * 60 * 1000;

export const applyCors = (res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-API-Key'
  );
};

export const sendJson = (res, status, data) => {
  res.setHeader('Content-Type', 'application/json');
  return res.status(status).json(data);
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

const requestOtxSection = async (endpoint) => {
  const apiKey = process.env.OTX_API_KEY || process.env.VITE_OTX_API_KEY;
  if (!apiKey) {
    throw new Error('OTX_API_KEY is not configured');
  }

  const response = await fetch(`${OTX_UPSTREAM_URL}${endpoint}`, {
    headers: {
      'X-OTX-API-KEY': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'Lysir-Security-Platform/1.0',
    },
  });

  if (response.status === 404) return {};
  if (!response.ok) throw new Error(`OTX request failed: ${response.status}`);
  return response.json();
};

export const buildStructuredOtxResult = async (type, query) => {
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
};

const classifySeverity = (term, text) => {
  const haystack = `${term} ${text}`.toLowerCase();
  if (/(api[_-]?key|secret|token|password|passwd|postgres:\/\/|mysql:\/\/|private[_-]?key|access[_-]?key)/.test(haystack)) return 'critical';
  if (/(prod|production|internal|admin|credential|db_|jdbc|redis|akia|ghp_)/.test(haystack)) return 'high';
  if (/(config|env|tenant|repo|mirror|backup)/.test(haystack)) return 'medium';
  return 'low';
};

const classifyExposure = (term, text) => {
  const haystack = `${term} ${text}`.toLowerCase();
  if (/(api[_-]?key|secret|token|private[_-]?key|access[_-]?key)/.test(haystack)) return 'secret';
  if (/(password|credential|jdbc|postgres:\/\/|mysql:\/\/|redis)/.test(haystack)) return 'credential';
  if (/(env|config|tfvars|yaml|yml|ini|properties)/.test(haystack)) return 'config';
  if (/(mirror|repo|repository|backup|fork)/.test(haystack)) return 'repository';
  return 'source';
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
      findings.push({
        id: `github-repo-${item.id}-${term}`,
        assetLabel: term,
        severity: classifySeverity(term, item.description || ''),
        status: 'new',
        source: 'GitHub',
        exposure: classifyExposure(term, `${item.name} ${item.description || ''}`),
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
        confidence: 0.58,
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

      findings.push({
        id: `github-code-${item.sha || item.url}-${term}`,
        assetLabel: term,
        severity: classifySeverity(term, textMatch),
        status: 'new',
        source: 'GitHub',
        exposure: classifyExposure(term, `${item.path || ''} ${textMatch}`),
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
        confidence: 0.84,
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
      findings.push({
        id: `gitee-repo-${item.id}-${term}`,
        assetLabel: term,
        severity: classifySeverity(term, item.description || ''),
        status: 'new',
        source: 'Gitee',
        exposure: classifyExposure(term, `${item.full_name || ''} ${item.description || ''}`),
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
        confidence: 0.54,
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
