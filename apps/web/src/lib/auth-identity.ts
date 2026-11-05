import { eq } from 'drizzle-orm';
import { authUsers } from '@passness/database';
import { getDb } from './db';

/**
 * RGPD (art. 17) : supprime l'identité Better Auth. Les sessions, comptes et secrets 2FA
 * partent en cascade. Idempotent : un sujet absent (compte `counter`, déjà supprimé) est ignoré.
 */
export async function deleteAuthIdentity(oidcSubject: string): Promise<void> {
  await getDb().delete(authUsers).where(eq(authUsers.id, oidcSubject));
}
