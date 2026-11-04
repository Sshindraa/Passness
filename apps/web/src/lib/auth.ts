import { currentUser } from '@clerk/nextjs/server';
import { getDb } from './db';
import { provisionUserFromOidc, type AuthenticatedUser } from '@passness/core';

/**
 * Récupère l'utilisateur Clerk courant et le synchronise dans la base Passness.
 *
 * Clerk gère l'identité (ADR-006) ; Passness reste la source de vérité des rôles.
 * Retourne null si l'utilisateur n'est pas authentifié.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;
  if (!clerkUser.primaryEmailAddress?.emailAddress) return null;

  const db = getDb();
  return provisionUserFromOidc(db, {
    oidcSubject: clerkUser.id,
    oidcProvider: 'clerk',
    email: clerkUser.primaryEmailAddress.emailAddress,
    emailVerified: clerkUser.primaryEmailAddress.verification?.status === 'verified',
    displayName: clerkUser.fullName ?? clerkUser.username ?? null,
  });
}
