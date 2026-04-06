import {
  applyCors,
  readJsonBody,
  searchFileLeaks,
  sendJson,
} from '../_lib/intel.js';

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { success: true });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, {
      error: 'Method Not Allowed',
      message: 'Only POST requests are allowed for this endpoint',
    });
  }

  try {
    const body = await readJsonBody(req);
    const assets = Array.isArray(body.assets) ? body.assets : [];
    const query = typeof body.query === 'string' ? body.query : '';
    const result = await searchFileLeaks(assets, query);
    return sendJson(res, 200, result);
  } catch (error) {
    console.error('[api/file-leak/search] failed:', error);
    return sendJson(res, 500, {
      success: false,
      error: 'File leak search failed',
      details: error.message || 'Unknown error',
    });
  }
}
