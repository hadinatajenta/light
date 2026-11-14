export const SITE_TITLE = 'Light Scripts';
export const SITE_DESCRIPTION =
  'Independent buying guides for desk gear and work devices: chairs, desks, monitors, keyboards, audio, laptops, and tablets.';
export const SITE_HOME_TITLE = 'Light Scripts: Desk Gear and Home-Office Buying Guides';
export const SITE_TAGLINE =
  'Buying guides for the desk you work at and the devices on it, built so you buy once and buy well.';
export const SITE_AUTHOR = 'Hadinata Jenta';
export const SITE_AUTHOR_SLUG = 'hadinata-jenta';
export const SITE_AUTHOR_JOB_TITLE = 'Editor, Light Scripts';
export const SITE_AUTHOR_WEBSITE = 'https://hadinata.me';
export const SITE_AUTHOR_LINKEDIN = 'https://www.linkedin.com/in/hadinata-jenta/';
export const SITE_AUTHOR_BIO =
  'Hadinata Jenta edits Light Scripts, an independent publication of buying guides for desk gear and work devices: chairs, desks, monitors, keyboards, audio, laptops, and tablets. He decides what the site covers, works from manufacturer documentation and independent test data, and approves new guides before they go live.';
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
  { label: 'Guides', href: '/blog/' },
  { label: 'About', href: '/about/' },
  { label: 'Contact', href: '/contact/' },
];

export const TOPICS: Topic[] = [
  { label: 'Desk Setup', slug: 'desk-setup' },
  { label: 'Chairs', slug: 'chairs' },
  { label: 'Standing Desks', slug: 'standing-desks' },
  { label: 'Monitors', slug: 'monitors' },
  { label: 'Keyboards', slug: 'keyboards' },
  { label: 'Audio', slug: 'audio' },
  { label: 'Accessories', slug: 'accessories' },
  { label: 'Buying Basics', slug: 'buying-basics' },
  { label: 'Laptops', slug: 'laptops' },
  { label: 'Tablets', slug: 'tablets' },
  { label: 'Phones', slug: 'phones' },
];

export interface FooterSection {
  title: string;
  links: NavigationLink[];
}

export const FOOTER_SECTIONS: FooterSection[] = [
  {
    title: 'Topics',
    links: [
      { label: 'Desk Setup', href: '/tag/desk-setup/' },
      { label: 'Chairs', href: '/tag/chairs/' },
      { label: 'Monitors', href: '/tag/monitors/' },
      { label: 'Laptops', href: '/tag/laptops/' },
      { label: 'Tablets', href: '/tag/tablets/' },
      { label: 'Keyboards', href: '/tag/keyboards/' },
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
