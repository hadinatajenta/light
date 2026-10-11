import { ApiError } from '../errors';

export const REDIRECT_STATUS_CODES = [301, 302, 307, 308] as const;

export type RedirectStatusCode = (typeof REDIRECT_STATUS_CODES)[number];

export const RESERVED_PATH_PREFIXES = [
  '/dashboard',
  '/api',
  '/media',
  '/_astro',
  '/go',
  '/blog',
  '/tag',
];

export interface RedirectRecord {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: number;
  isActive: boolean;
  hits: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RedirectInput {
  fromPath: string;
  toPath: string;
  statusCode: number;
  isActive: boolean;
  note: string | null;
}

interface RedirectRow {
  id: string;
  from_path: string;
  to_path: string;
  status_code: number;
  is_active: number;
  hits: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

function toRecord(row: RedirectRow): RedirectRecord {
  return {
    id: row.id,
    fromPath: row.from_path,
    toPath: row.to_path,
    statusCode: row.status_code,
    isActive: row.is_active === 1,
    hits: row.hits,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeRedirectPath(raw: string): string {
  const trimmed = raw.trim();
  const withoutLeading = trimmed.replace(/^\/+/, '');
  const withoutTrailing = withoutLeading.replace(/\/+$/, '');
  const lowered = withoutTrailing.toLowerCase();

  return lowered.length === 0 ? '/' : `/${lowered}`;
}

function assertFromPathUsable(fromPath: string): void {
  if (fromPath === '/') {
    throw new ApiError(422, 'PATH_RESERVED', 'The home page cannot be redirected.');
  }

  if (/[\s?#]/.test(fromPath)) {
    throw new ApiError(
      422,
      'INVALID_PATH',
      'Use a path without spaces, a query string, or a fragment.',
    );
  }

  for (const prefix of RESERVED_PATH_PREFIXES) {
    if (fromPath === prefix || fromPath.startsWith(`${prefix}/`)) {
      throw new ApiError(422, 'PATH_RESERVED', `${prefix} is reserved and cannot be redirected.`);
    }
  }
}

export function normalizeRedirectTarget(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new ApiError(422, 'INVALID_TARGET', 'Enter a path or a full URL.');
  }

  if (trimmed.startsWith('/')) {
    return normalizeRedirectPath(trimmed);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ApiError(422, 'INVALID_TARGET', 'Enter an absolute path or a full URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ApiError(422, 'INVALID_TARGET', 'Enter an absolute path or a full URL.');
  }

  return trimmed;
}

function assertNotSelfRedirect(fromPath: string, toPath: string): void {
  if (fromPath === toPath) {
    throw new ApiError(422, 'SELF_REDIRECT', 'A redirect cannot point to its own path.');
  }
}

export async function listRedirects(db: D1Database): Promise<RedirectRecord[]> {
  const result = await db
    .prepare('SELECT * FROM redirects ORDER BY created_at DESC, from_path ASC')
    .all<RedirectRow>();

  return (result.results ?? []).map(toRecord);
}

export async function getRedirectByPath(
  db: D1Database,
  fromPath: string,
): Promise<RedirectRecord | null> {
  const normalized = normalizeRedirectPath(fromPath);
  const row = await db
    .prepare('SELECT * FROM redirects WHERE from_path = ? AND is_active = 1')
    .bind(normalized)
    .first<RedirectRow>();

  return row ? toRecord(row) : null;
}

export async function createRedirect(
  db: D1Database,
  input: RedirectInput,
): Promise<RedirectRecord> {
  const fromPath = normalizeRedirectPath(input.fromPath);
  const toPath = normalizeRedirectTarget(input.toPath);
  assertFromPathUsable(fromPath);
  assertNotSelfRedirect(fromPath, toPath);

  const existing = await db
    .prepare('SELECT id FROM redirects WHERE from_path = ?')
    .bind(fromPath)
    .first<{ id: string }>();

  if (existing) {
    throw new ApiError(409, 'REDIRECT_EXISTS', 'A redirect already exists for that path.');
  }

  const now = new Date().toISOString();
  const record: RedirectRecord = {
    id: crypto.randomUUID(),
    fromPath,
    toPath,
    statusCode: input.statusCode,
    isActive: input.isActive,
    hits: 0,
    note: input.note,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO redirects
        (id, from_path, to_path, status_code, is_active, hits, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      record.id,
      record.fromPath,
      record.toPath,
      record.statusCode,
      record.isActive ? 1 : 0,
      record.hits,
      record.note,
      record.createdAt,
      record.updatedAt,
    )
    .run();

  return record;
}

export async function updateRedirect(
  db: D1Database,
  id: string,
  input: RedirectInput,
): Promise<RedirectRecord> {
  const current = await db
    .prepare('SELECT * FROM redirects WHERE id = ?')
    .bind(id)
    .first<RedirectRow>();

  if (!current) {
    throw new ApiError(404, 'REDIRECT_NOT_FOUND', 'That redirect does not exist.');
  }

  const fromPath = normalizeRedirectPath(input.fromPath);
  const toPath = normalizeRedirectTarget(input.toPath);
  assertFromPathUsable(fromPath);
  assertNotSelfRedirect(fromPath, toPath);

  const collision = await db
    .prepare('SELECT id FROM redirects WHERE from_path = ? AND id != ?')
    .bind(fromPath, id)
    .first<{ id: string }>();

  if (collision) {
    throw new ApiError(409, 'REDIRECT_EXISTS', 'A redirect already exists for that path.');
  }

  const updatedAt = new Date().toISOString();

  await db
    .prepare(
      `UPDATE redirects
       SET from_path = ?, to_path = ?, status_code = ?, is_active = ?, note = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(fromPath, toPath, input.statusCode, input.isActive ? 1 : 0, input.note, updatedAt, id)
    .run();

  return {
    id,
    fromPath,
    toPath,
    statusCode: input.statusCode,
    isActive: input.isActive,
    hits: current.hits,
    note: input.note,
    createdAt: current.created_at,
    updatedAt,
  };
}

export async function deleteRedirect(db: D1Database, id: string): Promise<RedirectRecord> {
  const row = await db
    .prepare('SELECT * FROM redirects WHERE id = ?')
    .bind(id)
    .first<RedirectRow>();

  if (!row) {
    throw new ApiError(404, 'REDIRECT_NOT_FOUND', 'That redirect does not exist.');
  }

  await db.prepare('DELETE FROM redirects WHERE id = ?').bind(id).run();

  return toRecord(row);
}

export async function recordRedirectHit(db: D1Database, id: string): Promise<void> {
  await db.prepare('UPDATE redirects SET hits = hits + 1 WHERE id = ?').bind(id).run();
}
