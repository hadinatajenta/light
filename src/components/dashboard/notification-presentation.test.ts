import { describe, expect, it } from 'vitest';
import {
  isUnreadNotification,
  shouldUpdateNotificationReadState,
} from './notification-presentation';

const UNREAD = null;
const READ = '2026-10-12T09:30:00.000Z';

describe('isUnreadNotification', () => {
  it('treats a missing read timestamp as unread', () => {
    expect(isUnreadNotification(UNREAD)).toBe(true);
    expect(isUnreadNotification(READ)).toBe(false);
  });
});

describe('shouldUpdateNotificationReadState', () => {
  it('marks an unread notification as read', () => {
    expect(shouldUpdateNotificationReadState(UNREAD, true)).toBe(true);
  });

  it('marks a read notification as unread', () => {
    expect(shouldUpdateNotificationReadState(READ, false)).toBe(true);
  });

  it('does nothing when an unread notification is asked to be unread', () => {
    expect(shouldUpdateNotificationReadState(UNREAD, false)).toBe(false);
  });

  it('does nothing when a read notification is asked to be read again', () => {
    expect(shouldUpdateNotificationReadState(READ, true)).toBe(false);
  });
});
