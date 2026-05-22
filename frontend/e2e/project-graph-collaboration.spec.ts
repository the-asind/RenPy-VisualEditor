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
    resolveExport?: () => void;
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

test.beforeAll(async () => {
  viteServer = await createServer({
    server: {
      host: '127.0.0.1',
      port: 5175,
      strictPort: true,
    },
  });
  await viteServer.listen();
});

test.afterAll(async () => {
  await viteServer?.close();
  viteServer = null;
});

test('two browser contexts exchange ProjectGraph CRDT content and drag updates', async ({ browser }) => {
  const relay = await startRelayServer();
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.goto('/e2e/project-graph-collaboration.html');
  await pageB.goto('/e2e/project-graph-collaboration.html');

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

test('canvas export UX shows status, returned filenames, and normalized content', async ({ page }) => {
  await page.goto('/e2e/project-graph-export-ux.html');

  await page.getByRole('button', { name: 'Export' }).click();
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
