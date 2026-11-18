import { waitUntil } from '@vercel/functions';
import { Resend } from 'resend';

const DEFAULT_FROM = 'Passness <noreply@passness.com>';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const SUPPORT_EMAIL = 'support@passness.com';
const IGNORE_NOTICE =
  'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre compte reste protégé.';

function layout(title: string, intro: string, ctaLabel: string, url: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#111">
<h1 style="font-size:20px">${escapeHtml(title)}</h1>
<p>${escapeHtml(intro)}</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;border-radius:8px;text-decoration:none">${escapeHtml(ctaLabel)}</a></p>
<p style="font-size:13px;color:#555">Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :<br>${escapeHtml(url)}</p>
<p style="font-size:13px;color:#555">${escapeHtml(IGNORE_NOTICE)}</p>
<p style="font-size:12px;color:#777">Passness · Une question ? Écrivez-nous à ${SUPPORT_EMAIL}</p>
</div>`;
}

function plainText(title: string, intro: string, url: string): string {
  return `${title}\n\n${intro}\n\n${url}\n\n${IGNORE_NOTICE}\n\nPassness · ${SUPPORT_EMAIL}`;
}

export type AuthEmail = { to: string; subject: string; html: string; text: string; url: string };

export const authEmails = {
  verify: (to: string, url: string): AuthEmail => ({
    to,
    subject: 'Confirmez votre adresse e-mail Passness',
    url,
    html: layout(
      'Confirmez votre adresse e-mail',
      'Cliquez sur le bouton ci-dessous pour activer votre compte. Ce lien expire dans 1 heure.',
      'Confirmer mon adresse',
      url,
    ),
    text: plainText(
      'Confirmez votre adresse e-mail',
      'Ouvrez ce lien pour activer votre compte. Il expire dans 1 heure.',
      url,
    ),
  }),
  reset: (to: string, url: string): AuthEmail => ({
    to,
    subject: 'Réinitialisation de votre mot de passe Passness',
    url,
    html: layout(
      'Réinitialisez votre mot de passe',
      'Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien expire dans 1 heure.',
      'Choisir un nouveau mot de passe',
      url,
    ),
    text: plainText(
      'Réinitialisez votre mot de passe',
      'Ouvrez ce lien pour choisir un nouveau mot de passe. Il expire dans 1 heure.',
      url,
    ),
  }),
  existingAccount: (to: string, url: string): AuthEmail => ({
    to,
    subject: 'Tentative d’inscription avec votre adresse e-mail',
    url,
    html: layout(
      'Vous avez déjà un compte Passness',
      'Quelqu’un a tenté de créer un compte avec cette adresse. Si c’était vous, connectez-vous ou réinitialisez votre mot de passe.',
      'Réinitialiser mon mot de passe',
      url,
    ),
    text: plainText(
      'Vous avez déjà un compte Passness',
      'Quelqu’un a tenté de créer un compte avec cette adresse. Si c’était vous, connectez-vous ou réinitialisez votre mot de passe.',
      url,
    ),
  }),
};

/**
 * Envoi non bloquant : la durée de la réponse HTTP ne dépend pas de l'existence
 * du compte (anti-énumération par le temps de réponse). Aucune donnée
 * personnelle dans les logs d'erreur.
 */
export function sendAuthEmail(email: AuthEmail): void {
  const task = (async () => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      // Dev local : le lien (jeton à usage unique) est affiché, jamais l'adresse.
      if (process.env.NODE_ENV !== 'production')
        console.info('[auth-email] lien (dev) :', email.url);
      else console.warn('[auth-email] RESEND_API_KEY absente : e-mail non envoyé.');
      return;
    }
    const { error } = await new Resend(apiKey).emails.send({
      from: process.env.AUTH_EMAIL_FROM ?? DEFAULT_FROM,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    if (error) console.error('[auth-email] échec Resend', { name: error.name });
  })().catch(() => console.error('[auth-email] échec inattendu'));
  waitUntil(task);
}
