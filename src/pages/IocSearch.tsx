import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Bug, Copy, Globe, Link as LinkIcon, Loader2, Radar, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '../lib/utils';
import { otxApi } from '../api/otxApi';

type SearchType = 'ip' | 'domain' | 'url' | 'cve';

type SearchConfig = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  placeholder: string;
};

const SEARCH_TYPES: Record<SearchType, SearchConfig> = {
  ip: { label: 'IP', icon: Radar, placeholder: '输入 IPv4 或 IPv6 地址' },
  domain: { label: '域名', icon: Globe, placeholder: '输入域名，例如 example.com' },
  url: { label: 'URL', icon: LinkIcon, placeholder: '输入完整 URL' },
  cve: { label: 'CVE', icon: Bug, placeholder: '输入 CVE 编号，例如 CVE-2024-3400' },
};

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const IOC_UNAVAILABLE_MESSAGE = 'IOC情报集功能暂时不可用';

const CLOUD_PROVIDER_MATCHERS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Amazon Web Services', pattern: /\bamazon\b|\baws\b/i },
  { label: 'Microsoft Azure', pattern: /\bmicrosoft\b|\bazure\b/i },
  { label: 'Google Cloud', pattern: /\bgoogle\b|\bgcp\b/i },
  { label: 'Cloudflare', pattern: /\bcloudflare\b/i },
  { label: 'Alibaba Cloud', pattern: /\balibaba\b|\baliyun\b/i },
  { label: 'Tencent Cloud', pattern: /\btencent\b/i },
  { label: 'Huawei Cloud', pattern: /\bhuawei\b/i },
  { label: 'Oracle Cloud', pattern: /\boracle\b/i },
  { label: 'DigitalOcean', pattern: /\bdigitalocean\b/i },
  { label: 'Linode', pattern: /\blinode\b/i },
  { label: 'Vultr', pattern: /\bvultr\b/i },
];

const isDisplayableValue = (value: any) => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return !Number.isNaN(value);
  if (typeof value === 'boolean') return true;
  return false;
};

const pickFirstValue = (...values: any[]) => values.find((value) => isDisplayableValue(value));
const toDisplayText = (value: any, fallback = 'N/A') => (isDisplayableValue(value) ? String(value) : fallback);

const getValueAtPath = (source: any, path: string) => {
  if (!source || typeof source !== 'object') return undefined;
  return path.split('.').reduce((current: any, key) => (current && current[key] !== undefined ? current[key] : undefined), source);
};

const pickFirstPath = (source: any, paths: string[], fallback?: any) => {
  const value = pickFirstValue(...paths.map((path) => getValueAtPath(source, path)));
  return value === undefined ? fallback : value;
};

const unwrapPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload || {};
  return payload.general || payload.data || payload.result || payload;
};

const getCollection = (payload: any, key: string) => {
  const collection = pickFirstValue(
    getValueAtPath(payload, key),
    getValueAtPath(payload, 'data'),
    getValueAtPath(payload, `data.${key}`),
    getValueAtPath(payload, `result.${key}`)
  );

  return Array.isArray(collection) ? collection : [];
};

const formatDisplayDate = (value: any) => {
  if (!value || typeof value === 'object') return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('zh-CN');
};

const detectSearchType = (input: string): SearchType | null => {
  const trimmedInput = input.trim();
  if (!trimmedInput) return null;

  const ipRegex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
  const domainRegex = /^(?!:\/\/)([a-zA-Z0-9-_]+\.)*[a-zA-Z0-9][a-zA-Z0-9-_]+\.[a-zA-Z]{2,11}?$/;
  const urlRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,})([/\w .:%?&=+-]*)*\/?$/;
  const cveRegex = /^CVE-\d{4}-\d{4,7}$/i;

  if (ipRegex.test(trimmedInput)) return 'ip';
  if (cveRegex.test(trimmedInput)) return 'cve';
  if (urlRegex.test(trimmedInput) && (trimmedInput.includes('/') || trimmedInput.includes('http'))) return 'url';
  if (domainRegex.test(trimmedInput)) return 'domain';
  return null;
};

const getFriendlyErrorMessage = (error: any) => {
  if (error.message?.includes('401')) return 'OTX 认证失败，请检查后端配置。';
  if (error.message?.includes('404')) return '未找到相关情报。';
  if (error.message?.includes('Empty response') || error.message?.includes('502') || error.message?.includes('503') || error.message?.includes('504') || error.message?.includes('timeout') || error.message?.includes('ETIMEDOUT') || error.message?.includes('ECONNRESET') || error.message?.includes('Network Error')) {
    return IOC_UNAVAILABLE_MESSAGE;
  }
  return error.message || '查询失败，请稍后重试。';
};

const normalizeIpResult = (generalPayload: any, passiveDnsPayload: any, malwarePayload: any, urlListPayload: any) => {
  const general = unwrapPayload(generalPayload);
  const pulseCount = pickFirstPath(general, ['pulse_info.count', 'pulse_info.pulses', 'pulse_count']);

  return {
    ...general,
    indicator: pickFirstPath(general, ['indicator', 'ip', 'address']),
    asn: toDisplayText(pickFirstPath(general, ['asn', 'asn_info.asn', 'geo.asn', 'as_number'])),
    country: toDisplayText(pickFirstPath(general, ['country_name', 'country', 'geo.country_name', 'location.country'])),
    city: toDisplayText(pickFirstPath(general, ['city', 'geo.city', 'location.city'])),
    pulse_info: {
      ...(general?.pulse_info || {}),
      ...(pulseCount !== undefined ? { count: pulseCount } : {}),
    },
    passive_dns: getCollection(passiveDnsPayload, 'passive_dns'),
    malware: getCollection(malwarePayload, 'malware'),
    url_list: getCollection(urlListPayload, 'url_list'),
    __raw: {
      general: generalPayload,
      passive_dns: passiveDnsPayload,
      malware: malwarePayload,
      url_list: urlListPayload,
    },
  };
};

const normalizeDomainResult = (generalPayload: any, passiveDnsPayload: any, whoisPayload: any, malwarePayload: any) => {
  const general = unwrapPayload(generalPayload);
  const pulseCount = pickFirstPath(general, ['pulse_info.count', 'pulse_info.pulses', 'pulse_count']);

  return {
    ...general,
    indicator: pickFirstPath(general, ['indicator', 'domain', 'hostname']),
    pulse_info: {
      ...(general?.pulse_info || {}),
      ...(pulseCount !== undefined ? { count: pulseCount } : {}),
    },
    passive_dns: getCollection(passiveDnsPayload, 'passive_dns'),
    whois: unwrapPayload(whoisPayload) || {},
    malware: getCollection(malwarePayload, 'malware'),
    __raw: {
      general: generalPayload,
      passive_dns: passiveDnsPayload,
      whois: whoisPayload,
      malware: malwarePayload,
    },
  };
};

const normalizeUrlResult = (generalPayload: any, urlListPayload: any) => {
  const general = unwrapPayload(generalPayload);
  const pulseCount = pickFirstPath(general, ['pulse_info.count', 'pulse_info.pulses', 'pulse_count']);

  return {
    ...general,
    indicator: pickFirstPath(general, ['indicator', 'url', 'urlworker.url', 'urlworker.result.url']),
    domain: toDisplayText(pickFirstPath(general, ['domain', 'hostname', 'urlworker.domain', 'urlworker.result.domain'])),
    ip: toDisplayText(pickFirstPath(general, ['ip', 'address', 'urlworker.ip', 'urlworker.result.ip'])),
    pulse_info: {
      ...(general?.pulse_info || {}),
      ...(pulseCount !== undefined ? { count: pulseCount } : {}),
    },
    url_list: getCollection(urlListPayload, 'url_list'),
    __raw: {
      general: generalPayload,
      url_list: urlListPayload,
    },
  };
};

const buildCveResult = (generalPayload: any, pulsesPayload: any) => {
  const general = unwrapPayload(generalPayload);
  const pulseCount = pickFirstPath(general, ['pulse_info.count', 'pulse_info.pulses', 'pulse_count']);

  return {
    ...general,
    indicator: pickFirstPath(general, ['indicator', 'name', 'id', 'cve']),
    base_score: toDisplayText(
      pickFirstPath(general, [
        'base_score',
        'cvss_score',
        'cvss.base_score',
        'cvss.score',
        'cvss.cvssV3.baseScore',
        'cvss.cvss_v3.base_score',
        'cvss3.base_score',
        'cvss3.score',
        'cvss_v3.base_score',
        'cvss_v2.base_score',
        'severity.cvss_v3',
        'severity.cvss_v2',
      ])
    ),
    published: formatDisplayDate(pickFirstPath(general, ['published', 'published_date', 'release_date', 'created', 'modified', 'updated'])),
    description: toDisplayText(pickFirstPath(general, ['description', 'details', 'summary']), ''),
    pulse_info: {
      ...(general?.pulse_info || {}),
      ...(pulseCount !== undefined ? { count: pulseCount } : {}),
    },
    top_n_pulses: getCollection(pulsesPayload, 'top_n_pulses'),
    passive_dns: [],
    malware: [],
    url_list: [],
    __raw: {
      general: generalPayload,
      top_n_pulses: pulsesPayload,
    },
  };
};

void normalizeIpResult;
void normalizeDomainResult;
void normalizeUrlResult;
void buildCveResult;

const getRawReputation = (data: any) =>
  toDisplayText(
    pickFirstValue(
      data?.reputation,
      pickFirstPath(data?.reputation_details, ['reputation', 'reputation_label', 'score']),
      pickFirstPath(data?.__raw?.general, ['reputation', 'reputation_label'])
    )
  );

const getCloudProvider = (data: any) => {
  const asnText = toDisplayText(
    pickFirstValue(
      data?.cloud_provider,
      data?.asn_org,
      data?.asn,
      pickFirstPath(data?.__raw?.general, ['asn', 'asn_info.asn', 'asn_info.name', 'asn_info.organization', 'asn_info.org_name', 'org_name', 'organization'])
    ),
    ''
  );

  if (!asnText) return 'Unknown';
  const matchedProvider = CLOUD_PROVIDER_MATCHERS.find(({ pattern }) => pattern.test(asnText));
  return matchedProvider ? matchedProvider.label : 'Non-cloud / not identified';
};

const getAsnOrganization = (data: any) =>
  toDisplayText(
    pickFirstValue(
      data?.asn_org,
      pickFirstPath(data?.__raw?.general, ['asn_info.name', 'asn_info.organization', 'asn_info.org_name', 'organization', 'org_name'])
    ),
    'Unknown'
  );

const getPulseEntries = (type: SearchType, data: any) => {
  if (!data) return [];
  if (type === 'cve') return Array.isArray(data.top_n_pulses) ? data.top_n_pulses : [];
  return Array.isArray(data.pulse_info?.pulses) ? data.pulse_info.pulses : [];
};

const getTopLevelDomains = (passiveDns: any[]) => {
  const tlds = new Set<string>();

  passiveDns.forEach((record) => {
    const hostname = toDisplayText(record?.hostname, '');
    if (!hostname || !hostname.includes('.')) return;
    const parts = hostname.toLowerCase().split('.');
    const tld = parts.slice(-2).join('.');
    if (tld) tlds.add(tld);
  });

  return Array.from(tlds).slice(0, 8);
};

const getUnifiedTags = (pulseEntries: any[]) => {
  const tags = new Set<string>();

  pulseEntries.forEach((pulse) => {
    if (!Array.isArray(pulse?.tags)) return;
    pulse.tags.forEach((tag: any) => {
      if (isDisplayableValue(tag)) tags.add(String(tag));
    });
  });

  return Array.from(tags).slice(0, 12);
};

const getSectionState = (results: any, key: 'pulses' | 'passive_dns' | 'url_list' | 'malware') =>
  results?.section_states?.[key] || { status: 'unknown', message: '状态未知。' };

const getSectionDisplayValue = (
  results: any,
  key: 'pulses' | 'passive_dns' | 'url_list' | 'malware',
  count: number
) => {
  const state = getSectionState(results, key);
  if (state.status === 'not_supported') return '—';
  return count;
};

const CountMetric = ({ label, value, highlight }: { label: string; value: React.ReactNode; highlight: boolean }) => (
  <div className="flex min-w-[118px] flex-col gap-2 border-l border-white/8 pl-4 first:border-l-0 first:pl-0">
    <span className="text-[11px] uppercase tracking-[0.24em] text-white/42">{label}</span>
    <span className={cn('text-2xl font-semibold tracking-[-0.05em]', highlight ? 'text-accent' : 'text-white')}>
      {value}
    </span>
  </div>
);

const SummaryColumn = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="grid gap-3 border-t border-white/8 py-4 first:border-t-0 first:pt-0 md:grid-cols-[140px_1fr] md:items-start">
    <div className="text-[11px] uppercase tracking-[0.24em] text-white/42">{label}</div>
    <div className="text-sm leading-7 text-white/88">{value}</div>
  </div>
);

const SearchShell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.08),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_18%)]">
    <div className="mx-auto max-w-[1460px] px-5 py-8 sm:px-8 lg:px-12">{children}</div>
  </div>
);

const IocSearch = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryFromUrl = searchParams.get('q')?.trim() || '';

  const [searchQuery, setSearchQuery] = useState(queryFromUrl);
  const [submittedQuery, setSubmittedQuery] = useState(queryFromUrl);
  const [activeSearchType, setActiveSearchType] = useState<SearchType>(() => detectSearchType(queryFromUrl) || 'ip');
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showResults, setShowResults] = useState(Boolean(queryFromUrl));
  const latestSearchIdRef = useRef(0);
  const hasBootstrappedQueryRef = useRef(false);

  const currentConfig = SEARCH_TYPES[activeSearchType];

  useEffect(() => {
    setSearchQuery(queryFromUrl);
    if (!queryFromUrl) {
      setResults(null);
      setSubmittedQuery('');
      setShowResults(false);
      setError('');
      hasBootstrappedQueryRef.current = false;
      return;
    }

    const detectedType = detectSearchType(queryFromUrl);
    if (detectedType) setActiveSearchType(detectedType);
  }, [queryFromUrl]);

  const executeSearch = async (query: string, type: SearchType) => {
    const response = await otxApi.searchIntel(query, type);
    return response?.data || null;
  };

  const runSearch = async (query: string, type: SearchType, retryCount = 0) => {
    if (!query || loading) return;

    const requestId = Date.now();
    latestSearchIdRef.current = requestId;
    setLoading(true);
    setError('');

    try {
      const data = await executeSearch(query, type);
      if (latestSearchIdRef.current !== requestId) return;

      setResults(data);
      setSubmittedQuery(query);
      setActiveSearchType(type);
      setShowResults(true);
    } catch (searchError: any) {
      const shouldRetry =
        (
          searchError.message?.includes('Empty response') ||
          searchError.message?.includes('502') ||
          searchError.message?.includes('503') ||
          searchError.message?.includes('504') ||
          searchError.message?.includes('timeout') ||
          searchError.message?.includes('ETIMEDOUT') ||
          searchError.message?.includes('ECONNRESET') ||
          searchError.message?.includes('Network Error')
        ) &&
        retryCount < MAX_RETRIES;

      if (shouldRetry) {
        window.setTimeout(() => {
          void runSearch(query, type, retryCount + 1);
        }, RETRY_DELAY);
        return;
      }

      setResults(null);
      setShowResults(false);
      setError(getFriendlyErrorMessage(searchError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!queryFromUrl) return;
    if (hasBootstrappedQueryRef.current && queryFromUrl === submittedQuery) return;

    const detectedType = detectSearchType(queryFromUrl);
    if (!detectedType) {
      setResults(null);
      setShowResults(false);
      setError('请输入有效的 IP、域名、URL 或 CVE。');
      return;
    }

    hasBootstrappedQueryRef.current = true;
    void runSearch(queryFromUrl, detectedType);
  }, [queryFromUrl, submittedQuery]);

  const pulseEntries = useMemo(() => getPulseEntries(activeSearchType, results), [activeSearchType, results]);
  const topLevelDomains = useMemo(() => getTopLevelDomains(results?.passive_dns || []), [results?.passive_dns]);
  const unifiedTags = useMemo(() => getUnifiedTags(pulseEntries), [pulseEntries]);
  const pulsesState = getSectionState(results, 'pulses');
  const passiveDnsState = getSectionState(results, 'passive_dns');
  const urlListState = getSectionState(results, 'url_list');
  const malwareState = getSectionState(results, 'malware');
  const displaySummaryColumns = useMemo(() => {
    if (!results) return [];

    const dnsResolutions = typeof results?.derived?.dns_resolutions === 'number' ? `${results.derived.dns_resolutions} 条` : '0';
    const classification = activeSearchType === 'cve' ? 'Vulnerability Intelligence' : `${currentConfig.label} Intelligence`;

    return [
      { label: '分类', value: classification },
      { label: '地点', value: [toDisplayText(results.country, ''), toDisplayText(results.city, '')].filter(Boolean).join(' / ') || 'N/A' },
      { label: 'ASN', value: activeSearchType === 'ip' ? `${toDisplayText(results.asn)} / ${getAsnOrganization(results)} / ${getCloudProvider(results)}` : 'N/A' },
      { label: 'DNS Resolutions', value: dnsResolutions },
      { label: 'Top Level Domains', value: results?.derived?.top_level_domains?.length > 0 ? results.derived.top_level_domains.join(', ') : passiveDnsState.status === 'not_supported' ? 'Not Supported' : 'N/A' },
      { label: '标签', value: results?.derived?.tags?.length > 0 ? results.derived.tags.join(' / ') : unifiedTags.length > 0 ? unifiedTags.join(' / ') : 'N/A' },
    ];
  }, [activeSearchType, currentConfig.label, passiveDnsState.status, results, unifiedTags]);

  const summaryColumns = useMemo(() => {
    if (!results) return [];

    const dnsResolutions = typeof results?.derived?.dns_resolutions === 'number' ? `${results.derived.dns_resolutions} 条` : '0';
    const classification = activeSearchType === 'cve' ? 'Vulnerability Intelligence' : `${currentConfig.label} Intelligence`;

    return [
      { label: '分类', value: classification },
      { label: '地点', value: [toDisplayText(results.country, ''), toDisplayText(results.city, '')].filter(Boolean).join(' / ') || 'N/A' },
      { label: 'ASN', value: activeSearchType === 'ip' ? `${toDisplayText(results.asn)} / ${getAsnOrganization(results)} / ${getCloudProvider(results)}` : 'N/A' },
      { label: 'DNS Resolutions', value: dnsResolutions },
      { label: 'Top Level Domains', value: results?.derived?.top_level_domains?.length > 0 ? results.derived.top_level_domains.join(', ') : passiveDnsState.status === 'not_supported' ? 'Not Supported' : 'N/A' },
      { label: '标签', value: results?.derived?.tags?.length > 0 ? results.derived.tags.join(' · ') : unifiedTags.length > 0 ? unifiedTags.join(' · ') : 'N/A' },
    ];
  }, [activeSearchType, currentConfig.label, results, topLevelDomains, unifiedTags]);

  void summaryColumns;

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    const detectedType = detectSearchType(query);
    if (!detectedType) {
      setError('请输入有效的 IP、域名、URL 或 CVE。');
      return;
    }

    setError('');
    navigate(`/dns?q=${encodeURIComponent(query)}`);
  };

  const handleCopy = async () => {
    if (!submittedQuery) return;

    try {
      await navigator.clipboard.writeText(submittedQuery);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const heroPlaceholder = currentConfig.placeholder;

  if (!showResults && !queryFromUrl) {
    return (
      <SearchShell>
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-[40px] border border-white/8 bg-[linear-gradient(180deg,rgba(12,18,28,0.95),rgba(9,12,18,0.92))] px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(168,85,247,0.12),transparent_28%),radial-gradient(circle_at_88%_0%,rgba(168,85,247,0.08),transparent_26%),linear-gradient(90deg,transparent,rgba(255,255,255,0.02),transparent)]" />
          <div className="relative mx-auto flex max-w-[980px] flex-col items-start gap-8">
            <div className="space-y-4">
              <p className="text-[11px] uppercase tracking-[0.34em] text-accent/78">Threat Intelligence Search</p>
              <h1 className="max-w-[760px] text-4xl font-semibold tracking-[-0.08em] text-white sm:text-5xl lg:text-6xl">
                用一个搜索框，直接进入 IOC 情报结果页。
              </h1>
              <p className="max-w-[680px] text-sm leading-8 text-white/58 sm:text-base">
                输入 IP、域名、URL 或 CVE。系统将自动识别目标类型，并进入新的结果视图展示结构化情报。
              </p>
            </div>

            <form onSubmit={handleSubmit} className="w-full">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                <label className="group flex min-h-[86px] items-center gap-4 rounded-[28px] border border-white/10 bg-white/[0.03] px-6 transition-colors focus-within:border-accent/30">
                  <Search className="h-5 w-5 shrink-0 text-accent/82" />
                  <input
                    value={searchQuery}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSearchQuery(value);
                      const detectedType = detectSearchType(value);
                      if (detectedType) setActiveSearchType(detectedType);
                    }}
                    placeholder={heroPlaceholder}
                    className="min-w-0 flex-1 bg-transparent text-lg text-white outline-none placeholder:text-white/26"
                  />
                  <span className="hidden rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/45 md:inline-flex">
                    {currentConfig.label}
                  </span>
                </label>
                <button
                  type="submit"
                  className="inline-flex min-h-[86px] items-center justify-center gap-3 rounded-[28px] bg-accent px-8 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
                >
                  开始检索
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>

            {error && (
              <div className="flex items-start gap-3 rounded-[22px] border border-red-500/18 bg-red-500/8 px-5 py-4 text-sm text-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </motion.section>
      </SearchShell>
    );
  }

  return (
    <SearchShell>
      <div className="space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="grid gap-5 xl:grid-cols-[360px_1fr]"
        >
          <div className="overflow-hidden rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,20,29,0.96),rgba(10,13,19,0.94))] p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-[0.34em] text-white/38">Query</p>
                <h2 className="break-all text-2xl font-semibold tracking-[-0.06em] text-white">{submittedQuery || queryFromUrl}</h2>
                <p className="text-sm text-white/48">Overview</p>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm text-white/76 transition-colors hover:border-accent/25 hover:text-white"
              >
                <Copy className="h-4 w-4" />
                {copied ? '已复制' : '复制'}
              </button>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="overflow-hidden rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,20,29,0.96),rgba(10,13,19,0.94))] p-4 sm:p-5"
          >
            <div className="flex min-h-[92px] items-center gap-4 rounded-[28px] border border-white/10 bg-white/[0.03] px-5">
              <Search className="h-5 w-5 shrink-0 text-accent/82" />
              <input
                value={searchQuery}
                onChange={(event) => {
                  const value = event.target.value;
                  setSearchQuery(value);
                  const detectedType = detectSearchType(value);
                  if (detectedType) setActiveSearchType(detectedType);
                }}
                placeholder={currentConfig.placeholder}
                className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/28 sm:text-lg"
              />
              <span className="hidden rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/45 md:inline-flex">
                {currentConfig.label}
              </span>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-70"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                搜索
              </button>
            </div>
          </form>
        </motion.section>

        {error && (
          <div className="flex items-start gap-3 rounded-[22px] border border-red-500/18 bg-red-500/8 px-5 py-4 text-sm text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && !results ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-[36px] border border-white/8 bg-[#0d1219]/90">
            <div className="flex items-center gap-3 text-sm text-white/62">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
              正在加载情报结果
            </div>
          </div>
        ) : results ? (
          <>
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.04 }}
              className="overflow-hidden rounded-[36px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,19,28,0.96),rgba(8,12,18,0.96))] px-6 py-6 sm:px-8"
            >
              <div className="flex flex-wrap gap-5">
                <CountMetric label="Pulses" value={getSectionDisplayValue(results, 'pulses', pulseEntries.length)} highlight={pulsesState.status === 'success' && pulseEntries.length > 0} />
                <CountMetric label="被动 DNS" value={getSectionDisplayValue(results, 'passive_dns', results.passive_dns?.length ?? 0)} highlight={passiveDnsState.status === 'success' && (results.passive_dns?.length ?? 0) > 0} />
                <CountMetric label="URLs" value={getSectionDisplayValue(results, 'url_list', results.url_list?.length ?? 0)} highlight={urlListState.status === 'success' && (results.url_list?.length ?? 0) > 0} />
                <CountMetric label="Malware" value={getSectionDisplayValue(results, 'malware', results.malware?.length ?? 0)} highlight={malwareState.status === 'success' && (results.malware?.length ?? 0) > 0} />
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
              className="overflow-hidden rounded-[36px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,19,28,0.96),rgba(8,12,18,0.96))] px-6 py-6 sm:px-8"
            >
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.34em] text-white/38">Analysis Overview</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-[-0.06em] text-white">分析概述</h3>
                </div>
                <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-white/56">
                  Reputation: <span className="text-white/86">{getRawReputation(results)}</span>
                </div>
              </div>

              <div className="grid gap-x-10 gap-y-3 xl:grid-cols-2">
                {displaySummaryColumns.map((item) => (
                  <SummaryColumn key={item.label} label={item.label} value={item.value} />
                ))}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
              className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]"
            >
              <div className="overflow-hidden rounded-[36px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,19,28,0.96),rgba(8,12,18,0.96))]">
                <div className="border-b border-white/8 px-6 py-5 sm:px-8">
                  <p className="text-[11px] uppercase tracking-[0.34em] text-white/38">Passive DNS</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-[-0.06em] text-white">被动 DNS</h3>
                </div>
                <div className="max-h-[920px] overflow-auto px-6 py-5 sm:px-8">
                  {results.passive_dns?.length > 0 ? (
                    <div className="space-y-3">
                      {results.passive_dns.map((record: any, index: number) => (
                        <div key={`${record?.hostname || 'pdns'}-${index}`} className="grid gap-3 border-b border-white/6 py-4 last:border-b-0">
                          <div className="text-sm font-semibold text-white/88">{toDisplayText(record?.hostname)}</div>
                          <div className="grid gap-2 text-sm text-white/58 sm:grid-cols-3">
                            <span>Type: {toDisplayText(record?.type)}</span>
                            <span>First Seen: {toDisplayText(record?.first)}</span>
                            <span>Last Seen: {toDisplayText(record?.last)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-white/10 px-5 py-8 text-sm text-white/52">
                      {passiveDnsState.message}
                    </div>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-[36px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,19,28,0.96),rgba(8,12,18,0.96))]">
                <div className="border-b border-white/8 px-6 py-5 sm:px-8">
                  <p className="text-[11px] uppercase tracking-[0.34em] text-white/38">Pulses</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-[-0.06em] text-white">关联情报详细</h3>
                </div>
                <div className="max-h-[920px] overflow-auto px-6 py-5 sm:px-8">
                  {pulseEntries.length > 0 ? (
                    <div className="space-y-5">
                      {pulseEntries.map((pulse: any, index: number) => {
                        const tags = Array.isArray(pulse?.tags) ? pulse.tags.filter((tag: any) => isDisplayableValue(tag)) : [];

                        return (
                          <article key={`${pulse?.id || pulse?.name || 'pulse'}-${index}`} className="border-b border-white/6 pb-5 last:border-b-0 last:pb-0">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <h4 className="text-lg font-semibold tracking-[-0.04em] text-white">
                                  {toDisplayText(pulse?.name, '未命名情报')}
                                </h4>
                                <p className="mt-3 text-sm leading-7 text-white/66">
                                  {toDisplayText(pulse?.description, '暂无描述')}
                                </p>
                              </div>
                              <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/50">
                                {toDisplayText(pulse?.TLP, 'TLP N/A')}
                              </span>
                            </div>

                            <div className="mt-4 grid gap-3 text-sm text-white/58 sm:grid-cols-3">
                              <span>Author: {toDisplayText(pulse?.author?.username || pulse?.author_name, '未知来源')}</span>
                              <span>Modified: {formatDisplayDate(pulse?.modified)}</span>
                              <span>Indicators: {toDisplayText(pulse?.indicator_count)}</span>
                            </div>

                            {tags.length > 0 && (
                              <div className="mt-4 flex flex-wrap gap-2">
                                {tags.map((tag: string, tagIndex: number) => (
                                  <span key={`${tag}-${tagIndex}`} className="rounded-full border border-accent/15 bg-accent/10 px-3 py-1 text-xs text-accent">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-white/10 px-5 py-8 text-sm text-white/52">
                      {pulsesState.message}
                    </div>
                  )}
                </div>
              </div>
            </motion.section>
          </>
        ) : null}
      </div>
    </SearchShell>
  );
};

export default IocSearch;
