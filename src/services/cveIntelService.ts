import { buildApiUrl, getFetchErrorMessage } from './apiBase';

export type CveIntelFeedWindow = '24h' | '7d' | 'all';

export interface CveIntelItem {
  cveId: string;
  title: string;
  summary: string;
  published?: string;
  lastModified?: string;
  latestSeen?: string;
  cvssScore: number | null;
  severity?: string;
  vector?: string;
  cwe?: string;
  hasKev: boolean;
  kevDate?: string;
  otxMentionCount: number;
  sourceTags: string[];
  references: string[];
  pushScore: number;
  pushLevel: string;
  pushRecommended: boolean;
  pushReasons: string[];
  sourceDetails?: {
    aliyun?: {
      sourceUrl?: string;
      sourceName?: string;
    } | null;
    nvd?: {
      severity?: string;
      cvssScore?: number | null;
    } | null;
  };
}

export interface CveIntelFeedMeta {
  totalSignals: number;
  recommendedCount: number;
  kevCount: number;
  highSeverityCount: number;
  window: CveIntelFeedWindow;
  upstreamStatus: string;
  sourceTags: string[];
  cacheStatus?: string;
}

export interface CveIntelFeedResponse {
  success?: boolean;
  cached?: boolean;
  generatedAt?: string;
  items: CveIntelItem[];
  meta: CveIntelFeedMeta;
}

const requestJson = async <T>(url: string, fallback: string): Promise<T> => {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(typeof payload?.message === 'string' ? payload.message : `Request failed with status ${response.status}`);
    }

    return payload as T;
  } catch (error) {
    throw new Error(getFetchErrorMessage(error, fallback));
  }
};

const EMPTY_FEED: CveIntelFeedResponse = {
  items: [],
  meta: {
    totalSignals: 0,
    recommendedCount: 0,
    kevCount: 0,
    highSeverityCount: 0,
    window: '7d',
    upstreamStatus: 'unknown',
    sourceTags: [],
    cacheStatus: 'fresh',
  },
};

export const cveIntelService = {
  async getLatestFeed(options: { limit?: number; window?: CveIntelFeedWindow; noCache?: boolean } = {}): Promise<CveIntelFeedResponse> {
    const params = new URLSearchParams({
      mode: 'cve-feed',
    });

    if (options.limit) {
      params.set('limit', String(options.limit));
    }

    if (options.window) {
      params.set('window', options.window);
    }

    if (options.noCache) {
      params.set('noCache', '1');
    }

    const payload = await requestJson<Partial<CveIntelFeedResponse>>(
      buildApiUrl(`/api/otx/search?${params.toString()}`),
      '无法加载最新 CVE 情报，请检查后端服务是否可用。',
    );

    return {
      ...EMPTY_FEED,
      ...payload,
      items: Array.isArray(payload?.items) ? payload.items : [],
      meta: {
        ...EMPTY_FEED.meta,
        ...(payload?.meta || {}),
        window: options.window || payload?.meta?.window || EMPTY_FEED.meta.window,
        sourceTags: Array.isArray(payload?.meta?.sourceTags) ? payload.meta.sourceTags : EMPTY_FEED.meta.sourceTags,
      },
    };
  },
};
