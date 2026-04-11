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
