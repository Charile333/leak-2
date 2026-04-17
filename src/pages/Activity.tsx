import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { Activity as ActivityIcon, ArrowUpRight, Loader2, RefreshCw } from 'lucide-react';

import { otxApi } from '../api/otxApi';
import CveIntelPanel from '../components/activity/CveIntelPanel';
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

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '未知';

  const diff = Date.now() - timestamp;
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
  return text || fallback;
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

const getWindowLabel = (windowKey: '24h' | '7d' | 'all') => {
  if (windowKey === '24h') return '近 24 小时';
  if (windowKey === '7d') return '近 7 天';
  return '全部';
};

const getActivityReferenceLabel = (index: number) => `参考链接 ${index + 1}`;

const Activity = () => {
  const [activeWindow, setActiveWindow] = useState<'24h' | '7d' | 'all'>('all');
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ['threat-activity-feed'],
    async () => {
      const payload = (await otxApi.getActivity()) as ActivityPayload;
      return Array.isArray(payload?.results) ? payload.results : [];
    },
    {
      refreshInterval: REFRESH_INTERVAL_MS,
      dedupingInterval: 15_000,
      revalidateOnFocus: true,
      keepPreviousData: true,
    },
  );

  const handleRefresh = async () => {
    setIsManualRefreshing(true);
    try {
      await mutate(otxApi.getActivity().then((payload: ActivityPayload) => (Array.isArray(payload?.results) ? payload.results : [])), {
        revalidate: false,
        populateCache: true,
      });
    } finally {
      setIsManualRefreshing(false);
    }
  };

  const filteredItems = useMemo(() => {
    const items = Array.isArray(data) ? data : [];
    const now = Date.now();

    return items.filter((item) => {
      if (activeWindow === 'all') return true;

      const time = new Date(item.modified || item.created || '').getTime();
      if (Number.isNaN(time)) return true;

      const age = now - time;
      if (activeWindow === '24h') return age <= 86_400_000;
      return age <= 7 * 86_400_000;
    });
  }, [activeWindow, data]);

  const isRefreshing = isManualRefreshing || isValidating;

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
                  统一查看近期威胁活动与最新 CVE 情报，聚焦当前监测动态和需要优先处理的漏洞信号。
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
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/72 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
              刷新
            </button>
          </div>
        </div>
      </motion.section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] xl:items-start">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
          className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,19,28,0.96),rgba(8,12,18,0.96))] xl:sticky xl:top-6 xl:flex xl:max-h-[calc(100vh-2.5rem)] xl:flex-col"
        >
          <div className="border-b border-white/8 px-6 py-5 sm:px-7">
            <h2 className="text-xl font-semibold tracking-[-0.05em] text-white">实时活动流</h2>
            <p className="mt-1 text-sm text-white/50">
              展示近期威胁活动摘要、标签、IOC 片段与参考链接，方便快速判断当前攻击热点。
            </p>
          </div>

          <div className="px-6 py-6 sm:px-7 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            {isLoading ? (
              <div className="flex min-h-[280px] items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.02]">
                <div className="flex items-center gap-3 text-sm text-white/58">
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  正在加载活动流...
                </div>
              </div>
            ) : error ? (
              <div className="rounded-[24px] border border-rose-400/15 bg-rose-400/8 px-5 py-8 text-sm text-rose-100">
                {error instanceof Error ? error.message : '活动流加载失败。'}
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
                    <article
                      key={item.id}
                      className="rounded-[24px] border border-white/8 bg-white/[0.025] p-5"
                      style={{ contentVisibility: 'auto', containIntrinsicSize: '360px' }}
                    >
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
                          {references.map((reference, index) => (
                            <a
                              key={reference}
                              href={reference}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                            >
                              {getActivityReferenceLabel(index)}
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

        <CveIntelPanel activeWindow={activeWindow} />
      </div>
    </div>
  );
};

export default Activity;
