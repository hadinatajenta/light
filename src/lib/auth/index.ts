import { ACCESS_AUD, ACCESS_TEAM_DOMAIN } from 'astro:env/server';
import { createCloudflareAccessProvider } from './cloudflare-access';
import type { AuthProvider } from './types';

let authProvider: AuthProvider | null = null;

export function getAuthProvider(): AuthProvider {
  if (!authProvider) {
    authProvider = createCloudflareAccessProvider({
      teamDomain: ACCESS_TEAM_DOMAIN,
      audience: ACCESS_AUD,
      adminEmails: [],
    });
  }

  return authProvider;
}

export type { AuthenticatedUser, AuthProvider, UserRole } from './types';
