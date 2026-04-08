import { addCodeLeakAsset, getCodeLeakUserEmail, listCodeLeakAssets, removeCodeLeakAsset } from '../_lib/code-leak-assets.js';
import { applyCors, readJsonBody, sendJson } from '../_lib/http.js';
import { ensureDefaultScheduledScanTasks } from '../_lib/scheduled-scans.js';
import { sendApiError } from '../_lib/api-errors.js';

const ensureDefaultTasksSafely = async (userEmail) => {
  try {
    await ensureDefaultScheduledScanTasks(userEmail);
  } catch (error) {
    console.warn('[api/code-leak/assets] failed to ensure default scan tasks:', error);
  }
};

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { success: true });
  }

  try {
    const body = req.method === 'POST' ? await readJsonBody(req) : null;
    const userEmail = getCodeLeakUserEmail(req, body);

    if (!userEmail) {
      return sendJson(res, 401, {
        success: false,
        error: 'Unauthorized',
        message: '缺少当前登录用户信息。',
      });
    }

    await ensureDefaultTasksSafely(userEmail);

    if (req.method === 'GET') {
      const assets = await listCodeLeakAssets(userEmail);
      return sendJson(res, 200, { success: true, assets });
    }

    if (req.method === 'POST') {
      const value = typeof body?.value === 'string' ? body.value.trim() : '';
      const label = typeof body?.label === 'string' ? body.label.trim() : value;
      const type = typeof body?.type === 'string' ? body.type : 'company';

      if (!value) {
        return sendJson(res, 400, {
          success: false,
          error: 'Bad Request',
          message: '监测对象不能为空。',
        });
      }

      const assets = await addCodeLeakAsset(userEmail, {
        id: `asset-${Date.now()}`,
        label,
        value,
        type,
        enabled: true,
      });

      return sendJson(res, 200, { success: true, assets });
    }

    if (req.method === 'DELETE') {
      const rawId = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
      const assetId = typeof rawId === 'string' ? rawId.trim() : '';

      if (!assetId) {
        return sendJson(res, 400, {
          success: false,
          error: 'Bad Request',
          message: '缺少要删除的监测对象 ID。',
        });
      }

      const assets = await removeCodeLeakAsset(userEmail, assetId);
      return sendJson(res, 200, { success: true, assets });
    }

    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed',
      message: 'Unsupported assets operation.',
    });
  } catch (error) {
    console.error('[api/code-leak/assets] failed:', error);
    return sendApiError(res, error, {
      status: 500,
      error: 'Code leak assets failed',
      message: 'Failed to load code leak assets.',
    });
  }
}
