import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { totpFromUri } from '../../test-support/totp';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const email = process.env.E2E_USER_EMAIL!;
const password = process.env.E2E_USER_PASSWORD!;

test.describe('Parcours d’authentification dans le navigateur', () => {
  test('connexion refusée avec un mauvais mot de passe, sans révéler si le compte existe', async ({
    page,
  }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe-0123');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByText('E-mail ou mot de passe incorrect.')).toBeVisible();
  });

  test('inscription : même message, compte existant ou non', async ({ page }) => {
    await page.goto('/sign-up');
    await page.getByLabel('Nom complet').fill('Test');
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe').fill('un-mot-de-passe-solide-42');
    await page.getByRole('button', { name: 'Créer mon compte' }).click();
    await expect(page.getByText('Si cette adresse peut être utilisée')).toBeVisible();
  });

  test('mot de passe oublié : réponse identique pour une adresse inconnue', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Adresse e-mail').fill('inconnu@example.com');
    await page.getByRole('button', { name: 'Envoyer le lien' }).click();
    await expect(page.getByText('Si un compte existe pour cette adresse')).toBeVisible();
  });

  test('réinitialisation : lien invalide refusé', async ({ page }) => {
    await page.goto('/reset-password?error=INVALID_TOKEN');
    await expect(page.getByText('Ce lien est invalide ou expiré')).toBeVisible();
  });

  test('connexion loueur : mot de passe puis code 2FA, puis déconnexion', async ({ page }) => {
    await page.goto('/sign-in?redirect_url=%2Fdashboard');
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe').fill(password);
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page).toHaveURL(/\/two-factor/);
    const uri = readFileSync(join(packageRoot, 'playwright', '.auth', 'totp-uri.txt'), 'utf8');
    await page.getByLabel(/Code de votre application/).fill(totpFromUri(uri, Date.now() + 30000));
    await page.getByRole('button', { name: 'Valider' }).click();

    await expect(page.getByRole('heading', { name: 'Vos organisations' })).toBeVisible();

    await page.goto('/account-security');
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
