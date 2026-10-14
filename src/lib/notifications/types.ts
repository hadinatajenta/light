export const NOTIFICATION_LEVELS = ['info', 'success', 'warning', 'error'] as const;
export type NotificationLevel = (typeof NOTIFICATION_LEVELS)[number];

export const NOTIFICATION_CATEGORIES = ['agent', 'content', 'budget', 'system'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_EVENTS = [
  'agent.run.started',
  'agent.run.succeeded',
  'agent.run.failed',
  'agent.run.stale',
  'agent.alert',
  'deepseek.unavailable',
  'post.published',
  'post.revision.exhausted',
  'budget.warning',
  'share.channel.attention',
  'analyst.findings.ready',
  'analyst.sources.degraded',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const NOTIFICATION_PUSH_STATUSES = ['skipped', 'sent', 'failed'] as const;
export type NotificationPushStatus = (typeof NOTIFICATION_PUSH_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ['email', 'telegram'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_MAX_PUSH_ATTEMPTS = 3;

export interface NotificationRule {
  level: NotificationLevel;
  category: NotificationCategory;
  push: boolean;
  dedupeWindowSeconds: number;
}

export interface NotificationRecord {
  id: string;
  level: NotificationLevel;
  category: NotificationCategory;
  event: NotificationEvent;
  title: string;
  body: string | null;
  link: string | null;
  metadata: Record<string, unknown> | null;
  actorLabel: string | null;
  runId: string | null;
  dedupeKey: string | null;
  pushStatus: NotificationPushStatus;
  pushChannel: string | null;
  pushError: string | null;
  pushAttempts: number;
  pushedAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationInput {
  event: NotificationEvent;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
  actorLabel?: string;
  runId?: string;
  dedupeSubject?: string;
}

export interface NotificationListOptions {
  level?: NotificationLevel;
  category?: NotificationCategory;
  unreadOnly?: boolean;
  limit: number;
  cursor?: string;
}

export interface NotificationPage {
  items: NotificationRecord[];
  nextCursor: string | null;
  hasMore: boolean;
}
