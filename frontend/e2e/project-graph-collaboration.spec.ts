import { expect, test } from '@playwright/test';
import { WebSocketServer } from 'ws';
import { createServer, type ViteDevServer } from 'vite';

declare global {
  interface Window {
    projectGraphHarness: {
      createFromGraph(graph: Record<string, unknown>, peerId: string, socketUrl: string): number[];
      createFromSnapshot(snapshot: number[], peerId: string, socketUrl: string): number[];
      edit(nodeId: string, content: string): void;
      move(entityId: string, position: { x: number; y: number }): void;
    };
    __projectGraphInputRollbacks?: Array<{
      after: string;
      before: string;
      t: number;
    }>;
    __projectGraphInputJankEnabled?: boolean;
    projectGraphInputHarness?: {
      graphChanges: string[];
      presenceEvents: Array<{
        activity: 'viewing_canvas' | 'editing_action' | 'editing_source_file';
        position: { x: number; y: number };
        targetNodeId?: string;
      }>;
      insertAbove(): void;
      latestGraph: {
        files: Array<{ id: string; path: string }>;
        labels: Array<{ id: string; qualified_name: string; parent_label_id: string | null }>;
        nodes: Array<{
          content: string;
          id: string;
          label_id: string;
        }>;
      };
      remoteSpliceAction(edit: { deleteCount: number; index: number; insertText: string }): void;
      snapshots: number;
    };
    resolveExport?: () => void;
    lastInviteTarget?: string;
  }
}

const graph = {
  project_id: 'sprint-9-e2e-project',
  files: [
    {
      id: 'file-day-1',
      path: 'renpy_mouse_day_1.rpy',
      order: '0000',
      visual: { position: { x: 0, y: 0 }, size: { width: 800, height: 600 } },
    },
  ],
  labels: [
    {
      id: 'label-start',
      file_id: 'file-day-1',
      parent_label_id: null,
      name: 'start',
      qualified_name: 'start',
      scope: 'global',
      label_start_node_id: 'label-start-node',
      source_span: { start_line: 0, end_line: 0 },
      visual: { position: { x: 48, y: 48 }, size: { width: 640, height: 420 } },
    },
  ],
  label_starts: [
    {
      id: 'label-start-node',
      file_id: 'file-day-1',
      label_id: 'label-start',
      qualified_name: 'start',
      content: 'label start:',
      visual: { position: { x: 32, y: 32 }, size: { width: 260, height: 72 } },
    },
  ],
  nodes: [
    {
      id: 'node-intro',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'dialogue',
      content: 'r "RenPy Mouse starts browser collaboration."',
      order: '0000',
      source_span: { start_line: 1, end_line: 1 },
      metadata: {},
      visual: { position: { x: 64, y: 136 }, size: { width: 360, height: 88 } },
    },
  ],
  edges: [],
  diagnostics: [],
  source_index: { files: {} },
};

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

test('canvas help and bug report links open by keyboard without publishing anything', async ({ page, context }) => {
  await context.route('https://github.com/**', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<p>Public destination intercepted for verification</p>',
  }));
  await page.goto(e2eUrl('/e2e/project-graph-input-stability.html'));
  const destinations = [
    'https://github.com/the-asind/RenPy-VisualEditor/blob/main/docs/quick-start.md',
    'https://github.com/the-asind/RenPy-VisualEditor/issues/new?template=bug_report.yml&title=%5BBug%5D%20',
  ];
  for (const destination of destinations) {
    const link = page.locator(`a[href="${destination}"]`);
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('rel', 'noreferrer');
    await link.focus();
    await expect(link).toBeFocused();
    const popupPromise = page.waitForEvent('popup');
    await page.keyboard.press('Enter');
    const popup = await popupPromise;
    await expect(popup).toHaveURL(destination);
    await popup.close();
  }
});

test('canvas context menu creates structure and safely explains blocked deletion references', async ({ page }) => {
  await page.goto(e2eUrl('/e2e/project-graph-input-stability.html'));
  await expect(page.locator('[data-id="node-reference"]')).toBeVisible();
  await page.locator('.react-flow__pane').click({ button: 'right', force: true, position: { x: 20, y: 680 } });

  const menu = page.getByRole('menu', { name: 'Create project structure' });
  await expect(menu.getByRole('menuitem', { name: 'Create file' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Create label' })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Create file' }).click();
  await menu.getByLabel("Ren'Py file path").fill('chapters/mouse_bonus');
  await menu.getByRole('button', { name: 'Create', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.projectGraphInputHarness!.latestGraph.files.some(
    (file) => file.path === 'chapters/mouse_bonus.rpy',
  ))).toBe(true);

  const startLabel = page.locator('.react-flow__node-labelFrame').filter({ hasText: 'start' }).first();
  await startLabel.click({ button: 'right', force: true, position: { x: 20, y: 20 } });
  await expect(page.getByRole('menuitem', { name: 'Create sublabel in start' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Create sublabel in start' }).click();
  await page.getByLabel('Label name').fill('cheese_cache');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const graph = window.projectGraphInputHarness!.latestGraph;
    const label = graph.labels.find((candidate) => candidate.qualified_name === 'start.cheese_cache');
    return Boolean(label && graph.nodes.some((node) => node.label_id === label.id && node.content === 'pass'));
  })).toBe(true);

  await page.locator('[data-id="node-action"]').click({ button: 'right', force: true, position: { x: 10, y: 10 } });
  await expect(page.getByRole('menuitem', { name: 'Delete node' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Delete node' }).click();
  await expect(page.getByRole('dialog', { name: 'Safe project deletion' })).toContainText('Confirm deletion');
  await page.getByRole('button', { name: 'Cancel' }).click();

  const dayTwoLabel = page.locator('.react-flow__node-labelFrame').filter({ hasText: 'day_two' }).first();
  await dayTwoLabel.click({ button: 'right', force: true, position: { x: 20, y: 20 } });
  await page.getByRole('menuitem', { name: 'Delete label' }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Safe project deletion' });
  await expect(deleteDialog).toContainText('Deletion blocked');
  await expect(deleteDialog).toContainText('jump day_two');
  await expect(deleteDialog.getByRole('button', { name: 'Delete permanently' })).toBeDisabled();
  await deleteDialog.getByRole('button', { name: 'Go to reference' }).click();
  await expect(page.locator('[data-id="node-reference"]')).toHaveClass(/selected/);
});

test('two browser contexts exchange ProjectGraph CRDT content and drag updates', async ({ browser }) => {
  const relay = await startRelayServer();
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.goto(e2eUrl('/e2e/project-graph-collaboration.html'));
  await pageB.goto(e2eUrl('/e2e/project-graph-collaboration.html'));

  const snapshot = await pageA.evaluate((initialGraph) => {
    return window.projectGraphHarness.createFromGraph(initialGraph.graph, '1', initialGraph.socketUrl);
  }, { graph, socketUrl: relay.url });
  await pageB.evaluate(({ initialSnapshot, socketUrl }) => {
    window.projectGraphHarness.createFromSnapshot(initialSnapshot, '2', socketUrl);
  }, { initialSnapshot: snapshot, socketUrl: relay.url });

  await pageA.evaluate(() => {
    window.projectGraphHarness.edit('node-intro', 'r "Browser A edits and Browser B sees it."');
    window.projectGraphHarness.move('label-start', { x: 144, y: 108 });
  });

  await expect(pageB.locator('#node-content')).toHaveText('r "Browser A edits and Browser B sees it."');
  await expect(pageB.locator('#label-position')).toHaveText('{"x":144,"y":108}');
  await expect(pageB.locator('#change-count')).toHaveText('2');

  relay.broadcastJson('{"type":"active_users","users":[]}');

  await expect(pageB.locator('#node-content')).toHaveText('r "Browser A edits and Browser B sees it."');
  await expect(pageB.locator('#label-position')).toHaveText('{"x":144,"y":108}');

  await pageA.evaluate(() => window.projectGraphHarness.close());
  await pageB.evaluate(() => window.projectGraphHarness.close());
  await contextA.close();
  await contextB.close();
  await relay.close();
});

test('scenario content editor does not roll back active local input during CRDT graph updates', async ({ page }) => {
  test.setTimeout(75_000);
  const inputText =
    'Мышонок Ренпи быстро печатает заметку про сырный лунный план без пропавших букв и внезапных откатов.';

  await page.addInitScript(() => {
    window.__projectGraphInputRollbacks = [];
    window.__projectGraphInputJankEnabled = false;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (!descriptor?.get || !descriptor.set) {
      throw new Error('HTMLTextAreaElement.value descriptor is unavailable');
    }

    Object.defineProperty(HTMLTextAreaElement.prototype, 'value', {
      configurable: true,
      get() {
        return descriptor.get!.call(this);
      },
      set(nextValue) {
        const before = descriptor.get!.call(this);
        descriptor.set!.call(this, nextValue);
        const after = String(nextValue);
        const isScenarioEditor = String(this.className).includes('project-graph-canvas__node-editor-input');
        if (
          window.__projectGraphInputJankEnabled &&
          isScenarioEditor &&
          document.activeElement === this &&
          after.length < before.length &&
          before.startsWith(after)
        ) {
          window.__projectGraphInputRollbacks?.push({
            after,
            before,
            t: Math.round(performance.now()),
          });
        }
      },
    });

    setInterval(() => {
      if (!window.__projectGraphInputJankEnabled) {
        return;
      }
      const end = performance.now() + 95;
      while (performance.now() < end) {
        // Intentionally emulate the frame stalls observed in DevTools during local typing.
      }
    }, 260);
  });

  await page.goto(e2eUrl('/e2e/project-graph-input-stability.html'));
  await page.getByRole('button', { name: 'Open node search' }).click();
  await page.getByLabel('Search nodes').fill('stable keyboard');
  await page.getByRole('button', { name: /stable keyboard/ }).click();

  const editor = page.getByLabel('Edit scenario node content');
  await editor.focus();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.evaluate(() => {
    window.__projectGraphInputJankEnabled = true;
  });
  await page.keyboard.type(inputText, { delay: 120 });
  await page.evaluate(() => {
    window.__projectGraphInputJankEnabled = false;
  });
  await expect(editor).toHaveValue(inputText);

  const rollbacks = await page.evaluate(() => window.__projectGraphInputRollbacks ?? []);
  expect(
    rollbacks.length,
    `Active scenario editor value rolled back during local typing: ${JSON.stringify(rollbacks.slice(0, 5))}`,
  ).toBe(0);
});

test('structural graph insertion preserves the mounted canvas and an editor opened on a lower node', async ({ page }) => {
  await page.goto(e2eUrl('/e2e/project-graph-input-stability.html'));
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Open node search' }).click();
  await page.getByLabel('Search nodes').fill('lower stable node');
  await page.getByRole('button', { name: /lower stable node/ }).click();
  await page.getByRole('button', { name: 'Open fullscreen action editor' }).click();
  await expect(page.getByRole('dialog', { name: 'Action editor' })).toBeVisible();
  await page.waitForTimeout(450);
  const writerInput = page.locator('.action-editor-writer__dialogue-input').first();
  await expect(writerInput).toBeVisible();
  await writerInput.fill('RenPy Mouse keeps this dirty collaborative draft.');
  await writerInput.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(18, 18);
  });
  const editorBody = page.locator('.action-editor__body');
  await editorBody.evaluate((element) => {
    element.scrollTop = 24;
  });

  await page.evaluate(() => {
    const typedWindow = window as typeof window & {
      __canvasBefore?: Element;
      __editorScrollBefore?: number;
      __viewportBefore?: string;
    };
    typedWindow.__canvasBefore = document.querySelector('.project-graph-canvas') ?? undefined;
    typedWindow.__editorScrollBefore = document.querySelector<HTMLElement>('.action-editor__body')?.scrollTop;
    typedWindow.__viewportBefore = document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform;
    window.projectGraphInputHarness?.insertAbove();
  });

  await expect.poll(() => page.evaluate(() => window.projectGraphInputHarness?.latestGraph.nodes.length ?? 0)).toBeGreaterThan(2);
  await expect(page.getByRole('dialog', { name: 'Action editor' })).toBeVisible();
  expect(
    await page.evaluate(() => {
      const typedWindow = window as typeof window & { __canvasBefore?: Element };
      return typedWindow.__canvasBefore === document.querySelector('.project-graph-canvas');
    }),
  ).toBe(true);
  const viewportTransforms = await page.evaluate(() => {
    const typedWindow = window as typeof window & { __viewportBefore?: string };
    return {
      after: document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform,
      before: typedWindow.__viewportBefore,
    };
  });
  expect(viewportTransforms.after).toBe(viewportTransforms.before);
  await expect(writerInput).toHaveValue('RenPy Mouse keeps this dirty collaborative draft.');
  expect(
    await writerInput.evaluate((element) => ({
      end: (element as HTMLTextAreaElement).selectionEnd,
      start: (element as HTMLTextAreaElement).selectionStart,
    })),
  ).toEqual({ start: 18, end: 18 });
  expect(
    await page.evaluate(() => {
      const typedWindow = window as typeof window & { __editorScrollBefore?: number };
      return document.querySelector<HTMLElement>('.action-editor__body')?.scrollTop === typedWindow.__editorScrollBefore;
    }),
  ).toBe(true);
});

test('Action Editor presence is anchored to its node and returns to canvas on close', async ({ page }) => {
  await page.goto(e2eUrl('/e2e/project-graph-input-stability.html'));
  await page.getByRole('button', { name: 'Open node search' }).click();
  await page.getByLabel('Search nodes').fill('lower stable node');
  await page.getByRole('button', { name: /lower stable node/ }).click();
  await page.getByRole('button', { name: 'Open fullscreen action editor' }).click();

  await expect.poll(() => page.evaluate(() => window.projectGraphInputHarness?.presenceEvents.at(-1))).toMatchObject({
    activity: 'editing_action',
    targetNodeId: 'node-lower-action',
  });

  await page.mouse.move(20, 20);
  await expect.poll(() => page.evaluate(() => window.projectGraphInputHarness?.presenceEvents.at(-1)?.activity)).toBe('editing_action');
  await page.getByRole('button', { name: 'Close action editor' }).click();
  await expect.poll(() => page.evaluate(() => window.projectGraphInputHarness?.presenceEvents.at(-1)?.activity)).toBe('viewing_canvas');
});

test('same ActionNode editor keeps remote line when local writer continues typing', async ({ page }) => {
  await page.goto(e2eUrl('/e2e/project-graph-input-stability.html'));
  await page.getByRole('button', { name: 'Open node search' }).click();
  await page.getByLabel('Search nodes').fill('stable keyboard');
  await page.getByRole('button', { name: /stable keyboard/ }).click();
  await page.getByRole('button', { name: 'Open fullscreen action editor' }).click();
  await expect(page.getByRole('dialog', { name: 'Action editor' })).toBeVisible();

  const writerInput = page.locator('.action-editor-writer__dialogue-input, .action-editor-writer__raw-input').first();
  await expect(writerInput).toBeVisible();
  await writerInput.fill('RenPy Mouse marks the attic.');

  await page.evaluate(() => {
    window.projectGraphInputHarness?.remoteSpliceAction({
      deleteCount: 0,
      index: 'RenPy Mouse waits for a stable keyboard.'.length,
      insertText: '\nr "Browser B marks the cellar."',
    });
  });

  await expect.poll(() =>
    page.evaluate(() => window.projectGraphInputHarness?.latestGraph.nodes.find((node) => node.id === 'node-action')?.content ?? ''),
  ).toContain('Browser B marks the cellar.');

  await writerInput.fill('RenPy Mouse marks the attic and keeps typing.');

  await expect
    .poll(() =>
      page.evaluate(
        () => window.projectGraphInputHarness?.latestGraph.nodes.find((node) => node.id === 'node-action')?.content ?? '',
      ),
    )
    .toContain('Browser B marks the cellar.');
  await expect
    .poll(() =>
      page.evaluate(
        () => window.projectGraphInputHarness?.latestGraph.nodes.find((node) => node.id === 'node-action')?.content ?? '',
      ),
    )
    .toContain('RenPy Mouse marks the attic and keeps typing.');
  await expect
    .poll(() => page.locator('textarea').evaluateAll((textareas) => textareas.map((textarea) => textarea.value)))
    .toContain('Browser B marks the cellar.');
  await expect(page.getByRole('dialog', { name: 'Action editor' })).toBeVisible();
});

test('canvas Action editor Next creates every scaffold, relation edge, and persisted graph update', async ({ page }) => {
  test.setTimeout(75_000);
  await page.goto(e2eUrl('/e2e/project-graph-input-stability.html'));

  const openSourceActionEditor = async () => {
    await page.getByRole('button', { name: 'Open node search' }).click();
    await page.getByLabel('Search nodes').fill('stable keyboard');
    await page.getByRole('button', { name: /stable keyboard/ }).click();
    await page.getByRole('button', { name: 'Open fullscreen action editor' }).click();
    await expect(page.getByRole('dialog', { name: 'Action editor' })).toBeVisible();
  };

  await openSourceActionEditor();
  await page.getByRole('button', { name: /Player Choice/ }).click();
  await page.getByLabel('Create player choice').getByLabel('Choice text').fill('Follow the cheese');
  await page.getByLabel('Create player choice').getByRole('button', { name: 'Create structure' }).click();
  await expect(page.getByRole('dialog', { name: 'Action editor' })).toHaveCount(0);

  await openSourceActionEditor();
  await page.getByRole('button', { name: /Conditional Path/ }).click();
  await page.getByLabel('Create conditional path').getByLabel('IF condition').fill('renpy_mouse_hungry');
  await page.getByLabel('Create conditional path').getByRole('button', { name: 'Create structure' }).click();
  await expect(page.getByRole('dialog', { name: 'Action editor' })).toHaveCount(0);

  await openSourceActionEditor();
  await page.getByRole('button', { name: /Go to Label/ }).click();
  await page.getByLabel('Choose jump target').getByRole('option', { name: /day_two/ }).click();
  await page.getByLabel('Choose jump target').getByRole('button', { name: 'Create jump' }).click();
  await expect(page.getByRole('dialog', { name: 'Action editor' })).toHaveCount(0);

  await openSourceActionEditor();
  await page.getByRole('button', { name: /Call Sub-scene/ }).click();
  await page.getByLabel('Choose call target').getByRole('option', { name: /day_two/ }).click();
  await page.getByLabel('Choose call target').getByRole('button', { name: 'Create call' }).click();
  await expect(page.getByRole('dialog', { name: 'Action editor' })).toHaveCount(0);

  await openSourceActionEditor();
  await page.getByRole('button', { name: /^Return/ }).click();
  await expect(page.getByRole('dialog', { name: 'Action editor' })).toHaveCount(0);

  await expect
    .poll(() =>
      page.evaluate(() => {
        const graph = window.projectGraphInputHarness?.latestGraph;
        const menu = graph?.nodes.find((candidate) => candidate.type === 'menu' && candidate.content === 'menu:');
        const conditional = graph?.nodes.find(
          (candidate) => candidate.type === 'if' && candidate.content === 'if renpy_mouse_hungry:',
        );
        const jump = graph?.nodes.find((candidate) => candidate.type === 'jump' && candidate.content === 'jump day_two');
        const call = graph?.nodes.find((candidate) => candidate.type === 'call' && candidate.content === 'call day_two');
        const returnNode = graph?.nodes.find((candidate) => candidate.type === 'return' && candidate.content === 'return');
        const jumpEdge = jump ? graph?.edges.find((candidate) => candidate.source_node_id === jump.id) : undefined;
        const callEdge = call ? graph?.edges.find((candidate) => candidate.source_node_id === call.id) : undefined;
        return {
          callEdgeKind: callEdge?.kind,
          callEdgeTarget: callEdge?.target_node_id,
          conditionalChildren: conditional
            ? graph?.nodes.filter((candidate) => candidate.parent_node_id === conditional.id).map((candidate) => candidate.type)
            : [],
          jumpEdgeKind: jumpEdge?.kind,
          jumpEdgeTarget: jumpEdge?.target_node_id,
          menuChildren: menu
            ? graph?.nodes.filter((candidate) => candidate.parent_node_id === menu.id).map((candidate) => candidate.type)
            : [],
          returnHasEdge: returnNode
            ? graph?.edges.some((candidate) => candidate.source_node_id === returnNode.id)
            : null,
          topLevelTypes: graph?.nodes
            .filter((candidate) => candidate.label_id === 'label-start' && candidate.parent_node_id === null)
            .map((candidate) => candidate.type),
        };
      }),
    )
    .toMatchObject({
      callEdgeKind: 'call',
      callEdgeTarget: 'label-day-two-node',
      conditionalChildren: ['action'],
      jumpEdgeKind: 'jump',
      jumpEdgeTarget: 'label-day-two-node',
      menuChildren: ['menu_choice'],
      returnHasEdge: false,
      topLevelTypes: expect.arrayContaining(['action', 'menu', 'if', 'jump', 'call', 'return']),
    });

  await expect.poll(() => page.evaluate(() => window.projectGraphInputHarness?.snapshots ?? 0)).toBeGreaterThan(0);
});

test('canvas export UX shows status, returned filenames, and normalized content', async ({ page }) => {
  await page.goto(e2eUrl('/e2e/project-graph-export-ux.html'));

  await page.getByRole('button', { name: 'Export project' }).click();
  await expect(page.getByText('Exporting...')).toBeVisible();

  await page.evaluate(() => window.resolveExport?.());

  const exportResults = page.locator('.project-graph-canvas__export-results');
  await expect(page.getByText('Exported 2 file(s).')).toBeVisible();
  await expect(exportResults.getByText('renpy_mouse_day_1.rpy')).toBeVisible();
  await expect(exportResults.getByText('renpy_mouse_day_2.rpy')).toBeVisible();
  await expect(exportResults.getByText('label start:')).toBeVisible();
  await expect(exportResults.getByText('r "RenPy Mouse previews exported files."')).toBeVisible();

  await page.close();
});

test('offscreen remote cursors cannot expand the client document', async ({ page }) => {
  await page.goto(e2eUrl('/e2e/project-graph-export-ux.html'));

  await expect(page.locator('.project-graph-canvas__remote-cursor')).toHaveCount(2);
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )).toBeLessThanOrEqual(16);
});

test('canvas export shortcut works with a localized key value', async ({ page }) => {
  await page.goto(e2eUrl('/e2e/project-graph-export-ux.html'));

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      code: 'KeyE',
      ctrlKey: true,
      key: 'у',
      shiftKey: true,
    }));
  });
  await expect(page.getByText('Exporting...')).toBeVisible();

  await page.evaluate(() => window.resolveExport?.());
  await expect(page.getByText('Exported 2 file(s).')).toBeVisible();

  await page.close();
});

test('canvas renders readable zoomed-out frame titles, compact flow controls, and code-only file inspector', async ({ page }) => {
  await page.goto(e2eUrl('/e2e/project-graph-export-ux.html'));

  const jumpNode = page.locator('.pg-node--scenario[data-scenario-type="jump"]').first();
  const callNode = page.locator('.pg-node--scenario[data-scenario-type="call"]').first();
  const returnNode = page.locator('.pg-node--scenario[data-scenario-type="return"]').first();
  await expect(jumpNode).toBeVisible();
  await expect(callNode).toBeVisible();
  await expect(returnNode).toBeVisible();

  for (const node of [jumpNode, callNode, returnNode]) {
    await expect(node.locator('.pg-node__body')).toHaveCount(0);
    const box = await node.boundingBox();
    expect(box?.height ?? 999).toBeLessThanOrEqual(50);
  }

  const [jumpBackground, callBackground, returnBackground] = await Promise.all(
    [jumpNode, callNode, returnNode].map((node) =>
      node.evaluate((element) => window.getComputedStyle(element).backgroundColor),
    ),
  );
  expect(jumpBackground).not.toBe(callBackground);
  expect(callBackground).not.toBe(returnBackground);
  expect(returnBackground).not.toBe(jumpBackground);

  const fileTitle = page.locator('.pg-node--file .pg-node__title', { hasText: 'renpy_mouse_day_1.rpy' }).first();
  await expect(fileTitle).toBeVisible();
  const fontSizeBefore = await fileTitle.evaluate((element) => Number.parseFloat(window.getComputedStyle(element).fontSize));
  for (let index = 0; index < 12; index += 1) {
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await page.waitForTimeout(170);
  }
  const fontSizeAfter = await fileTitle.evaluate((element) => Number.parseFloat(window.getComputedStyle(element).fontSize));
  expect(fontSizeAfter).toBeGreaterThan(fontSizeBefore * 1.6);

  await page.getByRole('button', { name: 'Frames' }).click();
  await page.getByRole('button', { name: 'gui.rpy file' }).click();
  const codeOnlyFrame = page.locator('.pg-node--file[data-code-only-file="true"]').first();
  await expect(codeOnlyFrame).toContainText('gui.init');
  await codeOnlyFrame.locator('.pg-node__code-only-content').click();

  await expect(page.getByRole('dialog', { name: 'Action editor' })).toBeVisible();
  await expect(page.locator('.action-editor__raw-codemirror')).toBeVisible();
  await expect(page.locator('.action-editor__raw-codemirror')).toHaveAttribute(
    'data-raw-renpy-content',
    /gui\.init\(1920, 1080\)/,
  );

  await page.close();
});

test('canvas top-right actions use dismissible search and invite popovers', async ({ page }) => {
  await page.goto(e2eUrl('/e2e/project-graph-export-ux.html'));

  const searchButton = page.getByRole('button', { name: 'Open node search' });
  await expect(searchButton).toBeVisible();
  await searchButton.click();
  await expect(page.getByLabel('Search nodes')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Search nodes')).toBeHidden();

  await page.getByRole('button', { name: 'Invite people' }).click();
  await expect(page.getByText('Invite people', { exact: true })).toBeVisible();
  await page.getByPlaceholder('teammate@example.com').fill('writer@example.com');
  await page.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByText('Invite people', { exact: true })).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.lastInviteTarget)).toBe('writer@example.com');

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  await expect(page.getByLabel('Search nodes')).toBeVisible();
  await page.mouse.click(100, 160);
  await expect(page.getByLabel('Search nodes')).toBeHidden();

  await page.close();
});

const startRelayServer = async (): Promise<{
  url: string;
  broadcastJson: (payload: string) => void;
  close: () => Promise<void>;
}> => {
  const server = new WebSocketServer({ port: 0 });

  server.on('connection', (socket) => {
    socket.on('message', (data, isBinary) => {
      for (const peer of server.clients) {
        if (peer !== socket && peer.readyState === peer.OPEN) {
          peer.send(data, { binary: isBinary });
        }
      }
    });
  });

  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Playwright relay server did not bind to a TCP port');
  }

  return {
    url: `ws://127.0.0.1:${address.port}`,
    broadcastJson(payload: string) {
      for (const client of server.clients) {
        if (client.readyState === client.OPEN) {
          client.send(payload, { binary: false });
        }
      }
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
};

const e2eUrl = (path: string): string => new URL(path, e2eBaseUrl).toString();
