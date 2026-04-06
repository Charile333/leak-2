import dotenv from 'dotenv';
import { upsertScheduledScanTask } from './lib/scheduled-scans.js';

dotenv.config();

const userEmail = process.argv[2];

if (!userEmail) {
  console.error('Usage: node seed-scan-tasks.js <user-email>');
  process.exit(1);
}

const now = new Date().toISOString();

const tasks = [
  {
    id: `task-code-leak-${userEmail}`,
    userEmail,
    scanType: 'code_leak',
    label: '代码泄露定时扫描',
    query: '',
    intervalMinutes: 30,
    enabled: true,
    lastRunAt: null,
    createdAt: now,
  },
  {
    id: `task-file-leak-${userEmail}`,
    userEmail,
    scanType: 'file_leak',
    label: '文件泄露定时扫描',
    query: '',
    intervalMinutes: 60,
    enabled: true,
    lastRunAt: null,
    createdAt: now,
  },
];

for (const task of tasks) {
  await upsertScheduledScanTask(task);
}

console.log(`[seed-scan-tasks] Seeded ${tasks.length} scheduled tasks for ${userEmail}`);
