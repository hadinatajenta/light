declare namespace App {
  interface Locals {
    user: import('@/lib/auth/types').AuthenticatedUser | null;
  }
}
