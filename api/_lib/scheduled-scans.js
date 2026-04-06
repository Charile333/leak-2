import { neon } from '@neondatabase/serverless';
import { promises as fs } from 'fs';
import path from 'path';

const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '';
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;
const TASKS_FILE = path.join(process.cwd(), '.data', 'scheduled-scan-tasks.json');
const FINDINGS_FILE = path.join(process.cwd(), '.data', 'scheduled-scan-findings.json');
const RUNS_FILE = path.join(process.cwd(), '.data', 'scheduled-scan-runs.json');

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

export const ensureScheduledScanTables = async () => {
  if (!sql || tablesReady) return;

  await sql`
    CREATE TABLE IF NOT EXISTS scheduled_scan_tasks (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      scan_type TEXT NOT NULL,
      label TEXT NOT NULL,
      query TEXT,
      interval_minutes INTEGER NOT NULL DEFAULT 60,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      last_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS scheduled_scan_findings (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      user_email TEXT NOT NULL,
      scan_type TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      finding_payload JSONB NOT NULL,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      hit_count INTEGER NOT NULL DEFAULT 1,
      UNIQUE (task_id, dedupe_key)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS scheduled_scan_runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      user_email TEXT NOT NULL,
      scan_type TEXT NOT NULL,
      status TEXT NOT NULL,
      findings_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    )
  `;

  tablesReady = true;
};

export const listScheduledScanTasks = async () => {
  if (!sql) {
    return readJsonFile(TASKS_FILE, []);
  }

  await ensureScheduledScanTables();
  const rows = await sql`
    SELECT id, user_email, scan_type, label, query, interval_minutes, enabled, last_run_at, created_at, updated_at
    FROM scheduled_scan_tasks
    ORDER BY created_at ASC
  `;

  return rows.map((row) => ({
    id: row.id,
    userEmail: row.user_email,
    scanType: row.scan_type,
    label: row.label,
    query: row.query || '',
    intervalMinutes: Number(row.interval_minutes || 60),
    enabled: Boolean(row.enabled),
    lastRunAt: row.last_run_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
};

export const listDueScheduledScanTasks = async (referenceTime = new Date()) => {
  const tasks = await listScheduledScanTasks();
  return tasks.filter((task) => {
    if (!task.enabled) return false;
    if (!task.lastRunAt) return true;
    const lastRun = new Date(task.lastRunAt);
    if (Number.isNaN(lastRun.getTime())) return true;
    const nextRunAt = lastRun.getTime() + task.intervalMinutes * 60 * 1000;
    return nextRunAt <= referenceTime.getTime();
  });
};

export const upsertScheduledScanTask = async (task) => {
  const normalizedTask = {
    id: task.id,
    userEmail: String(task.userEmail || '').trim().toLowerCase(),
    scanType: task.scanType,
    label: String(task.label || '').trim(),
    query: typeof task.query === 'string' ? task.query.trim() : '',
    intervalMinutes: Math.max(5, Number(task.intervalMinutes || 60)),
    enabled: task.enabled !== false,
    lastRunAt: task.lastRunAt || null,
    createdAt: task.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!sql) {
    const tasks = await readJsonFile(TASKS_FILE, []);
    const nextTasks = tasks.filter((item) => item.id !== normalizedTask.id);
    nextTasks.push(normalizedTask);
    await writeJsonFile(TASKS_FILE, nextTasks);
    return normalizedTask;
  }

  await ensureScheduledScanTables();
  await sql`
    INSERT INTO scheduled_scan_tasks (id, user_email, scan_type, label, query, interval_minutes, enabled, last_run_at, created_at, updated_at)
    VALUES (
      ${normalizedTask.id},
      ${normalizedTask.userEmail},
      ${normalizedTask.scanType},
      ${normalizedTask.label},
      ${normalizedTask.query},
      ${normalizedTask.intervalMinutes},
      ${normalizedTask.enabled},
      ${normalizedTask.lastRunAt},
      ${normalizedTask.createdAt},
      ${normalizedTask.updatedAt}
    )
    ON CONFLICT (id) DO UPDATE SET
      user_email = EXCLUDED.user_email,
      scan_type = EXCLUDED.scan_type,
      label = EXCLUDED.label,
      query = EXCLUDED.query,
      interval_minutes = EXCLUDED.interval_minutes,
      enabled = EXCLUDED.enabled,
      last_run_at = EXCLUDED.last_run_at,
      updated_at = EXCLUDED.updated_at
  `;

  return normalizedTask;
};

export const ensureDefaultScheduledScanTasks = async (userEmail) => {
  const normalizedUserEmail = String(userEmail || '').trim().toLowerCase();
  if (!normalizedUserEmail) return [];

  const existingTasks = (await listScheduledScanTasks()).filter((task) => task.userEmail === normalizedUserEmail);
  const now = new Date().toISOString();

  const defaults = [
    {
      id: `task-code-leak-${normalizedUserEmail}`,
      userEmail: normalizedUserEmail,
      scanType: 'code_leak',
      label: '代码泄露定时扫描',
      query: '',
      intervalMinutes: 30,
      enabled: true,
      lastRunAt: null,
      createdAt: now,
    },
    {
      id: `task-file-leak-${normalizedUserEmail}`,
      userEmail: normalizedUserEmail,
      scanType: 'file_leak',
      label: '文件泄露定时扫描',
      query: '',
      intervalMinutes: 60,
      enabled: true,
      lastRunAt: null,
      createdAt: now,
    },
  ];

  for (const task of defaults) {
    const exists = existingTasks.some(
      (item) => item.id === task.id || (item.userEmail === normalizedUserEmail && item.scanType === task.scanType)
    );

    if (!exists) {
      await upsertScheduledScanTask(task);
    }
  }

  return listScheduledScanTasks().then((tasks) => tasks.filter((task) => task.userEmail === normalizedUserEmail));
};

export const removeScheduledScanTask = async (taskId, userEmail = '') => {
  if (!sql) {
    const tasks = await readJsonFile(TASKS_FILE, []);
    const nextTasks = tasks.filter((task) => {
      if (task.id !== taskId) return true;
      if (userEmail && task.userEmail !== userEmail) return true;
      return false;
    });
    await writeJsonFile(TASKS_FILE, nextTasks);
    return nextTasks;
  }

  await ensureScheduledScanTables();

  if (userEmail) {
    await sql`
      DELETE FROM scheduled_scan_tasks
      WHERE id = ${taskId} AND user_email = ${userEmail}
    `;
  } else {
    await sql`
      DELETE FROM scheduled_scan_tasks
      WHERE id = ${taskId}
    `;
  }

  return listScheduledScanTasks();
};

export const markScheduledScanTaskRun = async (taskId, finishedAt = new Date().toISOString()) => {
  if (!sql) {
    const tasks = await readJsonFile(TASKS_FILE, []);
    const nextTasks = tasks.map((task) => (task.id === taskId ? { ...task, lastRunAt: finishedAt, updatedAt: finishedAt } : task));
    await writeJsonFile(TASKS_FILE, nextTasks);
    return;
  }

  await ensureScheduledScanTables();
  await sql`
    UPDATE scheduled_scan_tasks
    SET last_run_at = ${finishedAt}, updated_at = ${finishedAt}
    WHERE id = ${taskId}
  `;
};

export const recordScheduledScanRun = async ({
  id,
  taskId,
  userEmail,
  scanType,
  status,
  findingsCount = 0,
  errorMessage = null,
  startedAt,
  finishedAt,
}) => {
  const payload = {
    id,
    taskId,
    userEmail,
    scanType,
    status,
    findingsCount,
    errorMessage,
    startedAt,
    finishedAt,
  };

  if (!sql) {
    const runs = await readJsonFile(RUNS_FILE, []);
    runs.push(payload);
    await writeJsonFile(RUNS_FILE, runs);
    return payload;
  }

  await ensureScheduledScanTables();
  await sql`
    INSERT INTO scheduled_scan_runs (id, task_id, user_email, scan_type, status, findings_count, error_message, started_at, finished_at)
    VALUES (${id}, ${taskId}, ${userEmail}, ${scanType}, ${status}, ${findingsCount}, ${errorMessage}, ${startedAt}, ${finishedAt})
  `;

  return payload;
};

export const persistScheduledFinding = async ({ taskId, userEmail, scanType, finding }) => {
  const dedupeKey = `${finding.source}:${finding.url}:${finding.match || finding.assetLabel || finding.title}`;

  if (!sql) {
    const findings = await readJsonFile(FINDINGS_FILE, []);
    const existingIndex = findings.findIndex((item) => item.taskId === taskId && item.dedupeKey === dedupeKey);
    if (existingIndex >= 0) {
      findings[existingIndex] = {
        ...findings[existingIndex],
        findingPayload: finding,
        lastSeenAt: new Date().toISOString(),
        hitCount: Number(findings[existingIndex].hitCount || 1) + 1,
      };
      await writeJsonFile(FINDINGS_FILE, findings);
      return {
        isNew: false,
        dedupeKey,
        record: findings[existingIndex],
      };
    } else {
      const record = {
        id: `scheduled-finding-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        taskId,
        userEmail,
        scanType,
        dedupeKey,
        findingPayload: finding,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        hitCount: 1,
      };
      findings.push(record);
      await writeJsonFile(FINDINGS_FILE, findings);
      return {
        isNew: true,
        dedupeKey,
        record,
      };
    }
  }

  await ensureScheduledScanTables();
  const result = await sql`
    INSERT INTO scheduled_scan_findings (id, task_id, user_email, scan_type, dedupe_key, finding_payload)
    VALUES (
      ${`scheduled-finding-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`},
      ${taskId},
      ${userEmail},
      ${scanType},
      ${dedupeKey},
      ${JSON.stringify(finding)}
    )
    ON CONFLICT (task_id, dedupe_key) DO UPDATE SET
      finding_payload = EXCLUDED.finding_payload,
      last_seen_at = NOW(),
      hit_count = scheduled_scan_findings.hit_count + 1
    RETURNING id, task_id, user_email, scan_type, dedupe_key, finding_payload, first_seen_at, last_seen_at, hit_count, xmax = 0 AS inserted
  `;
  const row = Array.isArray(result) ? result[0] : null;
  return {
    isNew: Boolean(row?.inserted),
    dedupeKey,
    record: row || null,
  };
};
