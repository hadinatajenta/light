const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

const MONTH_DAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const MONTH_DAY_YEAR_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatDate(date: Date): string {
  return DATE_FORMATTER.format(date);
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatDateRange(start: Date, end: Date): string {
  return `${MONTH_DAY_FORMATTER.format(start)} - ${MONTH_DAY_YEAR_FORMATTER.format(end)}`;
}

export function formatShortDate(date: Date): string {
  return MONTH_DAY_FORMATTER.format(date);
}

export function formatRelativeTime(isoTimestamp: string, now = Date.now()): string {
  const timestamp = new Date(isoTimestamp).getTime();
  if (Number.isNaN(timestamp)) {
    return 'unknown';
  }

  const elapsedMinutes = Math.floor((now - timestamp) / 60_000);
  if (elapsedMinutes < 1) {
    return 'just now';
  }
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) {
    return `${elapsedDays}d ago`;
  }

  const elapsedWeeks = Math.floor(elapsedDays / 7);
  if (elapsedWeeks < 5) {
    return `${elapsedWeeks}w ago`;
  }

  return formatDate(new Date(timestamp));
}
