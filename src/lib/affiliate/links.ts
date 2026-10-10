import type { AffiliateProgram } from '@/config/monetization';

const SAFE_TARGET = /^[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+$/;
const SAFE_TRACKING_ID = /^[A-Za-z0-9_-]+$/;

const PRODUCT_LINK_PATTERN = /<a href="product:([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g;
const ATTRIBUTE_PATTERN = /\s(?:href|rel|target)="[^"]*"/g;

export interface AffiliateResolution {
  html: string;
  affiliateLinks: number;
  unresolvedSlugs: string[];
}

export function buildAffiliateUrl(program: AffiliateProgram, target: string): string | null {
  if (program.status !== 'approved' || !program.trackingId || !program.linkTemplate) {
    return null;
  }

  if (!SAFE_TARGET.test(target) || !SAFE_TRACKING_ID.test(program.trackingId)) {
    return null;
  }

  return program.linkTemplate
    .replaceAll('{target}', target)
    .replaceAll('{trackingId}', program.trackingId);
}

export function resolveAffiliateLinks(
  html: string,
  links: Map<string, string>,
): AffiliateResolution {
  const unresolvedSlugs: string[] = [];
  let affiliateLinks = 0;

  const resolvedHtml = html.replace(
    PRODUCT_LINK_PATTERN,
    (_match: string, slug: string, attributes: string, text: string) => {
      const url = links.get(slug);

      if (!url) {
        unresolvedSlugs.push(slug);
        return text;
      }

      affiliateLinks += 1;
      const remainingAttributes = attributes.replace(ATTRIBUTE_PATTERN, '');
      return `<a href="${url}"${remainingAttributes} rel="sponsored nofollow noopener" target="_blank">${text}</a>`;
    },
  );

  return { html: resolvedHtml, affiliateLinks, unresolvedSlugs };
}
