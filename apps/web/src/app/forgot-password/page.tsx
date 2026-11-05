import { Suspense } from 'react';
import { ClientShell } from '@/components/shells/client-shell';
import { ForgotPasswordForm } from '@/components/auth/auth-forms';
import styles from '../auth-page.module.css';

export default function Page(): React.ReactElement {
  return (
    <ClientShell alternateHref="/sign-in" alternateLabel="Se connecter" showAuthAction={false}>
      <main className={styles.page}>
        <section className={styles.card} aria-labelledby="auth-title">
          <h1 id="auth-title" className={styles.title}>
            Mot de passe oublié
          </h1>
          <p className={styles.description}>
            Indiquez votre adresse pour recevoir un lien de réinitialisation.
          </p>
          <Suspense>
            <ForgotPasswordForm />
          </Suspense>
        </section>
      </main>
    </ClientShell>
  );
}
