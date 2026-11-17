# Runbook — bascule Clerk → Better Auth, retour arrière, rotation, incident (ADR-047)

Aucune étape distante ne s'exécute sans validation explicite de Hamza. Les sorties des scripts ne contiennent
que des compteurs.

## 0. Comptage (décide s'il faut plus que « mot de passe oublié »)

```bash
psql "$DATABASE_DIRECT_URL" -c "SELECT oidc_provider, count(*) FILTER (WHERE deleted_at IS NULL) AS actifs, count(*) AS total FROM users GROUP BY 1"
```

Staging puis production. Dans le dashboard Clerk, noter aussi combien de comptes se connectent par Google/Apple
(s'il y en a, le signaler : seul e-mail + mot de passe est proposé). Si le nombre de vrais comptes est faible,
le script ci-dessous suffit ; sinon étudier un import des mots de passe bcrypt (non écrit).

## 1. Avant la bascule

1. Déployer le code Better Auth **et** appliquer la migration `0063` (additive) : staging d'abord.
2. Variables Vercel : `BETTER_AUTH_SECRET` (`openssl rand -base64 32`, distinct par environnement),
   `BETTER_AUTH_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`
   (domaine `passness.com` vérifié, `noreply@passness.com`).
3. **Export juste avant la bascule** : `pg_dump` de `users` (et tables liées) + export CSV Clerk. Ces fichiers ne
   vont **jamais** dans le dépôt ni dans un chat, restent chiffrés hors dépôt et sont supprimés après la fenêtre de retour arrière.
4. Simulation : `pnpm --filter @passness/database db:migrate-clerk-accounts` (sans `--apply` : aucune écriture ; `DATABASE_DIRECT_URL` pointe vers l'environnement visé).

## 2. Bascule

`CONFIRM_REMOTE_MIGRATION=<hôte> DATABASE_DIRECT_URL=… pnpm --filter @passness/database db:migrate-clerk-accounts -- --apply`

- Rapprochement par `users.oidc_subject` (provider `clerk`) uniquement, jamais par e-mail.
- Jamais touchés : comptes `counter`, comptes effacés (RGPD), comptes sans e-mail vérifié.
- Idempotent. Les utilisateurs reçoivent une communication : « Mot de passe oublié » pour définir leur mot de
  passe ; loueurs et administrateurs doivent réactiver leur 2FA (secrets TOTP non repris).

## 3. Retour arrière

`… db:migrate-clerk-accounts -- --rollback --apply` (puis redéployer le commit Clerk) :
restaure `oidc_subject` Clerk depuis `legacy_clerk_id`. **Comptes créés après la bascule** (sans `legacy_clerk_id`) :
détachés (`oidc_subject`/`oidc_provider` nuls, comme des comptes invités) et listés en compteur ; ils se
rattachent par e-mail vérifié à leur première inscription côté Clerk. Les réservations restent intactes
(`users.id` ne change jamais).

## 4. Rotation de `BETTER_AUTH_SECRET`

Le secret chiffre les secrets TOTP et signe les cookies. **Ne jamais le remplacer directement** : tous les
2FA seraient cassés. Procédure (**non éprouvée : à rejouer d'abord en staging avec un compte 2FA, le code actuel n'utilise que `secret`**) : ajouter la nouvelle valeur en tête de l'option `secrets`
(`[{ version: 2, value: nouveau }, { version: 1, value: ancien }]`), déployer, laisser l'ancien en lecture
jusqu'à la réécriture des secrets, puis seulement le retirer. Les sessions existantes peuvent être invalidées.

## 5. Incident (compte compromis, fuite)

Révocation globale : `DELETE FROM auth_sessions;` (tous les utilisateurs se reconnectent) ; ciblée :
`DELETE FROM auth_sessions WHERE user_id = '<auth_users.id>'`. Forcer un reset : supprimer la ligne
`auth_accounts` credential de l'utilisateur. Journaliser l'incident avec l'identifiant interne, jamais l'e-mail.

## 6. Résiliation de Clerk (après validation)

Supprimer les données chez Clerk (demande de suppression de l'instance/des utilisateurs), résilier,
mettre à jour `DPO-005` et `subprocessors-inventory.md`, supprimer `legacy_clerk_id` après la fenêtre de retour arrière.
