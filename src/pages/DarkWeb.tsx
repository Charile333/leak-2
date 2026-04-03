import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { leakRadarApi } from '../api/leakRadar.ts';

const MIN_QUERY_LENGTH = 3;
const PAGE_SIZE = 10;

type SortMode = 'relevance' | 'published_at';

type DarkWebResult = {
  id: string;
  source?: string;
  title?: string;
  content?: string;
  raw_content?: string;
  published_at?: string;
  ingested_at?: string;
  collected_at?: string;
  created_at?: string;
  url?: string;
  source_url?: string;
  author?: string;
};

const QUICK_QUERIES = ['telegram', 'ransomware', 'walmart.com', 'admin@admin.com'];

const formatDate = (value?: string) => {
  if (!value) return '未知时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN');
};

const getExcerpt = (result: DarkWebResult) => {
  const source = result.content || result.raw_content || '';
  if (!source) return '该结果暂无可预览内容。';
  return source.length > 220 ? `${source.slice(0, 220)}...` : source;
};

const getIngestedAt = (result: DarkWebResult) =>
  result.ingested_at || result.collected_at || result.created_at;

const Panel = ({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) => (
  <section className="overflow-hidden rounded-[28px] border border-white/8 bg-[#11141c]/82 backdrop-blur-2xl">
    <div className="flex items-center justify-between border-b border-white/6 px-6 py-4">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {right}
    </div>
    <div className="px-6 py-6">{children}</div>
  </section>
);

const EmptyState = ({ title, text }: { title: string; text: string }) => (
  <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
    <h3 className="text-lg font-semibold text-white">{title}</h3>
    <p className="mt-3 text-sm leading-7 text-white/55">{text}</p>
  </div>
);

const MetaCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-[18px] border border-white/8 bg-[#0d1219] px-4 py-3">
    <p className="text-[11px] uppercase tracking-[0.22em] text-white/42">{label}</p>
    <p className="mt-2 break-all text-sm leading-6 text-white/82">{value}</p>
  </div>
);

const DarkWeb = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DarkWebResult[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [sortMode, setSortMode] = useState<SortMode>('relevance');
  const [advancedSearch, setAdvancedSearch] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sources, setSources] = useState(0);
  const [posts, setPosts] = useState(0);
  const [latestUpdateText, setLatestUpdateText] = useState('加载中...');
  const [selectedResult, setSelectedResult] = useState<DarkWebResult | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));

  const summaryStats = useMemo(
    () => [
      { label: '已收录帖子', value: posts.toLocaleString() },
      { label: '活跃源数量', value: sources.toLocaleString() },
      { label: '最近同步', value: latestUpdateText },
    ],
    [latestUpdateText, posts, sources]
  );

  const loadPage = async (page: number, queryOverride?: string) => {
    const query = (queryOverride ?? searchQuery).trim();
    if (!query) {
      setError('');
      setSearchResults([]);
      setTotalResults(0);
      return;
    }

    if (query.length < MIN_QUERY_LENGTH) {
      setSearchResults([]);
      setTotalResults(0);
      setError(`请输入至少 ${MIN_QUERY_LENGTH} 个字符后再搜索。`);
      return;
    }

    setIsSearching(true);
    setError('');
    setCurrentPage(page);

    try {
      const response = await leakRadarApi.searchDarkWebMentions(
        query,
        page,
        PAGE_SIZE,
        advancedSearch,
        sortMode,
        'desc'
      );

      if (response.success) {
        setSubmittedQuery(query);
        setSearchResults(response.results || []);
        setTotalResults(response.total || 0);
        return;
      }

      setSearchResults([]);
      setTotalResults(0);
      setError('当前无法加载暗网搜索结果。');
    } catch (err: any) {
      setSearchResults([]);
      setTotalResults(0);
      setError(err?.message || '当前无法加载暗网搜索结果。');
    } finally {
      setIsSearching(false);
    }
  };

  const fetchPostDetails = async (result: DarkWebResult) => {
    setSelectedResult(result);
    setIsDrawerOpen(true);
    setIsLoadingDetails(true);

    try {
      const response = await leakRadarApi.getDarkWebPostById(result.id);
      if (response) {
        setSelectedResult({
          ...result,
          ...response,
          source: response.source_name || response.source || result.source,
          source_url: response.source_url || response.source_ref || result.source_url || result.url,
          url: response.source_ref || response.url || result.url,
          author: response.author || result.author,
          published_at: response.published_at || result.published_at,
          ingested_at:
            response.ingested_at ||
            response.collected_at ||
            response.created_at ||
            result.ingested_at,
          raw_content: response.raw_content || response.content || result.raw_content || result.content,
          content: response.content || result.content,
        });
      }
    } catch (err) {
      console.error('Failed to load dark web post details:', err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    await loadPage(1, searchQuery);
  };

  const handleCopyContent = async () => {
    const content = selectedResult?.raw_content || selectedResult?.content;
    if (!content) return;
    await navigator.clipboard.writeText(content);
  };

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [statsResponse, sourcesResponse] = await Promise.all([
          leakRadarApi.getDarkWebStatistics(),
          leakRadarApi.getDarkWebSources(),
        ]);

        if (statsResponse.success) {
          setPosts(statsResponse.total_posts || 0);
          setSources(statsResponse.total_sources || 0);
          setLatestUpdateText(formatDate(statsResponse.latest_ingested_at));
        }

        if (sourcesResponse.success && !statsResponse.success) {
          setSources(sourcesResponse.sources.length || 0);
        }
      } catch (err) {
        console.error('Failed to load dark web statistics:', err);
        setLatestUpdateText('暂不可用');
      }
    };

    loadStats();
  }, []);

  useEffect(() => {
    if (!submittedQuery) return;
    void loadPage(1, submittedQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode, advancedSearch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
        setIsDrawerOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDrawerOpen(false);
      }
    };

    if (!isDrawerOpen) return;

    document.body.style.overflow = 'hidden';
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isDrawerOpen]);

  const drawerOverlay =
    typeof document !== 'undefined' ? (
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="fixed inset-0 z-[140] bg-[#04070d]/76 backdrop-blur-sm"
              aria-label="关闭详情面板"
              onClick={() => setIsDrawerOpen(false)}
            />

            <motion.aside
              ref={drawerRef}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="fixed right-0 top-0 z-[150] h-screen w-full max-w-[560px] border-l border-accent/15 bg-[#0a0f16]/96 shadow-[-24px_0_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
            >
              <div className="flex h-full flex-col">
                <div className="flex items-start justify-between border-b border-accent/10 px-6 py-5">
                  <div className="min-w-0 pr-4">
                    <h2 className="text-xl font-semibold leading-relaxed text-white">
                      {selectedResult?.title || '未命名结果'}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDrawerOpen(false)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent/15 bg-accent/10 text-accent/80 transition-colors hover:bg-accent/15 hover:text-accent"
                    aria-label="关闭详情"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-hidden px-6 py-6">
                  {!selectedResult ? null : (
                    <div className="flex h-full min-h-0 flex-col gap-5">
                      <div className="shrink-0 grid gap-2.5 sm:grid-cols-2">
                        <MetaCard label="作者" value={selectedResult.author || '未知'} />
                        <MetaCard label="发布时间" value={formatDate(selectedResult.published_at)} />
                        <MetaCard label="收录时间" value={formatDate(getIngestedAt(selectedResult))} />
                        <MetaCard
                          label="来源网站"
                          value={selectedResult.source_url || selectedResult.url || '暂无来源网站'}
                        />
                      </div>

                      <div className="flex min-h-0 flex-1 flex-col rounded-[24px] border border-accent/12 bg-[#0d1219] px-5 py-5 shadow-[inset_0_1px_0_rgba(168,85,247,0.04)]">
                        <div className="mb-3 shrink-0 flex items-center gap-2 text-sm font-medium text-white/86">
                          {isLoadingDetails ? (
                            <Loader2 className="h-4 w-4 animate-spin text-accent" />
                          ) : (
                            <FileText className="h-4 w-4 text-accent" />
                          )}
                          <span>完整记录</span>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto rounded-[18px] border border-white/6 bg-black/10 px-4 py-4 pr-3 whitespace-pre-wrap text-sm leading-7 text-white/72">
                          {selectedResult.raw_content ||
                            selectedResult.content ||
                            '当前结果暂无返回的完整正文。'}
                        </div>
                        <div className="mt-4 shrink-0 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={handleCopyContent}
                            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/72 transition-colors hover:bg-white/[0.06]"
                          >
                            <Copy className="h-4 w-4" />
                            复制内容
                          </button>
                          {(selectedResult.source_url || selectedResult.url) && (
                            <a
                              href={selectedResult.source_url || selectedResult.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-2 text-sm text-accent transition-colors hover:bg-accent/14"
                            >
                              <ExternalLink className="h-4 w-4" />
                              打开来源网站
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    ) : null;

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="relative overflow-hidden rounded-[36px] border border-white/8 bg-[#0a0f16] px-5 py-6 shadow-[0_30px_120px_rgba(0,0,0,0.28)] sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.16),transparent_34%),radial-gradient(circle_at_78%_18%,rgba(168,85,247,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_24%)]" />
        <div className="relative z-10">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                暗网搜索
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/56">
                全文查看
              </span>
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-white/56">
              搜索、筛选、查看完整内容
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <div className="max-w-3xl">
              <h1 className="text-2xl font-semibold tracking-[-0.04em] text-white sm:text-3xl lg:text-4xl">
                暗网搜索
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/58 sm:text-base">
                在暗网论坛和市场中搜索您的公司、域名、IP 和员工凭据的提及，提前防范威胁。
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {summaryStats.map((stat) => (
                <div key={stat.label} className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-white/40">{stat.label}</p>
                  <p className="mt-2 text-lg font-semibold text-white">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleSearch} className="mt-6 space-y-4">
            <div className="rounded-[30px] border border-white/8 bg-[#0f141d]/84 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3 focus-within:border-accent/30 sm:px-5 sm:py-4">
                  <Search className="h-5 w-5 shrink-0 text-accent/80" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="搜索域名、邮箱、人物、论坛关键词、公司名或泄露主题"
                    className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30 sm:text-base"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3 xl:w-[480px]">
                  <label className="flex items-center gap-2 rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
                    <SlidersHorizontal className="h-4 w-4 text-accent/80" />
                    <select
                      value={sortMode}
                      onChange={(event) => setSortMode(event.target.value as SortMode)}
                      className="w-full bg-transparent text-sm text-white outline-none"
                    >
                      <option value="relevance" className="bg-[#11141c]">
                        相关性
                      </option>
                      <option value="published_at" className="bg-[#11141c]">
                        最新优先
                      </option>
                    </select>
                  </label>

                  <label className="flex items-center justify-center gap-2 rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
                    <input
                      type="checkbox"
                      checked={advancedSearch}
                      onChange={(event) => setAdvancedSearch(event.target.checked)}
                      className="h-4 w-4 accent-accent"
                    />
                    高级搜索
                  </label>

                  <button
                    type="submit"
                    disabled={isSearching}
                    className="inline-flex items-center justify-center gap-3 rounded-[22px] bg-accent px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-accent/90 disabled:opacity-70"
                  >
                    {isSearching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                    搜索
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {QUICK_QUERIES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setSearchQuery(example)}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/62 transition-colors hover:bg-white/[0.06]"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-3 rounded-[24px] border border-red-500/18 bg-red-500/8 px-4 py-4 text-sm text-red-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </form>
        </div>
      </div>

      <div className="mt-8 space-y-6">
        <Panel
          title={submittedQuery ? `“${submittedQuery}” 的搜索结果` : '搜索结果'}
          right={<span className="text-sm text-white/48">共 {totalResults} 条</span>}
        >
          {searchResults.length === 0 ? (
            <EmptyState
              title="先开始一次搜索"
              text="在上方输入关键词后，这里会显示结果列表。点击“查看完整内容”即可从右侧滑出详情面板。"
            />
          ) : (
            <div className="space-y-4">
              {searchResults.map((result) => (
                <div
                  key={result.id}
                  className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5 transition-all hover:border-accent/20 hover:bg-white/[0.05]"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/58">
                            {result.source || '未知来源'}
                          </span>
                          {result.author && (
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/58">
                              作者: {result.author}
                            </span>
                          )}
                        </div>

                        <h3 className="mt-3 text-lg font-semibold leading-relaxed text-white">
                          {result.title || '未命名结果'}
                        </h3>

                        <p className="mt-3 text-sm leading-7 text-white/56">{getExcerpt(result)}</p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 text-xs text-white/48">
                        <Calendar className="h-4 w-4" />
                        <span>{formatDate(result.published_at)}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 pt-4">
                      <div className="flex flex-wrap items-center gap-3 text-xs text-white/50">
                        <span className="inline-flex items-center gap-1.5">
                          <FileText className="h-4 w-4" />
                          可查看完整正文
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Globe className="h-4 w-4" />
                          {(result.source_url || result.url) ? '含来源网站' : '暂无来源网站'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => fetchPostDetails(result)}
                        className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/15"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        查看完整内容
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {searchResults.length > 0 && (
          <Panel title="分页">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-white/52">
                第 {currentPage} / {totalPages} 页
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={currentPage <= 1 || isSearching}
                  onClick={() => loadPage(currentPage - 1)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/72 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                  上一页
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages || isSearching}
                  onClick={() => loadPage(currentPage + 1)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/72 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
                >
                  下一页
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </Panel>
        )}
      </div>

      {drawerOverlay ? createPortal(drawerOverlay, document.body) : null}
    </div>
  );
};

export default DarkWeb;
