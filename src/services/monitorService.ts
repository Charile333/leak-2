import type { WebhookChannel, WebhookConfig, WebhookDeliveryLog } from './webhookService';

export type MonitorTaskType = 'code_leak' | 'file_leak' | 'cve_intel';

export interface MonitorTask {
  id: string;
  userEmail: string;
  scanType: MonitorTaskType;
  label: string;
  query: string;
  intervalMinutes: number;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CveIntelPreviewItem {
  cveId: string;
  title: string;
  summary: string;
  cvssScore: number | null;
  pushLevel: string;
  pushRecommended: boolean;
  references: string[];
  sourceTags: string[];
  lastModified?: string;
}

const getCurrentUserEmail = () => {
  if (typeof window === 'undefined') return '';

  try {
    const raw = window.localStorage.getItem('leakradar_user');
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { email?: string };
    return typeof parsed.email === 'string' ? parsed.email.trim() : '';
  } catch {
    return '';
  }
};

const getAuthHeaders = (): Record<string, string> => {
  const email = getCurrentUserEmail();
  return email ? { 'X-User-Email': email } : {};
};

const requestJson = async <T>(url: string, options: RequestInit = {}) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
  };

  if (options.headers) {
    Object.entries(options.headers as Record<string, string>).forEach(([key, value]) => {
      headers[key] = value;
    });
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.message === 'string' ? payload.message : `Request failed with status ${response.status}`);
  }

  return payload as T;
};

export const monitorService = {
  async getTasks(): Promise<MonitorTask[]> {
    const payload = await requestJson<{ tasks?: MonitorTask[] }>('/api/scheduled-scans/tasks');
    return Array.isArray(payload.tasks) ? payload.tasks : [];
  },

  async saveTask(input: Partial<MonitorTask> & Pick<MonitorTask, 'scanType' | 'label' | 'intervalMinutes' | 'enabled'>): Promise<MonitorTask> {
    const payload = await requestJson<{ task?: MonitorTask }>('/api/scheduled-scans/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    if (!payload.task) {
      throw new Error('Task save failed.');
    }

    return payload.task;
  },

  async getWebhookSnapshot(channel: WebhookChannel = 'leak_monitor'): Promise<{ config: WebhookConfig | null; configs?: Partial<Record<WebhookChannel, WebhookConfig | null>>; logs: WebhookDeliveryLog[] }> {
    const payload = await requestJson<{ config?: WebhookConfig | null; configs?: Partial<Record<WebhookChannel, WebhookConfig | null>>; logs?: WebhookDeliveryLog[] }>(`/api/notifications/webhook?channel=${encodeURIComponent(channel)}`);
    return {
      config: payload.config ?? null,
      configs: payload.configs,
      logs: Array.isArray(payload.logs) ? payload.logs : [],
    };
  },

  async getCvePreview(): Promise<CveIntelPreviewItem[]> {
    const payload = await requestJson<{ items?: CveIntelPreviewItem[] }>('/api/otx/cve-feed?limit=6&window=7d');
    return Array.isArray(payload.items) ? payload.items : [];
  },
};
