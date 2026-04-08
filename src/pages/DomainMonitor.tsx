import { useEffect, useMemo, useState } from 'react';
import { Bell, ExternalLink, Globe, History, Loader2, Plus, RefreshCw, Save, Send, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { codeLeakService, type CodeLeakAsset, type CodeLeakAssetType } from '../services/codeLeakService';
import { cveIntelAssetService, type CveIntelAsset, type CveIntelAssetType } from '../services/cveIntelAssetService';
import { fileLeakService, type FileLeakAsset, type FileLeakAssetType } from '../services/fileLeakService';
import { monitorService, type CveIntelPreviewItem, type MonitorTask, type MonitorTaskType } from '../services/monitorService';
import { webhookService, type WebhookChannel, type WebhookConfig, type WebhookDeliveryLog } from '../services/webhookService';

type UnifiedAsset = {
  id: string;
  category: 'code_leak' | 'file_leak' | 'cve_intel';
  typeLabel: string;
  value: string;
  notificationLabel: string;
  createdAt: string;
};

const cveAssetTypeLabel: Record<CveIntelAssetType, string> = {
  vendor: '厂商',
  product: '产品',
  component: '组件',
  technology: '技术栈',
  keyword: '关键词',
};

const codeAssetTypeLabel: Record<CodeLeakAssetType, string> = {
  company: '公司名称',
  domain: '域名',
  email_suffix: '邮箱后缀',
  repository: '仓库 / 项目名',
};

const fileAssetTypeLabel: Record<FileLeakAssetType, string> = {
  company: '公司名称',
  domain: '域名',
  email_suffix: '邮箱后缀',
  document_keyword: '文档关键词',
};

const taskLabelMap: Record<MonitorTaskType, string> = {
  code_leak: '代码泄露监测',
  file_leak: '文件泄露监测',
  cve_intel: 'CVE 漏洞推送',
};

const channelLabelMap: Record<WebhookChannel, string> = {
  leak_monitor: '泄露监测机器人',
  cve_intel: 'CVE 漏洞机器人',
};

const codeAssetTypes: CodeLeakAssetType[] = ['company', 'domain', 'email_suffix', 'repository'];
const cveAssetTypes: CveIntelAssetType[] = ['vendor', 'product', 'component', 'technology', 'keyword'];
const fileAssetTypes: FileLeakAssetType[] = ['company', 'domain', 'email_suffix', 'document_keyword'];
const intervalOptions = [15, 30, 60, 120, 240, 360, 720];

const formatTime = (value?: string | null) => {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
};

const formatRelative = (value?: string | null) => {
  if (!value) return '未安排';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const diff = date.getTime() - Date.now();
  const minutes = Math.round(Math.abs(diff) / 60000);

  if (minutes < 1) return diff >= 0 ? '即将执行' : '刚刚执行';
  if (minutes < 60) return diff >= 0 ? `${minutes} 分钟后` : `${minutes} 分钟前`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return diff >= 0 ? `${hours} 小时后` : `${hours} 小时前`;

  const days = Math.round(hours / 24);
  return diff >= 0 ? `${days} 天后` : `${days} 天前`;
};

const getDeliveryStatusTone = (status: WebhookDeliveryLog['status']) =>
  status === 'success'
    ? 'border-emerald-500/30 bg-emerald-500/12 text-emerald-200'
    : 'border-red-500/30 bg-red-500/12 text-red-200';

const getTaskTone = (enabled: boolean) =>
  enabled
    ? 'border-emerald-500/30 bg-emerald-500/12 text-emerald-200'
    : 'border-white/10 bg-white/[0.03] text-white/55';

const emptyWebhookConfig = (channel: WebhookChannel): WebhookConfig => ({
  id: `temp-${channel}`,
  userEmail: '',
  channel,
  url: '',
  secret: '',
  enabled: true,
});

const SkeletonBlock = ({ className }: { className?: string }) => (
  <div className={cn('monitor-skeleton rounded-2xl', className)} aria-hidden="true" />
);

const MonitorSkeleton = () => (
  <div className="space-y-8">
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-3">
        <SkeletonBlock className="h-10 w-48 rounded-xl" />
        <SkeletonBlock className="h-4 w-[min(42rem,72vw)] rounded-full" />
        <SkeletonBlock className="h-4 w-[min(36rem,64vw)] rounded-full" />
      </div>
      <SkeletonBlock className="h-11 w-28 rounded-full" />
    </div>

    <div className="glass-card overflow-hidden rounded-2xl border-white/5 bg-[#16161a] shadow-2xl">
      <div className="flex items-center gap-3 border-b border-white/5 bg-[#1a1a20]/50 p-6">
        <SkeletonBlock className="h-9 w-9 rounded-lg" />
        <SkeletonBlock className="h-4 w-28 rounded-full" />
      </div>
      <div className="grid gap-6 border-b border-white/5 bg-black/10 px-6 py-5 lg:grid-cols-2">
        {[0, 1].map((index) => (
          <div key={`channel-${index}`} className="rounded-2xl border border-white/8 bg-[#101217] p-4">
            <div className="flex items-center justify-between gap-3">
              <SkeletonBlock className="h-4 w-32 rounded-full" />
              <SkeletonBlock className="h-7 w-20 rounded-full" />
            </div>
            <div className="mt-4 grid gap-3">
              <SkeletonBlock className="h-12 w-full rounded-2xl" />
              <SkeletonBlock className="h-12 w-full rounded-2xl" />
              <div className="flex flex-wrap gap-2">
                <SkeletonBlock className="h-11 w-24 rounded-2xl" />
                <SkeletonBlock className="h-11 w-24 rounded-2xl" />
                <SkeletonBlock className="h-11 w-28 rounded-2xl" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-3 px-6 py-5">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={`webhook-row-${index}`} className="grid gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-4 md:grid-cols-6">
            <SkeletonBlock className="h-6 w-16 rounded-full" />
            <SkeletonBlock className="h-4 w-24 rounded-full" />
            <SkeletonBlock className="h-4 w-28 rounded-full" />
            <SkeletonBlock className="h-4 w-full rounded-full" />
            <SkeletonBlock className="h-4 w-12 rounded-full" />
            <SkeletonBlock className="h-4 w-28 rounded-full" />
          </div>
        ))}
      </div>
    </div>

    <div className="glass-card overflow-hidden rounded-2xl border-white/5 bg-[#16161a] shadow-2xl">
      <div className="flex items-center gap-3 border-b border-white/5 bg-[#1a1a20]/50 p-6">
        <SkeletonBlock className="h-9 w-9 rounded-lg" />
        <SkeletonBlock className="h-4 w-40 rounded-full" />
      </div>
      <div className="space-y-4 border-b border-white/5 bg-black/10 px-6 py-5">
        {[0, 1, 2].map((index) => (
          <div key={`asset-form-${index}`} className="grid gap-4 lg:grid-cols-[auto_1fr_auto]">
            <SkeletonBlock className="h-12 w-full min-w-[9rem] rounded-2xl" />
            <SkeletonBlock className="h-12 w-full rounded-2xl" />
            <SkeletonBlock className="h-12 w-full min-w-[9rem] rounded-2xl" />
          </div>
        ))}
      </div>
      <div className="space-y-3 px-6 py-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={`asset-row-${index}`} className="grid gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-4 md:grid-cols-[1.2fr_0.9fr_1.6fr_1.2fr_1fr_auto]">
            <SkeletonBlock className="h-6 w-24 rounded-full" />
            <SkeletonBlock className="h-4 w-20 rounded-full" />
            <SkeletonBlock className="h-4 w-full rounded-full" />
            <SkeletonBlock className="h-4 w-full rounded-full" />
            <SkeletonBlock className="h-4 w-20 rounded-full" />
            <SkeletonBlock className="h-9 w-9 rounded-full" />
          </div>
        ))}
      </div>
    </div>

    <div className="glass-card overflow-hidden rounded-2xl border-white/5 bg-[#16161a] shadow-2xl">
      <div className="flex items-center gap-3 border-b border-white/5 bg-[#1a1a20]/50 p-6">
        <SkeletonBlock className="h-9 w-9 rounded-lg" />
        <SkeletonBlock className="h-4 w-28 rounded-full" />
      </div>
      <div className="grid gap-4 border-b border-white/5 bg-black/10 px-6 py-5 lg:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={`task-card-${index}`} className="rounded-2xl border border-white/8 bg-[#101217] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <SkeletonBlock className="h-4 w-32 rounded-full" />
              <SkeletonBlock className="h-7 w-16 rounded-full" />
            </div>
            <SkeletonBlock className="mt-3 h-10 w-full rounded-xl" />
            <SkeletonBlock className="mt-3 h-3.5 w-28 rounded-full" />
            <SkeletonBlock className="mt-2 h-3.5 w-24 rounded-full" />
          </div>
        ))}
      </div>
      <div className="space-y-3 px-6 py-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={`run-row-${index}`} className="grid gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-4 md:grid-cols-[1.1fr_1fr_0.9fr_0.9fr_0.7fr_1.2fr]">
            <SkeletonBlock className="h-4 w-full rounded-full" />
            <SkeletonBlock className="h-4 w-full rounded-full" />
            <SkeletonBlock className="h-4 w-20 rounded-full" />
            <SkeletonBlock className="h-4 w-24 rounded-full" />
            <SkeletonBlock className="h-6 w-16 rounded-full" />
            <SkeletonBlock className="h-4 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

const DomainMonitor = () => {
  const [codeAssets, setCodeAssets] = useState<CodeLeakAsset[]>([]);
  const [cveAssets, setCveAssets] = useState<CveIntelAsset[]>([]);
  const [fileAssets, setFileAssets] = useState<FileLeakAsset[]>([]);
  const [tasks, setTasks] = useState<MonitorTask[]>([]);
  const [cvePreview, setCvePreview] = useState<CveIntelPreviewItem[]>([]);
  const [webhookConfigs, setWebhookConfigs] = useState<Record<WebhookChannel, WebhookConfig>>({
    leak_monitor: emptyWebhookConfig('leak_monitor'),
    cve_intel: emptyWebhookConfig('cve_intel'),
  });
  const [webhookLogs, setWebhookLogs] = useState<WebhookDeliveryLog[]>([]);
  const [codeAssetValue, setCodeAssetValue] = useState('');
  const [cveAssetValue, setCveAssetValue] = useState('');
  const [fileAssetValue, setFileAssetValue] = useState('');
  const [codeAssetType, setCodeAssetType] = useState<CodeLeakAssetType>('company');
  const [cveAssetType, setCveAssetType] = useState<CveIntelAssetType>('product');
  const [fileAssetType, setFileAssetType] = useState<FileLeakAssetType>('company');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingAsset, setIsSavingAsset] = useState<'code' | 'file' | 'cve' | null>(null);
  const [isSavingTask, setIsSavingTask] = useState<MonitorTaskType | null>(null);
  const [isSavingChannel, setIsSavingChannel] = useState<WebhookChannel | null>(null);
  const [isTestingChannel, setIsTestingChannel] = useState<WebhookChannel | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadMonitorData = async (background = false) => {
    if (background) setIsRefreshing(true);
    else setIsLoading(true);

    setError('');

    try {
      const [nextCodeAssets, nextCveAssets, nextFileAssets, nextTasks, leakSnapshot, cveSnapshot, nextCvePreview] = await Promise.all([
        codeLeakService.getAssets(),
        cveIntelAssetService.getAssets(),
        fileLeakService.getAssets(),
        monitorService.getTasks(),
        monitorService.getWebhookSnapshot('leak_monitor'),
        monitorService.getWebhookSnapshot('cve_intel'),
        monitorService.getCvePreview().catch(() => []),
      ]);

      setCodeAssets(nextCodeAssets);
      setCveAssets(nextCveAssets);
      setFileAssets(nextFileAssets);
      setTasks(nextTasks);
      setWebhookConfigs({
        leak_monitor: leakSnapshot.config || emptyWebhookConfig('leak_monitor'),
        cve_intel: cveSnapshot.config || emptyWebhookConfig('cve_intel'),
      });
      setWebhookLogs(
        (leakSnapshot.logs || [])
          .slice()
          .sort((a, b) => new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime())
          .slice(0, 10)
      );
      setCvePreview(nextCvePreview);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '监控总览加载失败，请稍后再试。');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadMonitorData();
  }, []);

  const taskMap = useMemo(
    () =>
      tasks.reduce<Record<string, MonitorTask>>((accumulator, task) => {
        accumulator[task.scanType] = task;
        return accumulator;
      }, {}),
    [tasks]
  );

  const unifiedAssets = useMemo<UnifiedAsset[]>(() => {
    const leakNotification = webhookConfigs.leak_monitor.enabled ? '泄露机器人已启用' : '泄露机器人未启用';
    const cveNotification = webhookConfigs.cve_intel.enabled ? 'CVE 机器人已启用' : 'CVE 机器人未启用';

    const codeRows = codeAssets.map((asset) => ({
      id: asset.id,
      category: 'code_leak' as const,
      typeLabel: codeAssetTypeLabel[asset.type],
      value: asset.label,
      notificationLabel: leakNotification,
      createdAt: '已加入监控',
    }));

    const fileRows = fileAssets.map((asset) => ({
      id: asset.id,
      category: 'file_leak' as const,
      typeLabel: fileAssetTypeLabel[asset.type],
      value: asset.label,
      notificationLabel: leakNotification,
      createdAt: '已加入监控',
    }));

    const cveRows = cveAssets.map((asset) => ({
      id: asset.id,
      category: 'cve_intel' as const,
      typeLabel: cveAssetTypeLabel[asset.type],
      value: asset.label,
      notificationLabel: cveNotification,
      createdAt: '已加入匹配',
    }));

    return [...codeRows, ...fileRows, ...cveRows];
  }, [codeAssets, cveAssets, fileAssets, webhookConfigs]);

  const monitoringRows = useMemo(() => {
    const taskRows = (['code_leak', 'file_leak', 'cve_intel'] as MonitorTaskType[]).map((scanType) => {
      const task = taskMap[scanType];
      return {
        id: task?.id || scanType,
        name: taskLabelMap[scanType],
        scope:
          scanType === 'cve_intel'
            ? `${cveAssets.length} 个匹配对象`
            : `${scanType === 'code_leak' ? codeAssets.length : fileAssets.length} 个监控对象`,
        interval: task?.intervalMinutes ?? 60,
        nextRun: formatRelative(task?.nextRunAt),
        lastRun: formatTime(task?.lastRunAt),
        enabled: task?.enabled ?? false,
      };
    });

    const deliveryRows = webhookLogs.slice(0, 4).map((log) => ({
      id: log.id,
      name: `推送记录 / ${channelLabelMap[(log.channel as WebhookChannel) || 'leak_monitor']}`,
      scope: log.eventName,
      interval: log.responseStatus ?? 0,
      nextRun: formatTime(log.deliveredAt),
      lastRun: log.status === 'success' ? '推送成功' : log.errorMessage || '推送失败',
      enabled: log.status === 'success',
    }));

    return [...taskRows, ...deliveryRows];
  }, [taskMap, codeAssets.length, cveAssets.length, fileAssets.length, webhookLogs]);

  const saveWebhookChannel = async (channel: WebhookChannel) => {
    const config = webhookConfigs[channel];
    if (!config.url.trim()) {
      setError(`请填写 ${channelLabelMap[channel]} 的 Webhook 地址。`);
      return;
    }

    setIsSavingChannel(channel);
    setError('');
    setSuccess('');

    try {
      const saved = await webhookService.saveConfig({
        channel,
        url: config.url,
        secret: config.secret,
        enabled: config.enabled,
      });
      setWebhookConfigs((current) => ({ ...current, [channel]: saved }));
      await loadMonitorData(true);
      setSuccess(`${channelLabelMap[channel]}配置已保存。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存推送配置失败。');
    } finally {
      setIsSavingChannel(null);
    }
  };

  const testWebhookChannel = async (channel: WebhookChannel) => {
    setIsTestingChannel(channel);
    setError('');
    setSuccess('');

    try {
      const result = await webhookService.testConfig(channel);
      if (result.delivered) {
        setSuccess(`${channelLabelMap[channel]}测试推送已发送。`);
      } else {
        setError(result.error || `${channelLabelMap[channel]}测试推送失败。`);
      }
      await loadMonitorData(true);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : '测试推送失败。');
    } finally {
      setIsTestingChannel(null);
    }
  };

  const handleSaveTask = async (scanType: MonitorTaskType, patch: Partial<MonitorTask>) => {
    const task = taskMap[scanType];
    if (!task) return;

    setIsSavingTask(scanType);
    setError('');
    setSuccess('');

    try {
      const saved = await monitorService.saveTask({
        id: task.id,
        scanType,
        label: task.label,
        query: patch.query ?? task.query,
        intervalMinutes: patch.intervalMinutes ?? task.intervalMinutes,
        enabled: patch.enabled ?? task.enabled,
        lastRunAt: task.lastRunAt,
        createdAt: task.createdAt,
      });
      setTasks((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setSuccess(`${taskLabelMap[scanType]}已更新。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存监控任务失败。');
    } finally {
      setIsSavingTask(null);
    }
  };

  const handleAddCodeAsset = async () => {
    const value = codeAssetValue.trim();
    if (!value) {
      setError('请输入要监控的代码泄露对象。');
      return;
    }

    setIsSavingAsset('cve');
    setError('');
    setSuccess('');

    try {
      setCodeAssets(await codeLeakService.addAsset({ value, type: codeAssetType }));
      setCodeAssetValue('');
      setSuccess('代码泄露监控对象已添加。');
    } catch (assetError) {
      setError(assetError instanceof Error ? assetError.message : '添加代码泄露监控对象失败。');
    } finally {
      setIsSavingAsset(null);
    }
  };

  const handleAddCveAsset = async () => {
    const value = cveAssetValue.trim();
    if (!value) {
      setError('请输入要匹配的厂商、产品、组件或技术栈。');
      return;
    }

    setIsSavingAsset('code');
    setError('');
    setSuccess('');

    try {
      setCveAssets(await cveIntelAssetService.addAsset({ value, type: cveAssetType }));
      setCveAssetValue('');
      setSuccess('CVE 匹配对象已添加。');
    } catch (assetError) {
      setError(assetError instanceof Error ? assetError.message : '添加 CVE 匹配对象失败。');
    } finally {
      setIsSavingAsset(null);
    }
  };

  const handleAddFileAsset = async () => {
    const value = fileAssetValue.trim();
    if (!value) {
      setError('请输入要监控的文件泄露对象。');
      return;
    }

    setIsSavingAsset('file');
    setError('');
    setSuccess('');

    try {
      setFileAssets(await fileLeakService.addAsset({ value, type: fileAssetType }));
      setFileAssetValue('');
      setSuccess('文件泄露监控对象已添加。');
    } catch (assetError) {
      setError(assetError instanceof Error ? assetError.message : '添加文件泄露监控对象失败。');
    } finally {
      setIsSavingAsset(null);
    }
  };

  const handleRemoveAsset = async (asset: UnifiedAsset) => {
    setIsSavingAsset(asset.category === 'file_leak' ? 'file' : asset.category === 'cve_intel' ? 'cve' : 'code');
    setError('');
    setSuccess('');

    try {
      if (asset.category === 'code_leak') {
        setCodeAssets(await codeLeakService.removeAsset(asset.id));
      } else if (asset.category === 'cve_intel') {
        setCveAssets(await cveIntelAssetService.removeAsset(asset.id));
      } else {
        setFileAssets(await fileLeakService.removeAsset(asset.id));
      }
      setSuccess('监控对象已移除。');
    } catch (assetError) {
      setError(assetError instanceof Error ? assetError.message : '移除监控对象失败。');
    } finally {
      setIsSavingAsset(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-8 animate-in fade-in duration-700">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">监控总览</h1>
            <p className="max-w-3xl text-sm leading-relaxed text-gray-400">
              在一个页面里统一管理泄露监测机器人、CVE 漏洞机器人、监控对象和定时任务，让监控配置、推送验证和运行状态一目了然。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadMonitorData(true)}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/72 transition-colors hover:border-accent/25 hover:text-white"
          >
            {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin text-accent" /> : <RefreshCw className="h-4 w-4 text-accent" />}
            刷新
          </button>
        </div>
      </div>

      {(error || success) && (
        <div className="space-y-3">
          {error ? <div className="rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-200">{error}</div> : null}
          {success ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-100">{success}</div> : null}
        </div>
      )}

      {isLoading ? (
        <MonitorSkeleton />
      ) : (
        <>
          <div className="glass-card overflow-hidden rounded-2xl border-white/5 bg-[#16161a] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 bg-[#1a1a20]/50 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-indigo-500/10 p-2">
                  <Bell className="h-5 w-5 text-indigo-400" />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">通知方式</h3>
              </div>
            </div>

            <div className="grid gap-6 border-b border-white/5 bg-black/10 px-6 py-5 lg:grid-cols-2">
              {(['leak_monitor', 'cve_intel'] as WebhookChannel[]).map((channel) => {
                const config = webhookConfigs[channel];

                return (
                  <div key={channel} className="rounded-2xl border border-white/8 bg-[#101217] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{channelLabelMap[channel]}</p>
                      <span className={cn('rounded-full border px-3 py-1 text-[11px]', config.enabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-white/10 bg-white/[0.04] text-white/55')}>
                        {config.enabled ? '已启用' : '未启用'}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <input
                        value={config.url}
                        onChange={(event) =>
                          setWebhookConfigs((current) => ({
                            ...current,
                            [channel]: { ...current[channel], url: event.target.value },
                          }))
                        }
                        placeholder="请输入 Webhook / 机器人地址"
                        className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
                      />
                      <input
                        value={config.secret}
                        onChange={(event) =>
                          setWebhookConfigs((current) => ({
                            ...current,
                            [channel]: { ...current[channel], secret: event.target.value },
                          }))
                        }
                        placeholder="密钥 / 签名 Secret（可选）"
                        className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setWebhookConfigs((current) => ({
                              ...current,
                              [channel]: { ...current[channel], enabled: !current[channel].enabled },
                            }))
                          }
                          className={cn('rounded-2xl border px-4 py-3 text-sm font-medium transition-colors', config.enabled ? 'border-accent/30 bg-accent/12 text-accent' : 'border-white/10 bg-white/[0.03] text-white/55')}
                        >
                          {config.enabled ? '关闭推送' : '启用推送'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveWebhookChannel(channel)}
                          disabled={isSavingChannel === channel}
                          className="inline-flex items-center gap-2 rounded-2xl border border-accent/25 bg-accent/12 px-4 py-3 text-sm text-accent disabled:opacity-60"
                        >
                          {isSavingChannel === channel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          保存
                        </button>
                        <button
                          type="button"
                          onClick={() => void testWebhookChannel(channel)}
                          disabled={isTestingChannel === channel || !config.url}
                          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70 disabled:opacity-60"
                        >
                          {isTestingChannel === channel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          测试推送
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-black/20 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                    <th className="px-6 py-4">状态</th>
                    <th className="px-6 py-4">通道</th>
                    <th className="px-6 py-4">事件</th>
                    <th className="px-6 py-4">地址</th>
                    <th className="px-6 py-4">响应</th>
                    <th className="px-6 py-4">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {webhookLogs.length === 0 ? (
                    <tr className="text-sm">
                      <td colSpan={6} className="px-6 py-6 text-gray-500">
                        暂无推送记录。保存机器人后可以先点一次“测试推送”验证链路。
                      </td>
                    </tr>
                  ) : (
                    webhookLogs.map((log) => (
                      <tr key={log.id} className="text-sm transition-colors hover:bg-white/[0.02]">
                        <td className="px-6 py-4">
                          <span className={cn('rounded-full border px-3 py-1 text-xs font-bold', getDeliveryStatusTone(log.status))}>
                            {log.status === 'success' ? '成功' : '失败'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-300">{channelLabelMap[(log.channel as WebhookChannel) || 'leak_monitor']}</td>
                        <td className="px-6 py-4 text-gray-300">{log.eventName}</td>
                        <td className="max-w-[280px] truncate px-6 py-4 font-mono text-xs text-gray-400">{log.webhookUrl}</td>
                        <td className="px-6 py-4 text-gray-400">{log.responseStatus ?? '--'}</td>
                        <td className="px-6 py-4 text-xs text-gray-500">{formatTime(log.deliveredAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="glass-card overflow-hidden rounded-2xl border-white/5 bg-[#16161a] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 bg-[#1a1a20]/50 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-500/10 p-2">
                  <Globe className="h-5 w-5 text-emerald-400" />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">监控目标 ({unifiedAssets.length}/100)</h3>
              </div>
            </div>

            <div className="space-y-4 border-b border-white/5 bg-black/10 px-6 py-5">
              <div className="grid gap-4 lg:grid-cols-[auto_1fr_auto]">
                <select
                  value={codeAssetType}
                  onChange={(event) => setCodeAssetType(event.target.value as CodeLeakAssetType)}
                  className="rounded-2xl border border-white/8 bg-[#101217] px-4 py-3 text-sm text-white outline-none"
                >
                  {codeAssetTypes.map((type) => (
                    <option key={type} value={type} className="bg-[#11141c]">
                      {codeAssetTypeLabel[type]}
                    </option>
                  ))}
                </select>
                <input
                  value={codeAssetValue}
                  onChange={(event) => setCodeAssetValue(event.target.value)}
                  placeholder="添加代码泄露监控对象"
                  className="rounded-2xl border border-white/8 bg-[#101217] px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
                />
                <button
                  type="button"
                  onClick={handleAddCodeAsset}
                  disabled={isSavingAsset === 'code'}
                  className="inline-flex items-center gap-2 rounded-2xl border border-accent/25 bg-accent/12 px-4 py-3 text-sm text-accent disabled:opacity-60"
                >
                  {isSavingAsset === 'code' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  添加代码对象
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-[auto_1fr_auto]">
                <select
                  value={fileAssetType}
                  onChange={(event) => setFileAssetType(event.target.value as FileLeakAssetType)}
                  className="rounded-2xl border border-white/8 bg-[#101217] px-4 py-3 text-sm text-white outline-none"
                >
                  {fileAssetTypes.map((type) => (
                    <option key={type} value={type} className="bg-[#11141c]">
                      {fileAssetTypeLabel[type]}
                    </option>
                  ))}
                </select>
                <input
                  value={fileAssetValue}
                  onChange={(event) => setFileAssetValue(event.target.value)}
                  placeholder="添加文件泄露监控对象"
                  className="rounded-2xl border border-white/8 bg-[#101217] px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
                />
                <button
                  type="button"
                  onClick={handleAddFileAsset}
                  disabled={isSavingAsset === 'file'}
                  className="inline-flex items-center gap-2 rounded-2xl border border-sky-400/25 bg-sky-400/12 px-4 py-3 text-sm text-sky-200 disabled:opacity-60"
                >
                  {isSavingAsset === 'file' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  添加文件对象
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-[auto_1fr_auto]">
                <select
                  value={cveAssetType}
                  onChange={(event) => setCveAssetType(event.target.value as CveIntelAssetType)}
                  className="rounded-2xl border border-white/8 bg-[#101217] px-4 py-3 text-sm text-white outline-none"
                >
                  {cveAssetTypes.map((type) => (
                    <option key={type} value={type} className="bg-[#11141c]">
                      {cveAssetTypeLabel[type]}
                    </option>
                  ))}
                </select>
                <input
                  value={cveAssetValue}
                  onChange={(event) => setCveAssetValue(event.target.value)}
                  placeholder="添加厂商、产品、组件或技术栈"
                  className="rounded-2xl border border-white/8 bg-[#101217] px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
                />
                <button
                  type="button"
                  onClick={handleAddCveAsset}
                  disabled={isSavingAsset === 'cve'}
                  className="inline-flex items-center gap-2 rounded-2xl border border-fuchsia-400/25 bg-fuchsia-400/12 px-4 py-3 text-sm text-fuchsia-200 disabled:opacity-60"
                >
                  {isSavingAsset === 'cve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  添加 CVE 对象
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-black/20 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                    <th className="px-6 py-4">分类</th>
                    <th className="px-6 py-4">类型</th>
                    <th className="px-6 py-4">监控内容</th>
                    <th className="px-6 py-4">通知通道</th>
                    <th className="px-6 py-4">状态</th>
                    <th className="px-6 py-4 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {unifiedAssets.map((asset) => (
                    <tr key={asset.id} className="text-sm transition-colors hover:bg-white/[0.02]">
                      <td className="px-6 py-4">
                        <span className="rounded-full border border-gray-500/30 bg-gray-500/20 px-3 py-1 text-xs font-bold text-gray-300">
                          {taskLabelMap[asset.category]}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-400">{asset.typeLabel}</td>
                      <td className="px-6 py-4 font-medium text-gray-300">{asset.value}</td>
                      <td className="px-6 py-4 text-gray-400">{asset.notificationLabel}</td>
                      <td className="px-6 py-4 text-xs text-gray-500">{asset.createdAt}</td>
                      <td className="px-6 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => void handleRemoveAsset(asset)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/55 transition-colors hover:border-red-400/30 hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="glass-card overflow-hidden rounded-2xl border-white/5 bg-[#16161a] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 bg-[#1a1a20]/50 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-500/10 p-2">
                  <History className="h-5 w-5 text-amber-400" />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">运行记录</h3>
              </div>
            </div>

            <div className="grid gap-4 border-b border-white/5 bg-black/10 px-6 py-5 lg:grid-cols-3">
              {(['code_leak', 'file_leak', 'cve_intel'] as MonitorTaskType[]).map((scanType) => {
                const task = taskMap[scanType];
                return (
                  <div key={scanType} className="rounded-2xl border border-white/8 bg-[#101217] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{taskLabelMap[scanType]}</p>
                      <button
                        type="button"
                        onClick={() => void handleSaveTask(scanType, { enabled: !(task?.enabled ?? false) })}
                        disabled={!task || isSavingTask === scanType}
                        className={cn('rounded-full border px-3 py-1 text-[11px] font-bold', getTaskTone(Boolean(task?.enabled)))}
                      >
                        {task?.enabled ? '运行中' : '已暂停'}
                      </button>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <select
                        value={task?.intervalMinutes ?? 60}
                        onChange={(event) => void handleSaveTask(scanType, { intervalMinutes: Number(event.target.value) })}
                        className="min-w-0 flex-1 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none"
                      >
                        {intervalOptions.map((option) => (
                          <option key={option} value={option} className="bg-[#11141c]">
                            每 {option} 分钟
                          </option>
                        ))}
                      </select>
                    </div>

                    <p className="mt-3 text-xs text-white/42">上次执行：{formatTime(task?.lastRunAt)}</p>
                    <p className="mt-1 text-xs text-white/42">下次执行：{formatRelative(task?.nextRunAt)}</p>
                  </div>
                );
              })}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-black/20 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                    <th className="px-6 py-4">名称</th>
                    <th className="px-6 py-4">范围</th>
                    <th className="px-6 py-4">频率 / 响应</th>
                    <th className="px-6 py-4">时间</th>
                    <th className="px-6 py-4">状态</th>
                    <th className="px-6 py-4">说明</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {monitoringRows.map((row) => (
                    <tr key={row.id} className="text-sm transition-colors hover:bg-white/[0.02]">
                      <td className="px-6 py-4 text-gray-300">{row.name}</td>
                      <td className="px-6 py-4 text-gray-400">{row.scope}</td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-400">
                        {row.name.startsWith('推送记录') ? row.interval || '--' : `每 ${row.interval} 分钟`}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500">{row.nextRun}</td>
                      <td className="px-6 py-4">
                        <span className={cn('rounded-full border px-4 py-0.5 text-[10px] font-black', getTaskTone(row.enabled))}>
                          {row.enabled ? '正常' : '异常'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500">{row.lastRun}</td>
                    </tr>
                  ))}

                  {cvePreview.slice(0, 3).map((item) => (
                    <tr key={item.cveId} className="text-sm transition-colors hover:bg-white/[0.02]">
                      <td className="px-6 py-4 text-gray-300">CVE 预警</td>
                      <td className="px-6 py-4 text-gray-400">{item.cveId}</td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-400">
                        {typeof item.cvssScore === 'number' ? `CVSS ${item.cvssScore.toFixed(1)}` : '--'}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500">{item.pushLevel}</td>
                      <td className="px-6 py-4">
                        <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-0.5 text-[10px] font-black text-rose-200">
                          {item.pushRecommended ? '建议推送' : '仅观察'}
                        </span>
                      </td>
                      <td className="max-w-[360px] px-6 py-4 text-xs text-gray-400">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{item.title}</span>
                          {item.references[0] ? (
                            <a href={item.references[0]} target="_blank" rel="noreferrer" className="text-accent hover:text-accent/80">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DomainMonitor;
