import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, ExternalLink, Globe, History, Loader2, Plus, RefreshCw, Save, Send, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { codeLeakService, type CodeLeakAsset, type CodeLeakAssetType } from '../services/codeLeakService';
import { cveIntelAssetService, type CveIntelAsset, type CveIntelAssetType } from '../services/cveIntelAssetService';
import { fileLeakService, type FileLeakAsset, type FileLeakAssetType } from '../services/fileLeakService';
import { monitorService, type CveIntelPreviewItem, type MonitorRun, type MonitorTask, type MonitorTaskType } from '../services/monitorService';
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
const webhookChannels: WebhookChannel[] = ['leak_monitor', 'cve_intel'];
const monitorTaskTypes: MonitorTaskType[] = ['code_leak', 'file_leak', 'cve_intel'];

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

type MonitoringRow = {
  id: string;
  name: string;
  scope: string;
  interval: string;
  nextRun: string;
  lastRun: string;
  enabled: boolean;
};

type WebhookPanelProps = {
  loading: boolean;
  webhookConfigs: Record<WebhookChannel, WebhookConfig>;
  webhookLogs: WebhookDeliveryLog[];
  isSavingChannel: WebhookChannel | null;
  isTestingChannel: WebhookChannel | null;
  onConfigChange: (channel: WebhookChannel, field: 'url' | 'secret', value: string) => void;
  onToggleChannel: (channel: WebhookChannel) => void;
  onSaveChannel: (channel: WebhookChannel) => void;
  onTestChannel: (channel: WebhookChannel) => void;
};

const WebhookPanel = memo(function WebhookPanel({ loading, webhookConfigs, webhookLogs, isSavingChannel, isTestingChannel, onConfigChange, onToggleChannel, onSaveChannel, onTestChannel }: WebhookPanelProps) {
  return (
    <div className="glass-card overflow-hidden rounded-2xl border-white/5 bg-[#16161a] shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/5 bg-[#1a1a20]/50 p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-indigo-500/10 p-2"><Bell className="h-5 w-5 text-indigo-400" /></div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-white">Notification Channels</h3>
        </div>
      </div>
      {loading ? (
        <>
          <div className="grid gap-6 border-b border-white/5 bg-black/10 px-6 py-5 lg:grid-cols-2">
            {[0, 1].map((index) => (
              <div key={`webhook-loading-${index}`} className="rounded-2xl border border-white/8 bg-[#101217] p-4">
                <div className="flex items-center justify-between gap-3">
                  <SkeletonBlock className="h-4 w-32 rounded-full" />
                  <SkeletonBlock className="h-7 w-20 rounded-full" />
                </div>
                <div className="mt-4 grid gap-3">
                  <SkeletonBlock className="h-12 w-full rounded-2xl" />
                  <SkeletonBlock className="h-12 w-full rounded-2xl" />
                  <div className="flex flex-wrap gap-2">
                    <SkeletonBlock className="h-11 w-24 rounded-2xl" />
                    <SkeletonBlock className="h-11 w-28 rounded-2xl" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-3 px-6 py-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`webhook-log-loading-${index}`} className="grid gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-4 md:grid-cols-6">
                <SkeletonBlock className="h-6 w-16 rounded-full" />
                <SkeletonBlock className="h-4 w-24 rounded-full" />
                <SkeletonBlock className="h-4 w-28 rounded-full" />
                <SkeletonBlock className="h-4 w-full rounded-full" />
                <SkeletonBlock className="h-4 w-12 rounded-full" />
                <SkeletonBlock className="h-4 w-28 rounded-full" />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
      <div className="grid gap-6 border-b border-white/5 bg-black/10 px-6 py-5 lg:grid-cols-2">
        {webhookChannels.map((channel) => {
          const config = webhookConfigs[channel];
          return (
            <div key={channel} className="rounded-2xl border border-white/8 bg-[#101217] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">{channelLabelMap[channel]}</p>
                <span className={cn('rounded-full border px-3 py-1 text-[11px]', config.enabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-white/10 bg-white/[0.04] text-white/55')}>{config.enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
              <div className="mt-4 grid gap-3">
                <input value={config.url} onChange={(event) => onConfigChange(channel, 'url', event.target.value)} placeholder="Webhook URL" className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-white/28" />
                <input value={config.secret} onChange={(event) => onConfigChange(channel, 'secret', event.target.value)} placeholder="Secret (optional)" className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-white/28" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onToggleChannel(channel)} className={cn('rounded-2xl border px-4 py-3 text-sm font-medium transition-colors', config.enabled ? 'border-accent/30 bg-accent/12 text-accent' : 'border-white/10 bg-white/[0.03] text-white/55')}>{config.enabled ? 'Disable push' : 'Enable push'}</button>
                  <button type="button" onClick={() => onSaveChannel(channel)} disabled={isSavingChannel === channel} className="inline-flex items-center gap-2 rounded-2xl border border-accent/25 bg-accent/12 px-4 py-3 text-sm text-accent disabled:opacity-60">{isSavingChannel === channel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save</button>
                  <button type="button" onClick={() => onTestChannel(channel)} disabled={isTestingChannel === channel || !config.url} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70 disabled:opacity-60">{isTestingChannel === channel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Test delivery</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="bg-black/20 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500"><th className="px-6 py-4">Status</th><th className="px-6 py-4">Channel</th><th className="px-6 py-4">Event</th><th className="px-6 py-4">URL</th><th className="px-6 py-4">Response</th><th className="px-6 py-4">Time</th></tr></thead><tbody className="divide-y divide-white/5">{webhookLogs.length === 0 ? <tr className="text-sm"><td colSpan={6} className="px-6 py-6 text-gray-500">No webhook delivery records yet.</td></tr> : webhookLogs.map((log) => <tr key={log.id} className="text-sm transition-colors hover:bg-white/[0.02]"><td className="px-6 py-4"><span className={cn('rounded-full border px-3 py-1 text-xs font-bold', getDeliveryStatusTone(log.status))}>{log.status === 'success' ? 'Success' : 'Failed'}</span></td><td className="px-6 py-4 text-gray-300">{channelLabelMap[(log.channel as WebhookChannel) || 'leak_monitor']}</td><td className="px-6 py-4 text-gray-300">{log.eventName}</td><td className="max-w-[280px] truncate px-6 py-4 font-mono text-xs text-gray-400">{log.webhookUrl}</td><td className="px-6 py-4 text-gray-400">{log.responseStatus ?? '--'}</td><td className="px-6 py-4 text-xs text-gray-500">{formatTime(log.deliveredAt)}</td></tr>)}</tbody></table></div>
        </>
      )}
    </div>
  );
});

type AssetsPanelProps = {
  loading: boolean;
  unifiedAssets: UnifiedAsset[];
  codeAssetType: CodeLeakAssetType;
  codeAssetValue: string;
  fileAssetType: FileLeakAssetType;
  fileAssetValue: string;
  cveAssetType: CveIntelAssetType;
  cveAssetValue: string;
  isSavingAsset: 'code' | 'file' | 'cve' | null;
  onCodeAssetTypeChange: (value: CodeLeakAssetType) => void;
  onCodeAssetValueChange: (value: string) => void;
  onAddCodeAsset: () => void;
  onFileAssetTypeChange: (value: FileLeakAssetType) => void;
  onFileAssetValueChange: (value: string) => void;
  onAddFileAsset: () => void;
  onCveAssetTypeChange: (value: CveIntelAssetType) => void;
  onCveAssetValueChange: (value: string) => void;
  onAddCveAsset: () => void;
  onRemoveAsset: (asset: UnifiedAsset) => void;
};

const AssetsPanel = memo(function AssetsPanel({ loading, unifiedAssets, codeAssetType, codeAssetValue, fileAssetType, fileAssetValue, cveAssetType, cveAssetValue, isSavingAsset, onCodeAssetTypeChange, onCodeAssetValueChange, onAddCodeAsset, onFileAssetTypeChange, onFileAssetValueChange, onAddFileAsset, onCveAssetTypeChange, onCveAssetValueChange, onAddCveAsset, onRemoveAsset }: AssetsPanelProps) {
  return (
    <div className="glass-card overflow-hidden rounded-2xl border-white/5 bg-[#16161a] shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/5 bg-[#1a1a20]/50 p-6"><div className="flex items-center gap-3"><div className="rounded-lg bg-emerald-500/10 p-2"><Globe className="h-5 w-5 text-emerald-400" /></div><h3 className="text-sm font-bold uppercase tracking-wider text-white">Monitoring Targets ({unifiedAssets.length}/100)</h3></div></div>
      {loading ? (
        <>
          <div className="space-y-4 border-b border-white/5 bg-black/10 px-6 py-5">
            {[0, 1, 2].map((index) => (
              <div key={`asset-form-loading-${index}`} className="grid gap-4 lg:grid-cols-[auto_1fr_auto]">
                <SkeletonBlock className="h-12 w-full min-w-[9rem] rounded-2xl" />
                <SkeletonBlock className="h-12 w-full rounded-2xl" />
                <SkeletonBlock className="h-12 w-full min-w-[9rem] rounded-2xl" />
              </div>
            ))}
          </div>
          <div className="space-y-3 px-6 py-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`asset-row-loading-${index}`} className="grid gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-4 md:grid-cols-[1.2fr_0.9fr_1.6fr_1.2fr_1fr_auto]">
                <SkeletonBlock className="h-6 w-24 rounded-full" />
                <SkeletonBlock className="h-4 w-20 rounded-full" />
                <SkeletonBlock className="h-4 w-full rounded-full" />
                <SkeletonBlock className="h-4 w-full rounded-full" />
                <SkeletonBlock className="h-4 w-20 rounded-full" />
                <SkeletonBlock className="h-9 w-9 rounded-full" />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
      <div className="space-y-4 border-b border-white/5 bg-black/10 px-6 py-5"><div className="grid gap-4 lg:grid-cols-[auto_1fr_auto]"><select value={codeAssetType} onChange={(event) => onCodeAssetTypeChange(event.target.value as CodeLeakAssetType)} className="rounded-2xl border border-white/8 bg-[#101217] px-4 py-3 text-sm text-white outline-none">{codeAssetTypes.map((type) => <option key={type} value={type} className="bg-[#11141c]">{codeAssetTypeLabel[type]}</option>)}</select><input value={codeAssetValue} onChange={(event) => onCodeAssetValueChange(event.target.value)} placeholder="Add a code leak target" className="rounded-2xl border border-white/8 bg-[#101217] px-4 py-3 text-sm text-white outline-none placeholder:text-white/28" /><button type="button" onClick={onAddCodeAsset} disabled={isSavingAsset === 'code'} className="inline-flex items-center gap-2 rounded-2xl border border-accent/25 bg-accent/12 px-4 py-3 text-sm text-accent disabled:opacity-60">{isSavingAsset === 'code' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add code target</button></div><div className="grid gap-4 lg:grid-cols-[auto_1fr_auto]"><select value={fileAssetType} onChange={(event) => onFileAssetTypeChange(event.target.value as FileLeakAssetType)} className="rounded-2xl border border-white/8 bg-[#101217] px-4 py-3 text-sm text-white outline-none">{fileAssetTypes.map((type) => <option key={type} value={type} className="bg-[#11141c]">{fileAssetTypeLabel[type]}</option>)}</select><input value={fileAssetValue} onChange={(event) => onFileAssetValueChange(event.target.value)} placeholder="Add a file leak target" className="rounded-2xl border border-white/8 bg-[#101217] px-4 py-3 text-sm text-white outline-none placeholder:text-white/28" /><button type="button" onClick={onAddFileAsset} disabled={isSavingAsset === 'file'} className="inline-flex items-center gap-2 rounded-2xl border border-sky-400/25 bg-sky-400/12 px-4 py-3 text-sm text-sky-200 disabled:opacity-60">{isSavingAsset === 'file' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add file target</button></div><div className="grid gap-4 lg:grid-cols-[auto_1fr_auto]"><select value={cveAssetType} onChange={(event) => onCveAssetTypeChange(event.target.value as CveIntelAssetType)} className="rounded-2xl border border-white/8 bg-[#101217] px-4 py-3 text-sm text-white outline-none">{cveAssetTypes.map((type) => <option key={type} value={type} className="bg-[#11141c]">{cveAssetTypeLabel[type]}</option>)}</select><input value={cveAssetValue} onChange={(event) => onCveAssetValueChange(event.target.value)} placeholder="Add a vendor, product, component, or keyword" className="rounded-2xl border border-white/8 bg-[#101217] px-4 py-3 text-sm text-white outline-none placeholder:text-white/28" /><button type="button" onClick={onAddCveAsset} disabled={isSavingAsset === 'cve'} className="inline-flex items-center gap-2 rounded-2xl border border-fuchsia-400/25 bg-fuchsia-400/12 px-4 py-3 text-sm text-fuchsia-200 disabled:opacity-60">{isSavingAsset === 'cve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add CVE target</button></div></div>
      <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="bg-black/20 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500"><th className="px-6 py-4">Category</th><th className="px-6 py-4">Type</th><th className="px-6 py-4">Target</th><th className="px-6 py-4">Notification</th><th className="px-6 py-4">Status</th><th className="px-6 py-4 text-center">Actions</th></tr></thead><tbody className="divide-y divide-white/5">{unifiedAssets.length === 0 ? <tr className="text-sm"><td colSpan={6} className="px-6 py-6 text-gray-500">No monitoring targets configured yet.</td></tr> : unifiedAssets.map((asset) => <tr key={asset.id} className="text-sm transition-colors hover:bg-white/[0.02]"><td className="px-6 py-4"><span className="rounded-full border border-gray-500/30 bg-gray-500/20 px-3 py-1 text-xs font-bold text-gray-300">{taskLabelMap[asset.category]}</span></td><td className="px-6 py-4 text-gray-400">{asset.typeLabel}</td><td className="px-6 py-4 font-medium text-gray-300">{asset.value}</td><td className="px-6 py-4 text-gray-400">{asset.notificationLabel}</td><td className="px-6 py-4 text-xs text-gray-500">{asset.createdAt}</td><td className="px-6 py-4 text-center"><button type="button" onClick={() => onRemoveAsset(asset)} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/55 transition-colors hover:border-red-400/30 hover:text-red-300"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>
        </>
      )}
    </div>
  );
});

type RunsPanelProps = {
  loading: boolean;
  taskMap: Record<string, MonitorTask>;
  isSavingTask: MonitorTaskType | null;
  monitoringRows: MonitoringRow[];
  cvePreview: CveIntelPreviewItem[];
  onSaveTask: (scanType: MonitorTaskType, patch: Partial<MonitorTask>) => void;
};

const RunsPanel = memo(function RunsPanel({ loading, taskMap, isSavingTask, monitoringRows, cvePreview, onSaveTask }: RunsPanelProps) {
  return (
    <div className="glass-card overflow-hidden rounded-2xl border-white/5 bg-[#16161a] shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/5 bg-[#1a1a20]/50 p-6"><div className="flex items-center gap-3"><div className="rounded-lg bg-amber-500/10 p-2"><History className="h-5 w-5 text-amber-400" /></div><h3 className="text-sm font-bold uppercase tracking-wider text-white">Runs and Schedules</h3></div></div>
      {loading ? (
        <>
          <div className="grid gap-4 border-b border-white/5 bg-black/10 px-6 py-5 lg:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div key={`run-card-loading-${index}`} className="rounded-2xl border border-white/8 bg-[#101217] px-4 py-4">
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
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`run-row-loading-${index}`} className="grid gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-4 md:grid-cols-[1.1fr_1fr_0.9fr_0.9fr_0.7fr_1.2fr]">
                <SkeletonBlock className="h-4 w-full rounded-full" />
                <SkeletonBlock className="h-4 w-full rounded-full" />
                <SkeletonBlock className="h-4 w-20 rounded-full" />
                <SkeletonBlock className="h-4 w-24 rounded-full" />
                <SkeletonBlock className="h-6 w-16 rounded-full" />
                <SkeletonBlock className="h-4 w-full rounded-full" />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
      <div className="grid gap-4 border-b border-white/5 bg-black/10 px-6 py-5 lg:grid-cols-3">{monitorTaskTypes.map((scanType) => { const task = taskMap[scanType]; return <div key={scanType} className="rounded-2xl border border-white/8 bg-[#101217] px-4 py-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-white">{taskLabelMap[scanType]}</p><button type="button" onClick={() => onSaveTask(scanType, { enabled: !(task?.enabled ?? false) })} disabled={!task || isSavingTask === scanType} className={cn('rounded-full border px-3 py-1 text-[11px] font-bold', getTaskTone(Boolean(task?.enabled)))}>{task?.enabled ? 'Running' : 'Paused'}</button></div><div className="mt-3 flex items-center gap-2"><select value={task?.intervalMinutes ?? 60} onChange={(event) => onSaveTask(scanType, { intervalMinutes: Number(event.target.value) })} className="min-w-0 flex-1 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none">{intervalOptions.map((option) => <option key={option} value={option} className="bg-[#11141c]">{'Every ' + option + ' min'}</option>)}</select></div><p className="mt-3 text-xs text-white/42">Last run: {formatTime(task?.lastRunAt)}</p><p className="mt-1 text-xs text-white/42">Next run: {formatRelative(task?.nextRunAt)}</p></div>; })}</div>
      <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="bg-black/20 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500"><th className="px-6 py-4">Name</th><th className="px-6 py-4">Scope</th><th className="px-6 py-4">Frequency / Response</th><th className="px-6 py-4">Time</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Notes</th></tr></thead><tbody className="divide-y divide-white/5">{monitoringRows.map((row) => <tr key={row.id} className="text-sm transition-colors hover:bg-white/[0.02]"><td className="px-6 py-4 text-gray-300">{row.name}</td><td className="px-6 py-4 text-gray-400">{row.scope}</td><td className="px-6 py-4 font-mono text-xs text-gray-400">{row.interval || '--'}</td><td className="px-6 py-4 text-xs text-gray-500">{row.nextRun}</td><td className="px-6 py-4"><span className={cn('rounded-full border px-4 py-0.5 text-[10px] font-black', getTaskTone(row.enabled))}>{row.enabled ? 'Healthy' : 'Attention'}</span></td><td className="px-6 py-4 text-xs text-gray-500">{row.lastRun}</td></tr>)}{cvePreview.slice(0, 3).map((item) => <tr key={item.cveId} className="text-sm transition-colors hover:bg-white/[0.02]"><td className="px-6 py-4 text-gray-300">CVE Preview</td><td className="px-6 py-4 text-gray-400">{item.cveId}</td><td className="px-6 py-4 font-mono text-xs text-gray-400">{typeof item.cvssScore === 'number' ? 'CVSS ' + item.cvssScore.toFixed(1) : '--'}</td><td className="px-6 py-4 text-xs text-gray-500">{item.pushLevel}</td><td className="px-6 py-4"><span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-0.5 text-[10px] font-black text-rose-200">{item.pushRecommended ? 'Recommended' : 'Observe'}</span></td><td className="max-w-[360px] px-6 py-4 text-xs text-gray-400"><div className="flex items-center gap-2"><span className="truncate">{item.title}</span>{item.references[0] ? <a href={item.references[0]} target="_blank" rel="noreferrer" className="text-accent hover:text-accent/80"><ExternalLink className="h-3.5 w-3.5" /></a> : null}</div></td></tr>)}</tbody></table></div>
        </>
      )}
    </div>
  );
});

const DomainMonitor = () => {
  const [codeAssets, setCodeAssets] = useState<CodeLeakAsset[]>([]);
  const [cveAssets, setCveAssets] = useState<CveIntelAsset[]>([]);
  const [fileAssets, setFileAssets] = useState<FileLeakAsset[]>([]);
  const [tasks, setTasks] = useState<MonitorTask[]>([]);
  const [runs, setRuns] = useState<MonitorRun[]>([]);
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingPanels, setLoadingPanels] = useState({
    webhooks: true,
    assets: true,
    runs: true,
  });
  const [isSavingAsset, setIsSavingAsset] = useState<'code' | 'file' | 'cve' | null>(null);
  const [isSavingTask, setIsSavingTask] = useState<MonitorTaskType | null>(null);
  const [isSavingChannel, setIsSavingChannel] = useState<WebhookChannel | null>(null);
  const [isTestingChannel, setIsTestingChannel] = useState<WebhookChannel | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadWebhooksPanel = useCallback(async (background = false) => {
    if (!background) {
      setLoadingPanels((current) => ({ ...current, webhooks: true }));
    }

    try {
      const [leakSnapshot, cveSnapshot] = await Promise.all([
        monitorService.getWebhookSnapshot('leak_monitor'),
        monitorService.getWebhookSnapshot('cve_intel'),
      ]);

      setWebhookConfigs({
        leak_monitor: leakSnapshot.config || emptyWebhookConfig('leak_monitor'),
        cve_intel: cveSnapshot.config || emptyWebhookConfig('cve_intel'),
      });
      setWebhookLogs(
        [...(leakSnapshot.logs || []), ...(cveSnapshot.logs || [])]
          .slice()
          .sort((a, b) => new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime())
          .slice(0, 10)
      );
    } catch (loadError) {
      setError((current) => current || (loadError instanceof Error ? loadError.message : 'Webhook ?????????????'));
    } finally {
      setLoadingPanels((current) => ({ ...current, webhooks: false }));
    }
  }, []);

  const loadAssetsPanel = useCallback(async (background = false) => {
    if (!background) {
      setLoadingPanels((current) => ({ ...current, assets: true }));
    }

    try {
      const [nextCodeAssets, nextCveAssets, nextFileAssets] = await Promise.all([
        codeLeakService.getAssets(),
        cveIntelAssetService.getAssets(),
        fileLeakService.getAssets(),
      ]);

      setCodeAssets(nextCodeAssets);
      setCveAssets(nextCveAssets);
      setFileAssets(nextFileAssets);
    } catch (loadError) {
      setError((current) => current || (loadError instanceof Error ? loadError.message : '???????????????'));
    } finally {
      setLoadingPanels((current) => ({ ...current, assets: false }));
    }
  }, []);

  const loadRunsPanel = useCallback(async (background = false) => {
    if (!background) {
      setLoadingPanels((current) => ({ ...current, runs: true }));
    }

    try {
      const [nextTasks, nextRuns, nextCvePreview] = await Promise.all([
        monitorService.getTasks(),
        monitorService.getRuns(12),
        monitorService.getCvePreview().catch(() => []),
      ]);

      setTasks(nextTasks);
      setRuns(nextRuns);
      setCvePreview(nextCvePreview);
    } catch (loadError) {
      setError((current) => current || (loadError instanceof Error ? loadError.message : '???????????????'));
    } finally {
      setLoadingPanels((current) => ({ ...current, runs: false }));
    }
  }, []);

  const loadMonitorData = useCallback(async (background = false) => {
    if (background) {
      setIsRefreshing(true);
    } else {
      setLoadingPanels({
        webhooks: true,
        assets: true,
        runs: true,
      });
    }

    setError('');

    await Promise.all([
      loadWebhooksPanel(background),
      loadAssetsPanel(background),
      loadRunsPanel(background),
    ]);

    if (background) {
      setIsRefreshing(false);
    }
  }, [loadAssetsPanel, loadRunsPanel, loadWebhooksPanel]);

  useEffect(() => {
    void loadMonitorData();
  }, [loadMonitorData]);

  const taskMap = useMemo(
    () =>
      tasks.reduce<Record<string, MonitorTask>>((accumulator, task) => {
        accumulator[task.scanType] = task;
        return accumulator;
      }, {}),
    [tasks]
  );

  const leakMonitorEnabled = webhookConfigs.leak_monitor.enabled;
  const cveIntelEnabled = webhookConfigs.cve_intel.enabled;

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
  }, [codeAssets, cveAssets, cveIntelEnabled, fileAssets, leakMonitorEnabled]);

  const monitoringRows = useMemo(() => {
    const taskRows = monitorTaskTypes.map((scanType) => {
      const task = taskMap[scanType];
      return {
        id: task?.id || scanType,
        name: taskLabelMap[scanType],
        scope:
          scanType === 'cve_intel'
            ? `${cveAssets.length} 个匹配对象`
            : `${scanType === 'code_leak' ? codeAssets.length : fileAssets.length} 个监控对象`,
        interval: `Every ${task?.intervalMinutes ?? 60} min`,
        nextRun: formatRelative(task?.nextRunAt),
        lastRun: formatTime(task?.lastRunAt),
        enabled: task?.enabled ?? false,
      };
    });

    const runRows = runs.slice(0, 6).map((run) => ({
      id: run.id,
      name: `Run / ${taskLabelMap[run.scanType]}`,
      scope: run.taskId,
      interval: run.status === 'success' ? `${run.findingsCount} findings` : 'Execution failed',
      nextRun: formatTime(run.finishedAt || run.startedAt),
      lastRun: run.status === 'success' ? 'Scheduled run completed' : run.errorMessage || 'Scheduled run failed',
      enabled: run.status === 'success',
    }));

    const deliveryRows = webhookLogs.slice(0, 4).map((log) => ({
      id: log.id,
      name: `推送记录 / ${channelLabelMap[(log.channel as WebhookChannel) || 'leak_monitor']}`,
      scope: log.eventName,
      interval: `HTTP ${log.responseStatus ?? '--'}`,
      nextRun: formatTime(log.deliveredAt),
      lastRun: log.status === 'success' ? '推送成功' : log.errorMessage || '推送失败',
      enabled: log.status === 'success',
    }));

    return [...taskRows, ...runRows, ...deliveryRows];
  }, [taskMap, codeAssets.length, cveAssets.length, fileAssets.length, runs, webhookLogs]);

  const saveWebhookChannel = useCallback(async (channel: WebhookChannel) => {
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
      await loadWebhooksPanel(true);
      setSuccess(`${channelLabelMap[channel]}配置已保存。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存推送配置失败。');
    } finally {
      setIsSavingChannel(null);
    }
  }, [loadWebhooksPanel, webhookConfigs]);

  const testWebhookChannel = useCallback(async (channel: WebhookChannel) => {
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
      await loadWebhooksPanel(true);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : '测试推送失败。');
    } finally {
      setIsTestingChannel(null);
    }
  }, [loadWebhooksPanel]);

  const handleSaveTask = useCallback(async (scanType: MonitorTaskType, patch: Partial<MonitorTask>) => {
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
  }, [taskMap]);

  const handleAddCodeAsset = useCallback(async () => {
    const value = codeAssetValue.trim();
    if (!value) {
      setError('请输入要监控的代码泄露对象。');
      return;
    }

    setIsSavingAsset('code');
    setError('');
    setSuccess('');

    try {
      setCodeAssets(await codeLeakService.addAsset({ value, type: codeAssetType }));
      setCodeAssetValue('');
      void loadRunsPanel(true);
      setSuccess('代码泄露监控对象已添加。');
    } catch (assetError) {
      setError(assetError instanceof Error ? assetError.message : '添加代码泄露监控对象失败。');
    } finally {
      setIsSavingAsset(null);
    }
  }, [codeAssetType, codeAssetValue, loadRunsPanel]);

  const handleAddCveAsset = useCallback(async () => {
    const value = cveAssetValue.trim();
    if (!value) {
      setError('请输入要匹配的厂商、产品、组件或技术栈。');
      return;
    }

    setIsSavingAsset('cve');
    setError('');
    setSuccess('');

    try {
      setCveAssets(await cveIntelAssetService.addAsset({ value, type: cveAssetType }));
      setCveAssetValue('');
      void loadRunsPanel(true);
      setSuccess('CVE 匹配对象已添加。');
    } catch (assetError) {
      setError(assetError instanceof Error ? assetError.message : '添加 CVE 匹配对象失败。');
    } finally {
      setIsSavingAsset(null);
    }
  }, [cveAssetType, cveAssetValue, loadRunsPanel]);

  const handleAddFileAsset = useCallback(async () => {
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
      void loadRunsPanel(true);
      setSuccess('文件泄露监控对象已添加。');
    } catch (assetError) {
      setError(assetError instanceof Error ? assetError.message : '添加文件泄露监控对象失败。');
    } finally {
      setIsSavingAsset(null);
    }
  }, [fileAssetType, fileAssetValue, loadRunsPanel]);

  const handleRemoveAsset = useCallback(async (asset: UnifiedAsset) => {
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
      void loadRunsPanel(true);
      setSuccess('监控对象已移除。');
    } catch (assetError) {
      setError(assetError instanceof Error ? assetError.message : '移除监控对象失败。');
    } finally {
      setIsSavingAsset(null);
    }
  }, []);

  const handleWebhookConfigChange = useCallback((channel: WebhookChannel, field: 'url' | 'secret', value: string) => {
    setWebhookConfigs((current) => ({
      ...current,
      [channel]: { ...current[channel], [field]: value },
    }));
  }, []);

  const handleWebhookToggle = useCallback((channel: WebhookChannel) => {
    setWebhookConfigs((current) => ({
      ...current,
      [channel]: { ...current[channel], enabled: !current[channel].enabled },
    }));
  }, []);

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

      <>
          <WebhookPanel
            loading={loadingPanels.webhooks}
            webhookConfigs={webhookConfigs}
            webhookLogs={webhookLogs}
            isSavingChannel={isSavingChannel}
            isTestingChannel={isTestingChannel}
            onConfigChange={handleWebhookConfigChange}
            onToggleChannel={handleWebhookToggle}
            onSaveChannel={saveWebhookChannel}
            onTestChannel={testWebhookChannel}
          />
          <AssetsPanel
            loading={loadingPanels.assets}
            unifiedAssets={unifiedAssets}
            codeAssetType={codeAssetType}
            codeAssetValue={codeAssetValue}
            fileAssetType={fileAssetType}
            fileAssetValue={fileAssetValue}
            cveAssetType={cveAssetType}
            cveAssetValue={cveAssetValue}
            isSavingAsset={isSavingAsset}
            onCodeAssetTypeChange={setCodeAssetType}
            onCodeAssetValueChange={setCodeAssetValue}
            onAddCodeAsset={handleAddCodeAsset}
            onFileAssetTypeChange={setFileAssetType}
            onFileAssetValueChange={setFileAssetValue}
            onAddFileAsset={handleAddFileAsset}
            onCveAssetTypeChange={setCveAssetType}
            onCveAssetValueChange={setCveAssetValue}
            onAddCveAsset={handleAddCveAsset}
            onRemoveAsset={handleRemoveAsset}
          />
          <RunsPanel
            loading={loadingPanels.runs}
            taskMap={taskMap}
            isSavingTask={isSavingTask}
            monitoringRows={monitoringRows}
            cvePreview={cvePreview}
            onSaveTask={handleSaveTask}
          />
      </>
    </div>
  );
};

export default DomainMonitor;
