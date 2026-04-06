import { applyCors, readJsonBody, sendJson } from '../_lib/intel.js';
import {
  getWebhookConfig,
  getWebhookUserEmail,
  listWebhookDeliveryLogs,
  removeWebhookConfig,
  sendWebhookTestNotification,
  upsertWebhookConfig,
} from '../_lib/webhook-notifications.js';

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { success: true });
  }

  try {
    const body = req.method === 'POST' || req.method === 'PATCH' ? await readJsonBody(req) : null;
    const userEmail = getWebhookUserEmail(req, body);

    if (!userEmail) {
      return sendJson(res, 401, {
        success: false,
        error: 'Unauthorized',
        message: 'User email is required.',
      });
    }

    if (req.method === 'GET') {
      const config = await getWebhookConfig(userEmail);
      const logs = await listWebhookDeliveryLogs(userEmail, 8);
      return sendJson(res, 200, { success: true, config, logs });
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      if (body?.action === 'test') {
        const result = await sendWebhookTestNotification(userEmail);
        return sendJson(res, result.delivered ? 200 : 502, {
          success: result.delivered,
          delivered: result.delivered,
          skipped: result.skipped,
          responseStatus: result.responseStatus ?? null,
          error: result.error ?? result.reason ?? null,
        });
      }

      const url = typeof body?.url === 'string' ? body.url.trim() : '';
      const secret = typeof body?.secret === 'string' ? body.secret.trim() : '';
      const enabled = body?.enabled !== false;

      if (!url) {
        return sendJson(res, 400, {
          success: false,
          error: 'Bad Request',
          message: 'Webhook URL is required.',
        });
      }

      const config = await upsertWebhookConfig(userEmail, {
        id: body?.id,
        url,
        secret,
        enabled,
      });

      return sendJson(res, 200, { success: true, config });
    }

    if (req.method === 'DELETE') {
      await removeWebhookConfig(userEmail);
      return sendJson(res, 200, { success: true, config: null });
    }

    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed',
      message: 'Unsupported webhook operation.',
    });
  } catch (error) {
    console.error('[api/notifications/webhook] failed:', error);
    return sendJson(res, 500, {
      success: false,
      error: 'Webhook configuration failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
