import type { AdapterOutcome } from '../../sharing/types';

export interface NotificationChannelResult {
  outcome: AdapterOutcome;
  providerId?: string;
  error?: string;
}

export interface EmailSendBinding {
  send(message: {
    to: string;
    from: string;
    subject: string;
    text?: string;
    html?: string;
  }): Promise<{ messageId?: string }>;
}

export interface EmailNotificationMessage {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
}
