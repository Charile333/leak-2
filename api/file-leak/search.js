import { evaluateFileLeak } from '../_lib/leak-rules.js';
import { applyCors, readJsonBody, sendJson } from '../_lib/http.js';
import { getGitHubToken, getGiteeAccessToken } from '../_lib/runtime-config.js';

const FILE_LEAK_TYPES = [
  { extension: 'pdf', kind: 'document' },
  { extension: 'docx', kind: 'document' },
  { extension: 'xlsx', kind: 'spreadsheet' },
  { extension: 'csv', kind: 'dataset' },
  { extension: 'zip', kind: 'archive' },
  { extension: 'sql', kind: 'database' },
  { extension: 'bak', kind: 'backup' },
];

const normalizeTerms = (assets = [], query = '') =>
  Array.from(
    new Set([
      ...(query ? [query.trim()] : []),
      ...assets
        .filter((asset) => asset && asset.enabled !== false && typeof asset.value === 'string')
        .map((asset) => asset.value.trim())
        .filter(Boolean),
    ])
  ).slice(0, 6);

const searchGitHubFiles = async (terms) => {
  const token = getGitHubToken();
  if (!token) return [];

  const headers = {
    Accept: 'application/vnd.github.text-match+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'Lysir-Security-Platform/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const findings = [];
  for (const term of terms) {
    for (const fileType of FILE_LEAK_TYPES) {
      const url = `https://api.github.com/search/code?q=${encodeURIComponent(`${term} extension:${fileType.extension}`)}&per_page=2`;
      const response = await fetch(url, { headers });
      if (!response.ok) continue;
      const data = await response.json();

      for (const item of Array.isArray(data.items) ? data.items : []) {
        const textMatch = Array.isArray(item.text_matches) && item.text_matches.length > 0
          ? item.text_matches[0].fragment
          : `${item.repository?.full_name || ''} ${item.path || ''}`.trim();
        const ruleResult = evaluateFileLeak({
          term,
          text: textMatch,
          path: item.path || '',
          extension: fileType.extension,
        });
        if (!ruleResult.eligible) continue;

        findings.push({
          id: `github-file-${item.sha || item.url}-${term}-${fileType.extension}`,
          assetLabel: term,
          severity: ruleResult.severity,
          status: 'new',
          source: 'GitHub',
          exposure: fileType.kind,
          title: `${term} related public file candidate`,
          repository: item.repository?.name || 'unknown-repository',
          owner: item.repository?.owner?.login || 'unknown-owner',
          path: item.path || 'Unknown path',
          match: term,
          snippet: textMatch || 'No text match fragment returned.',
          url: item.html_url || item.repository?.html_url || '#',
          fileType: fileType.extension.toUpperCase(),
          sensitivity: ruleResult.sensitivity,
          channel: 'public-repository',
          sourceSite: item.repository?.html_url || item.html_url || '',
          firstSeen: item.repository?.created_at || new Date().toISOString(),
          lastSeen: item.repository?.updated_at || new Date().toISOString(),
          confidence: Math.min(0.96, (fileType.extension === 'sql' || fileType.extension === 'bak' ? 0.88 : 0.76) + ruleResult.confidenceBoost),
          matchedRules: ruleResult.matchedRules,
          notes: ruleResult.notes,
        });
      }
    }
  }

  return findings;
};

const searchGiteeRepositories = async (terms) => {
  const token = getGiteeAccessToken();
  const findings = [];

  for (const term of terms) {
    for (const fileType of FILE_LEAK_TYPES.slice(0, 4)) {
      const params = new URLSearchParams({ q: `${term} ${fileType.extension}`, page: '1', per_page: '2' });
      if (token) params.set('access_token', token);

      const response = await fetch(`https://gitee.com/api/v5/search/repositories?${params.toString()}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'Lysir-Security-Platform/1.0' },
      });
      if (!response.ok) continue;

      for (const item of await response.json()) {
        const ruleResult = evaluateFileLeak({
          term,
          text: item.description || item.full_name || '',
          path: item.full_name || '',
          extension: fileType.extension,
        });
        if (!ruleResult.eligible) continue;

        findings.push({
          id: `gitee-file-${item.id}-${term}-${fileType.extension}`,
          assetLabel: term,
          severity: ruleResult.severity,
          status: 'new',
          source: 'Gitee',
          exposure: fileType.kind,
          title: `${term} related repository candidate`,
          repository: item.name || 'unknown-repository',
          owner: item.namespace?.name || item.owner?.login || 'unknown-owner',
          path: `Repository metadata (.${fileType.extension})`,
          match: term,
          snippet: item.description || item.full_name || 'Repository metadata only.',
          url: item.html_url || '#',
          fileType: fileType.extension.toUpperCase(),
          sensitivity: ruleResult.sensitivity,
          channel: 'repository-metadata',
          sourceSite: item.html_url || '',
          firstSeen: item.created_at || new Date().toISOString(),
          lastSeen: item.updated_at || item.pushed_at || new Date().toISOString(),
          confidence: Math.min(0.88, 0.48 + ruleResult.confidenceBoost),
          matchedRules: ruleResult.matchedRules,
          notes: ruleResult.notes,
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
    const terms = normalizeTerms(Array.isArray(body.assets) ? body.assets : [], typeof body.query === 'string' ? body.query : '');
    if (terms.length === 0) {
      return sendJson(res, 200, { success: true, findings: [], meta: { usedTerms: [] } });
    }

    const [githubFindings, giteeFindings] = await Promise.all([
      searchGitHubFiles(terms),
      searchGiteeRepositories(terms),
    ]);

    return sendJson(res, 200, {
      success: true,
      findings: [...githubFindings, ...giteeFindings],
      meta: {
        usedTerms: terms,
        githubCodeEnabled: Boolean(getGitHubToken()),
      },
    });
  } catch (error) {
    console.error('[api/file-leak/search] failed:', error);
    return sendJson(res, 500, {
      success: false,
      error: 'File leak search failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
