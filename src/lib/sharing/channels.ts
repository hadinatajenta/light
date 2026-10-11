import { decryptSecret, encryptSecret } from '../agents/secrets';
import { ApiError } from '../errors';
import { getSetting, setSetting } from '../settings/store';
import {
  SHARE_BACKFILL_CUTOFF_SETTING,
  SHARE_PROVIDERS,
  type ShareChannel,
  type ShareChannelInput,
  type ShareProvider,
} from './types';

interface ProviderFieldSpec {
  key: string;
  secret: boolean;
}

interface StoredChannelConfig {
  public: Record<string, string>;
  secret: Record<string, string>;
}

interface ShareChannelRow {
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

const PROVIDER_CONFIG_FIELDS: Record<ShareProvider, ProviderFieldSpec[]> = {
  telegram: [
    { key: 'botToken', secret: true },
    { key: 'chatId', secret: false },
  ],
};

function providerFields(provider: ShareProvider): ProviderFieldSpec[] {
  return PROVIDER_CONFIG_FIELDS[provider];
}

export function isShareProvider(value: string): value is ShareProvider {
  return (SHARE_PROVIDERS as readonly string[]).includes(value);
}

function readStoredConfig(raw: string): StoredChannelConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { public: {}, secret: {} };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { public: {}, secret: {} };
  }

  const record = parsed as Record<string, unknown>;
  const publicFields: Record<string, string> = {};
  const secretFields: Record<string, string> = {};

  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== 'string') {
      continue;
    }

    if (key === 'public' || key === 'secret') {
      continue;
    }

    publicFields[key] = value;
  }

  const nestedPublic = record.public;
  if (typeof nestedPublic === 'object' && nestedPublic !== null) {
    for (const [key, value] of Object.entries(nestedPublic)) {
      if (typeof value === 'string') {
        publicFields[key] = value;
      }
    }
  }

  const nestedSecret = record.secret;
  if (typeof nestedSecret === 'object' && nestedSecret !== null) {
    for (const [key, value] of Object.entries(nestedSecret)) {
      if (typeof value === 'string') {
        secretFields[key] = value;
      }
    }
  }

  return { public: publicFields, secret: secretFields };
}

function toChannel(row: ShareChannelRow): ShareChannel {
  const stored = readStoredConfig(row.config);

  return {
    id: row.id,
    provider: isShareProvider(row.provider) ? row.provider : 'telegram',
    label: row.label,
    enabled: row.enabled === 1,
    config: stored.public,
    secretKeys: Object.keys(stored.secret),
    dailyCap: row.daily_cap,
    requireApproval: row.require_approval === 1,
    needsAttention: row.needs_attention === 1,
    pausedUntil: row.paused_until,
    startedAt: row.started_at,
    lastError: row.last_error,
    lastSuccessAt: row.last_success_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireProvider(provider: string): ShareProvider {
  if (!isShareProvider(provider)) {
    throw new ApiError(422, 'INVALID_PROVIDER', 'That sharing provider is not supported.');
  }

  return provider;
}

function readFieldValue(
  field: ProviderFieldSpec,
  input: ShareChannelInput['config'],
): string | undefined {
  const source = field.secret ? input.secret : input.public;
  const value = source[field.key];
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }

  return value;
}

function assertRequiredFields(provider: ShareProvider, config: StoredChannelConfig): void {
  const missing: string[] = [];

  for (const field of providerFields(provider)) {
    const presence = field.secret ? config.secret[field.key] : config.public[field.key];
    if (!presence) {
      missing.push(field.key);
    }
  }

  if (missing.length > 0) {
    throw new ApiError(
      422,
      'INVALID_CHANNEL_CONFIG',
      `Missing required channel fields: ${missing.join(', ')}.`,
    );
  }
}

async function buildStoredConfig(
  provider: ShareProvider,
  input: ShareChannelInput['config'],
): Promise<StoredChannelConfig> {
  const stored: StoredChannelConfig = { public: {}, secret: {} };

  for (const field of providerFields(provider)) {
    const value = readFieldValue(field, input);
    if (value === undefined) {
      continue;
    }

    if (field.secret) {
      stored.secret[field.key] = await encryptSecret(value);
    } else {
      stored.public[field.key] = value;
    }
  }

  assertRequiredFields(provider, stored);
  return stored;
}

async function mergeStoredConfig(
  provider: ShareProvider,
  existing: StoredChannelConfig,
  input: ShareChannelInput['config'],
): Promise<StoredChannelConfig> {
  const stored: StoredChannelConfig = {
    public: { ...existing.public },
    secret: { ...existing.secret },
  };

  for (const field of providerFields(provider)) {
    const value = readFieldValue(field, input);
    if (value === undefined) {
      continue;
    }

    if (field.secret) {
      stored.secret[field.key] = await encryptSecret(value);
    } else {
      stored.public[field.key] = value;
    }
  }

  assertRequiredFields(provider, stored);
  return stored;
}

async function captureBackfillCutoff(db: D1Database, nowIso: string): Promise<void> {
  const existing = await getSetting(db, SHARE_BACKFILL_CUTOFF_SETTING);
  if (existing) {
    return;
  }

  await setSetting(db, SHARE_BACKFILL_CUTOFF_SETTING, nowIso);
}

export async function listShareChannels(db: D1Database): Promise<ShareChannel[]> {
  const result = await db
    .prepare('SELECT * FROM share_channels ORDER BY created_at ASC')
    .all<ShareChannelRow>();

  return (result.results ?? []).map(toChannel);
}

export async function getShareChannel(db: D1Database, id: string): Promise<ShareChannel> {
  const row = await db
    .prepare('SELECT * FROM share_channels WHERE id = ?')
    .bind(id)
    .first<ShareChannelRow>();

  if (!row) {
    throw new ApiError(404, 'SHARE_CHANNEL_NOT_FOUND', 'That sharing channel does not exist.');
  }

  return toChannel(row);
}

export async function createShareChannel(
  db: D1Database,
  input: ShareChannelInput,
): Promise<ShareChannel> {
  const provider = requireProvider(input.provider);
  const label = input.label.trim();
  if (label === '') {
    throw new ApiError(422, 'INVALID_CHANNEL_LABEL', 'A channel label is required.');
  }

  const stored = await buildStoredConfig(provider, input.config);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const startedAt = input.enabled ? now : null;

  await db
    .prepare(
      `INSERT INTO share_channels (id, provider, label, enabled, config, daily_cap,
        require_approval, needs_attention, paused_until, started_at, last_error, last_success_at,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, NULL, NULL, ?, ?)`,
    )
    .bind(
      id,
      provider,
      label,
      input.enabled ? 1 : 0,
      JSON.stringify(stored),
      input.dailyCap,
      input.requireApproval ? 1 : 0,
      startedAt,
      now,
      now,
    )
    .run();

  if (input.enabled) {
    await captureBackfillCutoff(db, now);
  }

  return getShareChannel(db, id);
}

export async function updateShareChannel(
  db: D1Database,
  id: string,
  input: ShareChannelInput,
): Promise<ShareChannel> {
  const existing = await getShareChannel(db, id);
  const provider = requireProvider(input.provider);
  const label = input.label.trim();
  if (label === '') {
    throw new ApiError(422, 'INVALID_CHANNEL_LABEL', 'A channel label is required.');
  }

  const rawRow = await db
    .prepare('SELECT config FROM share_channels WHERE id = ?')
    .bind(id)
    .first<{ config: string }>();
  const currentStored = readStoredConfig(rawRow?.config ?? '{}');
  const stored = await mergeStoredConfig(provider, currentStored, input.config);

  const now = new Date().toISOString();
  const startedAt = existing.startedAt ?? (input.enabled ? now : null);

  await db
    .prepare(
      `UPDATE share_channels SET provider = ?, label = ?, enabled = ?, config = ?, daily_cap = ?,
        require_approval = ?, needs_attention = 0, started_at = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(
      provider,
      label,
      input.enabled ? 1 : 0,
      JSON.stringify(stored),
      input.dailyCap,
      input.requireApproval ? 1 : 0,
      startedAt,
      now,
      id,
    )
    .run();

  if (input.enabled && !existing.startedAt) {
    await captureBackfillCutoff(db, now);
  }

  return getShareChannel(db, id);
}

export async function deleteShareChannel(db: D1Database, id: string): Promise<void> {
  await getShareChannel(db, id);
  await db.prepare('DELETE FROM share_outbox WHERE channel_id = ?').bind(id).run();
  await db.prepare('DELETE FROM share_channels WHERE id = ?').bind(id).run();
}

export async function readChannelConfig(
  db: D1Database,
  channel: ShareChannel,
): Promise<Record<string, string>> {
  const row = await db
    .prepare('SELECT config FROM share_channels WHERE id = ?')
    .bind(channel.id)
    .first<{ config: string }>();

  if (!row) {
    throw new ApiError(404, 'SHARE_CHANNEL_NOT_FOUND', 'That sharing channel does not exist.');
  }

  const stored = readStoredConfig(row.config);
  const resolved: Record<string, string> = { ...stored.public };

  for (const [key, payload] of Object.entries(stored.secret)) {
    resolved[key] = await decryptSecret(payload);
  }

  return resolved;
}

export async function listShareableChannels(db: D1Database): Promise<ShareChannel[]> {
  const result = await db
    .prepare('SELECT * FROM share_channels WHERE enabled = 1 ORDER BY created_at ASC')
    .all<ShareChannelRow>();

  return (result.results ?? []).map(toChannel);
}

export async function setChannelNeedsAttention(
  db: D1Database,
  id: string,
  needsAttention: boolean,
  error?: string,
): Promise<void> {
  await db
    .prepare(
      'UPDATE share_channels SET needs_attention = ?, last_error = ?, updated_at = ? WHERE id = ?',
    )
    .bind(needsAttention ? 1 : 0, error ?? null, new Date().toISOString(), id)
    .run();
}

export async function setChannelPausedUntil(
  db: D1Database,
  id: string,
  untilIso: string | null,
): Promise<void> {
  await db
    .prepare('UPDATE share_channels SET paused_until = ?, updated_at = ? WHERE id = ?')
    .bind(untilIso, new Date().toISOString(), id)
    .run();
}

export async function touchChannelSuccess(db: D1Database, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      'UPDATE share_channels SET last_success_at = ?, last_error = NULL, updated_at = ? WHERE id = ?',
    )
    .bind(now, now, id)
    .run();
}
