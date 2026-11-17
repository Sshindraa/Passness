import { test as setup, expect, type APIResponse } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { totpFromUri } from '../../test-support/totp';

setup.describe.configure({ mode: 'serial' });

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const authFile = join(packageRoot, 'playwright', '.auth', 'user.json');
const totpUriFile = join(packageRoot, 'playwright', '.auth', 'totp-uri.txt');

function findWorkspaceRoot(startDirectory: string): string {
  let current = resolve(startDirectory);
  while (true) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error('Workspace root not found.');
    current = parent;
  }
}

function fixture(action: 'reset' | 'verify-email' | 'membership'): void {
  execFileSync(
    'pnpm',
    ['--filter', '@passness/database', 'db:ensure-browser-e2e-membership', action],
    { cwd: findWorkspaceRoot(packageRoot), env: process.env, stdio: 'inherit' },
  );
}

async function ok(res: APIResponse, what: string): Promise<unknown> {
  expect(res.ok(), `${what} : ${res.status()}`).toBe(true);
  return res.json();
}

setup('crée un loueur de test avec 2FA et provisionne son accès Passness', async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL!;
  const password = process.env.E2E_USER_PASSWORD!;
  const base =
    process.env.PLAYWRIGHT_TEST_BASE_URL ??
    `http://localhost:${process.env.PLAYWRIGHT_TEST_PORT ?? '3000'}`;
  const headers = { Origin: base };

  fixture('reset');
  await ok(
    await page.request.post('/api/auth/sign-up/email', {
      headers,
      data: { email, password, name: 'Loueur E2E' },
    }),
    'inscription',
  );
  fixture('verify-email');
  await ok(
    await page.request.post('/api/auth/sign-in/email', { headers, data: { email, password } }),
    'connexion',
  );

  // Route cliente réelle : exécute getAuthenticatedUser() puis provisionUserFromOidc().
  await page.goto('/fr/account/bookings', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Mes locations' })).toBeVisible();

  fixture('membership');

  // Devenu loueur sans 2FA, il est bloqué et renvoyé vers la configuration de la double authentification.
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/account-security$/);
  await expect(page.getByText('La double authentification est obligatoire')).toBeVisible();

  const enabled = (await ok(
    await page.request.post('/api/auth/two-factor/enable', { headers, data: { password } }),
    'activation 2FA',
  )) as { totpURI: string };
  await ok(
    await page.request.post('/api/auth/two-factor/verify-totp', {
      headers,
      data: { code: totpFromUri(enabled.totpURI) },
    }),
    'vérification TOTP',
  );

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Vos organisations' })).toBeVisible();
  await expect(page.getByRole('article').filter({ hasText: 'test-org-dev' })).toBeVisible();

  mkdirSync(dirname(authFile), { recursive: true });
  writeFileSync(totpUriFile, enabled.totpURI);
  await page.context().storageState({ path: authFile });
});
