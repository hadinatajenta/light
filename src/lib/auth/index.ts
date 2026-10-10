import { ACCESS_AUD, ACCESS_TEAM_DOMAIN, DEV_ADMIN_EMAIL } from 'astro:env/server';
import { createCloudflareAccessProvider } from './cloudflare-access';
import { createDevAuthProvider } from './dev';
import type { AuthProvider } from './types';

function createProvider(): AuthProvider {
  if (import.meta.env.DEV && DEV_ADMIN_EMAIL) {
    return createDevAuthProvider(DEV_ADMIN_EMAIL);
  }

  return createCloudflareAccessProvider({
    teamDomain: ACCESS_TEAM_DOMAIN,
    audience: ACCESS_AUD,
    adminEmails: [],
  });
}

let authProvider: AuthProvider | null = null;

export function getAuthProvider(): AuthProvider {
  if (!authProvider) {
    authProvider = createProvider();
  }

  return authProvider;
}

export type { AuthenticatedUser, AuthProvider, UserRole } from './types';
