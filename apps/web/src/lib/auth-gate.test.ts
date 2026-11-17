import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : walk(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

// Seuls ces fichiers lisent la session ou le fournisseur d'identité (ADR-047).
const ALLOWED_SESSION_READERS = new Set([
  'lib/auth.ts',
  'lib/auth-session.ts',
  'lib/better-auth.ts',
  'proxy.ts',
  'app/api/auth/[...all]/route.ts',
  'app/account-security/page.tsx', // page de configuration 2FA : session sans passerelle
]);

describe('passerelle d’authentification (ADR-047)', () => {
  const files = walk(root).map((f) => [relative(root, f), readFileSync(f, 'utf8')] as const);

  it('aucune route, action ou page ne contourne getAuthenticatedUser / getAccountState', () => {
    const offenders = files
      .filter(([, src]) =>
        /from '(@\/lib\/(auth-session|better-auth)|better-auth(\/[^']*)?)'/.test(src),
      )
      .filter(([path]) => !ALLOWED_SESSION_READERS.has(path))
      .filter(
        ([path, src]) =>
          !(path.startsWith('components/auth/') || path === 'lib/auth-client.ts') ||
          /auth-session|lib\/better-auth/.test(src),
      )
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('les helpers require*Of délèguent à getAuthenticatedUser', () => {
    for (const helper of [
      'catalog-auth',
      'fulfillment-auth',
      'finances-auth',
      'amendment-auth',
      'support-auth',
    ]) {
      expect(readFileSync(join(root, `lib/${helper}.ts`), 'utf8')).toContain(
        'getAuthenticatedUser',
      );
    }
  });

  it('getAuthenticatedUser applique la 2FA obligatoire avant de rendre un utilisateur', () => {
    const src = readFileSync(join(root, 'lib/auth.ts'), 'utf8');
    expect(src).toContain('isTwoFactorRequired');
    expect(src).toContain("status: 'two-factor-setup-required'");
    expect(src).toMatch(/state\.status === 'ready' \? state\.user : null/);
  });

  it('toute Server Action authentifie via getAuthenticatedUser', () => {
    const actions = files.filter(
      ([path, src]) => path.startsWith('app/actions/') && /^'use server'/m.test(src),
    );
    const publicActions = new Set([
      'app/actions/home-search-options.ts',
      'app/actions/intent-search.ts',
    ]);
    const missing = actions
      .filter(([path]) => !publicActions.has(path))
      .filter(
        ([, src]) =>
          !/getAuthenticatedUser|require[A-Za-z]+Of\b|requireSupportPlatformAdmin/.test(src),
      )
      .map(([path]) => path);
    expect(missing).toEqual([]);
  });

  it('le proxy ne laisse publiques que les routes d’authentification et de contenu public', () => {
    const src = readFileSync(join(root, 'proxy.ts'), 'utf8');
    for (const sensitive of [
      '/dashboard',
      '/internal',
      '/admin',
      '/checkout',
      '/onboarding',
      '/account-security',
    ]) {
      expect(src).not.toContain(`'${sensitive}`);
    }
  });
});
