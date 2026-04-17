import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { ArrowUpRight, ExternalLink, Loader2, RefreshCw } from 'lucide-react';

import { cn } from '../../lib/utils';
import {
  cveIntelService,
  type CveIntelFeedWindow,
  type CveIntelItem,
} from '../../services/cveIntelService';

const FEED_LIMIT = 8;
const REFRESH_INTERVAL_MS = 60_000;

const formatAbsoluteTime = (value?: string) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatRelativeTime = (value?: string) => {
  if (!value) return '未知';

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '未知';

  const diff = Date.now() - timestamp;
  if (diff < 60_000) return '刚刚更新';

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;

  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours} 小时前`;

  const days = Math.floor(diff / 86_400_000);
  return `${days} 天前`;
};

const sanitizeText = (value?: string, fallback = '暂无数据') => {
  if (!value) return fallback;
  const text = value.trim();
  return text || fallback;
};

const getPushTone = (level?: string) => {
  const normalized = String(level || '').toLowerCase();

  if (normalized.includes('high')) return 'border-rose-400/25 bg-rose-400/10 text-rose-200';
  if (normalized.includes('attention') || normalized.includes('medium')) {
    return 'border-amber-400/25 bg-amber-400/10 text-amber-200';
  }

  return 'border-white/10 bg-white/[0.04] text-white/68';
};

const getSeverityPill = (score: number | null, severity?: string) => {
  if (typeof score === 'number') {
    if (score >= 9) return '严重';
    if (score >= 7) return '高危';
    if (score >= 4) return '中危';
    return '低危';
  }

  const normalized = String(severity || '').toLowerCase();
  if (normalized.includes('critical')) return '严重';
  if (normalized.includes('high')) return '高危';
  if (normalized.includes('medium')) return '中危';
  if (normalized.includes('low')) return '低危';
  return severity || '未知';
};

const getReferenceLabel = (href: string) => {
  try {
    const url = new URL(href);
    return url.hostname.replace(/^www\./i, '');
  } catch {
    return '相关链接';
  }
};

const getCacheStatusLabel = (status?: string) => {
  if (status === 'refreshing') return '后台刷新中';
  if (status === 'stale') return '展示缓存快照';
  return '最新快照';
};

const buildPrimaryReferenceLinks = (item: CveIntelItem) => {
  const uniqueReferences = Array.isArray(item.references) ? Array.from(new Set(item.references.filter(Boolean))) : [];
  return uniqueReferences.slice(0, 3);
};

type CveIntelPanelProps = {
  activeWindow: CveIntelFeedWindow;
};

const CveIntelPanel = ({ activeWindow }: CveIntelPanelProps) => {
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const swrKey = useMemo(
    () => ['cve-intel-feed', activeWindow, FEED_LIMIT] as const,
    [activeWindow],
  );

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    swrKey,
    ([, window, limit]) => cveIntelService.getLatestFeed({ window, limit }),
    {
      refreshInterval: REFRESH_INTERVAL_MS,
      dedupingInterval: 15_000,
      revalidateOnFocus: true,
      keepPreviousData: true,
    },
  );

  const items = Array.isArray(data?.items) ? data.items : [];
  const isRefreshing = isValidating || isManualRefreshing;

  const handleRefresh = async () => {
    setIsManualRefreshing(true);
    try {
      await mutate(
        cveIntelService.getLatestFeed({
          window: activeWindow,
          limit: FEED_LIMIT,
          noCache: true,
        }),
        {
          revalidate: false,
          populateCache: true,
        },
      );
    } finally {
      setIsManualRefreshing(false);
    }
  };

  return (
    <motion.aside
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
      className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,22,31,0.98),rgba(10,14,20,0.98))] xl:sticky xl:top-6 xl:flex xl:max-h-[calc(100vh-2.5rem)] xl:flex-col"
    >
      <div className="border-b border-white/8 px-6 py-5 sm:px-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.05em] text-white">最新 CVE 情报</h2>
            <p className="mt-1 text-sm text-white/50">
              聚合近期公开漏洞动态，优先展示最新披露和具备利用信号的漏洞，帮助用户快速掌握当前风险面。
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/72 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            刷新
          </button>
        </div>

        {data ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.025] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.22em] text-white/34">Feed Status</div>
              <div className="mt-2 text-sm font-medium text-white/82">
                {formatRelativeTime(data.generatedAt)}
              </div>
              <div className="mt-1 text-xs text-white/45">
                {`${getCacheStatusLabel(data.meta.cacheStatus)} · ${formatAbsoluteTime(data.generatedAt)}`}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-[20px] border border-white/8 bg-white/[0.025] px-4 py-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/32">总数</div>
                <div className="mt-2 text-lg font-semibold text-white">{data.meta.totalSignals}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/32">建议跟进</div>
                <div className="mt-2 text-lg font-semibold text-amber-200">{data.meta.recommendedCount}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/32">KEV</div>
                <div className="mt-2 text-lg font-semibold text-rose-200">{data.meta.kevCount}</div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-4 px-6 py-6 sm:px-7 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
        {isLoading ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.02]">
            <div className="flex items-center gap-3 text-sm text-white/58">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              正在加载最新 CVE 情报...
            </div>
          </div>
        ) : error ? (
          <div className="rounded-[24px] border border-rose-400/15 bg-rose-400/8 px-5 py-8 text-sm text-rose-100">
            {error instanceof Error ? error.message : 'CVE 情报加载失败。'}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-sm text-white/52">
            当前时间窗口内暂无新的 CVE 情报。
          </div>
        ) : (
          items.map((item) => {
            const referenceLinks = buildPrimaryReferenceLinks(item);

            return (
              <article
                key={item.cveId}
                className="rounded-[24px] border border-white/8 bg-white/[0.025] p-5"
                style={{ contentVisibility: 'auto', containIntrinsicSize: '320px' }}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('rounded-full border px-3 py-1 text-xs', getPushTone(item.pushLevel))}>
                        {item.pushRecommended ? '建议优先跟进' : '持续观察'}
                      </span>
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/64">
                        {getSeverityPill(item.cvssScore, item.severity)}
                      </span>
                      {item.hasKev ? (
                        <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-xs text-rose-200">
                          CISA KEV
                        </span>
                      ) : null}
                    </div>

                    <h3 className="mt-4 text-lg font-semibold tracking-[-0.04em] text-white">{item.cveId}</h3>
                    <p className="mt-2 text-sm font-medium text-white/78">{sanitizeText(item.title, item.cveId)}</p>
                    <p className="mt-3 text-sm leading-7 text-white/60">{sanitizeText(item.summary)}</p>
                  </div>

                  <div className="rounded-[20px] border border-white/8 bg-[#111723] px-4 py-3 text-right">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-white/34">CVSS</div>
                    <div className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-white">
                      {typeof item.cvssScore === 'number' ? item.cvssScore.toFixed(1) : 'N/A'}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 text-sm text-white/58">
                  <span>{`最近观测：${formatAbsoluteTime(item.latestSeen || item.lastModified || item.published)}`}</span>
                  <span>{`OTX 提及数：${item.otxMentionCount}`}</span>
                  <span>{`优先级：${sanitizeText(item.pushLevel, 'Monitor')}`}</span>
                </div>

                {item.sourceTags.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.sourceTags.map((tag) => (
                      <span
                        key={`${item.cveId}-${tag}`}
                        className="rounded-full border border-accent/15 bg-accent/10 px-3 py-1 text-xs text-accent"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                {item.pushReasons.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.pushReasons.map((reason) => (
                      <span
                        key={`${item.cveId}-${reason}`}
                        className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/64"
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-2">
                  {referenceLinks.map((reference) => (
                    <a
                      key={`${item.cveId}-${reference}`}
                      href={reference}
                      target="_blank"
                      rel="noreferrer"
                      title={reference}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                      {getReferenceLabel(reference)}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ))}

                  {item.sourceDetails?.aliyun?.sourceUrl ? (
                    <a
                      href={item.sourceDetails.aliyun.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                      阿里云漏洞库
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}

                  <a
                    href={`/dns?q=${encodeURIComponent(item.cveId)}`}
                    className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-2 text-xs text-accent transition-colors hover:bg-accent/15"
                  >
                    站内查看
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </article>
            );
          })
        )}
      </div>
    </motion.aside>
  );
};

export default CveIntelPanel;
