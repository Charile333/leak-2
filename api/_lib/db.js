import { neon } from '@neondatabase/serverless';
import { getDatabaseUrl, hasDatabaseConfig } from './runtime-config.js';

const DATABASE_URL = getDatabaseUrl();
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

export const hasDatabase = () => Boolean(sql) && hasDatabaseConfig();

export const getSqlClient = () => sql;

export class DatabaseConfigError extends Error {
  constructor(message = 'Database is not configured.') {
    super(message);
    this.name = 'DatabaseConfigError';
  }
}

export const requireSqlClient = (feature = 'database access') => {
  if (!sql) {
    throw new DatabaseConfigError(`Database is not configured for ${feature}.`);
  }

  return sql;
};

export const withDatabaseErrorBoundary = async (operation, contextMessage = 'Database operation failed.') => {
  try {
    return await operation();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const wrappedError = new Error(`${contextMessage} ${detail}`.trim());
    wrappedError.cause = error;
    throw wrappedError;
  }
};
