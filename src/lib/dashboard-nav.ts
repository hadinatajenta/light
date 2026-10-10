export interface DashboardNavItem {
  label: string;
  href: string;
  icon: string;
}

export const DASHBOARD_NAVIGATION: DashboardNavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  { label: 'Posts', href: '/dashboard/posts', icon: 'posts' },
  { label: 'Categories', href: '/dashboard/categories', icon: 'categories' },
  { label: 'Pages', href: '/dashboard/pages', icon: 'pages' },
  { label: 'Media', href: '/dashboard/media', icon: 'media' },
  { label: 'Insights', href: '/dashboard/insights', icon: 'insights' },
  { label: 'Activity', href: '/dashboard/activity', icon: 'activity' },
  { label: 'Redirects', href: '/dashboard/redirects', icon: 'redirects' },
  { label: 'Monetization', href: '/dashboard/monetization', icon: 'monetization' },
  { label: 'Settings', href: '/dashboard/settings', icon: 'settings' },
];
