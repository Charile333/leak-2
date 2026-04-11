import http from 'http';
import https from 'https';

const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-API-Key'
  );
};

const buildUpstreamTarget = (reqUrl, env) => {
  const leakRadarApiKey = env.LEAKRADAR_API_KEY || env.VITE_LEAKRADAR_API_KEY || '';
  const otxApiKey = env.OTX_API_KEY || env.VITE_OTX_API_KEY || '';
  const trendRadarApiUrl = env.TRENDRADAR_API_URL || '';

  if (reqUrl.startsWith('/api/otx')) {
    const upstreamBaseUrl = 'https://otx.alienvault.com/api/v1';
    return {
      targetUrl: `${upstreamBaseUrl}${reqUrl.replace(/^\/api\/otx/, '')}`,
      extraHeaders: {
        'X-OTX-API-KEY': otxApiKey,
      },
    };
  }

  if (reqUrl.startsWith('/api/opinion')) {
    if (!trendRadarApiUrl) {
      throw new Error('TrendRadar API URL is not configured.');
    }

    const upstreamBaseUrl = trendRadarApiUrl.replace(/\/+$/, '');
    return {
      targetUrl: `${upstreamBaseUrl}${reqUrl.replace(/^\/api\/opinion/, '')}`,
      extraHeaders: {},
    };
  }

  const upstreamBaseUrl = 'https://api.leakradar.io';
  return {
    targetUrl: `${upstreamBaseUrl}${reqUrl.replace(/^\/api/, '')}`,
    extraHeaders: {
      'X-API-Key': leakRadarApiKey,
      Authorization: leakRadarApiKey ? `Bearer ${leakRadarApiKey}` : '',
    },
  };
};

const createRequestBody = (body) => {
  if (body == null) return null;
  if (typeof body === 'string' || Buffer.isBuffer(body)) return body;
  return JSON.stringify(body);
};

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  try {
    const requestUrl = req.url || req.originalUrl || '';
    const { targetUrl, extraHeaders } = buildUpstreamTarget(requestUrl, process.env);
    const parsedUrl = new URL(targetUrl);
    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const upstreamHeaders = {
      ...req.headers,
      ...extraHeaders,
      host: parsedUrl.hostname,
      origin: '',
      referer: '',
    };

    delete upstreamHeaders['content-length'];

    const body = createRequestBody(req.body);

    const proxyReq = transport.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: req.method,
        headers: upstreamHeaders,
      },
      (proxyRes) => {
        Object.entries(proxyRes.headers).forEach(([key, value]) => {
          if (typeof value !== 'undefined') {
            res.setHeader(key, value);
          }
        });

        setCorsHeaders(res);
        res.writeHead(proxyRes.statusCode || 502);
        proxyRes.pipe(res, { end: true });
      }
    );

    proxyReq.on('error', (error) => {
      if (!res.headersSent) {
        res.status(502).json({
          success: false,
          error: 'Proxy Error',
          message: error.message,
        });
      }
    });

    if (body) {
      proxyReq.write(body);
    }

    proxyReq.end();
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Internal Error',
        message: error instanceof Error ? error.message : 'Unknown proxy error',
      });
    }
  }
}
