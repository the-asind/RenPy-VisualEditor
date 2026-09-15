import {
  exportProjectGraphCrdtSnapshot,
  exportProjectGraphCrdtUpdate,
  getProjectGraphCrdtVersion,
  importProjectGraphCrdtUpdate,
  insertProjectGraphNextScenario,
  createProjectGraphStructure,
  moveProjectGraphEntities,
  moveProjectGraphEntity,
  replaceProjectGraphDiagnostics,
  spliceScenarioNodeContent,
  updateScenarioNodeContent,
  updateScenarioNodeMetadata,
  updateSourceFileContent,
  type InsertProjectGraphNextScenarioOptions,
  type InsertProjectGraphNextScenarioResult,
  type CreateProjectGraphStructureOptions,
  type CreateProjectGraphStructureResult,
  type ProjectGraphEntityPositionChange,
  type ProjectGraphCrdtDoc,
  type ProjectGraphScenarioTextSplice,
} from './projectGraphCrdt';
import type { GraphDiagnosticSnapshot, GraphPoint, ProjectGraphSnapshot } from './projectGraphProjection';
import {
  ProjectGraphReadModel,
  type ProjectGraphReadModelStats,
  type ProjectGraphReadModelUpdate,
} from './projectGraphReadModel';

export type ProjectGraphPersistenceStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface ProjectGraphCollaborationSessionOptions {
  sendUpdate?: (update: Uint8Array) => void;
  persistSnapshot?: (snapshot: Uint8Array) => void | Promise<void>;
  persistDebounceMs?: number;
  onPersistenceStatusChange?: (status: ProjectGraphPersistenceStatus) => void;
  incrementalReadModel?: boolean;
  onGraphChange?: (graph: ProjectGraphSnapshot, readUpdate: ProjectGraphReadModelUpdate) => void;
}

export class ProjectGraphCollaborationSession {
  private version;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pendingUpdates: Uint8Array[] = [];
  private readonly readModel: ProjectGraphReadModel;

  constructor(
    private readonly doc: ProjectGraphCrdtDoc,
    private readonly options: ProjectGraphCollaborationSessionOptions = {},
  ) {
    this.version = getProjectGraphCrdtVersion(doc);
    this.readModel = new ProjectGraphReadModel(doc, {
      enabled: options.incrementalReadModel ?? true,
    });
  }

  get graph(): ProjectGraphSnapshot {
    return this.readModel.graph;
  }

  get readModelStats(): ProjectGraphReadModelStats {
    return this.readModel.stats;
  }

  get pendingUpdateCount(): number {
    return this.pendingUpdates.length;
  }

  resendPendingUpdates(): void {
    for (const update of this.pendingUpdates) {
      this.options.sendUpdate?.(update.slice());
    }
  }

  editScenarioContent(nodeId: string, content: string): void {
    const from = this.version;
    updateScenarioNodeContent(this.doc, nodeId, content);
    this.publishLocalChange(from);
  }

  applyScenarioTextSplice(edit: ProjectGraphScenarioTextSplice): void {
    const from = this.version;
    spliceScenarioNodeContent(this.doc, edit);
    this.publishLocalChange(from);
  }

  editScenarioMetadata(nodeId: string, metadataPatch: Record<string, unknown>): void {
    const from = this.version;
    updateScenarioNodeMetadata(this.doc, nodeId, metadataPatch);
    this.publishLocalChange(from);
  }

  editSourceFileContent(fileId: string, content: string): void {
    const from = this.version;
    updateSourceFileContent(this.doc, fileId, content);
    this.publishLocalChange(from);
  }

  insertNextScenario(
    options: Omit<InsertProjectGraphNextScenarioOptions, 'idFactory'>,
  ): InsertProjectGraphNextScenarioResult {
    const from = this.version;
    const result = insertProjectGraphNextScenario(this.doc, options);
    this.publishLocalChange(from);
    return result;
  }

  createStructure(
    options: Omit<CreateProjectGraphStructureOptions, 'idFactory'>,
  ): CreateProjectGraphStructureResult {
    const from = this.version;
    const result = createProjectGraphStructure(this.doc, options);
    this.publishLocalChange(from);
    return result;
  }

  replaceDiagnostics(diagnostics: GraphDiagnosticSnapshot[]): void {
    const from = this.version;
    replaceProjectGraphDiagnostics(this.doc, diagnostics);
    this.publishLocalChange(from);
  }

  moveEntity(entityId: string, position: GraphPoint): void {
    const from = this.version;
    moveProjectGraphEntity(this.doc, entityId, position);
    this.publishLocalChange(from);
  }

  moveEntities(changes: ProjectGraphEntityPositionChange[]): void {
    if (changes.length === 0) {
      return;
    }

    const from = this.version;
    moveProjectGraphEntities(this.doc, changes);
    this.publishLocalChange(from);
  }

  receiveRemoteUpdate(update: Uint8Array): void {
    importProjectGraphCrdtUpdate(this.doc, update);
    const pendingIndex = this.pendingUpdates.findIndex((pending) =>
      pending.byteLength === update.byteLength && pending.every((byte, index) => byte === update[index]),
    );
    if (pendingIndex >= 0) {
      this.pendingUpdates.splice(pendingIndex, 1);
    }
    this.version = getProjectGraphCrdtVersion(this.doc);
    this.emitGraphChange();
    this.persistCurrentSnapshot();
  }

  applyAuthoritativeUpdate(update: Uint8Array): void {
    importProjectGraphCrdtUpdate(this.doc, update);
    this.version = getProjectGraphCrdtVersion(this.doc);
    this.emitGraphChange();
  }

  exportSnapshot(): Uint8Array {
    return exportProjectGraphCrdtSnapshot(this.doc);
  }

  dispose(): void {
    this.readModel.dispose();
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
      void this.flushSnapshotPersistence();
    }
  }

  private publishLocalChange(from: ReturnType<typeof getProjectGraphCrdtVersion>): void {
    const update = exportProjectGraphCrdtUpdate(this.doc, from);
    this.version = getProjectGraphCrdtVersion(this.doc);
    if (update.byteLength > 0) {
      this.pendingUpdates.push(update.slice());
      this.options.sendUpdate?.(update);
    }
    this.emitGraphChange();
    this.persistCurrentSnapshot();
  }

  private emitGraphChange(): void {
    const readUpdate = this.readModel.flush();
    this.options.onGraphChange?.(readUpdate.graph, readUpdate);
  }

  private persistCurrentSnapshot(): void {
    if (!this.options.persistSnapshot) {
      return;
    }

    const debounceMs = this.options.persistDebounceMs ?? 0;
    this.options.onPersistenceStatusChange?.('saving');

    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }

    if (debounceMs <= 0) {
      void this.flushSnapshotPersistence();
      return;
    }

    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.flushSnapshotPersistence();
    }, debounceMs);
  }

  private async flushSnapshotPersistence(): Promise<void> {
    try {
      await this.options.persistSnapshot?.(this.exportSnapshot());
      this.options.onPersistenceStatusChange?.('saved');
    } catch (error) {
      this.options.onPersistenceStatusChange?.('error');
    }
  }
}

export interface ProjectGraphSocketLike {
  binaryType: BinaryType;
  readyState: number;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void;
  close(): void;
}

export interface ProjectGraphSocketHandle {
  sendBinary(update: Uint8Array): void;
  sendJson(message: Record<string, unknown>): void;
  close(): void;
}

export interface ProjectGraphPresenceUser {
  id: string;
  username: string;
  connectedAt?: string;
}

export type ProjectGraphPresenceActivity = 'viewing_canvas' | 'editing_action' | 'editing_source_file';

export interface ProjectGraphRemoteCursor {
  userId: string;
  username: string;
  position: GraphPoint;
  activity?: ProjectGraphPresenceActivity;
  targetNodeId?: string;
}

export const retainActiveProjectGraphRemoteCursors = (
  cursorsByUserId: Record<string, ProjectGraphRemoteCursor>,
  activeUsers: ProjectGraphPresenceUser[],
): Record<string, ProjectGraphRemoteCursor> => {
  const activeUserIds = new Set(activeUsers.map((user) => user.id));
  return Object.fromEntries(
    Object.entries(cursorsByUserId).filter(([userId]) => activeUserIds.has(userId)),
  );
};

export interface ProjectGraphSocketOptions {
  url: string;
  authToken?: string;
  onUpdate: (update: Uint8Array) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onPresenceUsers?: (users: ProjectGraphPresenceUser[]) => void;
  onRemoteCursor?: (cursor: ProjectGraphRemoteCursor) => void;
  WebSocketImpl?: {
    new (url: string): ProjectGraphSocketLike;
    OPEN: number;
  };
}

export const toProjectGraphWebSocketUrl = (apiBaseUrl: string, projectId: string): string => {
  const apiUrl = new URL(apiBaseUrl);
  apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  const apiPrefix = apiUrl.pathname.replace(/\/$/, '');
  apiUrl.pathname = `${apiPrefix}/ws/project/${encodeURIComponent(projectId)}`;
  apiUrl.search = '';
  return apiUrl.toString();
};

const normalizePresenceUsers = (users: unknown): ProjectGraphPresenceUser[] =>
  Array.isArray(users)
    ? users
        .map((user) => {
          if (!user || typeof user !== 'object') {
            return null;
          }
          const raw = user as Record<string, unknown>;
          const id = typeof raw.id === 'string' ? raw.id : typeof raw.userId === 'string' ? raw.userId : null;
          const username =
            typeof raw.username === 'string'
              ? raw.username
              : typeof raw.userName === 'string'
                ? raw.userName
                : 'Unknown';
          if (!id) {
            return null;
          }
          return {
            id,
            username,
            connectedAt: typeof raw.connected_at === 'string' ? raw.connected_at : undefined,
          };
        })
        .filter((user): user is ProjectGraphPresenceUser => user !== null)
    : [];

const normalizePresenceActivity = (activity: unknown): ProjectGraphPresenceActivity | undefined => {
  if (activity === 'viewing canvas') {
    return 'viewing_canvas';
  }
  return activity === 'viewing_canvas' || activity === 'editing_action' || activity === 'editing_source_file'
    ? activity
    : undefined;
};

const normalizeRemoteCursor = (message: Record<string, unknown>): ProjectGraphRemoteCursor | null => {
  const userId =
    typeof message.userId === 'string'
      ? message.userId
      : typeof message.user_id === 'string'
        ? message.user_id
        : typeof message.id === 'string'
          ? message.id
          : null;
  const x = typeof message.x === 'number' ? message.x : null;
  const y = typeof message.y === 'number' ? message.y : null;

  if (!userId || x === null || y === null) {
    return null;
  }

  const activity = normalizePresenceActivity(message.activity);
  const targetNodeId =
    activity === 'editing_action' || activity === 'editing_source_file'
      ? typeof message.targetNodeId === 'string'
        ? message.targetNodeId
        : typeof message.target_node_id === 'string'
          ? message.target_node_id
          : undefined
      : undefined;

  return {
    userId,
    username:
      typeof message.username === 'string'
        ? message.username
        : typeof message.userName === 'string'
          ? message.userName
          : 'Unknown',
    position: { x, y },
    ...(activity ? { activity } : {}),
    ...(targetNodeId ? { targetNodeId } : {}),
  };
};

export const connectProjectGraphCollaborationSocket = ({
  url,
  authToken,
  onUpdate,
  onOpen,
  onClose,
  onPresenceUsers,
  onRemoteCursor,
  WebSocketImpl = WebSocket,
}: ProjectGraphSocketOptions): ProjectGraphSocketHandle => {
  const socket = new WebSocketImpl(url);
  socket.binaryType = 'arraybuffer';

  socket.addEventListener('open', () => {
    if (authToken) {
      socket.send(JSON.stringify({ type: 'auth', token: authToken }));
    }
    onOpen?.();
  });

  socket.addEventListener('close', () => {
    onClose?.();
  });

  socket.addEventListener('message', (event) => {
    if (event.data instanceof ArrayBuffer) {
      onUpdate(new Uint8Array(event.data));
    } else if (ArrayBuffer.isView(event.data)) {
      onUpdate(new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength));
    } else if (event.data instanceof Blob) {
      void event.data.arrayBuffer().then((buffer) => onUpdate(new Uint8Array(buffer)));
    } else if (typeof event.data === 'string') {
      try {
        const message = JSON.parse(event.data) as Record<string, unknown>;
        if (message.type === 'active_users') {
          onPresenceUsers?.(normalizePresenceUsers(message.users));
        } else if (message.type === 'cursor_update') {
          const cursor = normalizeRemoteCursor(message);
          if (cursor) {
            onRemoteCursor?.(cursor);
          }
        }
      } catch {
        // Presence frames are best-effort and must not affect CRDT state.
      }
    }
  });

  return {
    sendBinary(update: Uint8Array) {
      if (socket.readyState === WebSocketImpl.OPEN) {
        socket.send(update);
      }
    },
    sendJson(message: Record<string, unknown>) {
      if (socket.readyState === WebSocketImpl.OPEN) {
        socket.send(JSON.stringify(message));
      }
    },
    close() {
      socket.close();
    },
  };
};
