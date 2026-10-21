export interface SettingsSection {
  href: string;
  label: string;
  purpose: string;
}

export const SETTINGS_SECTION_IDENTITY: SettingsSection = {
  href: '/dashboard/settings',
  label: 'Identity',
  purpose:
    'The values that render into every page head: the site title, description, and social defaults.',
};

export const SETTINGS_SECTION_PROVIDERS: SettingsSection = {
  href: '/dashboard/settings/providers',
  label: 'Providers',
  purpose: 'The keys and spend limits for the services the agents call.',
};

export const SETTINGS_SECTION_PERFORMANCE: SettingsSection = {
  href: '/dashboard/settings/performance',
  label: 'Performance',
  purpose:
    "The Performance Analyst's data sources and schedule: the credentials each source needs, the connection test, and the report import.",
};

export const SETTINGS_SECTION_NOTIFICATIONS: SettingsSection = {
  href: '/dashboard/settings/notifications',
  label: 'Notifications',
  purpose: 'Where alerts are delivered: email, Telegram, and which events leave this system.',
};

export const SETTINGS_SECTION_AFFILIATE: SettingsSection = {
  href: '/dashboard/settings/affiliate',
  label: 'Affiliate',
  purpose: 'Control whether the site shows any affiliate link at all.',
};

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  SETTINGS_SECTION_IDENTITY,
  SETTINGS_SECTION_PROVIDERS,
  SETTINGS_SECTION_PERFORMANCE,
  SETTINGS_SECTION_NOTIFICATIONS,
  SETTINGS_SECTION_AFFILIATE,
];
