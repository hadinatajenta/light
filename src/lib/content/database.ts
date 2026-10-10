import { ApiError } from '../errors';

export async function resolveContentDatabase(): Promise<D1Database | null> {
  try {
    const { env } = await import('cloudflare:workers');
    return (env as unknown as { CONTENT_DB?: D1Database }).CONTENT_DB ?? null;
  } catch {
    return null;
  }
}

export async function requireContentDatabase(): Promise<D1Database> {
  const database = await resolveContentDatabase();
  if (!database) {
    throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'The content database is unavailable.');
  }

  return database;
}
