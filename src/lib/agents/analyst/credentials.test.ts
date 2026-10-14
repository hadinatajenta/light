import { describe, expect, it } from 'vitest';
import { ApiError } from '../../errors';
import {
  describeAnalystCredentials,
  describeGscCredentials,
  isGoogleTokenFresh,
  parseServiceAccount,
  readCachedGoogleToken,
  readGa4Credentials,
  readGscCredentials,
  saveGa4Credentials,
  saveGscCredentials,
  validateGa4PropertyId,
  validateGscProperty,
  writeCachedGoogleToken,
} from './credentials';

const KEY_MATERIAL = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const PRIVATE_KEY =
  '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQ\n-----END PRIVATE KEY-----\n';

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

function serviceAccountJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'service_account',
    client_email: 'analyst@light-analytics.iam.gserviceaccount.com',
    private_key: PRIVATE_KEY,
    project_id: 'light-analytics',
    ...overrides,
  });
}

describe('parseServiceAccount', () => {
  it('returns the fields the clients need', () => {
    const account = parseServiceAccount(serviceAccountJson());

    expect(account).toEqual({
      clientEmail: 'analyst@light-analytics.iam.gserviceaccount.com',
      projectId: 'light-analytics',
      privateKey: PRIVATE_KEY,
    });
  });

  it('normalizes an escaped private key', () => {
    const escaped = serviceAccountJson({ private_key: PRIVATE_KEY.replaceAll('\n', '\\n') });
    const account = parseServiceAccount(escaped);

    expect(account.privateKey).toContain('\n');
    expect(account.privateKey.startsWith('-----BEGIN PRIVATE KEY-----')).toBe(true);
  });

  it('rejects input that is not JSON', () => {
    expect(() => parseServiceAccount('not json')).toThrow(ApiError);

    try {
      parseServiceAccount('not json');
    } catch (error) {
      expect((error as ApiError).code).toBe('ANALYST_CREDENTIAL_INVALID');
      expect((error as ApiError).details).toEqual({ field: 'serviceAccount' });
    }
  });

  it('rejects a JSON value that is not an object', () => {
    expect(() => parseServiceAccount('[]')).toThrow(ApiError);
    expect(() => parseServiceAccount('"text"')).toThrow(ApiError);
  });

  it('rejects a type other than service_account', () => {
    expect(() => parseServiceAccount(serviceAccountJson({ type: 'authorized_user' }))).toThrow(
      ApiError,
    );

    try {
      parseServiceAccount(serviceAccountJson({ type: 'authorized_user' }));
    } catch (error) {
      expect((error as ApiError).details).toEqual({ field: 'type' });
    }
  });

  it('rejects a missing or malformed client_email', () => {
    expect(() => parseServiceAccount(serviceAccountJson({ client_email: '' }))).toThrow(ApiError);
    expect(() => parseServiceAccount(serviceAccountJson({ client_email: 'no-at-sign' }))).toThrow(
      ApiError,
    );

    try {
      parseServiceAccount(serviceAccountJson({ client_email: 'no-at-sign' }));
    } catch (error) {
      expect((error as ApiError).details).toEqual({ field: 'client_email' });
    }
  });

  it('rejects a missing or malformed private_key', () => {
    expect(() => parseServiceAccount(serviceAccountJson({ private_key: '' }))).toThrow(ApiError);
    expect(() => parseServiceAccount(serviceAccountJson({ private_key: 'abc' }))).toThrow(ApiError);

    try {
      parseServiceAccount(serviceAccountJson({ private_key: 'abc' }));
    } catch (error) {
      expect((error as ApiError).details).toEqual({ field: 'private_key' });
    }
  });

  it('accepts a PKCS#1 RSA private key block', () => {
    const pkcs1 = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----\n';

    expect(parseServiceAccount(serviceAccountJson({ private_key: pkcs1 })).privateKey).toBe(pkcs1);
  });

  it('rejects a missing project_id', () => {
    expect(() => parseServiceAccount(serviceAccountJson({ project_id: '  ' }))).toThrow(ApiError);

    try {
      parseServiceAccount(serviceAccountJson({ project_id: null }));
    } catch (error) {
      expect((error as ApiError).details).toEqual({ field: 'project_id' });
    }
  });
});

describe('validateGscProperty', () => {
  it('accepts a url prefix property', () => {
    expect(validateGscProperty('https://lightscripts.com/')).toBe('https://lightscripts.com/');
    expect(validateGscProperty('  http://www.lightscripts.com  ')).toBe(
      'http://www.lightscripts.com',
    );
  });

  it('accepts and lowercases a sc-domain property', () => {
    expect(validateGscProperty('sc-domain:LightScripts.com')).toBe('sc-domain:lightscripts.com');
  });

  it('rejects an empty property', () => {
    expect(() => validateGscProperty('   ')).toThrow(ApiError);
  });

  it('rejects a sc-domain without a dot', () => {
    expect(() => validateGscProperty('sc-domain:localhost')).toThrow(ApiError);
  });

  it('rejects a property that is not a url', () => {
    expect(() => validateGscProperty('lightscripts.com')).toThrow(ApiError);
    expect(() => validateGscProperty('ftp://lightscripts.com')).toThrow(ApiError);
  });
});

describe('validateGa4PropertyId', () => {
  it('accepts a numeric id and strips the resource prefix', () => {
    expect(validateGa4PropertyId(' 123456789 ')).toBe('123456789');
    expect(validateGa4PropertyId('properties/123456789')).toBe('123456789');
  });

  it('rejects a non numeric id', () => {
    expect(() => validateGa4PropertyId('G-ABCDE')).toThrow(ApiError);
    expect(() => validateGa4PropertyId('12')).toThrow(ApiError);
  });
});

describe('credential storage', () => {
  it('round trips each source without returning the raw service account', async () => {
    const database = settingsDatabase();

    await saveGscCredentials(
      database,
      { serviceAccount: serviceAccountJson(), property: 'https://lightscripts.com/' },
      KEY_MATERIAL,
    );
    await saveGa4Credentials(
      database,
      { serviceAccount: serviceAccountJson(), propertyId: 'properties/99887766' },
      KEY_MATERIAL,
    );

    const stored = database.values.get('analyst_gsc_service_account') ?? '';
    expect(stored).not.toContain('PRIVATE KEY');

    const gsc = await readGscCredentials(database, KEY_MATERIAL);
    const ga4 = await readGa4Credentials(database, KEY_MATERIAL);
    const described = await describeAnalystCredentials(database, KEY_MATERIAL);

    expect(gsc).toMatchObject({ property: 'https://lightscripts.com/' });
    expect(gsc.serviceAccount?.projectId).toBe('light-analytics');
    expect(ga4).toMatchObject({ propertyId: '99887766' });
    expect(described.gsc).toMatchObject({
      configured: true,
      clientEmail: 'analyst@light-analytics.iam.gserviceaccount.com',
      property: 'https://lightscripts.com/',
    });
    expect(described.gsc.hint).not.toContain('MIIEvQIBADANBgkqhkiG9w0BAQ');
    expect(JSON.stringify(described)).not.toContain('MIIEvQIBADANBgkqhkiG9w0BAQ');
  });

  it('leaves absent fields unchanged and clears empty strings', async () => {
    const database = settingsDatabase();

    await saveGscCredentials(
      database,
      { serviceAccount: serviceAccountJson(), property: 'https://lightscripts.com/' },
      KEY_MATERIAL,
    );
    await saveGscCredentials(database, { property: '' }, KEY_MATERIAL);

    const cleared = await describeGscCredentials(database, KEY_MATERIAL);

    expect(cleared.configured).toBe(false);
    expect(cleared.property).toBeNull();
    expect(cleared.clientEmail).toBe('analyst@light-analytics.iam.gserviceaccount.com');

    await saveGscCredentials(database, { serviceAccount: '' }, KEY_MATERIAL);
    const removed = await describeGscCredentials(database, KEY_MATERIAL);

    expect(removed).toMatchObject({ configured: false, clientEmail: null });
  });

  it('validates the property on save', async () => {
    const database = settingsDatabase();

    await expect(
      saveGscCredentials(database, { property: 'not a url' }, KEY_MATERIAL),
    ).rejects.toMatchObject({ code: 'ANALYST_CREDENTIAL_INVALID' });
    await expect(
      saveGa4Credentials(database, { propertyId: 'G-1' }, KEY_MATERIAL),
    ).rejects.toMatchObject({ code: 'ANALYST_CREDENTIAL_INVALID' });
  });

  it('reports an unconfigured source when a credential cannot be decrypted', async () => {
    const database = settingsDatabase();
    database.values.set('analyst_gsc_service_account', '{"iv":"x","data":"y"}');

    await expect(describeGscCredentials(database, KEY_MATERIAL)).resolves.toMatchObject({
      configured: false,
      clientEmail: null,
    });
  });
});

describe('google token cache', () => {
  it('keeps a token with more than a minute of life', () => {
    const now = 1_000_000;

    expect(isGoogleTokenFresh({ accessToken: 'token', expiresAt: now + 120_000 }, now)).toBe(true);
    expect(isGoogleTokenFresh({ accessToken: 'token', expiresAt: now + 30_000 }, now)).toBe(false);
    expect(isGoogleTokenFresh({ accessToken: '', expiresAt: now + 120_000 }, now)).toBe(false);
  });

  it('stores the token encrypted and reads it back', async () => {
    const database = settingsDatabase();

    await writeCachedGoogleToken(
      database,
      'ga4',
      { accessToken: 'ya29-secret', expiresAt: 42_000 },
      KEY_MATERIAL,
    );

    const stored = database.values.get('analyst_ga4_access_token') ?? '';
    expect(stored).not.toContain('ya29-secret');
    await expect(readCachedGoogleToken(database, 'ga4', KEY_MATERIAL)).resolves.toEqual({
      accessToken: 'ya29-secret',
      expiresAt: 42_000,
    });
  });

  it('returns null for an unreadable cache entry', async () => {
    const database = settingsDatabase();
    database.values.set('analyst_gsc_access_token', 'not-encrypted');

    await expect(readCachedGoogleToken(database, 'gsc', KEY_MATERIAL)).resolves.toBeNull();
  });
});
