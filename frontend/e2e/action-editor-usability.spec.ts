import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

let viteServer: ViteDevServer | null = null;
let e2eBaseUrl = 'http://127.0.0.1:5175';

test.beforeAll(async () => {
  viteServer = await createServer({
    server: {
      host: '127.0.0.1',
      port: 5175,
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

test('action editor keeps long dialogue blocks dense and independently scrollable', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  const surface = page.locator('.action-editor__surface');
  const writerColumn = page.locator('.action-editor__writer-column');
  const rowList = page.locator('.action-editor-writer__rows');
  const sidebar = page.locator('.action-editor__sidebar');
  await expect(page.getByText('script-ch20.rpy')).toBeVisible();
  await expect(page.getByText('ch20_main2')).toBeVisible();
  await expect(page.getByText('All words escape me in this situation.')).toBeVisible();
  await expect(sidebar.getByText('black')).toBeVisible();
  await expect(sidebar.getByText('natsuki 4c')).toBeVisible();
  await expect(sidebar.getByText('monika 3a')).toBeVisible();
  await expect(sidebar.getByText('monika 3m')).toHaveCount(0);
  await expect(page.locator('.action-editor-sidebar__standee')).toHaveCount(0);
  await expect(page.locator('.action-editor-sidebar__classroom')).toHaveCount(0);

  const layout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`Missing selector ${selector}`);
      }
      const bounds = element.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        height: bounds.height,
        top: bounds.top,
      };
    };

    const writer = document.querySelector('.action-editor__writer-column') as HTMLElement | null;
    const rows = document.querySelector('.action-editor-writer__rows') as HTMLElement | null;
    if (!writer || !rows) {
      throw new Error('Missing writer scroll containers');
    }

    return {
      surface: rect('.action-editor__surface'),
      writer: rect('.action-editor__writer-column'),
      rowList: rect('.action-editor-writer__rows'),
      sidebar: rect('.action-editor__sidebar'),
      firstDialogueRow: rect('.action-editor-writer__row--dialogue'),
      surfaceLeft: document.querySelector('.action-editor__surface')?.getBoundingClientRect().left ?? 0,
      surfaceWidth: document.querySelector('.action-editor__surface')?.getBoundingClientRect().width ?? 0,
      writerClientHeight: writer.clientHeight,
      writerOverflowY: getComputedStyle(writer).overflowY,
      writerScrollHeight: writer.scrollHeight,
    };
  });

  expect(layout.surface.top).toBeLessThanOrEqual(28);
  expect(layout.surface.bottom).toBeGreaterThanOrEqual(872);
  expect(layout.surface.bottom).toBeLessThanOrEqual(900);
  expect(layout.surfaceLeft).toBeLessThanOrEqual(32);
  expect(layout.surfaceWidth).toBeGreaterThanOrEqual(1600);
  expect(layout.writerOverflowY).toBe('auto');
  expect(layout.writerScrollHeight).toBeGreaterThan(layout.writerClientHeight);
  expect(layout.firstDialogueRow.height).toBeLessThanOrEqual(64);

  const beforeSidebarTop = (await sidebar.boundingBox())?.y ?? 0;
  await writerColumn.evaluate((element) => {
    element.scrollTop = 420;
  });
  await expect(rowList).toBeVisible();
  await expect(sidebar).toBeVisible();
  const afterSidebarTop = (await sidebar.boundingBox())?.y ?? 0;
  expect(Math.round(afterSidebarTop)).toBe(Math.round(beforeSidebarTop));
});

test('action editor keeps row handles in one strict right-side column', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  const handleMetrics = await page.locator('.action-editor-drag-handle').evaluateAll((handles) =>
    handles.slice(0, 14).map((handle) => {
      const bounds = handle.getBoundingClientRect();
      return { left: Math.round(bounds.left), width: Math.round(bounds.width) };
    }),
  );

  expect(handleMetrics.length).toBeGreaterThan(8);
  expect(new Set(handleMetrics.map((metric) => metric.left)).size).toBe(1);
  expect(new Set(handleMetrics.map((metric) => metric.width)).size).toBe(1);
});

test('action editor inline toolbar applies tags to the real textarea selection', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  await selectTextareaRange(page, 'All words escape me in this situation.', 'words');
  await clickFocusedToolbarButton(page, 'Bold selected text');
  await expect
    .poll(() => textareaValue(page, 'All {b}words{/b} escape me in this situation.'))
    .toBe('All {b}words{/b} escape me in this situation.');

  await setTextareaCaret(page, 'This club...', 'This'.length);
  await clickFocusedToolbarButton(page, 'Wait tag');
  await expect.poll(() => textareaValue(page, 'This{w} club...')).toBe('This{w} club...');
});

test('action editor toolbar menus apply configured RenPy text tag values', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  await selectTextareaRange(page, 'All words escape me in this situation.', 'words');
  await clickFocusedToolbarButton(page, 'Text color menu');
  await page.getByRole('menuitem', { name: 'Red #ef4444' }).click();
  await expect
    .poll(() => textareaValue(page, 'All {color=#ef4444}words{/color} escape me in this situation.'))
    .toBe('All {color=#ef4444}words{/color} escape me in this situation.');

  await selectTextareaRange(page, 'This club...', 'club');
  await clickFocusedToolbarButton(page, 'Text size menu');
  await page.getByRole('menuitem', { name: 'Size +8' }).click();
  await expect.poll(() => textareaValue(page, 'This {size=+8}club{/size}...')).toBe('This {size=+8}club{/size}...');

  await selectTextareaRange(page, 'Eh?', 'Eh');
  await clickFocusedToolbarButton(page, 'CPS menu');
  await expect(page.getByRole('menu', { name: 'CPS options' })).toBeVisible();
  if (process.env.ACTION_EDITOR_VISUAL_CHECK) {
    await page.screenshot({ path: '../artifacts/action-editor-toolbar-menu-visual-check.png', fullPage: false });
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'CPS options' })).toHaveCount(0);
});

test('action editor toolbar menus apply custom RenPy text tag values', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  await selectTextareaRange(page, 'Eh?', 'Eh');
  await clickFocusedToolbarButton(page, 'Text color menu');
  await page.getByLabel('Custom color value').fill('#f97316');
  if (process.env.ACTION_EDITOR_VISUAL_CHECK) {
    await page.screenshot({ path: '../artifacts/action-editor-toolbar-custom-menu-visual-check.png', fullPage: false });
  }
  await page.getByRole('menuitem', { name: 'Apply custom color' }).click();
  await expect.poll(() => textareaValue(page, '{color=#f97316}Eh{/color}?')).toBe('{color=#f97316}Eh{/color}?');

  await selectTextareaRange(page, 'A...a guest?', 'guest');
  await clickFocusedToolbarButton(page, 'Text size menu');
  await page.getByLabel('Custom size value').fill('+12');
  await page.getByRole('menuitem', { name: 'Apply custom size' }).click();
  await expect.poll(() => textareaValue(page, 'A...a {size=+12}guest{/size}?')).toBe('A...a {size=+12}guest{/size}?');
});

test('action editor command rows expose editable primary and clause fields', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  const showPrimary = page.getByLabel('Show primary value').filter({ hasText: '' }).first();
  const showAt = page.getByLabel('Show at value').first();
  const showWith = page.getByLabel('Show with value').first();

  await expect(showPrimary).toHaveValue(/natsuki|monika/);
  await showPrimary.fill('monika 4c');
  await showAt.fill('t31');
  await showWith.fill('dissolve');

  await expect(showPrimary).toHaveValue('monika 4c');
  await expect(showAt).toHaveValue('t31');
  await expect(showWith).toHaveValue('dissolve');
  if (process.env.ACTION_EDITOR_VISUAL_CHECK) {
    await page.screenshot({ path: '../artifacts/action-editor-command-fields-visual-check.png', fullPage: false });
  }
});

test('action editor command rows expose editable modifiers and audio options', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  const showModifiers = page.getByLabel('Show modifiers value').first();
  const musicOptions = page.getByLabel('Music options value').first();
  const soundOptions = page.getByLabel('Sound options value').first();

  await expect(showModifiers).toHaveValue('zorder 2');
  await showModifiers.fill('zorder 3 behind sayori');
  await musicOptions.fill('fadein 2.0 loop');
  await soundOptions.fill('noloop');

  await expect(showModifiers).toHaveValue('zorder 3 behind sayori');
  await expect(musicOptions).toHaveValue('fadein 2.0 loop');
  await expect(soundOptions).toHaveValue('noloop');
  if (process.env.ACTION_EDITOR_VISUAL_CHECK) {
    await page.screenshot({ path: '../artifacts/action-editor-command-options-visual-check.png', fullPage: false });
  }
});

test('action editor syncs writer command edits with sidebar preview and raw RenPy', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  const sidebar = page.locator('.action-editor__sidebar');
  const firstShowPrimary = page.getByLabel('Show primary value').first();
  const firstShowModifiers = page.getByLabel('Show modifiers value').first();
  const firstShowAt = page.getByLabel('Show at value').first();
  const firstShowWith = page.getByLabel('Show with value').first();

  await firstShowPrimary.fill('monika 4c');
  await firstShowModifiers.fill('zorder 3 behind sayori');
  await firstShowAt.fill('t31');
  await firstShowWith.fill('dissolve');

  await expect(sidebar.getByText('monika 4c')).toBeVisible();
  await expect(sidebar.getByText('zorder 3 behind sayori at t31 with dissolve')).toBeVisible();
  await expect(sidebar.getByText('monika 3m')).toHaveCount(0);

  const musicPrimary = page.getByLabel('Music primary value').first();
  const musicOptions = page.getByLabel('Music options value').first();
  const soundPrimary = page.getByLabel('Sound primary value').first();
  const soundOptions = page.getByLabel('Sound options value').first();
  await musicPrimary.fill('t3.ogg');
  await musicOptions.fill('fadein 2.0 loop');
  await soundPrimary.fill('click.ogg');
  await soundOptions.fill('noloop');

  await expect(sidebar.getByText('t3.ogg')).toBeVisible();
  await expect(sidebar.getByText('fadein 2.0 loop')).toBeVisible();
  await expect(sidebar.getByText('click.ogg')).toBeVisible();
  await expect(sidebar.getByText('noloop')).toBeVisible();

  await page.getByRole('button', { name: /Raw Ren.Py/ }).click();
  await expect(page.getByLabel('Raw RenPy action content')).toHaveValue(
    /show monika 4c zorder 3 behind sayori at t31 with dissolve/,
  );
  await expect(page.getByLabel('Raw RenPy action content')).toHaveValue(/play music t3\.ogg fadein 2\.0 loop/);
  await expect(page.getByLabel('Raw RenPy action content')).toHaveValue(/play sound click\.ogg noloop/);

  await page.getByRole('button', { name: /Writer view/ }).click();
  await expect(firstShowPrimary).toHaveValue('monika 4c');
  await expect(musicOptions).toHaveValue('fadein 2.0 loop');
  await expect(soundOptions).toHaveValue('noloop');
});

test('action editor raw mode hides writer aids and gives raw content the full body width', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  await expect(page.locator('.action-editor__sidebar')).toBeVisible();
  await expect(page.getByText('Scene preview')).toBeVisible();
  await page.getByRole('button', { name: /Raw Ren.Py/ }).click();

  await expect(page.getByLabel('Raw RenPy action content')).toBeVisible();
  await expect(page.locator('.action-editor__sidebar')).toHaveCount(0);
  await expect(page.getByText('Scene preview')).toHaveCount(0);
  await expect(page.getByText('Audio')).toHaveCount(0);
  await expect(page.getByText('Player Choice')).toHaveCount(0);

  const rawLayout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`Missing selector ${selector}`);
      }
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, width: bounds.width };
    };

    return {
      body: rect('.action-editor__body'),
      rawColumn: rect('.action-editor__raw-column'),
      rawEditor: rect('.action-editor__raw-editor'),
    };
  });

  expect(rawLayout.rawColumn.width).toBeGreaterThan(rawLayout.body.width * 0.96);
  expect(rawLayout.rawEditor.width).toBeGreaterThan(rawLayout.body.width * 0.96);
  expect(Math.abs(rawLayout.rawColumn.left - rawLayout.body.left)).toBeLessThanOrEqual(2);
});

test('action editor sprite attribute field is quiet until focused and explains RenPy meaning', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  const attributeField = page.getByLabel('Monika image attributes').first();
  const speakerTile = attributeField.locator('xpath=..');
  const helpNote = speakerTile.locator('.action-editor-writer__speaker-attrs-help');
  await expect(attributeField).toBeVisible();
  await expect(helpNote).toBeHidden();

  const quietOpacity = await attributeField.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity));
  await attributeField.click();
  await expect(helpNote).toBeVisible();
  await expect(helpNote).toContainText('Ren\'Py say image attributes');
  await expect(helpNote.getByRole('link', { name: 'Ren\'Py documentation' })).toHaveAttribute(
    'href',
    'https://www.renpy.org/doc/html/dialogue.html#say-with-image-attributes',
  );

  expect(quietOpacity).toBeLessThanOrEqual(0.65);
  await expect
    .poll(() => attributeField.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity)))
    .toBeGreaterThan(quietOpacity);
});

test('action editor scene and audio preview follows the focused writer row', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  const sidebar = page.locator('.action-editor__sidebar');
  await expect(sidebar.getByText('t2.ogg')).toBeVisible();
  await expect(sidebar.getByText('natsuki 4c')).toBeVisible();

  await setTextareaCaret(page, 'Eh?', 0);
  await expect(sidebar.getByText('black')).toBeVisible();
  await expect(sidebar.getByText('monika 1')).toBeVisible();
  await expect(sidebar.getByText('t2.ogg')).toHaveCount(0);
  await expect(sidebar.getByText('natsuki 4c')).toHaveCount(0);
  await expect(sidebar.getByText('none')).toHaveCount(2);

  await setTextareaCaret(page, 'All words escape me in this situation.', 0);
  await expect(sidebar.getByText('t2.ogg')).toBeVisible();
  await expect(sidebar.getByText('page_turn.ogg')).toBeVisible();
  await expect(sidebar.getByText('natsuki 4c')).toBeVisible();
});

test('action editor Enter creates a new writer row instead of raw multiline RenPy text', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  await setTextareaCaret(page, 'This club...', 'This club...'.length);
  await page.keyboard.press('Enter');

  await expect(page.locator('.action-editor-writer__row--empty')).toBeVisible();
  await expect(page.locator('.action-editor-empty-picker')).toBeVisible();
  await expect(page.locator('.action-editor-empty-picker__speaker--current')).toContainText('Narrator');

  const multilineTextareaCount = await page.locator('textarea').evaluateAll(
    (textareas) => textareas.filter((textarea) => textarea.value.includes('\n')).length,
  );
  expect(multilineTextareaCount).toBe(0);
});

test('action editor empty row picker uses vertical speaker and horizontal card navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  await setTextareaCaret(page, 'This club...', 'This club...'.length);
  await page.keyboard.press('Enter');

  const currentSpeaker = page.locator('.action-editor-empty-picker__speaker--current');
  await expect(currentSpeaker).toContainText('Narrator');
  await page.keyboard.press('ArrowDown');
  await expect(currentSpeaker).not.toContainText('Narrator');

  const selectedCard = page.locator('.action-editor-empty-picker__card--selected');
  await expect(selectedCard).toContainText(/Dialogue|Narration/);
  await page.keyboard.press('ArrowRight');
  await expect(selectedCard).toContainText(/Scene|Show|Hide|Music|Sound|Transition/);
});

test('action editor keeps only the focused empty-row picker active', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  await setTextareaCaret(page, 'This club...', 'This club...'.length);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');

  await expect(page.locator('.action-editor-writer__row--empty')).toHaveCount(1);
  await expect(page.locator('.action-editor-empty-picker')).toHaveCount(1);
  await expect(page.locator('.action-editor-writer__row--empty .action-editor-writer__inline-toolbar')).toHaveCount(0);

  await page.getByText('All words escape me in this situation.').click();
  await expect(page.locator('.action-editor-empty-picker')).toHaveCount(0);
});

test('action editor empty row picker confirms selected command type', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));
  const sceneBlackCountBefore = await inputValueCount(page, 'Scene primary value', 'black');

  await setTextareaCaret(page, 'This club...', 'This club...'.length);
  await page.keyboard.press('Enter');
  await expect(page.locator('.action-editor-empty-picker')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.action-editor-empty-picker__speaker-rail')).toBeHidden();
  await expect(page.locator('.action-editor-empty-picker__card--selected')).toContainText('Scene');
  await page.keyboard.press('Enter');

  await expect(page.locator('.action-editor-empty-picker')).toHaveCount(0);
  await expect.poll(() => inputValueCount(page, 'Scene primary value', 'black')).toBe(sceneBlackCountBefore + 1);
});

test('action editor header controls stay compact and ordered like the mockup', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  const layout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`Missing selector ${selector}`);
      }
      const bounds = element.getBoundingClientRect();
      return {
        height: bounds.height,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
      };
    };

    return {
      close: rect('[aria-label="Close action editor"]'),
      header: rect('.action-editor__header'),
      history: rect('.action-editor__history-actions'),
      modeHistoryCluster: rect('.action-editor__mode-history-cluster'),
      mode: rect('.action-editor__mode-switch'),
      save: rect('.action-editor__save-status'),
    };
  });

  expect(layout.header.height).toBeLessThanOrEqual(82);
  expect(layout.modeHistoryCluster.height).toBeLessThanOrEqual(48);
  expect(layout.mode.left).toBeLessThan(layout.history.left);
  expect(layout.history.left - layout.mode.right).toBeGreaterThanOrEqual(8);
  await expect(page.locator('.action-editor__header-divider')).toHaveCount(0);
  expect(layout.history.right).toBeLessThan(layout.save.left);
  expect(layout.save.right).toBeLessThan(layout.close.left);
  expect(Math.abs(layout.mode.top - layout.history.top)).toBeLessThanOrEqual(4);
});

const clickFocusedToolbarButton = async (page: import('@playwright/test').Page, name: string) => {
  await page.locator('.action-editor-writer__row--dialogue:focus-within').getByRole('button', { name, exact: true }).click();
};

const selectTextareaRange = async (page: import('@playwright/test').Page, value: string, selectedText: string) => {
  await page.evaluate(
    ({ selectedText: textToSelect, value: textareaValueToFind }) => {
      const textarea = Array.from(document.querySelectorAll('textarea')).find(
        (candidate) => candidate.value === textareaValueToFind,
      );
      if (!textarea) {
        throw new Error(`Textarea not found: ${textareaValueToFind}`);
      }
      const start = textarea.value.indexOf(textToSelect);
      textarea.scrollIntoView({ block: 'center' });
      textarea.focus();
      textarea.setSelectionRange(start, start + textToSelect.length);
      textarea.dispatchEvent(new Event('select', { bubbles: true }));
    },
    { selectedText, value },
  );
};

const setTextareaCaret = async (page: import('@playwright/test').Page, value: string, caret: number) => {
  await page.evaluate(
    ({ caretPosition, value: textareaValueToFind }) => {
      const textarea = Array.from(document.querySelectorAll('textarea')).find(
        (candidate) => candidate.value === textareaValueToFind,
      );
      if (!textarea) {
        throw new Error(`Textarea not found: ${textareaValueToFind}`);
      }
      textarea.scrollIntoView({ block: 'center' });
      textarea.focus();
      textarea.setSelectionRange(caretPosition, caretPosition);
      textarea.dispatchEvent(new Event('select', { bubbles: true }));
    },
    { caretPosition: caret, value },
  );
};

const textareaValue = async (page: import('@playwright/test').Page, value: string): Promise<string | null> =>
  page.evaluate((textareaValueToFind) => {
    const textarea = Array.from(document.querySelectorAll('textarea')).find(
      (candidate) => candidate.value === textareaValueToFind,
    );
    return textarea?.value ?? null;
  }, value);

const inputValueCount = async (page: import('@playwright/test').Page, label: string, value: string): Promise<number> =>
  page.getByLabel(label).evaluateAll((inputs, expectedValue) =>
    inputs.filter((input) => input instanceof HTMLInputElement && input.value === expectedValue).length,
  value);

const e2eUrl = (path: string): string => new URL(path, e2eBaseUrl).toString();
