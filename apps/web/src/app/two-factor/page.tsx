import { Suspense } from 'react';
import { ClientShell } from '@/components/shells/client-shell';
import { TwoFactorForm } from '@/components/auth/auth-forms';
import styles from '../auth-page.module.css';

export default function Page(): React.ReactElement {
  return (
    <ClientShell alternateHref="/sign-in" alternateLabel="Se connecter" showAuthAction={false}>
      <main className={styles.page}>
        <section className={styles.card} aria-labelledby="auth-title">
          <h1 id="auth-title" className={styles.title}>
            Vérification en deux étapes
          </h1>
          <p className={styles.description}>
            Saisissez le code de votre application d’authentification.
          </p>
          <Suspense>
            <TwoFactorForm />
          </Suspense>
        </section>
      </main>
    </ClientShell>
  );
}
