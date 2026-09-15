import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

let viteServer: ViteDevServer | null = null;
let e2eBaseUrl = 'http://127.0.0.1:5176';

test.beforeAll(async () => {
  viteServer = await createServer({
    server: {
      host: '127.0.0.1',
      port: 5176,
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

test('action editor scene preview follows RenPy scene reset, image aliases, and layer transforms', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-scene-preview.html'));

  const preview = page.locator('.action-editor-sidebar__preview');
  await expect(page.getByRole('dialog', { name: 'Action editor' })).toBeVisible();
  await expect(preview.getByText('Scene preview')).toBeVisible();
  await expect(preview.locator('[data-asset-path="backgrounds/living/on.png"]')).toBeVisible();
  await expect(preview.locator('[data-asset-path="image/monika/happy.png"]')).toBeVisible();
  await expect(preview.locator('[data-asset-path="images/renpy_mouse/nervous.png"]')).toBeVisible();
  await expect(preview.locator('[data-asset-path="images/renpy_mouse/brave.png"]')).toHaveCount(0);
  await expect(preview.locator('[data-asset-path="images/crumbs/happy.png"]')).toBeVisible();
  await expect(preview.getByText('Position(xalign=-0.1, yalign=1.0)')).toBeVisible();
  await expect(preview.getByText('Position(xalign=0.0, yalign=1.0)')).toBeVisible();
  await expect(preview.getByText('Position(xalign=0.6, yalign=1.0)')).toBeVisible();

  await preview.getByRole('button', { name: 'Expand scene preview' }).click();
  await expect(preview).toHaveClass(/action-editor-sidebar__preview--expanded/);

  const previewStage = preview.locator('.action-editor__preview-placeholder');
  const renpyMouseSprite = preview.locator('[data-asset-path="images/renpy_mouse/nervous.png"] > img');
  await expect.poll(async () => {
    const [previewBox, spriteBox] = await Promise.all([
      previewStage.boundingBox(),
      renpyMouseSprite.boundingBox(),
    ]);
    if (!previewBox || !spriteBox) {
      return false;
    }
    const leftAligned = Math.abs(spriteBox.x - previewBox.x) <= 1;
    const bottomAligned = Math.abs(
      spriteBox.y + spriteBox.height - (previewBox.y + previewBox.height),
    ) <= 1;
    return leftAligned && bottomAligned;
  }).toBe(true);

  await expect(preview.locator('[data-asset-path="backgrounds/kitchen/morning.png"]')).toHaveCount(0);
  await expect(preview.locator('[data-asset-path="images/stale/kitchen.png"]')).toHaveCount(0);
  await expect(preview.getByText('stale kitchen mouse')).toHaveCount(0);
  await expect(preview.getByText('layer master')).toHaveCount(0);
});

const e2eUrl = (path: string): string => new URL(path, e2eBaseUrl).toString();
