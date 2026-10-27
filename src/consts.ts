export const SITE_TITLE = 'Light Scripts';
export const SITE_DESCRIPTION =
  'Independent buying guides and product comparisons for people who would rather buy once and buy well.';
export const SITE_HOME_TITLE = 'Home-office buying guides that hold up after the unboxing';
export const SITE_TAGLINE =
  'A reading room for people who would rather research once and buy well, than buy twice and regret it.';
export const SITE_AUTHOR = 'Hadinata Jenta';
export const SITE_AUTHOR_SLUG = 'hadinata-jenta';
export const SITE_AUTHOR_JOB_TITLE = 'Editor, Light Scripts';
export const SITE_AUTHOR_WEBSITE = 'https://hadinata.me';
export const SITE_AUTHOR_LINKEDIN = 'https://www.linkedin.com/in/hadinata-jenta/';
export const SITE_AUTHOR_BIO =
  'Hadinata Jenta writes and edits Light Scripts, an independent publication about home-office equipment. He researches primary sources, manufacturer documentation, and independent test data, and explains the measurements that decide whether a desk, chair, monitor, or accessory fits a real room.';
export const SITE_LOCALE = 'en-US';
export const SITE_LANGUAGE = 'en';
export const POSTS_PER_PAGE = 9;

export const DEFAULT_OG_IMAGE = '/og-default.png';
export const GOOGLE_SITE_VERIFICATION = '';
export const COOKIE_CONSENT_STORAGE_KEY = 'light.cookie-consent';
export const THEME_STORAGE_KEY = 'light-theme';
export const USE_GOOGLE_CMP = true;

export interface NavigationLink {
  label: string;
  href: string;
}

export interface SocialProfile {
  label: string;
  href: string;
}

export const SOCIAL_PROFILES: SocialProfile[] = [{ label: 'LinkedIn', href: SITE_AUTHOR_LINKEDIN }];

export interface Topic {
  label: string;
  slug: string;
}

export const PRIMARY_NAVIGATION: NavigationLink[] = [
  { label: 'Latest', href: '/' },
  { label: 'Guides', href: '/blog' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

export const TOPICS: Topic[] = [
  { label: 'Monitors', slug: 'monitors' },
  { label: 'Keyboards', slug: 'keyboards' },
  { label: 'Audio', slug: 'audio' },
  { label: 'Desk Setup', slug: 'desk-setup' },
  { label: 'Chairs', slug: 'chairs' },
  { label: 'Buying Basics', slug: 'buying-basics' },
  { label: 'Accessories', slug: 'accessories' },
  { label: 'Standing Desks', slug: 'standing-desks' },
  { label: 'Lighting', slug: 'lighting' },
  { label: 'Laptops', slug: 'laptops' },
  { label: 'Tablets', slug: 'tablets' },
  { label: 'Data Storage', slug: 'data-storage' },
  { label: 'Networking', slug: 'networking' },
  { label: 'Printers & Scanners', slug: 'printers' },
  { label: 'Meeting Gear', slug: 'meeting-gear' },
];

export interface FooterSection {
  title: string;
  links: NavigationLink[];
}

export const FOOTER_SECTIONS: FooterSection[] = [
  {
    title: 'Guides',
    links: [
      { label: 'Monitors', href: '/tag/monitors/' },
      { label: 'Keyboards', href: '/tag/keyboards/' },
      { label: 'Audio', href: '/tag/audio/' },
      { label: 'Desk Setup', href: '/tag/desk-setup/' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about/' },
      { label: 'Author', href: `/author/${SITE_AUTHOR_SLUG}/` },
      { label: 'Editorial standards', href: '/editorial-standards/' },
      { label: 'Contact', href: '/contact/' },
      { label: 'All Guides', href: '/blog/' },
      { label: 'RSS', href: '/rss.xml' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy-policy/' },
      { label: 'Cookie Policy', href: '/cookie-policy/' },
      { label: 'Terms', href: '/terms/' },
    ],
  },
];
