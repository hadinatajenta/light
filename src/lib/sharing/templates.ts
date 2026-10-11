import type { ShareChannel, ShareMessage, SharePostContent, ShareProvider } from './types';

const TELEGRAM_TEXT_LIMIT = 4096;
const TELEGRAM_CAPTION_LIMIT = 1024;
const DISCORD_TEXT_LIMIT = 2000;
const MASTODON_TEXT_LIMIT = 500;
const BLUESKY_TEXT_LIMIT = 300;
const DESCRIPTION_FALLBACK_LENGTH = 140;
const AFFILIATE_DISCLOSURE = 'Affiliate links may earn us a commission.';
const ELLIPSIS = '…';

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function escapeTelegramHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function splitGraphemes(value: string): string[] {
  return Array.from(graphemeSegmenter.segment(value), (entry) => entry.segment);
}

export function countGraphemes(value: string): number {
  return splitGraphemes(value).length;
}

export function countCodePoints(value: string): number {
  return Array.from(value).length;
}

export function truncateToCodePoints(value: string, max: number): string {
  const points = Array.from(value);
  return points.length <= max ? value : points.slice(0, max).join('');
}

export function truncateToGraphemes(value: string, max: number): string {
  const segments = splitGraphemes(value);
  return segments.length <= max ? value : segments.slice(0, max).join('');
}

export function firstSentence(value: string): string {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (collapsed === '') {
    return '';
  }

  const match = collapsed.match(/^(.*?[.!?])(\s|$)/);
  return match ? match[1] : collapsed;
}

export function toAbsoluteUrl(origin: string, value: string | null): string | null {
  if (!value || value.trim() === '') {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const base = origin.replace(/\/+$/, '');
  const path = value.startsWith('/') ? value : `/${value}`;
  return `${base}${path}`;
}

export function buildBaseUrl(post: SharePostContent, origin: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/blog/${post.id}`;
}

export function buildShareUrl(
  post: SharePostContent,
  channel: ShareChannel,
  origin: string,
): string {
  const url = new URL(buildBaseUrl(post, origin));
  url.searchParams.set('utm_source', channel.provider);
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', 'autoshare');
  return url.toString();
}

export function deriveShareBlurb(post: SharePostContent): string {
  const description = post.description.trim();
  if (description !== '') {
    return description;
  }

  return truncateToCodePoints(firstSentence(post.body), DESCRIPTION_FALLBACK_LENGTH);
}

type Measure = (value: string) => number;
type Truncate = (value: string, max: number) => string;

function composeBoundedMessage(
  head: string,
  blurb: string,
  disclosure: string | null,
  url: string,
  limit: number,
  measure: Measure,
  truncate: Truncate,
): string {
  const fixed = [head, disclosure, url].filter((line): line is string => line !== null);
  const fixedLength = fixed.reduce((total, line) => total + measure(line), 0);
  const separatorCount = fixed.length + (blurb !== '' ? 1 : 0) - 1;
  const budget = limit - fixedLength - Math.max(separatorCount, 0) * 2;

  let body = blurb;
  if (body !== '') {
    if (budget <= 0) {
      body = '';
    } else if (measure(body) > budget) {
      body = `${truncate(body, Math.max(budget - 1, 0))}${ELLIPSIS}`;
    }
  }

  return [head, body, disclosure, url]
    .filter((line): line is string => line !== null && line !== '')
    .join('\n\n');
}

function composeTelegramMessage(post: SharePostContent, url: string, limit: number): string {
  const head = `<b>${escapeTelegramHtml(post.title.trim() || post.id)}</b>`;
  const urlLine = escapeTelegramHtml(url);
  const disclosure = post.affiliate ? AFFILIATE_DISCLOSURE : null;
  const blurb = escapeTelegramHtml(deriveShareBlurb(post));

  return composeBoundedMessage(
    head,
    blurb,
    disclosure,
    urlLine,
    limit,
    countCodePoints,
    truncateToCodePoints,
  );
}

interface PlainTextLimits {
  limit: number;
  measure: Measure;
  truncate: Truncate;
}

function plainTextLimits(provider: ShareProvider): PlainTextLimits {
  if (provider === 'discord') {
    return {
      limit: DISCORD_TEXT_LIMIT,
      measure: countCodePoints,
      truncate: truncateToCodePoints,
    };
  }

  if (provider === 'bluesky') {
    return {
      limit: BLUESKY_TEXT_LIMIT,
      measure: countGraphemes,
      truncate: truncateToGraphemes,
    };
  }

  return {
    limit: MASTODON_TEXT_LIMIT,
    measure: countCodePoints,
    truncate: truncateToCodePoints,
  };
}

function composePlainTextMessage(
  post: SharePostContent,
  url: string,
  limits: PlainTextLimits,
): string {
  const head = post.title.trim() || post.id;
  const disclosure = post.affiliate ? AFFILIATE_DISCLOSURE : null;
  const blurb = deriveShareBlurb(post);

  return composeBoundedMessage(
    head,
    blurb,
    disclosure,
    url,
    limits.limit,
    limits.measure,
    limits.truncate,
  );
}

export function renderShareMessage(
  channel: ShareChannel,
  post: SharePostContent,
  origin: string,
): ShareMessage {
  const url = buildShareUrl(post, channel, origin);

  if (channel.provider === 'telegram') {
    const photoUrl = toAbsoluteUrl(origin, post.coverUrl);
    const limit = photoUrl ? TELEGRAM_CAPTION_LIMIT : TELEGRAM_TEXT_LIMIT;

    return {
      text: composeTelegramMessage(post, url, limit),
      photoUrl,
    };
  }

  if (channel.provider === 'pinterest') {
    return {
      text: composePlainTextMessage(post, url, plainTextLimits(channel.provider)),
      photoUrl: toAbsoluteUrl(origin, post.coverUrl),
    };
  }

  return {
    text: composePlainTextMessage(post, url, plainTextLimits(channel.provider)),
    photoUrl: null,
  };
}
