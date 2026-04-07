import {
  applyCors,
  buildStructuredOtxResult,
  getCachedOtxSearch,
  sendJson,
  setCachedOtxSearch,
} from '../_lib/intel.js';

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
    return sendJson(res, 500, {
      error: 'Intel Search Failed',
      message: error.message || 'Failed to search intelligence source',
    });
  }
}
