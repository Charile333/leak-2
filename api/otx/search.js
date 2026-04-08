import {
  applyCors,
  buildLatestCveIntelFeed,
  buildStructuredOtxResult,
  getCachedOtxSearch,
  sendJson,
  setCachedOtxSearch,
} from '../_lib/intel.js';
import { getCveIntelUserEmail, listCveIntelAssets } from '../_lib/cve-intel-assets.js';
import { sendApiError } from '../_lib/api-errors.js';

const normalizeForMatch = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9.+#/_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildCveHaystack = (item) =>
  normalizeForMatch([
    item?.cveId,
    item?.title,
    item?.summary,
    item?.cwe,
    ...(Array.isArray(item?.tags) ? item.tags : []),
    ...(Array.isArray(item?.references) ? item.references : []),
    ...(Array.isArray(item?.sourceTags) ? item.sourceTags : []),
  ].join(' '));

const filterItemsByAssets = (items, assets) => {
  if (!Array.isArray(assets) || assets.length === 0) return items;

  return items.filter((item) => {
    const haystack = buildCveHaystack(item);
    return assets.some((asset) => {
      if (!asset || asset.enabled === false) return false;
      const needle = normalizeForMatch(asset.value);
      return needle.length >= 2 && haystack.includes(needle);
    });
  });
};

const listCveIntelAssetsSafely = async (userEmail) => {
  if (!userEmail) return [];

  try {
    return await listCveIntelAssets(userEmail);
  } catch (error) {
    console.warn('[api/otx/search] failed to load CVE intel assets:', error);
    return [];
  }
};

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { success: true });
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, {
      error: 'Method Not Allowed',
      message: 'Only GET requests are allowed for this endpoint',
    });
  }

  try {
    const mode = String(req.query.mode || '').trim().toLowerCase();

    if (mode === 'cve-feed') {
      const limit = Number(req.query.limit) || 12;
      const window = String(req.query.window || '7d');
      const noCache = String(req.query.noCache || '').trim().toLowerCase() === '1';
      const userEmail = getCveIntelUserEmail(req);

      const data = await buildLatestCveIntelFeed({
        limit,
        window,
        noCache,
      });

      const assets = await listCveIntelAssetsSafely(userEmail);
      const filteredItems = filterItemsByAssets(Array.isArray(data.items) ? data.items : [], assets);

      return sendJson(res, 200, {
        success: true,
        ...data,
        items: filteredItems,
        meta: {
          ...(data.meta || {}),
          matchedAssetCount: Array.isArray(assets) ? assets.length : 0,
          totalSignals: filteredItems.length,
          recommendedCount: filteredItems.filter((item) => item.pushRecommended).length,
        },
      });
    }

    const type = String(req.query.type || '').trim().toLowerCase();
    const query = String(req.query.query || '').trim();
    const noCache = String(req.query.noCache || '').trim().toLowerCase() === '1';
    const coreOnly = String(req.query.coreOnly || '').trim().toLowerCase() === '1';

    if (!query || !['ip', 'domain', 'url', 'cve'].includes(type)) {
      return sendJson(res, 400, {
        error: 'Invalid Request',
        message: 'type and query are required',
      });
    }

    const cached = noCache || coreOnly ? null : getCachedOtxSearch(type, query);
    if (cached) {
      return sendJson(res, 200, {
        source: 'intel',
        cached: true,
        data: cached,
      });
    }

    const data = await buildStructuredOtxResult(type, query, { coreOnly });
    if (!coreOnly) {
      setCachedOtxSearch(type, query, data);
    }

    return sendJson(res, 200, {
      source: 'intel',
      cached: false,
      noCache,
      coreOnly,
      data,
    });
  } catch (error) {
    console.error('[api/otx/search] failed:', error);
    return sendApiError(res, error, {
      status: 500,
      error: 'Intel Search Failed',
      message: 'Failed to search intelligence source',
    });
  }
}
