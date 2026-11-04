import { getAuthenticatedUser } from './auth';
import { getDb } from './db';
import { requirePlatformAdmin, type AuthenticatedUser } from '@passness/core';
import type { DatabaseClient } from '@passness/database';

export interface SupportPlatformAdminContext {
  user: AuthenticatedUser;
  db: DatabaseClient;
}

/**
 * Garde d'accès interne strict pour le back-office Passness.
 * Fail-closed si non-authentifié ou si isPlatformAdmin !== true.
 */
export async function requireSupportPlatformAdmin(): Promise<SupportPlatformAdminContext> {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new Error('UNAUTHENTICATED');
  }
  requirePlatformAdmin(user);
  const db = getDb();
  return { user, db };
}
