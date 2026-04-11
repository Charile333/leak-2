import { promises as fs } from 'fs';
import path from 'path';
import { getSqlClient, hasDatabase, withDatabaseErrorBoundary } from './db.js';

const sql = getSqlClient();
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
  if (!hasDatabase() || tablesReady) return;

  await withDatabaseErrorBoundary(async () => {
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
        triage_status TEXT NOT NULL DEFAULT 'new',
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

    await sql`
      ALTER TABLE scheduled_scan_findings
      ADD COLUMN IF NOT EXISTS triage_status TEXT NOT NULL DEFAULT 'new'
    `;
  }, 'Failed to prepare scheduled scan tables.');

  tablesReady = true;
};

export const listScheduledScanTasks = async () => {
  if (!hasDatabase()) {
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

  if (!hasDatabase()) {
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
    {
      id: `task-cve-intel-${normalizedUserEmail}`,
      userEmail: normalizedUserEmail,
      scanType: 'cve_intel',
      label: 'CVE 婕忔礊鎯呮姤瀹氭椂鎵弿',
      query: '7d',
      intervalMinutes: 120,
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
  if (!hasDatabase()) {
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
  if (!hasDatabase()) {
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

  if (!hasDatabase()) {
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

export const listScheduledScanRuns = async ({ userEmail = '', limit = 20 } = {}) => {
  const normalizedLimit = Math.max(1, Math.min(100, Number(limit || 20)));

  if (!hasDatabase()) {
    const runs = await readJsonFile(RUNS_FILE, []);
    return runs
      .filter((run) => !userEmail || run.userEmail === userEmail)
      .sort((left, right) => new Date(right.startedAt || 0).getTime() - new Date(left.startedAt || 0).getTime())
      .slice(0, normalizedLimit);
  }

  await ensureScheduledScanTables();
  const rows = await sql`
    SELECT id, task_id, user_email, scan_type, status, findings_count, error_message, started_at, finished_at
    FROM scheduled_scan_runs
    WHERE (${userEmail || null}::TEXT IS NULL OR user_email = ${userEmail || null})
    ORDER BY started_at DESC
    LIMIT ${normalizedLimit}
  `;

  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    userEmail: row.user_email,
    scanType: row.scan_type,
    status: row.status,
    findingsCount: Number(row.findings_count || 0),
    errorMessage: row.error_message || null,
    startedAt: row.started_at,
    finishedAt: row.finished_at || null,
  }));
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
        triageStatus: finding.status || 'new',
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
    RETURNING id, task_id, user_email, scan_type, dedupe_key, finding_payload, triage_status, first_seen_at, last_seen_at, hit_count, xmax = 0 AS inserted
  `;
  const row = Array.isArray(result) ? result[0] : null;
  return {
    isNew: Boolean(row?.inserted),
    dedupeKey,
    record: row || null,
  };
};

const normalizeScheduledFindingRecord = (record) => {
  const payload = record.findingPayload || record.finding_payload || {};
  const triageStatus = record.triageStatus || record.triage_status || payload.status || 'new';
  const firstSeenAt = record.firstSeenAt || record.first_seen_at || payload.firstSeen || new Date().toISOString();
  const lastSeenAt = record.lastSeenAt || record.last_seen_at || payload.lastSeen || firstSeenAt;
  const hitCount = Number(record.hitCount || record.hit_count || 1);

  return {
    id: record.id,
    taskId: record.taskId || record.task_id,
    userEmail: record.userEmail || record.user_email,
    scanType: record.scanType || record.scan_type,
    dedupeKey: record.dedupeKey || record.dedupe_key,
    triageStatus,
    firstSeenAt,
    lastSeenAt,
    hitCount,
    finding: {
      ...payload,
      id: record.id,
      status: triageStatus,
      firstSeen: payload.firstSeen || firstSeenAt,
      lastSeen: payload.lastSeen || lastSeenAt,
      hitCount,
    },
  };
};

export const listScheduledFindings = async ({ userEmail, scanType, taskId = '', limit = 200 } = {}) => {
  if (!userEmail) return [];

  if (!hasDatabase()) {
    const findings = await readJsonFile(FINDINGS_FILE, []);
    return findings
      .filter((record) => record.userEmail === userEmail)
      .filter((record) => !scanType || record.scanType === scanType)
      .filter((record) => !taskId || record.taskId === taskId)
      .sort((left, right) => new Date(right.lastSeenAt || 0).getTime() - new Date(left.lastSeenAt || 0).getTime())
      .slice(0, limit)
      .map(normalizeScheduledFindingRecord);
  }

  await ensureScheduledScanTables();
  const rows = await sql`
    SELECT id, task_id, user_email, scan_type, dedupe_key, finding_payload, triage_status, first_seen_at, last_seen_at, hit_count
    FROM scheduled_scan_findings
    WHERE user_email = ${userEmail}
      AND (${scanType || null}::TEXT IS NULL OR scan_type = ${scanType || null})
      AND (${taskId || null}::TEXT IS NULL OR task_id = ${taskId || null})
    ORDER BY last_seen_at DESC
    LIMIT ${Math.max(1, Math.min(limit, 500))}
  `;

  return rows.map(normalizeScheduledFindingRecord);
};

export const updateScheduledFindingStatus = async ({ findingId, userEmail, status }) => {
  const nextStatus = typeof status === 'string' ? status.trim() : '';
  if (!findingId || !userEmail || !nextStatus) return null;

  if (!hasDatabase()) {
    const findings = await readJsonFile(FINDINGS_FILE, []);
    const targetIndex = findings.findIndex((record) => record.id === findingId && record.userEmail === userEmail);
    if (targetIndex < 0) return null;

    findings[targetIndex] = {
      ...findings[targetIndex],
      triageStatus: nextStatus,
      findingPayload: {
        ...(findings[targetIndex].findingPayload || {}),
        status: nextStatus,
      },
    };
    await writeJsonFile(FINDINGS_FILE, findings);
    return normalizeScheduledFindingRecord(findings[targetIndex]);
  }

  await ensureScheduledScanTables();
  const result = await sql`
    UPDATE scheduled_scan_findings
    SET triage_status = ${nextStatus},
        finding_payload = jsonb_set(finding_payload, '{status}', to_jsonb(${nextStatus}::TEXT), true)
    WHERE id = ${findingId} AND user_email = ${userEmail}
    RETURNING id, task_id, user_email, scan_type, dedupe_key, finding_payload, triage_status, first_seen_at, last_seen_at, hit_count
  `;

  const row = Array.isArray(result) ? result[0] : null;
  return row ? normalizeScheduledFindingRecord(row) : null;
};
