import type { AuthenticatedUser, AuthProvider } from './types';

export function createDevAuthProvider(email: string): AuthProvider {
  const developer: AuthenticatedUser = { email, name: email, role: 'admin' };

  return {
    async getCurrentUser(): Promise<AuthenticatedUser | null> {
      return developer;
    },
  };
}
