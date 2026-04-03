import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Bug, Globe, Link as LinkIcon, Loader2, Radar, Search, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { otxApi } from '../api/otxApi';

type SearchType = 'ip' | 'domain' | 'url' | 'cve';

const PASSIVE_DNS_PAGE_SIZE = 25;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const IOC_UNAVAILABLE_MESSAGE = 'IOC 情报集功能暂时不可用';

const SEARCH_TYPES: Record<SearchType, { label: string; title: string; placeholder: string; example: string; helper: string; icon: React.ComponentType<{ className?: string }> }> = {
  ip: { label: 'IP', title: 'IP 威胁画像', placeholder: '输入 IPv4 或 IPv6 地址', example: '8.8.8.8', helper: '适合排查攻击源、异常外联和告警回溯。', icon: Radar },
  domain: { label: '域名', title: '域名情报', placeholder: '输入域名，如 example.com', example: 'openai.com', helper: '适合研判仿冒、钓鱼与可疑资产。', icon: Globe },
  url: { label: 'URL', title: 'URL 检测', placeholder: '输入完整 URL', example: 'https://example.com/login', helper: '适合处理投递链接和落地页分析。', icon: LinkIcon },
  cve: { label: 'CVE', title: '漏洞情报', placeholder: '输入 CVE 编号，如 CVE-2024-3400', example: 'CVE-2024-3400', helper: '适合追踪高危漏洞与活跃利用。', icon: Bug },
};

const isDisplayableValue = (value: any) => {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return true;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return !Number.isNaN(value);
  if (typeof value === 'boolean') return true;
  if (typeof value === 'object') return true;
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
  const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
  const domainRegex = /^(?!:\/\/)([a-zA-Z0-9-_]+\.)*[a-zA-Z0-9][a-zA-Z0-9-_]+\.[a-zA-Z]{2,11}?$/;
  const urlRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,})([/\w .:%?&=+-]*)*\/?$/;
  const cveRegex = /^CVE-\d{4}-\d{4,7}$/i;
  if (ipRegex.test(trimmedInput)) return 'ip';
  if (cveRegex.test(trimmedInput)) return 'cve';
  if (urlRegex.test(trimmedInput) && (trimmedInput.includes('/') || trimmedInput.includes('http'))) return 'url';
  if (domainRegex.test(trimmedInput)) return 'domain';
  return null;
};

const normalizeIpResult = (generalPayload: any, passiveDnsPayload: any, malwarePayload: any, urlListPayload: any, searchQuery: string) => {
  const general = unwrapPayload(generalPayload);
  const pulseCount = pickFirstPath(general, ['pulse_info.count', 'pulse_info.pulses', 'pulse_count'], 0);

  return {
    ...general,
    indicator: toDisplayText(pickFirstPath(general, ['indicator', 'ip', 'address', 'general.indicator'], searchQuery)),
    asn: toDisplayText(pickFirstPath(general, ['asn', 'asn_info.asn', 'geo.asn', 'as_number'])),
    country: toDisplayText(pickFirstPath(general, ['country_name', 'country', 'geo.country_name', 'geo.country', 'location.country'])),
    city: toDisplayText(pickFirstPath(general, ['city', 'geo.city', 'location.city'])),
    reputation: toDisplayText(pickFirstPath(general, ['reputation', 'reputation_label'], pulseCount > 0 ? '恶意' : '中立')),
    pulse_info: {
      ...(general?.pulse_info || {}),
      count: Number(pulseCount) || 0,
    },
    passive_dns: getCollection(passiveDnsPayload, 'passive_dns'),
    malware: getCollection(malwarePayload, 'malware'),
    url_list: getCollection(urlListPayload, 'url_list'),
  };
};

const normalizeDomainResult = (generalPayload: any, passiveDnsPayload: any, whoisPayload: any, malwarePayload: any, searchQuery: string) => {
  const general = unwrapPayload(generalPayload);
  const pulseCount = pickFirstPath(general, ['pulse_info.count', 'pulse_info.pulses', 'pulse_count'], 0);

  return {
    ...general,
    indicator: toDisplayText(pickFirstPath(general, ['indicator', 'domain', 'hostname'], searchQuery)),
    reputation: toDisplayText(pickFirstPath(general, ['reputation', 'reputation_label'], pulseCount > 0 ? '恶意' : '中立')),
    pulse_info: {
      ...(general?.pulse_info || {}),
      count: Number(pulseCount) || 0,
    },
    passive_dns: getCollection(passiveDnsPayload, 'passive_dns'),
    whois: unwrapPayload(whoisPayload) || {},
    malware: getCollection(malwarePayload, 'malware'),
  };
};

const normalizeUrlResult = (generalPayload: any, urlListPayload: any, searchQuery: string) => {
  const general = unwrapPayload(generalPayload);
  const pulseCount = pickFirstPath(general, ['pulse_info.count', 'pulse_info.pulses', 'pulse_count'], 0);

  return {
    ...general,
    indicator: toDisplayText(pickFirstPath(general, ['indicator', 'url', 'urlworker.url', 'urlworker.result.url'], searchQuery)),
    domain: toDisplayText(pickFirstPath(general, ['domain', 'hostname', 'urlworker.domain', 'urlworker.result.domain'])),
    ip: toDisplayText(pickFirstPath(general, ['ip', 'address', 'urlworker.ip', 'urlworker.result.ip'])),
    reputation: toDisplayText(pickFirstPath(general, ['reputation', 'reputation_label'], pulseCount > 0 ? '恶意' : '中立')),
    pulse_info: {
      ...(general?.pulse_info || {}),
      count: Number(pulseCount) || 0,
    },
    url_list: getCollection(urlListPayload, 'url_list'),
  };
};

const buildCveResult = (generalPayload: any, pulsesPayload: any, searchQuery: string) => {
  const general = unwrapPayload(generalPayload);
  const pulseCount = pickFirstPath(general, ['pulse_info.count', 'pulse_info.pulses', 'pulse_count'], 0);

  return {
    ...general,
    indicator: toDisplayText(pickFirstPath(general, ['indicator', 'name', 'id', 'cve'], searchQuery.toUpperCase())),
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
    published: formatDisplayDate(
      pickFirstPath(general, ['published', 'published_date', 'release_date', 'created', 'modified', 'updated'])
    ),
    description: toDisplayText(pickFirstPath(general, ['description', 'details', 'summary']), ''),
    pulse_info: {
      ...(general?.pulse_info || {}),
      count: Number(pulseCount) || 0,
    },
    top_n_pulses: getCollection(pulsesPayload, 'top_n_pulses'),
  };
};

const getFriendlyErrorMessage = (error: any) => {
  if (error.message?.includes('401')) return 'API 认证失败，请检查 OTX 配置。';
  if (error.message?.includes('404')) return '未找到相关威胁情报。';
  if (error.message?.includes('Empty response') || error.message?.includes('502') || error.message?.includes('timeout') || error.message?.includes('ETIMEDOUT') || error.message?.includes('ECONNRESET') || error.message?.includes('Network Error')) return IOC_UNAVAILABLE_MESSAGE;
  return error.message || '查询失败，请稍后重试。';
};

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="overflow-hidden rounded-[28px] border border-white/8 bg-[#11141c]/82 backdrop-blur-2xl">
    <div className="border-b border-white/6 px-6 py-4"><h3 className="text-base font-semibold text-white">{title}</h3></div>
    <div className="px-6 py-6">{children}</div>
  </section>
);

const EmptyState = ({ text }: { text: string }) => (
  <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-sm text-white/55">
    {text}
  </div>
);

const getResultStatus = (type: SearchType, data: any) => {
  const hasThreatContext = Boolean(data?.pulse_info?.count) || Boolean(data?.malware?.length) || Boolean(data?.url_list?.length);
  if (type === 'cve') {
    const score = Number(data?.base_score);
    if (!Number.isNaN(score) && score >= 7) return { label: '威胁', tone: 'threat' as const };
    if (hasThreatContext) return { label: '中立', tone: 'neutral' as const };
    return { label: '安全', tone: 'safe' as const };
  }
  if (hasThreatContext) return { label: '威胁', tone: 'threat' as const };
  if (data?.indicator || data?.domain || data?.ip) return { label: '中立', tone: 'neutral' as const };
  return { label: '安全', tone: 'safe' as const };
};

const getPrimaryValue = (type: SearchType, data: any) => {
  if (type === 'domain') return toDisplayText(data?.indicator);
  if (type === 'url') return toDisplayText(data?.indicator);
  if (type === 'cve') return toDisplayText(data?.indicator);
  return toDisplayText(data?.indicator);
};

const getResultStats = (type: SearchType, data: any) => {
  if (type === 'ip') {
    return [
      ['Pulse', toDisplayText(data?.pulse_info?.count || 0)],
      ['Passive DNS', toDisplayText(data?.passive_dns?.length || 0)],
      ['Malware', toDisplayText(data?.malware?.length || 0)],
      ['URLs', toDisplayText(data?.url_list?.length || 0)],
    ];
  }
  if (type === 'domain') {
    return [
      ['Pulse', toDisplayText(data?.pulse_info?.count || 0)],
      ['Passive DNS', toDisplayText(data?.passive_dns?.length || 0)],
      ['Malware', toDisplayText(data?.malware?.length || 0)],
      ['WHOIS', data?.whois && Object.keys(data.whois).length > 0 ? 'Yes' : 'No'],
    ];
  }
  if (type === 'url') {
    return [
      ['Pulse', toDisplayText(data?.pulse_info?.count || 0)],
      ['Domain', toDisplayText(data?.domain)],
      ['IP', toDisplayText(data?.ip)],
      ['URLs', toDisplayText(data?.url_list?.length || 0)],
    ];
  }
  return [
    ['CVSS', toDisplayText(data?.base_score)],
    ['Published', toDisplayText(data?.published)],
    ['Pulse', toDisplayText(data?.top_n_pulses?.length || 0)],
    ['Intel', Boolean(data?.description) ? 'Yes' : 'No'],
  ];
};

const IocSearch = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [activeSearchType, setActiveSearchType] = useState<SearchType>('ip');
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [passiveDnsPage, setPassiveDnsPage] = useState(1);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const config = SEARCH_TYPES[activeSearchType];
  const passiveDnsRecords = results?.passive_dns || [];
  const passiveDnsPages = Math.max(1, Math.ceil(passiveDnsRecords.length / PASSIVE_DNS_PAGE_SIZE));
  const passiveDnsSlice = passiveDnsRecords.slice((passiveDnsPage - 1) * PASSIVE_DNS_PAGE_SIZE, passiveDnsPage * PASSIVE_DNS_PAGE_SIZE);
  const resultStatus = results ? getResultStatus(activeSearchType, results) : null;
  const resultStats = results ? getResultStats(activeSearchType, results) : [];

  const overviewMetrics = useMemo(() => {
    if (!results) return [];
    if (activeSearchType === 'ip') return [['IP 地址', toDisplayText(results.indicator)], ['ASN 归属', toDisplayText(results.asn)], ['地理位置', `${toDisplayText(results.country)} ${results.city || ''}`.trim()], ['信誉研判', toDisplayText(results.reputation || (results.pulse_info?.count > 0 ? '恶意' : '中立'))]];
    if (activeSearchType === 'domain') return [['域名', toDisplayText(results.indicator)], ['情报数量', toDisplayText(results.pulse_info?.count || 0)], ['信誉研判', toDisplayText(results.reputation || (results.pulse_info?.count > 0 ? '恶意' : '中立'))], ['注册状态', results.whois?.registrar ? '已注册' : '未知']];
    if (activeSearchType === 'url') return [['URL', toDisplayText(results.indicator)], ['域名', toDisplayText(results.domain)], ['IP 地址', toDisplayText(results.ip)], ['信誉研判', toDisplayText(results.reputation || (results.pulse_info?.count > 0 ? '恶意' : '中立'))]];
    return [['CVE 编号', toDisplayText(results.indicator)], ['CVSS 评分', toDisplayText(results.base_score)], ['发布日期', toDisplayText(results.published)], ['威胁等级', results.pulse_info?.count > 0 ? '高' : '中']];
  }, [activeSearchType, results]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchQuery(value);
    const detectedType = detectSearchType(value);
    if (detectedType) setActiveSearchType(detectedType);
  };

  const runSearch = async (query: string, type: SearchType) => {
    if (type === 'ip') {
      const isIpv6 = query.includes(':');
      const [general, passiveDns, malware, urlList] = await Promise.all([otxApi.getIpInfo(query, 'general', isIpv6), otxApi.getIpInfo(query, 'passive_dns', isIpv6), otxApi.getIpInfo(query, 'malware', isIpv6), otxApi.getIpInfo(query, 'url_list', isIpv6)]);
      return { ...general, passive_dns: passiveDns?.passive_dns || [], malware: malware?.malware || [], url_list: urlList?.url_list || [], country: general?.country_name || general?.country || 'N/A', city: general?.city || 'N/A', reputation: general?.reputation || (general?.pulse_info?.count > 0 ? '恶意' : '中立') };
    }
    if (type === 'domain') {
      const [general, passiveDns, whois, malware] = await Promise.all([otxApi.getDomainInfo(query, 'general'), otxApi.getDomainInfo(query, 'passive_dns'), otxApi.getDomainInfo(query, 'whois'), otxApi.getDomainInfo(query, 'malware')]);
      return { ...general, passive_dns: passiveDns?.passive_dns || [], whois: whois || {}, malware: malware?.malware || [] };
    }
    if (type === 'url') {
      const [general, urlList] = await Promise.all([otxApi.getUrlInfo(query, 'general'), otxApi.getUrlInfo(query, 'url_list')]);
      return { ...general, url_list: urlList?.url_list || [] };
    }
    const [general, pulses] = await Promise.all([otxApi.getCveInfo(query, 'general'), otxApi.getCveInfo(query, 'top_n_pulses')]);
    return buildCveResult(general, pulses, query);
  };

  void runSearch;

  const executeSearch = async (query: string, type: SearchType) => {
    if (type === 'ip') {
      const isIpv6 = query.includes(':');
      const [general, passiveDns, malware, urlList] = await Promise.all([
        otxApi.getIpInfo(query, 'general', isIpv6),
        otxApi.getIpInfo(query, 'passive_dns', isIpv6),
        otxApi.getIpInfo(query, 'malware', isIpv6),
        otxApi.getIpInfo(query, 'url_list', isIpv6),
      ]);
      return normalizeIpResult(general, passiveDns, malware, urlList, query);
    }
    if (type === 'domain') {
      const [general, passiveDns, whois, malware] = await Promise.all([
        otxApi.getDomainInfo(query, 'general'),
        otxApi.getDomainInfo(query, 'passive_dns'),
        otxApi.getDomainInfo(query, 'whois'),
        otxApi.getDomainInfo(query, 'malware'),
      ]);
      return normalizeDomainResult(general, passiveDns, whois, malware, query);
    }
    if (type === 'url') {
      const [general, urlList] = await Promise.all([
        otxApi.getUrlInfo(query, 'general'),
        otxApi.getUrlInfo(query, 'url_list'),
      ]);
      return normalizeUrlResult(general, urlList, query);
    }
    const [general, pulses] = await Promise.all([
      otxApi.getCveInfo(query, 'general'),
      otxApi.getCveInfo(query, 'top_n_pulses'),
    ]);
    return buildCveResult(general, pulses, query);
  };

  const handleSearch = async (event?: React.FormEvent, retryCount = 0) => {
    event?.preventDefault();
    const query = searchQuery.trim();
    if (!query || loading) return;
    setLoading(true);
    setError('');
    setPassiveDnsPage(1);
    try {
      const data = await executeSearch(query, activeSearchType);
      setResults(data);
      setSubmittedQuery(query);
      setShowResults(true);
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (searchError: any) {
      const shouldRetry = (searchError.message?.includes('Empty response') || searchError.message?.includes('502') || searchError.message?.includes('timeout') || searchError.message?.includes('ETIMEDOUT') || searchError.message?.includes('ECONNRESET')) && retryCount < MAX_RETRIES;
      if (shouldRetry) {
        window.setTimeout(() => handleSearch(undefined, retryCount + 1), RETRY_DELAY);
        return;
      }
      setShowResults(false);
      setError(getFriendlyErrorMessage(searchError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="relative overflow-hidden rounded-[36px] border border-white/8 bg-[#0a0f16] px-5 py-6 shadow-[0_30px_120px_rgba(0,0,0,0.28)] sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.16),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_24%)]" />
        <div className="relative z-10">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">Threat Intel Search</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/56">Focused Workflow</span>
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-white/56">当前模式: <span className="text-white/88">{config.label}</span></div>
          </div>

          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-white sm:text-3xl lg:text-4xl">直接开始检索</h1>
          <p className="mt-3 text-sm leading-7 text-white/58 sm:text-base">选择类型，输入目标，立即查看结果。</p>

          <form onSubmit={handleSearch} className="mt-6 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {(Object.keys(SEARCH_TYPES) as SearchType[]).map((type) => {
                const item = SEARCH_TYPES[type];
                const Icon = item.icon;
                return (
                  <button key={type} type="button" onClick={() => setActiveSearchType(type)} className={cn('rounded-[24px] border px-4 py-4 text-left transition-all duration-300', activeSearchType === type ? 'border-accent/30 bg-accent/[0.12] shadow-[0_14px_40px_rgba(168,85,247,0.12)]' : 'border-white/8 bg-white/[0.03] hover:border-white/14 hover:bg-white/[0.05]')}>
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-accent"><Icon className="h-5 w-5" /></div>
                      <span className="text-[10px] uppercase tracking-[0.24em] text-white/42">{item.label}</span>
                    </div>
                    <p className="text-base font-semibold text-white">{item.title}</p>
                    <p className="mt-2 text-xs leading-6 text-white/48">{item.helper}</p>
                  </button>
                );
              })}
            </div>

            <div className="rounded-[30px] border border-white/8 bg-[#0f141d]/84 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3 focus-within:border-accent/30 sm:px-5 sm:py-4">
                  <Search className="h-5 w-5 shrink-0 text-accent/80" />
                  <input value={searchQuery} onChange={handleInputChange} placeholder={config.placeholder} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30 sm:text-base" />
                </div>
                <button type="submit" disabled={loading} className="inline-flex h-14 items-center justify-center gap-3 rounded-[22px] bg-accent px-6 text-sm font-semibold text-white transition-all hover:bg-accent/90 disabled:opacity-70 sm:h-[60px] sm:px-7">
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                  开始检索
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {(Object.keys(SEARCH_TYPES) as SearchType[]).map((type) => (
                  <button key={`example-${type}`} type="button" onClick={() => { setActiveSearchType(type); setSearchQuery(SEARCH_TYPES[type].example); }} className={cn('rounded-full border px-3 py-2 text-xs transition-colors', activeSearchType === type ? 'border-accent/20 bg-accent/10 text-accent' : 'border-white/10 bg-white/[0.03] text-white/62 hover:bg-white/[0.06]')}>
                    {SEARCH_TYPES[type].label}: {SEARCH_TYPES[type].example}
                  </button>
                ))}
              </div>
            </div>

            {error && <div className="flex items-start gap-3 rounded-[24px] border border-red-500/18 bg-red-500/8 px-4 py-4 text-sm text-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
          </form>
        </div>
      </div>

      <div ref={resultsRef} className="mt-8 space-y-6">
        {showResults && results ? (
          <>
            <Card title={config.title}>
              <div className="mb-5 flex flex-col gap-3 border-b border-white/6 pb-5 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-[11px] uppercase tracking-[0.28em] text-white/38">Current Query</p><p className="mt-2 break-all text-lg font-semibold text-white">{submittedQuery}</p></div>
                <span
                  className={cn(
                    'inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]',
                    resultStatus?.tone === 'threat' && 'border-red-500/20 bg-red-500/10 text-red-300',
                    resultStatus?.tone === 'neutral' && 'border-white/12 bg-white/[0.06] text-white/70',
                    resultStatus?.tone === 'safe' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                  )}
                >
                  {resultStatus?.label}
                </span>
              </div>
              <div className="mb-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-[26px] border border-white/8 bg-[linear-gradient(135deg,rgba(168,85,247,0.12),rgba(255,255,255,0.02))] p-5">
                  <p className="text-[11px] uppercase tracking-[0.26em] text-white/40">Quick Verdict</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span
                      className={cn(
                        'inline-flex rounded-full border px-3 py-1 text-xs font-semibold',
                        resultStatus?.tone === 'threat' && 'border-red-500/20 bg-red-500/10 text-red-300',
                        resultStatus?.tone === 'neutral' && 'border-white/12 bg-white/[0.06] text-white/70',
                        resultStatus?.tone === 'safe' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                      )}
                    >
                      {resultStatus?.label}
                    </span>
                    <span className="text-sm text-white/55">{config.label} result</span>
                  </div>
                  <p className="mt-5 text-[11px] uppercase tracking-[0.26em] text-white/40">Primary Object</p>
                  <p className="mt-2 break-all text-2xl font-semibold tracking-[-0.03em] text-white">
                    {getPrimaryValue(activeSearchType, results)}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {resultStats.map(([label, value], index) => (
                    <div key={`${label}-${index}`} className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-white/38">{label}</p>
                      <p className="mt-2 text-lg font-semibold text-white">{String(value)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {overviewMetrics.map(([label, value], index) => (
                  <div key={`${String(label)}-${index}`} className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
                    <p className="mb-2 text-[11px] uppercase tracking-[0.28em] text-white/42">{String(label)}</p>
                    <div className="text-sm font-semibold leading-relaxed text-white/90">{value}</div>
                  </div>
                ))}
              </div>
            </Card>

            {(activeSearchType === 'ip' || activeSearchType === 'domain') && (
              <Card title={`被动 DNS 记录 (${passiveDnsRecords.length})`}>
                {passiveDnsRecords.length > 0 ? (
                  <div className="space-y-5">
                    <p className="text-sm text-white/58">共 {passiveDnsRecords.length} 条记录。</p>
                    <div className="overflow-x-auto overflow-hidden rounded-[24px] border border-white/8">
                      <table className="min-w-full border-collapse text-left">
                        <thead className="bg-white/[0.03]"><tr><th className="px-4 py-3 text-[11px] uppercase tracking-[0.22em] text-white/45">域名</th><th className="px-4 py-3 text-[11px] uppercase tracking-[0.22em] text-white/45">类型</th><th className="px-4 py-3 text-[11px] uppercase tracking-[0.22em] text-white/45">首次出现</th><th className="px-4 py-3 text-[11px] uppercase tracking-[0.22em] text-white/45">最后出现</th></tr></thead>
                        <tbody>{passiveDnsSlice.map((record: any, index: number) => <tr key={`${record.hostname}-${index}`} className="border-t border-white/6"><td className="px-4 py-4 text-sm text-white/88">{toDisplayText(record.hostname)}</td><td className="px-4 py-4 text-sm text-white/64">{toDisplayText(record.type)}</td><td className="px-4 py-4 text-sm text-white/64">{toDisplayText(record.first)}</td><td className="px-4 py-4 text-sm text-white/64">{toDisplayText(record.last)}</td></tr>)}</tbody>
                      </table>
                    </div>
                    {passiveDnsRecords.length > PASSIVE_DNS_PAGE_SIZE && <div className="flex items-center justify-between"><button type="button" onClick={() => setPassiveDnsPage((page) => Math.max(1, page - 1))} disabled={passiveDnsPage === 1} className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/72 disabled:opacity-40">上一页</button><span className="text-xs text-white/45">第 {passiveDnsPage} / {passiveDnsPages} 页</span><button type="button" onClick={() => setPassiveDnsPage((page) => Math.min(passiveDnsPages, page + 1))} disabled={passiveDnsPage >= passiveDnsPages} className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/72 disabled:opacity-40">下一页</button></div>}
                  </div>
                ) : <EmptyState text="当前没有可展示的被动 DNS 记录。" />}
              </Card>
            )}

            {(activeSearchType === 'ip' || activeSearchType === 'domain') && results.malware?.length > 0 && (
              <Card title={`关联恶意样本 (${results.malware.length})`}>
                <div className="overflow-x-auto overflow-hidden rounded-[24px] border border-white/8">
                  <table className="min-w-full border-collapse text-left">
                    <thead className="bg-white/[0.03]"><tr><th className="px-4 py-3 text-[11px] uppercase tracking-[0.22em] text-white/45">家族</th><th className="px-4 py-3 text-[11px] uppercase tracking-[0.22em] text-white/45">名称</th><th className="px-4 py-3 text-[11px] uppercase tracking-[0.22em] text-white/45">MD5</th></tr></thead>
                    <tbody>{results.malware.map((record: any, index: number) => <tr key={`${record.md5}-${index}`} className="border-t border-white/6"><td className="px-4 py-4 text-sm text-white/88">{toDisplayText(record.family)}</td><td className="px-4 py-4 text-sm text-white/64">{toDisplayText(record.name)}</td><td className="px-4 py-4 font-mono text-xs text-white/56">{toDisplayText(record.md5)}</td></tr>)}</tbody>
                  </table>
                </div>
              </Card>
            )}

            {(activeSearchType === 'ip' || activeSearchType === 'url') && results.url_list?.length > 0 && (
              <Card title={`关联 URL 列表 (${results.url_list.length})`}>
                <div className="overflow-x-auto overflow-hidden rounded-[24px] border border-white/8">
                  <table className="min-w-full border-collapse text-left">
                    <thead className="bg-white/[0.03]"><tr><th className="px-4 py-3 text-[11px] uppercase tracking-[0.22em] text-white/45">URL</th><th className="px-4 py-3 text-[11px] uppercase tracking-[0.22em] text-white/45">域名</th><th className="px-4 py-3 text-[11px] uppercase tracking-[0.22em] text-white/45">路径</th></tr></thead>
                    <tbody>{results.url_list.map((record: any, index: number) => <tr key={`${record.url}-${index}`} className="border-t border-white/6"><td className="px-4 py-4 text-sm text-white/88"><span className="break-all">{toDisplayText(record.url)}</span></td><td className="px-4 py-4 text-sm text-white/64">{toDisplayText(record.domain)}</td><td className="px-4 py-4 text-sm text-white/64">{toDisplayText(record.path)}</td></tr>)}</tbody>
                  </table>
                </div>
              </Card>
            )}

            {activeSearchType === 'domain' && (
              <Card title="WHOIS 信息">
                {results.whois && Object.keys(results.whois).length > 0 ? <div className="grid gap-4 md:grid-cols-2"><div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5"><p className="mb-2 text-[11px] uppercase tracking-[0.28em] text-white/42">注册商</p><div className="text-sm font-semibold text-white/90">{toDisplayText(results.whois.registrar)}</div></div><div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5"><p className="mb-2 text-[11px] uppercase tracking-[0.28em] text-white/42">注册日期</p><div className="text-sm font-semibold text-white/90">{toDisplayText(results.whois.creation_date)}</div></div><div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5"><p className="mb-2 text-[11px] uppercase tracking-[0.28em] text-white/42">到期日期</p><div className="text-sm font-semibold text-white/90">{toDisplayText(results.whois.expiration_date)}</div></div><div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5"><p className="mb-2 text-[11px] uppercase tracking-[0.28em] text-white/42">更新日期</p><div className="text-sm font-semibold text-white/90">{toDisplayText(results.whois.updated_date)}</div></div></div> : <EmptyState text="暂无结构化 WHOIS 记录。" />}
              </Card>
            )}

            {activeSearchType === 'cve' && results.description && (
              <Card title="漏洞描述">
                <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5 text-sm leading-7 text-white/74">{results.description}</div>
              </Card>
            )}
          </>
        ) : (
          <div className="overflow-hidden rounded-[32px] border border-white/8 bg-[#0f141d]/72 px-6 py-8 backdrop-blur-2xl sm:px-8">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {(Object.keys(SEARCH_TYPES) as SearchType[]).map((type) => {
                const item = SEARCH_TYPES[type];
                return <button key={`quick-${type}`} type="button" onClick={() => { setActiveSearchType(type); setSearchQuery(item.example); }} className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5 text-left transition-colors hover:bg-white/[0.05]"><p className="text-sm font-semibold text-white">{item.label}</p><p className="mt-2 font-mono text-sm text-accent">{item.example}</p><p className="mt-3 text-xs leading-6 text-white/48">{item.helper}</p></button>;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default IocSearch;
