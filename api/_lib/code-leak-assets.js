import { promises as fs } from 'fs';
import path from 'path';
import { getSqlClient, hasDatabase, withDatabaseErrorBoundary } from './db.js';

const sql = getSqlClient();
const CODE_LEAK_ASSETS_FILE = path.join(process.cwd(), '.data', 'code-leak-assets.json');

let tableReady = false;

const ensureCodeLeakAssetsStore = async () => {
  await fs.mkdir(path.dirname(CODE_LEAK_ASSETS_FILE), { recursive: true });
  try {
    await fs.access(CODE_LEAK_ASSETS_FILE);
  } catch {
    await fs.writeFile(CODE_LEAK_ASSETS_FILE, '{}', 'utf8');
  }
};

const readCodeLeakAssetsStore = async () => {
  await ensureCodeLeakAssetsStore();
  try {
    const raw = await fs.readFile(CODE_LEAK_ASSETS_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeCodeLeakAssetsStore = async (store) => {
  await ensureCodeLeakAssetsStore();
  await fs.writeFile(CODE_LEAK_ASSETS_FILE, JSON.stringify(store, null, 2), 'utf8');
};

export const getCodeLeakUserEmail = (req, body = null) => {
  const headerEmail = typeof req.headers['x-user-email'] === 'string' ? req.headers['x-user-email'].trim() : '';
  const bodyEmail = body && typeof body.userEmail === 'string' ? body.userEmail.trim() : '';
  return (headerEmail || bodyEmail).toLowerCase();
};

export const ensureCodeLeakAssetsTable = async () => {
  if (!hasDatabase() || tableReady) return;

  await withDatabaseErrorBoundary(async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS code_leak_assets (
        id TEXT PRIMARY KEY,
        user_email TEXT NOT NULL,
        label TEXT NOT NULL,
        value TEXT NOT NULL,
        type TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS code_leak_assets_user_value_idx
      ON code_leak_assets (user_email, value)
    `;
  }, 'Failed to prepare code leak assets table.');

  tableReady = true;
};

export const listCodeLeakAssets = async (userEmail) => {
  if (!hasDatabase()) {
    const store = await readCodeLeakAssetsStore();
    return Array.isArray(store[userEmail]) ? store[userEmail] : [];
  }

  await ensureCodeLeakAssetsTable();

  const rows = await withDatabaseErrorBoundary(() => sql`
      SELECT id, label, value, type, enabled
      FROM code_leak_assets
      WHERE user_email = ${userEmail}
      ORDER BY created_at ASC
    `,
    'Failed to load code leak assets.'
  );

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    value: row.value,
    type: row.type,
    enabled: Boolean(row.enabled),
  }));
};

export const addCodeLeakAsset = async (userEmail, asset) => {
  if (!hasDatabase()) {
    const store = await readCodeLeakAssetsStore();
    const currentAssets = Array.isArray(store[userEmail]) ? store[userEmail] : [];
    const duplicated = currentAssets.some((item) => String(item?.value || '').toLowerCase() === asset.value.toLowerCase());
    if (!duplicated) {
      store[userEmail] = [...currentAssets, asset];
      await writeCodeLeakAssetsStore(store);
    }
    return Array.isArray(store[userEmail]) ? store[userEmail] : currentAssets;
  }

  await ensureCodeLeakAssetsTable();

  const duplicated = await withDatabaseErrorBoundary(() => sql`
      SELECT id
      FROM code_leak_assets
      WHERE user_email = ${userEmail} AND lower(value) = lower(${asset.value})
      LIMIT 1
    `,
    'Failed to check duplicated code leak asset.'
  );

  if (duplicated.length === 0) {
    await withDatabaseErrorBoundary(() => sql`
        INSERT INTO code_leak_assets (id, user_email, label, value, type, enabled)
        VALUES (${asset.id}, ${userEmail}, ${asset.label}, ${asset.value}, ${asset.type}, ${asset.enabled})
      `,
      'Failed to save code leak asset.'
    );
  }

  return listCodeLeakAssets(userEmail);
};

export const removeCodeLeakAsset = async (userEmail, assetId) => {
  if (!hasDatabase()) {
    const store = await readCodeLeakAssetsStore();
    const currentAssets = Array.isArray(store[userEmail]) ? store[userEmail] : [];
    store[userEmail] = currentAssets.filter((asset) => asset.id !== assetId);
    await writeCodeLeakAssetsStore(store);
    return store[userEmail];
  }

  await ensureCodeLeakAssetsTable();

  await withDatabaseErrorBoundary(() => sql`
      DELETE FROM code_leak_assets
      WHERE user_email = ${userEmail} AND id = ${assetId}
    `,
    'Failed to remove code leak asset.'
  );

  return listCodeLeakAssets(userEmail);
};
