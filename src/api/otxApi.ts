import axios from 'axios';

const BASE_URL = import.meta.env.DEV
  ? import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
  : '';
const OTX_API_BASE_URL = `${BASE_URL}/api/otx`;
const OTX_REQUEST_TIMEOUT = 45000;
const OTX_RETRY_DELAY = 1200;
const OTX_MAX_RETRIES = 2;

const otxAxios = axios.create({
  baseURL: OTX_API_BASE_URL,
  timeout: OTX_REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json'
  }
});

const ensureValidPayload = (payload: any, endpoint: string) => {
  if (typeof payload === 'string' && /<!doctype html>|<html/i.test(payload)) {
    throw new Error(`Invalid OTX response for ${endpoint}: received HTML instead of JSON`);
  }

  return payload;
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const shouldRetryOtxRequest = (error: any) => {
  const status = error?.response?.status;
  return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    error?.code === 'ECONNABORTED' ||
    error?.message?.includes('timeout') ||
    error?.message?.includes('Network Error')
  );
};

const requestOtx = async (endpoint: string, retryCount = 0): Promise<any> => {
  try {
    const response = await otxAxios.get(endpoint);
    return ensureValidPayload(response.data, endpoint);
  } catch (error: any) {
    if (retryCount < OTX_MAX_RETRIES && shouldRetryOtxRequest(error)) {
      await sleep(OTX_RETRY_DELAY * (retryCount + 1));
      return requestOtx(endpoint, retryCount + 1);
    }
    throw error;
  }
};

type OtxRequestParams = Record<string, string | number | boolean | undefined>;

const requestOtxWithParams = async (endpoint: string, params?: OtxRequestParams, retryCount = 0): Promise<any> => {
  try {
    const response = await otxAxios.get(endpoint, { params });
    return ensureValidPayload(response.data, endpoint);
  } catch (error: any) {
    if (retryCount < OTX_MAX_RETRIES && shouldRetryOtxRequest(error)) {
      await sleep(OTX_RETRY_DELAY * (retryCount + 1));
      return requestOtxWithParams(endpoint, params, retryCount + 1);
    }
    throw error;
  }
};

export const otxApi = {
  searchIntel: async (query: string, type: 'ip' | 'domain' | 'url' | 'cve', options?: { noCache?: boolean; coreOnly?: boolean }) => {
    const response = await otxAxios.get('/search', {
      params: {
        query,
        type,
        ...(options?.noCache ? { noCache: '1' } : {}),
        ...(options?.coreOnly ? { coreOnly: '1' } : {}),
      },
    });

    return ensureValidPayload(response.data, '/search');
  },

  // 1.1 IPv4/IPv6 查询
  getIpInfo: async (ip: string, section: string = 'general', isIpv6: boolean = false, params?: OtxRequestParams) => {
    const ipVersion = isIpv6 ? 'IPv6' : 'IPv4';
    const endpoint = `/indicators/${ipVersion}/${ip}/${section}`;
    
    try {
      return await requestOtxWithParams(endpoint, params);
    } catch (error: any) {
      // 忽略 404 错误（某些 section 可能不存在数据）
      if (error.response?.status === 404) {
        return {}; // 返回空对象
      }

      throw error;
    }
  },

  // 1.2 域名查询
  getDomainInfo: async (domain: string, section: string = 'general', params?: OtxRequestParams) => {
    const endpoint = `/indicators/domain/${domain}/${section}`;
    
    try {
      return await requestOtxWithParams(endpoint, params);
    } catch (error: any) {
      // 忽略 404 错误
      if (error.response?.status === 404) {
        return {}; 
      }

      throw error;
    }
  },

  // 1.2 主机名查询
  getHostnameInfo: async (hostname: string, section: string = 'general', params?: OtxRequestParams) => {
    return requestOtxWithParams(`/indicators/hostname/${hostname}/${section}`, params);
  },

  // 1.3 URL检测
  getUrlInfo: async (url: string, section: string = 'general', params?: OtxRequestParams) => {
    // 移除 URL 中的协议头 (http:// 或 https://) 和末尾的斜杠，OTX 只需要域名或路径
    let cleanUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const encodedUrl = encodeURIComponent(cleanUrl);
    // URL 必须进行两次 URL 编码，或者只编码特殊字符。OTX API 对 URL 的处理比较特殊。
    // 这里我们先尝试只进行一次编码，但要注意斜杠
    
    try {
      return await requestOtxWithParams(`/indicators/url/${encodedUrl}/${section}`, params);
    } catch (error: any) {
      // 忽略 404 错误
      if (error.response?.status === 404) {
        return {}; 
      }
      throw error;
    }
  },

  // 1.4 CVE漏洞情报
  getCveInfo: async (cveId: string, section: string = 'general', params?: OtxRequestParams) => {
    // 确保 CVE ID 格式正确 (大写)
    const formattedCveId = cveId.toUpperCase();
    try {
      return await requestOtxWithParams(`/indicators/cve/${formattedCveId}/${section}`, params);
    } catch (error: any) {
      // 忽略 404 错误（某些 section 可能不存在数据）
      if (error.response?.status === 404) {
        return {}; // 返回空对象，避免中断 Promise.all
      }
      throw error;
    }
  },

  // 2.1 实时威胁流
  getActivity: async () => {
    return requestOtx('/pulses/activity');
  },

  // 2.2 关键词搜索
  searchPulses: async (keyword: string, sort: string = '-modified') => {
    const response = await otxAxios.get('/search/pulses', {
      params: {
        q: keyword,
        sort
      }
    });
    return ensureValidPayload(response.data, '/search/pulses');
  },

  // 3.1 增量事件同步
  getEvents: async (since?: string, limit: number = 100) => {
    const params: any = { limit };
    if (since) {
      params.since = since;
    }
    const response = await otxAxios.get('/pulses/events', { params });
    return ensureValidPayload(response.data, '/pulses/events');
  },

  // 3.2 健康检查 - 验证API密钥和连接状态
  healthCheck: async () => {
    try {
      // 修正路径：添加 /IPv4 前缀
      const response = await otxAxios.get('/indicators/IPv4/8.8.8.8/general', {
        timeout: 10000 // 10秒超时
      });
      return {
        success: true,
        message: 'OTX API连接正常',
        data: ensureValidPayload(response.data, '/indicators/IPv4/8.8.8.8/general')
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'OTX API连接失败',
        error: error
      };
    }
  }
};
