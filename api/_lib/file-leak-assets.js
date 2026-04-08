import { promises as fs } from 'fs';
import path from 'path';
import { getSqlClient, hasDatabase, withDatabaseErrorBoundary } from './db.js';

const sql = getSqlClient();
const FILE_LEAK_ASSETS_FILE = path.join(process.cwd(), '.data', 'file-leak-assets.json');

let tableReady = false;

const ensureFileLeakAssetsStore = async () => {
  await fs.mkdir(path.dirname(FILE_LEAK_ASSETS_FILE), { recursive: true });
  try {
    await fs.access(FILE_LEAK_ASSETS_FILE);
  } catch {
    await fs.writeFile(FILE_LEAK_ASSETS_FILE, '{}', 'utf8');
  }
};

const readFileLeakAssetsStore = async () => {
  await ensureFileLeakAssetsStore();
  try {
    const raw = await fs.readFile(FILE_LEAK_ASSETS_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeFileLeakAssetsStore = async (store) => {
  await ensureFileLeakAssetsStore();
  await fs.writeFile(FILE_LEAK_ASSETS_FILE, JSON.stringify(store, null, 2), 'utf8');
};

export const getFileLeakUserEmail = (req, body = null) => {
  const headerEmail = typeof req.headers['x-user-email'] === 'string' ? req.headers['x-user-email'].trim() : '';
  const bodyEmail = body && typeof body.userEmail === 'string' ? body.userEmail.trim() : '';
  return (headerEmail || bodyEmail).toLowerCase();
};

export const ensureFileLeakAssetsTable = async () => {
  if (!hasDatabase() || tableReady) return;

  await withDatabaseErrorBoundary(async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS file_leak_assets (
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
      CREATE UNIQUE INDEX IF NOT EXISTS file_leak_assets_user_value_idx
      ON file_leak_assets (user_email, value)
    `;
  }, 'Failed to prepare file leak assets table.');

  tableReady = true;
};

export const listFileLeakAssets = async (userEmail) => {
  if (!hasDatabase()) {
    const store = await readFileLeakAssetsStore();
    return Array.isArray(store[userEmail]) ? store[userEmail] : [];
  }

  await ensureFileLeakAssetsTable();

  const rows = await withDatabaseErrorBoundary(() => sql`
      SELECT id, label, value, type, enabled
      FROM file_leak_assets
      WHERE user_email = ${userEmail}
      ORDER BY created_at ASC
    `,
    'Failed to load file leak assets.'
  );

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    value: row.value,
    type: row.type,
    enabled: Boolean(row.enabled),
  }));
};

export const addFileLeakAsset = async (userEmail, asset) => {
  if (!hasDatabase()) {
    const store = await readFileLeakAssetsStore();
    const currentAssets = Array.isArray(store[userEmail]) ? store[userEmail] : [];
    const duplicated = currentAssets.some((item) => String(item?.value || '').toLowerCase() === asset.value.toLowerCase());
    if (!duplicated) {
      store[userEmail] = [...currentAssets, asset];
      await writeFileLeakAssetsStore(store);
    }
    return Array.isArray(store[userEmail]) ? store[userEmail] : currentAssets;
  }

  await ensureFileLeakAssetsTable();

  const duplicated = await withDatabaseErrorBoundary(() => sql`
      SELECT id
      FROM file_leak_assets
      WHERE user_email = ${userEmail} AND lower(value) = lower(${asset.value})
      LIMIT 1
    `,
    'Failed to check duplicated file leak asset.'
  );

  if (duplicated.length === 0) {
    await withDatabaseErrorBoundary(() => sql`
        INSERT INTO file_leak_assets (id, user_email, label, value, type, enabled)
        VALUES (${asset.id}, ${userEmail}, ${asset.label}, ${asset.value}, ${asset.type}, ${asset.enabled})
      `,
      'Failed to save file leak asset.'
    );
  }

  return listFileLeakAssets(userEmail);
};

export const removeFileLeakAsset = async (userEmail, assetId) => {
  if (!hasDatabase()) {
    const store = await readFileLeakAssetsStore();
    const currentAssets = Array.isArray(store[userEmail]) ? store[userEmail] : [];
    store[userEmail] = currentAssets.filter((asset) => asset.id !== assetId);
    await writeFileLeakAssetsStore(store);
    return store[userEmail];
  }

  await ensureFileLeakAssetsTable();

  await withDatabaseErrorBoundary(() => sql`
      DELETE FROM file_leak_assets
      WHERE user_email = ${userEmail} AND id = ${assetId}
    `,
    'Failed to remove file leak asset.'
  );

  return listFileLeakAssets(userEmail);
};
