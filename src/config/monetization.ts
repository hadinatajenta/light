export type AffiliateNetwork = 'amazon' | 'impact' | 'partnerstack' | 'shareasale' | 'direct';

export type AffiliateStatus = 'pending' | 'approved' | 'paused';

export interface AffiliateProgram {
  id: string;
  name: string;
  network: AffiliateNetwork;
  trackingId: string | null;
  linkTemplate: string | null;
  status: AffiliateStatus;
  disclosure: string;
}

export const DEFAULT_AFFILIATE_DISCLOSURE =
  'This article contains affiliate links. If you buy through them, we may earn a commission at no extra cost to you.';

export const AMAZON_TRACKING_ID = 'lightscripts-20';

export const AMAZON_PROGRAM: AffiliateProgram = {
  id: 'amazon',
  name: 'Amazon Associates',
  network: 'amazon',
  trackingId: AMAZON_TRACKING_ID,
  linkTemplate: 'https://www.amazon.com/dp/{target}?tag={trackingId}',
  status: 'approved',
  disclosure: 'As an Amazon Associate I earn from qualifying purchases.',
};

export const AFFILIATE_PROGRAMS: Record<string, AffiliateProgram> = {
  amazon: AMAZON_PROGRAM,
  impact: {
    id: 'impact',
    name: 'Impact',
    network: 'impact',
    trackingId: null,
    linkTemplate: null,
    status: 'pending',
    disclosure: 'We may earn a commission when you sign up through links in this article.',
  },
  partnerstack: {
    id: 'partnerstack',
    name: 'PartnerStack',
    network: 'partnerstack',
    trackingId: null,
    linkTemplate: null,
    status: 'pending',
    disclosure: 'We may earn a commission when you sign up through links in this article.',
  },
};

export type AdNetwork = 'none' | 'adsense' | 'ezoic' | 'mediavine';

export interface AdConfig {
  network: AdNetwork;
  adsenseClientId: string | null;
  slots: Record<string, string>;
}

export const AD_CONFIG: AdConfig = {
  network: 'adsense',
  adsenseClientId: 'ca-pub-5729173430518647',
  slots: {
    'home-top': '',
    'in-article-top': '',
    'in-article-bottom': '',
    'article-rail-top': '',
    'article-rail-bottom': '',
  },
};
