import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import {
  assertLocalhost,
  createDatabase,
  organizationMemberships,
  organizations,
  runMigrations,
  users,
  type DatabaseClient,
} from '@passness/database';
import { eq } from 'drizzle-orm';
import { provisionUserFromOidc } from '@passness/core';

let db: DatabaseClient;
vi.mock('./db', () => ({ getDb: () => db }));
vi.mock('./auth-session', () => ({ getSessionIdentity: vi.fn() }));

const { getSessionIdentity } = await import('./auth-session');
const { getAccountState, getAuthenticatedUser } = await import('./auth');

const sourceUrl = process.env.DATABASE_URL;
const testDatabase = `passness_test_gate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const shouldSkip = !sourceUrl && process.env.CI !== '1' && process.env.CI !== 'true';

function identity(email: string, twoFactorEnabled: boolean) {
  return {
    subject: `auth-${email}`,
    email,
    emailVerified: true,
    displayName: null,
    twoFactorEnabled,
  };
}

describe.skipIf(shouldSkip)('passerelle 2FA — getAccountState / getAuthenticatedUser', () => {
  beforeAll(async () => {
    assertLocalhost(sourceUrl!);
    const admin = postgres(sourceUrl!, { max: 1 });
    await admin.unsafe(`CREATE DATABASE ${testDatabase}`);
    await admin.end();
    const parsed = new URL(sourceUrl!);
    parsed.pathname = `/${testDatabase}`;
    await runMigrations(parsed.toString());
    db = createDatabase(parsed.toString());
  }, 600000);

  afterAll(async () => {
    await db?.$client.end();
    const admin = postgres(sourceUrl!, { max: 1 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${testDatabase}`);
    await admin.end();
  });

  beforeEach(() => vi.mocked(getSessionIdentity).mockReset());

  async function member(email: string, role: 'OWNER' | 'STAFF'): Promise<void> {
    const u = await provisionUserFromOidc(db, {
      oidcSubject: `auth-${email}`,
      oidcProvider: 'better-auth',
      email,
      emailVerified: true,
    });
    const [org] = await db
      .insert(organizations)
      .values({ legalName: `Org ${email}`, slug: `org-${email.split('@')[0]}` })
      .returning();
    await db
      .insert(organizationMemberships)
      .values({ organizationId: org!.id, userId: u.id, role, status: 'ACTIVE' });
  }

  it('anonyme sans session', async () => {
    vi.mocked(getSessionIdentity).mockResolvedValue(null);
    expect(await getAccountState()).toEqual({ status: 'anonymous' });
    expect(await getAuthenticatedUser()).toBeNull();
  });

  it('client sans 2FA : autorisé', async () => {
    vi.mocked(getSessionIdentity).mockResolvedValue(identity('client@example.com', false));
    expect((await getAccountState()).status).toBe('ready');
    expect(await getAuthenticatedUser()).not.toBeNull();
  });

  it.each([['OWNER'], ['STAFF']] as const)(
    'membre %s sans 2FA : refusé tant que la 2FA n’est pas active',
    async (role) => {
      const email = `${role.toLowerCase()}@example.com`;
      await member(email, role);
      vi.mocked(getSessionIdentity).mockResolvedValue(identity(email, false));
      expect((await getAccountState()).status).toBe('two-factor-setup-required');
      expect(await getAuthenticatedUser()).toBeNull();

      vi.mocked(getSessionIdentity).mockResolvedValue(identity(email, true));
      expect((await getAccountState()).status).toBe('ready');
      expect(await getAuthenticatedUser()).not.toBeNull();
    },
  );

  it('administrateur plateforme sans 2FA : refusé', async () => {
    vi.mocked(getSessionIdentity).mockResolvedValue(identity('root@example.com', true));
    await getAccountState();
    await db
      .update(users)
      .set({ isPlatformAdmin: true })
      .where(eq(users.email, 'root@example.com'));
    vi.mocked(getSessionIdentity).mockResolvedValue(identity('root@example.com', false));
    expect(await getAuthenticatedUser()).toBeNull();
    vi.mocked(getSessionIdentity).mockResolvedValue(identity('root@example.com', true));
    expect((await getAuthenticatedUser())?.isPlatformAdmin).toBe(true);
  });
});
