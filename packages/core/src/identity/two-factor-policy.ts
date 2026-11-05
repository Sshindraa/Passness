import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '@passness/database';
import { organizationMemberships, users } from '@passness/database';
import type { MembershipRole } from './types';

/**
 * Rôles pour lesquels la double authentification est obligatoire (ADR-047).
 * STAFF voit les réservations et les clients de l'organisation : inclus par
 * défaut. Retirer un rôle d'ici suffit à l'assouplir.
 */
export const TWO_FACTOR_REQUIRED_ROLES: readonly MembershipRole[] = [
  'OWNER',
  'ADMIN',
  'MANAGER',
  'STAFF',
];

/** Vrai si l'utilisateur est administrateur plateforme ou membre actif d'une organisation. */
export async function isTwoFactorRequired(db: DbExecutor, userId: string): Promise<boolean> {
  const [admin] = await db
    .select({ isPlatformAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (admin?.isPlatformAdmin) return true;

  const rows = await db
    .select({ role: organizationMemberships.role })
    .from(organizationMemberships)
    .where(
      and(eq(organizationMemberships.userId, userId), eq(organizationMemberships.status, 'ACTIVE')),
    );
  return rows.some((r) => TWO_FACTOR_REQUIRED_ROLES.includes(r.role as MembershipRole));
}
