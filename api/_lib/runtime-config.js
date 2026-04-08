const readEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
};

export const getNodeEnv = () => readEnv('NODE_ENV') || 'development';

export const isProductionRuntime = () => getNodeEnv() === 'production';

export const getDatabaseUrl = () => readEnv('DATABASE_URL', 'NEON_DATABASE_URL');

export const hasDatabaseConfig = () => Boolean(getDatabaseUrl());

export const getOtxApiKey = () => readEnv('OTX_API_KEY', 'VITE_OTX_API_KEY');

export const getGitHubToken = () => readEnv('GITHUB_TOKEN', 'VITE_GITHUB_TOKEN');

export const getGiteeAccessToken = () => readEnv('GITEE_ACCESS_TOKEN', 'VITE_GITEE_ACCESS_TOKEN');

export const getRuntimeConfigSnapshot = () => ({
  nodeEnv: getNodeEnv(),
  hasDatabaseConfig: hasDatabaseConfig(),
  hasOtxApiKey: Boolean(getOtxApiKey()),
  hasGitHubToken: Boolean(getGitHubToken()),
  hasGiteeAccessToken: Boolean(getGiteeAccessToken()),
});
