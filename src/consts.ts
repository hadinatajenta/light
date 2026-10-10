export const SITE_TITLE = 'Light';
export const SITE_DESCRIPTION =
  'Independent buying guides, product comparisons, and reviews backed by hands-on research.';
export const SITE_AUTHOR = 'Light Editorial Team';
export const SITE_LOCALE = 'en-US';
export const SITE_LANGUAGE = 'en';
export const POSTS_PER_PAGE = 12;

export interface NavigationLink {
  label: string;
  href: string;
}

export const PRIMARY_NAVIGATION: NavigationLink[] = [
  { label: 'Home', href: '/' },
  { label: 'Guides', href: '/blog' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

export const FOOTER_LEGAL_NAVIGATION: NavigationLink[] = [
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'Affiliate Disclosure', href: '/affiliate-disclosure' },
  { label: 'Privacy Policy', href: '/privacy-policy' },
  { label: 'Cookie Policy', href: '/cookie-policy' },
  { label: 'Terms', href: '/terms' },
];

export const DEFAULT_OG_IMAGE = '/og-default.png';

export const COOKIE_CONSENT_STORAGE_KEY = 'light.cookie-consent';
