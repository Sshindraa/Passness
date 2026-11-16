import { describe, expect, it } from 'vitest';

import { assertLocalPreviewSeedEnvironment } from './seed-local-preview.mjs';

describe('seed preview local environment guard', () => {
  it('requires local development and the explicit preview marker', () => {
    expect(() =>
      assertLocalPreviewSeedEnvironment({
        NODE_ENV: 'development',
        PASSNESS_LOCAL_DEV: '1',
        PASSNESS_LOCAL_PREVIEW: '1',
      }),
    ).not.toThrow();
  });

  it('refuses missing, staging, and production markers', () => {
    expect(() =>
      assertLocalPreviewSeedEnvironment({ NODE_ENV: 'development', PASSNESS_LOCAL_DEV: '1' }),
    ).toThrow(/PASSNESS_LOCAL_PREVIEW=1/i);
    expect(() =>
      assertLocalPreviewSeedEnvironment({
        NODE_ENV: 'staging',
        PASSNESS_LOCAL_DEV: '1',
        PASSNESS_LOCAL_PREVIEW: '1',
      }),
    ).toThrow(/environnement de développement local/i);
    expect(() =>
      assertLocalPreviewSeedEnvironment({
        NODE_ENV: 'production',
        PASSNESS_LOCAL_DEV: '1',
        PASSNESS_LOCAL_PREVIEW: '1',
      }),
    ).toThrow(/environnement de développement local/i);
  });
});
