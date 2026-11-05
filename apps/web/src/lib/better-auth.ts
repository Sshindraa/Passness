import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { captcha, twoFactor } from 'better-auth/plugins';
import {
  authAccounts,
  authRateLimits,
  authSessions,
  authTwoFactors,
  authUsers,
  authVerifications,
} from '@passness/database';
import type { DatabaseClient } from '@passness/database';
import { getDb } from './db';
import { authEmails, sendAuthEmail, type AuthEmail } from './auth-email';

/**
 * Better Auth (ADR-047). Identité, sessions, 2FA : rien d'autre. Les rôles et
 * `is_platform_admin` restent dans `users` (ADR-006) et ne passent jamais par la session.
 */
export function createAuth(
  db: DatabaseClient,
  send: (email: AuthEmail) => void = sendAuthEmail,
  options: { rateLimit?: boolean } = {},
) {
  const production = process.env.NODE_ENV === 'production';
  const baseUrl =
    process.env.BETTER_AUTH_URL ?? process.env.PUBLIC_APP_URL ?? 'http://localhost:3000';
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (production && !turnstileSecret) {
    throw new Error('TURNSTILE_SECRET_KEY est obligatoire en production (ADR-047).');
  }
  // Hôtes autorisés : l'URL publique et, en preview Vercel uniquement, l'URL du déploiement.
  const previewHosts =
    process.env.VERCEL_ENV === 'preview'
      ? [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].filter((h): h is string => !!h)
      : [];

  return betterAuth({
    appName: 'Passness',
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: {
      allowedHosts: [new URL(baseUrl).host, ...previewHosts],
      protocol: production ? 'https' : 'http',
      fallback: baseUrl,
    },
    trustedOrigins: previewHosts.map((h) => `https://${h}`),
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
        twoFactor: authTwoFactors,
        rateLimit: authRateLimits,
      },
    }),
    session: { expiresIn: 60 * 60 * 24 * 7 },
    advanced: {
      // Seul l'en-tête que Vercel réécrit à chaque requête est fiable pour la limitation par IP.
      ipAddress: {
        ipAddressHeaders: [process.env.VERCEL ? 'x-vercel-forwarded-for' : 'x-forwarded-for'],
      },
    },
    rateLimit: {
      enabled:
        options.rateLimit ??
        (process.env.NODE_ENV !== 'test' && process.env.AUTH_RATE_LIMIT !== 'off'),
      storage: 'database',
      modelName: 'rateLimit',
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 300, max: 5 },
        '/request-password-reset': { window: 300, max: 3 },
        '/send-verification-email': { window: 300, max: 3 },
        '/reset-password': { window: 300, max: 5 },
        '/two-factor/*': { window: 60, max: 5 },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        send(authEmails.reset(user.email, url));
      },
      onExistingUserSignUp: async ({ user }) => {
        send(authEmails.existingAccount(user.email, `${baseUrl}/forgot-password`));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        send(authEmails.verify(user.email, url));
      },
    },
    plugins: [
      twoFactor({ issuer: 'Passness' }),
      ...(turnstileSecret
        ? [captcha({ provider: 'cloudflare-turnstile', secretKey: turnstileSecret })]
        : []),
      nextCookies(), // doit rester le dernier plugin
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
let cached: Auth | null = null;

/** Singleton paresseux : aucune lecture d'environnement à l'import (build, tests). */
export function getAuth(): Auth {
  if (!cached) cached = createAuth(getDb());
  return cached;
}
