import { describe, it, expect, vi, beforeEach } from 'vitest';

const { postgresMock, drizzleMock } = vi.hoisted(() => ({
  postgresMock: vi.fn(() => ({})),
  drizzleMock: vi.fn(() => ({})),
}));

vi.mock('postgres', () => ({ default: postgresMock }));
vi.mock('drizzle-orm/postgres-js', () => ({ drizzle: drizzleMock }));

import { createDatabase } from './client';

const URL = 'postgresql://u:p@ep-xxx-pooler.region.aws.neon.tech/db?sslmode=require';

describe('createDatabase', () => {
  beforeEach(() => {
    postgresMock.mockClear();
    drizzleMock.mockClear();
  });

  it('applique les timeouts Neon et max=10 par défaut (worker)', () => {
    createDatabase(URL);
    expect(postgresMock).toHaveBeenCalledWith(URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      max_lifetime: 1800,
    });
  });

  it('accepte un max plus bas (web) sans changer les autres options', () => {
    createDatabase(URL, { max: 3 });
    expect(postgresMock).toHaveBeenCalledWith(URL, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      max_lifetime: 1800,
    });
  });

  it('lève une erreur si aucune URL n est fournie', () => {
    expect(() => createDatabase('')).toThrow('DATABASE_URL is required');
    expect(postgresMock).not.toHaveBeenCalled();
  });
});
