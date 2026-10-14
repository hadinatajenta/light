import { generateKeyPairSync } from 'node:crypto';
import { importSPKI, jwtVerify } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../errors';
import { type GoogleServiceAccount, writeCachedGoogleToken } from './credentials';
import {
  exchangeServiceAccountForToken,
  fetchGoogleJson,
  GOOGLE_TOKEN_ENDPOINT,
  resolveGoogleAccessToken,
  signServiceAccountAssertion,
} from './google-auth';

const KEY_MATERIAL = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const ACCOUNT: GoogleServiceAccount = {
  clientEmail: 'analyst@light-analytics.iam.gserviceaccount.com',
  projectId: 'light-analytics',
  privateKey,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface SettingsDatabase extends D1Database {
  values: Map<string, string>;
}

function settingsDatabase(): SettingsDatabase {
  const values = new Map<string, string>();
  const database = {
    values,
    prepare(sql: string) {
      const params: unknown[] = [];
      const statement = {
        bind(...bound: unknown[]) {
          params.splice(0, params.length, ...bound);
          return statement;
        },
        async first() {
          return { value: values.get(String(params[0])) ?? '' };
        },
        async all() {
          return { results: [] };
        },
        async run() {
          if (sql.includes('INSERT INTO settings')) {
            values.set(String(params[0]), String(params[1]));
          }
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };

  return database as unknown as SettingsDatabase;
}

describe('signServiceAccountAssertion', () => {
  it('signs a verifiable assertion for the token endpoint', async () => {
    const assertion = await signServiceAccountAssertion({
      serviceAccount: ACCOUNT,
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
      nowMs: 1_700_000_000_000,
    });
    const { payload, protectedHeader } = await jwtVerify(
      assertion,
      await importSPKI(publicKey, 'RS256'),
      {
        audience: GOOGLE_TOKEN_ENDPOINT,
        issuer: ACCOUNT.clientEmail,
        currentDate: new Date(1_700_000_000_000),
      },
    );

    expect(protectedHeader.alg).toBe('RS256');
    expect(payload.scope).toBe('https://www.googleapis.com/auth/webmasters.readonly');
    expect(payload.iss).toBe(ACCOUNT.clientEmail);
    expect(payload.exp).toBe(payload.iat ? payload.iat + 3600 : undefined);
  });

  it('rejects a private key that jose cannot read', async () => {
    await expect(
      signServiceAccountAssertion({
        serviceAccount: { ...ACCOUNT, privateKey: '-----BEGIN PRIVATE KEY-----\nnope\n' },
        scope: 'scope',
        nowMs: 0,
      }),
    ).rejects.toMatchObject({ code: 'ANALYST_CREDENTIAL_INVALID' });
  });
});

describe('exchangeServiceAccountForToken', () => {
  it('exchanges the assertion for an access token', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ access_token: 'ya29-token', expires_in: 3599 }),
    );
    const token = await exchangeServiceAccountForToken({
      serviceAccount: ACCOUNT,
      scope: 'scope',
      nowMs: 1_700_000_000_000,
      fetchImpl,
    });

    expect(token).toEqual({
      accessToken: 'ya29-token',
      expiresAt: 1_700_000_000_000 + 3_599_000,
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = new URLSearchParams(String(init.body));

    expect(url).toBe(GOOGLE_TOKEN_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(body.get('assertion')).toBeTruthy();
  });

  it('maps a rejected assertion to a credential rejection', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'invalid_grant' }, 400));

    await expect(
      exchangeServiceAccountForToken({
        serviceAccount: ACCOUNT,
        scope: 'scope',
        fetchImpl,
        retry: { attempts: 1 },
      }),
    ).rejects.toMatchObject({ code: 'ANALYST_CREDENTIALS_REJECTED', status: 401 });
  });

  it('rejects a response without an access token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ expires_in: 3600 }));

    await expect(
      exchangeServiceAccountForToken({
        serviceAccount: ACCOUNT,
        scope: 'scope',
        fetchImpl,
        retry: { attempts: 1 },
      }),
    ).rejects.toMatchObject({ code: 'ANALYST_UPSTREAM_ERROR' });
  });
});

describe('fetchGoogleJson', () => {
  it('maps a 404 to a property not found error', async () => {
    const fetchImpl = async () => new Response('{}', { status: 404 });

    await expect(
      fetchGoogleJson({ url: 'https://example.test', method: 'GET', fetchImpl }),
    ).rejects.toMatchObject({ code: 'ANALYST_PROPERTY_NOT_FOUND', status: 404 });
  });

  it('maps a 429 to a rate limit error with the retry-after header', async () => {
    const fetchImpl = async () =>
      new Response('{}', { status: 429, headers: { 'Retry-After': '30' } });

    await expect(
      fetchGoogleJson({
        url: 'https://example.test',
        method: 'GET',
        fetchImpl,
        retry: { attempts: 1 },
      }),
    ).rejects.toMatchObject({
      code: 'ANALYST_RATE_LIMITED',
      details: { retryAfter: '30' },
    });
  });

  it('retries a 5xx and returns the later success', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return calls === 1 ? new Response('{}', { status: 503 }) : jsonResponse({ ok: true });
    };

    await expect(
      fetchGoogleJson({
        url: 'https://example.test',
        method: 'GET',
        fetchImpl,
        retry: { attempts: 2, baseDelayMs: 1 },
      }),
    ).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it('does not retry a rejected credential', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response('{}', { status: 403 });
    };

    await expect(
      fetchGoogleJson({
        url: 'https://example.test',
        method: 'GET',
        fetchImpl,
        retry: { attempts: 3, baseDelayMs: 1 },
      }),
    ).rejects.toMatchObject({ code: 'ANALYST_CREDENTIALS_REJECTED' });
    expect(calls).toBe(1);
  });

  it('maps an aborted request to a timeout', async () => {
    const fetchImpl = async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    };

    await expect(
      fetchGoogleJson({ url: 'https://example.test', method: 'GET', fetchImpl }),
    ).rejects.toMatchObject({ code: 'ANALYST_TIMEOUT', status: 504 });
  });

  it('maps a transport failure to unreachable', async () => {
    const fetchImpl = async () => {
      throw new Error('socket hang up');
    };

    await expect(
      fetchGoogleJson({
        url: 'https://example.test',
        method: 'GET',
        fetchImpl,
        retry: { attempts: 1 },
      }),
    ).rejects.toMatchObject({ code: 'ANALYST_UNREACHABLE' });
  });
});

describe('resolveGoogleAccessToken', () => {
  it('reuses a fresh cached token without calling Google', async () => {
    const database = settingsDatabase();
    const now = new Date('2026-03-15T10:00:00.000Z');

    await writeCachedGoogleToken(
      database,
      'gsc',
      { accessToken: 'cached', expiresAt: now.getTime() + 3_600_000 },
      KEY_MATERIAL,
    );
    const fetchImpl = vi.fn(async () => jsonResponse({ access_token: 'fresh', expires_in: 3600 }));
    const token = await resolveGoogleAccessToken({
      db: database,
      source: 'gsc',
      serviceAccount: ACCOUNT,
      scope: 'scope',
      now,
      keyMaterial: KEY_MATERIAL,
      fetchImpl,
    });

    expect(token).toBe('cached');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('exchanges and caches a token when the cache is stale', async () => {
    const database = settingsDatabase();
    const now = new Date('2026-03-15T10:00:00.000Z');

    await writeCachedGoogleToken(
      database,
      'ga4',
      { accessToken: 'stale', expiresAt: now.getTime() - 1_000 },
      KEY_MATERIAL,
    );
    const fetchImpl = vi.fn(async () => jsonResponse({ access_token: 'fresh', expires_in: 3600 }));
    const token = await resolveGoogleAccessToken({
      db: database,
      source: 'ga4',
      serviceAccount: ACCOUNT,
      scope: 'scope',
      now,
      keyMaterial: KEY_MATERIAL,
      fetchImpl,
    });

    expect(token).toBe('fresh');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('propagates a credential rejection from the token endpoint', async () => {
    const database = settingsDatabase();
    const fetchImpl = async () => jsonResponse({ error: 'invalid_grant' }, 400);

    await expect(
      resolveGoogleAccessToken({
        db: database,
        source: 'gsc',
        serviceAccount: ACCOUNT,
        scope: 'scope',
        keyMaterial: KEY_MATERIAL,
        fetchImpl,
        retry: { attempts: 1 },
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
