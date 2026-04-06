import { neon } from '@neondatabase/serverless';
import { createHmac, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '';
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;
const CONFIGS_FILE = path.join(process.cwd(), '.data', 'webhook-configs.json');
const LOGS_FILE = path.join(process.cwd(), '.data', 'webhook-delivery-logs.json');

let tablesReady = false;

const ensureStoreFile = async (filePath, fallbackValue) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(fallbackValue, null, 2), 'utf8');
  }
};

const readJsonFile = async (filePath, fallbackValue) => {
  await ensureStoreFile(filePath, fallbackValue);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw || JSON.stringify(fallbackValue));
    return parsed ?? fallbackValue;
  } catch {
    return fallbackValue;
  }
};

const writeJsonFile = async (filePath, value) => {
  await ensureStoreFile(filePath, value);
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
};

export const ensureWebhookTables = async () => {
  if (!sql || tablesReady) return;

  await sql`
    CREATE TABLE IF NOT EXISTS webhook_configs (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL,
      secret TEXT,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      webhook_url TEXT NOT NULL,
      event_name TEXT NOT NULL,
      status TEXT NOT NULL,
      response_status INTEGER,
      error_message TEXT,
      payload JSONB NOT NULL,
      delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  tablesReady = true;
};

export const getWebhookUserEmail = (req, body = null) => {
  const headerEmail = typeof req.headers['x-user-email'] === 'string' ? req.headers['x-user-email'].trim() : '';
  const bodyEmail = body && typeof body.userEmail === 'string' ? body.userEmail.trim() : '';
  return (headerEmail || bodyEmail).toLowerCase();
};

export const getWebhookConfig = async (userEmail) => {
  if (!sql) {
    const store = await readJsonFile(CONFIGS_FILE, {});
    return store[userEmail] || null;
  }

  await ensureWebhookTables();
  const rows = await sql`
    SELECT id, user_email, url, secret, enabled, created_at, updated_at
    FROM webhook_configs
    WHERE user_email = ${userEmail}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    userEmail: row.user_email,
    url: row.url,
    secret: row.secret || '',
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const upsertWebhookConfig = async (userEmail, config) => {
  const normalized = {
    id: config.id || `webhook-${userEmail}`,
    userEmail,
    url: String(config.url || '').trim(),
    secret: typeof config.secret === 'string' ? config.secret.trim() : '',
    enabled: config.enabled !== false,
    createdAt: config.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!normalized.url) {
    throw new Error('Webhook URL is required.');
  }

  if (!sql) {
    const store = await readJsonFile(CONFIGS_FILE, {});
    store[userEmail] = normalized;
    await writeJsonFile(CONFIGS_FILE, store);
    return normalized;
  }

  await ensureWebhookTables();
  await sql`
    INSERT INTO webhook_configs (id, user_email, url, secret, enabled, created_at, updated_at)
    VALUES (${normalized.id}, ${normalized.userEmail}, ${normalized.url}, ${normalized.secret}, ${normalized.enabled}, ${normalized.createdAt}, ${normalized.updatedAt})
    ON CONFLICT (user_email) DO UPDATE SET
      url = EXCLUDED.url,
      secret = EXCLUDED.secret,
      enabled = EXCLUDED.enabled,
      updated_at = EXCLUDED.updated_at
  `;

  return normalized;
};

export const removeWebhookConfig = async (userEmail) => {
  if (!sql) {
    const store = await readJsonFile(CONFIGS_FILE, {});
    delete store[userEmail];
    await writeJsonFile(CONFIGS_FILE, store);
    return null;
  }

  await ensureWebhookTables();
  await sql`
    DELETE FROM webhook_configs
    WHERE user_email = ${userEmail}
  `;
  return null;
};

export const recordWebhookDelivery = async ({
  userEmail,
  webhookUrl,
  eventName,
  status,
  responseStatus = null,
  errorMessage = null,
  payload,
}) => {
  const entry = {
    id: `webhook-log-${typeof randomUUID === 'function' ? randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`,
    userEmail,
    webhookUrl,
    eventName,
    status,
    responseStatus,
    errorMessage,
    payload,
    deliveredAt: new Date().toISOString(),
  };

  if (!sql) {
    const logs = await readJsonFile(LOGS_FILE, []);
    logs.push(entry);
    await writeJsonFile(LOGS_FILE, logs);
    return entry;
  }

  await ensureWebhookTables();
  await sql`
    INSERT INTO webhook_delivery_logs (id, user_email, webhook_url, event_name, status, response_status, error_message, payload, delivered_at)
    VALUES (${entry.id}, ${entry.userEmail}, ${entry.webhookUrl}, ${entry.eventName}, ${entry.status}, ${entry.responseStatus}, ${entry.errorMessage}, ${JSON.stringify(entry.payload)}, ${entry.deliveredAt})
  `;

  return entry;
};

export const listWebhookDeliveryLogs = async (userEmail, limit = 10) => {
  const normalizedLimit = Math.max(1, Math.min(50, Number(limit || 10)));

  if (!sql) {
    const logs = await readJsonFile(LOGS_FILE, []);
    return logs
      .filter((entry) => entry.userEmail === userEmail)
      .sort((a, b) => new Date(b.deliveredAt || 0).getTime() - new Date(a.deliveredAt || 0).getTime())
      .slice(0, normalizedLimit);
  }

  await ensureWebhookTables();
  const rows = await sql`
    SELECT id, user_email, webhook_url, event_name, status, response_status, error_message, payload, delivered_at
    FROM webhook_delivery_logs
    WHERE user_email = ${userEmail}
    ORDER BY delivered_at DESC
    LIMIT ${normalizedLimit}
  `;

  return rows.map((row) => ({
    id: row.id,
    userEmail: row.user_email,
    webhookUrl: row.webhook_url,
    eventName: row.event_name,
    status: row.status,
    responseStatus: row.response_status ?? null,
    errorMessage: row.error_message ?? null,
    payload: row.payload,
    deliveredAt: row.delivered_at,
  }));
};

const createWebhookSignature = (secret, body) => {
  if (!secret) return '';
  return createHmac('sha256', secret).update(body).digest('hex');
};

export const sendWebhookNotification = async ({ userEmail, eventName, payload }) => {
  const config = await getWebhookConfig(userEmail);

  if (!config || !config.enabled || !config.url) {
    return { delivered: false, skipped: true, reason: 'Webhook is not configured.' };
  }

  const deliveryId = typeof randomUUID === 'function' ? randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const body = JSON.stringify(payload);
  const signature = createWebhookSignature(config.secret, body);

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-LeakRadar-Event': eventName,
        'X-LeakRadar-Delivery': deliveryId,
        ...(signature ? { 'X-LeakRadar-Signature': `sha256=${signature}` } : {}),
      },
      body,
    });

    const responseStatus = Number(response.status || 0);
    const ok = response.ok;

    await recordWebhookDelivery({
      userEmail,
      webhookUrl: config.url,
      eventName,
      status: ok ? 'success' : 'failed',
      responseStatus,
      errorMessage: ok ? null : `Webhook responded with status ${responseStatus}`,
      payload,
    });

    return { delivered: ok, skipped: false, responseStatus };
  } catch (error) {
    await recordWebhookDelivery({
      userEmail,
      webhookUrl: config.url,
      eventName,
      status: 'failed',
      responseStatus: null,
      errorMessage: error instanceof Error ? error.message : 'Unknown webhook error',
      payload,
    });

    return {
      delivered: false,
      skipped: false,
      error: error instanceof Error ? error.message : 'Unknown webhook error',
    };
  }
};

export const sendWebhookTestNotification = async (userEmail) => {
  return sendWebhookNotification({
    userEmail,
    eventName: 'scheduled_scan.test',
    payload: {
      event: 'scheduled_scan.test',
      message: 'This is a test webhook notification from LeakRadar.',
      detectedAt: new Date().toISOString(),
      finding: {
        title: 'Webhook test notification',
        source: 'LeakRadar',
        severity: 'low',
        status: 'new',
        summary: 'Use this message to verify that your robot or webhook endpoint is connected successfully.',
      },
    },
  });
};
