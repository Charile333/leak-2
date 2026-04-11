import proxyHandler from './proxy.js';

export default async function handler(req, res) {
  try {
    return await proxyHandler(req, res);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Initialization Error',
        message: error instanceof Error ? error.message : 'Unknown initialization error',
      });
    }
  }
}
