interface Env {
  AGENT_RUN_URL?: string;
  AGENT_SHARE_URL?: string;
  AGENT_NOTIFY_URL?: string;
  AGENT_CRON_TOKEN?: string;
}

const DEFAULT_AGENT_RUN_URL = 'https://lightscripts.com/api/agents/run-due';
const DEFAULT_AGENT_SHARE_URL = 'https://lightscripts.com/api/agents/share-due';
const DEFAULT_AGENT_NOTIFY_URL = 'https://lightscripts.com/api/agents/notifications-due';

const RUN_TIMEOUT_MS = 300_000;
const SHARE_TIMEOUT_MS = 120_000;
const NOTIFY_TIMEOUT_MS = 60_000;

async function trigger(url: string, timeoutMs: number, token: string): Promise<unknown> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      console.error('Agent trigger request failed', url, response.status);
      return {
        ok: false,
        status: response.status,
        error: `agent trigger responded with ${response.status}`,
      };
    }

    return await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Agent trigger failed', url, message);
    return { ok: false, error: message };
  }
}

async function triggerRun(env: Env): Promise<{ run: unknown; share: unknown; notify: unknown }> {
  const token = env.AGENT_CRON_TOKEN;

  if (!token) {
    console.error('AGENT_CRON_TOKEN is not configured');
    const missing = { ok: false, error: 'AGENT_CRON_TOKEN is not configured' };
    return { run: missing, share: missing, notify: missing };
  }

  const runUrl = env.AGENT_RUN_URL ?? DEFAULT_AGENT_RUN_URL;
  const shareUrl = env.AGENT_SHARE_URL ?? DEFAULT_AGENT_SHARE_URL;
  const notifyUrl = env.AGENT_NOTIFY_URL ?? DEFAULT_AGENT_NOTIFY_URL;

  let run: unknown = { ok: false, error: 'run skipped' };
  let share: unknown = { ok: false, error: 'share skipped' };
  let notify: unknown = { ok: false, error: 'notify skipped' };

  try {
    run = await trigger(runUrl, RUN_TIMEOUT_MS, token);
  } finally {
    try {
      share = await trigger(shareUrl, SHARE_TIMEOUT_MS, token);
    } finally {
      notify = await trigger(notifyUrl, NOTIFY_TIMEOUT_MS, token);
    }
  }

  return { run, share, notify };
}

function isRunTrigger(request: Request): boolean {
  if (request.method !== 'POST') {
    return false;
  }

  return new URL(request.url).pathname === '/run';
}

export default {
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(triggerRun(env));
  },

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (!isRunTrigger(request)) {
      return new Response('Not found', { status: 404 });
    }

    const result = await triggerRun(env);

    return Response.json({ triggered: true, result });
  },
} satisfies ExportedHandler<Env>;
