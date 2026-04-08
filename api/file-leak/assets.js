import {
  addFileLeakAsset,
  getFileLeakUserEmail,
  listFileLeakAssets,
  removeFileLeakAsset,
} from '../_lib/file-leak-assets.js';
import { applyCors, readJsonBody, sendJson } from '../_lib/http.js';
import { ensureDefaultScheduledScanTasks } from '../_lib/scheduled-scans.js';
import { sendApiError } from '../_lib/api-errors.js';

const ALLOWED_TYPES = new Set(['company', 'domain', 'email_suffix', 'document_keyword']);

const ensureDefaultTasksSafely = async (userEmail) => {
  try {
    await ensureDefaultScheduledScanTasks(userEmail);
  } catch (error) {
    console.warn('[api/file-leak/assets] failed to ensure default scan tasks:', error);
  }
};

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { success: true });
  }

  try {
    const body = req.method === 'POST' ? await readJsonBody(req) : null;
    const userEmail = getFileLeakUserEmail(req, body);

    if (!userEmail) {
      return sendJson(res, 401, {
        success: false,
        error: 'Unauthorized',
        message: 'Missing current user email for file leak assets.',
      });
    }

    await ensureDefaultTasksSafely(userEmail);

    if (req.method === 'GET') {
      const assets = await listFileLeakAssets(userEmail);
      return sendJson(res, 200, { success: true, assets });
    }

    if (req.method === 'POST') {
      const value = typeof body?.value === 'string' ? body.value.trim() : '';
      const label = typeof body?.label === 'string' ? body.label.trim() : value;
      const rawType = typeof body?.type === 'string' ? body.type.trim() : 'company';
      const type = ALLOWED_TYPES.has(rawType) ? rawType : 'company';

      if (!value) {
        return sendJson(res, 400, {
          success: false,
          error: 'Bad Request',
          message: 'Asset value is required.',
        });
      }

      const assets = await addFileLeakAsset(userEmail, {
        id: `file-asset-${Date.now()}`,
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
          message: 'Asset id is required.',
        });
      }

      const assets = await removeFileLeakAsset(userEmail, assetId);
      return sendJson(res, 200, { success: true, assets });
    }

    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed',
      message: 'Unsupported file leak assets operation.',
    });
  } catch (error) {
    console.error('[api/file-leak/assets] failed:', error);
    return sendApiError(res, error, {
      status: 500,
      error: 'File leak assets failed',
      message: 'Failed to load file leak assets.',
    });
  }
}
