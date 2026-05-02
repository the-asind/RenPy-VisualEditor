import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ProjectGraphCollaborationSession,
  connectProjectGraphCollaborationSocket,
  toProjectGraphWebSocketUrl,
} from '../projectGraphCollaboration';
import {
  createProjectGraphCrdtDoc,
  exportProjectGraphCrdtSnapshot,
  importProjectGraphCrdtSnapshot,
  projectGraphFromCrdtDoc,
} from '../projectGraphCrdt';
import { projectGraphToReactFlow, type ProjectGraphSnapshot } from '../projectGraphProjection';

const graph: ProjectGraphSnapshot = {
  project_id: 'sprint-7-project',
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
      content: 'r "RenPy Mouse starts sprint seven."',
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

describe('ProjectGraphCollaborationSession', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends CRDT updates for content edits, applies them on a peer, and persists reloadable snapshots', () => {
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const clientB = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(clientA), { peerId: '2' });
    const sentUpdates: Uint8Array[] = [];
    const persistedSnapshots: Uint8Array[] = [];
    const peerGraphs: ProjectGraphSnapshot[] = [];

    const sessionA = new ProjectGraphCollaborationSession(clientA, {
      sendUpdate: (update) => sentUpdates.push(update),
      persistSnapshot: (snapshot) => persistedSnapshots.push(snapshot),
    });
    const sessionB = new ProjectGraphCollaborationSession(clientB, {
      onGraphChange: (updatedGraph) => peerGraphs.push(updatedGraph),
    });

    sessionA.editScenarioContent('node-intro', 'r "RenPy Mouse edits through Loro."');
    sessionB.receiveRemoteUpdate(sentUpdates[0]);

    expect(sentUpdates).toHaveLength(1);
    expect(sentUpdates[0].byteLength).toBeGreaterThan(0);
    expect(persistedSnapshots).toHaveLength(1);
    expect(sessionB.graph.nodes.find((node) => node.id === 'node-intro')?.content).toBe(
      'r "RenPy Mouse edits through Loro."',
    );
    expect(peerGraphs.at(-1)?.nodes.find((node) => node.id === 'node-intro')?.content).toBe(
      'r "RenPy Mouse edits through Loro."',
    );

    const reloadedDoc = importProjectGraphCrdtSnapshot(persistedSnapshots[0], { peerId: '3' });
    expect(projectGraphFromCrdtDoc(reloadedDoc).nodes.find((node) => node.id === 'node-intro')?.content).toBe(
      'r "RenPy Mouse edits through Loro."',
    );
  });

  it('converges edit and drag operations across two clients and persists remote imports too', () => {
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const clientB = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(clientA), { peerId: '2' });
    const updatesFromA: Uint8Array[] = [];
    const updatesFromB: Uint8Array[] = [];
    const snapshotsFromA: Uint8Array[] = [];
    const snapshotsFromB: Uint8Array[] = [];
    const sessionA = new ProjectGraphCollaborationSession(clientA, {
      sendUpdate: (update) => updatesFromA.push(update),
      persistSnapshot: (snapshot) => snapshotsFromA.push(snapshot),
    });
    const sessionB = new ProjectGraphCollaborationSession(clientB, {
      sendUpdate: (update) => updatesFromB.push(update),
      persistSnapshot: (snapshot) => snapshotsFromB.push(snapshot),
    });

    sessionA.editScenarioContent('node-intro', 'r "Client A changes the line."');
    sessionB.receiveRemoteUpdate(updatesFromA[0]);
    sessionB.moveEntity('label-start', { x: 120, y: 96 });
    sessionA.receiveRemoteUpdate(updatesFromB[0]);

    expect(sessionA.graph).toEqual(sessionB.graph);
    expect(sessionA.graph.nodes.find((node) => node.id === 'node-intro')?.content).toBe(
      'r "Client A changes the line."',
    );
    expect(sessionA.graph.labels.find((label) => label.id === 'label-start')?.visual.position).toEqual({
      x: 120,
      y: 96,
    });
    expect(snapshotsFromA.length).toBeGreaterThanOrEqual(2);
    expect(snapshotsFromB.length).toBeGreaterThanOrEqual(2);
  });

  it('projects CRDT content and drag changes into the React Flow canvas model', () => {
    const session = new ProjectGraphCollaborationSession(createProjectGraphCrdtDoc(graph, { peerId: '1' }));

    session.editScenarioContent('node-intro', 'r "Projection reads the edited CRDT line."');
    session.moveEntity('node-intro', { x: 180, y: 220 });

    const projection = projectGraphToReactFlow(session.graph);
    const projectedNode = projection.nodes.find((node) => node.id === 'node-intro');

    expect(projectedNode).toMatchObject({
      type: 'scenarioNode',
      position: { x: 180, y: 220 },
      data: {
        kind: 'scenario',
        content: 'r "Projection reads the edited CRDT line."',
      },
    });
  });

  it('debounces snapshot persistence while keeping the final content and position reloadable', async () => {
    vi.useFakeTimers();
    const persistedSnapshots: Uint8Array[] = [];
    const persistenceStates: string[] = [];
    const session = new ProjectGraphCollaborationSession(createProjectGraphCrdtDoc(graph, { peerId: '1' }), {
      persistDebounceMs: 50,
      persistSnapshot: async (snapshot) => {
        persistedSnapshots.push(snapshot);
      },
      onPersistenceStatusChange: (status) => persistenceStates.push(status),
    });

    session.editScenarioContent('node-intro', 'r "First fast edit."');
    session.editScenarioContent('node-intro', 'r "Final debounced edit."');
    session.moveEntity('label-start', { x: 188, y: 144 });

    expect(persistedSnapshots).toHaveLength(0);
    expect(persistenceStates.at(-1)).toBe('saving');

    await vi.advanceTimersByTimeAsync(49);
    expect(persistedSnapshots).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(persistedSnapshots).toHaveLength(1);
    expect(persistenceStates.at(-1)).toBe('saved');

    const reloaded = projectGraphFromCrdtDoc(importProjectGraphCrdtSnapshot(persistedSnapshots[0], { peerId: '3' }));
    expect(reloaded.nodes.find((node) => node.id === 'node-intro')?.content).toBe('r "Final debounced edit."');
    expect(reloaded.labels.find((label) => label.id === 'label-start')?.visual.position).toEqual({
      x: 188,
      y: 144,
    });
  });

  it('reports persistence errors after a debounced save fails', async () => {
    vi.useFakeTimers();
    const persistenceStates: string[] = [];
    const session = new ProjectGraphCollaborationSession(createProjectGraphCrdtDoc(graph, { peerId: '1' }), {
      persistDebounceMs: 20,
      persistSnapshot: async () => {
        throw new Error('snapshot write failed');
      },
      onPersistenceStatusChange: (status) => persistenceStates.push(status),
    });

    session.editScenarioContent('node-intro', 'r "This save will fail."');
    await vi.advanceTimersByTimeAsync(20);

    expect(persistenceStates).toEqual(['saving', 'error']);
  });

  it('lets a disconnected client recover the latest graph from the debounced snapshot without duplicate entities', async () => {
    vi.useFakeTimers();
    const persistedSnapshots: Uint8Array[] = [];
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const sessionA = new ProjectGraphCollaborationSession(clientA, {
      persistDebounceMs: 25,
      persistSnapshot: async (snapshot) => {
        persistedSnapshots.push(snapshot);
      },
    });

    sessionA.editScenarioContent('node-intro', 'r "Client B catches up after reload."');
    sessionA.moveEntity('label-start', { x: 222, y: 166 });
    await vi.advanceTimersByTimeAsync(25);

    const reconnectedClientB = importProjectGraphCrdtSnapshot(persistedSnapshots.at(-1)!, { peerId: '2' });
    const reconnectedGraph = projectGraphFromCrdtDoc(reconnectedClientB);

    expect(reconnectedGraph.nodes.find((node) => node.id === 'node-intro')?.content).toBe(
      'r "Client B catches up after reload."',
    );
    expect(reconnectedGraph.labels.find((label) => label.id === 'label-start')?.visual.position).toEqual({
      x: 222,
      y: 166,
    });
    expect(new Set(reconnectedGraph.files.map((file) => file.id))).toHaveProperty('size', graph.files.length);
    expect(new Set(reconnectedGraph.labels.map((label) => label.id))).toHaveProperty('size', graph.labels.length);
    expect(new Set(reconnectedGraph.label_starts.map((start) => start.id))).toHaveProperty(
      'size',
      graph.label_starts.length,
    );
    expect(new Set(reconnectedGraph.nodes.map((node) => node.id))).toHaveProperty('size', graph.nodes.length);
  });
});

describe('ProjectGraph collaboration WebSocket helpers', () => {
  it('builds the project WebSocket URL from the API base URL', () => {
    expect(toProjectGraphWebSocketUrl('https://editor.example.test/api', 'project 1', 'token+value')).toBe(
      'wss://editor.example.test/api/ws/project/project%201?token=token%2Bvalue',
    );
  });

  it('receives ArrayBuffer binary messages and sends Uint8Array payloads without JSON wrapping', () => {
    const received: Uint8Array[] = [];
    const socket = connectProjectGraphCollaborationSocket({
      url: 'ws://example.test/ws/project/sprint-7',
      WebSocketImpl: FakeWebSocket,
      onUpdate: (update) => received.push(update),
    });
    const instance = FakeWebSocket.instances[0];
    const outbound = new Uint8Array([9, 8, 7]);

    instance.emitMessage(new Uint8Array([1, 2, 3]).buffer);
    instance.emitMessage('{"type":"active_users","users":[]}');
    socket.sendBinary(outbound);

    expect(instance.binaryType).toBe('arraybuffer');
    expect(received).toHaveLength(1);
    expect([...received[0]]).toEqual([1, 2, 3]);
    expect(instance.sent).toEqual([outbound]);
  });

  it('relays content and drag CRDT updates between two browser-like project clients', () => {
    RelayWebSocket.reset();
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const clientB = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(clientA), { peerId: '2' });
    const peerGraphs: ProjectGraphSnapshot[] = [];

    const sessionB = new ProjectGraphCollaborationSession(clientB, {
      onGraphChange: (updatedGraph) => peerGraphs.push(updatedGraph),
    });
    const socketB = connectProjectGraphCollaborationSocket({
      url: 'ws://example.test/ws/project/sprint-9',
      WebSocketImpl: RelayWebSocket,
      onUpdate: (update) => sessionB.receiveRemoteUpdate(update),
    });

    const socketA = connectProjectGraphCollaborationSocket({
      url: 'ws://example.test/ws/project/sprint-9',
      WebSocketImpl: RelayWebSocket,
      onUpdate: () => undefined,
    });
    const sessionA = new ProjectGraphCollaborationSession(clientA, {
      sendUpdate: (update) => socketA.sendBinary(update),
    });

    sessionA.editScenarioContent('node-intro', 'r "Browser A edits and Browser B sees it."');
    sessionA.moveEntity('label-start', { x: 144, y: 108 });
    RelayWebSocket.emitJson('ws://example.test/ws/project/sprint-9', '{"type":"active_users","users":[]}');

    expect(sessionB.graph.nodes.find((node) => node.id === 'node-intro')?.content).toBe(
      'r "Browser A edits and Browser B sees it."',
    );
    expect(sessionB.graph.labels.find((label) => label.id === 'label-start')?.visual.position).toEqual({
      x: 144,
      y: 108,
    });
    expect(peerGraphs).toHaveLength(2);

    socketA.close();
    socketB.close();
  });
});

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];
  binaryType: BinaryType = 'blob';
  readyState = FakeWebSocket.OPEN;
  sent: unknown[] = [];
  private readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  emitMessage(data: unknown): void {
    for (const listener of this.listeners.get('message') ?? []) {
      listener({ data } as MessageEvent);
    }
  }
}

class RelayWebSocket {
  static readonly OPEN = 1;
  private static readonly rooms = new Map<string, Set<RelayWebSocket>>();
  binaryType: BinaryType = 'blob';
  readyState = RelayWebSocket.OPEN;
  private readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  constructor(readonly url: string) {
    RelayWebSocket.rooms.set(url, new Set([...(RelayWebSocket.rooms.get(url) ?? []), this]));
  }

  static reset(): void {
    RelayWebSocket.rooms.clear();
  }

  static emitJson(url: string, data: string): void {
    for (const socket of RelayWebSocket.rooms.get(url) ?? []) {
      socket.emitMessage(data);
    }
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: Uint8Array): void {
    for (const socket of RelayWebSocket.rooms.get(this.url) ?? []) {
      if (socket !== this) {
        socket.emitMessage(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      }
    }
  }

  close(): void {
    this.readyState = 3;
    RelayWebSocket.rooms.get(this.url)?.delete(this);
  }

  private emitMessage(data: unknown): void {
    for (const listener of this.listeners.get('message') ?? []) {
      listener({ data } as MessageEvent);
    }
  }
}
