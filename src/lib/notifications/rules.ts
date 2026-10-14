import { NOTIFICATION_EVENTS, type NotificationEvent, type NotificationRule } from './types';

const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 60 * MINUTE_SECONDS;
const DAY_SECONDS = 24 * HOUR_SECONDS;

export const NOTIFICATION_RULES: Record<NotificationEvent, NotificationRule> = {
  'agent.run.started': {
    level: 'info',
    category: 'agent',
    push: true,
    dedupeWindowSeconds: 0,
  },
  'agent.run.succeeded': {
    level: 'success',
    category: 'agent',
    push: false,
    dedupeWindowSeconds: 0,
  },
  'agent.run.failed': {
    level: 'error',
    category: 'agent',
    push: true,
    dedupeWindowSeconds: HOUR_SECONDS,
  },
  'agent.run.stale': {
    level: 'warning',
    category: 'agent',
    push: true,
    dedupeWindowSeconds: 0,
  },
  'agent.alert': {
    level: 'error',
    category: 'agent',
    push: true,
    dedupeWindowSeconds: 6 * HOUR_SECONDS,
  },
  'deepseek.unavailable': {
    level: 'error',
    category: 'system',
    push: true,
    dedupeWindowSeconds: 30 * MINUTE_SECONDS,
  },
  'post.published': {
    level: 'success',
    category: 'content',
    push: true,
    dedupeWindowSeconds: 0,
  },
  'post.revision.exhausted': {
    level: 'warning',
    category: 'content',
    push: true,
    dedupeWindowSeconds: 0,
  },
  'budget.warning': {
    level: 'warning',
    category: 'budget',
    push: true,
    dedupeWindowSeconds: 0,
  },
  'share.channel.attention': {
    level: 'warning',
    category: 'system',
    push: false,
    dedupeWindowSeconds: 6 * HOUR_SECONDS,
  },
  'analyst.findings.ready': {
    level: 'success',
    category: 'agent',
    push: true,
    dedupeWindowSeconds: 6 * HOUR_SECONDS,
  },
  'analyst.sources.degraded': {
    level: 'warning',
    category: 'system',
    push: true,
    dedupeWindowSeconds: 7 * DAY_SECONDS,
  },
};

export const NOTIFICATION_DEFAULT_RULE: NotificationRule = {
  level: 'info',
  category: 'system',
  push: false,
  dedupeWindowSeconds: 0,
};

export const NOTIFICATION_PUSH_EVENTS: NotificationEvent[] = NOTIFICATION_EVENTS.filter(
  (event) => NOTIFICATION_RULES[event].push,
);

export function resolveNotificationRule(event: string): NotificationRule {
  return NOTIFICATION_RULES[event as NotificationEvent] ?? NOTIFICATION_DEFAULT_RULE;
}

export function buildNotificationDedupeKey(
  event: string,
  subject: string | undefined,
  dedupeWindowSeconds: number,
): string | null {
  if (dedupeWindowSeconds <= 0) {
    return null;
  }

  return subject ? `${event}:${subject}` : event;
}
