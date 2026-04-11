import { applyCors, readJsonBody, sendJson } from '../_lib/http.js';
import {
  ensureDefaultScheduledScanTasks,
  listScheduledFindings,
  updateScheduledFindingStatus,
} from '../_lib/scheduled-scans.js';

const getUserEmail = (req, body = null) => {
  const headerEmail = typeof req.headers['x-user-email'] === 'string' ? req.headers['x-user-email'].trim() : '';
  const bodyEmail = body && typeof body.userEmail === 'string' ? body.userEmail.trim() : '';
  return (headerEmail || bodyEmail).toLowerCase();
};

const isValidStatus = (status) => ['new', 'reviewing', 'confirmed', 'dismissed'].includes(status);

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { success: true });
  }

  try {
    const body = req.method === 'PATCH' ? await readJsonBody(req) : null;
    const userEmail = getUserEmail(req, body);

    if (!userEmail) {
      return sendJson(res, 401, {
        success: false,
        error: 'Unauthorized',
        message: 'User email is required.',
      });
    }

    if (req.method === 'GET') {
      await ensureDefaultScheduledScanTasks(userEmail);
      const findings = await listScheduledFindings({ userEmail, scanType: 'file_leak' });
      return sendJson(res, 200, {
        success: true,
        findings: findings.map((record) => record.finding),
      });
    }

    if (req.method === 'PATCH') {
      const findingId = typeof body?.id === 'string' ? body.id.trim() : '';
      const status = typeof body?.status === 'string' ? body.status.trim() : '';

      if (!findingId || !isValidStatus(status)) {
        return sendJson(res, 400, {
          success: false,
          error: 'Bad Request',
          message: 'A valid finding id and status are required.',
        });
      }

      const updated = await updateScheduledFindingStatus({ findingId, userEmail, status });
      if (!updated) {
        return sendJson(res, 404, {
          success: false,
          error: 'Not Found',
          message: 'Finding not found.',
        });
      }

      return sendJson(res, 200, {
        success: true,
        finding: updated.finding,
      });
    }

    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed',
      message: 'Unsupported findings operation.',
    });
  } catch (error) {
    console.error('[api/file-leak/findings] failed:', error);
    return sendJson(res, 500, {
      success: false,
      error: 'File leak findings failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
