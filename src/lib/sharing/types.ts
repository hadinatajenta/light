export const SHARE_PROVIDERS = ['telegram', 'bluesky', 'discord', 'mastodon', 'pinterest'] as const;
export type ShareProvider = (typeof SHARE_PROVIDERS)[number];

export const SHARE_STATUSES = [
  'pending',
  'sending',
  'sent',
  'failed',
  'awaiting_approval',
  'skipped',
] as const;
export type ShareStatus = (typeof SHARE_STATUSES)[number];

export type AdapterOutcome =
  | 'success'
  | 'channel_config'
  | 'invalid_payload'
  | 'rate_limited'
  | 'transient';

export const SHARE_BACKFILL_CUTOFF_SETTING = 'share_backfill_cutoff';
export const SHARE_PAUSED_SETTING = 'share_paused';
export const SHARE_MAX_AGE_DAYS_SETTING = 'share_max_age_days';
export const DEFAULT_SHARE_MAX_AGE_DAYS = 14;

export const SHARE_MAX_FAILURES = 5;
export const SHARE_STALE_MS = 10 * 60 * 1000;
export const SHARE_MAX_RETRY_AFTER_MS = 60 * 60 * 1000;

export interface ShareChannel {
  id: string;
  provider: ShareProvider;
  label: string;
  enabled: boolean;
  config: Record<string, string>;
  secretKeys: string[];
  dailyCap: number | null;
  requireApproval: boolean;
  needsAttention: boolean;
  pausedUntil: string | null;
  startedAt: string | null;
  lastError: string | null;
  lastSuccessAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShareChannelConfigInput {
  public: Record<string, string>;
  secret: Record<string, string>;
}

export interface ShareChannelInput {
  provider: ShareProvider;
  label: string;
  enabled: boolean;
  config: ShareChannelConfigInput;
  dailyCap: number | null;
  requireApproval: boolean;
}

export interface ShareJob {
  id: string;
  postId: string;
  channelId: string;
  status: ShareStatus;
  attempts: number;
  failures: number;
  rateLimitHits: number;
  nextAttemptAt: string;
  ageResetAt: string | null;
  lockedAt: string | null;
  providerPostId: string | null;
  sharedUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SharePostContent {
  id: string;
  title: string;
  description: string;
  body: string;
  coverUrl: string | null;
  affiliate: boolean;
}

export interface ShareMessage {
  text: string;
  photoUrl: string | null;
}

export interface AdapterResult {
  outcome: AdapterOutcome;
  providerPostId?: string;
  retryAfterMs?: number;
  channelLevelRateLimit?: boolean;
  error?: string;
}

export interface ShareSendRequest {
  channel: ShareChannel;
  config: Record<string, string>;
  post: SharePostContent;
  message: ShareMessage;
  url: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export interface ShareAdapter {
  send(request: ShareSendRequest): Promise<AdapterResult>;
}
