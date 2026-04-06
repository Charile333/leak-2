module.exports = {
  apps: [
    {
      name: 'leak-scan-worker',
      script: 'scanner-worker.js',
      interpreter: 'node',
      args: '--daemon',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        SCAN_DAEMON: 'true',
        SCAN_POLL_INTERVAL_MS: '600000'
      }
    }
  ]
};
