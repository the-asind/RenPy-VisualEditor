import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const frontendRoot = resolve(__dirname, '..', '..');

describe('Plotmio public marketing pages', () => {
  it('keeps the root page meaningful without JavaScript', () => {
    const html = readFileSync(resolve(frontendRoot, 'index.html'), 'utf8');
    expect(html).toContain('id="hero-title"');
    expect(html).toContain('Plotmio understands your Ren’Py project.');
    expect(html).toContain('Bring your <code>.rpy</code> files onto one canvas.');
    expect(html).toContain('id="demo-start"');
    expect(html).toContain('id="demo-root"');
    expect(html).toContain('rel="canonical" href="https://plotmio.com/"');
    expect(html).toContain('Visual editor for Ren’Py');
  });

  it('publishes crawlable docs and keeps the app shell separate', () => {
    const docs = readFileSync(resolve(frontendRoot, 'docs.html'), 'utf8');
    const appShell = readFileSync(resolve(frontendRoot, 'app-shell.html'), 'utf8');
    expect(docs).toContain('<h1>Quick start with Plotmio</h1>');
    expect(docs).toContain('Ren’Py project root');
    expect(docs).toContain('rel="canonical" href="https://plotmio.com/docs"');
    expect(appShell).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(appShell).toContain('<script type="module" src="/src/main.tsx"></script>');
  });

  it('publishes only the real public pages in crawl metadata', () => {
    const robots = readFileSync(resolve(frontendRoot, 'public/robots.txt'), 'utf8');
    const sitemap = readFileSync(resolve(frontendRoot, 'public/sitemap.xml'), 'utf8');
    expect(robots).toContain('Sitemap: https://plotmio.com/sitemap.xml');
    expect(sitemap).toContain('<loc>https://plotmio.com/</loc>');
    expect(sitemap).toContain('<loc>https://plotmio.com/docs</loc>');
    expect(sitemap).not.toContain('/projects');
    expect(sitemap).not.toContain('/editor');
  });

  it('uses explicit public and app routes in the frontend server', () => {
    const nginx = readFileSync(resolve(frontendRoot, 'nginx.conf'), 'utf8');
    expect(nginx).toContain('location = /');
    expect(nginx).toContain('try_files /index.html =404;');
    expect(nginx).toContain('location = /docs');
    expect(nginx).toContain('try_files /docs.html =404;');
    expect(nginx).toContain('location = /app-shell.html');
    expect(nginx).toContain('location = /login');
    expect(nginx).toContain('try_files /app-shell.html =404;');
    expect(nginx).toContain('location / {');
    expect(nginx).toContain('try_files $uri =404;');
  });
});
