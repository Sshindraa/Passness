import { redirect } from 'next/navigation';
import { ClientShell } from '@/components/shells/client-shell';
import { SecuritySetup, SignOutButton } from '@/components/auth/auth-forms';
import { getSessionIdentity } from '@/lib/auth-session';
import { getAccountState } from '@/lib/auth';
import styles from '../auth-page.module.css';

export default async function AccountSecurityPage(): Promise<React.ReactElement> {
  const identity = await getSessionIdentity();
  if (!identity) redirect('/sign-in?redirect_url=%2Faccount-security');
  const state = await getAccountState();
  return (
    <ClientShell alternateHref="/" alternateLabel="Accueil" showAuthAction={false}>
      <main className={styles.page}>
        <section className={styles.card} aria-labelledby="security-title">
          <h1 id="security-title" className={styles.title}>
            Sécurité du compte
          </h1>
          <p className={styles.description}>Double authentification par application.</p>
          <SecuritySetup
            twoFactorEnabled={identity.twoFactorEnabled}
            required={state.status === 'two-factor-setup-required'}
          />
          <p>
            <SignOutButton>Se déconnecter</SignOutButton>
          </p>
        </section>
      </main>
    </ClientShell>
  );
}
