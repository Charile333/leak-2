import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';

import proxyHandler from './api/proxy.js';
import loginHandler from './api/auth/login.js';
import whitelistHandler from './api/auth/whitelist.js';
import codeLeakAssetsHandler from './api/code-leak/assets.js';
import codeLeakFindingsHandler from './api/code-leak/findings.js';
import codeLeakSearchHandler from './api/code-leak/search.js';
import cveIntelAssetsHandler from './api/cve-intel/assets.js';
import fileLeakAssetsHandler from './api/file-leak/assets.js';
import fileLeakFindingsHandler from './api/file-leak/findings.js';
import fileLeakSearchHandler from './api/file-leak/search.js';
import webhookHandler from './api/notifications/webhook.js';
import otxSearchHandler from './api/otx/search.js';
import scheduledScanRunHandler from './api/scheduled-scans/run.js';
import scheduledScanRunsHandler from './api/scheduled-scans/runs.js';
import scheduledScanTasksHandler from './api/scheduled-scans/tasks.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const adaptHandler = (handler, queryMapper) => async (req, res) => {
  try {
    if (typeof queryMapper === 'function') {
      const extraQuery = queryMapper(req);
      req.query = {
        ...(req.query || {}),
        ...(extraQuery || {}),
      };
    }

    await handler(req, res);
  } catch (error) {
    console.error('[api-server] unhandled route error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
};

const adaptProxyHandler = (handler) => async (req, res) => {
  const originalUrl = req.url;

  try {
    req.url = req.originalUrl || req.url;
    await handler(req, res);
  } catch (error) {
    console.error('[api-server] unhandled proxy error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  } finally {
    req.url = originalUrl;
  }
};

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'leakradar-api',
    timestamp: new Date().toISOString(),
  });
});

app.all('/api/auth/login', adaptHandler(loginHandler));
app.all('/api/auth/whitelist', adaptHandler(whitelistHandler));

app.all('/api/code-leak/assets', adaptHandler(codeLeakAssetsHandler));
app.all(
  '/api/code-leak/assets/:id',
  adaptHandler(codeLeakAssetsHandler, (req) => ({ id: req.params.id }))
);
app.all('/api/code-leak/findings', adaptHandler(codeLeakFindingsHandler));
app.all('/api/code-leak/search', adaptHandler(codeLeakSearchHandler));

app.all('/api/file-leak/assets', adaptHandler(fileLeakAssetsHandler));
app.all(
  '/api/file-leak/assets/:id',
  adaptHandler(fileLeakAssetsHandler, (req) => ({ id: req.params.id }))
);
app.all('/api/file-leak/findings', adaptHandler(fileLeakFindingsHandler));
app.all('/api/file-leak/search', adaptHandler(fileLeakSearchHandler));

app.all('/api/cve-intel/assets', adaptHandler(cveIntelAssetsHandler));
app.all(
  '/api/cve-intel/assets/:id',
  adaptHandler(cveIntelAssetsHandler, (req) => ({ id: req.params.id }))
);

app.all('/api/notifications/webhook', adaptHandler(webhookHandler));
app.all('/api/otx/search', adaptHandler(otxSearchHandler));

app.all('/api/scheduled-scans/tasks', adaptHandler(scheduledScanTasksHandler));
app.all(
  '/api/scheduled-scans/tasks/:id',
  adaptHandler(scheduledScanTasksHandler, (req) => ({ id: req.params.id }))
);
app.all('/api/scheduled-scans/runs', adaptHandler(scheduledScanRunsHandler));
app.all('/api/scheduled-scans/run', adaptHandler(scheduledScanRunHandler));

app.use('/api', adaptProxyHandler(proxyHandler));

app.listen(PORT, () => {
  console.log(`[api-server] listening on http://127.0.0.1:${PORT}`);
});
