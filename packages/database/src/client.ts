import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

export type DatabaseClient = ReturnType<typeof createDatabase>;

/**
 * Transaction PostgreSQL active (Drizzle). Utilisé par les fonctions de domaine
 * qui doivent s'exécuter exclusivement à l'intérieur d'une transaction explicite
 * (ex : lockKey, completeKey, failKey du module idempotency).
 */
export type DatabaseTransaction = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

/**
 * Type d'exécuteur acceptant soit un client base de données, soit une
 * transaction PostgreSQL active. Utilisé par les fonctions de domaine
 * qui peuvent être appelées à l'intérieur d'une transaction (ex : garde-fou
 * "au moins un OWNER actif" protégé par un verrou advisory).
 */
export type DbExecutor =
  | DatabaseClient
  | PgTransaction<
      PostgresJsQueryResultHKT,
      typeof schema,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    >;

/**
 * Crée un client Drizzle sur PostgreSQL.
 *
 * L'URL est lue depuis DATABASE_URL. En local, utiliser docker-compose.yml
 * (PostgreSQL 16 + PostGIS). En staging/production, fournie par Neon.
 *
 * `max` borne le pool (défaut 10 : worker). Le web le réduit (ex. 3) car chaque
 * instance Vercel ouvre son propre pool. Neon : endpoint `-pooler` (PgBouncer
 * transaction mode) ; les prepared statements protocolaires sont supportés
 * (PgBouncer >= 1.22), donc `prepare` reste à sa valeur par défaut.
 * `idle_timeout` ferme les connexions inactives pour laisser le compute Neon
 * se mettre en veille ; `max_lifetime` recycle les connexions anciennes.
 */
export function createDatabase(
  databaseUrl: string = process.env.DATABASE_URL ?? '',
  options: { max?: number } = {},
) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to create a database client.');
  }
  const queryClient = postgres(databaseUrl, {
    max: options.max ?? 10,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
  });
  return drizzle(queryClient, { schema });
}
