import { describe, expect, it } from 'vitest';
import {
  buildNotificationDedupeKey,
  NOTIFICATION_PUSH_EVENTS,
  NOTIFICATION_RULES,
  resolveNotificationRule,
} from './rules';
import { NOTIFICATION_EVENTS } from './types';

describe('resolveNotificationRule', () => {
  it('returns the declared rule for a known event', () => {
    expect(resolveNotificationRule('post.published')).toEqual({
      level: 'success',
      category: 'content',
      push: true,
      dedupeWindowSeconds: 0,
    });
  });

  it('falls back to a silent rule for an unknown event', () => {
    const rule = resolveNotificationRule('not.a.real.event');

    expect(rule.push).toBe(false);
    expect(rule.level).toBe('info');
    expect(rule.category).toBe('system');
  });
});

describe('NOTIFICATION_RULES', () => {
  it('declares a rule for every catalogued event', () => {
    for (const event of NOTIFICATION_EVENTS) {
      expect(NOTIFICATION_RULES[event]).toBeDefined();
    }
  });

  it('pushes only the events that matter outside the dashboard', () => {
    expect(NOTIFICATION_PUSH_EVENTS).toEqual([
      'agent.run.started',
      'agent.run.failed',
      'agent.run.stale',
      'agent.alert',
      'deepseek.unavailable',
      'post.published',
      'post.revision.exhausted',
      'budget.warning',
      'analyst.findings.ready',
      'analyst.sources.degraded',
    ]);
  });

  it('lets an operator watch agents start, but keeps finished runs in the dashboard', () => {
    expect(NOTIFICATION_RULES['agent.run.started'].push).toBe(true);
    expect(NOTIFICATION_RULES['agent.run.succeeded'].push).toBe(false);
  });

  it('does not throttle a run start, so every run is reported', () => {
    expect(NOTIFICATION_RULES['agent.run.started'].dedupeWindowSeconds).toBe(0);
  });

  it('throttles repeated failures but reports every publish', () => {
    expect(NOTIFICATION_RULES['agent.run.failed'].dedupeWindowSeconds).toBe(3600);
    expect(NOTIFICATION_RULES['deepseek.unavailable'].dedupeWindowSeconds).toBe(1800);
    expect(NOTIFICATION_RULES['post.published'].dedupeWindowSeconds).toBe(0);
  });

  it('pushes a parked draft to the operator as a warning', () => {
    expect(NOTIFICATION_RULES['post.revision.exhausted']).toEqual({
      level: 'warning',
      category: 'content',
      push: true,
      dedupeWindowSeconds: 0,
    });
  });
});

describe('buildNotificationDedupeKey', () => {
  it('returns no key when the rule does not throttle', () => {
    expect(buildNotificationDedupeKey('post.published', 'post-1', 0)).toBeNull();
  });

  it('keys on the event when no subject is supplied', () => {
    expect(buildNotificationDedupeKey('budget.warning', undefined, 3600)).toBe('budget.warning');
  });

  it('scopes the key to the subject', () => {
    expect(buildNotificationDedupeKey('agent.run.failed', 'agent-7:502', 3600)).toBe(
      'agent.run.failed:agent-7:502',
    );
  });
});
