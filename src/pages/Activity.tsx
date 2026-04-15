import { startTransition, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity as ActivityIcon,
  ArrowUpRight,
  BellRing,
  Bug,
  ExternalLink,
  Loader2,
  Radar,
  RefreshCw,
  Search,
  ShieldAlert,
  Tags,
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

const sanitizeText = (value?: string, fallback = '暂无描述') => {
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
      label: '高风险',
      className: 'border-rose-400/20 bg-rose-400/10 text-rose-200',
    };
  }

  if (/(phishing|stealer|malware|trojan|loader|botnet)/i.test(haystack)) {
    return {
      label: '中风险',
      className: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    };
  }

  return {
    label: '常规情报',
    className: 'border-white/10 bg-white/[0.04] text-white/68',
  };
};

const getTypeBreakdown = (items: ActivityPulse[]) => {
  const counters = new Map<string, number>();

  items.forEach((pulse) => {
    pulse.indicators?.forEach((indicator) => {
      const type = indicator.type || 'unknown';
      counters.set(type, (counters.get(type) || 0) + 1);
    });
  });

  return Array.from(counters.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
};

const getPushTone = (level?: string) => {
  const normalized = (level || '').toLowerCase();

  if (normalized.includes('high')) return 'border-rose-400/25 bg-rose-400/10 text-rose-200';
  if (normalized.includes('medium')) return 'border-amber-400/25 bg-amber-400/10 text-amber-200';
  return 'border-white/10 bg-white/[0.04] text-white/68';
};

const getSeverityPill = (score: number | null, severity?: string) => {
  if (typeof score === 'number') {
    if (score >= 9) return 'Critical';
    if (score >= 7) return 'High';
    if (score >= 4) return 'Medium';
    return 'Low';
  }

  return severity || 'N/A';
};

const getSourceCoverageLabel = (item: CveIntelItem) => {
  const sourceCount = item.sourceTags.length;
  if (sourceCount <= 0) return '未标注来源';
  return sourceCount === 1 ? '1 个来源' : `${sourceCount} 个来源`;
};

const getWindowLabel = (windowKey: '24h' | '7d' | 'all') => {
  if (windowKey === '24h') return '近 24 小时';
  if (windowKey === '7d') return '近 7 天';
  return '全部时间';
};

const Activity = () => {
  const [items, setItems] = useState<ActivityPulse[]>([]);
  const [cveFeed, setCveFeed] = useState<CveIntelFeed>({});
  const [loading, setLoading] = useState(true);
  const [cveLoading, setCveLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [cveError, setCveError] = useState('');
  const [keyword, setKeyword] = useState('');
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
          if (!cancelled) setError(err instanceof Error ? err.message : '活动情报加载失败');
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
    const normalizedKeyword = keyword.trim().toLowerCase();

    return items.filter((item) => {
      if (activeWindow !== 'all') {
        const time = new Date(item.modified || item.created || '').getTime();
        if (!Number.isNaN(time)) {
          const age = now - time;
          if (activeWindow === '24h' && age > 86_400_000) return false;
          if (activeWindow === '7d' && age > 7 * 86_400_000) return false;
        }
      }

      if (!normalizedKeyword) return true;

      const haystack = [
        item.name,
        item.description,
        item.author_name,
        item.adversary,
        ...(item.tags || []),
        ...(item.indicators || []).map((indicator) => indicator.indicator || ''),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedKeyword);
    });
  }, [activeWindow, items, keyword]);

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

  const pushQueue = useMemo(() => cveItems.filter((item) => item.pushRecommended).slice(0, 5), [cveItems]);
  const sourceSummary = useMemo(() => {
    const counters = new Map<string, number>();
    cveItems.forEach((item) => {
      item.sourceTags.forEach((tag) => {
        counters.set(tag, (counters.get(tag) || 0) + 1);
      });
    });

    return Array.from(counters.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [cveItems]);

  const typeBreakdown = useMemo(() => getTypeBreakdown(filteredItems), [filteredItems]);

  const stats = useMemo(() => {
    const totalIndicators = filteredItems.reduce((sum, item) => sum + (item.indicators?.length || 0), 0);
    const tagged = filteredItems.filter((item) => Array.isArray(item.tags) && item.tags.length > 0).length;

    return {
      pulses: filteredItems.length,
      indicators: totalIndicators,
      tagged,
      pushable: pushQueue.length,
    };
  }, [filteredItems, pushQueue.length]);

  return (
    <div className="space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,22,31,0.98),rgba(10,14,20,0.98))]"
      >
        <div className="grid gap-6 border-b border-white/8 px-6 py-6 lg:grid-cols-[1.15fr_0.85fr] sm:px-7">
          <div>
            <p className="text-[11px] uppercase tracking-[0.32em] text-white/38">Threat Activity</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
                <ActivityIcon className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-[2rem] font-semibold tracking-[-0.07em] text-white">活动与事件线索</h1>
                <p className="text-sm text-white/54">
                  左侧保留活动流与 IOC 线索，右侧改为最新 CVE 多源情报，并把两者拆成不同决策视角。
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex w-full flex-wrap gap-2 lg:justify-end">
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

            <div className="flex w-full items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 lg:max-w-[380px]">
              <Search className="h-4 w-4 text-accent" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="筛选活动标题、标签、攻击者或 IOC"
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/28"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 px-6 py-5 sm:px-7 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: '活动条目', value: stats.pulses, icon: Radar },
            { label: '提取 IOC', value: stats.indicators, icon: ShieldAlert },
            { label: '标签覆盖', value: stats.tagged, icon: Tags },
            { label: '建议优先跟进', value: stats.pushable, icon: BellRing },
          ].map((stat) => (
            <div key={stat.label} className="rounded-[24px] border border-white/8 bg-white/[0.025] p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.22em] text-white/38">{stat.label}</span>
                <stat.icon className="h-4 w-4 text-accent" />
              </div>
              <div className="mt-4 text-4xl font-semibold tracking-[-0.08em] text-white">{stat.value}</div>
            </div>
          ))}
        </div>
      </motion.section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(360px,0.82fr)] xl:items-start">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
          className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,19,28,0.96),rgba(8,12,18,0.96))] xl:sticky xl:top-6 xl:flex xl:max-h-[calc(100vh-2.5rem)] xl:flex-col"
        >
          <div className="border-b border-white/8 px-6 py-5 sm:px-7">
            <h2 className="text-xl font-semibold tracking-[-0.05em] text-white">活动流</h2>
            <p className="mt-1 text-sm text-white/50">
              聚合最近的威胁活动与事件线索，侧重脉冲动态、标签、攻击者上下文和 IOC 提取结果。
            </p>
          </div>

          <div className="px-6 py-6 sm:px-7 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            {loading ? (
              <div className="flex min-h-[280px] items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.02]">
                <div className="flex items-center gap-3 text-sm text-white/58">
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  正在加载活动情报...
                </div>
              </div>
            ) : error ? (
              <div className="rounded-[24px] border border-rose-400/15 bg-rose-400/8 px-5 py-8 text-sm text-rose-100">
                {error}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-sm text-white/52">
                当前筛选条件下没有命中的活动线索。
              </div>
            ) : (
              <div className="space-y-4">
                {filteredItems.map((item) => {
                  const tone = getSeverityTone(item);
                  const references = Array.isArray(item.references) ? item.references.filter(Boolean).slice(0, 2) : [];
                  const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean).slice(0, 8) : [];
                  const indicators = Array.isArray(item.indicators) ? item.indicators : [];

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
                            {sanitizeText(item.name, '未命名脉冲')}
                          </h3>
                          <p className="mt-3 line-clamp-3 text-sm leading-7 text-white/62">
                            {sanitizeText(item.description)}
                          </p>
                        </div>

                        <div className="rounded-[20px] border border-white/8 bg-[#111723] px-4 py-3 text-right">
                          <div className="text-[11px] uppercase tracking-[0.22em] text-white/34">更新时间</div>
                          <div className="mt-2 text-sm font-medium text-white/84">
                            {formatAbsoluteTime(item.modified || item.created)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 text-sm text-white/58 md:grid-cols-3">
                        <span>{`作者：${sanitizeText(item.author_name, '未知')}`}</span>
                        <span>{`IOC 数量：${indicators.length}`}</span>
                        <span>{`攻击者：${sanitizeText(item.adversary, '未标注')}`}</span>
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
                            <div className="text-xs text-white/40">展示前 5 条</div>
                          </div>
                          <div className="mt-3 grid gap-2">
                            {indicators.slice(0, 5).map((indicator, index) => (
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
                              查看来源
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
          className="space-y-6 xl:sticky xl:top-6 xl:max-h-[calc(100vh-2.5rem)] xl:overflow-y-auto xl:pr-1"
        >
          <section className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,22,31,0.98),rgba(10,14,20,0.98))]">
            <div className="border-b border-white/8 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
                  <Bug className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-[-0.05em] text-white">最新 CVE 多源情报</h2>
                  <p className="text-sm text-white/50">
                    按最近被情报源提及的时间排序，不按漏洞编号年份排序。这里看的是最近热度，不是编号年代。
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-4 px-6 py-5">
              {cveLoading ? (
                <div className="rounded-[20px] border border-dashed border-white/10 px-4 py-6 text-sm text-white/50">
                  正在加载最新 CVE 情报...
                </div>
              ) : cveError ? (
                <div className="rounded-[20px] border border-amber-400/15 bg-amber-400/8 px-4 py-6 text-sm text-amber-100">
                  {cveError}
                </div>
              ) : cveItems.length > 0 ? (
                cveItems.map((item) => (
                  <article key={item.cveId} className="rounded-[22px] border border-white/8 bg-white/[0.025] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-white/38">
                          {`最近提及 ${formatRelativeTime(item.latestSeen || item.lastModified || item.published)}`}
                        </div>
                        <h3 className="mt-2 text-base font-semibold leading-6 text-white">{item.cveId}</h3>
                      </div>
                      <span className={cn('rounded-full border px-2.5 py-1 text-[11px]', getPushTone(item.pushLevel))}>
                        {item.pushLevel || 'observe'}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full border border-accent/15 bg-accent/10 px-2.5 py-1 text-[11px] text-accent">
                        {getSourceCoverageLabel(item)}
                      </span>
                      {item.sourceTags.map((tag) => (
                        <span
                          key={`${item.cveId}-${tag}`}
                          className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/62"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    <p className="mt-3 text-sm font-medium text-white/86">{sanitizeText(item.title, item.cveId)}</p>
                    <p className="mt-2 line-clamp-3 text-sm leading-7 text-white/60">{sanitizeText(item.summary)}</p>

                    <div className="mt-4 grid gap-2 text-sm text-white/58">
                      <span>{`最近提及时间：${formatAbsoluteTime(item.latestSeen || item.lastModified)}`}</span>
                      <span>{`公开时间：${formatAbsoluteTime(item.published)}`}</span>
                      <span>{`最后修改：${formatAbsoluteTime(item.lastModified)}`}</span>
                      <span>{`CVSS：${typeof item.cvssScore === 'number' ? item.cvssScore.toFixed(1) : 'N/A'}`}</span>
                      <span>{`严重等级：${getSeverityPill(item.cvssScore, item.severity)}`}</span>
                      <span>{`KEV：${item.hasKev ? '是' : '否'}`}</span>
                      <span>{`OTX 提及次数：${item.otxMentionCount}`}</span>
                      <span>{`推送分数：${item.pushScore}`}</span>
                    </div>

                    {item.pushReasons.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {item.pushReasons.map((reason) => (
                          <span
                            key={`${item.cveId}-${reason}`}
                            className="rounded-full border border-accent/15 bg-accent/10 px-3 py-1 text-xs text-accent"
                          >
                            {reason}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-5 flex flex-wrap gap-2">
                      <a
                        href={`/dns?q=${encodeURIComponent(item.cveId)}`}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                      >
                        关联查询
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                      <a
                        href={`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(item.cveId)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                      >
                        NVD
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      {item.sourceDetails?.aliyun?.sourceUrl ? (
                        <a
                          href={item.sourceDetails.aliyun.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                        >
                          Aliyun AVD
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-white/10 px-4 py-6 text-sm text-white/50">
                  当前时间窗口内没有命中的 CVE 多源情报。
                </div>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,22,31,0.98),rgba(10,14,20,0.98))]">
            <div className="border-b border-white/8 px-6 py-5">
              <h2 className="text-lg font-semibold tracking-[-0.05em] text-white">情报源覆盖</h2>
              <p className="mt-1 text-sm text-white/50">快速看当前 CVE 面板中哪些情报源出现最频繁。</p>
            </div>
            <div className="space-y-4 px-6 py-5">
              {sourceSummary.length > 0 ? (
                sourceSummary.map(([source, count]) => (
                  <div key={source} className="rounded-[22px] border border-white/8 bg-white/[0.025] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{source}</div>
                        <div className="mt-1 text-xs text-white/48">情报源命中数量</div>
                      </div>
                      <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[11px] text-accent">
                        {count}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-white/10 px-4 py-6 text-sm text-white/50">
                  暂无情报源聚合数据。
                </div>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,22,31,0.98),rgba(10,14,20,0.98))]">
            <div className="border-b border-white/8 px-6 py-5">
              <h2 className="text-lg font-semibold tracking-[-0.05em] text-white">建议优先跟进</h2>
              <p className="mt-1 text-sm text-white/50">根据推送分数和推荐标记，把最值得先看的漏洞单独拎出来。</p>
            </div>
            <div className="space-y-4 px-6 py-5">
              {pushQueue.length > 0 ? (
                pushQueue.map((item) => (
                  <div key={`push-${item.cveId}`} className="rounded-[22px] border border-white/8 bg-white/[0.025] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{item.cveId}</div>
                        <div className="mt-1 text-xs text-white/48">
                          {formatAbsoluteTime(item.latestSeen || item.lastModified || item.published)}
                        </div>
                      </div>
                      <span className={cn('rounded-full border px-2.5 py-1 text-[11px]', getPushTone(item.pushLevel))}>
                        {item.pushLevel || 'observe'}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm text-white/60">{sanitizeText(item.summary)}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.pushReasons.map((reason) => (
                        <span
                          key={`${item.cveId}-push-${reason}`}
                          className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/60"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-white/10 px-4 py-6 text-sm text-white/50">
                  当前没有需要优先推送的 CVE 条目。
                </div>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,22,31,0.98),rgba(10,14,20,0.98))]">
            <div className="border-b border-white/8 px-6 py-5">
              <h2 className="text-lg font-semibold tracking-[-0.05em] text-white">IOC 类型热度</h2>
            </div>
            <div className="space-y-4 px-6 py-5">
              {typeBreakdown.length > 0 ? (
                typeBreakdown.map(([type, count]) => (
                  <div key={type}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/64">{type}</span>
                      <span className="font-medium text-white">{count}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,rgba(168,85,247,0.92),rgba(147,51,234,0.42))]"
                        style={{ width: `${Math.max(8, Math.min(100, (count / (typeBreakdown[0]?.[1] || count)) * 100))}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-white/10 px-4 py-6 text-sm text-white/50">
                  当前没有足够的 IOC 类型数据。
                </div>
              )}
            </div>
          </section>
        </motion.aside>
      </div>
    </div>
  );
};

export default Activity;
