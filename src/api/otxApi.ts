import axios from 'axios';

const OTX_API_BASE_URL = '/api/otx'; 

const otxAxios = axios.create({
  baseURL: OTX_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-OTX-API-KEY': import.meta.env.VITE_OTX_API_KEY || ''
  }
});

export const otxApi = {
  // 1.1 IPv4/IPv6 查询
  getIpInfo: async (ip: string, section: string = 'general', isIpv6: boolean = false) => {
    const ipVersion = isIpv6 ? 'IPv6' : 'IPv4';
    const endpoint = `/indicators/${ipVersion}/${ip}/${section}`;
    
    try {
      const response = await otxAxios.get(endpoint);
      
      return response.data;
    } catch (error: any) {
      // 忽略 404 错误（某些 section 可能不存在数据）
      if (error.response?.status === 404) {
        return {}; // 返回空对象
      }

      throw error;
    }
  },

  // 1.2 域名查询
  getDomainInfo: async (domain: string, section: string = 'general') => {
    const endpoint = `/indicators/domain/${domain}/${section}`;
    
    try {
      const response = await otxAxios.get(endpoint);
      
      return response.data;
    } catch (error: any) {
      // 忽略 404 错误
      if (error.response?.status === 404) {
        return {}; 
      }

      throw error;
    }
  },

  // 1.2 主机名查询
  getHostnameInfo: async (hostname: string, section: string = 'general') => {
    const response = await otxAxios.get(`/indicators/hostname/${hostname}/${section}`);
    return response.data;
  },

  // 1.3 URL检测
  getUrlInfo: async (url: string, section: string = 'general') => {
    // 移除 URL 中的协议头 (http:// 或 https://) 和末尾的斜杠，OTX 只需要域名或路径
    let cleanUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    // URL 必须进行两次 URL 编码，或者只编码特殊字符。OTX API 对 URL 的处理比较特殊。
    // 这里我们先尝试只进行一次编码，但要注意斜杠
    
    try {
      const response = await otxAxios.get(`/indicators/url/${cleanUrl}/${section}`);
      return response.data;
    } catch (error: any) {
      // 忽略 404 错误
      if (error.response?.status === 404) {
        return {}; 
      }
      throw error;
    }
  },

  // 1.4 CVE漏洞情报
  getCveInfo: async (cveId: string, section: string = 'general') => {
    // 确保 CVE ID 格式正确 (大写)
    const formattedCveId = cveId.toUpperCase();
    try {
      const response = await otxAxios.get(`/indicators/cve/${formattedCveId}/${section}`);
      return response.data;
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
    const response = await otxAxios.get('/pulses/activity');
    return response.data;
  },

  // 2.2 关键词搜索
  searchPulses: async (keyword: string, sort: string = '-modified') => {
    const response = await otxAxios.get('/search/pulses', {
      params: {
        q: keyword,
        sort
      }
    });
    return response.data;
  },

  // 3.1 增量事件同步
  getEvents: async (since?: string, limit: number = 100) => {
    const params: any = { limit };
    if (since) {
      params.since = since;
    }
    const response = await otxAxios.get('/pulses/events', { params });
    return response.data;
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
        data: response.data
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
