import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const frontendRoot = resolve(__dirname, '..', '..');

describe('Plotmio brand assets', () => {
  it('uses the selected story-dot m as the site favicon', () => {
    const html = readFileSync(resolve(frontendRoot, 'index.html'), 'utf8');
    const favicon = readFileSync(resolve(frontendRoot, 'public', 'favicon.svg'), 'utf8');

    expect(html).toContain('<title>Plotmio — Visual Editor for Ren’Py Projects</title>');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(html).not.toContain('/vite.svg');

    expect(favicon).toContain('viewBox="0 0 64 64"');
    expect(favicon).toContain('#8B6AFD');
    expect(favicon).not.toContain('#000');
    expect(favicon).toContain('Plotmio story dot m mark');
    expect(favicon).toContain('cx="32" cy="51"');
  });
});
