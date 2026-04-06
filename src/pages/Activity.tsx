import { startTransition, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity as ActivityIcon,
  ArrowUpRight,
  Bug,
  Globe,
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
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  return `${days} 天前`;
};

const sanitizeText = (value?: string, fallback = '暂无说明') => {
  if (!value || !value.trim()) return fallback;
  return value.trim();
};

const getSeverityTone = (pulse: ActivityPulse) => {
  const haystack = `${pulse.name} ${pulse.description || ''}`.toLowerCase();
  if (/(ransomware|supply chain|0day|zero[- ]day|backdoor|rat|apt|campaign)/i.test(haystack)) {
    return { label: '高关注', className: 'border-rose-400/20 bg-rose-400/10 text-rose-200' };
  }
  if (/(phishing|stealer|malware|trojan|loader|botnet)/i.test(haystack)) {
    return { label: '中关注', className: 'border-amber-400/20 bg-amber-400/10 text-amber-200' };
  }
  return { label: '常规', className: 'border-white/10 bg-white/[0.04] text-white/68' };
};

const getTypeBreakdown = (items: ActivityPulse[]) => {
  const counters = new Map<string, number>();

  items.forEach((pulse) => {
    pulse.indicators?.forEach((indicator) => {
      const type = indicator.type || 'Unknown';
      counters.set(type, (counters.get(type) || 0) + 1);
    });
  });

  return Array.from(counters.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
};

const getCveSignals = (items: ActivityPulse[]) =>
  items
    .map((item) => {
      const cveMatches = new Set<string>();

      [item.name, item.description, ...(item.indicators || []).map((indicator) => indicator.indicator || '')]
        .filter(Boolean)
        .forEach((value) => {
          const matches = String(value).match(/CVE-\d{4}-\d{4,7}/gi);
          matches?.forEach((match) => cveMatches.add(match.toUpperCase()));
        });

      return {
        ...item,
        cves: Array.from(cveMatches),
      };
    })
    .filter((item) => item.cves.length > 0)
    .slice(0, 10);

const Activity = () => {
  const [items, setItems] = useState<ActivityPulse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [activeWindow, setActiveWindow] = useState<'24h' | '7d' | 'all'>('7d');

  useEffect(() => {
    let cancelled = false;

    const load = async (background = false) => {
      try {
        if (background) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const payload = await otxApi.getActivity();
        const results = Array.isArray(payload?.results) ? payload.results : [];

        if (!cancelled) {
          startTransition(() => {
            setItems(results);
            setError('');
          });
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || '威胁流加载失败，请稍后重试。');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    load();
    const timer = window.setInterval(() => load(true), REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const filteredItems = useMemo(() => {
    const now = Date.now();
    const lowerKeyword = keyword.trim().toLowerCase();

    return items.filter((item) => {
      if (activeWindow !== 'all') {
        const time = new Date(item.modified || item.created || '').getTime();
        if (!Number.isNaN(time)) {
          const age = now - time;
          if (activeWindow === '24h' && age > 86_400_000) return false;
          if (activeWindow === '7d' && age > 7 * 86_400_000) return false;
        }
      }

      if (!lowerKeyword) return true;

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

      return haystack.includes(lowerKeyword);
    });
  }, [activeWindow, items, keyword]);

  const stats = useMemo(() => {
    const totalIndicators = filteredItems.reduce((sum, item) => sum + (item.indicators?.length || 0), 0);
    const tagged = filteredItems.filter((item) => Array.isArray(item.tags) && item.tags.length > 0).length;
    const tlpWhite = filteredItems.filter((item) => String(item.TLP || '').toLowerCase() === 'white').length;

    return {
      pulses: filteredItems.length,
      indicators: totalIndicators,
      tagged,
      tlpWhite,
    };
  }, [filteredItems]);

  const typeBreakdown = useMemo(() => getTypeBreakdown(filteredItems), [filteredItems]);
  const cveSignals = useMemo(() => getCveSignals(filteredItems), [filteredItems]);

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
            <p className="text-[11px] uppercase tracking-[0.32em] text-white/38">实时威胁流</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
                <ActivityIcon className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-[2rem] font-semibold tracking-[-0.07em] text-white">实时威胁流与最新漏洞情报</h1>
                <p className="text-sm text-white/54">左侧聚焦活动流与事件线索，右侧单独提炼最近脉冲里的 CVE 关联情报。</p>
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
                      : 'border-white/10 bg-white/[0.03] text-white/64 hover:bg-white/[0.06]'
                  )}
                >
                  {windowKey === '24h' ? '近 24 小时' : windowKey === '7d' ? '近 7 天' : '全部'}
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
                placeholder="搜索活动标题、标签、指标"
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/28"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 px-6 py-5 sm:px-7 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: '脉冲总数', value: stats.pulses, icon: Radar },
            { label: '关联指标', value: stats.indicators, icon: ShieldAlert },
            { label: '带标签活动', value: stats.tagged, icon: Tags },
            { label: 'TLP White', value: stats.tlpWhite, icon: Globe },
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

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
          className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,19,28,0.96),rgba(8,12,18,0.96))]"
        >
          <div className="border-b border-white/8 px-6 py-5 sm:px-7">
            <h2 className="text-xl font-semibold tracking-[-0.05em] text-white">活动流与事件线索</h2>
            <p className="mt-1 text-sm text-white/50">按时间顺序跟踪最近公开脉冲，提炼主题、标签、对手和关键 IOC。</p>
          </div>

          <div className="px-6 py-6 sm:px-7">
            {loading ? (
              <div className="flex min-h-[280px] items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.02]">
                <div className="flex items-center gap-3 text-sm text-white/58">
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  正在载入实时威胁流...
                </div>
              </div>
            ) : error ? (
              <div className="rounded-[24px] border border-rose-400/15 bg-rose-400/8 px-5 py-8 text-sm text-rose-100">{error}</div>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-sm text-white/52">
                当前筛选条件下没有可显示的威胁活动。
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
                              {item.TLP ? `TLP ${String(item.TLP).toUpperCase()}` : 'TLP 未知'}
                            </span>
                            <span className="text-xs text-white/42">{formatRelativeTime(item.modified || item.created)}</span>
                          </div>

                          <h3 className="mt-4 text-xl font-semibold tracking-[-0.05em] text-white">{sanitizeText(item.name, '未命名活动')}</h3>
                          <p className="mt-3 line-clamp-3 text-sm leading-7 text-white/62">{sanitizeText(item.description)}</p>
                        </div>

                        <div className="rounded-[20px] border border-white/8 bg-[#111723] px-4 py-3 text-right">
                          <div className="text-[11px] uppercase tracking-[0.22em] text-white/34">更新时间</div>
                          <div className="mt-2 text-sm font-medium text-white/84">{formatAbsoluteTime(item.modified || item.created)}</div>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 text-sm text-white/58 md:grid-cols-3">
                        <span>来源：{sanitizeText(item.author_name, '未知来源')}</span>
                        <span>指标数量：{indicators.length}</span>
                        <span>对手：{sanitizeText(item.adversary, '未标注')}</span>
                      </div>

                      {tags.length > 0 ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {tags.map((tag) => (
                            <span key={tag} className="rounded-full border border-accent/15 bg-accent/10 px-3 py-1 text-xs text-accent">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {indicators.length > 0 ? (
                        <div className="mt-5 rounded-[18px] border border-white/8 bg-black/10 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium text-white/82">首批指标</div>
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
                              查看参考
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
          className="space-y-6"
        >
          <section className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,22,31,0.98),rgba(10,14,20,0.98))]">
            <div className="border-b border-white/8 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
                  <Bug className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-[-0.05em] text-white">CVE 最新情报</h2>
                  <p className="text-sm text-white/50">从最新脉冲里抽取含有 CVE 线索的活动，适合快速浏览漏洞热点。</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-6 py-5">
              {loading ? (
                <div className="rounded-[20px] border border-dashed border-white/10 px-4 py-6 text-sm text-white/50">
                  正在提取 CVE 情报...
                </div>
              ) : cveSignals.length > 0 ? (
                cveSignals.map((item) => (
                  <article key={`cve-${item.id}`} className="rounded-[22px] border border-white/8 bg-white/[0.025] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-white/38">{formatRelativeTime(item.modified || item.created)}</div>
                        <h3 className="mt-2 text-base font-semibold leading-6 text-white">{sanitizeText(item.name, '未命名漏洞情报')}</h3>
                      </div>
                      <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/58">
                        {item.TLP ? `TLP ${String(item.TLP).toUpperCase()}` : 'TLP 未知'}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.cves.slice(0, 4).map((cve) => (
                        <span key={cve} className="rounded-full border border-accent/15 bg-accent/10 px-3 py-1 text-xs text-accent">
                          {cve}
                        </span>
                      ))}
                    </div>

                    <p className="mt-3 line-clamp-3 text-sm leading-7 text-white/60">{sanitizeText(item.description)}</p>

                    <div className="mt-4 grid gap-2 text-sm text-white/56">
                      <span>来源：{sanitizeText(item.author_name, '未知来源')}</span>
                      <span>指标数量：{item.indicators?.length || 0}</span>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-white/10 px-4 py-6 text-sm text-white/50">
                  当前时间窗口内没有提取到新的 CVE 关联情报。
                </div>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,22,31,0.98),rgba(10,14,20,0.98))]">
            <div className="border-b border-white/8 px-6 py-5">
              <h2 className="text-lg font-semibold tracking-[-0.05em] text-white">指标类型分布</h2>
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
                  当前没有可统计的指标类型。
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
