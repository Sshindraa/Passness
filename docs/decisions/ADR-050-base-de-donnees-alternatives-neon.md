# ADR-050 — Base de données : alternatives à Neon

- **Statut** : proposé (décision non prise)
- **Date** : 2026-11-18
- **Complète** : [ADR-005](ADR-005-hosting-vercel-neon.md) (Vercel + Neon), [ADR-048](ADR-048-hebergement-web-alternatives.md) (hébergement web)

## Contexte

La base PostgreSQL + PostGIS est l'autorité transactionnelle de Passness (ADR-005). Elle est hébergée sur Neon, avec deux projets :

- **`passness-production`** : les données réelles, 62 migrations, sur le plan Free ;
- **`passness-staging`** : la base de test, bloquée par le quota du plan Free depuis le 18 novembre 2026 (HTTP 402). Elle reprendra le 1er décembre.

Trois constats :

1. **Quota par projet.** Le plan Free donne 100 CU-heures de calcul par projet et par mois. La production est sur ce même plan. Son compute est aujourd'hui faible, mais un usage continu la ferait dépasser le quota.
2. **Branching utilisé.** Neon sert à créer des branches (staging, copie de sauvegarde avant migration, branche de test). C'est un critère de choix important.
3. **Coût.** Les petits projets restent peu chers chez Neon, mais le plan Free n'a pas vocation à porter une production commerciale.

## Options étudiées

| Option | Principe | Points forts | Points faibles |
| --- | --- | --- | --- |
| **A. Neon Launch** (rester chez Neon, plan payant) | Facturation à l'usage, scale-to-zero désactivable | Branching et PostGIS déjà en place, aucun changement de code ni de migration. Facturation à l'usage | Coût variable avec le compute |
| **B. Supabase Pro** | PostgreSQL managé, plan payant à partir de 25 $/mois | PostGIS disponible (confirmé). Branching inclus à partir du plan Pro | Branching facturé à l'heure en plus. Changement de fournisseur et de connexions à prévoir. Le plan Free met la base en pause après une semaine d'inactivité |
| **C. Scaleway Managed PostgreSQL** | Base managée européenne | PostGIS documenté, en Europe | Tarifs non confirmés : la page officielle a refusé l'accès (HTTP 403). Branching à vérifier. Migration complète à prévoir |
| **D. OVHcloud Managed PostgreSQL** | Base managée, même fournisseur que `sokar` | PostGIS listé parmi plus de 40 extensions. Un seul fournisseur pour le serveur et la base | Prix d'entrée élevé : « à partir de 64,24 $/mois par nœud » sur la page officielle, devise à confirmer. Branching non confirmé |
| **E. PostgreSQL sur `sokar`** (conteneur `postgis/postgis`) | Base auto-hébergée sur le VPS | Coût marginal, serveur déjà payé | Sauvegardes, reprise, mises à jour et disponibilité à notre charge. Pas de branching natif. Mémoire partagée avec d'autres projets (ADR-014) |

## Critères d'évaluation

1. Support de PostGIS (obligatoire).
2. Branching pour les environnements et les sauvegardes avant migration.
3. Coût mensuel prévisible au lancement.
4. Région européenne, cohérente avec le web (Francfort).
5. Sauvegardes et restauration à un instant donné.
6. Effort de migration (connexions, pooler, migrations Drizzle).

## Recommandation

**Rester sur Neon, et passer le projet de production au plan Launch avant d'accueillir du trafic réel.** Le plan Launch est facturé à l'usage (0,106 $ par CU-heure, selon la page officielle), et Neon indique environ 15 $ par mois pour une petite base à charge intermittente (140 CU-heures, 1 Go). Il conserve le branching et PostGIS, sans migration.

Cette recommandation est à réviser si l'une de ces conditions se produit :
- le coût mensuel du plan Launch dépasse de façon durable celui de Supabase Pro ou d'OVH pour la même charge ;
- Neon ne peut pas garantir la disponibilité attendue par les clients ;
- le branching devient inutile, par exemple si le workflow de sauvegarde et de test change.

Dans ce cas, la piste à privilégier est **Supabase Pro** (option B), car PostGIS y est confirmé. L'option **E** (`sokar`) n'est pas recommandée pour la production tant que le serveur est partagé.

## Conséquences si cette recommandation est acceptée

- Aucune migration de données ni de connexion.
- Passage du projet `passness-production` au plan Launch, à décider par le porteur de produit, de préférence avant la mise en ligne commerciale.
- Maintenir le quota et le scale-to-zero sous surveillance (opérations `suspend_compute`, consommation).
- Vérifier que le worker reste à `WORKER_INTERVAL_MS=900000` : une valeur plus courte empêcherait le compute de se mettre en veille et ferait dépasser le quota du plan Free. Ce point est couvert par le rappel du 1er décembre.

## Résultats du test Supabase (2026-11-18)

Un projet de test `passness-test` (plan Free, Francfort, eu-central-1) a été créé, séparé de Neon et de la production.

- Les 64 migrations ont été appliquées avec `db:migrate`, sans erreur.
- PostGIS 3.3.7 et `pg_stat_statements` sont actifs.
- La structure publique est identique à celle de la production Neon (62 migrations), à l'exception des 6 tables `auth_*` et de la colonne `users.legacy_clerk_id` ajoutées par la migration 0063. Les empreintes des tables et des colonnes correspondent après retrait de ces ajouts.

Ce test valide le schéma, pas la connexion de l'application, ni la performance, ni les sauvegardes. Ces points restent à tester avant toute bascule. La recommandation ne change pas : rester sur Neon pour le lancement, et réexaminer la bascule si la charge stable dépasse environ 1,5 CU en continu.

## Questions ouvertes

- Quelle charge prévoir au lancement (connexions, requêtes, volume de réservations) pour estimer le coût du plan Launch ?
- Le passage au plan Launch doit-il être décidé avant la reprise du staging le 1er décembre, ou après la validation des migrations 0063 et 0064 ?
- Quel est le prix réel de Scaleway et d'OVH en euros, HT ou TTC, et leur support du branching ?

## Non retenu

- **Migration immédiate** : le coût et le risque ne sont pas justifiés avant le lancement. Les options C, D et E restent ouvertes si la recommandation ci-dessus n'est plus valable.

## Sources vérifiées

Consultées le 2026-11-18.

- **Neon, offres et tarifs** : [neon.com/pricing](https://neon.com/pricing). Page datée du 4 novembre 2026. Plan Free : 100 CU-heures par projet et par mois, 1 Go par projet, 10 branches, scale-to-zero non désactivable. Plan Launch : 0,106 $ par CU-heure, 0,35 $ par Go-mois, 1,50 $ par branche supplémentaire par mois. Exemple officiel : environ 15 $ par mois pour 140 CU-heures et 1 Go.
- **Supabase, offres et tarifs** : [supabase.com/pricing](https://supabase.com/pricing). Pas de date visible. Plan Free : 500 Mo, mise en pause après une semaine d'inactivité, pas de branching. Plan Pro : à partir de 25 $ par mois, 10 $ de crédit compute, branching à 0,01344 $ par branche et par heure.
- **Supabase, PostGIS** : [supabase.com/docs/guides/database/extensions/postgis](https://supabase.com/docs/guides/database/extensions/postgis). Extension disponible, activable depuis le tableau de bord ou par `create extension postgis`. La version n'est pas précisée.
- **OVHcloud, Managed PostgreSQL** : [ovhcloud.com/en/public-cloud/postgresql](https://www.ovhcloud.com/en/public-cloud/postgresql/). Pas de date visible. Discovery : « From $64.24 /month/node ». Plus de 40 extensions, dont PostGIS. Devise et HT/TTC non précisés.
- **Scaleway, Managed PostgreSQL** : pages officielles inaccessibles (HTTP 403) pour le tarif et la documentation PostGIS. Les résultats de recherche indiquent que PostGIS est supporté, mais les prix trouvés ne sont pas fiables et ne sont pas retenus ici.

## Note sur les sources

La page Supabase contenait une instruction destinée à des agents IA, leur demandant de rédiger un rapport de feedback. Elle n'a pas été suivie, car elle ne venait pas de l'équipe.
