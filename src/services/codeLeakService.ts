import { buildApiUrl } from './apiBase';

export type CodeLeakSeverity = 'critical' | 'high' | 'medium' | 'low';
export type CodeLeakStatus = 'new' | 'reviewing' | 'confirmed' | 'dismissed';
export type CodeLeakSource = 'GitHub' | 'GitLab' | 'Gitee' | 'Paste';
export type CodeLeakExposure = 'secret' | 'config' | 'repository' | 'credential' | 'source';
export type CodeLeakAssetType = 'company' | 'domain' | 'email_suffix' | 'repository';

export interface CodeLeakAsset {
  id: string;
  label: string;
  type: CodeLeakAssetType;
  value: string;
  enabled: boolean;
}

export interface CodeLeakFinding {
  id: string;
  assetId: string;
  assetLabel: string;
  severity: CodeLeakSeverity;
  status: CodeLeakStatus;
  source: CodeLeakSource;
  exposure: CodeLeakExposure;
  title: string;
  repository: string;
  owner: string;
  path: string;
  branch: string;
  match: string;
  snippet: string;
  firstSeen: string;
  lastSeen: string;
  hitCount?: number;
  url: string;
  confidence: number;
  matchedRules: string[];
  notes: string[];
}

export interface CodeLeakSearchFilters {
  query?: string;
  assetId?: string;
  severity?: CodeLeakSeverity | 'all';
  status?: CodeLeakStatus | 'all';
  source?: CodeLeakSource | 'all';
}

export class CodeLeakSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodeLeakSearchError';
  }
}

const includesText = (haystack: string, needle: string) =>
  haystack.toLowerCase().includes(needle.toLowerCase());

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

const buildAssetMap = (assets: CodeLeakAsset[]) =>
  new Map(assets.map((asset) => [asset.value.toLowerCase(), asset]));

const normalizeRemoteFinding = (
  finding: Partial<CodeLeakFinding> & { assetLabel?: string; match?: string },
  assetMap: Map<string, CodeLeakAsset>,
  assets: CodeLeakAsset[]
): CodeLeakFinding => {
  const fallbackAsset =
    assets[0] ||
    ({
      id: 'asset-unmatched',
      label: finding.assetLabel || finding.match || 'Unmatched asset',
      value: finding.match || finding.assetLabel || 'unmatched',
      type: 'company',
      enabled: true,
    } as CodeLeakAsset);

  const linkedAsset =
    assetMap.get((finding.assetLabel || '').toLowerCase()) ||
    assetMap.get((finding.match || '').toLowerCase()) ||
    fallbackAsset;

  const now = new Date().toISOString();
  const fallbackId = `${finding.source || 'source'}-${finding.url || finding.title || 'finding'}`.replace(/\s+/g, '-');

  return {
    id: finding.id || fallbackId,
    assetId: linkedAsset.id,
    assetLabel: finding.assetLabel || linkedAsset.label,
    severity: finding.severity || 'medium',
    status: finding.status || 'new',
    source: finding.source || 'GitHub',
    exposure: finding.exposure || 'source',
    title: finding.title || 'Potential code leak indicator detected',
    repository: finding.repository || 'unknown-repository',
    owner: finding.owner || 'unknown-owner',
    path: finding.path || 'unknown-path',
    branch: finding.branch || 'main',
    match: finding.match || linkedAsset.value,
    snippet: finding.snippet || 'No preview snippet returned.',
    firstSeen: finding.firstSeen || now,
    lastSeen: finding.lastSeen || finding.firstSeen || now,
    url: finding.url || '#',
    confidence: typeof finding.confidence === 'number' ? finding.confidence : 0.5,
    matchedRules: Array.isArray(finding.matchedRules) ? finding.matchedRules.filter((item): item is string => typeof item === 'string') : [],
    notes: Array.isArray(finding.notes) ? finding.notes : ['Open the source and verify whether the exposed content is real and still active.'],
  };
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
    throw new Error(
      typeof payload?.message === 'string' ? payload.message : `Request failed with status ${response.status}`
    );
  }

  return payload as T;
};

const fetchAssets = async () => {
  const payload = await requestJson<{ assets?: CodeLeakAsset[] }>(buildApiUrl('/api/code-leak/assets'));
  return Array.isArray(payload.assets) ? payload.assets : [];
};

const fetchRemoteFindings = async (assets: CodeLeakAsset[], query?: string) => {
  const payload = await requestJson<{ findings?: Array<Partial<CodeLeakFinding>> }>(buildApiUrl('/api/code-leak/search'), {
    method: 'POST',
    body: JSON.stringify({ assets, query }),
  });

  const findings = Array.isArray(payload.findings) ? payload.findings : [];
  const assetMap = buildAssetMap(assets);
  return findings.map((finding) => normalizeRemoteFinding(finding, assetMap, assets));
};

const fetchPersistedFindings = async (assets: CodeLeakAsset[]) => {
  const payload = await requestJson<{ findings?: Array<Partial<CodeLeakFinding>> }>(buildApiUrl('/api/code-leak/findings'));
  const findings = Array.isArray(payload.findings) ? payload.findings : [];
  const assetMap = buildAssetMap(assets);
  return findings.map((finding) => normalizeRemoteFinding(finding, assetMap, assets));
};

export const codeLeakService = {
  async getAssets(): Promise<CodeLeakAsset[]> {
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    return fetchAssets();
  },

  async getFindings(query?: string, assetsOverride?: CodeLeakAsset[]): Promise<CodeLeakFinding[]> {
    const assets = assetsOverride ?? (await fetchAssets());

    try {
      if (!query?.trim()) {
        const persistedFindings = await fetchPersistedFindings(assets);
        if (persistedFindings.length > 0) {
          return persistedFindings;
        }

        return await fetchRemoteFindings(assets, query);
      }

      return await fetchRemoteFindings(assets, query);
    } catch (error) {
      console.error('[codeLeakService] Remote code leak search failed:', error);
      throw new CodeLeakSearchError('Remote code leak search failed. Please check the API configuration and try again.');
    }
  },

  async addAsset(input: { label?: string; value: string; type: CodeLeakAssetType }): Promise<CodeLeakAsset[]> {
    await new Promise((resolve) => window.setTimeout(resolve, 60));

    const value = input.value.trim();
    if (!value) {
      throw new Error('Monitored asset value cannot be empty.');
    }

    const payload = await requestJson<{ assets?: CodeLeakAsset[] }>(buildApiUrl('/api/code-leak/assets'), {
      method: 'POST',
      body: JSON.stringify({
        value,
        label: input.label?.trim() || value,
        type: input.type,
      }),
    });

    return Array.isArray(payload.assets) ? payload.assets : [];
  },

  async removeAsset(id: string): Promise<CodeLeakAsset[]> {
    await new Promise((resolve) => window.setTimeout(resolve, 60));

    const payload = await requestJson<{ assets?: CodeLeakAsset[] }>(buildApiUrl(`/api/code-leak/assets/${encodeURIComponent(id)}`), {
      method: 'DELETE',
    });

    return Array.isArray(payload.assets) ? payload.assets : [];
  },

  async searchFindings(filters: CodeLeakSearchFilters = {}, assetsOverride?: CodeLeakAsset[]): Promise<CodeLeakFinding[]> {
    const assets = assetsOverride ?? (await fetchAssets());
    const query = filters.query?.trim().toLowerCase();
    let findings: CodeLeakFinding[] = [];

    try {
      findings = await (filters.query?.trim() ? fetchRemoteFindings(assets, filters.query) : fetchPersistedFindings(assets));
    } catch (error) {
      console.error('[codeLeakService] Remote code leak search failed:', error);
      throw new CodeLeakSearchError('Unable to load code leak findings from the live intelligence source. Please check the backend or API configuration.');
    }

    return findings.filter((finding) => {
      if (filters.assetId && filters.assetId !== 'all' && finding.assetId !== filters.assetId) return false;
      if (filters.severity && filters.severity !== 'all' && finding.severity !== filters.severity) return false;
      if (filters.status && filters.status !== 'all' && finding.status !== filters.status) return false;
      if (filters.source && filters.source !== 'all' && finding.source !== filters.source) return false;
      if (!query) return true;

      return [
        finding.title,
        finding.repository,
        finding.owner,
        finding.path,
        finding.match,
        finding.snippet,
        finding.assetLabel,
      ].some((field) => includesText(field, query));
    });
  },

  async updateFindingStatus(id: string, status: CodeLeakStatus): Promise<void> {
    await requestJson<{ finding?: Partial<CodeLeakFinding> }>(buildApiUrl('/api/code-leak/findings'), {
      method: 'PATCH',
      body: JSON.stringify({ id, status }),
    });
  },
};
