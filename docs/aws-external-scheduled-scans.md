# AWS External Scheduled Scans

This project now runs scheduled monitoring through the HTTP endpoint below instead of Vercel Cron:

```text
POST https://<your-vercel-domain>/api/scheduled-scans/run
GET  https://<your-vercel-domain>/api/scheduled-scans/run
```

The endpoint expects either of these headers:

```text
Authorization: Bearer <CRON_SECRET>
```

or

```text
X-Cron-Secret: <CRON_SECRET>
```

`Authorization: Bearer <CRON_SECRET>` is the recommended form.

## Recommended AWS Setup

Use this chain:

1. EventBridge Scheduler
2. Lambda
3. HTTPS call to `/api/scheduled-scans/run`

This keeps the schedule in AWS while the scan logic continues to run inside the deployed Vercel backend.

## Lambda Example

Runtime: Node.js 20.x

Environment variables:

```text
SCAN_RUN_URL=https://<your-vercel-domain>/api/scheduled-scans/run
CRON_SECRET=<same secret configured in Vercel>
```

Handler:

```js
export const handler = async () => {
  const response = await fetch(process.env.SCAN_RUN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
      'Content-Type': 'application/json',
    },
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Scheduled scan trigger failed: ${response.status} ${body}`);
  }

  return {
    statusCode: response.status,
    body,
  };
};
```

## EventBridge Scheduler

Typical schedule examples:

Every 15 minutes:

```text
cron(0/15 * * * ? *)
```

Every 30 minutes:

```text
cron(0/30 * * * ? *)
```

Every hour:

```text
cron(0 * * * ? *)
```

Set the Scheduler target to the Lambda above.

## Manual Test

You can test the runner manually with curl:

```bash
curl -X POST \
  -H "Authorization: Bearer <CRON_SECRET>" \
  https://<your-vercel-domain>/api/scheduled-scans/run
```

Force all enabled tasks to run immediately:

```bash
curl -X POST \
  -H "Authorization: Bearer <CRON_SECRET>" \
  "https://<your-vercel-domain>/api/scheduled-scans/run?force=1"
```

## Notes

- Keep the same `CRON_SECRET` in both Vercel and AWS.
- The endpoint records execution results into `scheduled_scan_runs`.
- New findings continue to flow into `scheduled_scan_findings`.
- Webhook notifications are still sent by the Vercel backend after new findings are detected.
