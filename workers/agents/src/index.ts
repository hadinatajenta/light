interface Env {
  AGENT_RUN_URL?: string;
  AGENT_CRON_TOKEN?: string;
}

const DEFAULT_AGENT_RUN_URL = 'https://lightscripts.com/api/agents/run-due';

const RUN_TIMEOUT_MS = 120_000;

async function triggerRun(env: Env): Promise<unknown> {
  const token = env.AGENT_CRON_TOKEN;

  if (!token) {
    console.error('AGENT_CRON_TOKEN is not configured');
    return { ok: false, error: 'AGENT_CRON_TOKEN is not configured' };
  }

  const runUrl = env.AGENT_RUN_URL ?? DEFAULT_AGENT_RUN_URL;

  try {
    const response = await fetch(runUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error('Agent run request failed', response.status);
      return {
        ok: false,
        status: response.status,
        error: `agent run responded with ${response.status}`,
      };
    }

    return await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Agent run trigger failed', message);
    return { ok: false, error: message };
  }
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
