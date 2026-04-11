import { evaluateRepositoryAssociation } from '../_lib/leak-rules.js';
import { applyCors, readJsonBody, sendJson } from '../_lib/http.js';
import { getGitHubToken, getGiteeAccessToken } from '../_lib/runtime-config.js';
import { ensureDefaultScheduledScanTasks, persistScheduledFinding } from '../_lib/scheduled-scans.js';

const normalizeAssets = (assets = [], query = '') =>
  Array.from(
    new Map(
      [
        ...assets
          .filter((asset) => asset && asset.enabled !== false && typeof asset.value === 'string' && asset.value.trim())
          .map((asset) => [
            `${asset.type}:${asset.value.trim().toLowerCase()}`,
            { ...asset, label: asset.label || asset.value.trim(), value: asset.value.trim() },
          ]),
        ...(query && query.trim()
          ? [[`query:${query.trim().toLowerCase()}`, { id: `query-${query.trim().toLowerCase()}`, label: query.trim(), value: query.trim(), type: 'repository', enabled: true }]]
          : []),
      ]
    ).values()
  ).slice(0, 8);

const buildRepositorySearchTerms = (asset) => {
  const rawValue = String(asset?.value || '').trim().toLowerCase();
  if (!rawValue) return [];

  const terms = new Set([rawValue]);
  const sanitized = rawValue.replace(/^@/, '').replace(/^https?:\/\//, '').replace(/^www\./, '');
  if (sanitized) terms.add(sanitized);

  sanitized
    .split(/[^a-z0-9]+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3)
    .forEach((part) => terms.add(part));

  return Array.from(terms).filter(Boolean).slice(0, 4);
};

const getUserEmail = (req) =>
  typeof req.headers['x-user-email'] === 'string' ? req.headers['x-user-email'].trim().toLowerCase() : '';

const persistFindingsForUser = async (findings, userEmail) => {
  if (!userEmail) return findings;

  const tasks = await ensureDefaultScheduledScanTasks(userEmail);
  const task = tasks.find((item) => item.scanType === 'code_leak');
  if (!task) return findings;

  const persisted = await Promise.all(
    findings.map((finding) =>
      persistScheduledFinding({
        taskId: task.id,
        userEmail,
        scanType: 'code_leak',
        finding,
      })
    )
  );

  return findings.map((finding, index) => {
    const record = persisted[index]?.record;
    const firstSeen = record?.firstSeenAt || record?.first_seen_at || finding.firstSeen;
    const lastSeen = record?.lastSeenAt || record?.last_seen_at || finding.lastSeen;
    const status = record?.triageStatus || record?.triage_status || finding.status;
    const hitCount = Number(record?.hitCount || record?.hit_count || 1);

    return {
      ...finding,
      id: record?.id || finding.id,
      status,
      firstSeen,
      lastSeen,
      hitCount,
    };
  });
};

export const runCodeLeakSearch = async ({ assets = [], query = '', userEmail = '' } = {}) => {
  const normalizedAssets = normalizeAssets(Array.isArray(assets) ? assets : [], typeof query === 'string' ? query : '');
  if (normalizedAssets.length === 0) {
    return { findings: [], usedTerms: [] };
  }

  const [githubFindings, giteeFindings] = await Promise.all([
    searchGitHubRepositories(normalizedAssets),
    searchGiteeRepositories(normalizedAssets),
  ]);

  const findings = await persistFindingsForUser([...githubFindings, ...giteeFindings], userEmail);
  return {
    findings,
    usedTerms: normalizedAssets.map((asset) => asset.value),
  };
};

const searchGitHubRepositories = async (assets) => {
  const token = getGitHubToken();
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Lysir-Security-Platform/1.0',
    ...(token ? { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' } : {}),
  };

  const findings = [];
  const seen = new Set();
  for (const asset of assets) {
    for (const term of buildRepositorySearchTerms(asset)) {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(term)}&sort=updated&order=desc&per_page=3`;
      const response = await fetch(url, { headers });
      if (!response.ok) continue;
      const data = await response.json();

      for (const item of Array.isArray(data.items) ? data.items : []) {
        const association = evaluateRepositoryAssociation({
          asset,
          repository: item.name || '',
          owner: item.owner?.login || item.full_name || '',
          text: `${item.description || ''} ${item.full_name || ''}`,
          homepage: item.homepage || '',
        });
        if (!association.associated) continue;

        const key = `${item.owner?.login || 'owner'}/${item.name || 'repo'}`;
        if (seen.has(key)) continue;
        seen.add(key);

        findings.push({
          id: `github-repo-${key.replace(/[^\w-]+/g, '-')}-${asset.id}`,
          assetLabel: asset.label,
          severity: 'medium',
          status: 'new',
          source: 'GitHub',
          exposure: 'repository',
          title: `${item.name || 'repository'} related repository candidate`,
          repository: item.name || 'unknown-repository',
          owner: item.owner?.login || 'unknown-owner',
          path: 'Repository metadata',
          branch: item.default_branch || 'main',
          match: asset.value,
          snippet: item.description || item.full_name || 'Repository metadata only.',
          firstSeen: item.created_at || new Date().toISOString(),
          lastSeen: item.updated_at || item.pushed_at || new Date().toISOString(),
          url: item.html_url || '#',
          confidence: Math.min(0.88, 0.5 + association.confidenceBoost),
          matchedRules: association.matchedRules,
          notes: [
            `Repository appears related to monitored asset ${asset.type}:${asset.value}`,
            ...association.notes,
          ],
        });
      }
    }
  }

  return findings;
};

const searchGiteeRepositories = async (assets) => {
  const token = getGiteeAccessToken();
  const findings = [];
  const seen = new Set();

  for (const asset of assets) {
    for (const term of buildRepositorySearchTerms(asset)) {
      const params = new URLSearchParams({ q: term, page: '1', per_page: '3' });
      if (token) params.set('access_token', token);

      const response = await fetch(`https://gitee.com/api/v5/search/repositories?${params.toString()}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'Lysir-Security-Platform/1.0' },
      });
      if (!response.ok) continue;

      for (const item of await response.json()) {
        const association = evaluateRepositoryAssociation({
          asset,
          repository: item.name || '',
          owner: item.namespace?.name || item.owner?.login || '',
          text: `${item.description || ''} ${item.full_name || ''}`,
          homepage: item.html_url || '',
        });
        if (!association.associated) continue;

        const key = `${item.namespace?.name || item.owner?.login || 'owner'}/${item.name || 'repo'}`;
        if (seen.has(key)) continue;
        seen.add(key);

        findings.push({
          id: `gitee-repo-${key.replace(/[^\w-]+/g, '-')}-${asset.id}`,
          assetLabel: asset.label,
          severity: 'medium',
          status: 'new',
          source: 'Gitee',
          exposure: 'repository',
          title: `${item.name || 'repository'} related repository candidate`,
          repository: item.name || 'unknown-repository',
          owner: item.namespace?.name || item.owner?.login || 'unknown-owner',
          path: 'Repository metadata',
          branch: item.default_branch || 'master',
          match: asset.value,
          snippet: item.description || item.full_name || 'Repository metadata only.',
          firstSeen: item.created_at || new Date().toISOString(),
          lastSeen: item.updated_at || item.pushed_at || new Date().toISOString(),
          url: item.html_url || '#',
          confidence: Math.min(0.82, 0.44 + association.confidenceBoost),
          matchedRules: association.matchedRules,
          notes: [
            `Repository appears related to monitored asset ${asset.type}:${asset.value}`,
            ...association.notes,
          ],
        });
      }
    }
  }

  return findings;
};

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { success: true });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, {
      error: 'Method Not Allowed',
      message: 'Only POST requests are allowed for this endpoint',
    });
  }

  try {
    const body = await readJsonBody(req);
    const userEmail = getUserEmail(req);
    const { findings: responseFindings, usedTerms } = await runCodeLeakSearch({
      assets: Array.isArray(body.assets) ? body.assets : [],
      query: typeof body.query === 'string' ? body.query : '',
      userEmail,
    });

    return sendJson(res, 200, {
      success: true,
      findings: responseFindings,
      meta: {
        usedTerms,
        githubCodeEnabled: Boolean(getGitHubToken()),
      },
    });
  } catch (error) {
    console.error('[api/code-leak/search] failed:', error);
    return sendJson(res, 500, {
      success: false,
      error: 'Code leak search failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
