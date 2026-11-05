'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { Alert, Button, Field, Input } from '@passness/ui';
import { authClient } from '@/lib/auth-client';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { captchaHeaders, captchaRequired, Turnstile } from './turnstile';
import styles from './auth-forms.module.css';

type Result = { error?: { message?: string | undefined; code?: string | undefined } | null };

function useSubmit() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>): Promise<void> => {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch {
      setError('Une erreur est survenue. Réessayez dans un instant.');
    } finally {
      setPending(false);
    }
  };
  return { pending, error, notice, setError, setNotice, run };
}

function Feedback({
  error,
  notice,
}: {
  error: string | null;
  notice: string | null;
}): React.ReactElement | null {
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (notice) return <Alert tone="success">{notice}</Alert>;
  return null;
}

function useRedirectUrl(): string {
  const params = useSearchParams();
  return safeRedirectPath(params.get('redirect_url'));
}

export function SignInForm(): React.ReactElement {
  const redirectUrl = useRedirectUrl();
  const verified = useSearchParams().get('verified') === '1';
  const s = useSubmit();
  const [token, setToken] = useState<string | null>(null);
  const onToken = useCallback((t: string | null) => setToken(t), []);

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void s.run(async () => {
      const res: Result = await authClient.signIn.email({
        email: String(form.get('email')),
        password: String(form.get('password')),
        fetchOptions: { headers: captchaHeaders(token) },
      });
      if (res.error) {
        if (res.error.code === 'EMAIL_NOT_VERIFIED') {
          s.setNotice(
            'Confirmez votre adresse : un nouvel e-mail de vérification vient de vous être envoyé.',
          );
        } else {
          s.setError(
            res.error.message && res.error.code === 'TOO_MANY_REQUESTS'
              ? 'Trop de tentatives. Patientez quelques instants.'
              : 'E-mail ou mot de passe incorrect.',
          );
        }
        return;
      }
      // La redirection vers /two-factor est gérée par le plugin client si la 2FA est active.
      if (!(res as { data?: { twoFactorRedirect?: boolean } }).data?.twoFactorRedirect) {
        window.location.assign(redirectUrl);
      }
    });
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate={false}>
      {verified ? (
        <Alert tone="success">Adresse confirmée. Vous pouvez vous connecter.</Alert>
      ) : null}
      <Field label="Adresse e-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Mot de passe" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Turnstile onToken={onToken} />
      <Feedback error={s.error} notice={s.notice} />
      <Button type="submit" disabled={s.pending || (captchaRequired && !token)}>
        {s.pending ? 'Connexion…' : 'Se connecter'}
      </Button>
      <p className={styles.links}>
        <Link href="/forgot-password">Mot de passe oublié ?</Link>
      </p>
    </form>
  );
}

export function SignUpForm(): React.ReactElement {
  const s = useSubmit();
  const [token, setToken] = useState<string | null>(null);
  const onToken = useCallback((t: string | null) => setToken(t), []);
  const [done, setDone] = useState(false);

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void s.run(async () => {
      const res: Result = await authClient.signUp.email({
        name: String(form.get('name')),
        email: String(form.get('email')),
        password: String(form.get('password')),
        callbackURL: '/sign-in?verified=1',
        fetchOptions: { headers: captchaHeaders(token) },
      });
      if (res.error) {
        s.setError(
          res.error.code === 'PASSWORD_COMPROMISED'
            ? 'Ce mot de passe figure dans une fuite de données. Choisissez-en un autre.'
            : res.error.code === 'PASSWORD_TOO_SHORT'
              ? 'Le mot de passe doit contenir au moins 12 caractères.'
              : 'Inscription impossible. Vérifiez les informations saisies.',
        );
        return;
      }
      setDone(true);
    });
  };

  // Même message que le compte existe ou non (anti-énumération).
  if (done) {
    return (
      <Alert tone="success">
        Si cette adresse peut être utilisée, un e-mail de confirmation vient de lui être envoyé.
        Cliquez sur le lien qu’il contient pour activer votre compte.
      </Alert>
    );
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <Field label="Nom complet" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required />
      </Field>
      <Field label="Adresse e-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Mot de passe" htmlFor="password" help="12 caractères minimum.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
        />
      </Field>
      <Turnstile onToken={onToken} />
      <Feedback error={s.error} notice={s.notice} />
      <Button type="submit" disabled={s.pending || (captchaRequired && !token)}>
        {s.pending ? 'Création…' : 'Créer mon compte'}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm(): React.ReactElement {
  const s = useSubmit();
  const [token, setToken] = useState<string | null>(null);
  const onToken = useCallback((t: string | null) => setToken(t), []);
  const [done, setDone] = useState(false);

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email'));
    void s.run(async () => {
      await authClient.requestPasswordReset({
        email,
        redirectTo: '/reset-password',
        fetchOptions: { headers: captchaHeaders(token) },
      });
      setDone(true); // même réponse que le compte existe ou non
    });
  };

  if (done) {
    return (
      <Alert tone="success">
        Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d’être envoyé.
      </Alert>
    );
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <Field label="Adresse e-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Turnstile onToken={onToken} />
      <Feedback error={s.error} notice={s.notice} />
      <Button type="submit" disabled={s.pending || (captchaRequired && !token)}>
        Envoyer le lien
      </Button>
    </form>
  );
}

export function ResetPasswordForm(): React.ReactElement {
  const params = useSearchParams();
  const token = params.get('token');
  const s = useSubmit();
  const [done, setDone] = useState(false);

  if (!token || params.get('error')) {
    return <Alert tone="danger">Ce lien est invalide ou expiré. Demandez-en un nouveau.</Alert>;
  }
  if (done) {
    return (
      <Alert tone="success">
        Mot de passe modifié. <Link href="/sign-in">Se connecter</Link>
      </Alert>
    );
  }
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const newPassword = String(new FormData(e.currentTarget).get('password'));
    void s.run(async () => {
      const res: Result = await authClient.resetPassword({ newPassword, token });
      if (res.error) {
        s.setError(
          res.error.code === 'PASSWORD_COMPROMISED'
            ? 'Ce mot de passe figure dans une fuite de données. Choisissez-en un autre.'
            : 'Réinitialisation impossible. Le lien a peut-être expiré.',
        );
        return;
      }
      setDone(true);
    });
  };
  return (
    <form className={styles.form} onSubmit={submit}>
      <Field label="Nouveau mot de passe" htmlFor="password" help="12 caractères minimum.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
        />
      </Field>
      <Feedback error={s.error} notice={s.notice} />
      <Button type="submit" disabled={s.pending}>
        Modifier le mot de passe
      </Button>
    </form>
  );
}

export function TwoFactorForm(): React.ReactElement {
  const redirectUrl = useRedirectUrl();
  const s = useSubmit();
  const [backup, setBackup] = useState(false);

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code')).replace(/\s/g, '');
    void s.run(async () => {
      const res: Result = backup
        ? await authClient.twoFactor.verifyBackupCode({ code })
        : await authClient.twoFactor.verifyTotp({ code });
      if (res.error) {
        s.setError('Code invalide ou expiré.');
        return;
      }
      window.location.assign(redirectUrl);
    });
  };
  return (
    <form className={styles.form} onSubmit={submit}>
      <Field
        label={backup ? 'Code de secours' : 'Code de votre application d’authentification'}
        htmlFor="code"
      >
        <Input
          id="code"
          name="code"
          inputMode={backup ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          required
        />
      </Field>
      <Feedback error={s.error} notice={s.notice} />
      <Button type="submit" disabled={s.pending}>
        Valider
      </Button>
      <p className={styles.links}>
        <button type="button" className={styles.linkButton} onClick={() => setBackup(!backup)}>
          {backup ? 'Utiliser mon application' : 'Utiliser un code de secours'}
        </button>
      </p>
    </form>
  );
}

export function SecuritySetup({
  twoFactorEnabled,
  required,
}: {
  twoFactorEnabled: boolean;
  required: boolean;
}): React.ReactElement {
  const s = useSubmit();
  const [enrol, setEnrol] = useState<{ uri: string; codes: string[] } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(twoFactorEnabled);

  useEffect(() => {
    if (enrol) void QRCode.toDataURL(enrol.uri, { margin: 1, width: 200 }).then(setQr);
  }, [enrol]);

  const start = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get('password'));
    void s.run(async () => {
      const res = await authClient.twoFactor.enable({ password });
      if (res.error || !res.data || !('totpURI' in res.data)) {
        s.setError('Mot de passe incorrect.');
        return;
      }
      setEnrol({ uri: res.data.totpURI, codes: res.data.backupCodes });
    });
  };
  const confirm = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code')).replace(/\s/g, '');
    void s.run(async () => {
      const res: Result = await authClient.twoFactor.verifyTotp({ code });
      if (res.error) {
        s.setError('Code invalide. Vérifiez l’heure de votre téléphone.');
        return;
      }
      setEnabled(true);
      setEnrol(null);
    });
  };

  if (enabled) {
    return (
      <>
        <Alert tone="success">La double authentification est activée.</Alert>
        <p className={styles.links}>
          <Link href="/dashboard">Continuer</Link>
        </p>
      </>
    );
  }
  if (enrol) {
    return (
      <form className={styles.form} onSubmit={confirm}>
        <p>
          Scannez ce code avec une application d’authentification (Google Authenticator, 1Password,
          Authy…).
        </p>
        {qr ? <img src={qr} alt="QR code d’activation" width={200} height={200} /> : null}
        <p>Conservez ces codes de secours en lieu sûr (chacun ne sert qu’une fois) :</p>
        <pre className={styles.codes}>{enrol.codes.join('\n')}</pre>
        <Field label="Code à 6 chiffres" htmlFor="code">
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required />
        </Field>
        <Feedback error={s.error} notice={s.notice} />
        <Button type="submit" disabled={s.pending}>
          Activer
        </Button>
      </form>
    );
  }
  return (
    <form className={styles.form} onSubmit={start}>
      {required ? (
        <Alert tone="warning">
          La double authentification est obligatoire pour les comptes professionnels et
          administrateurs.
        </Alert>
      ) : null}
      <Field label="Confirmez votre mot de passe" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Feedback error={s.error} notice={s.notice} />
      <Button type="submit" disabled={s.pending}>
        Activer la double authentification
      </Button>
    </form>
  );
}

export function SignOutButton({
  redirectTo = '/sign-in',
  children,
}: {
  redirectTo?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void authClient
          .signOut()
          .then(() => window.location.assign(redirectTo))
          .catch(() => setPending(false));
      }}
    >
      {children}
    </Button>
  );
}
