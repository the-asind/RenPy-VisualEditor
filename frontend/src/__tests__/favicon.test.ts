import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const frontendRoot = resolve(__dirname, '..', '..');

describe('site favicon', () => {
  it('uses the purple stylized y from the brand mark as the site favicon', () => {
    const html = readFileSync(resolve(frontendRoot, 'index.html'), 'utf8');
    const favicon = readFileSync(resolve(frontendRoot, 'public', 'favicon.svg'), 'utf8');

    expect(html).toContain('<title>renpy.online</title>');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(html).not.toContain('/vite.svg');

    expect(favicon).toContain('viewBox="0 0 64 64"');
    expect(favicon).toContain('#8B6AFD');
    expect(favicon).not.toContain('#000');
    expect(favicon).not.toContain('renpy.online');
  });
});
