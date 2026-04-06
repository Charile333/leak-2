# Leak Scan Worker Deploy

Upload this whole folder to your AWS server, then run:

```bash
npm install
npm run seed -- your@email.com
pm2 start ecosystem.config.cjs
```

Required environment variables:

- `DATABASE_URL`
- `GITHUB_TOKEN`
- `GITEE_ACCESS_TOKEN`

Optional environment variables:

- `SCAN_DAEMON=true`
- `SCAN_POLL_INTERVAL_MS=600000`

Common commands:

```bash
npm run worker
npm run worker:daemon
pm2 logs leak-scan-worker
pm2 status
pm2 save
```
