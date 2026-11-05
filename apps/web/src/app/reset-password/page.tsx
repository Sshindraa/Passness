import { Suspense } from 'react';
import { ClientShell } from '@/components/shells/client-shell';
import { ResetPasswordForm } from '@/components/auth/auth-forms';
import styles from '../auth-page.module.css';

export default function Page(): React.ReactElement {
  return (
    <ClientShell alternateHref="/sign-in" alternateLabel="Se connecter" showAuthAction={false}>
      <main className={styles.page}>
        <section className={styles.card} aria-labelledby="auth-title">
          <h1 id="auth-title" className={styles.title}>
            Nouveau mot de passe
          </h1>
          <p className={styles.description}>Choisissez un mot de passe d’au moins 12 caractères.</p>
          <Suspense>
            <ResetPasswordForm />
          </Suspense>
        </section>
      </main>
    </ClientShell>
  );
}
