import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Bug, Copy, Globe, Link as LinkIcon, Loader2, Radar, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '../lib/utils';
import { otxApi } from '../api/otxApi';

type SearchType = 'ip' | 'domain' | 'url' | 'cve';
type ResultTab = 'analysis' | 'passive-dns' | 'pulses' | 'malware' | 'urls';
type SectionKey = 'pulses' | 'passive_dns' | 'url_list' | 'malware' | 'http_scans';
type LoadableSectionKey = 'passive_dns' | 'url_list' | 'malware';
type SectionLoadStatus = 'idle' | 'loading' | 'ready' | 'error' | 'not_supported';

type SearchConfig = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  placeholder: string;
};

type CveReferenceLink = {
  href: string;
  label: string;
  source: string;
  hostname: string;
};

const SEARCH_TYPES: Record<SearchType, SearchConfig> = {
  ip: { label: 'IP', icon: Radar, placeholder: '输入 IPv4 或 IPv6 地址' },
  domain: { label: '域名', icon: Globe, placeholder: '输入域名，例如 example.com' },
  url: { label: 'URL', icon: LinkIcon, placeholder: '输入完整 URL' },
  cve: { label: 'CVE', icon: Bug, placeholder: '输入 CVE 编号，例如 CVE-2024-3400' },
};

const MAX_RETRIES = 1;
const RETRY_DELAY = 2000;
const IOC_UNAVAILABLE_MESSAGE = 'IOC 情报功能暂时不可用';
const OTX_SECTION_PAGE_SIZE = 10;

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

const COUNTRY_CODE_MAP: Record<string, string> = {
  'United States of America': 'US',
  'United States': 'US',
  'China': 'CN',
  'Japan': 'JP',
  'Australia': 'AU',
  'Canada': 'CA',
  'United Kingdom': 'GB',
  'Germany': 'DE',
  'France': 'FR',
  'Singapore': 'SG',
  'Hong Kong': 'HK',
  'South Korea': 'KR',
  'Netherlands': 'NL',
  'Russia': 'RU',
  'India': 'IN',
  'Brazil': 'BR',
  'Italy': 'IT',
  'Spain': 'ES',
};

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

const extractFirstArray = (...candidates: any[]) => {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (!candidate || typeof candidate !== 'object') continue;

    for (const value of Object.values(candidate)) {
      if (Array.isArray(value)) return value;
    }
  }

  return [];
};

const getCollection = (payload: any, key: string) =>
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

const dedupeCollection = (records: any[]) => {
  const seen = new Set<string>();

  return records.filter((record, index) => {
    const key = JSON.stringify([
      record?.id,
      record?.url,
      record?.hostname,
      record?.sha256,
      record?.hash,
      record?.md5,
      record?.sha1,
      record?.date,
      index,
    ]);

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const formatDisplayDate = (value: any) => {
  if (!value || typeof value === 'object') return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('zh-CN');
};

const formatPercentFromRatio = (value: any) => {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value || ''));
  if (!Number.isFinite(numeric)) return 'N/A';
  return `${(numeric * 100).toFixed(numeric >= 0.1 ? 1 : 2)}%`;
};

const formatScore = (value: any, digits = 1) => {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value || ''));
  if (!Number.isFinite(numeric)) return 'N/A';
  return numeric.toFixed(digits);
};

const normalizeSourceLabel = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (normalized === 'Aliyun AVD') return '阿里云漏洞库';
  if (normalized === 'KEV') return 'CISA KEV';
  return normalized;
};

const getHostnameLabel = (hostname: string) =>
  hostname
    .replace(/^www\./i, '')
    .split('.')
    .filter(Boolean)
    .slice(0, 2)
    .join('.');

const inferCveReferenceLink = (href: string): CveReferenceLink | null => {
  if (!isDisplayableValue(href)) return null;

  try {
    const url = new URL(String(href));
    const hostname = url.hostname.toLowerCase();
    const hostLabel = getHostnameLabel(hostname);

    if (hostname.includes('avd.aliyun.com')) {
      return { href: url.toString(), label: '阿里云漏洞库', source: 'Aliyun AVD', hostname: 'avd.aliyun.com' };
    }

    if (hostname.includes('nvd.nist.gov')) {
      return { href: url.toString(), label: 'NVD', source: 'NVD', hostname: 'nvd.nist.gov' };
    }

    if (hostname.includes('cve.org') || hostname.includes('mitre.org')) {
      return { href: url.toString(), label: 'CVE / MITRE', source: 'MITRE', hostname: hostLabel };
    }

    if (hostname.includes('cisa.gov')) {
      return { href: url.toString(), label: 'CISA', source: 'CISA', hostname: hostLabel };
    }

    if (hostname.includes('github.com') || hostname.includes('githubusercontent.com')) {
      return { href: url.toString(), label: 'GitHub', source: 'GitHub', hostname: hostLabel };
    }

    if (hostname.includes('apache.org')) {
      return { href: url.toString(), label: 'Apache', source: 'Apache', hostname: hostLabel };
    }

    if (hostname.includes('microsoft.com')) {
      return { href: url.toString(), label: 'Microsoft', source: 'Microsoft', hostname: hostLabel };
    }

    if (hostname.includes('oracle.com')) {
      return { href: url.toString(), label: 'Oracle', source: 'Oracle', hostname: hostLabel };
    }

    if (hostname.includes('cisco.com')) {
      return { href: url.toString(), label: 'Cisco', source: 'Cisco', hostname: hostLabel };
    }

    if (hostname.includes('redhat.com')) {
      return { href: url.toString(), label: 'Red Hat', source: 'Red Hat', hostname: hostLabel };
    }

    return {
      href: url.toString(),
      label: hostLabel,
      source: hostLabel,
      hostname: hostLabel,
    };
  } catch {
    return null;
  }
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
  if (error.message?.includes('401')) return '情报源认证失败，请检查后端配置。';
  if (error.message?.includes('404')) return '未找到对应情报结果。';
  if (
    error.message?.includes('Empty response') ||
    error.message?.includes('502') ||
    error.message?.includes('503') ||
    error.message?.includes('504') ||
    error.message?.includes('timeout') ||
    error.message?.includes('ETIMEDOUT') ||
    error.message?.includes('ECONNRESET') ||
    error.message?.includes('Network Error')
  ) {
    return IOC_UNAVAILABLE_MESSAGE;
  }
  return error.message || '检索请求失败，请稍后重试。';
};

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

  if (!asnText) return '未知';
  const matchedProvider = CLOUD_PROVIDER_MATCHERS.find(({ pattern }) => pattern.test(asnText));
  return matchedProvider ? matchedProvider.label : '非云厂商 / 未识别';
};

const getDetectionSummary = (records: any[]) => {
  const detectionNames = records
    .flatMap((record) => {
      if (!record?.detections || typeof record.detections !== 'object') return [];
      return Object.values(record.detections).filter((value): value is string => typeof value === 'string' && value.trim() !== '');
    })
    .filter(Boolean);

  return detectionNames.length > 0 ? detectionNames[0] : 'N/A';
};

const getDetectionRatio = (records: any[]) => {
  if (!Array.isArray(records) || records.length === 0) return 'N/A';

  const firstWithDetections = records.find((record) => record?.detections && typeof record.detections === 'object');
  if (!firstWithDetections) return 'N/A';

  const entries = Object.values(firstWithDetections.detections);
  if (entries.length === 0) return 'N/A';
  const matched = entries.filter((value) => typeof value === 'string' && value.trim() !== '').length;
  return `${matched} / ${entries.length}`;
};

const preferLoadedCount = (
  loadedCount: number,
  state: { status?: string },
  ...fallbackCounts: Array<number | undefined>
) => {
  if ((state.status === 'ready' || state.status === 'success') && loadedCount > 0) {
    return loadedCount;
  }

  for (const count of fallbackCounts) {
    if (typeof count === 'number' && !Number.isNaN(count)) {
      return count;
    }
  }

  return loadedCount;
};

const buildExternalResources = (type: SearchType, data: any) => {
  const resources: Array<{ label: string; href: string }> = [];
  const indicator = toDisplayText(data?.indicator, '');

  if ((type === 'ip' || type === 'domain') && isDisplayableValue(data?.__raw?.general?.whois)) {
    resources.push({ label: 'Whois', href: String(data.__raw.general.whois) });
  }

  if ((type === 'ip' || type === 'domain' || type === 'url') && indicator) {
    resources.push({ label: 'VirusTotal', href: `https://www.virustotal.com/gui/search/${encodeURIComponent(indicator)}` });
  }

  if (type === 'url' && indicator) {
    const href = /^https?:\/\//i.test(indicator) ? indicator : `https://${indicator}`;
    resources.push({ label: 'Open in browser', href });
  }

  if (type === 'cve' && indicator) {
    resources.push({ label: 'NVD', href: `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(indicator)}` });
    resources.push({ label: 'MITRE', href: `https://www.cve.org/CVERecord?id=${encodeURIComponent(indicator)}` });
    if (isDisplayableValue(data?.source_details?.aliyun?.sourceUrl)) {
      resources.push({ label: 'Aliyun AVD', href: String(data.source_details.aliyun.sourceUrl) });
    }
  }

  if (resources.length === 0) return 'N/A';

  return (
    <div className="flex flex-wrap gap-2">
      {resources.map((resource) => (
        <a
          key={`${resource.label}-${resource.href}`}
          href={resource.href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:border-accent/30 hover:bg-accent/10"
        >
          {resource.label}
        </a>
      ))}
    </div>
  );
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

const countryCodeToFlag = (countryCode?: string) => {
  if (!countryCode || countryCode.length !== 2) return '';
  return countryCode
    .toUpperCase()
    .split('')
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join('');
};

const getCountryFlag = (countryName?: string) => {
  if (!countryName) return '';
  const countryCode = COUNTRY_CODE_MAP[countryName.trim()];
  return countryCodeToFlag(countryCode);
};

const getSectionState = (results: any, key: SectionKey) =>
  results?.section_states?.[key] || { status: 'unknown', message: '该模块当前没有可展示状态。' };

const getSectionDisplayValue = (results: any, key: SectionKey, count: number) => {
  const state = getSectionState(results, key);
  if (state.status === 'timeout') return '!';
  if (state.status === 'not_supported') return '—';
  return count;
};

const getSectionListMessage = (state: { status?: string; message?: string }, count: number, singularLabel: string) => {
  if (state.status === 'success' && count > 0) {
    return `情报源已统计到 ${count} 条${singularLabel}，但当前返回结果中没有展开详细列表。`;
  }
  return state.message;
};

const getSupportedLoadableSections = (type: SearchType): LoadableSectionKey[] => {
  if (type === 'ip' || type === 'domain') return ['passive_dns', 'url_list', 'malware'];
  if (type === 'url') return ['url_list'];
  return [];
};

const createSectionStatusMap = (type: SearchType, status: SectionLoadStatus): Record<LoadableSectionKey, SectionLoadStatus> => ({
  passive_dns: getSupportedLoadableSections(type).includes('passive_dns') ? status : 'not_supported',
  url_list: getSupportedLoadableSections(type).includes('url_list') ? status : 'not_supported',
  malware: getSupportedLoadableSections(type).includes('malware') ? status : 'not_supported',
});

const getTotalPages = (total: number, pageSize: number) => {
  if (!total || total <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
};

const SearchShell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.08),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_18%)]">
    <div className="mx-auto max-w-[1480px] px-5 py-8 sm:px-8 lg:px-12">{children}</div>
  </div>
);

const CountMetric = ({ label, value, highlight, active = false }: { label: string; value: React.ReactNode; highlight: boolean; active?: boolean }) => (
  <div className={cn('flex min-h-[112px] flex-col justify-between rounded-[24px] border px-5 py-4 transition-colors', active ? 'border-accent/28 bg-accent/[0.08]' : 'border-white/8 bg-white/[0.025]')}>
    <span className="text-[11px] uppercase tracking-[0.24em] text-white/42">{label}</span>
    <span className={cn('text-[2rem] font-semibold tracking-[-0.06em]', highlight ? 'text-accent' : 'text-white')}>{value}</span>
  </div>
);

const SummaryRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="grid gap-2 py-3 md:grid-cols-[154px_1fr] md:items-start">
    <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">{label}</div>
    <div className="text-sm leading-7 text-white/86">{value}</div>
  </div>
);

const ResultTabButton = ({ label, count, active, onClick }: { label: string; count?: React.ReactNode; active: boolean; onClick: () => void }) => (
  <button type="button" onClick={onClick} className={cn('inline-flex items-center gap-3 border-b-2 px-1 pb-4 pt-1 text-sm transition-colors', active ? 'border-accent text-white' : 'border-transparent text-white/52 hover:text-white/82')}>
    <span>{label}</span>
    {count !== undefined ? <span className={cn('rounded-full border px-2 py-0.5 text-[11px]', active ? 'border-accent/30 bg-accent/10 text-accent' : 'border-white/10 text-white/42')}>{count}</span> : null}
  </button>
);

const Panel = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
  <section className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,19,28,0.96),rgba(8,12,18,0.96))]">
    <div className="border-b border-white/8 px-6 py-5 sm:px-7">
      {subtitle ? <p className="text-[11px] uppercase tracking-[0.28em] text-white/38">{subtitle}</p> : null}
      <h3 className="mt-2 text-[1.65rem] font-semibold tracking-[-0.06em] text-white">{title}</h3>
    </div>
    <div className="px-6 py-5 sm:px-7">{children}</div>
  </section>
);

const SectionLoadingState = ({ label }: { label: string }) => (
  <div className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.03] px-5 py-5 text-sm text-white/60">
    <Loader2 className="h-4 w-4 animate-spin text-accent" />
    <span>{label}加载中，请稍候…</span>
  </div>
);

const PaginationControls = ({
  currentPage,
  totalPages,
  onChange,
  loading = false,
}: {
  currentPage: number;
  totalPages: number;
  onChange: (page: number) => void;
  loading?: boolean;
}) => {
  if (totalPages <= 1 && !loading) return null;

  const pages = Array.from({ length: Math.min(totalPages, 5) }, (_, index) => {
    const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
    return start + index;
  }).filter((page) => page >= 1 && page <= totalPages);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, currentPage - 1))}
        disabled={currentPage <= 1 || loading}
        className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 disabled:opacity-40"
      >
        上一页
      </button>
      {pages.map((page) => (
        <button
          key={page}
          type="button"
          onClick={() => onChange(page)}
          disabled={loading && page !== currentPage}
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs transition-colors',
            page === currentPage ? 'border-accent/30 bg-accent/10 text-accent' : 'border-white/10 text-white/70'
          )}
        >
          {page}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage >= totalPages || loading}
        className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 disabled:opacity-40"
      >
        下一页
      </button>
      {loading ? <Loader2 className="h-4 w-4 animate-spin text-accent" /> : null}
    </div>
  );
};

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
  const [activeTab, setActiveTab] = useState<ResultTab>('analysis');
  const [sectionPages, setSectionPages] = useState<Record<LoadableSectionKey, number>>({
    passive_dns: 1,
    url_list: 1,
    malware: 1,
  });
  const [sectionViewPages, setSectionViewPages] = useState<Record<LoadableSectionKey, number>>({
    passive_dns: 1,
    url_list: 1,
    malware: 1,
  });
  const [sectionOverrides, setSectionOverrides] = useState<Partial<Record<LoadableSectionKey, any[]>>>({});
  const [sectionStatus, setSectionStatus] = useState<Record<LoadableSectionKey, SectionLoadStatus>>(createSectionStatusMap(activeSearchType, 'idle'));
  const latestSearchIdRef = useRef(0);
  const hasBootstrappedQueryRef = useRef(false);
  const detailsSectionRef = useRef<HTMLElement | null>(null);

  const currentConfig = SEARCH_TYPES[activeSearchType];
  const Icon = currentConfig.icon;

  useEffect(() => {
    if (!queryFromUrl) {
      setSearchQuery('');
      setResults(null);
      setSubmittedQuery('');
      setShowResults(false);
      setError('');
      hasBootstrappedQueryRef.current = false;
      return;
    }

    setSearchQuery((currentQuery) => (currentQuery === queryFromUrl ? currentQuery : queryFromUrl));
    const detectedType = detectSearchType(queryFromUrl);
    if (detectedType) setActiveSearchType(detectedType);
  }, [queryFromUrl]);

  useEffect(() => {
    setActiveTab('analysis');
  }, [submittedQuery, activeSearchType]);

  useEffect(() => {
    setSectionPages({
      passive_dns: 1,
      url_list: 1,
      malware: 1,
    });
    setSectionViewPages({
      passive_dns: 1,
      url_list: 1,
      malware: 1,
    });
    setSectionOverrides({});
    setSectionStatus(createSectionStatusMap(activeSearchType, 'idle'));
  }, [submittedQuery, activeSearchType]);

  const executeSearch = async (query: string, type: SearchType) => {
    const response = await otxApi.searchIntel(query, type, { coreOnly: type !== 'cve' });
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
      setSectionOverrides({});
      setSectionPages({ passive_dns: 1, url_list: 1, malware: 1 });
      setSectionViewPages({ passive_dns: 1, url_list: 1, malware: 1 });
      setSectionStatus(createSectionStatusMap(type, 'loading'));

      const indicator = String(data?.indicator || query).trim();
      getSupportedLoadableSections(type).forEach((sectionKey) => {
        void fetchSectionPage(indicator, type, sectionKey, 1);
      });
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

  const fetchSectionPage = async (
    indicator: string,
    type: SearchType,
    sectionKey: LoadableSectionKey,
    page: number
  ) => {
    setSectionStatus((current) => ({ ...current, [sectionKey]: 'loading' }));

    try {
      const params = { page, limit: OTX_SECTION_PAGE_SIZE };
      let payload: any = {};

      if (type === 'ip') {
        payload = await otxApi.getIpInfo(indicator, sectionKey, indicator.includes(':'), params);
      } else if (type === 'domain') {
        payload = await otxApi.getDomainInfo(indicator, sectionKey, params);
      } else if (type === 'url') {
        payload = await otxApi.getUrlInfo(indicator, sectionKey, params);
      } else {
        payload = await otxApi.getCveInfo(indicator, sectionKey, params);
      }

      const nextItems = getCollection(payload, sectionKey);
      setSectionOverrides((current) => ({
        ...current,
        [sectionKey]: dedupeCollection(nextItems),
      }));
      setSectionPages((current) => ({ ...current, [sectionKey]: page }));
      setSectionViewPages((current) => ({ ...current, [sectionKey]: page }));
      setSectionStatus((current) => ({ ...current, [sectionKey]: 'ready' }));
    } catch {
      setSectionStatus((current) => ({ ...current, [sectionKey]: 'error' }));
    }
  };

  useEffect(() => {
    if (!queryFromUrl) return;
    if (hasBootstrappedQueryRef.current && queryFromUrl === submittedQuery) return;

    const detectedType = detectSearchType(queryFromUrl);
    if (!detectedType) {
      setResults(null);
      setShowResults(false);
      setError('请输入有效的 IP、域名、URL 或 CVE 编号。');
      return;
    }

    hasBootstrappedQueryRef.current = true;
    void runSearch(queryFromUrl, detectedType);
  }, [queryFromUrl, submittedQuery]);

  const pulseEntries = useMemo(() => getPulseEntries(activeSearchType, results), [activeSearchType, results]);
  const passiveDnsEntries = useMemo(
    () => sectionOverrides.passive_dns ?? (Array.isArray(results?.passive_dns) ? results.passive_dns : []),
    [results?.passive_dns, sectionOverrides.passive_dns]
  );
  const malwareEntries = useMemo(
    () => sectionOverrides.malware ?? (Array.isArray(results?.malware) ? results.malware : []),
    [results?.malware, sectionOverrides.malware]
  );
  const urlEntries = useMemo(
    () => sectionOverrides.url_list ?? (Array.isArray(results?.url_list) ? results.url_list : []),
    [results?.url_list, sectionOverrides.url_list]
  );
  const httpScanEntries = useMemo(() => (Array.isArray(results?.http_scans) ? results.http_scans : []), [results?.http_scans]);
  const topLevelDomains = useMemo(() => getTopLevelDomains(passiveDnsEntries), [passiveDnsEntries]);
  const unifiedTags = useMemo(() => getUnifiedTags(pulseEntries), [pulseEntries]);

  const pulsesState = getSectionState(results, 'pulses');
  const passiveDnsState = getSectionState(results, 'passive_dns');
  const urlListState = getSectionState(results, 'url_list');
  const malwareState = getSectionState(results, 'malware');
  const httpScansState = getSectionState(results, 'http_scans');

  const counts = useMemo(
    () => ({
      pulses: typeof results?.pulse_info?.count === 'number' ? results.pulse_info.count : pulseEntries.length,
      passiveDns: preferLoadedCount(
        passiveDnsEntries.length,
        passiveDnsState,
        results?.derived?.passive_dns_count,
        results?.derived?.dns_resolutions,
      ),
      urls: preferLoadedCount(
        urlEntries.length,
        urlListState,
        results?.derived?.url_count,
        Array.isArray(results?.url_list) ? results.url_list.length : undefined,
      ),
      malware: preferLoadedCount(
        malwareEntries.length,
        malwareState,
        results?.derived?.malware_count,
        typeof results?.malware?.count === 'number' ? results.malware.count : undefined,
      ),
    }),
    [
      malwareEntries.length,
      malwareState,
      passiveDnsEntries.length,
      passiveDnsState,
      pulseEntries.length,
      results?.derived?.dns_resolutions,
      results?.derived?.passive_dns_count,
      results?.derived?.malware_count,
      results?.derived?.url_count,
      results?.malware,
      results?.pulse_info?.count,
      results?.url_list,
      urlListState,
      urlEntries.length,
    ]
  );

  const reverseDns = useMemo(() => toDisplayText(passiveDnsEntries[0]?.hostname, 'N/A'), [passiveDnsEntries]);
  const dnsResolutions = useMemo(() => {
    if (typeof results?.derived?.dns_resolutions === 'number') return `${results.derived.dns_resolutions} Domains`;
    return passiveDnsEntries.length > 0 ? `${passiveDnsEntries.length} Domains` : passiveDnsState.status === 'not_supported' ? 'Not Supported' : '0';
  }, [passiveDnsEntries.length, passiveDnsState.status, results?.derived?.dns_resolutions]);

  const publishedDate = useMemo(
    () => toDisplayText(pickFirstValue(results?.published, results?.published_date, results?.release_date, results?.__raw?.general?.published), 'N/A'),
    [results]
  );
  const cveSourceTags = useMemo(
    () =>
      Array.isArray(results?.source_tags)
        ? results.source_tags.map((tag: string) => normalizeSourceLabel(tag)).filter(Boolean)
        : Array.isArray(results?.derived?.source_tags)
          ? results.derived.source_tags.map((tag: string) => normalizeSourceLabel(tag)).filter(Boolean)
          : [],
    [results]
  );
  const cveEpss = results?.epss || results?.source_details?.epss || null;
  const cveExploitActivity = results?.exploit_activity || null;
  const cveOverview = results?.overview || null;
  const cveTargetedProducts = useMemo(
    () => (Array.isArray(results?.targeted_products) ? results.targeted_products : []),
    [results]
  );
  const cveReferenceLinks = useMemo<CveReferenceLink[]>(() => {
    const entries = [
      ...(Array.isArray(results?.source_details?.nvd?.references) ? results.source_details.nvd.references : []),
      ...(results?.source_details?.aliyun?.sourceUrl ? [results.source_details.aliyun.sourceUrl] : []),
    ]
      .map((href) => inferCveReferenceLink(String(href)))
      .filter((entry): entry is CveReferenceLink => Boolean(entry));

    const seen = new Set<string>();
    return entries.filter((entry) => {
      if (seen.has(entry.href)) return false;
      seen.add(entry.href);
      return true;
    }).slice(0, 8);
  }, [results]);
  const cveSourceRoles = useMemo(
    () =>
      [
        cveSourceTags.includes('OTX')
          ? {
              key: 'otx',
              label: 'OTX',
              description: '提供活动情报、关联上下文，以及社区侧的利用线索。',
            }
          : null,
        results?.source_details?.nvd
          ? {
              key: 'nvd',
              label: 'NVD',
              description: '提供 CVSS 细项、CWE、标准参考链接和受影响产品信息。',
            }
          : null,
        results?.hasKev || cveSourceTags.includes('CISA KEV')
          ? {
              key: 'kev',
              label: 'CISA KEV',
              description: '标记该漏洞是否进入已知在野利用目录，用于提高处置优先级。',
            }
          : null,
        cveEpss
          ? {
              key: 'epss',
              label: 'EPSS',
              description: '提供漏洞未来被利用的概率评分和风险分位。',
            }
          : null,
        results?.source_details?.aliyun
          ? {
              key: 'aliyun',
              label: '阿里云漏洞库',
              description: '作为补充情报源，补齐标题、严重度和中文漏洞详情入口。',
            }
          : null,
      ].filter(Boolean),
    [cveEpss, cveSourceTags, results]
  );
  const cveCvssRows = useMemo(
    () => [
      { label: '基础分数', value: formatScore(cveOverview?.cvssScore ?? results?.base_score) },
      { label: '基础等级', value: toDisplayText(cveOverview?.severity ?? results?.severity) },
      { label: '攻击向量', value: toDisplayText(cveOverview?.attackVector) },
      { label: '攻击复杂度', value: toDisplayText(cveOverview?.attackComplexity) },
      { label: '所需权限', value: toDisplayText(cveOverview?.privilegesRequired) },
      { label: '用户交互', value: toDisplayText(cveOverview?.userInteraction) },
      { label: '机密性影响', value: toDisplayText(cveOverview?.confidentialityImpact) },
      { label: '完整性影响', value: toDisplayText(cveOverview?.integrityImpact) },
      { label: '可用性影响', value: toDisplayText(cveOverview?.availabilityImpact) },
      { label: '可利用性分数', value: formatScore(cveOverview?.exploitabilityScore) },
      { label: '影响分数', value: formatScore(cveOverview?.impactScore) },
      { label: '向量字符串', value: toDisplayText(cveOverview?.vector ?? results?.vector) },
    ],
    [cveOverview, results]
  );

  const resultTitle = submittedQuery || queryFromUrl;
  const countryFlag = getCountryFlag(results?.country);
  const locationDisplay = [toDisplayText(results?.country, ''), toDisplayText(results?.city, '')].filter(Boolean).join(' / ') || 'N/A';
  const displayTags = results?.derived?.tags?.length > 0 ? results.derived.tags : unifiedTags;
  const displayTlds = results?.derived?.top_level_domains?.length > 0 ? results.derived.top_level_domains : topLevelDomains;
  const overviewLeft = [
    { label: '分类', value: activeSearchType === 'cve' ? '漏洞情报' : `${currentConfig.label} 情报` },
    { label: '反向解析', value: activeSearchType === 'cve' ? 'N/A' : reverseDns },
    {
      label: '地点',
      value:
        locationDisplay === 'N/A' ? (
          'N/A'
        ) : (
          <span className="inline-flex items-center gap-2">
            {countryFlag ? <span aria-hidden="true">{countryFlag}</span> : null}
            <span>{locationDisplay}</span>
          </span>
        ),
    },
    { label: 'ASN', value: activeSearchType === 'ip' ? `${toDisplayText(results?.asn)} / ${getAsnOrganization(results)}` : 'N/A' },
    { label: 'DNS 解析', value: dnsResolutions },
    { label: '顶级域名', value: displayTlds.length > 0 ? displayTlds.join(', ') : passiveDnsState.status === 'not_supported' ? '暂不支持' : 'N/A' },
    { label: '关联情报', value: counts.pulses > 0 ? `${counts.pulses} 条` : pulsesState.status === 'not_supported' ? '暂不支持' : '0' },
    { label: '标签', value: displayTags.length > 0 ? displayTags.join(' / ') : 'N/A' },
  ];

  const overviewRight =
    activeSearchType === 'ip'
      ? [
          {
            label: '指标事实',
            value: [
              counts.pulses > 0 ? '历史情报轨迹' : null,
              counts.passiveDns > 0 ? `累计 ${counts.passiveDns} 条 DNS 解析记录` : null,
              displayTlds.length > 0 ? `${displayTlds.length} 个顶级域名` : null,
              getCloudProvider(results) !== '非云厂商 / 未识别' ? getCloudProvider(results) : null,
            ]
              .filter(Boolean)
              .join(' / ') || 'N/A',
          },
          { label: '杀软命名', value: getDetectionSummary(malwareEntries) },
          { label: '引擎检出比', value: getDetectionRatio(malwareEntries) },
          { label: '信誉评分', value: getRawReputation(results) },
          { label: '外部资源', value: buildExternalResources('ip', results) },
        ]
      : activeSearchType === 'domain'
        ? [
            {
              label: '指标事实',
              value: [
                counts.pulses > 0 ? '历史情报轨迹' : null,
                counts.passiveDns > 0 ? `${counts.passiveDns} 条 DNS 解析记录` : null,
                displayTlds.length > 0 ? `${displayTlds.length} 个顶级域名` : null,
              ]
                .filter(Boolean)
                .join(' / ') || 'N/A',
            },
            {
              label: 'WHOIS 摘要',
              value: [
                toDisplayText(results?.whois?.registrar, ''),
                toDisplayText(results?.whois?.creation_date, ''),
                toDisplayText(results?.whois?.expiration_date, ''),
              ]
                .filter(Boolean)
                .join(' / ') || 'N/A',
            },
            { label: '杀软命名', value: getDetectionSummary(malwareEntries) },
            { label: '外部资源', value: buildExternalResources('domain', results) },
          ]
        : activeSearchType === 'url'
          ? [
              {
                label: '指标事实',
                value: [
                  counts.pulses > 0 ? '历史情报轨迹' : null,
                  counts.urls > 0 ? `${counts.urls} 条关联 URL` : null,
                  isDisplayableValue(results?.domain) ? `主机 ${toDisplayText(results?.domain)}` : null,
                ]
                  .filter(Boolean)
                  .join(' / ') || 'N/A',
              },
              { label: 'HTTP / 安全浏览', value: urlEntries.length > 0 ? `${urlEntries.filter((record: any) => Array.isArray(record?.gsb) && record.gsb.length > 0).length} 条命中风险` : 'N/A' },
              { label: '解析 IP / 主机', value: [toDisplayText(results?.ip, ''), toDisplayText(results?.domain, '')].filter(Boolean).join(' / ') || 'N/A' },
              { label: '外部资源', value: buildExternalResources('url', results) },
            ]
          : [
              { label: 'CVSS / 严重性', value: `${formatScore(cveOverview?.cvssScore ?? results?.base_score)} / ${toDisplayText(cveOverview?.severity ?? results?.severity)}` },
              { label: '发布日期 / 更新时间', value: `${toDisplayText(cveOverview?.published, publishedDate)} / ${toDisplayText(cveOverview?.lastModified)}` },
              { label: 'Exploit Activity', value: cveExploitActivity ? `${toDisplayText(cveExploitActivity.otxPulseCount, '0')} 条情报 / ${toDisplayText(cveExploitActivity.pushLevel, 'Monitor')}` : String(counts.pulses) },
              { label: 'EPSS', value: cveEpss ? `${formatPercentFromRatio(cveEpss.score)} / P${formatPercentFromRatio(cveEpss.percentile)}` : 'N/A' },
              { label: '外部资源', value: buildExternalResources('cve', results) },
            ];

  const tabCounts = {
    analysis: undefined,
    'passive-dns': getSectionDisplayValue(results, 'passive_dns', counts.passiveDns),
    pulses: getSectionDisplayValue(results, 'pulses', counts.pulses),
    malware: getSectionDisplayValue(results, 'malware', counts.malware),
    urls: getSectionDisplayValue(results, 'url_list', counts.urls),
  } as const;
  const passiveDnsIsLoading = loading || sectionStatus.passive_dns === 'loading';
  const passiveDnsTotalPages = getTotalPages(counts.passiveDns, OTX_SECTION_PAGE_SIZE);
  const malwareTotalPages = getTotalPages(counts.malware, OTX_SECTION_PAGE_SIZE);
  const urlTotalPages = getTotalPages(counts.urls, OTX_SECTION_PAGE_SIZE);
  const pagedPassiveDnsEntries = passiveDnsEntries;
  const pagedMalwareEntries = malwareEntries;
  const pagedUrlEntries = urlEntries;

  const handleSectionPageChange = (sectionKey: LoadableSectionKey, page: number) => {
    const normalizedPage = Math.max(1, page);
    setSectionViewPages((current) => ({ ...current, [sectionKey]: normalizedPage }));

    if (!results?.indicator || normalizedPage === sectionPages[sectionKey]) return;
    void fetchSectionPage(String(results.indicator), activeSearchType, sectionKey, normalizedPage);
  };

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    const detectedType = detectSearchType(query);
    if (!detectedType) {
      setError('请输入有效的 IP、域名、URL 或 CVE 编号。');
      return;
    }

    setError('');
    hasBootstrappedQueryRef.current = true;
    setSubmittedQuery(query);
    setActiveSearchType(detectedType);
    setShowResults(true);

    if (queryFromUrl !== query) {
      navigate(`/dns?q=${encodeURIComponent(query)}`);
    }

    void runSearch(query, detectedType);
  };

  const handleCopy = async () => {
    if (!resultTitle) return;

    try {
      await navigator.clipboard.writeText(resultTitle);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleTabChange = (tab: ResultTab) => {
    setActiveTab(tab);
    window.requestAnimationFrame(() => {
      detailsSectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };

  if (!showResults && !queryFromUrl) {
    return (
      <SearchShell>
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-[38px] border border-white/8 bg-[linear-gradient(180deg,rgba(12,18,28,0.96),rgba(8,12,18,0.94))] px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(168,85,247,0.12),transparent_28%),radial-gradient(circle_at_88%_0%,rgba(168,85,247,0.08),transparent_26%),linear-gradient(90deg,transparent,rgba(255,255,255,0.02),transparent)]" />
          <div className="relative mx-auto flex max-w-[1040px] flex-col items-start gap-8">
            <div className="space-y-4">
              <p className="text-[11px] uppercase tracking-[0.34em] text-accent/78">威胁情报检索</p>
              <h1 className="max-w-[760px] text-4xl font-semibold tracking-[-0.08em] text-white sm:text-5xl lg:text-6xl">
                用单一检索入口查看 IOC 的结构化情报脉络
              </h1>
              <p className="max-w-[700px] text-sm leading-8 text-white/58 sm:text-base">
                支持 IP、域名、URL 与 CVE 查询。结果页会按分析概览、被动 DNS、关联情报、恶意样本和 URL 关联分层展示，阅读顺序参考主流情报平台的查询页。
              </p>
            </div>

            <form onSubmit={handleSubmit} className="w-full">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                <label className="group flex min-h-[84px] items-center gap-4 rounded-[26px] border border-white/10 bg-white/[0.03] px-6 transition-colors focus-within:border-accent/30">
                  <Search className="h-5 w-5 shrink-0 text-accent/82" />
                  <input value={searchQuery} onChange={(event) => { const value = event.target.value; setSearchQuery(value); const detectedType = detectSearchType(value); if (detectedType) setActiveSearchType(detectedType); }} placeholder={currentConfig.placeholder} className="min-w-0 flex-1 bg-transparent text-lg text-white outline-none placeholder:text-white/26" />
                  <span className="hidden rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/45 md:inline-flex">{currentConfig.label}</span>
                </label>
                <button type="submit" className="inline-flex min-h-[84px] items-center justify-center gap-3 rounded-[26px] bg-accent px-8 text-sm font-semibold text-white transition-colors hover:bg-accent/90">
                  开始检索
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>

            {error ? <div className="flex items-start gap-3 rounded-[22px] border border-red-500/18 bg-red-500/8 px-5 py-4 text-sm text-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div> : null}
          </div>
        </motion.section>
      </SearchShell>
    );
  }

  return (
    <SearchShell>
      <div className="space-y-6">
        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }} className="sticky top-3 z-20 pb-4">
          <div className="overflow-hidden rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(28,34,46,0.96),rgba(20,25,35,0.96))] shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
            <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
              <div className="flex min-w-0 items-start justify-between gap-4 lg:flex-1">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-white/42">
                    <Icon className="h-3.5 w-3.5 text-accent/82" />
                    {currentConfig.label}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <h2 className="break-all text-[1.9rem] font-semibold tracking-[-0.06em] text-white sm:text-[2.15rem]">{resultTitle}</h2>
                    <button type="button" onClick={handleCopy} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3 text-xs font-medium text-white/76 transition-colors hover:border-accent/25 hover:text-white">
                      <Copy className="h-3.5 w-3.5" />
                      {copied ? '已复制' : '复制'}
                    </button>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="lg:w-auto lg:flex-none">
                <div className="flex items-center gap-3 rounded-full border border-white/10 bg-[#f4f6fa]/6 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <div className="flex min-w-0 items-center gap-3 rounded-full bg-[#1a202b] px-4 py-3 sm:min-w-[440px] lg:min-w-[520px]">
                    <Search className="h-4.5 w-4.5 shrink-0 text-accent/90" />
                    <input value={searchQuery} onChange={(event) => { const value = event.target.value; setSearchQuery(value); const detectedType = detectSearchType(value); if (detectedType) setActiveSearchType(detectedType); }} placeholder={currentConfig.placeholder} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/28 sm:text-base" />
                    <span className="hidden rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-white/45 md:inline-flex">{currentConfig.label}</span>
                  </div>
                  <button type="submit" disabled={loading} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-70">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    检索
                  </button>
                </div>
              </form>
            </div>

          </div>
        </motion.section>

        {error ? <div className="flex items-start gap-3 rounded-[22px] border border-red-500/18 bg-red-500/8 px-5 py-4 text-sm text-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div> : null}

        {loading && !results ? <div className="flex min-h-[320px] items-center justify-center rounded-[28px] border border-white/8 bg-[#0d1219]/90"><div className="flex items-center gap-3 text-sm text-white/62"><Loader2 className="h-5 w-5 animate-spin text-accent" />正在加载情报结果</div></div> : null}
        {results ? (
          <>
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.04 }} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {activeSearchType === 'cve' ? (
                <>
                  <CountMetric label="情报脉冲" value={counts.pulses} highlight={counts.pulses > 0} active={false} />
                  <CountMetric label="利用信号" value={toDisplayText(cveExploitActivity?.exploitSignalCount, '0')} highlight={Boolean(cveExploitActivity?.exploitSignalCount)} active={false} />
                  <CountMetric label="受影响产品" value={cveTargetedProducts.length} highlight={cveTargetedProducts.length > 0} active={false} />
                  <CountMetric label="EPSS" value={cveEpss ? formatPercentFromRatio(cveEpss.score) : 'N/A'} highlight={Boolean(cveEpss && typeof cveEpss.score === 'number' && cveEpss.score > 0)} active={false} />
                </>
              ) : (
                <>
                  <CountMetric label="情报" value={tabCounts.pulses} highlight={pulsesState.status === 'success' && counts.pulses > 0} active={activeTab === 'pulses'} />
                  <CountMetric label="被动 DNS" value={tabCounts['passive-dns']} highlight={passiveDnsState.status === 'success' && counts.passiveDns > 0} active={activeTab === 'passive-dns'} />
                  <CountMetric label="关联 URL" value={tabCounts.urls} highlight={urlListState.status === 'success' && counts.urls > 0} active={activeTab === 'urls'} />
                  <CountMetric label="恶意样本" value={tabCounts.malware} highlight={malwareState.status === 'success' && counts.malware > 0} active={activeTab === 'malware'} />
                </>
              )}
            </motion.section>

            {activeSearchType === 'cve' ? (
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
                className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]"
              >
                <div className="space-y-6">
                  <Panel title="CVE 概览" subtitle="概览">
                    <div className="space-y-5">
                      <div className="flex flex-wrap gap-2">
                        {cveSourceTags.map((tag: string) => (
                          <span key={tag} className="rounded-full border border-accent/15 bg-accent/10 px-3 py-1 text-xs text-accent">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <p className="text-sm leading-7 text-white/64">{toDisplayText(results?.description, '暂无漏洞描述')}</p>
                      {cveReferenceLinks.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {cveReferenceLinks.map((link) => (
                            <a
                              key={link.href}
                              href={link.href}
                              target="_blank"
                              rel="noreferrer"
                              title={link.href}
                              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:border-accent/30 hover:bg-accent/10"
                            >
                              <span>{link.label}</span>
                              <span className="text-[10px] uppercase tracking-[0.18em] text-white/40">{link.hostname}</span>
                            </a>
                          ))}
                        </div>
                      ) : null}
                      <div className="grid gap-3 text-sm text-white/64 md:grid-cols-2">
                        <span>{`CVE：${toDisplayText(results?.indicator)}`}</span>
                        <span>{`CWE：${toDisplayText(results?.cwe || cveOverview?.cwe)}`}</span>
                        <span>{`发布时间：${toDisplayText(cveOverview?.published, publishedDate)}`}</span>
                        <span>{`最后修改：${toDisplayText(cveOverview?.lastModified)}`}</span>
                        <span>{`CVSS：${formatScore(cveOverview?.cvssScore ?? results?.base_score)}`}</span>
                        <span>{`严重等级：${toDisplayText(cveOverview?.severity ?? results?.severity)}`}</span>
                      </div>
                    </div>
                  </Panel>

                  <Panel title="利用活动" subtitle="动态">
                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className="rounded-[22px] border border-white/8 bg-white/[0.025] p-5">
                        <div className="text-xs uppercase tracking-[0.22em] text-white/40">威胁信号</div>
                        <div className="mt-4 grid gap-3 text-sm text-white/64">
                          <span>{`OTX 情报数：${toDisplayText(cveExploitActivity?.otxPulseCount, String(counts.pulses))}`}</span>
                          <span>{`Exploit 信号：${toDisplayText(cveExploitActivity?.exploitSignalCount, '0')}`}</span>
                          <span>{`活跃利用：${cveExploitActivity?.activeExploitation ? '是' : '否'}`}</span>
                          <span>{`当前优先级：${toDisplayText(cveExploitActivity?.pushLevel, 'Monitor')}`}</span>
                          <span>{`最后观测：${toDisplayText(cveExploitActivity?.lastObservedAt)}`}</span>
                          <span>{`CISA KEV：${results?.hasKev ? '是' : '否'}`}</span>
                        </div>
                      </div>
                      <div className="rounded-[22px] border border-white/8 bg-white/[0.025] p-5">
                        <div className="text-xs uppercase tracking-[0.22em] text-white/40">优先原因</div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {(Array.isArray(cveExploitActivity?.pushReasons) ? cveExploitActivity.pushReasons : []).length > 0 ? (
                            cveExploitActivity.pushReasons.map((reason: string) => (
                              <span key={reason} className="rounded-full border border-accent/15 bg-accent/10 px-3 py-1 text-xs text-accent">
                                {reason}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-white/56">暂无额外利用信号。</span>
                          )}
                        </div>
                        <div className="mt-5 grid gap-3 text-sm text-white/64">
                          <span>{`Threat Actors：${Array.isArray(cveExploitActivity?.associatedThreatActors) && cveExploitActivity.associatedThreatActors.length > 0 ? cveExploitActivity.associatedThreatActors.join(', ') : '暂无'}`}</span>
                          <span>{`Targeted Industries：${Array.isArray(cveExploitActivity?.industriesTargeted) && cveExploitActivity.industriesTargeted.length > 0 ? cveExploitActivity.industriesTargeted.join(', ') : '暂无'}`}</span>
                        </div>
                      </div>
                    </div>
                  </Panel>

                  <Panel title="漏洞利用预测评分（EPSS）" subtitle="EPSS">
                    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                      <div className="rounded-[22px] border border-white/8 bg-white/[0.025] p-5">
                        <div className="text-xs uppercase tracking-[0.22em] text-white/40">评分</div>
                        <div className="mt-4 grid gap-3 text-sm text-white/64">
                          <span>{`EPSS Score：${cveEpss ? formatPercentFromRatio(cveEpss.score) : 'N/A'}`}</span>
                          <span>{`EPSS Percentile：${cveEpss ? formatPercentFromRatio(cveEpss.percentile) : 'N/A'}`}</span>
                          <span>{`更新时间：${toDisplayText(cveEpss?.date)}`}</span>
                        </div>
                      </div>
                      <div className="rounded-[22px] border border-white/8 bg-white/[0.025] p-5 text-sm leading-7 text-white/60">
                        EPSS 用来衡量漏洞未来被利用的概率。分数越高，说明越值得优先跟进；Percentile 越高，说明在所有漏洞中的风险排序越靠前。
                      </div>
                    </div>
                  </Panel>
                </div>

                <div className="space-y-6">
                  <Panel title="CVSS V3 严重度" subtitle="严重度">
                    <div className="grid gap-3">
                      {cveCvssRows.map((row) => (
                        <div key={row.label} className="grid gap-2 border-b border-white/6 pb-3 last:border-b-0 last:pb-0 md:grid-cols-[180px_1fr]">
                          <div className="text-[11px] uppercase tracking-[0.22em] text-white/40">{row.label}</div>
                          <div className="text-sm text-white/82">{row.value}</div>
                        </div>
                      ))}
                    </div>
                  </Panel>

                  <Panel title="威胁情报" subtitle="情报脉冲">
                    {cveSourceRoles.length > 0 ? (
                      <div className="mb-4 rounded-[22px] border border-white/8 bg-white/[0.025] p-5">
                        <div className="text-xs uppercase tracking-[0.22em] text-white/40">来源职责</div>
                        <div className="mt-4 grid gap-3">
                          {cveSourceRoles.map((role: any) => (
                            <div key={role.key} className="grid gap-1 border-b border-white/6 pb-3 last:border-b-0 last:pb-0 md:grid-cols-[132px_1fr]">
                              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{role.label}</div>
                              <div className="text-sm leading-6 text-white/60">{role.description}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {pulseEntries.length > 0 ? (
                      <div className="space-y-4">
                        {pulseEntries.slice(0, 6).map((pulse: any, index: number) => (
                          <article key={`${pulse?.id || pulse?.name || 'cve-pulse'}-${index}`} className="rounded-[22px] border border-white/8 bg-white/[0.025] p-5">
                            <div className="text-sm font-semibold text-white/88">{toDisplayText(pulse?.name, '未命名情报')}</div>
                            <p className="mt-3 text-sm leading-7 text-white/60">{toDisplayText(pulse?.description, '暂无情报描述')}</p>
                            <div className="mt-4 grid gap-2 text-sm text-white/56">
                              <span>{`作者：${toDisplayText(pulse?.author?.username || pulse?.author_name, '未知')}`}</span>
                              <span>{`更新时间：${formatDisplayDate(pulse?.modified)}`}</span>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[22px] border border-dashed border-white/10 px-5 py-8 text-sm text-white/52">暂无相关 OTX 情报。</div>
                    )}
                  </Panel>

                  <Panel title="受影响产品" subtitle="产品">
                    {cveTargetedProducts.length > 0 ? (
                      <div className="space-y-4">
                        {cveTargetedProducts.map((entry: any, index: number) => (
                          <div key={`${entry.vendor || 'vendor'}-${entry.product || 'product'}-${index}`} className="rounded-[22px] border border-white/8 bg-white/[0.025] p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-white/88">{`${toDisplayText(entry.vendor)} / ${toDisplayText(entry.product)}`}</div>
                                <div className="mt-2 text-xs uppercase tracking-[0.22em] text-white/40">{`${toDisplayText(entry.source, 'nvd')} / ${toDisplayText(entry.confidence, 'high')}`}</div>
                              </div>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              {Array.isArray(entry.versions) && entry.versions.length > 0 ? (
                                entry.versions.map((version: string) => (
                                  <span key={version} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/68">
                                    {version}
                                  </span>
                                ))
                              ) : (
                                <span className="text-sm text-white/56">版本范围暂未标注。</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[22px] border border-dashed border-white/10 px-5 py-8 text-sm text-white/52">当前未解析到标准化受影响产品。</div>
                    )}
                  </Panel>
                </div>
              </motion.section>
            ) : null}

            {activeSearchType !== 'cve' ? (
            <>
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.08 }} className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,22,31,0.98),rgba(10,14,20,0.98))]">
              <div className="border-b border-white/8 px-6 py-5 sm:px-7">
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/38">分析概览</p>
                <div className="mt-3">
                  <div className="space-y-2">
                    <h3 className="text-[1.95rem] font-semibold tracking-[-0.07em] text-white">分析概览</h3>
                  </div>
                </div>
              </div>

              <div className="grid gap-0 xl:grid-cols-[1fr_0.84fr]">
                <div className="px-6 py-5 sm:px-7">{overviewLeft.map((item) => <SummaryRow key={item.label} label={item.label} value={item.value} />)}</div>
                <div className="border-t border-white/8 px-6 py-5 xl:border-l xl:border-t-0 sm:px-7">{overviewRight.map((item) => <SummaryRow key={item.label} label={item.label} value={item.value} />)}</div>
              </div>
            </motion.section>

            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.12 }} className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,19,28,0.96),rgba(8,12,18,0.96))]">
              <div className="border-b border-white/8 px-6 pt-6 sm:px-7">
                <div className="flex flex-wrap gap-5 overflow-x-auto">
                  <ResultTabButton label="分析" active={activeTab === 'analysis'} onClick={() => handleTabChange('analysis')} />
                  <ResultTabButton label="被动 DNS" count={tabCounts['passive-dns']} active={activeTab === 'passive-dns'} onClick={() => handleTabChange('passive-dns')} />
                  <ResultTabButton label="关联情报" count={tabCounts.pulses} active={activeTab === 'pulses'} onClick={() => handleTabChange('pulses')} />
                  <ResultTabButton label="恶意样本" count={tabCounts.malware} active={activeTab === 'malware'} onClick={() => handleTabChange('malware')} />
                  <ResultTabButton label="关联 URL" count={tabCounts.urls} active={activeTab === 'urls'} onClick={() => handleTabChange('urls')} />
                </div>
              </div>

              <div ref={detailsSectionRef as React.RefObject<HTMLDivElement>} className="px-6 py-6 sm:px-7">
                {activeTab === 'analysis' ? (
                  <div className="space-y-6">
                    <Panel title="被动 DNS" subtitle="分析">
                      {passiveDnsEntries.length > 0 ? (
                        <>
                          <div className="overflow-hidden rounded-[22px] border border-white/8">
                            <div className="hidden grid-cols-[1.5fr_110px_1.1fr_1fr_1fr_1.1fr_0.9fr] gap-4 border-b border-white/8 bg-white/[0.02] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-white/38 xl:grid">
                              <span>主机名</span><span>类型</span><span>地址</span><span>首次发现</span><span>最近出现</span><span>ASN</span><span>国家/地区</span>
                            </div>
                            <div className="divide-y divide-white/6">
                              {passiveDnsEntries.slice(0, 8).map((record: any, index: number) => (
                                <div key={`${record?.hostname || 'analysis-pdns'}-${index}`} className="px-4 py-4">
                                  <div className="hidden grid-cols-[1.5fr_110px_1.1fr_1fr_1fr_1.1fr_0.9fr] gap-4 xl:grid">
                                    <span className="break-all text-sm text-accent">{toDisplayText(record?.hostname)}</span>
                                    <span className="text-sm text-white/72">{toDisplayText(record?.type || record?.record_type)}</span>
                                    <span className="break-all text-sm text-white/72">{toDisplayText(record?.address || results?.indicator)}</span>
                                    <span className="text-sm text-white/56">{toDisplayText(record?.first)}</span>
                                    <span className="text-sm text-white/56">{toDisplayText(record?.last)}</span>
                                    <span className="text-sm text-white/72">{toDisplayText(record?.asn)}</span>
                                    <span className="text-sm text-white/72">{toDisplayText(record?.country || record?.country_name || record?.flag_title)}</span>
                                  </div>
                                  <div className="grid gap-2 xl:hidden">
                                    <div className="break-all text-sm font-medium text-accent">{toDisplayText(record?.hostname)}</div>
                                    <div className="grid gap-2 text-sm text-white/58 sm:grid-cols-2">
                                      <span>类型：{toDisplayText(record?.type || record?.record_type)}</span>
                                      <span>地址：{toDisplayText(record?.address || results?.indicator)}</span>
                                      <span>首次发现：{toDisplayText(record?.first)}</span>
                                      <span>最近出现：{toDisplayText(record?.last)}</span>
                                      <span>ASN：{toDisplayText(record?.asn)}</span>
                                      <span>国家/地区：{toDisplayText(record?.country || record?.country_name || record?.flag_title)}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : passiveDnsIsLoading ? <SectionLoadingState label="被动 DNS" /> : <div className="rounded-[22px] border border-dashed border-white/10 px-5 py-8 text-sm text-white/52">{getSectionListMessage(passiveDnsState, counts.passiveDns, '被动 DNS 记录')}</div>}
                    </Panel>

                    <Panel title="关联 URL" subtitle="URL">
                      {urlEntries.length > 0 ? (
                        <>
                          <div className="overflow-hidden rounded-[22px] border border-white/8">
                          <div className="hidden grid-cols-[120px_1.8fr_1.35fr_120px_110px_130px] gap-4 border-b border-white/8 bg-white/[0.02] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-white/38 xl:grid">
                            <span>检测日期</span><span>URL</span><span>主机名</span><span>响应码</span><span>IP</span><span>安全浏览</span>
                          </div>
                          <div className="divide-y divide-white/6">
                            {urlEntries.map((record: any, index: number) => (
                              <div key={`${record?.url || record?.hostname || 'analysis-url'}-${index}`} className="px-4 py-4">
                                <div className="hidden grid-cols-[120px_1.8fr_1.35fr_120px_110px_130px] gap-4 xl:grid">
                                  <span className="text-sm text-white/56">{toDisplayText(record?.date)}</span>
                                  <span className="break-all text-sm text-accent">{toDisplayText(record?.url || record?.indicator)}</span>
                                  <span className="break-all text-sm text-white/72">{toDisplayText(record?.hostname)}</span>
                                  <span className="text-sm text-white/72">{toDisplayText(record?.httpcode || record?.result?.urlworker?.http_code, 'N/A')}</span>
                                  <span className="text-sm text-white/72">{toDisplayText(record?.ip || record?.result?.urlworker?.ip)}</span>
                                  <span className="text-sm text-white/56">{Array.isArray(record?.gsb) && record.gsb.length > 0 ? '已命中' : '未命中'}</span>
                                </div>
                                <div className="grid gap-2 xl:hidden">
                                  <div className="break-all text-sm font-medium text-accent">{toDisplayText(record?.url || record?.indicator)}</div>
                                  <div className="grid gap-2 text-sm text-white/58 sm:grid-cols-2">
                                    <span>日期：{toDisplayText(record?.date)}</span>
                                    <span>主机名：{toDisplayText(record?.hostname)}</span>
                                    <span>响应码：{toDisplayText(record?.httpcode || record?.result?.urlworker?.http_code, 'N/A')}</span>
                                    <span>IP：{toDisplayText(record?.ip || record?.result?.urlworker?.ip)}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          </div>
                        </>
                      ) : sectionStatus.url_list === 'loading' ? <SectionLoadingState label="关联 URL" /> : <div className="rounded-[22px] border border-dashed border-white/10 px-5 py-8 text-sm text-white/52">{getSectionListMessage(urlListState, counts.urls, '关联 URL')}</div>}
                    </Panel>

                    <Panel title="关联文件" subtitle="文件">
                      {malwareEntries.length > 0 ? (
                        <>
                          <div className="overflow-hidden rounded-[22px] border border-white/8">
                          <div className="hidden grid-cols-[120px_1.9fr_1fr_1fr_1.2fr] gap-4 border-b border-white/8 bg-white/[0.02] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-white/38 xl:grid">
                            <span>日期</span><span>哈希</span><span>Avast</span><span>AVG</span><span>ClamAV / 微软防护</span>
                          </div>
                          <div className="divide-y divide-white/6">
                            {malwareEntries.map((record: any, index: number) => {
                              const primaryHash = toDisplayText(record?.sha256 || record?.hash || record?.sha1 || record?.md5, 'N/A');
                              return (
                                <div key={`${record?.sha256 || record?.hash || record?.md5 || 'analysis-malware'}-${index}`} className="px-4 py-4">
                                  <div className="hidden grid-cols-[120px_1.9fr_1fr_1fr_1.2fr] gap-4 xl:grid">
                                    <span className="text-sm text-white/56">{toDisplayText(record?.date)}</span>
                                    <span className="break-all text-sm text-accent">{primaryHash}</span>
                                    <span className="text-sm text-white/72">{toDisplayText(record?.detections?.avast, 'N/A')}</span>
                                    <span className="text-sm text-white/72">{toDisplayText(record?.detections?.avg, 'N/A')}</span>
                                    <span className="text-sm text-white/72">{[record?.detections?.clamav, record?.detections?.msdefender].filter(Boolean).join(' / ') || 'N/A'}</span>
                                  </div>
                                  <div className="grid gap-2 xl:hidden">
                                    <div className="break-all text-sm font-medium text-accent">{primaryHash}</div>
                                    <div className="grid gap-2 text-sm text-white/58 sm:grid-cols-2">
                                      <span>日期：{toDisplayText(record?.date)}</span>
                                      <span>Avast：{toDisplayText(record?.detections?.avast, 'N/A')}</span>
                                      <span>AVG：{toDisplayText(record?.detections?.avg, 'N/A')}</span>
                                      <span>ClamAV / Defender：{[record?.detections?.clamav, record?.detections?.msdefender].filter(Boolean).join(' / ') || 'N/A'}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          </div>
                        </>
                      ) : sectionStatus.malware === 'loading' ? <SectionLoadingState label="恶意样本" /> : <div className="rounded-[22px] border border-dashed border-white/10 px-5 py-8 text-sm text-white/52">{getSectionListMessage(malwareState, counts.malware, '恶意样本')}</div>}
                    </Panel>

                    <Panel title="HTTP 扫描" subtitle="HTTP 扫描">
                      {httpScanEntries.length > 0 ? (
                        <div className="overflow-hidden rounded-[22px] border border-white/8">
                          <div className="hidden grid-cols-[180px_1fr] gap-4 border-b border-white/8 bg-white/[0.02] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-white/38 xl:grid">
                            <span>记录项</span><span>内容</span>
                          </div>
                          <div className="divide-y divide-white/6">
                            {httpScanEntries.map((record: any, index: number) => (
                              <div key={`${record?.key || record?.name || 'http-scan'}-${index}`} className="px-4 py-4">
                                <div className="hidden grid-cols-[180px_1fr] gap-4 xl:grid">
                                  <span className="text-sm text-white/72">{toDisplayText(record?.name || record?.key, '未命名扫描项')}</span>
                                  <span className="text-sm leading-6 text-white/56">{toDisplayText(record?.value, 'N/A')}</span>
                                </div>
                                <div className="grid gap-2 xl:hidden">
                                  <div className="text-sm font-medium text-white/84">{toDisplayText(record?.name || record?.key, '未命名扫描项')}</div>
                                  <div className="text-sm leading-6 text-white/56">{toDisplayText(record?.value, 'N/A')}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : <div className="rounded-[22px] border border-dashed border-white/10 px-5 py-8 text-sm text-white/52">{getSectionListMessage(httpScansState, results?.derived?.http_scan_count ?? httpScanEntries.length, 'HTTP 扫描记录')}</div>}
                    </Panel>
                  </div>
                ) : null}
                {activeTab === 'passive-dns' ? (
                  passiveDnsEntries.length > 0 ? (
                    <div className="space-y-4">
                      <div className="overflow-hidden rounded-[22px] border border-white/8">
                        <div className="hidden grid-cols-[120px_1.4fr_120px_1.1fr_1fr_1fr_1.2fr_0.9fr] gap-4 border-b border-white/8 bg-white/[0.02] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-white/38 xl:grid">
                          <span>状态</span><span>主机名</span><span>类型</span><span>地址</span><span>首次发现</span><span>最近出现</span><span>ASN</span><span>国家/地区</span>
                        </div>
                        <div className="divide-y divide-white/6">
                          {pagedPassiveDnsEntries.map((record: any, index: number) => (
                            <div key={`${record?.hostname || 'pdns'}-${index}`} className="px-4 py-4">
                              <div className="hidden grid-cols-[120px_1.4fr_120px_1.1fr_1fr_1fr_1.2fr_0.9fr] gap-4 xl:grid">
                                <span className="text-sm text-white/56">{toDisplayText(record?.status, '未知')}</span>
                                <span className="break-all text-sm text-accent">{toDisplayText(record?.hostname)}</span>
                                <span className="text-sm text-white/72">{toDisplayText(record?.type)}</span>
                                <span className="break-all text-sm text-white/72">{toDisplayText(record?.address || record?.indicator || results?.indicator)}</span>
                                <span className="text-sm text-white/56">{toDisplayText(record?.first)}</span>
                                <span className="text-sm text-white/56">{toDisplayText(record?.last)}</span>
                                <span className="text-sm text-white/72">{toDisplayText(record?.asn)}</span>
                                <span className="text-sm text-white/72">{toDisplayText(record?.country || record?.country_name)}</span>
                              </div>
                              <div className="grid gap-2 xl:hidden">
                                <div className="flex items-center justify-between gap-3"><div className="break-all text-sm font-medium text-accent">{toDisplayText(record?.hostname)}</div><span className="text-xs uppercase tracking-[0.18em] text-white/42">{toDisplayText(record?.status, '未知')}</span></div>
                                <div className="grid gap-2 text-sm text-white/58 sm:grid-cols-2">
                                  <span>类型：{toDisplayText(record?.type)}</span>
                                  <span>地址：{toDisplayText(record?.address || record?.indicator || results?.indicator)}</span>
                                  <span>首次发现：{toDisplayText(record?.first)}</span>
                                  <span>最近出现：{toDisplayText(record?.last)}</span>
                                  <span>ASN：{toDisplayText(record?.asn)}</span>
                                  <span>国家/地区：{toDisplayText(record?.country || record?.country_name)}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <PaginationControls
                        currentPage={sectionViewPages.passive_dns}
                        totalPages={passiveDnsTotalPages}
                        loading={sectionStatus.passive_dns === 'loading'}
                        onChange={(page) => handleSectionPageChange('passive_dns', page)}
                      />
                    </div>
                  ) : passiveDnsIsLoading ? <SectionLoadingState label="被动 DNS" /> : <div className="rounded-[22px] border border-dashed border-white/10 px-5 py-8 text-sm text-white/52">{getSectionListMessage(passiveDnsState, counts.passiveDns, '被动 DNS 记录')}</div>
                ) : null}

                {activeTab === 'pulses' ? (
                  pulseEntries.length > 0 ? (
                    <div className="space-y-5">
                      {pulseEntries.map((pulse: any, index: number) => {
                        const tags = Array.isArray(pulse?.tags) ? pulse.tags.filter((tag: any) => isDisplayableValue(tag)) : [];
                        return (
                          <article key={`${pulse?.id || pulse?.name || 'pulse'}-${index}`} className="rounded-[22px] border border-white/8 bg-white/[0.025] p-5">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <h4 className="text-lg font-semibold tracking-[-0.04em] text-white">{toDisplayText(pulse?.name, '未命名情报')}</h4>
                                <p className="mt-3 text-sm leading-7 text-white/64">{toDisplayText(pulse?.description, '暂无描述')}</p>
                              </div>
                              <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/50">{toDisplayText(pulse?.TLP, 'TLP 未知')}</span>
                            </div>
                            <div className="mt-4 grid gap-3 text-sm text-white/58 md:grid-cols-3">
                              <span>作者：{toDisplayText(pulse?.author?.username || pulse?.author_name, '未知来源')}</span>
                              <span>更新时间：{formatDisplayDate(pulse?.modified)}</span>
                              <span>指标数量：{toDisplayText(pulse?.indicator_count)}</span>
                            </div>
                            {tags.length > 0 ? <div className="mt-4 flex flex-wrap gap-2">{tags.map((tag: string, tagIndex: number) => <span key={`${tag}-${tagIndex}`} className="rounded-full border border-accent/15 bg-accent/10 px-3 py-1 text-xs text-accent">{tag}</span>)}</div> : null}
                          </article>
                        );
                      })}
                    </div>
                  ) : <div className="rounded-[22px] border border-dashed border-white/10 px-5 py-8 text-sm text-white/52">{pulsesState.message}</div>
                ) : null}

                {activeTab === 'malware' ? (
                  malwareEntries.length > 0 ? (
                    <div className="space-y-4">
                        {pagedMalwareEntries.map((record: any, index: number) => {
                        const primaryHash = toDisplayText(record?.sha256 || record?.hash || record?.sha1 || record?.md5, 'N/A');
                        return (
                        <div key={`${record?.sha256 || record?.hash || record?.md5 || record?.name || 'malware'}-${index}`} className="rounded-[22px] border border-white/8 bg-white/[0.025] p-5">
                          <div className="text-base font-semibold text-white/88">{toDisplayText(record?.name || record?.family || record?.hash, '未命名样本')}</div>
                          <div className="mt-4 grid gap-3 text-sm text-white/58 md:grid-cols-3">
                            <span>家族：{toDisplayText(record?.family)}</span>
                            <span>哈希：{primaryHash}</span>
                            <span>日期：{toDisplayText(record?.date)}</span>
                          </div>
                          {record?.detections ? <div className="mt-4 text-sm text-white/52">检出结果：{Object.entries(record.detections).filter(([, value]) => Boolean(value)).map(([engine, value]) => `${engine}: ${value}`).join(' · ') || 'N/A'}</div> : null}
                        </div>
                      )})}
                      <PaginationControls
                        currentPage={sectionViewPages.malware}
                        totalPages={malwareTotalPages}
                        loading={sectionStatus.malware === 'loading'}
                        onChange={(page) => handleSectionPageChange('malware', page)}
                      />
                    </div>
                  ) : sectionStatus.malware === 'loading' ? <SectionLoadingState label="恶意样本" /> : <div className="rounded-[22px] border border-dashed border-white/10 px-5 py-8 text-sm text-white/52">{getSectionListMessage(malwareState, counts.malware, '恶意样本')}</div>
                ) : null}

                {activeTab === 'urls' ? (
                  urlEntries.length > 0 ? (
                    <div className="space-y-4">
                        {pagedUrlEntries.map((record: any, index: number) => (
                        <div key={`${record?.url || record?.hostname || 'url'}-${index}`} className="rounded-[22px] border border-white/8 bg-white/[0.025] p-5">
                          <div className="break-all text-sm font-semibold text-accent">{toDisplayText(record?.url || record?.hostname || record?.indicator)}</div>
                          <div className="mt-4 grid gap-3 text-sm text-white/58 md:grid-cols-3">
                            <span>域名：{toDisplayText(record?.domain)}</span>
                            <span>主机名：{toDisplayText(record?.hostname)}</span>
                            <span>IP：{toDisplayText(record?.ip)}</span>
                          </div>
                        </div>
                      ))}
                      <PaginationControls
                        currentPage={sectionViewPages.url_list}
                        totalPages={urlTotalPages}
                        loading={sectionStatus.url_list === 'loading'}
                        onChange={(page) => handleSectionPageChange('url_list', page)}
                      />
                    </div>
                  ) : sectionStatus.url_list === 'loading' ? <SectionLoadingState label="关联 URL" /> : <div className="rounded-[22px] border border-dashed border-white/10 px-5 py-8 text-sm text-white/52">{getSectionListMessage(urlListState, counts.urls, '关联 URL')}</div>
                ) : null}
              </div>
            </motion.section>
            </>
            ) : null}
          </>
        ) : null}
      </div>
    </SearchShell>
  );
};

export default IocSearch;
