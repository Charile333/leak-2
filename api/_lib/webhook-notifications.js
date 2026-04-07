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

const detectWebhookPlatform = (url) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (host.includes('weixin.qq.com') && pathname.includes('/cgi-bin/webhook/send')) {
      return 'wecom';
    }

    if ((host.includes('dingtalk.com') || host.includes('dingtalkapps.com')) && pathname.includes('/robot/send')) {
      return 'dingtalk';
    }

    if ((host.includes('feishu.cn') || host.includes('larksuite.com')) && pathname.includes('/open-apis/bot')) {
      return 'feishu';
    }
  } catch {
    return 'generic';
  }

  return 'generic';
};

const toDisplayText = (value, fallback = 'N/A') => {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim();
  return normalized ? normalized : fallback;
};

const formatSeverityLabel = (severity) => {
  const normalized = String(severity || '').toLowerCase();
  if (normalized === 'critical') return '严重';
  if (normalized === 'high') return '高危';
  if (normalized === 'medium') return '中危';
  if (normalized === 'low') return '低危';
  if (normalized === 'safe') return '安全';
  return toDisplayText(severity, '未知');
};

const buildRobotSummary = (eventName, payload) => {
  const finding = payload?.finding || {};
  const title = toDisplayText(finding.title || payload?.title, '泄露监测事件');
  const summary = toDisplayText(finding.summary || payload?.message, '请前往平台查看详情。');
  const source = toDisplayText(finding.source || payload?.source, 'LeakRadar');
  const severity = formatSeverityLabel(finding.severity || payload?.severity);
  const status = toDisplayText(finding.status || payload?.status, 'new');
  const detectedAt = toDisplayText(payload?.detectedAt, new Date().toISOString());
  const url = finding.url || payload?.url || '';

  return {
    title,
    summary,
    source,
    severity,
    status,
    detectedAt,
    url,
    eventName,
  };
};

const buildMarkdownSummary = (details) =>
  [
    `**${details.title}**`,
    '',
    `事件：${details.eventName}`,
    `等级：${details.severity}`,
    `来源：${details.source}`,
    `状态：${details.status}`,
    `时间：${details.detectedAt}`,
    '',
    details.summary,
    details.url ? '' : null,
    details.url ? `链接：${details.url}` : null,
  ]
    .filter(Boolean)
    .join('\n');

const buildPlainTextSummary = (details) =>
  [
    `【${details.title}】`,
    `事件：${details.eventName}`,
    `等级：${details.severity}`,
    `来源：${details.source}`,
    `状态：${details.status}`,
    `时间：${details.detectedAt}`,
    `摘要：${details.summary}`,
    details.url ? `链接：${details.url}` : null,
  ]
    .filter(Boolean)
    .join('\n');

const createDingtalkSignedUrl = (rawUrl, secret) => {
  if (!secret) return rawUrl;

  const timestamp = Date.now().toString();
  const sign = createHmac('sha256', secret).update(`${timestamp}\n${secret}`).digest('base64');
  const parsed = new URL(rawUrl);
  parsed.searchParams.set('timestamp', timestamp);
  parsed.searchParams.set('sign', sign);
  return parsed.toString();
};

const createFeishuSignedFields = (secret) => {
  if (!secret) return {};
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sign = createHmac('sha256', `${timestamp}\n${secret}`).update('').digest('base64');
  return { timestamp, sign };
};

const buildWebhookRequest = ({ config, eventName, payload, deliveryId }) => {
  const platform = detectWebhookPlatform(config.url);
  const details = buildRobotSummary(eventName, payload);
  const genericBody = JSON.stringify(payload);
  const signature = createWebhookSignature(config.secret, genericBody);

  if (platform === 'wecom') {
    const body = JSON.stringify({
      msgtype: 'markdown',
      markdown: {
        content: buildMarkdownSummary(details),
      },
    });

    return {
      platform,
      url: config.url,
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-LeakRadar-Event': eventName,
        'X-LeakRadar-Delivery': deliveryId,
        ...(signature ? { 'X-LeakRadar-Signature': `sha256=${signature}` } : {}),
      },
    };
  }

  if (platform === 'dingtalk') {
    const body = JSON.stringify({
      msgtype: 'text',
      text: {
        content: buildPlainTextSummary(details),
      },
    });

    return {
      platform,
      url: createDingtalkSignedUrl(config.url, config.secret),
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-LeakRadar-Event': eventName,
        'X-LeakRadar-Delivery': deliveryId,
      },
    };
  }

  if (platform === 'feishu') {
    const body = JSON.stringify({
      msg_type: 'text',
      content: {
        text: buildPlainTextSummary(details),
      },
      ...createFeishuSignedFields(config.secret),
    });

    return {
      platform,
      url: config.url,
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-LeakRadar-Event': eventName,
        'X-LeakRadar-Delivery': deliveryId,
      },
    };
  }

  return {
    platform,
    url: config.url,
    body: genericBody,
    headers: {
      'Content-Type': 'application/json',
      'X-LeakRadar-Event': eventName,
      'X-LeakRadar-Delivery': deliveryId,
      ...(signature ? { 'X-LeakRadar-Signature': `sha256=${signature}` } : {}),
    },
  };
};

export const sendWebhookNotification = async ({ userEmail, eventName, payload }) => {
  const config = await getWebhookConfig(userEmail);

  if (!config || !config.enabled || !config.url) {
    return { delivered: false, skipped: true, reason: 'Webhook is not configured.' };
  }

  const deliveryId = typeof randomUUID === 'function' ? randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const request = buildWebhookRequest({ config, eventName, payload, deliveryId });

  try {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
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
      message: '这是一条来自 LeakRadar 的测试通知，用于验证机器人或 Webhook 是否接通。',
      detectedAt: new Date().toISOString(),
      finding: {
        title: 'Webhook 测试通知',
        source: 'LeakRadar',
        severity: 'low',
        status: 'new',
        summary: '如果你看到了这条消息，说明当前机器人或 Webhook 接入已经打通。',
      },
    },
  });
};
