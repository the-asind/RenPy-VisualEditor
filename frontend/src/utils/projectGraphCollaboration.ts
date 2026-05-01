import {
  exportProjectGraphCrdtSnapshot,
  exportProjectGraphCrdtUpdate,
  getProjectGraphCrdtVersion,
  importProjectGraphCrdtUpdate,
  moveProjectGraphEntity,
  projectGraphFromCrdtDoc,
  updateScenarioNodeContent,
  type ProjectGraphCrdtDoc,
} from './projectGraphCrdt';
import type { GraphPoint, ProjectGraphSnapshot } from './projectGraphProjection';

export interface ProjectGraphCollaborationSessionOptions {
  sendUpdate?: (update: Uint8Array) => void;
  persistSnapshot?: (snapshot: Uint8Array) => void;
  onGraphChange?: (graph: ProjectGraphSnapshot) => void;
}

export class ProjectGraphCollaborationSession {
  private version;

  constructor(
    private readonly doc: ProjectGraphCrdtDoc,
    private readonly options: ProjectGraphCollaborationSessionOptions = {},
  ) {
    this.version = getProjectGraphCrdtVersion(doc);
  }

  get graph(): ProjectGraphSnapshot {
    return projectGraphFromCrdtDoc(this.doc);
  }

  editScenarioContent(nodeId: string, content: string): void {
    const from = this.version;
    updateScenarioNodeContent(this.doc, nodeId, content);
    this.publishLocalChange(from);
  }

  moveEntity(entityId: string, position: GraphPoint): void {
    const from = this.version;
    moveProjectGraphEntity(this.doc, entityId, position);
    this.publishLocalChange(from);
  }

  receiveRemoteUpdate(update: Uint8Array): void {
    importProjectGraphCrdtUpdate(this.doc, update);
    this.version = getProjectGraphCrdtVersion(this.doc);
    this.emitGraphChange();
    this.persistCurrentSnapshot();
  }

  exportSnapshot(): Uint8Array {
    return exportProjectGraphCrdtSnapshot(this.doc);
  }

  private publishLocalChange(from: ReturnType<typeof getProjectGraphCrdtVersion>): void {
    const update = exportProjectGraphCrdtUpdate(this.doc, from);
    this.version = getProjectGraphCrdtVersion(this.doc);
    if (update.byteLength > 0) {
      this.options.sendUpdate?.(update);
    }
    this.emitGraphChange();
    this.persistCurrentSnapshot();
  }

  private emitGraphChange(): void {
    this.options.onGraphChange?.(this.graph);
  }

  private persistCurrentSnapshot(): void {
    this.options.persistSnapshot?.(this.exportSnapshot());
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
  close(): void;
}

export interface ProjectGraphSocketOptions {
  url: string;
  onUpdate: (update: Uint8Array) => void;
  WebSocketImpl?: {
    new (url: string): ProjectGraphSocketLike;
    OPEN: number;
  };
}

export const toProjectGraphWebSocketUrl = (apiBaseUrl: string, projectId: string, token: string): string => {
  const apiUrl = new URL(apiBaseUrl);
  apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  const apiPrefix = apiUrl.pathname.replace(/\/$/, '');
  apiUrl.pathname = `${apiPrefix}/ws/project/${encodeURIComponent(projectId)}`;
  apiUrl.search = '';
  apiUrl.searchParams.set('token', token);
  return apiUrl.toString();
};

export const connectProjectGraphCollaborationSocket = ({
  url,
  onUpdate,
  WebSocketImpl = WebSocket,
}: ProjectGraphSocketOptions): ProjectGraphSocketHandle => {
  const socket = new WebSocketImpl(url);
  socket.binaryType = 'arraybuffer';

  socket.addEventListener('message', (event) => {
    if (event.data instanceof ArrayBuffer) {
      onUpdate(new Uint8Array(event.data));
    } else if (ArrayBuffer.isView(event.data)) {
      onUpdate(new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength));
    } else if (event.data instanceof Blob) {
      void event.data.arrayBuffer().then((buffer) => onUpdate(new Uint8Array(buffer)));
    }
  });

  return {
    sendBinary(update: Uint8Array) {
      if (socket.readyState === WebSocketImpl.OPEN) {
        socket.send(update);
      }
    },
    close() {
      socket.close();
    },
  };
};
