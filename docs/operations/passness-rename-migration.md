# Migration Uttily → Passness : ce qui reste hors du dépôt

Le code, les noms de paquets (`@passness/*`), les variables de dev/test (`PASSNESS_*`), les textes
visibles, la documentation, les images et fichiers sont renommés. Les identifiants ci-dessous
gardent volontairement `uttily` : ils désignent des ressources externes ou des données déjà
persistées. Les renommer dans le code sans migrer la ressource casserait staging ou la production.

## Exceptions conservées dans le dépôt

| Identifiant conservé | Où | Pourquoi | Condition pour renommer |
| --- | --- | --- | --- |
| `https://uttily.com`, `app.uttily.com`, `app.uttily.fr` (URLs du site) | e-mails, tests, `email-brand.ts`, docs | URL publique de l'application ; `passness.com` n'héberge pas encore le site (parking IONOS) | application déployée et servie sur `passness.com`, redirections depuis `uttily.com` |
| `uttily-staging.vercel.app`, projet Vercel `uttily-staging` | `wrangler.toml`, docs | URL et projet Vercel réels | projet Vercel renommé, puis cible du cron mise à jour |
| `uttily-staging-cron`, `uttily_staging_cron_*` | `wrangler.toml`, User-Agent, logs | Worker Cloudflare déployé ; alertes éventuelles sur ces événements | nouveau Worker déployé, ancien supprimé |
| `uttily-worker-staging`, `uttily-worker:staging-*`, `/opt/uttily`, `systemd/uttily-worker.service` | docs | conteneur, image et chemins du VPS partagé | validation explicite, fenêtre de maintenance |
| `uttily-(staging\|production)-(photos\|documents)` | docs, test de readiness | buckets R2 (non renommables) | nouveau bucket + copie des objets + bascule |
| `uttily-checksum-sha256`, `uttily-size-bytes` | `r2-object-storage.ts`, `product-photo-storage.ts` | métadonnées des objets R2 existants | lecture des deux clés, réécriture, puis retrait de l'ancienne |
| `uttily_export_version` | export RGPD (`route.ts`, `types.ts`) | champ de contrat consommé hors du dépôt | ajout additif de `passness_export_version`, puis retrait |
| `anonymized.uttily.local` | `erase-user-account.ts` | e-mails d'effacement déjà écrits en base | migration SQL des lignes `erased-*`, après revue |
| `uttily:uttily`, base `uttily`, volume `uttily-postgres-data` | `docker-compose.yml`, `.env.example`, CI, scripts | rôle, base et volume Postgres locaux ; renommer perd les données locales | dump local, recréation, mise à jour des `.env` des développeurs |
| `uttily-staging-e2e+clerk_test@…`, `uttily-demo-rental`, « Uttily Demo Rental » | docs | utilisateur Clerk de test et organisation de démo en staging | renommer dans Clerk et en base, puis mettre à jour les docs |
| `Sshindraa/Uttily`, `/Users/hamza/Projects/Uttily` | liens docs | dépôt GitHub et dossier local | renommer le dépôt (GitHub redirige), puis le dossier |
| commentaires de `drizzle/0002,0004,0008,0010_*.sql` | migrations | migrations appliquées, on ne les modifie pas | jamais |

## Ordre recommandé hors dépôt

1. Domaine : adresses `@passness.com` faites (Cloudflare Email Routing, PR de remplacement dans le
   code). Reste le site : DNS web `passness.com`, redirections depuis `uttily.com`, puis remplacement
   des URLs dans le code.
2. Stripe : mettre à jour l'URL du webhook plateforme (`…/api/webhooks/stripe/platform`) avant de
   changer de domaine public, puis vérifier la signature en staging.
3. Vercel : renommer le projet staging, ajuster `CRON_TARGET_URL`, redéployer le Worker cron.
4. Cloudflare : déployer `passness-staging-cron`, supprimer l'ancien Worker.
5. R2 : créer les buckets `passness-*`, copier les objets, ajouter la lecture des deux clés de
   métadonnées, basculer, supprimer les anciens buckets après période de retenue.
6. VPS staging : recréer `passness-worker-staging` avec `docker run` (mêmes options :
   `--init --read-only --cap-drop ALL --security-opt no-new-privileges:true`, 512 Mo, 1 CPU, tmpfs
   `/tmp`), nouveau tag d'image, puis déplacer `/home/deploy/uttily-staging-worker`. Ne rien faire
   sur la production ni sur les ressources Suppernote du même hôte sans validation.
7. Base : migrer les e-mails `anonymized.uttily.local`, puis ajouter `passness_export_version`.
8. Clerk/GitHub/local : utilisateur de test, organisation de démo, dépôt GitHub, dossier local, base
   Postgres locale.
