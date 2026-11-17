import { Suspense } from 'react';
import { ClientShell } from '@/components/shells/client-shell';
import { SignUpForm } from '@/components/auth/auth-forms';
import styles from '../auth-page.module.css';

export default function Page(): React.ReactElement {
  return (
    <ClientShell
      alternateHref="/sign-in"
      alternateLabel="Déjà un compte ? Se connecter"
      showAuthAction={false}
    >
      <main className={styles.page}>
        <section className={styles.card} aria-labelledby="auth-title">
          <h1 id="auth-title" className={styles.title}>
            Créer un compte
          </h1>
          <p className={styles.description}>
            Réservez du matériel ou gérez votre activité de loueur.
          </p>
          <Suspense>
            <SignUpForm />
          </Suspense>
        </section>
      </main>
    </ClientShell>
  );
}
