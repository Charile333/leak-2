import dotenv from 'dotenv';
import { listCodeLeakAssets } from './lib/code-leak-assets.js';
import { listFileLeakAssets } from './lib/file-leak-assets.js';
import { searchCodeLeaks, searchFileLeaks } from './lib/intel.js';
import {
  ensureScheduledScanTables,
  listDueScheduledScanTasks,
  markScheduledScanTaskRun,
  persistScheduledFinding,
  recordScheduledScanRun,
} from './lib/scheduled-scans.js';
import { ensureWebhookTables, sendWebhookNotification } from './lib/webhook-notifications.js';

dotenv.config();

const args = new Set(process.argv.slice(2));
const DAEMON_MODE = args.has('--daemon') || process.env.SCAN_DAEMON === 'true';
const POLL_INTERVAL_MS = Math.max(60 * 1000, Number(process.env.SCAN_POLL_INTERVAL_MS || 10 * 60 * 1000));

const SCAN_HANDLERS = {
  code_leak: {
    loadAssets: listCodeLeakAssets,
    runSearch: searchCodeLeaks,
  },
  file_leak: {
    loadAssets: listFileLeakAssets,
    runSearch: searchFileLeaks,
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runScheduledTask = async (task) => {
  const startedAt = new Date().toISOString();
  const runId = `scan-run-${task.id}-${Date.now()}`;
  const handler = SCAN_HANDLERS[task.scanType];

  if (!handler) {
    await recordScheduledScanRun({
      id: runId,
      taskId: task.id,
      userEmail: task.userEmail,
      scanType: task.scanType,
      status: 'failed',
      findingsCount: 0,
      errorMessage: `Unsupported scan type: ${task.scanType}`,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    return;
  }

  try {
    const assets = await handler.loadAssets(task.userEmail);
    if (!Array.isArray(assets) || assets.length === 0) {
      await recordScheduledScanRun({
        id: runId,
        taskId: task.id,
        userEmail: task.userEmail,
        scanType: task.scanType,
        status: 'skipped',
        findingsCount: 0,
        errorMessage: 'No enabled assets found for this task.',
        startedAt,
        finishedAt: new Date().toISOString(),
      });
      await markScheduledScanTaskRun(task.id);
      return;
    }

    const result = await handler.runSearch(assets, task.query || '');
    const findings = Array.isArray(result?.findings) ? result.findings : [];
    const newFindings = [];

    for (const finding of findings) {
      const persisted = await persistScheduledFinding({
        taskId: task.id,
        userEmail: task.userEmail,
        scanType: task.scanType,
        finding,
      });
      if (persisted?.isNew) {
        newFindings.push(finding);
      }
    }

    for (const finding of newFindings) {
      await sendWebhookNotification({
        userEmail: task.userEmail,
        eventName: 'scheduled_scan.new_finding',
        payload: {
          event: 'scheduled_scan.new_finding',
          task: {
            id: task.id,
            label: task.label,
            scanType: task.scanType,
            intervalMinutes: task.intervalMinutes,
          },
          finding,
          detectedAt: new Date().toISOString(),
        },
      });
    }

    await recordScheduledScanRun({
      id: runId,
      taskId: task.id,
      userEmail: task.userEmail,
      scanType: task.scanType,
      status: 'success',
      findingsCount: findings.length,
      errorMessage: null,
      startedAt,
      finishedAt: new Date().toISOString(),
    });

    await markScheduledScanTaskRun(task.id);
    console.log(`[scanner-worker] ${task.scanType} task "${task.label}" completed with ${findings.length} findings`);
  } catch (error) {
    await recordScheduledScanRun({
      id: runId,
      taskId: task.id,
      userEmail: task.userEmail,
      scanType: task.scanType,
      status: 'failed',
      findingsCount: 0,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    console.error(`[scanner-worker] Task ${task.id} failed:`, error);
  }
};

const runScheduledPass = async () => {
  await ensureScheduledScanTables();
  await ensureWebhookTables();
  const dueTasks = await listDueScheduledScanTasks();

  if (dueTasks.length === 0) {
    console.log('[scanner-worker] No scheduled tasks are due right now.');
    return;
  }

  console.log(`[scanner-worker] Running ${dueTasks.length} scheduled task(s)...`);

  for (const task of dueTasks) {
    // Keep task execution serial for MVP simplicity and easier rate-limit control.
    await runScheduledTask(task);
  }

  console.log('[scanner-worker] Scheduled scan pass finished.');
};

const main = async () => {
  if (!DAEMON_MODE) {
    await runScheduledPass();
    return;
  }

  console.log(`[scanner-worker] Daemon mode started. Polling every ${Math.round(POLL_INTERVAL_MS / 1000)} seconds.`);

  // Keep the worker alive under pm2 and scan at a fixed cadence.
  for (;;) {
    try {
      await runScheduledPass();
    } catch (error) {
      console.error('[scanner-worker] Scheduled pass failed:', error);
    }

    await sleep(POLL_INTERVAL_MS);
  }
};

main().catch((error) => {
  console.error('[scanner-worker] Fatal error:', error);
  process.exitCode = 1;
});
