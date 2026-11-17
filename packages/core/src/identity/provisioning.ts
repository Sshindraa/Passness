import { eq } from 'drizzle-orm';
import type { DatabaseClient } from '@passness/database';
import { users } from '@passness/database';
import type { AuthenticatedUser } from './types';
import { AccountDeletedError, AccountLinkRefusedError } from './types';

/**
 * Provisioning d'un utilisateur Passness depuis l'identité Better Auth (ADR-006, ADR-039, ADR-047).
 *
 * À la première connexion authentifiée, Passness crée un `users` avec
 * oidc_subject + oidc_provider + email. Si l'utilisateur existe déjà
 * par oidc_subject, il est réutilisé. Un `users` créé par invitation (jamais
 * connecté, `oidc_provider` nul) est rattaché par e-mail, uniquement si l'e-mail
 * est vérifié. Tout autre compte trouvé par e-mail (`counter`, `clerk` non migré,
 * autre identité) est refusé : jamais de reprise de compte par e-mail seul.
 *
 * Si le compte a été supprimé / neutralisé (deletedAt !== null), la connexion
 * est strictement rejetée (fail-closed, ADR-039).
 *
 * Passness reste la source de vérité des rôles et appartenances.
 */
export async function provisionUserFromOidc(
  db: DatabaseClient,
  input: {
    oidcSubject: string;
    oidcProvider: string;
    email: string;
    emailVerified: boolean;
    displayName?: string | null;
  },
): Promise<AuthenticatedUser> {
  const email = input.email.trim().toLowerCase();

  return db.transaction(async (tx) => {
    // Recherche par oidc_subject d'abord.
    const [bySubject] = await tx
      .select()
      .from(users)
      .where(eq(users.oidcSubject, input.oidcSubject))
      .limit(1);

    if (bySubject) {
      if (bySubject.deletedAt !== null) {
        throw new AccountDeletedError();
      }
      return mapUser(bySubject);
    }

    // Sinon, recherche par email (un utilisateur peut avoir été invité / créé).
    // Le verrou sérialise les liaisons concurrentes sur un utilisateur existant.
    const [byEmail] = await tx
      .select()
      .from(users)
      .where(eq(users.email, email))
      .for('update')
      .limit(1);

    if (byEmail) {
      if (byEmail.deletedAt !== null) {
        throw new AccountDeletedError();
      }
      if (byEmail.oidcProvider !== null || byEmail.oidcSubject !== null || !input.emailVerified) {
        throw new AccountLinkRefusedError();
      }
      // Relie le compte invité à l'identité OIDC.
      const [updated] = await tx
        .update(users)
        .set({
          oidcSubject: input.oidcSubject,
          oidcProvider: input.oidcProvider,
          emailVerifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, byEmail.id))
        .returning();
      if (!updated) throw new Error('Échec de mise à jour utilisateur.');
      return mapUser(updated);
    }

    // Sinon, crée l'utilisateur. Sans cible explicite, PostgreSQL ignore un
    // conflit sur email ou oidc_subject, les deux colonnes étant uniques.
    const [created] = await tx
      .insert(users)
      .values({
        email,
        oidcSubject: input.oidcSubject,
        oidcProvider: input.oidcProvider,
        emailVerifiedAt: input.emailVerified ? new Date() : null,
        displayName: input.displayName ?? null,
      })
      .onConflictDoNothing()
      .returning();
    if (created) return mapUser(created);

    // Une autre transaction a gagné l'insertion. Relire dans le même ordre
    // métier pour retourner le même utilisateur sans violer une contrainte.
    const [winnerBySubject] = await tx
      .select()
      .from(users)
      .where(eq(users.oidcSubject, input.oidcSubject))
      .limit(1);
    if (winnerBySubject) {
      if (winnerBySubject.deletedAt !== null) {
        throw new AccountDeletedError();
      }
      return mapUser(winnerBySubject);
    }

    const [winnerByEmail] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
    if (winnerByEmail) {
      if (winnerByEmail.deletedAt !== null) {
        throw new AccountDeletedError();
      }
      throw new AccountLinkRefusedError();
    }

    throw new Error('Échec de création utilisateur.');
  });
}

function mapUser(row: typeof users.$inferSelect): AuthenticatedUser {
  return {
    id: row.id,
    oidcSubject: row.oidcSubject ?? '',
    email: row.email,
    emailVerified: row.emailVerifiedAt !== null,
    isPlatformAdmin: row.isPlatformAdmin,
  };
}
