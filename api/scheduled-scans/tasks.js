import { applyCors, readJsonBody, sendJson } from '../_lib/intel.js';
import {
  ensureDefaultScheduledScanTasks,
  listScheduledScanTasks,
  removeScheduledScanTask,
  upsertScheduledScanTask,
} from '../_lib/scheduled-scans.js';

const getUserEmail = (req, body = null) => {
  const headerEmail = typeof req.headers['x-user-email'] === 'string' ? req.headers['x-user-email'].trim() : '';
  const bodyEmail = body && typeof body.userEmail === 'string' ? body.userEmail.trim() : '';
  return (headerEmail || bodyEmail).toLowerCase();
};

const toTaskResponse = (task) => {
  const lastRunAt = task.lastRunAt || null;
  const nextRunAt =
    lastRunAt && !Number.isNaN(new Date(lastRunAt).getTime())
      ? new Date(new Date(lastRunAt).getTime() + Number(task.intervalMinutes || 60) * 60 * 1000).toISOString()
      : null;

  return {
    ...task,
    nextRunAt,
  };
};

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { success: true });
  }

  try {
    const body = req.method === 'POST' || req.method === 'PATCH' ? await readJsonBody(req) : null;
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
      const tasks = (await listScheduledScanTasks())
        .filter((task) => task.userEmail === userEmail)
        .map(toTaskResponse);

      return sendJson(res, 200, {
        success: true,
        tasks,
      });
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const scanType = typeof body?.scanType === 'string' ? body.scanType.trim() : '';
      const label = typeof body?.label === 'string' ? body.label.trim() : '';
      const intervalMinutes = Number(body?.intervalMinutes || 60);
      const query = typeof body?.query === 'string' ? body.query.trim() : '';
      const enabled = body?.enabled !== false;

      if (!scanType || !label) {
        return sendJson(res, 400, {
          success: false,
          error: 'Bad Request',
          message: 'scanType and label are required.',
        });
      }

      if (!['code_leak', 'file_leak', 'cve_intel'].includes(scanType)) {
        return sendJson(res, 400, {
          success: false,
          error: 'Bad Request',
          message: 'Unsupported scanType.',
        });
      }

      if (!Number.isFinite(intervalMinutes) || intervalMinutes < 5) {
        return sendJson(res, 400, {
          success: false,
          error: 'Bad Request',
          message: 'intervalMinutes must be at least 5.',
        });
      }

      const existingTasks = (await listScheduledScanTasks()).filter((task) => task.userEmail === userEmail);
      const taskId =
        typeof body?.id === 'string' && body.id.trim()
          ? body.id.trim()
          : `scheduled-${scanType}-${userEmail}-${existingTasks.length + 1}`;

      const createdAt =
        existingTasks.find((task) => task.id === taskId)?.createdAt || body?.createdAt || new Date().toISOString();

      const savedTask = await upsertScheduledScanTask({
        id: taskId,
        userEmail,
        scanType,
        label,
        query,
        intervalMinutes,
        enabled,
        lastRunAt: body?.lastRunAt || existingTasks.find((task) => task.id === taskId)?.lastRunAt || null,
        createdAt,
      });

      return sendJson(res, 200, {
        success: true,
        task: toTaskResponse(savedTask),
      });
    }

    if (req.method === 'DELETE') {
      const rawId = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
      const taskId = typeof rawId === 'string' ? rawId.trim() : '';

      if (!taskId) {
        return sendJson(res, 400, {
          success: false,
          error: 'Bad Request',
          message: 'Task id is required.',
        });
      }

      const tasks = (await removeScheduledScanTask(taskId, userEmail))
        .filter((task) => task.userEmail === userEmail)
        .map(toTaskResponse);

      return sendJson(res, 200, {
        success: true,
        tasks,
      });
    }

    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed',
      message: 'Unsupported scheduled scan operation.',
    });
  } catch (error) {
    console.error('[api/scheduled-scans/tasks] failed:', error);
    return sendJson(res, 500, {
      success: false,
      error: 'Scheduled scan tasks failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
