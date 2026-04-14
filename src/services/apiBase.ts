const normalizeBaseUrl = (value?: string) => {
  if (!value) return '';
  return value.trim().replace(/\/+$/, '');
};

export const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);

export const buildApiUrl = (path: string) => {
  if (!path) return API_BASE_URL;
  if (/^https?:\/\//i.test(path)) return path;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
};

const isNetworkFetchError = (message: string) => /Failed to fetch|NetworkError|Load failed/i.test(message);

export const getApiConfigurationIssue = () => {
  if (!API_BASE_URL && !import.meta.env.DEV) {
    return '未配置 VITE_API_BASE_URL，生产环境无法连接后端 API。';
  }

  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && API_BASE_URL.startsWith('http://')) {
    return `当前站点使用 HTTPS，但 API 地址 ${API_BASE_URL} 使用 HTTP，浏览器会拦截该请求。请将后端改为 HTTPS 地址后再配置到 VITE_API_BASE_URL。`;
  }

  return null;
};

export const getFetchErrorMessage = (error: unknown, fallback: string) => {
  const configurationIssue = getApiConfigurationIssue();
  if (configurationIssue) {
    return configurationIssue;
  }

  if (error instanceof Error && isNetworkFetchError(error.message)) {
    if (API_BASE_URL) {
      return `无法连接到后端 API：${API_BASE_URL}。请检查后端服务是否在线、CORS 是否放行当前前端域名，以及 API 是否提供 HTTPS。`;
    }

    return fallback;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
};
