const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface RecencyCounts {
  total: number;
  recent: number;
  previous: number;
}

export function countByRecency(
  dates: (string | null)[],
  days: number,
  now = Date.now(),
): RecencyCounts {
  const windowMs = days * DAY_IN_MS;
  const counts: RecencyCounts = { total: 0, recent: 0, previous: 0 };

  for (const rawDate of dates) {
    if (!rawDate) {
      continue;
    }

    const timestamp = new Date(rawDate).getTime();
    if (Number.isNaN(timestamp)) {
      continue;
    }

    counts.total += 1;
    const age = now - timestamp;
    if (age < 0) {
      continue;
    }

    if (age < windowMs) {
      counts.recent += 1;
    } else if (age < windowMs * 2) {
      counts.previous += 1;
    }
  }

  return counts;
}

export interface DailySeries {
  days: string[];
  values: number[];
}

export function buildDailySeriesBuckets(
  dates: (string | null)[],
  days: number,
  now = Date.now(),
): DailySeries {
  const values = Array.from({ length: days }, () => 0);

  for (const rawDate of dates) {
    if (!rawDate) {
      continue;
    }

    const timestamp = new Date(rawDate).getTime();
    if (Number.isNaN(timestamp)) {
      continue;
    }

    const daysAgo = Math.floor((now - timestamp) / DAY_IN_MS);
    if (daysAgo < 0 || daysAgo >= days) {
      continue;
    }

    values[days - 1 - daysAgo] += 1;
  }

  const dayKeys = Array.from({ length: days }, (_, index) =>
    new Date(now - (days - 1 - index) * DAY_IN_MS).toISOString().slice(0, 10),
  );

  return { days: dayKeys, values };
}

export function buildDailySeries(
  dates: (string | null)[],
  days: number,
  now = Date.now(),
): number[] {
  return buildDailySeriesBuckets(dates, days, now).values;
}

export function formatDelta(current: number, previous: number): string {
  const difference = current - previous;
  if (difference === 0) {
    return 'No change';
  }

  return difference > 0 ? `+${difference}` : `${difference}`;
}
