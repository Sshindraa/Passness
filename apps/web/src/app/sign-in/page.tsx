import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { ClientShell } from '@/components/shells/client-shell';
import { SignInForm } from '@/components/auth/auth-forms';
import { getAccountState } from '@/lib/auth';
import { safeRedirectPath } from '@/lib/safe-redirect';
import styles from '../auth-page.module.css';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}): Promise<React.ReactElement> {
  const state = await getAccountState();
  if (state.status === 'two-factor-setup-required') redirect('/account-security');
  if (state.status === 'ready') {
    redirect(safeRedirectPath((await searchParams).redirect_url));
  }
  return (
    <ClientShell alternateHref="/sign-up" alternateLabel="Créer un compte" showAuthAction={false}>
      <main className={styles.page}>
        <section className={styles.card} aria-labelledby="sign-in-title">
          <h1 id="sign-in-title" className={styles.title}>
            Connexion
          </h1>
          <p className={styles.description}>Accédez à vos réservations et à votre espace loueur.</p>
          <Suspense>
            <SignInForm />
          </Suspense>
        </section>
      </main>
    </ClientShell>
  );
}
