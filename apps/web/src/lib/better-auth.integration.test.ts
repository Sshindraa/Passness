import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import {
  assertLocalhost,
  createDatabase,
  runMigrations,
  type DatabaseClient,
} from '@passness/database';
import { authUsers } from '@passness/database';
import { eq } from 'drizzle-orm';
import { createAuth } from './better-auth';
import type { AuthEmail } from './auth-email';
import { totpFromUri } from '../test-support/totp';

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: vi.fn(), get: vi.fn() }),
  headers: async () => new Headers(),
}));

const sourceUrl = process.env.DATABASE_URL;
const testDatabase = `passness_test_auth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const shouldSkip = !sourceUrl && process.env.CI !== '1' && process.env.CI !== 'true';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any; // corps JSON de réponse, vérifié champ par champ
const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct-horse-battery-staple';

describe.skipIf(shouldSkip)('Better Auth — parcours complet (PostgreSQL local)', () => {
  let db: DatabaseClient;
  const outbox: AuthEmail[] = [];
  let auth: ReturnType<typeof createAuth>;

  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET = 'integration-test-secret-integration-test-secret';
    process.env.BETTER_AUTH_URL = ORIGIN;
    assertLocalhost(sourceUrl!);
    const admin = postgres(sourceUrl!, { max: 1 });
    await admin.unsafe(`CREATE DATABASE ${testDatabase}`);
    await admin.end();
    const parsed = new URL(sourceUrl!);
    parsed.pathname = `/${testDatabase}`;
    await runMigrations(parsed.toString());
    db = createDatabase(parsed.toString());
    auth = createAuth(db, (e) => outbox.push(e));
  }, 600000);

  afterAll(async () => {
    await db?.$client.end();
    const admin = postgres(sourceUrl!, { max: 1 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${testDatabase}`);
    await admin.end();
  });

  async function call(
    path: string,
    body?: unknown,
    cookie = '',
    method = body === undefined ? 'GET' : 'POST',
  ): Promise<{ res: Response; json: Json; cookie: string }> {
    const res = await auth.handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method,
        headers: { origin: ORIGIN, 'content-type': 'application/json', cookie },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
    const setCookies = res.headers.getSetCookie().map((c) => c.split(';')[0]!);
    const merged = new Map(
      cookie
        .split('; ')
        .filter(Boolean)
        .map((c) => [c.split('=')[0]!, c]),
    );
    for (const c of setCookies) merged.set(c.split('=')[0]!, c);
    const text = await res.text();
    return {
      res,
      json: text.startsWith('{') ? JSON.parse(text) : null,
      cookie: [...merged.values()].join('; '),
    };
  }

  const tokenFromUrl = (url: string): string => new URL(url).pathname.split('/').pop()!;

  it('inscription → vérification d’e-mail obligatoire → connexion → 2FA → déconnexion → réinitialisation', async () => {
    const email = 'loueur@example.com';

    // Inscription : aucune session, un e-mail de vérification part.
    const signUp = await call('/sign-up/email', { email, password: PASSWORD, name: 'Loueur' });
    expect(signUp.res.status).toBe(200);
    expect(signUp.cookie).not.toContain('session_token');
    expect(outbox.at(-1)?.subject).toMatch(/Confirmez/);

    // Connexion refusée tant que l'e-mail n'est pas vérifié.
    const blocked = await call('/sign-in/email', { email, password: PASSWORD });
    expect(blocked.res.status).toBe(403);

    // Vérification d'e-mail via le lien reçu.
    const verifyUrl = outbox
      .filter((m) => m.to === email && /Confirmez/.test(m.subject))
      .at(-1)!.url;
    const verified = await call(
      `/verify-email?token=${new URL(verifyUrl).searchParams.get('token')}`,
    );
    expect(verified.res.status).toBeLessThan(400);
    const [row] = await db.select().from(authUsers).where(eq(authUsers.email, email));
    expect(row?.emailVerified).toBe(true);

    // Connexion.
    const signIn = await call('/sign-in/email', { email, password: PASSWORD });
    expect(signIn.res.status).toBe(200);
    let session = await auth.api.getSession({ headers: new Headers({ cookie: signIn.cookie }) });
    expect(session?.user.email).toBe(email);
    expect(session?.user.twoFactorEnabled).toBeFalsy();

    // Activation de la 2FA.
    const enable = await call('/two-factor/enable', { password: PASSWORD }, signIn.cookie);
    expect(enable.res.status).toBe(200);
    expect(enable.json.backupCodes).toHaveLength(10);
    const confirm = await call(
      '/two-factor/verify-totp',
      { code: totpFromUri(enable.json.totpURI) },
      enable.cookie,
    );
    expect(confirm.res.status).toBe(200);
    session = await auth.api.getSession({ headers: new Headers({ cookie: confirm.cookie }) });
    expect(session?.user.twoFactorEnabled).toBe(true);

    // Déconnexion : la session n'est plus valide.
    const out = await call('/sign-out', {}, confirm.cookie);
    expect(out.res.status).toBe(200);
    expect(
      await auth.api.getSession({ headers: new Headers({ cookie: confirm.cookie }) }),
    ).toBeNull();

    // Reconnexion : mot de passe seul ne suffit plus, aucune session n'est créée avant le code.
    const second = await call('/sign-in/email', { email, password: PASSWORD });
    expect(second.json.twoFactorRedirect).toBe(true);
    expect(
      await auth.api.getSession({ headers: new Headers({ cookie: second.cookie }) }),
    ).toBeNull();
    const code = await call(
      '/two-factor/verify-totp',
      { code: totpFromUri(enable.json.totpURI, Date.now() + 30000) },
      second.cookie,
    );
    // Le code du pas courant a déjà servi côté activation : le suivant (+30 s) est accepté par la fenêtre ±1.
    expect(code.res.status).toBe(200);
    expect(
      await auth.api.getSession({ headers: new Headers({ cookie: code.cookie }) }),
    ).not.toBeNull();

    // Un mauvais code est refusé.
    const third = await call('/sign-in/email', { email, password: PASSWORD });
    const bad = await call('/two-factor/verify-totp', { code: '000000' }, third.cookie);
    expect(bad.res.status).toBe(401);

    // Réinitialisation : toutes les sessions sont révoquées, l'ancien mot de passe ne marche plus.
    await call('/request-password-reset', { email, redirectTo: '/reset-password' });
    const reset = outbox
      .filter((m) => m.to === email && /Réinitialisation/.test(m.subject))
      .at(-1)!;
    const done = await call('/reset-password', {
      newPassword: 'another-long-passphrase-42',
      token: tokenFromUrl(reset.url),
    });
    expect(done.res.status).toBe(200);
    expect(await auth.api.getSession({ headers: new Headers({ cookie: code.cookie }) })).toBeNull();
    expect((await call('/sign-in/email', { email, password: PASSWORD })).res.status).toBe(401);
    const again = await call('/sign-in/email', { email, password: 'another-long-passphrase-42' });
    expect(again.json.twoFactorRedirect).toBe(true);
  });

  it('anti-énumération : mêmes réponses pour un compte existant ou inconnu', async () => {
    const sentBefore = outbox.length;
    const known = await call('/request-password-reset', {
      email: 'loueur@example.com',
      redirectTo: '/reset-password',
    });
    const unknown = await call('/request-password-reset', {
      email: 'inconnu@example.com',
      redirectTo: '/reset-password',
    });
    expect(known.res.status).toBe(unknown.res.status);
    expect(known.json).toEqual(unknown.json);
    expect(outbox.length).toBe(sentBefore + 1); // seul le compte existant reçoit un e-mail

    const dup = await call('/sign-up/email', {
      email: 'loueur@example.com',
      password: PASSWORD,
      name: 'Autre',
    });
    const fresh = await call('/sign-up/email', {
      email: 'nouveau@example.com',
      password: PASSWORD,
      name: 'Nouveau',
    });
    expect(dup.res.status).toBe(fresh.res.status);
    expect(Object.keys(dup.json ?? {}).sort()).toEqual(Object.keys(fresh.json ?? {}).sort());
    expect(outbox.some((m) => m.to === 'loueur@example.com' && /Tentative/.test(m.subject))).toBe(
      true,
    );
  });

  it('refuse un mot de passe trop court', async () => {
    const r = await call('/sign-up/email', {
      email: 'court@example.com',
      password: 'short',
      name: 'X',
    });
    expect(r.res.status).toBe(400);
  });

  it('limite le débit des connexions par IP (stockage base de données)', async () => {
    const limited = createAuth(db, () => {}, { rateLimit: true });
    const attempt = (): Promise<Response> =>
      limited.handler(
        new Request(`${ORIGIN}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: {
            origin: ORIGIN,
            'content-type': 'application/json',
            'x-forwarded-for': '203.0.113.9',
          },
          body: JSON.stringify({ email: 'x@example.com', password: PASSWORD }),
        }),
      );
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await attempt()).status);
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});
