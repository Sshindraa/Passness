import { describe, it, expect } from 'vitest';
import {
  MAX_WORKER_INTERVAL_MS,
  WorkerIntervalConfigurationError,
  resolveWorkerIntervalMs,
} from './worker-interval.js';

const PROD_DEFAULT_MS = 1000;
const LOCAL_DEFAULT_MS = 5000;

describe('resolveWorkerIntervalMs (WORKER_INTERVAL_MS)', () => {
  it('absente : retourne le défaut fourni (1 s prod, 5 s local)', () => {
    expect(resolveWorkerIntervalMs({}, PROD_DEFAULT_MS)).toBe(1000);
    expect(resolveWorkerIntervalMs({}, LOCAL_DEFAULT_MS)).toBe(5000);
  });

  it('valide : accepte un entier positif, par exemple 60 000 ms pour le staging', () => {
    expect(resolveWorkerIntervalMs({ WORKER_INTERVAL_MS: '60000' }, PROD_DEFAULT_MS)).toBe(60_000);
    expect(resolveWorkerIntervalMs({ WORKER_INTERVAL_MS: '1250' }, LOCAL_DEFAULT_MS)).toBe(1250);
  });

  it('valide : accepte la borne maximale de setTimeout', () => {
    expect(
      resolveWorkerIntervalMs(
        { WORKER_INTERVAL_MS: String(MAX_WORKER_INTERVAL_MS) },
        PROD_DEFAULT_MS,
      ),
    ).toBe(MAX_WORKER_INTERVAL_MS);
  });

  it.each([
    ['zéro', '0'],
    ['négative', '-5'],
    ['vide', ''],
    ['non entière', '1.5'],
    ['non numérique', 'abc'],
    ['NaN', 'NaN'],
    ['Infinity', 'Infinity'],
    ['au-dessus de la borne', String(MAX_WORKER_INTERVAL_MS + 1)],
  ])('invalide (%s) : lève WorkerIntervalConfigurationError', (_description, raw) => {
    expect(() => resolveWorkerIntervalMs({ WORKER_INTERVAL_MS: raw }, PROD_DEFAULT_MS)).toThrow(
      WorkerIntervalConfigurationError,
    );
    expect(() => resolveWorkerIntervalMs({ WORKER_INTERVAL_MS: raw }, PROD_DEFAULT_MS)).toThrow(
      /WORKER_INTERVAL_MS/,
    );
  });
});
