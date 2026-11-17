import { getDb } from './db';
import { getSessionIdentity } from './auth-session';
import { isTwoFactorRequired, provisionUserFromOidc, type AuthenticatedUser } from '@passness/core';

export const AUTH_PROVIDER = 'better-auth';

export type AccountState =
  | { status: 'anonymous' }
  | { status: 'two-factor-setup-required' }
  | { status: 'ready'; user: AuthenticatedUser };

/**
 * État du compte courant. Passerelle unique de toute Server Action et de toute
 * page protégée (ADR-047) : un loueur ou un administrateur sans 2FA active n'obtient
 * jamais un utilisateur authentifié (fail-closed).
 */
export async function getAccountState(): Promise<AccountState> {
  const identity = await getSessionIdentity();
  if (!identity || !identity.email) return { status: 'anonymous' };

  const db = getDb();
  const user = await provisionUserFromOidc(db, {
    oidcSubject: identity.subject,
    oidcProvider: AUTH_PROVIDER,
    email: identity.email,
    emailVerified: identity.emailVerified,
    displayName: identity.displayName,
  });
  if (!identity.twoFactorEnabled && (await isTwoFactorRequired(db, user.id))) {
    return { status: 'two-factor-setup-required' };
  }
  return { status: 'ready', user };
}

/** Retourne null si non authentifié ou si la 2FA obligatoire n'est pas active. */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const state = await getAccountState();
  return state.status === 'ready' ? state.user : null;
}
