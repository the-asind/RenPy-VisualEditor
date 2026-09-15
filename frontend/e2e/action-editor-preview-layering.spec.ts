import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

let viteServer: ViteDevServer | null = null;
let e2eBaseUrl = 'http://127.0.0.1:5178';

test.beforeAll(async () => {
  viteServer = await createServer({
    server: {
      host: '127.0.0.1',
      port: 5178,
      strictPort: false,
    },
  });
  await viteServer.listen();
  e2eBaseUrl = viteServer.resolvedUrls?.local[0] ?? e2eBaseUrl;
});

test.afterAll(async () => {
  await viteServer?.close();
  viteServer = null;
});

test('action editor preview renders shown sprite above the resolved background image', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-preview-layering.html'));

  const preview = page.locator('.action-editor-sidebar__preview');
  await expect(page.getByRole('dialog', { name: 'Action editor' }), runtimeErrors.join('\n')).toBeVisible();
  await expect(preview.locator('[data-asset-path="backgrounds/entrance.png"]')).toBeVisible();

  const david = preview.locator('[data-asset-path="images/david/angry.webp"] img');
  const adam = preview.locator('[data-asset-path="images/adam/neutral.webp"] img');
  const sasha = preview.locator('[data-asset-path="images/sasha/neutral.webp"] img');
  await expect(david).toBeVisible();
  await expect(adam).toBeVisible();
  await expect(sasha).toBeVisible();
  await expect(preview.getByText('expression RainAnimation')).toHaveCount(0);
  await expect(preview.getByText('layer master')).toHaveCount(0);
  await expect(preview.getByText('david sad')).toHaveCount(0);
  await expect(preview.locator('[data-preview-placement="left"] small')).toHaveText('at left');
  await expect(preview.locator('[data-preview-placement="right"] small')).toHaveText('at right with dissolve');
  await expect(preview.locator('[data-preview-placement="truecenter"] small')).toHaveText('at truecenter');

  await expect(async () => {
    const topElementDescription = await david.evaluate((image) => {
      const rect = image.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const topElement = document.elementFromPoint(x, y);
      return {
        alt: topElement instanceof HTMLImageElement ? topElement.alt : null,
        assetPath: topElement?.closest('[data-asset-path]')?.getAttribute('data-asset-path') ?? null,
        className: topElement instanceof HTMLElement ? topElement.className : null,
      };
    });
    expect(topElementDescription).toMatchObject({
      alt: 'david angry',
      assetPath: 'images/david/angry.webp',
    });
  }).toPass();

  const previewBox = await preview.locator('.action-editor__preview-placeholder').boundingBox();
  const adamBox = await adam.boundingBox();
  const sashaBox = await sasha.boundingBox();
  const davidBox = await david.boundingBox();
  expect(previewBox).not.toBeNull();
  expect(adamBox).not.toBeNull();
  expect(sashaBox).not.toBeNull();
  expect(davidBox).not.toBeNull();
  if (previewBox && adamBox && sashaBox && davidBox) {
    const previewCenterX = previewBox.x + previewBox.width / 2;
    expect(adamBox.x + adamBox.width / 2).toBeLessThan(previewCenterX);
    expect(davidBox.x + davidBox.width / 2).toBeGreaterThan(previewCenterX);
    expect(Math.abs(sashaBox.x + sashaBox.width / 2 - previewCenterX)).toBeLessThan(60);
    expect(Math.abs(sashaBox.y + sashaBox.height / 2 - (previewBox.y + previewBox.height / 2))).toBeLessThan(60);
  }
});

const e2eUrl = (path: string): string => new URL(path, e2eBaseUrl).toString();
