import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { BellRing, Loader2, Save, Send, Trash2, X } from 'lucide-react';
import { webhookService, type WebhookConfig, type WebhookDeliveryLog } from '../../services/webhookService';

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
};

const WebhookSettingsButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [config, setConfig] = useState<WebhookConfig | null>(null);
  const [logs, setLogs] = useState<WebhookDeliveryLog[]>([]);
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  const loadConfig = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await webhookService.getConfig();
      setConfig(response.config);
      setLogs(response.logs);
      setUrl(response.config?.url || '');
      setSecret(response.config?.secret || '');
      setEnabled(response.config?.enabled ?? true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载推送设置失败。');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    void loadConfig();
  }, [isOpen]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [isOpen]);

  const handleSave = async () => {
    if (!url.trim()) {
      setError('请输入 webhook 地址。');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess('');
    try {
      const nextConfig = await webhookService.saveConfig({
        url,
        secret,
        enabled,
      });
      setConfig(nextConfig);
      setSuccess('推送设置已保存。');
      await loadConfig();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存推送设置失败。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    setError('');
    setSuccess('');
    try {
      await webhookService.deleteConfig();
      setConfig(null);
      setLogs([]);
      setUrl('');
      setSecret('');
      setEnabled(true);
      setSuccess('已移除 webhook 推送配置。');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '移除推送设置失败。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setError('');
    setSuccess('');
    try {
      const result = await webhookService.testConfig();
      if (result.delivered) {
        setSuccess(`测试消息已发送${result.responseStatus ? `，接收端返回 ${result.responseStatus}` : '。'}`);
      } else {
        setError(result.error || '测试发送失败。');
      }
      await loadConfig();
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : '测试发送失败。');
    } finally {
      setIsTesting(false);
    }
  };

  const modal =
    typeof document !== 'undefined' && isOpen
      ? createPortal(
          <AnimatePresence>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[160] bg-[#04070d]/76 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
              aria-label="关闭推送设置"
            />
            <motion.aside
              ref={panelRef}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="fixed right-0 top-0 z-[170] h-screen w-full max-w-[520px] border-l border-accent/15 bg-[#0a0f16]/96 backdrop-blur-2xl"
            >
              <div className="flex h-full flex-col">
                <div className="flex items-start justify-between border-b border-white/8 px-6 py-5">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-accent/90">
                      <BellRing className="h-3.5 w-3.5" />
                      推送设置
                    </div>
                    <h2 className="mt-3 text-xl font-semibold text-white">Webhook 通知</h2>
                    <p className="mt-2 text-sm leading-7 text-white/55">
                      客户把机器人的 webhook 地址填在这里后，定时扫描发现新的泄露结果时会自动推送。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/62 transition-colors hover:border-white/20 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
                  {isLoading ? (
                    <div className="flex items-center gap-3 rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-white/60">
                      <Loader2 className="h-4 w-4 animate-spin text-accent" />
                      正在加载推送设置...
                    </div>
                  ) : null}

                  <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
                    <label className="block">
                      <span className="mb-2 block text-sm text-white/62">Webhook 地址</span>
                      <input
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        placeholder="https://example.com/webhook"
                        className="w-full rounded-[18px] border border-white/10 bg-[#0c1118] px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
                      />
                    </label>

                    <label className="mt-4 block">
                      <span className="mb-2 block text-sm text-white/62">签名密钥</span>
                      <input
                        value={secret}
                        onChange={(event) => setSecret(event.target.value)}
                        placeholder="可选，用于生成 X-LeakRadar-Signature"
                        className="w-full rounded-[18px] border border-white/10 bg-[#0c1118] px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
                      />
                    </label>

                    <label className="mt-4 flex items-center justify-between rounded-[18px] border border-white/10 bg-[#0c1118] px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-white">启用推送</p>
                        <p className="mt-1 text-xs text-white/45">仅新发现会触发，重复命中不会反复推送。</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEnabled((current) => !current)}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full border transition-colors ${
                          enabled ? 'border-accent/40 bg-accent/20' : 'border-white/10 bg-white/[0.06]'
                        }`}
                        aria-pressed={enabled}
                      >
                        <span
                          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            enabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </label>
                  </div>

                  <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5 text-sm leading-7 text-white/60">
                    <p className="font-medium text-white">推送说明</p>
                    <p className="mt-2">当前会以 `POST` 方式推送 JSON，并附带 `X-LeakRadar-Event`、`X-LeakRadar-Delivery` 和可选的签名头。</p>
                    <p className="mt-2">如果客户使用企业微信、钉钉或其他机器人，通常把该机器人的 webhook 地址填在这里就可以。</p>
                  </div>

                  <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
                    <p className="text-sm font-medium text-white">最近推送记录</p>
                    <div className="mt-4 space-y-3">
                      {logs.length === 0 ? (
                        <div className="rounded-[18px] border border-dashed border-white/10 bg-[#0c1118] px-4 py-4 text-sm text-white/45">
                          还没有推送记录。保存配置后可以先使用“测试发送”验证连接。
                        </div>
                      ) : (
                        logs.map((log) => (
                          <div key={log.id} className="rounded-[18px] border border-white/8 bg-[#0c1118] px-4 py-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] ${
                                  log.status === 'success'
                                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
                                    : 'border-red-500/20 bg-red-500/10 text-red-200'
                                }`}
                              >
                                {log.status === 'success' ? '成功' : '失败'}
                              </span>
                              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/55">
                                {log.eventName}
                              </span>
                              {log.responseStatus ? (
                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/55">
                                  {log.responseStatus}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-3 text-sm text-white/72">{formatTimestamp(log.deliveredAt)}</p>
                            <p className="mt-1 break-all text-xs text-white/45">{log.webhookUrl}</p>
                            {log.errorMessage ? <p className="mt-2 text-xs text-red-300">{log.errorMessage}</p> : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {config ? (
                    <div className="rounded-[24px] border border-emerald-500/15 bg-emerald-500/8 p-5 text-sm text-emerald-100">
                      当前已配置推送地址，定时扫描产生新发现后会自动触发通知。
                    </div>
                  ) : null}

                  {error ? <div className="rounded-[20px] border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-200">{error}</div> : null}
                  {success ? <div className="rounded-[20px] border border-emerald-500/20 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-100">{success}</div> : null}
                </div>

                <div className="border-t border-white/8 px-6 py-5">
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving}
                      className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/12 px-4 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent/18 disabled:opacity-60"
                    >
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      保存设置
                    </button>
                    <button
                      type="button"
                      onClick={handleTest}
                      disabled={isTesting || !config}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white/70 transition-colors hover:border-accent/25 hover:text-white disabled:opacity-60"
                    >
                      {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      测试发送
                    </button>
                    {config ? (
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white/70 transition-colors hover:border-red-400/30 hover:text-red-300 disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                        移除配置
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </motion.aside>
          </AnimatePresence>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/72 transition-colors hover:border-accent/25 hover:bg-accent/10 hover:text-white"
      >
        <BellRing className="h-4 w-4 text-accent" />
        推送设置
      </button>
      {modal}
    </>
  );
};

export default WebhookSettingsButton;
