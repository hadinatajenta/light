import type { ShareChannel, ShareMessage, SharePostContent } from './types';

const TELEGRAM_TEXT_LIMIT = 4096;
const TELEGRAM_CAPTION_LIMIT = 1024;
const DESCRIPTION_FALLBACK_LENGTH = 140;
const AFFILIATE_DISCLOSURE = 'Affiliate links may earn us a commission.';

export function escapeTelegramHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function codePoints(value: string): string[] {
  return Array.from(value);
}

function truncateToCodePoints(value: string, max: number): string {
  const points = codePoints(value);
  return points.length <= max ? value : points.slice(0, max).join('');
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

function composeTelegramMessage(post: SharePostContent, url: string, limit: number): string {
  const head = `<b>${escapeTelegramHtml(post.title.trim() || post.id)}</b>`;
  const urlLine = escapeTelegramHtml(url);
  const disclosureLine = post.affiliate ? AFFILIATE_DISCLOSURE : null;
  const blurb = escapeTelegramHtml(deriveShareBlurb(post));

  const fixed = [head, disclosureLine, urlLine].filter((line): line is string => line !== null);
  const fixedLength = fixed.reduce((total, line) => total + codePoints(line).length, 0);
  const separatorCount = fixed.length + (blurb ? 1 : 0) - 1;
  const budget = limit - fixedLength - Math.max(separatorCount, 0) * 2;

  let body = blurb;
  if (body !== '') {
    if (budget <= 0) {
      body = '';
    } else if (codePoints(body).length > budget) {
      body = `${truncateToCodePoints(body, Math.max(budget - 1, 0))}…`;
    }
  }

  return [head, body, disclosureLine, urlLine]
    .filter((line): line is string => line !== null && line !== '')
    .join('\n\n');
}

export function renderShareMessage(
  channel: ShareChannel,
  post: SharePostContent,
  origin: string,
): ShareMessage {
  const url = buildShareUrl(post, channel, origin);
  const photoUrl = toAbsoluteUrl(origin, post.coverUrl);
  const limit = photoUrl ? TELEGRAM_CAPTION_LIMIT : TELEGRAM_TEXT_LIMIT;

  return {
    text: composeTelegramMessage(post, url, limit),
    photoUrl,
  };
}
