import { describe, expect, it } from 'vitest';
import type { NotificationChannelResult } from './channels/types';
import {
  buildNotificationUrl,
  runWithDeadline,
  selectEnabledChannels,
  selectNotificationChannels,
} from './deliver';
import type { NotificationSettings } from './settings';

function buildSettings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return {
    dashboardUrl: 'https://admin.example.com',
    email: { enabled: false, recipient: '', sender: 'notify@example.com' },
    telegram: { enabled: false, chatId: '', hasBotToken: false },
    events: {},
    ...overrides,
  };
}

describe('selectEnabledChannels', () => {
  it('returns nothing when every channel is off', () => {
    expect(selectEnabledChannels(buildSettings())).toEqual([]);
  });

  it('requires a recipient before email counts as enabled', () => {
    const settings = buildSettings({
      email: { enabled: true, recipient: '', sender: 'notify@example.com' },
    });

    expect(selectEnabledChannels(settings)).toEqual([]);
  });

  it('requires a chat id and a stored token before Telegram counts as enabled', () => {
    const withoutToken = buildSettings({
      telegram: { enabled: true, chatId: '123', hasBotToken: false },
    });
    const withoutChatId = buildSettings({
      telegram: { enabled: true, chatId: '', hasBotToken: true },
    });

    expect(selectEnabledChannels(withoutToken)).toEqual([]);
    expect(selectEnabledChannels(withoutChatId)).toEqual([]);
  });

  it('lists every fully configured channel', () => {
    const settings = buildSettings({
      email: { enabled: true, recipient: 'ops@example.com', sender: 'notify@example.com' },
      telegram: { enabled: true, chatId: '123', hasBotToken: true },
    });

    expect(selectEnabledChannels(settings)).toEqual(['email', 'telegram']);
  });
});

describe('selectNotificationChannels', () => {
  const settings = buildSettings({
    email: { enabled: true, recipient: 'ops@example.com', sender: 'notify@example.com' },
  });

  it('never pushes an event the rule keeps inside the dashboard', () => {
    expect(selectNotificationChannels(settings, 'agent.run.started', false)).toEqual([]);
  });

  it('honours an event switched off by the operator', () => {
    const muted = buildSettings({ ...settings, events: { 'post.published': false } });

    expect(selectNotificationChannels(muted, 'post.published', true)).toEqual([]);
  });

  it('pushes through the configured channels when the rule and the operator agree', () => {
    expect(selectNotificationChannels(settings, 'post.published', true)).toEqual(['email']);
  });

  it('treats an unset event flag as enabled', () => {
    expect(selectNotificationChannels(settings, 'budget.warning', true)).toEqual(['email']);
  });
});

describe('buildNotificationUrl', () => {
  it('returns null without a link', () => {
    expect(buildNotificationUrl(null, 'https://admin.example.com')).toBeNull();
  });

  it('keeps an absolute link untouched', () => {
    expect(buildNotificationUrl('https://example.com/a', 'https://admin.example.com')).toBe(
      'https://example.com/a',
    );
  });

  it('joins a dashboard path onto the configured origin', () => {
    expect(buildNotificationUrl('/dashboard/activity', 'https://admin.example.com')).toBe(
      'https://admin.example.com/dashboard/activity',
    );
  });

  it('adds the missing separator', () => {
    expect(buildNotificationUrl('dashboard/activity', 'https://admin.example.com')).toBe(
      'https://admin.example.com/dashboard/activity',
    );
  });
});

describe('runWithDeadline', () => {
  it('passes through a completed delivery', async () => {
    const outcome = await runWithDeadline(async () => ({ outcome: 'success' }), 50);

    expect(outcome).toEqual({ outcome: 'success' });
  });

  it('reports a transient failure when the channel hangs', async () => {
    const outcome = await runWithDeadline(
      () => new Promise<NotificationChannelResult>(() => {}),
      10,
    );

    expect(outcome.outcome).toBe('transient');
    expect(outcome.error).toContain('timed out');
  });

  it('reports a transient failure when the channel throws', async () => {
    const outcome = await runWithDeadline(async () => {
      throw new Error('socket closed');
    }, 50);

    expect(outcome.outcome).toBe('transient');
    expect(outcome.error).toBe('socket closed');
  });
});
