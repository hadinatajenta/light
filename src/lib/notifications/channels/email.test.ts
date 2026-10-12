import { describe, expect, it } from 'vitest';
import { classifyEmailFailure, sendNotificationEmail } from './email';
import type { EmailSendBinding } from './types';

const MESSAGE = {
  to: 'ops@example.com',
  from: 'notify@example.com',
  subject: '[Light] Info: Test notification',
  text: 'plain',
  html: '<p>plain</p>',
};

function buildBinding(send: EmailSendBinding['send']): EmailSendBinding {
  return { send };
}

describe('classifyEmailFailure', () => {
  it('treats a throttled send as rate limited', () => {
    expect(classifyEmailFailure('E_RATE_LIMIT_EXCEEDED')).toBe('rate_limited');
    expect(classifyEmailFailure('E_DAILY_LIMIT_EXCEEDED')).toBe('rate_limited');
  });

  it('treats an address or domain problem as a configuration problem', () => {
    expect(classifyEmailFailure('E_RECIPIENT_NOT_ALLOWED')).toBe('channel_config');
    expect(classifyEmailFailure('E_SENDER_NOT_VERIFIED')).toBe('channel_config');
    expect(classifyEmailFailure('E_SENDER_DOMAIN_NOT_AVAILABLE')).toBe('channel_config');
    expect(classifyEmailFailure('E_RECIPIENT_SUPPRESSED')).toBe('channel_config');
  });

  it('treats a malformed payload as invalid', () => {
    expect(classifyEmailFailure('E_VALIDATION_ERROR')).toBe('invalid_payload');
    expect(classifyEmailFailure('E_CONTENT_TOO_LARGE')).toBe('invalid_payload');
  });

  it('treats delivery and internal errors as transient', () => {
    expect(classifyEmailFailure('E_DELIVERY_FAILED')).toBe('transient');
    expect(classifyEmailFailure('E_INTERNAL_SERVER_ERROR')).toBe('transient');
    expect(classifyEmailFailure(undefined)).toBe('transient');
  });
});

describe('sendNotificationEmail', () => {
  it('reports the binding as unconfigured when it is absent', async () => {
    const result = await sendNotificationEmail(MESSAGE, null);

    expect(result.outcome).toBe('channel_config');
    expect(result.error).toContain('EMAIL binding');
  });

  it('returns the message id on success', async () => {
    const binding = buildBinding(async () => ({ messageId: 'msg-1' }));

    const result = await sendNotificationEmail(MESSAGE, binding);

    expect(result).toEqual({ outcome: 'success', providerId: 'msg-1' });
  });

  it('forwards every part of the message to the binding', async () => {
    let received: Parameters<EmailSendBinding['send']>[0] | null = null;
    const binding = buildBinding(async (message) => {
      received = message;
      return {};
    });

    await sendNotificationEmail(MESSAGE, binding);

    expect(received).toEqual({
      to: MESSAGE.to,
      from: MESSAGE.from,
      subject: MESSAGE.subject,
      text: MESSAGE.text,
      html: MESSAGE.html,
    });
  });

  it('maps a rejected recipient to a configuration problem', async () => {
    const binding = buildBinding(async () => {
      throw Object.assign(new Error('Recipient not allowed'), {
        code: 'E_RECIPIENT_NOT_ALLOWED',
      });
    });

    const result = await sendNotificationEmail(MESSAGE, binding);

    expect(result.outcome).toBe('channel_config');
    expect(result.error).toBe('Recipient not allowed');
  });

  it('maps a throttled send to rate limited', async () => {
    const binding = buildBinding(async () => {
      throw Object.assign(new Error('Slow down'), { code: 'E_RATE_LIMIT_EXCEEDED' });
    });

    const result = await sendNotificationEmail(MESSAGE, binding);

    expect(result.outcome).toBe('rate_limited');
  });

  it('maps an unrecognized throw to a transient failure', async () => {
    const binding = buildBinding(async () => {
      throw new Error('socket closed');
    });

    const result = await sendNotificationEmail(MESSAGE, binding);

    expect(result.outcome).toBe('transient');
    expect(result.error).toBe('socket closed');
  });
});
