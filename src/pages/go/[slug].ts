import type { APIRoute } from 'astro';
import {
  findClickTarget,
  normalizeClickPlacement,
  readPostIdFromPath,
  recordClick,
  recordRedirectMiss,
} from '@/lib/affiliate/clicks';
import { normalizeViewPath } from '@/lib/analytics/views';
import { resolveContentDatabase } from '@/lib/content/database';

export const prerender = false;

function readReferrerPath(referrer: string | null): string | null {
  if (!referrer) {
    return null;
  }

  try {
    return new URL(referrer).pathname;
  } catch {
    return null;
  }
}

async function settleRecording(
  executionContext: ExecutionContext | undefined,
  recording: Promise<void>,
): Promise<void> {
  if (executionContext) {
    executionContext.waitUntil(recording);
    return;
  }

  await recording;
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response('Not Found', { status: 404 });
  }

  const database = await resolveContentDatabase();
  if (!database) {
    return new Response('Not Found', { status: 404 });
  }

  const referrer = request.headers.get('Referer');
  const path = readReferrerPath(referrer);

  const target = await findClickTarget(database, slug);
  if (!target) {
    const missRecording = recordRedirectMiss(database, {
      slug,
      referrerPath: path ? normalizeViewPath(path) : '',
    }).catch((error) => {
      console.error('Failed to record a redirect miss', error);
    });

    await settleRecording(locals.cfContext, missRecording);

    return new Response('Not Found', { status: 404 });
  }

  const placement = normalizeClickPlacement(new URL(request.url).searchParams.get('p'));

  const clickRecording = recordClick(database, {
    productId: target.productId,
    postId: readPostIdFromPath(path),
    path,
    referrer: referrer ? referrer.slice(0, 500) : null,
    placement,
  }).catch((error) => {
    console.error('Failed to record affiliate click', error);
  });

  await settleRecording(locals.cfContext, clickRecording);

  return new Response(null, {
    status: 302,
    headers: {
      Location: target.url,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
};
