export type FileLeakSeverity = 'critical' | 'high' | 'medium' | 'low';
export type FileLeakStatus = 'new' | 'reviewing' | 'confirmed' | 'dismissed';
export type FileLeakSource = 'GitHub' | 'Gitee';
export type FileLeakExposure = 'document' | 'spreadsheet' | 'dataset' | 'archive' | 'database' | 'backup';
export type FileLeakAssetType = 'company' | 'domain' | 'email_suffix' | 'document_keyword';
export type FileLeakSensitivity = 'critical' | 'high' | 'medium';

export interface FileLeakAsset {
  id: string;
  label: string;
  type: FileLeakAssetType;
  value: string;
  enabled: boolean;
}

export interface FileLeakFinding {
  id: string;
  assetId: string;
  assetLabel: string;
  severity: FileLeakSeverity;
  status: FileLeakStatus;
  source: FileLeakSource;
  exposure: FileLeakExposure;
  title: string;
  repository: string;
  owner: string;
  path: string;
  match: string;
  snippet: string;
  url: string;
  fileType: string;
  sensitivity: FileLeakSensitivity;
  channel: string;
  sourceSite: string;
  firstSeen: string;
  lastSeen: string;
  confidence: number;
  matchedRules: string[];
  notes: string[];
}

export interface FileLeakSearchFilters {
  query?: string;
  assetId?: string;
  severity?: FileLeakSeverity | 'all';
  status?: FileLeakStatus | 'all';
  source?: FileLeakSource | 'all';
  sensitivity?: FileLeakSensitivity | 'all';
}

const STATUS_STORAGE_KEY = 'file-leak-statuses';

export class FileLeakSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileLeakSearchError';
  }
}

const readStatusOverrides = () => {
  if (typeof window === 'undefined') return {} as Record<string, FileLeakStatus>;

  try {
    const raw = window.localStorage.getItem(STATUS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, FileLeakStatus>) : {};
  } catch {
    return {};
  }
};

const writeStatusOverrides = (statuses: Record<string, FileLeakStatus>) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(statuses));
};

const applyStatuses = (findings: FileLeakFinding[]) => {
  const statuses = readStatusOverrides();
  return findings.map((finding) => ({
    ...finding,
    status: statuses[finding.id] || finding.status,
  }));
};

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

const buildAssetMap = (assets: FileLeakAsset[]) =>
  new Map(assets.map((asset) => [asset.value.toLowerCase(), asset]));

const normalizeRemoteFinding = (
  finding: Partial<FileLeakFinding> & { assetLabel?: string; match?: string },
  assetMap: Map<string, FileLeakAsset>,
  assets: FileLeakAsset[]
): FileLeakFinding => {
  const fallbackAsset =
    assets[0] ||
    ({
      id: 'file-asset-unmatched',
      label: finding.assetLabel || finding.match || 'Unmatched asset',
      value: finding.match || finding.assetLabel || 'unmatched',
      type: 'company',
      enabled: true,
    } as FileLeakAsset);

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
    exposure: finding.exposure || 'document',
    title: finding.title || 'Potential public file leak detected',
    repository: finding.repository || 'unknown-repository',
    owner: finding.owner || 'unknown-owner',
    path: finding.path || 'Unknown path',
    match: finding.match || linkedAsset.value,
    snippet: finding.snippet || 'No additional context snippet returned.',
    url: finding.url || '#',
    fileType: finding.fileType || 'UNKNOWN',
    sensitivity: finding.sensitivity || 'medium',
    channel: finding.channel || 'public-source',
    sourceSite: finding.sourceSite || finding.url || '',
    firstSeen: finding.firstSeen || now,
    lastSeen: finding.lastSeen || finding.firstSeen || now,
    confidence: typeof finding.confidence === 'number' ? finding.confidence : 0.5,
    matchedRules: Array.isArray(finding.matchedRules) ? finding.matchedRules.filter((item): item is string => typeof item === 'string') : [],
    notes: Array.isArray(finding.notes) ? finding.notes : ['Review the source manually to confirm the file contents and leakage scope.'],
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
  const payload = await requestJson<{ assets?: FileLeakAsset[] }>('/api/file-leak/assets');
  return Array.isArray(payload.assets) ? payload.assets : [];
};

const fetchRemoteFindings = async (assets: FileLeakAsset[], query?: string) => {
  const payload = await requestJson<{ findings?: Array<Partial<FileLeakFinding>> }>('/api/file-leak/search', {
    method: 'POST',
    body: JSON.stringify({ assets, query }),
  });

  const findings = Array.isArray(payload.findings) ? payload.findings : [];
  const assetMap = buildAssetMap(assets);
  return findings.map((finding) => normalizeRemoteFinding(finding, assetMap, assets));
};

export const fileLeakService = {
  async getAssets(): Promise<FileLeakAsset[]> {
    return fetchAssets();
  },

  async getFindings(query?: string, assetsOverride?: FileLeakAsset[]): Promise<FileLeakFinding[]> {
    const assets = assetsOverride ?? (await fetchAssets());

    try {
      return applyStatuses(await fetchRemoteFindings(assets, query));
    } catch (error) {
      console.error('[fileLeakService] Remote file leak search failed:', error);
      throw new FileLeakSearchError('Remote file leak search failed. Please check the API configuration and try again.');
    }
  },

  async addAsset(input: { label?: string; value: string; type: FileLeakAssetType }): Promise<FileLeakAsset[]> {
    const value = input.value.trim();
    if (!value) {
      throw new Error('Monitored asset value cannot be empty.');
    }

    const payload = await requestJson<{ assets?: FileLeakAsset[] }>('/api/file-leak/assets', {
      method: 'POST',
      body: JSON.stringify({
        value,
        label: input.label?.trim() || value,
        type: input.type,
      }),
    });

    return Array.isArray(payload.assets) ? payload.assets : [];
  },

  async removeAsset(id: string): Promise<FileLeakAsset[]> {
    const payload = await requestJson<{ assets?: FileLeakAsset[] }>(`/api/file-leak/assets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });

    return Array.isArray(payload.assets) ? payload.assets : [];
  },

  async searchFindings(filters: FileLeakSearchFilters = {}, assetsOverride?: FileLeakAsset[]): Promise<FileLeakFinding[]> {
    const assets = assetsOverride ?? (await fetchAssets());
    const query = filters.query?.trim().toLowerCase();

    let findings: FileLeakFinding[] = [];

    try {
      findings = applyStatuses(await fetchRemoteFindings(assets, filters.query));
    } catch (error) {
      console.error('[fileLeakService] Remote file leak search failed:', error);
      throw new FileLeakSearchError('Unable to load file leak findings from the live intelligence source. Please check the backend or API configuration.');
    }

    return findings.filter((finding) => {
      if (filters.assetId && filters.assetId !== 'all' && finding.assetId !== filters.assetId) return false;
      if (filters.severity && filters.severity !== 'all' && finding.severity !== filters.severity) return false;
      if (filters.status && filters.status !== 'all' && finding.status !== filters.status) return false;
      if (filters.source && filters.source !== 'all' && finding.source !== filters.source) return false;
      if (filters.sensitivity && filters.sensitivity !== 'all' && finding.sensitivity !== filters.sensitivity) return false;
      if (!query) return true;

      return [
        finding.title,
        finding.repository,
        finding.owner,
        finding.path,
        finding.match,
        finding.snippet,
        finding.assetLabel,
        finding.fileType,
        finding.sourceSite,
      ].some((field) => includesText(field, query));
    });
  },

  async updateFindingStatus(id: string, status: FileLeakStatus): Promise<void> {
    const statuses = readStatusOverrides();
    statuses[id] = status;
    writeStatusOverrides(statuses);
  },
};
