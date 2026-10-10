import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AuthenticatedUser, AuthProvider } from './types';

const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';

export interface CloudflareAccessConfig {
  teamDomain: string | undefined;
  audience: string | undefined;
  adminEmails: string[];
}

export function createCloudflareAccessProvider(config: CloudflareAccessConfig): AuthProvider {
  const { teamDomain, audience, adminEmails } = config;
  const issuer = teamDomain?.trim().replace(/\/+$/, '');
  const jwks = issuer ? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)) : null;

  return {
    async getCurrentUser(request: Request): Promise<AuthenticatedUser | null> {
      if (!jwks || !issuer || !audience) {
        return null;
      }

      const token = request.headers.get(ACCESS_JWT_HEADER);
      if (!token) {
        return null;
      }

      try {
        const { payload } = await jwtVerify(token, jwks, { issuer, audience });
        const email = typeof payload.email === 'string' ? payload.email : null;
        if (!email) {
          return null;
        }

        if (adminEmails.length > 0 && !adminEmails.includes(email.toLowerCase())) {
          return null;
        }

        return { email, name: email, role: 'admin' };
      } catch {
        return null;
      }
    },
  };
}
