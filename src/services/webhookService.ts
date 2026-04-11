import { buildApiUrl } from './apiBase';

export type WebhookChannel = 'leak_monitor' | 'cve_intel';

export interface WebhookConfig {
  id: string;
  userEmail: string;
  channel?: WebhookChannel;
  url: string;
  secret: string;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface WebhookDeliveryLog {
  id: string;
  userEmail: string;
  channel?: WebhookChannel;
  webhookUrl: string;
  eventName: string;
  status: 'success' | 'failed';
  responseStatus?: number | null;
  errorMessage?: string | null;
  payload?: unknown;
  deliveredAt: string;
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

export const webhookService = {
  async getConfig(channel: WebhookChannel = 'leak_monitor'): Promise<{ config: WebhookConfig | null; configs?: Partial<Record<WebhookChannel, WebhookConfig | null>>; logs: WebhookDeliveryLog[] }> {
    const payload = await requestJson<{ config?: WebhookConfig | null; configs?: Partial<Record<WebhookChannel, WebhookConfig | null>>; logs?: WebhookDeliveryLog[] }>(buildApiUrl(`/api/notifications/webhook?channel=${encodeURIComponent(channel)}`));
    return {
      config: payload.config ?? null,
      configs: payload.configs,
      logs: Array.isArray(payload.logs) ? payload.logs : [],
    };
  },

  async saveConfig(input: { channel?: WebhookChannel; url: string; secret?: string; enabled: boolean }): Promise<WebhookConfig> {
    const payload = await requestJson<{ config?: WebhookConfig }>(buildApiUrl('/api/notifications/webhook'), {
      method: 'POST',
      body: JSON.stringify({
        channel: input.channel || 'leak_monitor',
        url: input.url.trim(),
        secret: input.secret?.trim() || '',
        enabled: input.enabled,
      }),
    });

    if (!payload.config) {
      throw new Error('Webhook configuration failed to save.');
    }

    return payload.config;
  },

  async testConfig(channel: WebhookChannel = 'leak_monitor'): Promise<{ delivered: boolean; responseStatus?: number | null; error?: string | null }> {
    const payload = await requestJson<{
      delivered?: boolean;
      responseStatus?: number | null;
      error?: string | null;
    }>(buildApiUrl('/api/notifications/webhook'), {
      method: 'POST',
      body: JSON.stringify({
        channel,
        action: 'test',
      }),
    });

    return {
      delivered: Boolean(payload.delivered),
      responseStatus: payload.responseStatus ?? null,
      error: payload.error ?? null,
    };
  },

  async deleteConfig(channel: WebhookChannel = 'leak_monitor'): Promise<void> {
    await requestJson(buildApiUrl(`/api/notifications/webhook?channel=${encodeURIComponent(channel)}`), {
      method: 'DELETE',
    });
  },
};
