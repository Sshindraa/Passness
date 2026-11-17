-- Migration 0064 : extension pg_stat_statements (diagnostic de performance).
-- Additive et sans donnée métier. Sur Neon, les statistiques sont perdues à chaque
-- redémarrage ou suspension du compute ; l'extension doit donc être présente dans
-- chaque environnement (staging, production) pour que `neon inspect` et les vues
-- pg_stat_statements restent exploitables. IF NOT EXISTS : rejeu idempotent.

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
