import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFICATION_DASHBOARD_URL,
  normalizeNotificationDashboardUrl,
  normalizeNotificationEmail,
  normalizeNotificationEvents,
} from './settings';

describe('normalizeNotificationEmail', () => {
  it('trims and lowercases so two spellings cannot become two recipients', () => {
    expect(normalizeNotificationEmail('  Ops@Example.COM  ')).toBe('ops@example.com');
  });
});

describe('normalizeNotificationDashboardUrl', () => {
  it('drops trailing slashes so links never double up', () => {
    expect(normalizeNotificationDashboardUrl('https://admin.example.com///')).toBe(
      'https://admin.example.com',
    );
  });

  it('falls back to the default when the value is empty', () => {
    expect(normalizeNotificationDashboardUrl('   ')).toBe(DEFAULT_NOTIFICATION_DASHBOARD_URL);
  });
});

describe('normalizeNotificationEvents', () => {
  it('keeps only known events with boolean values', () => {
    expect(
      normalizeNotificationEvents({
        'post.published': false,
        'budget.warning': true,
        'agent.run.started': 'yes',
        'not.a.real.event': true,
      }),
    ).toEqual({ 'post.published': false, 'budget.warning': true });
  });

  it('returns an empty map for missing input', () => {
    expect(normalizeNotificationEvents(undefined)).toEqual({});
  });
});
