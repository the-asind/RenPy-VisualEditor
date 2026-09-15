import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';


describe('production build contract', () => {
  it('removes browser-only E2E harness pages from the published dist', () => {
    const viteConfig = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf-8');
    const bundleGate = readFileSync(new URL('../../scripts/check-mvp-bundle.mjs', import.meta.url), 'utf-8');

    expect(viteConfig).toContain('removeE2ePublicHarness');
    expect(viteConfig).toContain("rmSync(new URL('./dist/e2e', import.meta.url)");
    expect(bundleGate).toContain("existsSync(resolve(distDir, 'e2e'))");
  });
});
