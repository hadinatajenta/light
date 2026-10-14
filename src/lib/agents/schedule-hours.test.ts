import { describe, expect, it } from 'vitest';
import {
  MAX_SCHEDULE_HOURS,
  nextScheduledHourRun,
  parseScheduleHours,
  SCHEDULE_HOURS_TIME_ZONE,
  serializeScheduleHours,
} from './schedule-hours';

const HOUR_MS = 60 * 60 * 1000;

function iso(value: string): string {
  return new Date(value).toISOString();
}

describe('parseScheduleHours', () => {
  it('reads the stored comma separated list', () => {
    expect(parseScheduleHours('6,12,18')).toEqual([6, 12, 18]);
  });

  it('reads an array from the request payload', () => {
    expect(parseScheduleHours([6, 12, 18])).toEqual([6, 12, 18]);
  });

  it('sorts and de-duplicates the hours', () => {
    expect(parseScheduleHours('18,6,12,6')).toEqual([6, 12, 18]);
  });

  it('accepts a zero padded hour', () => {
    expect(parseScheduleHours('06,12,18')).toEqual([6, 12, 18]);
  });

  it('drops values outside a day', () => {
    expect(parseScheduleHours('24,25,-1,7')).toEqual([7]);
    expect(parseScheduleHours([24, 6, 6.5, Number.NaN])).toEqual([6]);
  });

  it('returns an empty list for absent or unreadable values', () => {
    expect(parseScheduleHours(null)).toEqual([]);
    expect(parseScheduleHours(undefined)).toEqual([]);
    expect(parseScheduleHours('')).toEqual([]);
    expect(parseScheduleHours('morning')).toEqual([]);
    expect(parseScheduleHours('6.5,12.25')).toEqual([]);
    expect(parseScheduleHours({ hours: 6 })).toEqual([]);
  });

  it('caps the number of hours in a day', () => {
    const everyHour = Array.from({ length: 30 }, (_value, index) => index % 24);

    expect(parseScheduleHours(everyHour)).toHaveLength(MAX_SCHEDULE_HOURS);
  });
});

describe('serializeScheduleHours', () => {
  it('writes the comma separated form', () => {
    expect(serializeScheduleHours([6, 12, 18])).toBe('6,12,18');
    expect(serializeScheduleHours('18,6,12')).toBe('6,12,18');
  });

  it('writes null when no hour is configured', () => {
    expect(serializeScheduleHours([])).toBeNull();
    expect(serializeScheduleHours(null)).toBeNull();
    expect(serializeScheduleHours('not an hour')).toBeNull();
  });

  it('round trips through parse', () => {
    const serialized = serializeScheduleHours([6, 12, 18]);

    expect(parseScheduleHours(serialized)).toEqual([6, 12, 18]);
  });
});

describe('nextScheduledHourRun', () => {
  it('names Asia/Jakarta as the schedule time zone', () => {
    expect(SCHEDULE_HOURS_TIME_ZONE).toBe('Asia/Jakarta');
  });

  it('returns the next hour later on the same Jakarta day', () => {
    const from = new Date('2026-10-13T00:30:00.000Z');

    expect(nextScheduledHourRun([6, 12, 18], from)?.toISOString()).toBe(
      iso('2026-10-13T05:00:00.000Z'),
    );
  });

  it('resolves the Jakarta morning on the boundary of the UTC day', () => {
    const from = new Date('2026-10-13T22:59:00.000Z');

    expect(nextScheduledHourRun([6, 12, 18], from)?.toISOString()).toBe(
      iso('2026-10-13T23:00:00.000Z'),
    );
  });

  it('treats a Jakarta hour that already passed in UTC as the next occurrence', () => {
    const from = new Date('2026-10-13T17:30:00.000Z');

    expect(nextScheduledHourRun([6, 12, 18], from)?.toISOString()).toBe(
      iso('2026-10-13T23:00:00.000Z'),
    );
  });

  it('never returns the hour it is standing on', () => {
    const from = new Date('2026-10-13T23:00:00.000Z');

    expect(nextScheduledHourRun([6, 12, 18], from)?.toISOString()).toBe(
      iso('2026-10-14T05:00:00.000Z'),
    );
  });

  it('rolls over to the next Jakarta day after the last hour', () => {
    const from = new Date('2026-10-13T12:00:00.000Z');

    expect(nextScheduledHourRun([6, 12, 18], from)?.toISOString()).toBe(
      iso('2026-10-13T23:00:00.000Z'),
    );
  });

  it('rolls over from the last minute before midnight', () => {
    const from = new Date('2026-10-13T16:59:00.000Z');

    expect(nextScheduledHourRun([0, 6], from)?.toISOString()).toBe(iso('2026-10-13T17:00:00.000Z'));
  });

  it('never returns an instant in the past, across every Jakarta hour', () => {
    const hours = Array.from({ length: 24 }, (_value, index) => index);
    const start = Date.parse('2026-10-13T00:00:00.000Z');

    for (let offset = 0; offset < 24 * HOUR_MS; offset += 7 * 60 * 1000 + 1) {
      const from = new Date(start + offset);
      const next = nextScheduledHourRun(hours, from);

      expect(next).not.toBeNull();
      expect(next?.getTime()).toBeGreaterThan(from.getTime());
    }
  });

  it('returns null when no usable hour is configured', () => {
    expect(nextScheduledHourRun([], new Date('2026-10-13T00:00:00.000Z'))).toBeNull();
    expect(nextScheduledHourRun([30], new Date('2026-10-13T00:00:00.000Z'))).toBeNull();
  });
});
