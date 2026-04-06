import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  Filter,
  FolderGit2,
  GitBranch,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  CodeLeakSearchError,
  codeLeakService,
  type CodeLeakAsset,
  type CodeLeakAssetType,
  type CodeLeakFinding,
  type CodeLeakSeverity,
  type CodeLeakSource,
  type CodeLeakStatus,
} from '../services/codeLeakService';

const severityToneMap: Record<CodeLeakSeverity, string> = {
  critical: 'border-red-500/25 bg-red-500/10 text-red-200',
  high: 'border-orange-500/25 bg-orange-500/10 text-orange-200',
  medium: 'border-amber-500/25 bg-amber-500/10 text-amber-200',
  low: 'border-white/10 bg-white/[0.06] text-white/72',
};

const severityLabelMap: Record<CodeLeakSeverity, string> = {
  critical: '严重',
  high: '高',
  medium: '中',
  low: '低',
};

const statusToneMap: Record<CodeLeakStatus, string> = {
  new: 'border-red-500/20 bg-red-500/10 text-red-200',
  reviewing: 'border-accent/20 bg-accent/10 text-accent',
  confirmed: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
  dismissed: 'border-white/10 bg-white/[0.06] text-white/62',
};

const statusLabelMap: Record<CodeLeakStatus, string> = {
  new: '待处理',
  reviewing: '研判中',
  confirmed: '已确认',
  dismissed: '误报',
};

const exposureLabelMap: Record<CodeLeakFinding['exposure'], string> = {
  secret: '密钥暴露',
  config: '配置泄露',
  repository: '仓库暴露',
  credential: '凭据泄露',
  source: '源码痕迹',
};

const assetTypeLabelMap: Record<CodeLeakAssetType, string> = {
  company: '公司名',
  domain: '域名',
  email_suffix: '邮箱后缀',
  repository: '项目名',
};

const sourceOptions: Array<CodeLeakSource | 'all'> = ['all', 'GitHub', 'GitLab', 'Gitee', 'Paste'];
const severityOptions: Array<CodeLeakSeverity | 'all'> = ['all', 'critical', 'high', 'medium', 'low'];
const statusOptions: Array<CodeLeakStatus | 'all'> = ['all', 'new', 'reviewing', 'confirmed', 'dismissed'];
const assetTypeOptions: CodeLeakAssetType[] = ['company', 'domain', 'email_suffix', 'repository'];

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
};

const StatCard = ({ label, value, hint }: { label: string; value: string; hint: string }) => (
  <div className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-4">
    <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">{label}</p>
    <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    <p className="mt-1 text-xs text-white/45">{hint}</p>
  </div>
);

const Panel = ({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="overflow-hidden rounded-[28px] border border-white/8 bg-[#11141c]/82 backdrop-blur-2xl">
    <div className="flex items-center justify-between border-b border-white/6 px-6 py-4">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {right}
    </div>
    <div className="px-6 py-6">{children}</div>
  </section>
);

const CodeLeak = () => {
  const [assets, setAssets] = useState<CodeLeakAsset[]>([]);
  const [findings, setFindings] = useState<CodeLeakFinding[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [assetFilter, setAssetFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<CodeLeakSource | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<CodeLeakSeverity | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<CodeLeakStatus | 'all'>('all');
  const [selectedFinding, setSelectedFinding] = useState<CodeLeakFinding | null>(null);
  const [newAssetValue, setNewAssetValue] = useState('');
  const [newAssetType, setNewAssetType] = useState<CodeLeakAssetType>('company');
  const [assetError, setAssetError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAsset, setIsSavingAsset] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  const loadData = async (assetList?: CodeLeakAsset[]) => {
    setIsLoading(true);
    setLoadError('');
    try {
      const nextAssets = assetList ?? (await codeLeakService.getAssets());
      const nextFindings = await codeLeakService.searchFindings(
        {
          query: searchQuery,
          assetId: assetFilter,
          source: sourceFilter,
          severity: severityFilter,
          status: statusFilter,
        },
        nextAssets
      );
      setAssets(nextAssets);
      setFindings(nextFindings);
    } catch (error) {
      setFindings([]);
      setLoadError(
        error instanceof CodeLeakSearchError
          ? error.message
          : '当前无法加载真实代码泄露结果，请稍后重试。'
      );
      if (!assetList) {
        setAssets(await codeLeakService.getAssets());
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, assetFilter, sourceFilter, severityFilter, statusFilter]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
        setSelectedFinding(null);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedFinding(null);
    };
    if (!selectedFinding) return;
    document.body.style.overflow = 'hidden';
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [selectedFinding]);

  const summary = useMemo(() => {
    const total = findings.length;
    const highRisk = findings.filter((item) => item.severity === 'critical' || item.severity === 'high').length;
    const pending = findings.filter((item) => item.status === 'new').length;
    return { total, highRisk, pending };
  }, [findings]);

  const handleAddAsset = async () => {
    const value = newAssetValue.trim();
    if (!value) {
      setAssetError('请先输入监测对象');
      return;
    }
    setIsSavingAsset(true);
    setAssetError('');
    try {
      const nextAssets = await codeLeakService.addAsset({ value, type: newAssetType });
      setNewAssetValue('');
      if (assetFilter !== 'all') setAssetFilter('all');
      await loadData(nextAssets);
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : '添加失败');
    } finally {
      setIsSavingAsset(false);
    }
  };

  const handleRemoveAsset = async (id: string) => {
    setIsSavingAsset(true);
    setAssetError('');
    try {
      const nextAssets = await codeLeakService.removeAsset(id);
      if (assetFilter === id) setAssetFilter('all');
      await loadData(nextAssets);
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : '删除失败');
    } finally {
      setIsSavingAsset(false);
    }
  };

  const handleCopySnippet = async () => {
    if (!selectedFinding) return;
    await navigator.clipboard.writeText(selectedFinding.snippet);
  };

  const handleStatusUpdate = async (status: CodeLeakStatus) => {
    if (!selectedFinding) return;
    setIsUpdatingStatus(true);
    await codeLeakService.updateFindingStatus(selectedFinding.id, status);
    setSelectedFinding({ ...selectedFinding, status });
    setFindings((current) => current.map((item) => (item.id === selectedFinding.id ? { ...item, status } : item)));
    setIsUpdatingStatus(false);
  };

  const drawer = typeof document !== 'undefined' && selectedFinding
    ? createPortal(
        <AnimatePresence>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[140] bg-[#04070d]/76 backdrop-blur-sm"
            onClick={() => setSelectedFinding(null)}
            aria-label="关闭详情面板"
          />
          <motion.aside
            ref={drawerRef}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="fixed right-0 top-0 z-[150] h-screen w-full max-w-[620px] border-l border-accent/15 bg-[#0a0f16]/96 backdrop-blur-2xl"
          >
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between border-b border-accent/10 px-6 py-5">
                <div className="min-w-0 pr-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-semibold', severityToneMap[selectedFinding.severity])}>{severityLabelMap[selectedFinding.severity]}</span>
                    <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-semibold', statusToneMap[selectedFinding.status])}>{statusLabelMap[selectedFinding.status]}</span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/58">{selectedFinding.source}</span>
                  </div>
                  <h2 className="mt-3 text-xl font-semibold leading-relaxed text-white">{selectedFinding.title}</h2>
                </div>
                <button type="button" onClick={() => setSelectedFinding(null)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-accent/15 bg-accent/10 text-accent/80">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <MetaCard label="监测对象" value={selectedFinding.assetLabel} />
                  <MetaCard label="命中类型" value={exposureLabelMap[selectedFinding.exposure]} />
                  <MetaCard label="仓库" value={`${selectedFinding.owner}/${selectedFinding.repository}`} />
                  <MetaCard label="文件位置" value={`${selectedFinding.branch}:${selectedFinding.path}`} />
                  <MetaCard label="首次发现" value={formatDate(selectedFinding.firstSeen)} />
                  <MetaCard label="最近发现" value={formatDate(selectedFinding.lastSeen)} />
                </div>
                <div className="mt-5 rounded-[20px] border border-white/8 bg-[#0d1219] px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-white/42">命中项</p>
                  <p className="mt-2 text-sm font-medium text-accent">{selectedFinding.match}</p>
                </div>
                <div className="mt-5 rounded-[24px] border border-accent/12 bg-[#0d1219] px-5 py-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white/86">
                    <Code2 className="h-4 w-4 text-accent" />
                    <span>命中片段</span>
                  </div>
                  <div className="max-h-[320px] overflow-y-auto rounded-[18px] border border-white/6 bg-black/20 px-4 py-4 font-mono text-sm leading-7 text-white/72">
                    {selectedFinding.snippet}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" onClick={handleCopySnippet} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/72">
                      <Copy className="h-4 w-4" />
                      复制片段
                    </button>
                    <a href={selectedFinding.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-2 text-sm text-accent">
                      <ExternalLink className="h-4 w-4" />
                      打开来源
                    </a>
                  </div>
                </div>
                <div className="mt-5 rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-white/42">处置状态</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(statusOptions.filter((item) => item !== 'all') as CodeLeakStatus[]).map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={isUpdatingStatus}
                        onClick={() => handleStatusUpdate(status)}
                        className={cn('rounded-full border px-3 py-2 text-xs font-medium', selectedFinding.status === status ? statusToneMap[status] : 'border-white/10 bg-white/[0.03] text-white/62')}
                      >
                        {isUpdatingStatus && selectedFinding.status === status ? '更新中...' : statusLabelMap[status]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.aside>
        </AnimatePresence>,
        document.body
      )
    : null;

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="relative overflow-hidden rounded-[36px] border border-white/8 bg-[#0a0f16] px-5 py-6 shadow-[0_30px_120px_rgba(0,0,0,0.28)] sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.16),transparent_34%),radial-gradient(circle_at_76%_14%,rgba(168,85,247,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_24%)]" />
        <div className="relative z-10">
          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <div className="max-w-3xl">
              <h1 className="text-2xl font-semibold tracking-[-0.04em] text-white sm:text-3xl lg:text-4xl">代码泄露监测</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/58 sm:text-base">支持自定义添加监测对象，围绕公司名、域名、邮箱后缀和项目名持续检索真实代码泄露线索。</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <StatCard label="监测对象" value={String(assets.length)} hint="支持自定义追加" />
              <StatCard label="当前发现" value={String(summary.total)} hint="符合当前筛选范围" />
              <StatCard label="高风险" value={String(summary.highRisk)} hint="严重与高危" />
            </div>
          </div>

          <div className="mt-6 rounded-[30px] border border-white/8 bg-[#0f141d]/84 p-3 backdrop-blur-2xl">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,0.7fr))]">
              <div className="flex min-w-0 items-center gap-3 rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3">
                <Search className="h-5 w-5 shrink-0 text-accent/80" />
                <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索公司名、仓库、文件路径、密钥命名或命中片段" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30 sm:text-base" />
              </div>
              <label className="flex items-center gap-2 rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
                <Filter className="h-4 w-4 text-accent/80" />
                <select value={assetFilter} onChange={(event) => setAssetFilter(event.target.value)} className="w-full bg-transparent text-sm text-white outline-none">
                  <option value="all" className="bg-[#11141c]">全部对象</option>
                  {assets.map((asset) => <option key={asset.id} value={asset.id} className="bg-[#11141c]">{asset.label}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
                <FolderGit2 className="h-4 w-4 text-accent/80" />
                <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as CodeLeakSource | 'all')} className="w-full bg-transparent text-sm text-white outline-none">
                  {sourceOptions.map((item) => <option key={item} value={item} className="bg-[#11141c]">{item === 'all' ? '全部来源' : item}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
                <ShieldAlert className="h-4 w-4 text-accent/80" />
                <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as CodeLeakSeverity | 'all')} className="w-full bg-transparent text-sm text-white outline-none">
                  {severityOptions.map((item) => <option key={item} value={item} className="bg-[#11141c]">{item === 'all' ? '全部等级' : severityLabelMap[item]}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
                <Eye className="h-4 w-4 text-accent/80" />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CodeLeakStatus | 'all')} className="w-full bg-transparent text-sm text-white outline-none">
                  {statusOptions.map((item) => <option key={item} value={item} className="bg-[#11141c]">{item === 'all' ? '全部状态' : statusLabelMap[item]}</option>)}
                </select>
              </label>
            </div>
            {loadError ? <div className="mt-4 rounded-[22px] border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm leading-6 text-red-100">{loadError}</div> : null}
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-[28px] border border-white/8 bg-[#11141c]/82 backdrop-blur-2xl">
          <div className="flex items-center justify-between border-b border-white/6 px-6 py-4">
            <h2 className="text-base font-semibold text-white">发现列表</h2>
            <span className="text-sm text-white/48">{isLoading ? '加载中...' : `${findings.length} 条结果`}</span>
          </div>
          <div className="px-6 py-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-white/55"><Loader2 className="mr-3 h-4 w-4 animate-spin text-accent" />正在加载代码泄露结果...</div>
            ) : findings.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
                <h3 className="text-lg font-semibold text-white">{loadError ? '真实数据当前不可用' : '当前筛选下没有发现'}</h3>
                <p className="mt-3 text-sm leading-7 text-white/55">{loadError ? '这页已经不再回退到本地模拟数据；请检查开发服务和源站配置后再试。' : '可以切换筛选条件，或先在右侧新增监测对象。'}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {findings.map((finding) => (
                  <button key={finding.id} type="button" onClick={() => setSelectedFinding(finding)} className="w-full rounded-[24px] border border-white/8 bg-white/[0.03] p-5 text-left transition-all hover:border-accent/25 hover:bg-white/[0.05]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-semibold', severityToneMap[finding.severity])}>{severityLabelMap[finding.severity]}</span>
                      <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-semibold', statusToneMap[finding.status])}>{statusLabelMap[finding.status]}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/58">{finding.source}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/58">{finding.assetLabel}</span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold leading-relaxed text-white">{finding.title}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/48">
                      <span className="inline-flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5" />{finding.owner}/{finding.repository}</span>
                      <span className="inline-flex items-center gap-1.5"><Code2 className="h-3.5 w-3.5" />{finding.branch}:{finding.path}</span>
                    </div>
                    <p className="mt-3 line-clamp-3 font-mono text-sm leading-7 text-white/62">{finding.snippet}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="space-y-6">
          <Panel title="监测对象">
            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm text-white/68">对象类型</span>
                <select value={newAssetType} onChange={(event) => setNewAssetType(event.target.value as CodeLeakAssetType)} className="w-full rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none">
                  {assetTypeOptions.map((item) => <option key={item} value={item} className="bg-[#11141c]">{assetTypeLabelMap[item]}</option>)}
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-sm text-white/68">对象内容</span>
                <div className="flex gap-3">
                  <input value={newAssetValue} onChange={(event) => setNewAssetValue(event.target.value)} placeholder="例如 company.com、@company.com、项目名" className="min-w-0 flex-1 rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-white/28" />
                  <button type="button" onClick={handleAddAsset} disabled={isSavingAsset} className="inline-flex items-center gap-2 rounded-[18px] border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-accent disabled:opacity-60">
                    <Plus className="h-4 w-4" />
                    添加
                  </button>
                </div>
              </label>
              {assetError ? <div className="rounded-[18px] border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-100">{assetError}</div> : null}
              <div className="space-y-3">
                {assets.map((asset) => (
                  <div key={asset.id} className="flex items-center justify-between gap-3 rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{asset.label}</p>
                      <p className="mt-1 text-xs text-white/45">{assetTypeLabelMap[asset.type]}</p>
                    </div>
                    <button type="button" onClick={() => handleRemoveAsset(asset.id)} disabled={isSavingAsset} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/65 disabled:opacity-60">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="当前状态">
            <div className="space-y-3 text-sm leading-7 text-white/62">
              <div className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-4">
                <p className="font-medium text-white">真实源模式已启用</p>
                <p className="mt-2">页面不再使用本地模拟发现兜底。如果当前无结果，请优先检查后端聚合服务和源站配置。</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-accent/80" />
                  <span>确认 `dev-server.js` 已重启；如需 GitHub 代码级搜索，请配置 `GITHUB_TOKEN`。</span>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {drawer}
    </div>
  );
};

const MetaCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-[18px] border border-white/8 bg-[#0d1219] px-4 py-3">
    <p className="text-[11px] uppercase tracking-[0.22em] text-white/42">{label}</p>
    <p className="mt-2 break-all text-sm leading-6 text-white/82">{value}</p>
  </div>
);

export default CodeLeak;
