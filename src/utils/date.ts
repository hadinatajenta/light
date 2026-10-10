const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

export function formatDate(date: Date): string {
  return DATE_FORMATTER.format(date);
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
