export const CODE_LEAK_RULES_V1 = [
  {
    id: 'secret-generic-key',
    name: 'Generic secret keyword',
    category: 'secret_patterns',
    severity: 'critical',
    exposure: 'secret',
    keywords: ['token', 'secret', 'api_key', 'access_key'],
    regex: /(api[_-]?key|secret|token|access[_-]?key|private[_-]?key|client[_-]?secret)/i,
  },
  {
    id: 'credential-connection-string',
    name: 'Credential connection string',
    category: 'credential_patterns',
    severity: 'critical',
    exposure: 'credential',
    keywords: ['jdbc', 'postgres', 'mysql', 'redis'],
    regex: /(jdbc:|postgres:\/\/|mysql:\/\/|redis:\/\/|password|passwd|credential)/i,
  },
  {
    id: 'internal-infrastructure',
    name: 'Internal infrastructure marker',
    category: 'internal_hosts',
    severity: 'high',
    exposure: 'source',
    keywords: ['internal', 'admin', 'prod', 'production'],
    regex: /(internal|admin|prod|production|intranet|corp|vpn|staging)/i,
  },
  {
    id: 'config-sensitive-file',
    name: 'Sensitive config file',
    category: 'infra_files',
    severity: 'medium',
    exposure: 'config',
    keywords: ['env', 'config', 'yaml', 'properties'],
    regex: /(\.env|config|tfvars|yaml|yml|ini|properties|docker-compose)/i,
  },
  {
    id: 'repository-exposure',
    name: 'Repository exposure context',
    category: 'repository_context',
    severity: 'medium',
    exposure: 'repository',
    keywords: ['repo', 'mirror', 'backup', 'fork'],
    regex: /(mirror|repo|repository|backup|fork|dump)/i,
  },
];

export const CODE_REPOSITORY_ASSOCIATION_RULES_V1 = [
  {
    id: 'repo-owned-domain',
    assetTypes: ['domain', 'email_suffix'],
    severity: 'high',
    regex: /([a-z0-9-]+\.)+[a-z]{2,}/i,
  },
  {
    id: 'repo-company-keyword',
    assetTypes: ['company', 'repository'],
    severity: 'medium',
    regex: /[a-z0-9._-]{3,}/i,
  },
  {
    id: 'repo-owner-match',
    assetTypes: ['company', 'repository', 'domain'],
    severity: 'high',
    regex: /[a-z0-9._-]{2,}/i,
  },
];

export const CODE_SENSITIVE_SEARCH_PATTERNS_V1 = [
  {
    id: 'code-sensitive-env-file',
    label: '.env file',
    query: 'filename:.env',
    exposure: 'config',
    severity: 'critical',
  },
  {
    id: 'code-sensitive-config-file',
    label: 'runtime config',
    query: 'filename:application.properties OR filename:config.yml OR filename:docker-compose.yml',
    exposure: 'config',
    severity: 'high',
  },
  {
    id: 'code-sensitive-secret-keyword',
    label: 'secret keyword',
    query: 'secret OR token OR api_key OR access_key OR client_secret',
    exposure: 'secret',
    severity: 'critical',
  },
  {
    id: 'code-sensitive-password-keyword',
    label: 'credential keyword',
    query: 'password OR passwd OR jdbc: OR private_key',
    exposure: 'credential',
    severity: 'critical',
  },
];

export const FILE_LEAK_RULES_V1 = [
  {
    id: 'file-database-backup',
    name: 'Database backup artifact',
    category: 'document_keywords',
    severity: 'critical',
    sensitivity: 'critical',
    extensions: ['sql', 'bak', 'zip'],
    regex: /(\.sql|\.bak|backup|dump|database)/i,
  },
  {
    id: 'file-sensitive-sheet',
    name: 'Sensitive spreadsheet content',
    category: 'document_keywords',
    severity: 'high',
    sensitivity: 'high',
    extensions: ['xlsx', 'csv'],
    regex: /(employee|credential|payroll|customer|invoice|finance)/i,
  },
  {
    id: 'file-confidential-document',
    name: 'Confidential document',
    category: 'document_keywords',
    severity: 'high',
    sensitivity: 'high',
    extensions: ['pdf', 'docx'],
    regex: /(contract|confidential|nda|proposal|internal|private|restricted)/i,
  },
  {
    id: 'file-general-document',
    name: 'General business document',
    category: 'document_keywords',
    severity: 'medium',
    sensitivity: 'medium',
    extensions: ['pdf', 'docx', 'xlsx', 'csv'],
    regex: /(report|document|plan|spec|design|manual)/i,
  },
];

const rankSeverity = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const rankSensitivity = {
  medium: 1,
  high: 2,
  critical: 3,
};

const FILE_LEAK_STRONG_SIGNALS = /(backup|dump|restore|database|db[_-]?backup|credential|password|passwd|secret|token|customer|employee|payroll|salary|invoice|finance|contract|confidential|nda|private|internal|prod|production|insert\s+into|create\s+table|grant\s+all|users?\b|accounts?\b)/i;
const FILE_LEAK_FALSE_POSITIVE_HINTS = /(seed|fixture|example|sample|demo|mock|brand(s)?|testdata|test-data|public[\s_-]?suffix)/i;

const maxByRank = (values, rankMap, fallback) => {
  if (!Array.isArray(values) || values.length === 0) return fallback;
  return values.reduce((best, current) => (rankMap[current] > rankMap[best] ? current : best), fallback);
};

const countKeywordMatches = (keywords, haystack) => {
  if (!Array.isArray(keywords) || keywords.length === 0) return 0;
  return keywords.filter((keyword) => haystack.includes(String(keyword).toLowerCase())).length;
};

export const evaluateCodeLeak = ({ term = '', text = '', path = '' }) => {
  const haystack = `${term} ${path} ${text}`.toLowerCase();
  const matchedRules = CODE_LEAK_RULES_V1.filter((rule) => {
    const keywordMatched = countKeywordMatches(rule.keywords, haystack) > 0;
    const regexMatched = rule.regex.test(haystack);
    return keywordMatched || regexMatched;
  });

  return {
    matchedRules: matchedRules.map((rule) => rule.id),
    severity: maxByRank(matchedRules.map((rule) => rule.severity), rankSeverity, 'low'),
    exposure: matchedRules[0]?.exposure || 'source',
    notes: matchedRules.map((rule) => `Matched code leak rule: ${rule.name}`),
    confidenceBoost: Math.min(0.28, matchedRules.length * 0.06),
  };
};

const normalizeAssociationNeedle = (asset = {}) => {
  const rawValue = String(asset.value || '').trim().toLowerCase();
  if (!rawValue) return [];

  const variants = new Set([rawValue]);
  const sanitized = rawValue.replace(/^@/, '').replace(/^https?:\/\//, '').replace(/^www\./, '');
  if (sanitized) variants.add(sanitized);

  if (asset.type === 'domain' || asset.type === 'email_suffix') {
    const domain = sanitized.replace(/^@/, '');
    variants.add(domain);
    const host = domain.split('/')[0];
    if (host) {
      variants.add(host);
      const hostWithoutSubdomain = host.split('.').slice(-2).join('.');
      if (hostWithoutSubdomain) variants.add(hostWithoutSubdomain);
      const orgToken = host.split('.')[0];
      if (orgToken && orgToken.length >= 3) variants.add(orgToken);
    }
  }

  if (asset.type === 'company' || asset.type === 'repository') {
    sanitized
      .split(/[^a-z0-9]+/i)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3)
      .forEach((part) => variants.add(part));
  }

  return Array.from(variants).filter(Boolean);
};

export const evaluateRepositoryAssociation = ({
  asset = {},
  repository = '',
  owner = '',
  text = '',
  homepage = '',
}) => {
  const haystack = `${repository} ${owner} ${text} ${homepage}`.toLowerCase();
  const needles = normalizeAssociationNeedle(asset);
  const matchedNeedles = needles.filter((needle) => haystack.includes(needle));

  const matchedRules = CODE_REPOSITORY_ASSOCIATION_RULES_V1.filter((rule) => {
    if (Array.isArray(rule.assetTypes) && rule.assetTypes.length > 0 && !rule.assetTypes.includes(asset.type)) {
      return false;
    }
    return matchedNeedles.some((needle) => rule.regex.test(needle));
  });

  const ownerMatched = matchedNeedles.some((needle) => owner.toLowerCase().includes(needle));
  const repositoryMatched = matchedNeedles.some((needle) => repository.toLowerCase().includes(needle));
  const homepageMatched = matchedNeedles.some((needle) => homepage.toLowerCase().includes(needle));

  let score = matchedNeedles.length * 10 + matchedRules.length * 12;
  if (ownerMatched) score += 16;
  if (repositoryMatched) score += 12;
  if (homepageMatched) score += 14;

  return {
    associated: score >= 24,
    score,
    matchedNeedles,
    matchedRules: matchedRules.map((rule) => rule.id),
    notes: matchedNeedles.map((needle) => `Repository association matched: ${needle}`),
    confidenceBoost: Math.min(0.24, score / 100),
  };
};

export const evaluateFileLeak = ({ term = '', text = '', path = '', extension = '' }) => {
  const normalizedExtension = String(extension || '').replace(/^\./, '').toLowerCase();
  const haystack = `${term} ${path} ${text}`.toLowerCase();
  const matchedRules = FILE_LEAK_RULES_V1.filter((rule) => {
    const extensionMatched = !rule.extensions || rule.extensions.includes(normalizedExtension);
    const regexMatched = rule.regex.test(haystack) || rule.regex.test(normalizedExtension);
    return extensionMatched && regexMatched;
  });

  const requiresStrongEvidence = ['sql', 'bak', 'zip'].includes(normalizedExtension);
  const strongSignalMatched = FILE_LEAK_STRONG_SIGNALS.test(haystack);
  const falsePositiveHintMatched = FILE_LEAK_FALSE_POSITIVE_HINTS.test(haystack);
  const eligible = matchedRules.length > 0
    && (!requiresStrongEvidence || strongSignalMatched)
    && !(falsePositiveHintMatched && !strongSignalMatched);

  const fallbackSeverity = requiresStrongEvidence
    ? (strongSignalMatched ? 'critical' : 'low')
    : 'medium';
  const fallbackSensitivity = requiresStrongEvidence
    ? (strongSignalMatched ? 'critical' : 'medium')
    : 'medium';

  return {
    matchedRules: matchedRules.map((rule) => rule.id),
    severity: maxByRank(matchedRules.map((rule) => rule.severity), rankSeverity, fallbackSeverity),
    sensitivity: maxByRank(matchedRules.map((rule) => rule.sensitivity), rankSensitivity, fallbackSensitivity),
    notes: matchedRules.map((rule) => `Matched file leak rule: ${rule.name}`),
    confidenceBoost: Math.min(0.24, matchedRules.length * 0.05),
    eligible,
    falsePositiveHintMatched,
    strongSignalMatched,
  };
};
