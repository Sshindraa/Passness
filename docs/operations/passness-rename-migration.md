# Renommage Uttily → Passness : état au 16 novembre 2026

## Déjà basculé

- Le code visible, les paquets (`@passness/*`), les textes, les emails, les images et les noms de fichiers utilisent Passness.
- Le dépôt GitHub et le dossier local sont renommés en Passness; `origin` pointe sur `Sshindraa/Passness`.
- Les bases PostgreSQL temporaires de GitHub Actions utilisent maintenant des identifiants Passness; elles sont recréées à chaque workflow et ne partagent aucun volume local ou de production.
- Le projet Vercel staging est `passness-staging`. L'alias vérifié `passness-staging.vercel.app` est attaché à la branche `staging` et sert la version Passness. L'ancien alias Vercel reste attaché pour préserver les consommateurs existants.
- Le code Wrangler porte le nom `passness-staging-cron` et cible `https://passness-staging.vercel.app`. Le Worker Cloudflare n'a pas été redéployé ni vérifié après ce changement.

## Identifiants conservés volontairement

| Référence | Pourquoi elle reste | Étape avant retrait |
| --- | --- | --- |
| `uttily:uttily`, base `uttily`, volume `uttily-postgres-data` et URLs locales | Ils correspondent à la base et au volume locaux existants. Changer ces valeurs sans migration peut laisser le volume inaccessible. | Sauvegarder, recréer ou migrer la base, puis mettre à jour les `.env` locaux. |
| `uttily-checksum-sha256`, `uttily-size-bytes` | Des objets R2 existants portent ces métadonnées. Le code écrit les clés Passness et les anciennes clés, et lit les deux formats. | Recenser et réécrire les objets; retirer les anciennes clés après la période de compatibilité. |
| `uttily_export_version` | C'est le champ v1 déjà consommé par des téléchargements/clients existants. L'export émet maintenant les champs Passness et Uttily. | Confirmer la migration des consommateurs avant de retirer l'alias v1. |
| `anonymized.uttily.local` | Des adresses de suppression sont déjà persistées dans PostgreSQL. | Revoir et migrer ces lignes avant de changer la génération. |
| Noms des buckets R2 `uttily-*` | Ce sont des ressources Cloudflare existantes, pas des alias de marque. | Créer les buckets Passness, copier et contrôler les objets, basculer la configuration puis conserver l'ancien bucket durant la rétention prévue. |
| `uttily-worker-staging`, `/opt/uttily`, `systemd/uttily-worker.service` et l'ancien Worker Cloudflare | Ces noms désignent des ressources déjà déployées sur le VPS/Cloudflare. Leur état actuel n'a pas pu être confirmé. | Vérifier l'hôte et Cloudflare, déployer la nouvelle configuration, contrôler la santé, puis retirer l'ancienne ressource dans une fenêtre de maintenance. |
| Compte Clerk `uttily-staging-e2e+clerk_test@…`, `uttily-demo-rental`, `Uttily Demo Rental` | Ce sont des identifiants de test externes potentiellement utilisés dans Clerk et la base staging. | Renommer les objets dans Clerk et PostgreSQL avant d'actualiser les fixtures et la documentation. |
| Commentaires dans `drizzle/0002`, `0004`, `0008`, `0010` | Ils font partie de migrations déjà appliquées; les réécrire altérerait l'historique du schéma. | Les conserver comme provenance historique. |
| Anciennes URLs et noms dans les comptes-rendus de déploiement | Ils décrivent l'état réel au moment des tests. | Les conserver dans les comptes-rendus historiques; mettre à jour les runbooks actifs séparément. |
| Slug d'équipe Vercel `uttily` et métadonnées des anciens déploiements | Le renommage du projet n'a pas renommé l'équipe ni les enregistrements historiques. | Le slug d'équipe nécessite une action distincte dans les réglages Vercel; les métadonnées de déploiement restent historiques. |

## Production et opérations restantes

- `passness.com` répond, mais affiche encore le titre Uttily : son alias sert un déploiement de `main` au commit `bb94735`.
- La PR [`staging → main` #86](https://github.com/Sshindraa/Passness/pull/86) inclut aussi le chantier de réservation et ses contrôles database/core/web sont en échec. Elle n'a pas été fusionnée ni promue en production. Le Worker staging n'a pas été redéployé, car Wrangler/Cloudflare ne sont pas disponibles dans cet environnement.
- La PR de rebranding isolée [#90](https://github.com/Sshindraa/Passness/pull/90) est ouverte en brouillon sur `main`. Sa preview Vercel affiche Passness, mais les jobs GitHub Actions n'ont pas démarré : GitHub bloque les runners sur un problème de facturation ou de limite de dépenses. Résoudre ce blocage puis relancer la CI avant fusion.
- Vérifier les domaines d'envoi Resend, les redirections DNS de `uttily.com`, l'endpoint webhook Stripe et l'état du Worker avant de basculer ces services. Ces fournisseurs n'ont pas été modifiés ici.
- Le checkout local comporte des changements non committés; ne pas le réinitialiser ni le pousser en bloc. La PR #90 porte le rebranding isolé; attendre des contrôles CI verts et vérifier les migrations externes avant la bascule du site public.
