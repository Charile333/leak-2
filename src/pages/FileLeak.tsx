import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
  Archive,
  Copy,
  ExternalLink,
  FileSearch,
  FileSpreadsheet,
  FileText,
  Filter,
  Globe,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  FileLeakSearchError,
  fileLeakService,
  type FileLeakAsset,
  type FileLeakAssetType,
  type FileLeakFinding,
  type FileLeakSeverity,
  type FileLeakSensitivity,
  type FileLeakSource,
  type FileLeakStatus,
} from '../services/fileLeakService';
import WebhookSettingsButton from '../components/notifications/WebhookSettingsButton';

const severityToneMap: Record<FileLeakSeverity, string> = {
  critical: 'border-red-500/25 bg-red-500/10 text-red-200',
  high: 'border-orange-500/25 bg-orange-500/10 text-orange-200',
  medium: 'border-amber-500/25 bg-amber-500/10 text-amber-200',
  low: 'border-white/10 bg-white/[0.06] text-white/72',
};

const severityLabelMap: Record<FileLeakSeverity, string> = {
  critical: '严重',
  high: '高危',
  medium: '中危',
  low: '低危',
};

const statusToneMap: Record<FileLeakStatus, string> = {
  new: 'border-red-500/20 bg-red-500/10 text-red-200',
  reviewing: 'border-accent/20 bg-accent/10 text-accent',
  confirmed: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
  dismissed: 'border-white/10 bg-white/[0.06] text-white/62',
};

const statusLabelMap: Record<FileLeakStatus, string> = {
  new: '待处理',
  reviewing: '研判中',
  confirmed: '已确认',
  dismissed: '已忽略',
};

const sensitivityToneMap: Record<FileLeakSensitivity, string> = {
  critical: 'border-red-500/25 bg-red-500/12 text-red-200',
  high: 'border-orange-500/25 bg-orange-500/12 text-orange-200',
  medium: 'border-white/10 bg-white/[0.06] text-white/70',
};

const sensitivityLabelMap: Record<FileLeakSensitivity, string> = {
  critical: '核心敏感',
  high: '高敏感',
  medium: '一般敏感',
};

const assetTypeLabelMap: Record<FileLeakAssetType, string> = {
  company: '公司名',
  domain: '域名',
  email_suffix: '邮箱后缀',
  document_keyword: '文档关键词',
};

const sourceOptions: Array<FileLeakSource | 'all'> = ['all', 'GitHub', 'Gitee'];
const severityOptions: Array<FileLeakSeverity | 'all'> = ['all', 'critical', 'high', 'medium', 'low'];
const statusOptions: Array<FileLeakStatus | 'all'> = ['all', 'new', 'reviewing', 'confirmed', 'dismissed'];
const sensitivityOptions: Array<FileLeakSensitivity | 'all'> = ['all', 'critical', 'high', 'medium'];
const assetTypeOptions: FileLeakAssetType[] = ['company', 'domain', 'email_suffix', 'document_keyword'];

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

const FilterPill = ({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'rounded-full border px-3 py-1.5 text-xs transition-colors',
      active
        ? 'border-accent/40 bg-accent/12 text-accent'
        : 'border-white/10 bg-white/[0.03] text-white/55 hover:border-white/20 hover:text-white/78'
    )}
  >
    {children}
  </button>
);

const getExposureIcon = (finding: FileLeakFinding) => {
  switch (finding.exposure) {
    case 'archive':
    case 'backup':
      return <Archive className="h-4 w-4" />;
    case 'spreadsheet':
    case 'dataset':
      return <FileSpreadsheet className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
};

const FileLeak = () => {
  const [assets, setAssets] = useState<FileLeakAsset[]>([]);
  const [remoteFindings, setRemoteFindings] = useState<FileLeakFinding[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [assetFilter, setAssetFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<FileLeakSource | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<FileLeakSeverity | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<FileLeakStatus | 'all'>('all');
  const [sensitivityFilter, setSensitivityFilter] = useState<FileLeakSensitivity | 'all'>('all');
  const [selectedFinding, setSelectedFinding] = useState<FileLeakFinding | null>(null);
  const [newAssetValue, setNewAssetValue] = useState('');
  const [newAssetType, setNewAssetType] = useState<FileLeakAssetType>('company');
  const [assetError, setAssetError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAsset, setIsSavingAsset] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const latestLoadRequestRef = useRef(0);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      startTransition(() => {
        setDebouncedQuery(deferredSearchQuery.trim());
      });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [deferredSearchQuery]);

  const loadData = async (assetList?: FileLeakAsset[], queryOverride?: string) => {
    const requestId = latestLoadRequestRef.current + 1;
    latestLoadRequestRef.current = requestId;
    setIsLoading(true);
    setLoadError('');
    try {
      const nextAssets = assetList ?? (await fileLeakService.getAssets());
      const nextFindings = await fileLeakService.getFindings(queryOverride ?? debouncedQuery, nextAssets);

      if (latestLoadRequestRef.current !== requestId) return;

      setAssets(nextAssets);
      setRemoteFindings(nextFindings);
    } catch (error) {
      if (latestLoadRequestRef.current !== requestId) return;

      setRemoteFindings([]);
      setLoadError(error instanceof FileLeakSearchError ? error.message : '文件泄露数据加载失败，请稍后再试。');
      if (!assetList) {
        setAssets(await fileLeakService.getAssets().catch(() => []));
      }
    } finally {
      if (latestLoadRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadData(undefined, debouncedQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

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

  const findings = useMemo(
    () =>
      remoteFindings.filter((finding) => {
        if (assetFilter !== 'all' && finding.assetId !== assetFilter) return false;
        if (sourceFilter !== 'all' && finding.source !== sourceFilter) return false;
        if (severityFilter !== 'all' && finding.severity !== severityFilter) return false;
        if (statusFilter !== 'all' && finding.status !== statusFilter) return false;
        if (sensitivityFilter !== 'all' && finding.sensitivity !== sensitivityFilter) return false;
        return true;
      }),
    [assetFilter, remoteFindings, sensitivityFilter, severityFilter, sourceFilter, statusFilter]
  );

  const summary = useMemo(() => {
    const total = findings.length;
    const critical = findings.filter((item) => item.severity === 'critical' || item.sensitivity === 'critical').length;
    const pending = findings.filter((item) => item.status === 'new').length;
    return { total, critical, pending, assetsCount: assets.length };
  }, [assets.length, findings]);

  const handleAddAsset = async () => {
    const value = newAssetValue.trim();
    if (!value) {
      setAssetError('请输入监测对象。');
      return;
    }
    setIsSavingAsset(true);
    setAssetError('');
    try {
      const nextAssets = await fileLeakService.addAsset({ value, type: newAssetType });
      setNewAssetValue('');
      if (assetFilter !== 'all') {
        startTransition(() => {
          setAssetFilter('all');
        });
      }
      await loadData(nextAssets, debouncedQuery);
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : '添加监测对象失败。');
    } finally {
      setIsSavingAsset(false);
    }
  };

  const handleRemoveAsset = async (id: string) => {
    setIsSavingAsset(true);
    setAssetError('');
    try {
      const nextAssets = await fileLeakService.removeAsset(id);
      if (assetFilter === id) {
        startTransition(() => {
          setAssetFilter('all');
        });
      }
      await loadData(nextAssets, debouncedQuery);
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : '删除监测对象失败。');
    } finally {
      setIsSavingAsset(false);
    }
  };

  const handleCopySnippet = async () => {
    if (!selectedFinding) return;
    await navigator.clipboard.writeText(selectedFinding.snippet);
  };

  const handleStatusUpdate = async (status: FileLeakStatus) => {
    if (!selectedFinding) return;
    setIsUpdatingStatus(true);
    await fileLeakService.updateFindingStatus(selectedFinding.id, status);
    setSelectedFinding({ ...selectedFinding, status });
    setRemoteFindings((current) => current.map((item) => (item.id === selectedFinding.id ? { ...item, status } : item)));
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
            aria-label="关闭文件泄露详情"
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
              <div className="border-b border-white/6 px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('rounded-full border px-2.5 py-1 text-xs', severityToneMap[selectedFinding.severity])}>{severityLabelMap[selectedFinding.severity]}</span>
                      <span className={cn('rounded-full border px-2.5 py-1 text-xs', sensitivityToneMap[selectedFinding.sensitivity])}>{sensitivityLabelMap[selectedFinding.sensitivity]}</span>
                    </div>
                    <h2 className="text-xl font-semibold text-white">{selectedFinding.title}</h2>
                    <p className="text-sm text-white/55">{selectedFinding.repository} / {selectedFinding.path}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedFinding(null)} className="rounded-full border border-white/10 p-2 text-white/55 transition-colors hover:border-white/20 hover:text-white" aria-label="关闭">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"><p className="text-[11px] uppercase tracking-[0.2em] text-white/38">来源平台</p><p className="mt-2 text-sm text-white">{selectedFinding.source}</p></div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"><p className="text-[11px] uppercase tracking-[0.2em] text-white/38">文件类型</p><p className="mt-2 text-sm text-white">{selectedFinding.fileType}</p></div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"><p className="text-[11px] uppercase tracking-[0.2em] text-white/38">发现时间</p><p className="mt-2 text-sm text-white">{formatDate(selectedFinding.firstSeen)}</p></div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"><p className="text-[11px] uppercase tracking-[0.2em] text-white/38">最近确认</p><p className="mt-2 text-sm text-white">{formatDate(selectedFinding.lastSeen)}</p></div>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
                  <div className="flex items-center gap-2 text-sm font-medium text-white"><FileSearch className="h-4 w-4 text-accent" />命中摘要</div>
                  <p className="mt-3 rounded-2xl border border-white/8 bg-[#0a1017] px-4 py-4 font-mono text-sm leading-7 text-white/78">{selectedFinding.snippet}</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
                  <div className="flex items-center gap-2 text-sm font-medium text-white"><ShieldAlert className="h-4 w-4 text-accent" />来源地址</div>
                  <a href={selectedFinding.sourceSite || selectedFinding.url} target="_blank" rel="noreferrer" className="mt-3 block break-all text-sm text-accent transition-colors hover:text-accent/80">{selectedFinding.sourceSite || selectedFinding.url}</a>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
                  <div className="flex items-center gap-2 text-sm font-medium text-white"><Globe className="h-4 w-4 text-accent" />研判备注</div>
                  <div className="mt-3 space-y-2">
                    {selectedFinding.notes.map((note) => (
                      <div key={note} className="rounded-2xl border border-white/8 bg-[#0b1118] px-4 py-3 text-sm text-white/68">{note}</div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="border-t border-white/6 px-6 py-5">
                <div className="mb-4 flex flex-wrap gap-2">
                  {statusOptions.filter((status): status is FileLeakStatus => status !== 'all').map((status) => (
                    <button key={status} type="button" disabled={isUpdatingStatus} onClick={() => handleStatusUpdate(status)} className={cn('rounded-full border px-3 py-1.5 text-xs transition-colors', selectedFinding.status === status ? statusToneMap[status] : 'border-white/10 bg-white/[0.03] text-white/55 hover:border-white/20 hover:text-white/78')}>
                      {statusLabelMap[status]}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={handleCopySnippet} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/78 transition-colors hover:border-white/20 hover:text-white"><Copy className="h-4 w-4" />复制摘要</button>
                  <a href={selectedFinding.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/12 px-4 py-2 text-sm text-accent transition-colors hover:bg-accent/18"><ExternalLink className="h-4 w-4" />打开来源</a>
                </div>
              </div>
            </div>
          </motion.aside>
        </AnimatePresence>,
        document.body
      )
    : null;

  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.18),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.1),transparent_40%),rgba(10,15,22,0.82)] px-6 py-7 backdrop-blur-2xl sm:px-7">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-accent/90"><FileSearch className="h-3.5 w-3.5" />File Leak Monitoring</div>
              <div>
                <h1 className="text-3xl font-semibold text-white sm:text-[2.3rem]">文件泄露监测</h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-white/62 sm:text-base">监测客户相关文档、压缩包、数据文件和备份文件在公开仓库中的暴露迹象，优先突出高敏感文件类型与可疑来源。</p>
                <div className="mt-4">
                  <WebhookSettingsButton />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="资产数" value={String(summary.assetsCount)} hint="当前启用的监测对象" />
                <StatCard label="发现数" value={String(summary.total)} hint="本次检索返回的候选结果" />
                <StatCard label="高敏感" value={String(summary.critical)} hint="高风险文件和数据暴露" />
                <StatCard label="待处理" value={String(summary.pending)} hint="仍需人工研判的记录" />
              </div>
            </div>
            <div className="rounded-[28px] border border-white/8 bg-[#0d1219]/78 p-5 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-accent/20 bg-accent/10 p-3 text-accent"><Search className="h-5 w-5" /></div>
                <div><h2 className="text-base font-semibold text-white">搜索与过滤</h2><p className="text-sm text-white/45">先锁定客户对象，再按来源和敏感度快速收窄。</p></div>
              </div>
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm text-white/55">搜索关键词</span>
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"><Search className="h-4 w-4 text-white/35" /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索公司名、域名、文件名、合同号、备份关键字" className="w-full bg-transparent text-sm text-white placeholder:text-white/28 focus:outline-none" /></div>
                </label>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-white/52"><Filter className="h-4 w-4" />快速过滤</div>
                  <div className="flex flex-wrap gap-2">
                    {sourceOptions.map((option) => <FilterPill key={option} active={sourceFilter === option} onClick={() => setSourceFilter(option)}>{option === 'all' ? '全部来源' : option}</FilterPill>)}
                    {sensitivityOptions.map((option) => <FilterPill key={option} active={sensitivityFilter === option} onClick={() => setSensitivityFilter(option)}>{option === 'all' ? '全部敏感度' : sensitivityLabelMap[option]}</FilterPill>)}
                    {statusOptions.map((option) => <FilterPill key={option} active={statusFilter === option} onClick={() => setStatusFilter(option)}>{option === 'all' ? '全部状态' : statusLabelMap[option]}</FilterPill>)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        {loadError ? (
          <div className="rounded-[24px] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-200">{loadError}</div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <Panel title="文件泄露发现" right={<div className="flex flex-wrap gap-2">{severityOptions.map((option) => <FilterPill key={option} active={severityFilter === option} onClick={() => setSeverityFilter(option)}>{option === 'all' ? '全部风险' : severityLabelMap[option]}</FilterPill>)}</div>}>
              {isLoading ? (
                <div className="flex min-h-[360px] items-center justify-center">
                  <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/60"><Loader2 className="h-4 w-4 animate-spin" />正在检索公开文件暴露候选...</div>
                </div>
              ) : findings.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-white/12 bg-white/[0.02] px-6 py-12 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-white/45"><FileSearch className="h-6 w-6" /></div>
                  <h3 className="mt-4 text-base font-medium text-white">暂未发现新的文件暴露结果</h3>
                  <p className="mx-auto mt-2 max-w-2xl text-sm leading-7 text-white/48">先添加客户资产，再尝试更具体的文件关键词，例如合同简称、内部项目代号、员工邮箱后缀或导出文件命名方式。</p>
                </div>
              ) : (
                <div className="space-y-4 [contain-intrinsic-size:900px] [content-visibility:auto]">
                  {findings.map((finding) => (
                    <button key={finding.id} type="button" onClick={() => setSelectedFinding(finding)} className="w-full rounded-[26px] border border-white/8 bg-white/[0.025] p-5 text-left transition-all hover:border-accent/22 hover:bg-white/[0.04]">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn('rounded-full border px-2.5 py-1 text-[11px]', severityToneMap[finding.severity])}>{severityLabelMap[finding.severity]}</span>
                            <span className={cn('rounded-full border px-2.5 py-1 text-[11px]', sensitivityToneMap[finding.sensitivity])}>{sensitivityLabelMap[finding.sensitivity]}</span>
                            <span className={cn('rounded-full border px-2.5 py-1 text-[11px]', statusToneMap[finding.status])}>{statusLabelMap[finding.status]}</span>
                          </div>
                          <div className="mt-3 flex items-center gap-2 text-white">
                            {getExposureIcon(finding)}
                            <h3 className="truncate text-base font-medium">{finding.title}</h3>
                          </div>
                          <p className="mt-2 text-sm text-white/48">{finding.owner} / {finding.repository}</p>
                          <p className="mt-3 break-all rounded-2xl border border-white/8 bg-[#0a1017] px-4 py-3 font-mono text-xs leading-6 text-white/66">{finding.path}</p>
                          <p className="mt-3 line-clamp-2 text-sm leading-7 text-white/58">{finding.snippet}</p>
                        </div>
                        <div className="grid min-w-[210px] gap-3 sm:grid-cols-2 xl:grid-cols-1">
                          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3"><p className="text-[11px] uppercase tracking-[0.18em] text-white/35">文件类型</p><p className="mt-2 text-sm text-white">{finding.fileType}</p></div>
                          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3"><p className="text-[11px] uppercase tracking-[0.18em] text-white/35">来源</p><p className="mt-2 text-sm text-white">{finding.source}</p></div>
                          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 sm:col-span-2 xl:col-span-1"><p className="text-[11px] uppercase tracking-[0.18em] text-white/35">最近发现</p><p className="mt-2 text-sm text-white">{formatDate(finding.lastSeen)}</p></div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel title="监测对象">
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm text-white/55">对象类型</span>
                  <div className="flex flex-wrap gap-2">
                    {assetTypeOptions.map((type) => <FilterPill key={type} active={newAssetType === type} onClick={() => setNewAssetType(type)}>{assetTypeLabelMap[type]}</FilterPill>)}
                  </div>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm text-white/55">新增对象</span>
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"><Globe className="h-4 w-4 text-white/35" /><input value={newAssetValue} onChange={(event) => setNewAssetValue(event.target.value)} placeholder="例如 lysir.com / @lysir.com / 合同模板 / 项目代号" className="w-full bg-transparent text-sm text-white placeholder:text-white/28 focus:outline-none" /></div>
                </label>
                <button type="button" onClick={handleAddAsset} disabled={isSavingAsset} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-accent/28 bg-accent/12 px-4 py-3 text-sm font-medium text-accent transition-colors hover:bg-accent/18 disabled:cursor-not-allowed disabled:opacity-60">
                  {isSavingAsset ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}添加监测对象
                </button>
                {assetError ? <p className="text-sm text-red-300">{assetError}</p> : null}
                <div className="space-y-3">
                  {assets.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-8 text-center text-sm text-white/45">还没有监测对象。先添加客户资产后再启动检索。</div>
                  ) : (
                    assets.map((asset) => (
                      <div key={asset.id} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <button type="button" onClick={() => setAssetFilter((current) => (current === asset.id ? 'all' : asset.id))} className={cn('rounded-full border px-2.5 py-1 text-[11px] transition-colors', assetFilter === asset.id ? 'border-accent/40 bg-accent/12 text-accent' : 'border-white/10 bg-white/[0.03] text-white/55')}>{assetTypeLabelMap[asset.type]}</button>
                              <span className="text-xs text-white/35">已启用</span>
                            </div>
                            <p className="mt-3 break-all text-sm text-white">{asset.label}</p>
                          </div>
                          <button type="button" onClick={() => handleRemoveAsset(asset.id)} disabled={isSavingAsset} className="rounded-full border border-white/10 p-2 text-white/45 transition-colors hover:border-red-400/30 hover:text-red-300" aria-label="删除监测对象"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>
      {drawer}
    </div>
  );
};

export default FileLeak;
