/**
 * Bascule des comptes Clerk vers Better Auth (ADR-047). Aucune donnée Clerk n'est importée :
 * pour chaque `users` lié à Clerk (`oidc_provider = 'clerk'`, rapproché par `oidc_subject`, jamais par e-mail),
 * on crée une identité Better Auth sans mot de passe et on relie `users.oidc_subject` à celle-ci. L'identifiant
 * Clerk est conservé dans `users.legacy_clerk_id` (retour arrière). L'utilisateur définit son mot de passe
 * via « Mot de passe oublié » (le lien d'un e-mail vérifié crée le compte credential).
 *
 * Ne touche jamais : comptes `counter`, comptes effacés (RGPD), comptes sans e-mail vérifié.
 * Par défaut : simulation. `--apply` écrit. Hors localhost, `--apply` exige CONFIRM_REMOTE_MIGRATION=<hôte>.
 * Les sorties ne contiennent que des compteurs (aucune donnée personnelle).
 *
 *   node migrate-clerk-accounts.mjs [--apply] [--rollback]
 */
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function assertWriteAllowed(databaseUrl, environment = process.env) {
  const host = new URL(databaseUrl).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (LOCAL_HOSTS.has(host)) return;
  if (environment.CONFIRM_REMOTE_MIGRATION !== host) {
    throw new Error(
      `Base distante (${host}) : exportez CONFIRM_REMOTE_MIGRATION=${host} pour confirmer explicitement.`,
    );
  }
}

const ELIGIBLE = `
  "oidc_provider" = 'clerk'
  AND "deleted_at" IS NULL
  AND "oidc_subject" IS NOT NULL
  AND "oidc_subject" NOT LIKE 'erased-%'
  AND "legacy_clerk_id" IS NULL
`;

export async function countAccounts(sql) {
  const [row] = await sql`
    SELECT
      count(*) FILTER (WHERE "oidc_provider" = 'clerk' AND "deleted_at" IS NULL) AS clerk_active,
      count(*) FILTER (WHERE "oidc_provider" = 'clerk' AND "deleted_at" IS NULL AND "email_verified_at" IS NULL) AS clerk_unverified,
      count(*) FILTER (WHERE "oidc_provider" = 'better-auth' AND "deleted_at" IS NULL) AS better_auth,
      count(*) FILTER (WHERE "oidc_provider" = 'counter') AS counter,
      count(*) FILTER (WHERE "deleted_at" IS NOT NULL) AS erased
    FROM "users"`;
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
}

export async function migrateClerkAccounts(sql, { apply }) {
  const result = { eligible: 0, migrated: 0, skippedUnverified: 0, skippedEmailTaken: 0 };
  await sql.begin(async (tx) => {
    const rows = await tx.unsafe(
      `SELECT "id", "email", "display_name", "oidc_subject", "email_verified_at" FROM "users" WHERE ${ELIGIBLE} FOR UPDATE`,
    );
    result.eligible = rows.length;
    for (const u of rows) {
      if (u.email_verified_at === null) {
        result.skippedUnverified++;
        continue;
      }
      const [taken] = await tx`SELECT 1 FROM "auth_users" WHERE "email" = ${u.email}`;
      if (taken) {
        result.skippedEmailTaken++;
        continue;
      }
      if (!apply) continue;
      const authId = randomUUID();
      await tx`
        INSERT INTO "auth_users" ("id", "name", "email", "email_verified")
        VALUES (${authId}, ${u.display_name ?? u.email.split('@')[0]}, ${u.email}, true)`;
      await tx`
        UPDATE "users"
        SET "legacy_clerk_id" = "oidc_subject", "oidc_subject" = ${authId},
            "oidc_provider" = 'better-auth', "updated_at" = now()
        WHERE "id" = ${u.id}`;
      result.migrated++;
    }
  });
  return result;
}

/**
 * Retour arrière : restaure `oidc_subject` Clerk depuis `legacy_clerk_id`. Les comptes créés après la
 * bascule (sans `legacy_clerk_id`) sont détachés (comme des comptes invités : ils se rattacheront par
 * e-mail vérifié à leur première connexion côté Clerk) et comptés dans le rapport.
 */
export async function rollbackToClerk(sql, { apply }) {
  const result = { restored: 0, detachedAfterSwitch: 0 };
  await sql.begin(async (tx) => {
    const [r] =
      await tx`SELECT count(*) AS n FROM "users" WHERE "legacy_clerk_id" IS NOT NULL AND "deleted_at" IS NULL`;
    const [d] =
      await tx`SELECT count(*) AS n FROM "users" WHERE "oidc_provider" = 'better-auth' AND "legacy_clerk_id" IS NULL AND "deleted_at" IS NULL`;
    result.restored = Number(r.n);
    result.detachedAfterSwitch = Number(d.n);
    if (!apply) return;
    await tx`
      DELETE FROM "auth_users" WHERE "id" IN (
        SELECT "oidc_subject" FROM "users" WHERE "oidc_provider" = 'better-auth')`;
    await tx`
      UPDATE "users" SET "oidc_subject" = NULL, "oidc_provider" = NULL, "updated_at" = now()
      WHERE "oidc_provider" = 'better-auth' AND "legacy_clerk_id" IS NULL AND "deleted_at" IS NULL`;
    await tx`
      UPDATE "users" SET "oidc_subject" = "legacy_clerk_id", "oidc_provider" = 'clerk',
        "legacy_clerk_id" = NULL, "updated_at" = now()
      WHERE "legacy_clerk_id" IS NOT NULL AND "deleted_at" IS NULL`;
  });
  return result;
}

function isMainModule() {
  return (
    process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])
  );
}

if (isMainModule()) {
  const apply = process.argv.includes('--apply');
  const rollback = process.argv.includes('--rollback');
  const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_DIRECT_URL ou DATABASE_URL requis.');
  if (apply) assertWriteAllowed(url);
  const sql = postgres(url, { max: 1 });
  try {
    console.log('Avant :', await countAccounts(sql));
    const result = rollback
      ? await rollbackToClerk(sql, { apply })
      : await migrateClerkAccounts(sql, { apply });
    console.log(apply ? 'Appliqué :' : 'Simulation (aucune écriture) :', result);
    if (apply) console.log('Après :', await countAccounts(sql));
  } finally {
    await sql.end();
  }
}
