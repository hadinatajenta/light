import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY_MATERIAL = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

vi.mock('cloudflare:workers', () => ({
  env: { AGENT_SECRET_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))) },
}));

import {
  createShareChannel,
  deleteShareChannel,
  getShareChannel,
  readChannelConfig,
  updateShareChannel,
} from './channels';
import type { ShareChannelInput } from './types';

interface ChannelRow {
  id: string;
  provider: string;
  label: string;
  enabled: number;
  config: string;
  daily_cap: number | null;
  require_approval: number;
  needs_attention: number;
  paused_until: string | null;
  started_at: string | null;
  last_error: string | null;
  last_success_at: string | null;
  created_at: string;
  updated_at: string;
}

function createFakeDatabase(): {
  database: D1Database;
  rows: Map<string, ChannelRow>;
  settings: Map<string, string>;
  deletes: string[];
} {
  const rows = new Map<string, ChannelRow>();
  const settings = new Map<string, string>();
  const deletes: string[] = [];

  const database = {
    prepare(sql: string) {
      let params: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          params = values;
          return statement;
        },
        async all() {
          if (sql.includes('FROM share_channels')) {
            const enabledOnly = sql.includes('enabled = 1');
            return {
              results: [...rows.values()].filter((row) => !enabledOnly || row.enabled === 1),
            };
          }
          return { results: [] };
        },
        async first() {
          if (sql.includes('FROM settings')) {
            const key = String(params[0]);
            return settings.has(key) ? { value: settings.get(key) } : null;
          }
          if (sql.includes('SELECT config FROM share_channels')) {
            const row = rows.get(String(params[0]));
            return row ? { config: row.config } : null;
          }
          if (sql.includes('FROM share_channels')) {
            return rows.get(String(params[0])) ?? null;
          }
          return null;
        },
        async run() {
          if (sql.includes('INSERT INTO share_channels')) {
            const now = String(params[9]);
            rows.set(String(params[0]), {
              id: String(params[0]),
              provider: String(params[1]),
              label: String(params[2]),
              enabled: Number(params[3]),
              config: String(params[4]),
              daily_cap: params[5] === null ? null : Number(params[5]),
              require_approval: Number(params[6]),
              needs_attention: 0,
              paused_until: null,
              started_at: params[7] === null ? null : String(params[7]),
              last_error: null,
              last_success_at: null,
              created_at: now,
              updated_at: now,
            });
          } else if (sql.includes('UPDATE share_channels SET provider')) {
            const row = rows.get(String(params[8]));
            if (row) {
              row.provider = String(params[0]);
              row.label = String(params[1]);
              row.enabled = Number(params[2]);
              row.config = String(params[3]);
              row.daily_cap = params[4] === null ? null : Number(params[4]);
              row.require_approval = Number(params[5]);
              row.needs_attention = 0;
              row.started_at = params[6] === null ? null : String(params[6]);
              row.updated_at = String(params[7]);
            }
          } else if (sql.includes('INSERT INTO settings')) {
            settings.set(String(params[0]), String(params[1]));
          } else if (sql.includes('DELETE FROM share_outbox')) {
            deletes.push(`outbox:${String(params[0])}`);
          } else if (sql.includes('DELETE FROM share_channels')) {
            deletes.push(`channel:${String(params[0])}`);
            rows.delete(String(params[0]));
          }
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };

  return { database: database as unknown as D1Database, rows, settings, deletes };
}

function input(overrides: Partial<ShareChannelInput> = {}): ShareChannelInput {
  return {
    provider: 'telegram',
    label: 'Telegram',
    enabled: true,
    config: { public: { chatId: '-100' }, secret: { botToken: 'sk-secret-token' } },
    dailyCap: null,
    requireApproval: false,
    ...overrides,
  };
}

beforeEach(() => {
  expect(KEY_MATERIAL).toHaveLength(44);
});

describe('createShareChannel', () => {
  it('stores only the public config and marks the secret field', async () => {
    const { database, rows } = createFakeDatabase();
    const channel = await createShareChannel(database, input());

    expect(channel.config).toEqual({ chatId: '-100' });
    expect(channel.secretKeys).toEqual(['botToken']);
    expect(channel.enabled).toBe(true);
    expect(channel.startedAt).not.toBeNull();

    const stored = [...rows.values()][0];
    expect(stored.config).not.toContain('sk-secret-token');
    expect(stored.config).toContain('botToken');
  });

  it('captures the backfill cutoff when the first channel is enabled', async () => {
    const { database, settings } = createFakeDatabase();
    await createShareChannel(database, input());
    expect(settings.has('share_backfill_cutoff')).toBe(true);
  });

  it('rejects missing required fields', async () => {
    const { database } = createFakeDatabase();
    await expect(
      createShareChannel(database, input({ config: { public: { chatId: '-100' }, secret: {} } })),
    ).rejects.toMatchObject({ code: 'INVALID_CHANNEL_CONFIG' });
  });

  it('rejects an unsupported provider', async () => {
    const { database } = createFakeDatabase();
    await expect(
      createShareChannel(database, input({ provider: 'pinterest' as never })),
    ).rejects.toMatchObject({ code: 'INVALID_PROVIDER' });
  });
});

describe('readChannelConfig', () => {
  it('decrypts the stored secret', async () => {
    const { database } = createFakeDatabase();
    const channel = await createShareChannel(database, input());

    await expect(readChannelConfig(database, channel)).resolves.toEqual({
      chatId: '-100',
      botToken: 'sk-secret-token',
    });
  });
});

describe('updateShareChannel', () => {
  it('preserves the stored secret when the update omits it', async () => {
    const { database } = createFakeDatabase();
    const channel = await createShareChannel(database, input());

    await updateShareChannel(
      database,
      channel.id,
      input({ config: { public: { chatId: '-200' }, secret: {} } }),
    );

    const config = await readChannelConfig(database, await getShareChannel(database, channel.id));
    expect(config).toEqual({ chatId: '-200', botToken: 'sk-secret-token' });
  });

  it('replaces the secret when a new one is provided', async () => {
    const { database } = createFakeDatabase();
    const channel = await createShareChannel(database, input());

    await updateShareChannel(
      database,
      channel.id,
      input({ config: { public: { chatId: '-200' }, secret: { botToken: 'sk-rotated' } } }),
    );

    const config = await readChannelConfig(database, await getShareChannel(database, channel.id));
    expect(config.botToken).toBe('sk-rotated');
  });
});

describe('deleteShareChannel', () => {
  it('clears the stored secret and its outbox rows', async () => {
    const { database, deletes } = createFakeDatabase();
    const channel = await createShareChannel(database, input());

    await deleteShareChannel(database, channel.id);

    expect(deletes).toEqual([`outbox:${channel.id}`, `channel:${channel.id}`]);
    await expect(getShareChannel(database, channel.id)).rejects.toMatchObject({
      code: 'SHARE_CHANNEL_NOT_FOUND',
    });
  });
});
