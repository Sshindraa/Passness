# ADR-048 — Hébergement de l'application web : alternatives à Vercel

- **Statut** : proposé (décision non prise)
- **Date** : 2026-11-18
- **Complète** : [ADR-005](ADR-005-hosting-vercel-neon.md) (Vercel + Neon), [ADR-014](ADR-014-production-providers-and-worker-deployment.md) (worker sur VPS)

## Contexte

L'application web (Next.js full-stack, ADR-001) est hébergée sur Vercel depuis l'ADR-005. Vercel exécute le site, l'espace loueur et l'API, et crée une URL de test par branche. Le worker de traitement différé tourne sur le VPS OVH `sokar` (ADR-014). Le déclenchement planifié passe par un Worker Cloudflare (`passness-staging-cron`) qui appelle les routes cron de Vercel toutes les 15 minutes.

Trois constats motivent cette réflexion :

1. **Plan Hobby.** Le projet Vercel est sur le plan Hobby. Les conditions d'utilisation de Vercel (section 4, « Hobby Plan ») précisent : « You shall only use the Services under a Hobby plan for your personal or non-commercial use. » Avant un lancement commercial, il faudra donc passer au plan Pro, ou changer d'hébergeur. (Source : voir « Sources vérifiées ».)
2. **Crons.** L'ADR-009 suppose un plan Pro pour une exécution toutes les minutes ; le plan Hobby ne permet qu'une exécution quotidienne. Le déclencheur Cloudflare contourne cette limite pour les routes actuelles, mais cela renforce la dépendance entre deux fournisseurs.
3. **Coût et exploitation.** Le VPS `sokar` est déjà payé, mais il est partagé avec d'autres projets. Un hébergement de l'application web dessus transférerait à l'équipe la sécurité, les sauvegardes et la disponibilité.

Le problème récent (quota gratuit de Neon dépassé) n'est pas dû à Vercel. Il est traité par la correction de l'intervalle du worker staging.

## Options étudiées

| Option | Principe | Points forts | Points faibles |
| --- | --- | --- | --- |
| **A. Rester sur Vercel (plan Pro)** | Statu quo, passage au plan payant | Aucune migration. Intégration Next.js native, previews par branche, crons | 20 $/mois par siège « Developer » (sièges Viewer gratuits). 20 $ de crédit d'usage inclus, puis facturation à la consommation |
| **B. Cloudflare (Workers avec OpenNext)** | Next.js exécuté sur le réseau Cloudflare | Déjà utilisé (R2, Turnstile, cron). Coût faible. Bonne présence en Europe | Compatibilité Next.js partielle selon les fonctionnalités. Connexion à Neon à valider (pilote HTTP). Adaptateur à maintenir |
| **C. Netlify** | Équivalent de Vercel, runtime Next.js | Previews par branche, plan gratuit | Même logique de plan payant pour un usage commercial. Migration complète à prévoir |
| **D. Render (service Node)** | Processus Node persistant, Docker possible, région Francfort | Pas de contrainte serverless. Tâches planifiées natives. Modèle prévisible | Moins de previews automatiques. Facturation à l'instance. Tarifs non confirmés (voir « Sources vérifiées ») |
| **E. Fly.io** | Conteneurs dans plusieurs régions, dont Francfort | Contrôle fin, Docker natif | Plus d'exploitation à assurer |
| **F. `sokar` (Docker ou Coolify)** | Next.js en conteneur derrière un reverse proxy | Coût marginal, tout au même endroit | Sécurité, sauvegardes et disponibilité à la charge de l'équipe. Mémoire partagée avec d'autres projets (ADR-014). Pas de previews automatiques |

## Critères d'évaluation

1. Compatibilité avec Next.js (App Router, Route Handlers, runtime Node).
2. Effort de migration (crons, variables d'environnement, déploiement, tests).
3. Coût mensuel prévisible à l'échelle du lancement.
4. Région européenne, cohérente avec Neon (Francfort).
5. Effort d'exploitation pour une petite équipe.
6. Previews par branche, utiles pour la validation avant fusion.

## Recommandation

**Garder Vercel pour le lancement, et passer au plan Pro avant toute vente réelle.** Le plan Hobby n'est pas autorisé pour un usage commercial : la vente de locations impose donc le plan Pro, soit 20 $ par mois pour le développeur. Une migration coûterait davantage en travail et en risque, pour un gain qui n'est pas démontré à ce stade.

Ce choix est à réviser si l'une de ces conditions se produit :
- le coût mensuel du plan Pro dépasse de façon durable le coût d'un service équivalent sur Render ;
- Vercel impose une limite de ressources qui bloque une fonctionnalité du produit ;
- une exigence de conformité impose un hébergement hors de l'écosystème Vercel.

Dans ce cas, la piste à privilégier est **Render** (option D) : il se rapproche le plus de l'usage actuel. L'option **F** (`sokar`) est à écarter pour l'application web, tant que le serveur est partagé.

## Conséquences si cette recommandation est acceptée

- Aucune modification technique immédiate.
- Passage au plan Pro de Vercel avant le lancement commercial, à décider par le porteur de produit.
- Maintenir le déclencheur Cloudflare pour les crons tant qu'il est nécessaire.
- Revoir cet ADR au premier signe de dépassement de l'une des conditions ci-dessus, ou au plus tard avant la mise en vente.

## Questions ouvertes

- Quel volume de trafic prévoir au lancement, pour estimer les dépassements au-delà des 20 $ de crédit inclus du plan Pro ?
- Le passage au plan Pro doit-il être décidé avant la fin de la validation du staging (1er décembre) ou après ?

## Non retenu

- **Supabase** : déjà écarté par l'ADR-005.
- **Migration immédiate** : le coût et le risque ne sont pas justifiés avant le lancement.

## Sources vérifiées

Consultées le 2026-11-18.

- **Vercel, plan Pro : 20 $/mois, avec 20 $ de crédit inclus** : [vercel.com/pricing](https://vercel.com/pricing). Page sans date de mise à jour visible.
- **Vercel, siège « Developer » : 20 $ par utilisateur et par mois, sièges Viewer gratuits** : [vercel.com/docs/plans/hobby](https://vercel.com/docs/plans/hobby), section « Upgrading to Pro ». Dernière mise à jour de la page : 2026-11-12.
- **Vercel, usage non commercial du plan Hobby** : [vercel.com/legal/terms](https://vercel.com/legal/terms), section 4 « Hobby Plan ». Dernière mise à jour de la page : 19 octobre 2026. La page du plan Hobby elle-même ne contient pas cette clause.
- **Render : tarifs non confirmés.** La page officielle [render.com/pricing](https://render.com/pricing) et la documentation des plans de calcul ([render.com/docs/compute-plans](https://render.com/docs/compute-plans)) ne se lisent pas dans mes outils : les grilles tarifaires y sont chargées dynamiquement. Un article de Render, non daté, indique Starter à 7 $/mois et Standard à 25 $/mois, à titre indicatif seulement. Ces chiffres sont à confirmer dans le tableau de bord de Render, en sélectionnant la région Francfort, avant toute décision.
