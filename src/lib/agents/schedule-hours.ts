import { WIB_OFFSET_MS } from './quota';

export const SCHEDULE_HOURS_TIME_ZONE = 'Asia/Jakarta';
export const MAX_SCHEDULE_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HOUR_PATTERN = /^\d{1,2}$/;

function readHour(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 && value <= 23 ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (!HOUR_PATTERN.test(trimmed)) {
    return null;
  }

  const hour = Number.parseInt(trimmed, 10);
  return hour <= 23 ? hour : null;
}

export function parseScheduleHours(value: unknown): number[] {
  const entries = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const hours = new Set<number>();

  for (const entry of entries) {
    const hour = readHour(entry);

    if (hour === null) {
      continue;
    }

    hours.add(hour);

    if (hours.size >= MAX_SCHEDULE_HOURS) {
      break;
    }
  }

  return [...hours].sort((left, right) => left - right);
}

export function serializeScheduleHours(value: unknown): string | null {
  const hours = parseScheduleHours(value);

  return hours.length > 0 ? hours.join(',') : null;
}

export function nextScheduledHourRun(
  hours: readonly number[],
  from: Date = new Date(),
): Date | null {
  const sorted = parseScheduleHours([...hours]);
  const firstHour = sorted[0];

  if (firstHour === undefined) {
    return null;
  }

  const fromMs = from.getTime();
  const jakartaNow = new Date(fromMs + WIB_OFFSET_MS);
  const jakartaDayStartMs = Date.UTC(
    jakartaNow.getUTCFullYear(),
    jakartaNow.getUTCMonth(),
    jakartaNow.getUTCDate(),
  );

  for (const hour of sorted) {
    const candidateMs = jakartaDayStartMs + hour * HOUR_MS - WIB_OFFSET_MS;

    if (candidateMs > fromMs) {
      return new Date(candidateMs);
    }
  }

  return new Date(jakartaDayStartMs + DAY_MS + firstHour * HOUR_MS - WIB_OFFSET_MS);
}
