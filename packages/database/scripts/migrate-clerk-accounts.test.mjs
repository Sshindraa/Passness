import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { runMigrations } from '../src/migrate';
import {
  assertWriteAllowed,
  countAccounts,
  migrateClerkAccounts,
  rollbackToClerk,
} from './migrate-clerk-accounts.mjs';

const sourceUrl = process.env.DATABASE_URL;
const dbName = `passness_test_clerk_migration_${Date.now()}`;
const skip = !sourceUrl && process.env.CI !== '1' && process.env.CI !== 'true';

describe('garde-fou base distante', () => {
  it('refuse une écriture distante sans confirmation explicite', () => {
    expect(() => assertWriteAllowed('postgres://u:p@ep-x.neon.tech/db', {})).toThrow(
      /CONFIRM_REMOTE_MIGRATION/,
    );
    expect(() =>
      assertWriteAllowed('postgres://u:p@ep-x.neon.tech/db', { CONFIRM_REMOTE_MIGRATION: 'autre' }),
    ).toThrow();
    expect(() =>
      assertWriteAllowed('postgres://u:p@ep-x.neon.tech/db', {
        CONFIRM_REMOTE_MIGRATION: 'ep-x.neon.tech',
      }),
    ).not.toThrow();
    expect(() => assertWriteAllowed('postgres://u:p@localhost/db', {})).not.toThrow();
  });
});

describe.skipIf(skip)('bascule Clerk → Better Auth (PostgreSQL local)', () => {
  let sql;
  let admin;
  beforeAll(async () => {
    admin = postgres(sourceUrl, { max: 1 });
    await admin.unsafe(`CREATE DATABASE ${dbName}`);
    const url = new URL(sourceUrl);
    url.pathname = `/${dbName}`;
    await runMigrations(url.toString());
    sql = postgres(url.toString(), { max: 1 });
    await sql`
      INSERT INTO "users" ("email", "email_verified_at", "oidc_subject", "oidc_provider", "deleted_at") VALUES
      ('a@example.com', now(), 'user_a', 'clerk', NULL),
      ('b@example.com', now(), 'user_b', 'clerk', NULL),
      ('unverified@example.com', NULL, 'user_u', 'clerk', NULL),
      ('counter@example.com', now(), 'counter-1', 'counter', NULL),
      ('gone@example.com', now(), 'erased-1', NULL, now())`;
  }, 600000);
  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin?.end();
  });

  it('simulation : aucune écriture', async () => {
    const r = await migrateClerkAccounts(sql, { apply: false });
    expect(r).toMatchObject({ eligible: 3, migrated: 0, skippedUnverified: 1 });
    expect((await countAccounts(sql)).better_auth).toBe(0);
  });

  it('bascule par oidc_subject, sans toucher counter, effacés ni non vérifiés', async () => {
    const r = await migrateClerkAccounts(sql, { apply: true });
    expect(r).toMatchObject({ migrated: 2, skippedUnverified: 1 });
    const rows =
      await sql`SELECT "email", "oidc_provider", "legacy_clerk_id" FROM "users" ORDER BY "email"`;
    const byEmail = Object.fromEntries(rows.map((x) => [x.email, x]));
    expect(byEmail['a@example.com']).toMatchObject({
      oidc_provider: 'better-auth',
      legacy_clerk_id: 'user_a',
    });
    expect(byEmail['counter@example.com']).toMatchObject({
      oidc_provider: 'counter',
      legacy_clerk_id: null,
    });
    expect(byEmail['unverified@example.com']).toMatchObject({ oidc_provider: 'clerk' });
    expect(byEmail['gone@example.com'].oidc_provider).toBeNull();
    const [{ n }] =
      await sql`SELECT count(*) AS n FROM "auth_users" u JOIN "users" x ON x."oidc_subject" = u."id"`;
    expect(Number(n)).toBe(2);
    // Idempotent
    expect((await migrateClerkAccounts(sql, { apply: true })).migrated).toBe(0);
  });

  it('retour arrière : restaure les identifiants Clerk et détache les comptes créés après la bascule', async () => {
    await sql`INSERT INTO "auth_users" ("id","name","email","email_verified") VALUES ('new-1','N','new@example.com',true)`;
    await sql`INSERT INTO "users" ("email","email_verified_at","oidc_subject","oidc_provider") VALUES ('new@example.com', now(), 'new-1', 'better-auth')`;
    expect(await rollbackToClerk(sql, { apply: false })).toEqual({
      restored: 2,
      detachedAfterSwitch: 1,
    });
    await rollbackToClerk(sql, { apply: true });
    const rows =
      await sql`SELECT "email","oidc_subject","oidc_provider","legacy_clerk_id" FROM "users" WHERE "email" IN ('a@example.com','new@example.com')`;
    const byEmail = Object.fromEntries(rows.map((x) => [x.email, x]));
    expect(byEmail['a@example.com']).toMatchObject({
      oidc_subject: 'user_a',
      oidc_provider: 'clerk',
      legacy_clerk_id: null,
    });
    expect(byEmail['new@example.com']).toMatchObject({ oidc_subject: null, oidc_provider: null });
    const [{ n }] = await sql`SELECT count(*) AS n FROM "auth_users"`;
    expect(Number(n)).toBe(0);
  });
});
