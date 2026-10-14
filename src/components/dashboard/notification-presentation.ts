import type {
  NotificationCategory,
  NotificationEvent,
  NotificationLevel,
} from '@/lib/notifications/types';

export const NOTIFICATION_LEVEL_LABELS: Record<NotificationLevel, string> = {
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
};

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  agent: 'Agents',
  content: 'Content',
  budget: 'Budget',
  system: 'System',
};

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEvent, string> = {
  'agent.run.started': 'An agent starts a run',
  'agent.run.succeeded': 'An agent finishes a run',
  'agent.run.failed': 'An agent run fails',
  'agent.run.stale': 'A run is closed automatically',
  'agent.alert': 'An agent fails three runs in a row',
  'deepseek.unavailable': 'DeepSeek rejects a request',
  'post.published': 'A post is published',
  'post.revision.exhausted': 'A draft hits the revision limit and needs a human decision',
  'budget.warning': 'Search budget runs low',
  'share.channel.attention': 'A sharing channel needs attention',
  'analyst.findings.ready': 'The performance analyst stores findings',
  'analyst.sources.degraded': 'A data source the analyst needs is missing',
};

const LEVEL_DOT_CLASSES: Record<NotificationLevel, string> = {
  info: 'bg-chart-1',
  success: 'bg-chart-2',
  warning: 'bg-chart-3',
  error: 'bg-destructive',
};

const LEVEL_ROW_CLASSES: Record<NotificationLevel, string> = {
  info: 'border-border',
  success: 'border-border',
  warning: 'border-border',
  error: 'border-destructive/40',
};

export function notificationLevelDotClass(level: NotificationLevel): string {
  return LEVEL_DOT_CLASSES[level];
}

export function notificationLevelRowClass(level: NotificationLevel): string {
  return LEVEL_ROW_CLASSES[level];
}

export function isUnreadNotification(readAt: string | null): boolean {
  return readAt === null;
}

export function shouldUpdateNotificationReadState(
  readAt: string | null,
  shouldBeRead: boolean,
): boolean {
  return shouldBeRead === isUnreadNotification(readAt);
}
