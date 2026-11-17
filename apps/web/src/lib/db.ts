import { createDatabase, type DatabaseClient } from '@passness/database';

let cached: DatabaseClient | null = null;

/**
 * Singleton du client base de données pour apps/web.
 * Évite de recréer un pool de connexions à chaque Server Action.
 */
export function getDb(): DatabaseClient {
  if (!cached) {
    // Chaque instance serverless Vercel a son pool : 3 connexions suffisent.
    cached = createDatabase(undefined, { max: 3 });
  }
  return cached;
}
