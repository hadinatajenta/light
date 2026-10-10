export type AffiliateNetwork = 'amazon' | 'impact' | 'partnerstack' | 'shareasale' | 'direct';

export interface AffiliateProgram {
  id: string;
  name: string;
  network: AffiliateNetwork;
  disclosure: string;
}

export const DEFAULT_AFFILIATE_DISCLOSURE =
  'This article contains affiliate links. If you buy through them, we may earn a commission at no extra cost to you.';

export const AFFILIATE_PROGRAMS: Record<string, AffiliateProgram> = {
  amazon: {
    id: 'amazon',
    name: 'Amazon Associates',
    network: 'amazon',
    disclosure: 'As an Amazon Associate I earn from qualifying purchases.',
  },
  impact: {
    id: 'impact',
    name: 'Impact',
    network: 'impact',
    disclosure: 'We may earn a commission when you sign up through links in this article.',
  },
  partnerstack: {
    id: 'partnerstack',
    name: 'PartnerStack',
    network: 'partnerstack',
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
  network: 'none',
  adsenseClientId: null,
  slots: {},
};
