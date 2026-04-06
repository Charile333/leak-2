export const CODE_LEAK_RULES_V1 = [
  {
    id: 'secret-generic-key',
    name: '通用密钥模式',
    category: 'secret_patterns',
    severity: 'critical',
    exposure: 'secret',
    keywords: ['token', 'secret', 'api_key', 'access_key'],
    regex: /(api[_-]?key|secret|token|access[_-]?key|private[_-]?key|client[_-]?secret)/i,
  },
  {
    id: 'credential-connection-string',
    name: '数据库与凭据连接串',
    category: 'credential_patterns',
    severity: 'critical',
    exposure: 'credential',
    keywords: ['jdbc', 'postgres', 'mysql', 'redis'],
    regex: /(jdbc:|postgres:\/\/|mysql:\/\/|redis:\/\/|password|passwd|credential)/i,
  },
  {
    id: 'internal-infrastructure',
    name: '内部基础设施标识',
    category: 'internal_hosts',
    severity: 'high',
    exposure: 'source',
    keywords: ['internal', 'admin', 'prod', 'production'],
    regex: /(internal|admin|prod|production|intranet|corp|vpn|staging)/i,
  },
  {
    id: 'config-sensitive-file',
    name: '敏感配置文件',
    category: 'infra_files',
    severity: 'medium',
    exposure: 'config',
    keywords: ['env', 'config', 'yaml', 'properties'],
    regex: /(\.env|config|tfvars|yaml|yml|ini|properties|docker-compose)/i,
  },
  {
    id: 'repository-exposure',
    name: '仓库镜像与备份痕迹',
    category: 'repository_context',
    severity: 'medium',
    exposure: 'repository',
    keywords: ['repo', 'mirror', 'backup', 'fork'],
    regex: /(mirror|repo|repository|backup|fork|dump)/i,
  },
];

export const FILE_LEAK_RULES_V1 = [
  {
    id: 'file-database-backup',
    name: '数据库与备份文件',
    category: 'document_keywords',
    severity: 'critical',
    sensitivity: 'critical',
    extensions: ['sql', 'bak', 'zip'],
    regex: /(\.sql|\.bak|backup|dump|database)/i,
  },
  {
    id: 'file-sensitive-sheet',
    name: '高敏感表格文件',
    category: 'document_keywords',
    severity: 'high',
    sensitivity: 'high',
    extensions: ['xlsx', 'csv'],
    regex: /(employee|credential|payroll|customer|invoice|finance)/i,
  },
  {
    id: 'file-confidential-document',
    name: '涉密文档候选',
    category: 'document_keywords',
    severity: 'high',
    sensitivity: 'high',
    extensions: ['pdf', 'docx'],
    regex: /(contract|confidential|nda|proposal|报价|合同|财务)/i,
  },
  {
    id: 'file-general-document',
    name: '一般业务文档',
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
    notes: matchedRules.map((rule) => `命中规则: ${rule.name}`),
    confidenceBoost: Math.min(0.28, matchedRules.length * 0.06),
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

  return {
    matchedRules: matchedRules.map((rule) => rule.id),
    severity: maxByRank(matchedRules.map((rule) => rule.severity), rankSeverity, normalizedExtension === 'sql' ? 'critical' : 'medium'),
    sensitivity: maxByRank(matchedRules.map((rule) => rule.sensitivity), rankSensitivity, normalizedExtension === 'sql' ? 'critical' : 'medium'),
    notes: matchedRules.map((rule) => `命中规则: ${rule.name}`),
    confidenceBoost: Math.min(0.24, matchedRules.length * 0.05),
  };
};
