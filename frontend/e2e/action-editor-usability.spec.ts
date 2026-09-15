import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

let viteServer: ViteDevServer | null = null;
let e2eBaseUrl = 'http://127.0.0.1:5175';

declare global {
  interface Window {
    __actionEditorLargeInputJankEnabled?: boolean;
    __actionEditorLargeInputRollbacks?: Array<{
      after: string;
      before: string;
      t: number;
    }>;
    __actionEditorLargeInputLargeJoins?: number;
    __actionEditorAudioEvents?: Array<{ type: 'play' | 'pause'; url: string; volume: number }>;
    __actionEditorNextActions?: Array<{ action: string; targetLabelId?: string }>;
    actionEditorLargeInputHarness?: {
      contentChanges: number;
      latestContent: string;
    };
  }
}

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
  await expect(page.getByRole('button', { name: 'ch20_main2' })).toBeVisible();
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

test('action editor keeps large writer input local while batching content commits', async ({ page }) => {
  test.setTimeout(75_000);
  const initialText = 'RenPy Mouse starts with a stable local sentence.';
  const inputText = 'RenPy Mouse types every local letter safely through a busy editor.';

  await page.setViewportSize({ width: 1680, height: 900 });
  await page.addInitScript(() => {
    window.__actionEditorLargeInputRollbacks = [];
    window.__actionEditorLargeInputJankEnabled = false;
    window.__actionEditorLargeInputLargeJoins = 0;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (!descriptor?.get || !descriptor.set) {
      throw new Error('HTMLTextAreaElement.value descriptor is unavailable');
    }
    const originalJoin = Array.prototype.join;
    Array.prototype.join = function patchedActionEditorLargeInputJoin(separator?: string) {
      const result = originalJoin.call(this, separator);
      if (
        window.__actionEditorLargeInputJankEnabled &&
        separator === '\n' &&
        this.length > 100
      ) {
        window.__actionEditorLargeInputLargeJoins = (window.__actionEditorLargeInputLargeJoins ?? 0) + 1;
      }
      return result;
    };

    Object.defineProperty(HTMLTextAreaElement.prototype, 'value', {
      configurable: true,
      get() {
        return descriptor.get!.call(this);
      },
      set(nextValue) {
        const before = descriptor.get!.call(this);
        descriptor.set!.call(this, nextValue);
        const after = String(nextValue);
        const isWriterInput = String(this.className).includes('action-editor-writer__dialogue-input');
        if (
          window.__actionEditorLargeInputJankEnabled &&
          isWriterInput &&
          document.activeElement === this &&
          after.length < before.length &&
          before.startsWith(after)
        ) {
          window.__actionEditorLargeInputRollbacks?.push({
            after,
            before,
            t: Math.round(performance.now()),
          });
        }
      },
    });

    setInterval(() => {
      if (!window.__actionEditorLargeInputJankEnabled) {
        return;
      }
      const end = performance.now() + 85;
      while (performance.now() < end) {
        // Emulate the main-thread stalls observed while typing in a large action editor.
      }
    }, 240);
  });

  await page.goto(e2eUrl('/e2e/action-editor-large-input.html'));
  await expect(page.getByText('script-large-input.rpy')).toBeVisible();
  await selectEntireTextareaValue(page, initialText);
  await page.evaluate(() => {
    window.__actionEditorLargeInputJankEnabled = true;
  });
  await page.keyboard.type(inputText, { delay: 160 });
  await page.evaluate(() => {
    window.__actionEditorLargeInputJankEnabled = false;
  });

  await expect(page.locator('.action-editor-writer__row--dialogue:focus-within textarea')).toHaveValue(inputText);
  await page.waitForTimeout(1_000);

  const metrics = await page.evaluate(() => ({
    contentChanges: window.actionEditorLargeInputHarness?.contentChanges ?? 0,
    largeJoins: window.__actionEditorLargeInputLargeJoins ?? 0,
    latestContent: window.actionEditorLargeInputHarness?.latestContent ?? '',
    rollbacks: window.__actionEditorLargeInputRollbacks ?? [],
  }));

  expect(
    metrics.rollbacks.length,
    `Active writer textarea value rolled back during local typing: ${JSON.stringify(metrics.rollbacks.slice(0, 5))}`,
  ).toBe(0);
  expect(metrics.latestContent).toContain(inputText);
  expect(metrics.contentChanges).toBeLessThanOrEqual(3);
  expect(metrics.largeJoins).toBeLessThanOrEqual(3);
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
  const rawCodeEditor = page.locator('.action-editor__raw-codemirror .cm-content');
  await expect(rawCodeEditor).toContainText(/show monika 4c zorder 3 behind sayori at t31 with dissolve/);
  await expect(rawCodeEditor).toContainText(/play music t3\.ogg fadein 2\.0 loop/);
  await expect(rawCodeEditor).toContainText(/play sound click\.ogg noloop/);

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

  await expect(page.locator('.action-editor__raw-codemirror .cm-content')).toBeVisible();
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
      rawEditor: rect('.action-editor__raw-codemirror'),
    };
  });

  expect(rawLayout.rawColumn.width).toBeGreaterThan(rawLayout.body.width * 0.96);
  expect(rawLayout.rawEditor.width).toBeGreaterThan(rawLayout.body.width * 0.96);
  expect(Math.abs(rawLayout.rawColumn.left - rawLayout.body.left)).toBeLessThanOrEqual(2);
});

test('action editor raw CodeMirror editor scrolls and shows RenPy syntax highlighting', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  await page.getByRole('button', { name: /Raw Ren.Py/ }).click();
  await expect(page.locator('.action-editor__raw-codemirror .cm-editor')).toBeVisible();

  const rawEditorState = await page.evaluate(() => {
    const wrapper = document.querySelector('.action-editor__raw-codemirror');
    const editor = document.querySelector('.action-editor__raw-codemirror .cm-editor');
    const scroller = document.querySelector('.action-editor__raw-codemirror .cm-scroller') as HTMLElement | null;
    const highlighted = Array.from(document.querySelectorAll('.action-editor__raw-codemirror .rpy-token'));
    if (!wrapper || !editor || !scroller) {
      throw new Error('Raw CodeMirror editor did not mount');
    }
    scroller.scrollTop = 160;
    return {
      canScroll: scroller.scrollHeight > scroller.clientHeight,
      editorHeight: Math.round(editor.getBoundingClientRect().height),
      highlightClasses: Array.from(new Set(highlighted.map((element) => element.className))),
      highlightCount: highlighted.length,
      scrollTop: Math.round(scroller.scrollTop),
      scrollerHeight: Math.round(scroller.getBoundingClientRect().height),
      wrapperHeight: Math.round(wrapper.getBoundingClientRect().height),
    };
  });

  expect(rawEditorState.editorHeight).toBeLessThanOrEqual(rawEditorState.wrapperHeight + 2);
  expect(rawEditorState.scrollerHeight).toBeLessThanOrEqual(rawEditorState.wrapperHeight + 2);
  expect(rawEditorState.canScroll).toBe(true);
  expect(rawEditorState.scrollTop).toBeGreaterThan(0);
  expect(rawEditorState.highlightCount).toBeGreaterThan(8);
  expect(rawEditorState.highlightClasses).toEqual(expect.arrayContaining([expect.stringContaining('rpy-token--string')]));
});

test('action editor preview eye expands the scene preview panel', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  const previewPanel = page.locator('.action-editor-sidebar__preview');
  const initialWidth = await previewPanel.evaluate((element) => element.getBoundingClientRect().width);

  await page.getByRole('button', { name: 'Expand scene preview' }).click();
  await expect(page.getByRole('button', { name: 'Collapse scene preview' })).toBeVisible();
  await expect(previewPanel).toHaveClass(/action-editor-sidebar__preview--expanded/);
  await expect.poll(() => previewPanel.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(initialWidth * 1.7);

  await page.getByRole('button', { name: 'Collapse scene preview' }).click();
  await expect(page.getByRole('button', { name: 'Expand scene preview' })).toBeVisible();
});

test('action editor audio preview toggles to stop and persists per-channel volume cookies', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.addInitScript(() => {
    window.__actionEditorAudioEvents = [];
    class MockAudio {
      currentTime = 0;
      onended: (() => void) | null = null;
      volume = 1;
      constructor(private readonly url: string) {}
      pause() {
        window.__actionEditorAudioEvents?.push({ type: 'pause', url: this.url, volume: this.volume });
      }
      async play() {
        window.__actionEditorAudioEvents?.push({ type: 'play', url: this.url, volume: this.volume });
      }
    }
    window.Audio = MockAudio as unknown as typeof Audio;
  });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  await setRangeValue(page, 'Music preview volume', '0.4');
  await setRangeValue(page, 'Sound preview volume', '0.65');
  await expect.poll(() => page.evaluate(() => document.cookie)).toContain('action_editor_music_preview_volume=0.4');
  await expect.poll(() => page.evaluate(() => document.cookie)).toContain('action_editor_sound_preview_volume=0.65');

  await page.getByRole('button', { name: 'Preview music' }).click();
  await expect(page.getByRole('button', { name: 'Stop music preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Preview sound' }).click();
  await expect(page.getByRole('button', { name: 'Stop sound preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop music preview' }).click();
  await expect(page.getByRole('button', { name: 'Preview music' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop sound preview' })).toBeVisible();

  const events = await page.evaluate(() => window.__actionEditorAudioEvents ?? []);
  expect(events).toEqual(
    expect.arrayContaining([
      { type: 'play', url: 'blob:t2', volume: 0.4 },
      { type: 'play', url: 'blob:page-turn', volume: 0.65 },
      { type: 'pause', url: 'blob:t2', volume: 0.4 },
    ]),
  );
  expect(events).not.toEqual(expect.arrayContaining([{ type: 'pause', url: 'blob:page-turn', volume: 0.65 }]));
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

test('action editor Next controls emit structured node creation requests with label targets', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  await page.getByRole('button', { name: /Player Choice/ }).click();
  await page.getByLabel('Create player choice').getByLabel('Choice text').fill('Follow the cheese');
  await page.getByLabel('Create player choice').getByRole('button', { name: 'Create structure' }).click();
  await page.getByRole('button', { name: /Conditional Path/ }).click();
  await page.getByLabel('Create conditional path').getByLabel('IF condition').fill('renpy_mouse_hungry');
  await page.getByLabel('Create conditional path').getByRole('button', { name: 'Create structure' }).click();
  await page.getByRole('button', { name: /Go to Label/ }).click();
  await page.getByLabel('Choose jump target').getByRole('option', { name: /day_two/ }).click();
  await page.getByLabel('Choose jump target').getByRole('button', { name: 'Create jump' }).click();
  await page.getByRole('button', { name: /Call Sub-scene/ }).click();
  await page.getByLabel('Choose call target').getByRole('option').filter({ hasText: 'Current label' }).click();
  await page.getByLabel('Choose call target').getByRole('button', { name: 'Create call' }).click();
  await page.getByRole('button', { name: /Return/ }).click();

  const actions = await page.evaluate(() => window.__actionEditorNextActions ?? []);
  expect(actions).toHaveLength(5);
  expect(actions[0]).toMatchObject({ action: 'menu', menuDraft: { prompt: '', choices: [{ text: 'Follow the cheese' }] } });
  expect(actions[1]).toMatchObject({ action: 'conditional', conditionalDraft: { ifBranch: { condition: 'renpy_mouse_hungry' }, elifBranches: [], elseBranch: null } });
  expect(actions.slice(2)).toEqual([
    { action: 'jump', target: { kind: 'existing', labelId: 'label-day-two' } },
    { action: 'call', target: { kind: 'existing', labelId: 'label-start' } },
    { action: 'return' },
  ]);
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

test('action editor add row button opens a focused empty writer row', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  await expect(page.locator('.action-editor-writer__row--empty')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add dialogue or command' }).click();

  await expect(page.locator('.action-editor-writer__row--empty')).toHaveCount(1);
  await expect(page.locator('.action-editor-empty-picker')).toBeVisible();
  await expect(page.locator('.action-editor-empty-picker__speaker--current')).toContainText('Narrator');
});

test('action editor Enter inserts an empty row after command and raw inputs', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));

  const showPrimary = page.getByLabel('Show primary value').first();
  await showPrimary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.action-editor-empty-picker')).toBeVisible();
  await expect
    .poll(() =>
      showPrimary.evaluate((input) =>
        input.closest('.action-editor-writer__row')?.nextElementSibling?.classList.contains('action-editor-writer__row--empty') ??
        false,
      ),
    )
    .toBe(true);

  await page.goto(e2eUrl('/e2e/action-editor-visual.html'));
  const rawLine = page.getByLabel('Raw RenPy line').first();
  await rawLine.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.action-editor-empty-picker')).toBeVisible();
  await expect
    .poll(() =>
      rawLine.evaluate((input) =>
        input.closest('.action-editor-writer__row')?.nextElementSibling?.classList.contains('action-editor-writer__row--empty') ??
        false,
      ),
    )
    .toBe(true);
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

const selectEntireTextareaValue = async (page: import('@playwright/test').Page, value: string) => {
  await page.evaluate((textareaValueToFind) => {
    const textarea = Array.from(document.querySelectorAll('textarea')).find(
      (candidate) => candidate.value === textareaValueToFind,
    );
    if (!textarea) {
      throw new Error(`Textarea not found: ${textareaValueToFind}`);
    }
    textarea.scrollIntoView({ block: 'center' });
    textarea.focus();
    textarea.setSelectionRange(0, textarea.value.length);
    textarea.dispatchEvent(new Event('select', { bubbles: true }));
  }, value);
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

const setRangeValue = async (page: import('@playwright/test').Page, label: string, value: string) => {
  await page.getByLabel(label).evaluate((input, nextValue) => {
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Range input not found');
    }
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!valueSetter) {
      throw new Error('HTMLInputElement.value setter is unavailable');
    }
    valueSetter.call(input, String(nextValue));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
};

const e2eUrl = (path: string): string => new URL(path, e2eBaseUrl).toString();
