import https from 'https';
import http from 'http';

export default async function handler(req, res) {
  console.log('[Proxy Handler] Received request:', req.method, req.url);
  
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-API-Key'
  );

  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true, message: 'OPTIONS request handled' });
  }

  try {
    // 从环境变量获取API密钥和URL
    const LEAKRADAR_API_KEY = process.env.LEAKRADAR_API_KEY || process.env.VITE_LEAKRADAR_API_KEY;
    const OTX_API_KEY = process.env.OTX_API_KEY || process.env.VITE_OTX_API_KEY;
    const TRENDRADAR_API_URL = process.env.TRENDRADAR_API_URL;

    let targetUrl = '';
    let upstreamHeaders = {
      ...req.headers,
      'Origin': '',
      'Referer': ''
    };

    // 路由分发逻辑
    if (req.url.startsWith('/api/otx')) {
      // 1. OTX API 代理
      const upstreamUrl = 'https://otx.alienvault.com/api/v1';
      targetUrl = `${upstreamUrl}${req.url.replace(/^\/api\/otx/, '')}`;
      upstreamHeaders['X-OTX-API-KEY'] = OTX_API_KEY;
      upstreamHeaders['Host'] = new URL(upstreamUrl).hostname;
    } else if (req.url.startsWith('/api/opinion')) {
      // 2. TrendRadar API 代理 (舆情分析)
      if (!TRENDRADAR_API_URL) {
        throw new Error('TrendRadar API URL not configured');
      }
      const upstreamUrl = TRENDRADAR_API_URL.replace(/\/$/, '');
      targetUrl = `${upstreamUrl}${req.url.replace(/^\/api\/opinion/, '')}`;
      upstreamHeaders['Host'] = new URL(upstreamUrl).hostname;
    } else {
      // 3. LeakRadar API 代理 (默认)
      const API_BASE_URL = 'https://api.leakradar.io';
      const apiPath = req.url.replace(/^\/api/, '');
      targetUrl = `${API_BASE_URL}${apiPath}`;
      
      upstreamHeaders['X-API-Key'] = LEAKRADAR_API_KEY;
      upstreamHeaders['Authorization'] = LEAKRADAR_API_KEY ? `Bearer ${LEAKRADAR_API_KEY}` : '';
      upstreamHeaders['Host'] = new URL(API_BASE_URL).hostname;
    }
    
    console.log('[Proxy Handler] Proxying to:', targetUrl);
    
    // 构建请求选项
    const parsedUrl = new URL(targetUrl);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: req.method,
      headers: upstreamHeaders
    };
    
    // 移除content-length头，让Node.js自动计算
    delete options.headers['content-length'];
    
    console.log('[Proxy Handler] Request Options:', {
      hostname: options.hostname,
      port: options.port,
      path: options.path,
      method: options.method,
      headers: {
        ...options.headers,
        // 隐藏API密钥
        'X-API-Key': LEAKRADAR_API_KEY ? '***REDACTED***' : '',
        'Authorization': LEAKRADAR_API_KEY ? 'Bearer ***REDACTED***' : '',
        'X-OTX-API-KEY': OTX_API_KEY ? '***REDACTED***' : ''
      }
    });
    
    // 选择HTTP或HTTPS模块
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    
    // 发送请求到上游API
    const proxyReq = protocol.request(options, (proxyRes) => {
      console.log('[Proxy Handler] Upstream response status:', proxyRes.statusCode);
      
      // 复制上游响应头到客户端
      Object.keys(proxyRes.headers).forEach(key => {
        res.setHeader(key, proxyRes.headers[key]);
      });
      
      // 添加CORS头，确保所有响应都能被前端访问
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      
      // 设置响应状态码
      res.writeHead(proxyRes.statusCode);
      
      // 转发响应数据
      proxyRes.pipe(res, { end: true });
    });
    
    // 处理代理请求错误
    proxyReq.on('error', (err) => {
      console.error('[Proxy Handler] Proxy request error:', err.message);
      res.status(500).json({
        error: 'Proxy Error',
        message: '无法连接到上游服务器',
        details: err.message
      });
    });
    
    // 转发请求体到上游API
    if (req.body) {
      proxyReq.write(JSON.stringify(req.body));
    }
    
    // 结束代理请求
    proxyReq.end();
    
  } catch (e) {
    console.error('[Proxy Handler] Error:', e.message, e.stack);
    res.status(500).json({
      error: 'Internal Error',
      message: '代理服务器内部错误',
      details: e.message
    });
  }
}