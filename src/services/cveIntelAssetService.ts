export type CveIntelAssetType = 'vendor' | 'product' | 'component' | 'technology' | 'keyword';

export interface CveIntelAsset {
  id: string;
  label: string;
  type: CveIntelAssetType;
  value: string;
  enabled: boolean;
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
  };
  Object.assign(headers, getAuthHeaders());

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

export const cveIntelAssetService = {
  async getAssets(): Promise<CveIntelAsset[]> {
    const payload = await requestJson<{ assets?: CveIntelAsset[] }>('/api/cve-intel/assets');
    return Array.isArray(payload.assets) ? payload.assets : [];
  },

  async addAsset(input: { label?: string; value: string; type: CveIntelAssetType }): Promise<CveIntelAsset[]> {
    const value = input.value.trim();
    if (!value) {
      throw new Error('CVE 监控对象不能为空。');
    }

    const payload = await requestJson<{ assets?: CveIntelAsset[] }>('/api/cve-intel/assets', {
      method: 'POST',
      body: JSON.stringify({
        value,
        label: input.label?.trim() || value,
        type: input.type,
      }),
    });

    return Array.isArray(payload.assets) ? payload.assets : [];
  },

  async removeAsset(id: string): Promise<CveIntelAsset[]> {
    const payload = await requestJson<{ assets?: CveIntelAsset[] }>(`/api/cve-intel/assets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });

    return Array.isArray(payload.assets) ? payload.assets : [];
  },
};
