import type {
  EmailNotificationMessage,
  EmailSendBinding,
  NotificationChannelResult,
} from './types';

const CHANNEL_CONFIG_CODES = new Set([
  'E_SENDER_NOT_VERIFIED',
  'E_RECIPIENT_NOT_ALLOWED',
  'E_RECIPIENT_SUPPRESSED',
  'E_SENDER_DOMAIN_NOT_AVAILABLE',
  'E_FIELD_MISSING',
  'E_TOO_MANY_RECIPIENTS',
  'E_TOO_MANY_ATTACHMENTS',
]);

const RATE_LIMIT_CODES = new Set(['E_RATE_LIMIT_EXCEEDED', 'E_DAILY_LIMIT_EXCEEDED']);

const INVALID_PAYLOAD_CODES = new Set([
  'E_VALIDATION_ERROR',
  'E_CONTENT_TOO_LARGE',
  'E_HEADER_NOT_ALLOWED',
  'E_HEADER_USE_API_FIELD',
  'E_HEADER_VALUE_INVALID',
  'E_HEADER_VALUE_TOO_LONG',
  'E_HEADER_NAME_INVALID',
  'E_HEADERS_TOO_LARGE',
  'E_HEADERS_TOO_MANY',
]);

const MAX_ERROR_LENGTH = 300;

export function classifyEmailFailure(
  code: string | undefined,
): NotificationChannelResult['outcome'] {
  if (!code) {
    return 'transient';
  }

  if (RATE_LIMIT_CODES.has(code)) {
    return 'rate_limited';
  }

  if (CHANNEL_CONFIG_CODES.has(code)) {
    return 'channel_config';
  }

  if (INVALID_PAYLOAD_CODES.has(code)) {
    return 'invalid_payload';
  }

  return 'transient';
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : 'Unknown email failure.';
}

export async function resolveEmailBinding(): Promise<EmailSendBinding | null> {
  const { env } = await import('cloudflare:workers');
  const binding = (env as unknown as { EMAIL?: EmailSendBinding }).EMAIL;

  return binding ?? null;
}

export async function sendNotificationEmail(
  message: EmailNotificationMessage,
  binding?: EmailSendBinding | null,
): Promise<NotificationChannelResult> {
  const resolved = binding === undefined ? await resolveEmailBinding() : binding;

  if (!resolved) {
    return {
      outcome: 'channel_config',
      error: 'The EMAIL binding is not configured for this worker.',
    };
  }

  try {
    const result = await resolved.send({
      to: message.to,
      from: message.from,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    return { outcome: 'success', providerId: result?.messageId };
  } catch (error) {
    const code = readErrorCode(error);

    return {
      outcome: classifyEmailFailure(code),
      error: readErrorMessage(error).slice(0, MAX_ERROR_LENGTH),
    };
  }
}
