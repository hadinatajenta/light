export const DASHBOARD_NAV_GROUPS = [
  'Overview',
  'Content',
  'Automation',
  'Revenue',
  'System',
] as const;

export type DashboardNavGroup = (typeof DASHBOARD_NAV_GROUPS)[number];

export interface DashboardNavItem {
  label: string;
  href: string;
  icon: string;
  group: DashboardNavGroup;
}

export const DASHBOARD_NAVIGATION: DashboardNavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard', group: 'Overview' },
  { label: 'Insights', href: '/dashboard/insights', icon: 'insights', group: 'Overview' },
  { label: 'Posts', href: '/dashboard/posts', icon: 'posts', group: 'Content' },
  { label: 'Categories', href: '/dashboard/categories', icon: 'categories', group: 'Content' },
  { label: 'Pages', href: '/dashboard/pages', icon: 'pages', group: 'Content' },
  { label: 'Media', href: '/dashboard/media', icon: 'media', group: 'Content' },
  { label: 'Agents', href: '/dashboard/agents', icon: 'agents', group: 'Automation' },
  { label: 'Activity', href: '/dashboard/activity', icon: 'activity', group: 'Automation' },
  {
    label: 'Monetization',
    href: '/dashboard/monetization',
    icon: 'monetization',
    group: 'Revenue',
  },
  { label: 'Redirects', href: '/dashboard/redirects', icon: 'redirects', group: 'Revenue' },
  { label: 'Settings', href: '/dashboard/settings', icon: 'settings', group: 'System' },
];

export function groupNavigation(
  items: DashboardNavItem[] = DASHBOARD_NAVIGATION,
): Array<{ group: DashboardNavGroup; items: DashboardNavItem[] }> {
  return DASHBOARD_NAV_GROUPS.map((group) => ({
    group,
    items: items.filter((item) => item.group === group),
  })).filter((entry) => entry.items.length > 0);
}
