import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const preview = JSON.parse(readFileSync(new URL('../../backend/app/demo_assets/clockwork-library/v1/preview.json', import.meta.url), 'utf8'));
const menuId = preview.graph.nodes.find((node: { type: string; file_id: string }) =>
  node.type === 'menu' && node.file_id === preview.graph.files.find((file: { path: string }) => file.path === 'library.rpy').id).id;
const charactersId = preview.graph.files.find((file: { path: string }) => file.path === 'characters.rpy').id;
const basementId = preview.graph.files.find((file: { path: string }) => file.path === 'basement.rpy').id;
const libraryId = preview.graph.files.find((file: { path: string }) => file.path === 'library.rpy').id;

test.beforeEach(async ({ page }) => {
  await page.route('**/api/projects/demo/clockwork-library/preview', route => route.fulfill({ json: preview }));
});

test('chapters point to their own evidence instead of the following headline', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(process.env.LANDING_TEST_BASE_URL ?? '/');
  const nav = page.getByRole('navigation', { name: 'Explore the demo' });
  await expect(nav).toBeVisible();
  await nav.getByRole('button', { name: 'Connections' }).click();
  await expect(nav.getByRole('button', { name: 'Connections' })).toHaveAttribute('aria-pressed', 'true');
  const connections = page.getByRole('article', { name: 'Connections' });
  await expect.poll(async () => {
    const box = await connections.boundingBox();
    return box !== null && box.x >= 25 && box.x <= 45 && box.x + box.width <= 1440;
  }).toBe(true);
  await expect.poll(async () => {
    const box = await page.getByRole('article', { name: 'Collaborate' }).boundingBox();
    return box !== null && box.x >= 1440;
  }).toBe(true);
  await expect(page.locator(`.react-flow__node[data-id="${menuId}"]`)).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('desktop-connections.png') });
  await connections.getByRole('button', { name: 'Inspect the choice' }).click();
  await expect(page.locator(`.react-flow__node[data-id="${menuId}"]`)).toBeInViewport();

  await nav.getByRole('button', { name: 'Collaborate' }).click();
  await expect(page.getByText('Demo cursors · no one is online here')).toBeInViewport();
  await expect.poll(async () => {
    const box = await page.getByRole('article', { name: 'Collaborate' }).boundingBox();
    return box !== null && box.x > 900 && box.x < 1100;
  }).toBe(true);
  await expect(page.locator('.demo-presence-cursor--author')).toContainText('the-asind');
  await expect(page.locator('.demo-presence-cursor--peer')).toContainText('Mira');
  await expect(page.locator('.demo-presence-cursor--author')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('desktop-collaborate.png') });

  await nav.getByRole('button', { name: 'Your files' }).click();
  await expect.poll(async () => {
    const box = await page.getByRole('article', { name: 'Your files' }).boundingBox();
    return box !== null && box.x > 450 && box.x < 500 && box.x + box.width <= 1440;
  }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('desktop-files.png') });
  await page.getByRole('article', { name: 'Your files' }).getByRole('button', { name: 'View the .rpy source' }).click();
  const source = page.getByRole('complementary', { name: 'Real Ren’Py source audio.rpy' });
  await expect(source).toContainText('define audio.page_turn');
  await source.getByRole('button', { name: 'Close source' }).click();
  await expect(source).toBeHidden();
});

test('narrow chapter navigation keeps text readable and above its evidence', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(process.env.LANDING_TEST_BASE_URL ?? '/');
  const nav = page.getByRole('navigation', { name: 'Explore the demo' });
  await expect(nav).toBeVisible();
  for (const label of ['Connections', 'Collaborate', 'Your files']) {
    await nav.getByRole('button', { name: label }).click();
    const chapter = page.getByRole('article', { name: label });
    await expect.poll(async () => {
      const rect = await chapter.boundingBox();
      return rect !== null && rect.x >= 0 && rect.x + rect.width <= 390 && rect.y >= 100;
    }).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`mobile-${label.toLowerCase().replace(' ', '-')}.png`) });
  }
});

test('connections claim and its menu fit a short desktop viewport together', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(process.env.LANDING_TEST_BASE_URL ?? '/');
  await page.getByRole('navigation', { name: 'Explore the demo' }).getByRole('button', { name: 'Connections' }).click();
  const connections = page.getByRole('article', { name: 'Connections' });
  await expect.poll(async () => {
    const box = await connections.boundingBox();
    return box !== null && box.x >= 20 && box.x + box.width <= 1280 && box.y >= 150 && box.y + box.height <= 720;
  }).toBe(true);
  await expect(page.locator(`.react-flow__node[data-id="${menuId}"]`)).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('short-desktop-connections.png') });
});

test('team cursors remain visible on a short desktop viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(process.env.LANDING_TEST_BASE_URL ?? '/');
  await page.getByRole('navigation', { name: 'Explore the demo' }).getByRole('button', { name: 'Collaborate' }).click();
  await expect(page.getByRole('article', { name: 'Collaborate' })).toBeInViewport();
  const author = page.locator('.demo-presence-cursor--author');
  const peer = page.locator('.demo-presence-cursor--peer');
  await expect(author).toContainText('the-asind');
  await expect(peer).toContainText('Mira');
  await expect.poll(async () => {
    const authorBox = await author.boundingBox();
    const peerBox = await peer.boundingBox();
    return authorBox !== null && peerBox !== null && authorBox.x >= 0 && peerBox.x >= 0 &&
      authorBox.y >= 150 && authorBox.y + authorBox.height <= 720 &&
      peerBox.y >= 150 && peerBox.y + peerBox.height <= 720;
  }).toBe(true);
  await expect.poll(async () => {
    const copy = await page.getByRole('article', { name: 'Collaborate' }).boundingBox();
    const codeFrame = await page.locator(`.react-flow__node[data-id="${charactersId}"]`).boundingBox();
    const sceneFrame = await page.locator(`.react-flow__node[data-id="${basementId}"]`).boundingBox();
    const previousFrame = await page.locator(`.react-flow__node[data-id="${libraryId}"]`).boundingBox();
    return copy !== null && codeFrame !== null && sceneFrame !== null && previousFrame !== null &&
      sceneFrame.x >= copy.x + copy.width && sceneFrame.x < 1280 &&
      previousFrame.y >= copy.y + copy.height &&
      (codeFrame.x >= copy.x + copy.width || codeFrame.x + codeFrame.width <= copy.x);
  }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('short-desktop-collaborate.png') });
});
