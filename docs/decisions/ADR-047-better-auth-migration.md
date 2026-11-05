# ADR-047 — Migration de l'authentification de Clerk vers Better Auth

- **Statut** : accepté (code livré, bascule distante en attente de validation explicite)
- **Date** : 2026-11-05
- **Remplace** : [ADR-006](ADR-006-clerk-oidc.md) (le fournisseur ; ses règles non négociables sont conservées)

## Contexte

ADR-006 exigeait un ADR distinct pour toute migration du fournisseur d'identité. Le choix de Better Auth est
une décision produit (Passness est une marketplace : on veut les données d'identité dans notre base, un coût
indépendant du nombre d'utilisateurs actifs et la maîtrise des parcours). Honnêtement, **Clerk couvrait déjà
l'espace client et l'espace loueur** (inscription, vérification d'e-mail, MFA) : la migration n'est pas
justifiée par un besoin fonctionnel manquant. Le prix est que la sécurité, les e-mails d'authentification et
les incidents passent à la charge de Passness.

## Décision

Utiliser **Better Auth** (e-mail + mot de passe, vérification d'e-mail obligatoire, double authentification TOTP)
avec l'adaptateur Drizzle sur la base Neon existante.

## Règles conservées d'ADR-006

- Le fournisseur gère **uniquement l'identité** (authentification, sessions, vérification d'e-mail, 2FA).
- **Passness reste la source de vérité** pour `users`, `organizations`, `organization_memberships`, les rôles
  (`OWNER`, `ADMIN`, `MANAGER`, `STAFF`) et `is_platform_admin`. Aucun rôle ne transite par la session.
- À la première connexion, Passness crée ou réutilise un `users` : `oidc_subject` = `auth_users.id`,
  `oidc_provider = 'better-auth'`. Les comptes `counter` n'ont pas d'identité.

## Données

Tables ajoutées (migration additive `0063`) : `auth_users`, `auth_sessions`, `auth_accounts`,
`auth_verifications`, `auth_two_factors`, `auth_rate_limits`, et `users.legacy_clerk_id` (retour arrière).
Les secrets TOTP sont chiffrés par Better Auth avec `BETTER_AUTH_SECRET` (voir le runbook de rotation).

## Rattachement de comptes (changement par rapport à l'existant)

`provisionUserFromOidc` ne rattache **jamais** un `users` existant par e-mail seul : seul un compte invité
(jamais connecté : `oidc_provider` et `oidc_subject` nuls) est rattaché, et uniquement si l'e-mail est vérifié.
Les comptes `counter`, les comptes Clerk non migrés et les comptes déjà liés sont refusés
(`AccountLinkRefusedError`). Conséquence connue : un client servi au comptoir ne peut pas, tel quel, créer un
compte avec la même adresse ; un parcours de réclamation explicite reste à concevoir si le besoin apparaît.

## Sécurité (à la charge de Passness)

- Mot de passe ≥ 12 caractères, haché par scrypt (défaut Better Auth) ; mots de passe compromis refusés
  (Have I Been Pwned, activé en production).
- Vérification d'e-mail obligatoire avant toute session ; réinitialisation : jeton à usage unique de 1 h,
  toutes les sessions révoquées.
- Anti-faux comptes : Cloudflare Turnstile sur inscription, connexion et demande de réinitialisation
  (obligatoire en production : l'application refuse de démarrer sans `TURNSTILE_SECRET_KEY`).
- Limitation de débit en base (`auth_rate_limits`), règles strictes par chemin (connexion 5/min, inscription
  5/5 min, réinitialisation 3/5 min, 2FA 5/min). IP lue **uniquement** dans `x-vercel-forwarded-for`.
  Limite connue : la limitation est par IP, elle ne couvre pas un bourrage d'identifiants distribué ; Turnstile et
  le verrouillage 2FA (`failedVerificationCount`) en atténuent le risque.
- Anti-énumération : réponses identiques pour un compte existant ou non (inscription, réinitialisation,
  messages de connexion) ; envoi d'e-mail non bloquant (`waitUntil`) pour ne pas révéler le compte par le temps de réponse.
- 2FA **obligatoire** pour tout membre actif d'une organisation (y compris `STAFF`, qui voit les réservations
  et les clients) et pour les administrateurs plateforme, appliquée dans `getAuthenticatedUser` (fail-closed)
  et vérifiée par test d'architecture. Constante `TWO_FACTOR_REQUIRED_ROLES` pour assouplir (décision produit).
- Journalisation sans donnée personnelle : aucun e-mail, IP ni corps de requête dans les logs applicatifs.
- Les sessions stockent l'IP et le User-Agent (nécessaires à la détection d'abus) ; supprimés en cascade à
  l'effacement RGPD (`deleteAuthIdentity`).

## Bascule et retour arrière

Voir `docs/runbooks/auth-better-auth-cutover.md`. En résumé : aucune donnée Clerk n'est importée ; les
`users` Clerk sont reliés à une identité Better Auth sans mot de passe, et chacun définit son mot de passe par
« Mot de passe oublié » (puis réactive sa 2FA). Un import bcrypt des mots de passe n'est pas écrit : il ne se
justifie que si le comptage des comptes réels le demande.

## Conséquences

- Plus de dépendance SaaS d'identité ; sous-traitant Clerk retiré (mettre à jour DPO-005 et l'inventaire).
- Webhook `user.deleted` : jamais implémenté, désormais sans objet (suppression directe en base).
- `NEXT_PUBLIC_CLERK_*`, `CLERK_*` retirés ; nouvelles variables `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `AUTH_EMAIL_FROM`.
