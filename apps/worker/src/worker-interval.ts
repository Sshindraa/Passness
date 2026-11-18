/**
 * Intervalle entre deux cycles du worker, lu depuis `WORKER_INTERVAL_MS` (ms).
 * Partagé entre le worker production (`index.ts`, défaut 1 s) et le worker
 * local (`local-dev.ts`, défaut 5 s) : une seule règle de validation.
 */

/** Limite de setTimeout (2^31 - 1 ms) ; au-delà, Node déclenche le timer immédiatement. */
export const MAX_WORKER_INTERVAL_MS = 2_147_483_647;

export class WorkerIntervalConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkerIntervalConfigurationError';
  }
}

/**
 * Retourne `WORKER_INTERVAL_MS` validée, ou `defaultIntervalMs` si la variable est absente.
 * Lève WorkerIntervalConfigurationError si la valeur n'est pas un entier 1..MAX.
 */
export function resolveWorkerIntervalMs(
  environment: NodeJS.ProcessEnv,
  defaultIntervalMs: number,
): number {
  const rawInterval = environment.WORKER_INTERVAL_MS;
  if (rawInterval === undefined) return defaultIntervalMs;

  const intervalMs = Number(rawInterval);
  if (!Number.isInteger(intervalMs) || intervalMs <= 0 || intervalMs > MAX_WORKER_INTERVAL_MS) {
    throw new WorkerIntervalConfigurationError(
      `WORKER_INTERVAL_MS doit être un entier fini strictement positif inférieur ou égal à ${MAX_WORKER_INTERVAL_MS}.`,
    );
  }
  return intervalMs;
}
