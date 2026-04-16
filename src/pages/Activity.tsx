import { startTransition, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity as ActivityIcon,
  ArrowUpRight,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react';

import { otxApi } from '../api/otxApi';
import { cn } from '../lib/utils';

type ActivityPulse = {
  id: string;
  name: string;
  description?: string;
  author_name?: string;
  modified?: string;
  created?: string;
  TLP?: string;
  adversary?: string;
  tags?: string[];
  references?: string[];
  indicators?: Array<{ type?: string; indicator?: string }>;
};

type CveIntelItem = {
  cveId: string;
  title: string;
  summary: string;
  published?: string;
  lastModified?: string;
  latestSeen?: string;
  cvssScore: number | null;
  severity?: string;
  hasKev: boolean;
  otxMentionCount: number;
  sourceTags: string[];
  sourceDetails?: {
    aliyun?: {
      sourceUrl?: string;
    } | null;
  };
  pushScore: number;
  pushLevel: string;
  pushRecommended: boolean;
  pushReasons: string[];
};

type CveIntelFeed = {
  items?: CveIntelItem[];
};

type ActivityPayload = {
  results?: ActivityPulse[];
};

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

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';

  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return '刚刚';

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
  return text ? text : fallback;
};

const toTimestamp = (...values: Array<string | undefined>) => {
  for (const value of values) {
    if (!value) continue;
    const timestamp = new Date(value).getTime();
    if (!Number.isNaN(timestamp)) return timestamp;
  }

  return 0;
};

const getSeverityTone = (pulse: ActivityPulse) => {
  const haystack = `${pulse.name} ${pulse.description || ''}`.toLowerCase();

  if (/(ransomware|supply chain|0day|zero-day|backdoor|rat|apt|campaign)/i.test(haystack)) {
    return {
      label: '高危活动',
      className: 'border-rose-400/20 bg-rose-400/10 text-rose-200',
    };
  }

  if (/(phishing|stealer|malware|trojan|loader|botnet)/i.test(haystack)) {
    return {
      label: '重点关注',
      className: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    };
  }

  return {
    label: '常规监测',
    className: 'border-white/10 bg-white/[0.04] text-white/68',
  };
};

const getPushTone = (level?: string) => {
  const normalized = (level || '').toLowerCase();

  if (normalized.includes('high')) return 'border-rose-400/25 bg-rose-400/10 text-rose-200';
  if (normalized.includes('medium')) return 'border-amber-400/25 bg-amber-400/10 text-amber-200';
  return 'border-white/10 bg-white/[0.04] text-white/68';
};

const getSeverityPill = (score: number | null, severity?: string) => {
  if (typeof score === 'number') {
    if (score >= 9) return '严重';
    if (score >= 7) return '高危';
    if (score >= 4) return '中危';
    return '低危';
  }

  if (!severity) return '未知';

  const normalized = severity.toLowerCase();
  if (normalized.includes('critical')) return '严重';
  if (normalized.includes('high')) return '高危';
  if (normalized.includes('medium')) return '中危';
  if (normalized.includes('low')) return '低危';
  return severity;
};

const getWindowLabel = (windowKey: '24h' | '7d' | 'all') => {
  if (windowKey === '24h') return '近 24 小时';
  if (windowKey === '7d') return '近 7 天';
  return '全部';
};

const Activity = () => {
  const [items, setItems] = useState<ActivityPulse[]>([]);
  const [cveFeed, setCveFeed] = useState<CveIntelFeed>({});
  const [loading, setLoading] = useState(true);
  const [cveLoading, setCveLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [cveError, setCveError] = useState('');
  const [activeWindow, setActiveWindow] = useState<'24h' | '7d' | 'all'>('7d');

  useEffect(() => {
    let cancelled = false;

    const load = async (background = false) => {
      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
        setCveLoading(true);
      }

      const activityTask = otxApi
        .getActivity()
        .then((activityPayload: ActivityPayload) => {
          const results = Array.isArray(activityPayload?.results) ? activityPayload.results : [];
          if (!cancelled) {
            startTransition(() => {
              setItems(results);
              setError('');
            });
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : '活动流加载失败');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      const cveTask = otxApi
        .getLatestCveIntel({ limit: 8, window: activeWindow })
        .then((payload: CveIntelFeed) => {
          if (!cancelled) {
            startTransition(() => {
              setCveFeed(payload || {});
              setCveError('');
            });
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setCveFeed({});
            setCveError(err instanceof Error ? err.message : 'CVE 情报加载失败');
          }
        })
        .finally(() => {
          if (!cancelled) setCveLoading(false);
        });

      await Promise.allSettled([activityTask, cveTask]);
      if (!cancelled) setRefreshing(false);
    };

    void load();
    const timer = window.setInterval(() => void load(true), REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeWindow]);

  const filteredItems = useMemo(() => {
    const now = Date.now();

    return items.filter((item) => {
      if (activeWindow === 'all') return true;

      const time = new Date(item.modified || item.created || '').getTime();
      if (Number.isNaN(time)) return true;

      const age = now - time;
      if (activeWindow === '24h') return age <= 86_400_000;
      return age <= 7 * 86_400_000;
    });
  }, [activeWindow, items]);

  const cveItems = useMemo(
    () =>
      (Array.isArray(cveFeed.items) ? cveFeed.items : [])
        .slice()
        .sort(
          (left, right) =>
            toTimestamp(right.latestSeen, right.lastModified, right.published) -
            toTimestamp(left.latestSeen, left.lastModified, left.published),
        ),
    [cveFeed.items],
  );

  return (
    <div className="space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,22,31,0.98),rgba(10,14,20,0.98))]"
      >
        <div className="flex flex-col gap-6 px-6 py-6 sm:px-7 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.32em] text-white/38">Threat Activity</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
                <ActivityIcon className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-[2rem] font-semibold tracking-[-0.07em] text-white">活动流</h1>
                <p className="mt-1 text-sm text-white/54">
                  仅保留实时活动流与最新 CVE 情报，聚焦当前监测动态与优先漏洞。
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            {(['24h', '7d', 'all'] as const).map((windowKey) => (
              <button
                key={windowKey}
                type="button"
                onClick={() => setActiveWindow(windowKey)}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm transition-colors',
                  activeWindow === windowKey
                    ? 'border-accent/30 bg-accent/12 text-accent'
                    : 'border-white/10 bg-white/[0.03] text-white/64 hover:bg-white/[0.06]',
                )}
              >
                {getWindowLabel(windowKey)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/72 transition-colors hover:bg-white/[0.06]"
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              刷新
            </button>
          </div>
        </div>
      </motion.section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
          className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,19,28,0.96),rgba(8,12,18,0.96))]"
        >
          <div className="border-b border-white/8 px-6 py-5 sm:px-7">
            <h2 className="text-xl font-semibold tracking-[-0.05em] text-white">活动流</h2>
            <p className="mt-1 text-sm text-white/50">
              展示近期活动条目、摘要、标签、IOC 片段与外部参考链接。
            </p>
          </div>

          <div className="px-6 py-6 sm:px-7">
            {loading ? (
              <div className="flex min-h-[280px] items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.02]">
                <div className="flex items-center gap-3 text-sm text-white/58">
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  正在加载活动流...
                </div>
              </div>
            ) : error ? (
              <div className="rounded-[24px] border border-rose-400/15 bg-rose-400/8 px-5 py-8 text-sm text-rose-100">
                {error}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-sm text-white/52">
                当前时间窗口内暂无活动条目。
              </div>
            ) : (
              <div className="space-y-4">
                {filteredItems.map((item) => {
                  const tone = getSeverityTone(item);
                  const references = Array.isArray(item.references) ? item.references.filter(Boolean).slice(0, 2) : [];
                  const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean).slice(0, 8) : [];
                  const indicators = Array.isArray(item.indicators) ? item.indicators.slice(0, 5) : [];

                  return (
                    <article key={item.id} className="rounded-[24px] border border-white/8 bg-white/[0.025] p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn('rounded-full border px-3 py-1 text-xs', tone.className)}>{tone.label}</span>
                            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/54">
                              {item.TLP ? `TLP ${String(item.TLP).toUpperCase()}` : 'TLP 未标注'}
                            </span>
                            <span className="text-xs text-white/42">{formatRelativeTime(item.modified || item.created)}</span>
                          </div>

                          <h3 className="mt-4 text-xl font-semibold tracking-[-0.05em] text-white">
                            {sanitizeText(item.name, '未命名活动')}
                          </h3>
                          <p className="mt-3 line-clamp-3 text-sm leading-7 text-white/62">
                            {sanitizeText(item.description)}
                          </p>
                        </div>

                        <div className="rounded-[20px] border border-white/8 bg-[#111723] px-4 py-3 text-right">
                          <div className="text-[11px] uppercase tracking-[0.22em] text-white/34">最近时间</div>
                          <div className="mt-2 text-sm font-medium text-white/84">
                            {formatAbsoluteTime(item.modified || item.created)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 text-sm text-white/58 md:grid-cols-3">
                        <span>{`作者：${sanitizeText(item.author_name, '未知')}`}</span>
                        <span>{`IOC 数量：${Array.isArray(item.indicators) ? item.indicators.length : 0}`}</span>
                        <span>{`关联对手：${sanitizeText(item.adversary, '未标注')}`}</span>
                      </div>

                      {tags.length > 0 ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-accent/15 bg-accent/10 px-3 py-1 text-xs text-accent"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {indicators.length > 0 ? (
                        <div className="mt-5 rounded-[18px] border border-white/8 bg-black/10 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium text-white/82">关联 IOC</div>
                            <div className="text-xs text-white/40">最多展示 5 条</div>
                          </div>
                          <div className="mt-3 grid gap-2">
                            {indicators.map((indicator, index) => (
                              <div key={`${indicator.indicator || 'indicator'}-${index}`} className="flex flex-wrap items-center gap-2 text-sm">
                                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-white/48">
                                  {indicator.type || 'unknown'}
                                </span>
                                <span className="break-all text-white/72">{indicator.indicator || 'N/A'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {references.length > 0 ? (
                        <div className="mt-5 flex flex-wrap gap-2">
                          {references.map((reference) => (
                            <a
                              key={reference}
                              href={reference}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                            >
                              参考链接
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </motion.section>

        <motion.aside
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
          className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,22,31,0.98),rgba(10,14,20,0.98))]"
        >
          <div className="border-b border-white/8 px-6 py-5 sm:px-7">
            <h2 className="text-xl font-semibold tracking-[-0.05em] text-white">CVE 情报</h2>
            <p className="mt-1 text-sm text-white/50">
              聚焦最近命中的高优先级漏洞，展示 CVSS、来源覆盖、建议等级和外部跳转入口。
            </p>
          </div>

          <div className="space-y-4 px-6 py-6 sm:px-7">
            {cveLoading ? (
              <div className="flex min-h-[280px] items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.02]">
                <div className="flex items-center gap-3 text-sm text-white/58">
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  正在加载 CVE 情报...
                </div>
              </div>
            ) : cveError ? (
              <div className="rounded-[24px] border border-rose-400/15 bg-rose-400/8 px-5 py-8 text-sm text-rose-100">
                {cveError}
              </div>
            ) : cveItems.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-sm text-white/52">
                当前时间窗口内暂无 CVE 情报。
              </div>
            ) : (
              cveItems.map((item) => (
                <article key={item.cveId} className="rounded-[24px] border border-white/8 bg-white/[0.025] p-5">
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

                      <h3 className="mt-4 text-lg font-semibold tracking-[-0.04em] text-white">
                        {item.cveId}
                      </h3>
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
                    <span>{`优先等级：${sanitizeText(item.pushLevel, '观察')}`}</span>
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
              ))
            )}
          </div>
        </motion.aside>
      </div>
    </div>
  );
};

export default Activity;
