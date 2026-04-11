import { applyCors, sendJson } from '../_lib/http.js';
import { listScheduledScanRuns } from '../_lib/scheduled-scans.js';

const getUserEmail = (req) => {
  const headerEmail = typeof req.headers['x-user-email'] === 'string' ? req.headers['x-user-email'].trim() : '';
  return headerEmail.toLowerCase();
};

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { success: true });
  }

  try {
    const userEmail = getUserEmail(req);
    if (!userEmail) {
      return sendJson(res, 401, {
        success: false,
        error: 'Unauthorized',
        message: 'User email is required.',
      });
    }

    if (req.method !== 'GET') {
      return sendJson(res, 405, {
        success: false,
        error: 'Method Not Allowed',
        message: 'Unsupported runs operation.',
      });
    }

    const limit = Number(Array.isArray(req.query?.limit) ? req.query.limit[0] : req.query?.limit) || 20;
    const runs = await listScheduledScanRuns({ userEmail, limit });

    return sendJson(res, 200, {
      success: true,
      runs,
    });
  } catch (error) {
    console.error('[api/scheduled-scans/runs] failed:', error);
    return sendJson(res, 500, {
      success: false,
      error: 'Scheduled scan runs failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
