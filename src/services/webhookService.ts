export interface WebhookConfig {
  id: string;
  userEmail: string;
  url: string;
  secret: string;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface WebhookDeliveryLog {
  id: string;
  userEmail: string;
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
  async getConfig(): Promise<{ config: WebhookConfig | null; logs: WebhookDeliveryLog[] }> {
    const payload = await requestJson<{ config?: WebhookConfig | null; logs?: WebhookDeliveryLog[] }>('/api/notifications/webhook');
    return {
      config: payload.config ?? null,
      logs: Array.isArray(payload.logs) ? payload.logs : [],
    };
  },

  async saveConfig(input: { url: string; secret?: string; enabled: boolean }): Promise<WebhookConfig> {
    const payload = await requestJson<{ config?: WebhookConfig }>('/api/notifications/webhook', {
      method: 'POST',
      body: JSON.stringify({
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

  async testConfig(): Promise<{ delivered: boolean; responseStatus?: number | null; error?: string | null }> {
    const payload = await requestJson<{
      delivered?: boolean;
      responseStatus?: number | null;
      error?: string | null;
    }>('/api/notifications/webhook', {
      method: 'POST',
      body: JSON.stringify({
        action: 'test',
      }),
    });

    return {
      delivered: Boolean(payload.delivered),
      responseStatus: payload.responseStatus ?? null,
      error: payload.error ?? null,
    };
  },

  async deleteConfig(): Promise<void> {
    await requestJson('/api/notifications/webhook', {
      method: 'DELETE',
    });
  },
};
