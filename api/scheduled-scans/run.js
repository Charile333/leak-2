import { listCodeLeakAssets } from '../_lib/code-leak-assets.js';
import { listFileLeakAssets } from '../_lib/file-leak-assets.js';
import { applyCors, sendJson } from '../_lib/http.js';
import {
  listDueScheduledScanTasks,
  listScheduledScanTasks,
  markScheduledScanTaskRun,
  persistScheduledFinding,
  recordScheduledScanRun,
} from '../_lib/scheduled-scans.js';
import { sendWebhookNotification } from '../_lib/webhook-notifications.js';
import { listCveIntelAssets } from '../_lib/cve-intel-assets.js';
import { runCodeLeakSearch } from '../code-leak/search.js';
import { runFileLeakSearch } from '../file-leak/search.js';
import { getCveFeedSnapshot } from '../otx/search.js';

const matchesCronSecret = (req) => {
  const configuredSecret = String(process.env.CRON_SECRET || '').trim();
  if (!configuredSecret) return true;

  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization.trim() : '';
  const headerSecret = typeof req.headers['x-cron-secret'] === 'string' ? req.headers['x-cron-secret'].trim() : '';

  return authHeader === `Bearer ${configuredSecret}` || headerSecret === configuredSecret;
};

const buildRunId = () => `scheduled-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const mapCveItemToFinding = (task, item) => ({
  id: `cve-intel-${item.cveId}`,
  assetLabel: task.label,
  status: 'new',
  source: 'OTX',
  exposure: 'vulnerability',
  title: item.title || item.cveId,
  repository: 'otx-pulses',
  owner: 'AlienVault OTX',
  path: item.cveId,
  match: item.cveId,
  snippet: item.summary || item.title || item.cveId,
  url: Array.isArray(item.references) && item.references[0] ? item.references[0] : '#',
  firstSeen: item.lastModified || new Date().toISOString(),
  lastSeen: item.lastModified || new Date().toISOString(),
  severity: item.pushLevel === 'high' ? 'high' : item.pushLevel === 'medium' ? 'medium' : 'low',
  confidence: item.pushRecommended ? 0.92 : 0.74,
  matchedRules: Array.isArray(item.sourceTags) ? item.sourceTags.slice(0, 8) : [],
  notes: [
    item.summary || item.title || item.cveId,
    item.pushRecommended ? 'Push recommended by CVE feed assessment.' : 'Observe in CVE feed.',
  ],
  cveId: item.cveId,
  cvssScore: item.cvssScore,
  pushLevel: item.pushLevel,
  pushRecommended: item.pushRecommended,
  references: Array.isArray(item.references) ? item.references : [],
});

const runSingleTask = async (task) => {
  const startedAt = new Date().toISOString();
  const runId = buildRunId();

  try {
    let findings = [];
    let newFindings = [];

    if (task.scanType === 'code_leak') {
      const assets = await listCodeLeakAssets(task.userEmail);
      const result = await runCodeLeakSearch({
        assets,
        query: task.query,
        userEmail: task.userEmail,
      });
      findings = result.findings;
      newFindings = findings.filter((finding) => Number(finding.hitCount || 1) === 1);
    } else if (task.scanType === 'file_leak') {
      const assets = await listFileLeakAssets(task.userEmail);
      const result = await runFileLeakSearch({
        assets,
        query: task.query,
        userEmail: task.userEmail,
      });
      findings = result.findings;
      newFindings = findings.filter((finding) => Number(finding.hitCount || 1) === 1);
    } else if (task.scanType === 'cve_intel') {
      const assets = await listCveIntelAssets(task.userEmail);
      const snapshot = await getCveFeedSnapshot({
        limit: 20,
        windowKey: task.query || '7d',
        userEmail: task.userEmail,
      });

      const sourceItems =
        Array.isArray(assets) && assets.length > 0
          ? snapshot.items
          : snapshot.items.slice(0, 20);

      const persisted = await Promise.all(
        sourceItems.map((item) =>
          persistScheduledFinding({
            taskId: task.id,
            userEmail: task.userEmail,
            scanType: 'cve_intel',
            finding: mapCveItemToFinding(task, item),
          })
        )
      );

      findings = persisted.map((entry) => ({
        ...(entry.record?.findingPayload || {}),
        id: entry.record?.id,
        status: entry.record?.triageStatus || entry.record?.triage_status || 'new',
        firstSeen: entry.record?.firstSeenAt || entry.record?.first_seen_at,
        lastSeen: entry.record?.lastSeenAt || entry.record?.last_seen_at,
        hitCount: Number(entry.record?.hitCount || entry.record?.hit_count || 1),
      }));
      newFindings = persisted
        .filter((entry) => entry.isNew)
        .map((entry) => ({
          ...(entry.record?.findingPayload || {}),
          id: entry.record?.id,
        }));
    }

    const finishedAt = new Date().toISOString();
    await markScheduledScanTaskRun(task.id, finishedAt);
    await recordScheduledScanRun({
      id: runId,
      taskId: task.id,
      userEmail: task.userEmail,
      scanType: task.scanType,
      status: 'success',
      findingsCount: findings.length,
      startedAt,
      finishedAt,
    });

    if (newFindings.length > 0) {
      await sendWebhookNotification({
        userEmail: task.userEmail,
        channel: task.scanType === 'cve_intel' ? 'cve_intel' : 'leak_monitor',
        eventName: `scheduled_scan.${task.scanType}.detected`,
        payload: {
          event: `scheduled_scan.${task.scanType}.detected`,
          taskId: task.id,
          taskLabel: task.label,
          scanType: task.scanType,
          findingsCount: findings.length,
          newFindingsCount: newFindings.length,
          detectedAt: finishedAt,
          findings: newFindings.slice(0, 5),
        },
      });
    }

    return {
      taskId: task.id,
      scanType: task.scanType,
      status: 'success',
      findingsCount: findings.length,
      newFindingsCount: newFindings.length,
      startedAt,
      finishedAt,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    await recordScheduledScanRun({
      id: runId,
      taskId: task.id,
      userEmail: task.userEmail,
      scanType: task.scanType,
      status: 'failed',
      findingsCount: 0,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      startedAt,
      finishedAt,
    });

    return {
      taskId: task.id,
      scanType: task.scanType,
      status: 'failed',
      findingsCount: 0,
      newFindingsCount: 0,
      startedAt,
      finishedAt,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { success: true });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed',
      message: 'Unsupported scheduled runner operation.',
    });
  }

  if (!matchesCronSecret(req)) {
    return sendJson(res, 401, {
      success: false,
      error: 'Unauthorized',
      message: 'Invalid cron secret.',
    });
  }

  try {
    const force = String(Array.isArray(req.query?.force) ? req.query.force[0] : req.query?.force || '').trim().toLowerCase() === '1';
    const tasks = force ? (await listScheduledScanTasks()).filter((task) => task.enabled) : await listDueScheduledScanTasks();
    const results = [];

    for (const task of tasks) {
      results.push(await runSingleTask(task));
    }

    return sendJson(res, 200, {
      success: true,
      mode: force ? 'force' : 'due',
      taskCount: tasks.length,
      successCount: results.filter((item) => item.status === 'success').length,
      failedCount: results.filter((item) => item.status === 'failed').length,
      results,
    });
  } catch (error) {
    console.error('[api/scheduled-scans/run] failed:', error);
    return sendJson(res, 500, {
      success: false,
      error: 'Scheduled scan runner failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
