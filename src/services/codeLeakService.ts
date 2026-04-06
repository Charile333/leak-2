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
  url: string;
  confidence: number;
  notes: string[];
}

export interface CodeLeakSearchFilters {
  query?: string;
  assetId?: string;
  severity?: CodeLeakSeverity | 'all';
  status?: CodeLeakStatus | 'all';
  source?: CodeLeakSource | 'all';
}

const STATUS_STORAGE_KEY = 'code-leak-mvp-statuses';
const ASSETS_STORAGE_KEY = 'code-leak-assets';

export class CodeLeakSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodeLeakSearchError';
  }
}

const readLocalJson = <T>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeLocalJson = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const readStatusOverrides = () => readLocalJson<Record<string, CodeLeakStatus>>(STATUS_STORAGE_KEY, {});

const writeStatusOverrides = (statuses: Record<string, CodeLeakStatus>) => {
  writeLocalJson(STATUS_STORAGE_KEY, statuses);
};

const readAssets = (): CodeLeakAsset[] => {
  return readLocalJson<CodeLeakAsset[]>(ASSETS_STORAGE_KEY, []);
};

const writeCustomAssets = (assets: CodeLeakAsset[]) => {
  writeLocalJson(ASSETS_STORAGE_KEY, assets);
};

const applyStatuses = (findings: CodeLeakFinding[]) => {
  const statuses = readStatusOverrides();
  return findings.map((finding) => ({
    ...finding,
    status: statuses[finding.id] || finding.status,
  }));
};

const includesText = (haystack: string, needle: string) =>
  haystack.toLowerCase().includes(needle.toLowerCase());

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
      label: finding.assetLabel || finding.match || '未匹配对象',
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
    title: finding.title || '发现疑似代码泄露线索',
    repository: finding.repository || 'unknown-repository',
    owner: finding.owner || 'unknown-owner',
    path: finding.path || 'unknown-path',
    branch: finding.branch || 'main',
    match: finding.match || linkedAsset.value,
    snippet: finding.snippet || '未返回可预览的命中片段',
    firstSeen: finding.firstSeen || now,
    lastSeen: finding.lastSeen || finding.firstSeen || now,
    url: finding.url || '#',
    confidence: typeof finding.confidence === 'number' ? finding.confidence : 0.5,
    notes: Array.isArray(finding.notes) ? finding.notes : ['建议尽快打开来源并确认是否为真实泄露。'],
  };
};

const fetchRemoteFindings = async (assets: CodeLeakAsset[], query?: string) => {
  const response = await fetch('/api/code-leak/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ assets, query }),
  });

  if (!response.ok) {
    throw new Error(`Remote code leak search failed with status ${response.status}`);
  }

  const payload = await response.json();
  const findings = Array.isArray(payload.findings) ? payload.findings : [];
  const assetMap = buildAssetMap(assets);

  return findings.map((finding: Partial<CodeLeakFinding>) => normalizeRemoteFinding(finding, assetMap, assets));
};

export const codeLeakService = {
  async getAssets(): Promise<CodeLeakAsset[]> {
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    return readAssets();
  },

  async addAsset(input: { label?: string; value: string; type: CodeLeakAssetType }): Promise<CodeLeakAsset[]> {
    await new Promise((resolve) => window.setTimeout(resolve, 80));

    const value = input.value.trim();
    if (!value) {
      throw new Error('监测对象不能为空');
    }

    const assets = readAssets();
    if (assets.some((asset) => asset.value.toLowerCase() === value.toLowerCase())) {
      return assets;
    }

    const nextAssets = [
      ...assets,
      {
        id: `asset-custom-${Date.now()}`,
        label: input.label?.trim() || value,
        value,
        type: input.type,
        enabled: true,
      },
    ];

    writeCustomAssets(nextAssets);
    return nextAssets;
  },

  async removeAsset(id: string): Promise<CodeLeakAsset[]> {
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    const nextAssets = readAssets().filter((asset) => asset.id !== id);
    writeCustomAssets(nextAssets);
    return nextAssets;
  },

  async searchFindings(filters: CodeLeakSearchFilters = {}, assetsOverride?: CodeLeakAsset[]): Promise<CodeLeakFinding[]> {
    await new Promise((resolve) => window.setTimeout(resolve, 120));

    const assets = assetsOverride && assetsOverride.length > 0 ? assetsOverride : readAssets();
    const query = filters.query?.trim().toLowerCase();
    let findings: CodeLeakFinding[] = [];

    try {
      const remoteFindings = await fetchRemoteFindings(assets, filters.query);
      findings = applyStatuses(remoteFindings);
    } catch (error) {
      console.error('[codeLeakService] Remote code leak search failed:', error);
      throw new CodeLeakSearchError('当前无法从真实情报源加载代码泄露结果，请检查后端聚合服务或 API 配置。');
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
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    const statuses = readStatusOverrides();
    statuses[id] = status;
    writeStatusOverrides(statuses);
  },
};
