export type UserRole = 'admin' | 'editor';

export interface AuthenticatedUser {
  email: string;
  name: string;
  role: UserRole;
}

export interface AuthProvider {
  getCurrentUser(request: Request): Promise<AuthenticatedUser | null>;
}
