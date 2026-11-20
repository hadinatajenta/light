import {
  readCachedPage,
  resolveDefaultPageCache,
  storeRenderedPage,
  type WaitUntilContext,
  withPageCacheHeaders,
} from '../cache/page-cache';
import type { SitePost } from '../content/public';
import { buildCardElement, buildCardKicker } from './card';
import { loadCoverImage } from './cover';
import { renderCardPng } from './render';

export const OG_CARD_CACHE_CONTROL = 'public, max-age=86400, s-maxage=604800';
const STORED_CARD_CACHE_CONTROL = 'public, max-age=604800';

export interface CardRequest {
  post: SitePost;
  requestUrl: URL;
  executionContext: WaitUntilContext | undefined;
}

interface CardBindings {
  bucket: R2Bucket | null;
  assets: Fetcher | null;
}

async function resolveCardBindings(): Promise<CardBindings> {
  try {
    const { env } = await import('cloudflare:workers');
    const bindings = env as unknown as { MEDIA_BUCKET?: R2Bucket; ASSETS?: Fetcher };
    return { bucket: bindings.MEDIA_BUCKET ?? null, assets: bindings.ASSETS ?? null };
  } catch {
    return { bucket: null, assets: null };
  }
}

function buildCardCacheKey(post: SitePost, requestUrl: URL): Request {
  const cacheKeyUrl = new URL(`/og/${encodeURIComponent(post.id)}.png`, requestUrl.origin);
  cacheKeyUrl.searchParams.set('revision', post.revision);
  return new Request(cacheKeyUrl.toString(), { method: 'GET' });
}

async function renderCardResponse(post: SitePost, requestUrl: URL): Promise<Response> {
  const bindings = await resolveCardBindings();
  const coverImage = await loadCoverImage({
    coverUrl: post.coverUrl,
    requestUrl,
    bucket: bindings.bucket,
    assets: bindings.assets,
  });

  const cardElement = buildCardElement({
    title: post.title,
    kicker: buildCardKicker(post),
    coverImage,
  });
  const pngBytes = await renderCardPng(cardElement);

  return new Response(pngBytes, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': OG_CARD_CACHE_CONTROL },
  });
}

export async function serveCardImage(cardRequest: CardRequest): Promise<Response> {
  const { post, requestUrl } = cardRequest;
  const cardCache = resolveDefaultPageCache();
  const cacheKey = buildCardCacheKey(post, requestUrl);

  const cachedCard = cardCache ? await readCachedPage(cardCache, cacheKey) : null;
  if (cachedCard) {
    return withPageCacheHeaders(cachedCard, OG_CARD_CACHE_CONTROL, 'HIT');
  }

  const renderedCard = await renderCardResponse(post, requestUrl);
  if (cardCache) {
    await storeRenderedPage(
      cardCache,
      cacheKey,
      renderedCard.clone(),
      cardRequest.executionContext,
      STORED_CARD_CACHE_CONTROL,
    );
  }

  return withPageCacheHeaders(renderedCard, OG_CARD_CACHE_CONTROL, 'MISS');
}
