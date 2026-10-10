import type { APIContext } from 'astro';
import { runAgent } from '@/lib/agents/runner';
import { listDueAgents } from '@/lib/agents/store';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, createRequestContext, jsonOk, toErrorResponse } from '@/lib/http';

export const prerender = false;

const RUN_BUDGET_MS = 110_000;
const BEARER_PREFIX = 'Bearer ';

interface TimingSafeSubtleCrypto extends SubtleCrypto {
  timingSafeEqual?: (first: BufferSource, second: BufferSource) => boolean;
}

async function readCronToken(): Promise<string | null> {
  try {
    const { env } = await import('cloudflare:workers');
    return (env as unknown as { AGENT_CRON_TOKEN?: string }).AGENT_CRON_TOKEN ?? null;
  } catch {
    return null;
  }
}

async function sha256(value: string): Promise<Uint8Array<ArrayBuffer>> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

function compareBytes(first: Uint8Array, second: Uint8Array): boolean {
  let mismatch = 0;
  for (let index = 0; index < first.length; index += 1) {
    mismatch |= first[index] ^ second[index];
  }

  return mismatch === 0;
}

async function tokensMatch(provided: string, expected: string): Promise<boolean> {
  const [providedDigest, expectedDigest] = await Promise.all([sha256(provided), sha256(expected)]);

  const subtle = crypto.subtle as TimingSafeSubtleCrypto;
  if (typeof subtle.timingSafeEqual === 'function') {
    return subtle.timingSafeEqual(providedDigest, expectedDigest);
  }

  return compareBytes(providedDigest, expectedDigest);
}

async function isAuthorized(request: Request, expectedToken: string): Promise<boolean> {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith(BEARER_PREFIX)) {
    return false;
  }

  const providedToken = header.slice(BEARER_PREFIX.length).trim();
  if (!providedToken) {
    return false;
  }

  return tokensMatch(providedToken, expectedToken);
}

export const POST = async (context: APIContext): Promise<Response> => {
  const { requestId } = createRequestContext();

  try {
    const expectedToken = await readCronToken();
    if (!expectedToken) {
      throw new ApiError(503, 'CRON_TOKEN_MISSING', 'The agent cron token is not configured.');
    }

    if (!(await isAuthorized(context.request, expectedToken))) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'A valid bearer token is required.');
    }

    const database = await requireContentDatabase();
    const due = await listDueAgents(database, new Date().toISOString());

    const startedAt = Date.now();
    const results: Array<{ agentId: string; status: string; summary: string }> = [];
    let processed = 0;

    for (const agent of due) {
      if (Date.now() - startedAt >= RUN_BUDGET_MS) {
        break;
      }

      const result = await runAgent(database, agent);
      results.push({ agentId: agent.id, status: result.status, summary: result.summary });
      processed += 1;
    }

    return jsonOk({ processed, remaining: due.length - processed, results }, requestId);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
};
