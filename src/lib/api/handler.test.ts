import type { APIContext } from 'astro';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/types';
import { jsonOk } from '../http';
import { withAdmin } from './handler';

const { resolveContentDatabaseMock } = vi.hoisted(() => ({
  resolveContentDatabaseMock: vi.fn(),
}));

vi.mock('../content/database', () => ({
  resolveContentDatabase: resolveContentDatabaseMock,
}));

const ADMIN_USER: AuthenticatedUser = {
  email: 'Admin@Example.com',
  name: 'Admin',
  role: 'admin',
};

function createContext(method: string, user: AuthenticatedUser | null): APIContext {
  return {
    request: new Request('https://example.com/api/dashboard/tags', { method }),
    locals: { user },
  } as unknown as APIContext;
}

function createFakeDatabase(windowCount: number): {
  database: D1Database;
  writes: unknown[][];
} {
  const writes: unknown[][] = [];

  const database = {
    prepare(_sql: string) {
      let params: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          params = values;
          return statement;
        },
        async first() {
          writes.push(params);
          return { window_start: params[1], window_count: windowCount };
        },
      };
      return statement;
    },
  };

  return { database: database as unknown as D1Database, writes };
}

async function passthroughHandler(_context: APIContext, requestId: string): Promise<Response> {
  return jsonOk({ ok: true }, requestId);
}

beforeEach(() => {
  resolveContentDatabaseMock.mockReset();
});

describe('withAdmin', () => {
  it('rejects a request with no authenticated user before touching the database', async () => {
    const handler = vi.fn(passthroughHandler);

    const response = await withAdmin(handler)(createContext('GET', null));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    expect(handler).not.toHaveBeenCalled();
    expect(resolveContentDatabaseMock).not.toHaveBeenCalled();
  });

  it('runs the handler without limiting when the content database is unavailable', async () => {
    resolveContentDatabaseMock.mockResolvedValue(null);
    const handler = vi.fn(passthroughHandler);

    const response = await withAdmin(handler)(createContext('GET', ADMIN_USER));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { ok: true } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('counts reads against the read bucket keyed by the authenticated user', async () => {
    const { database, writes } = createFakeDatabase(1);
    resolveContentDatabaseMock.mockResolvedValue(database);
    const handler = vi.fn(passthroughHandler);

    const response = await withAdmin(handler)(createContext('GET', ADMIN_USER));

    expect(response.status).toBe(200);
    expect(writes[0][0]).toBe('admin:read:admin@example.com');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('treats HEAD as a read request', async () => {
    const { database, writes } = createFakeDatabase(1);
    resolveContentDatabaseMock.mockResolvedValue(database);

    const response = await withAdmin(passthroughHandler)(createContext('HEAD', ADMIN_USER));

    expect(response.status).toBe(200);
    expect(writes[0][0]).toBe('admin:read:admin@example.com');
  });

  it('allows a read that lands exactly on the limit', async () => {
    const { database } = createFakeDatabase(240);
    resolveContentDatabaseMock.mockResolvedValue(database);

    const response = await withAdmin(passthroughHandler)(createContext('GET', ADMIN_USER));

    expect(response.status).toBe(200);
  });

  it('returns a rate limit error once the write bucket is exhausted', async () => {
    const { database, writes } = createFakeDatabase(61);
    resolveContentDatabaseMock.mockResolvedValue(database);
    const handler = vi.fn(passthroughHandler);

    const response = await withAdmin(handler)(createContext('POST', ADMIN_USER));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'RATE_LIMITED' } });
    expect(writes[0][0]).toBe('admin:write:admin@example.com');
    expect(handler).not.toHaveBeenCalled();
  });
});
