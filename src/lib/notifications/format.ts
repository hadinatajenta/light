import type { NotificationCategory, NotificationLevel } from './types';

export const NOTIFICATION_SUBJECT_MAX_LENGTH = 160;
export const NOTIFICATION_BODY_MAX_LENGTH = 1200;
export const NOTIFICATION_TELEGRAM_MAX_LENGTH = 3500;

const LEVEL_LABELS: Record<NotificationLevel, string> = {
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
};

const LEVEL_MARKERS: Record<NotificationLevel, string> = {
  info: '🔵',
  success: '🟢',
  warning: '🟡',
  error: '🔴',
};

const TAB = 0x09;
const LINE_FEED = 0x0a;
const DELETE = 0x7f;
const ZERO_WIDTH_RANGE = [0x200b, 0x200f] as const;
const BIDI_RANGE = [0x202a, 0x202e] as const;
const ISOLATE_RANGE = [0x2066, 0x2069] as const;
const BYTE_ORDER_MARK = 0xfeff;

function isDisallowedCharacter(codePoint: number): boolean {
  if (codePoint === TAB || codePoint === LINE_FEED) {
    return false;
  }

  if (codePoint <= 0x1f || codePoint === DELETE) {
    return true;
  }

  return (
    (codePoint >= ZERO_WIDTH_RANGE[0] && codePoint <= ZERO_WIDTH_RANGE[1]) ||
    (codePoint >= BIDI_RANGE[0] && codePoint <= BIDI_RANGE[1]) ||
    (codePoint >= ISOLATE_RANGE[0] && codePoint <= ISOLATE_RANGE[1]) ||
    codePoint === BYTE_ORDER_MARK
  );
}

function stripDisallowedCharacters(value: string): string {
  let stripped = '';

  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || isDisallowedCharacter(codePoint)) {
      continue;
    }

    stripped += character;
  }

  return stripped;
}

export interface NotificationMessageSource {
  level: NotificationLevel;
  category: NotificationCategory;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
}

export function sanitizeNotificationText(value: string, maxLength: number): string {
  const normalized = stripDisallowedCharacters(value.replace(/\r\n?/g, '\n'))
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function escapeNotificationHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatNotificationSubject(source: NotificationMessageSource): string {
  const prefix = `[Light] ${LEVEL_LABELS[source.level]}: `;
  const title = sanitizeNotificationText(
    source.title,
    NOTIFICATION_SUBJECT_MAX_LENGTH - prefix.length,
  );

  return `${prefix}${title}`;
}

export function formatNotificationTimestamp(createdAt: string): string {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return createdAt;
  }

  return `${parsed.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function formatNotificationText(source: NotificationMessageSource): string {
  const title = sanitizeNotificationText(source.title, NOTIFICATION_SUBJECT_MAX_LENGTH);
  const lines = [`${LEVEL_MARKERS[source.level]} ${title}`];

  if (source.body) {
    lines.push('', sanitizeNotificationText(source.body, NOTIFICATION_BODY_MAX_LENGTH));
  }

  lines.push(
    '',
    `Category: ${source.category}`,
    `Time: ${formatNotificationTimestamp(source.createdAt)}`,
  );

  if (source.link) {
    lines.push(`Open: ${source.link}`);
  }

  return sanitizeNotificationText(lines.join('\n'), NOTIFICATION_TELEGRAM_MAX_LENGTH);
}

export function formatNotificationHtml(source: NotificationMessageSource): string {
  const text = formatNotificationText(source);
  const paragraphs = text.split('\n\n').map((paragraph) => escapeNotificationHtml(paragraph));

  return paragraphs
    .map((paragraph) => `<p style="margin:0 0 12px">${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('');
}
