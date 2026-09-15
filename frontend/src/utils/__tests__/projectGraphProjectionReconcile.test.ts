import { describe, expect, it } from 'vitest';

import {
  createProjectGraphCrdtDoc,
  moveProjectGraphEntity,
  projectGraphFromCrdtDoc,
  updateScenarioNodeContent,
} from '../projectGraphCrdt';
import {
  projectGraphToReactFlow,
  reconcileProjectGraphProjection,
  type ProjectGraphSnapshot,
} from '../projectGraphProjection';
import { ProjectGraphReadModel } from '../projectGraphReadModel';

const graphFixture = (): ProjectGraphSnapshot => ({
  project_id: 'mouse-project',
  files: [
    {
      id: 'file-script',
      path: 'game/script.rpy',
      order: '0001',
      visual: { position: { x: 0, y: 0 }, size: { width: 900, height: 700 } },
    },
  ],
  labels: [
    {
      id: 'label-start',
      file_id: 'file-script',
      parent_label_id: null,
      name: 'start',
      qualified_name: 'start',
      scope: 'global',
      label_start_node_id: 'start-node',
      source_span: { start_line: 1, end_line: 8 },
      visual: { position: { x: 40, y: 60 }, size: { width: 700, height: 520 } },
    },
  ],
  label_starts: [
    {
      id: 'start-node',
      file_id: 'file-script',
      label_id: 'label-start',
      qualified_name: 'start',
      content: 'label start:',
      visual: { position: { x: 40, y: 80 }, size: { width: 280, height: 72 } },
    },
  ],
  nodes: [
    {
      id: 'menu',
      file_id: 'file-script',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'menu',
      content: 'menu:',
      order: '0001',
      source_span: { start_line: 2, end_line: 6 },
      metadata: {},
      visual: { position: { x: 40, y: 190 }, size: { width: 320, height: 88 } },
    },
    {
      id: 'menu-prompt',
      file_id: 'file-script',
      label_id: 'label-start',
      parent_node_id: 'menu',
      type: 'menu_prompt',
      content: '"RenPy Mouse studies the fast path."',
      order: '0001.0001',
      source_span: { start_line: 3, end_line: 3 },
      metadata: {},
      visual: { position: { x: 0, y: 0 }, size: { width: 320, height: 88 } },
    },
    {
      id: 'jump-home',
      file_id: 'file-script',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'jump',
      content: 'jump start',
      order: '0002',
      source_span: { start_line: 7, end_line: 7 },
      metadata: { title: 'Home' },
      visual: { position: { x: 40, y: 330 }, size: { width: 320, height: 88 } },
    },
  ],
  edges: [
    {
      id: 'relation-home',
      source_node_id: 'jump-home',
      target_node_id: 'start-node',
      kind: 'jump',
      metadata: { resolved: true },
    },
  ],
  diagnostics: [],
  source_index: {
    files: {
      'file-script': { content: 'label start:\n    jump start\n' },
    },
  },
});

const cloneGraph = (graph: ProjectGraphSnapshot): ProjectGraphSnapshot => JSON.parse(JSON.stringify(graph));
const nodeById = (projection: ReturnType<typeof projectGraphToReactFlow>, nodeId: string) =>
  projection.nodes.find((node) => node.id === nodeId)!;

describe('ProjectGraph projection reconciliation', () => {
  it('patches one content node while preserving unrelated projected object identities', () => {
    const previousGraph = graphFixture();
    const previousProjection = projectGraphToReactFlow(previousGraph);
    const nextGraph = cloneGraph(previousGraph);
    nextGraph.nodes.find((node) => node.id === 'jump-home')!.content = 'jump start # quickly';

    const result = reconcileProjectGraphProjection(previousGraph, previousProjection, nextGraph);

    expect(result.mode).toBe('presentation');
    expect(nodeById(result.projection, 'jump-home')).not.toBe(nodeById(previousProjection, 'jump-home'));
    expect(nodeById(result.projection, 'jump-home').data.content).toBe('jump start # quickly');
    expect(nodeById(result.projection, 'menu')).toBe(nodeById(previousProjection, 'menu'));
    expect(nodeById(result.projection, 'label-start')).toBe(nodeById(previousProjection, 'label-start'));
    expect(result.projection.edges).toBe(previousProjection.edges);
    expect(result.stats).toEqual({ changedEdges: 0, changedNodes: 1, reusedEdges: 2, reusedNodes: 4 });
  });

  it('patches a hidden menu prompt into its visible menu node', () => {
    const previousGraph = graphFixture();
    const previousProjection = projectGraphToReactFlow(previousGraph);
    const nextGraph = cloneGraph(previousGraph);
    nextGraph.nodes.find((node) => node.id === 'menu-prompt')!.content = '"The mouse measures only facts."';

    const result = reconcileProjectGraphProjection(previousGraph, previousProjection, nextGraph);

    expect(result.mode).toBe('presentation');
    expect(nodeById(result.projection, 'menu')).not.toBe(nodeById(previousProjection, 'menu'));
    expect(nodeById(result.projection, 'menu').data.menuPrompt).toBe('"The mouse measures only facts."');
    expect(result.projection.nodes.some((node) => node.id === 'menu-prompt')).toBe(false);
  });

  it('patches scenario metadata, source text and relation metadata without layout', () => {
    const previousGraph = graphFixture();
    const previousProjection = projectGraphToReactFlow(previousGraph);
    const nextGraph = cloneGraph(previousGraph);
    nextGraph.nodes.find((node) => node.id === 'jump-home')!.metadata.title = 'Fast home';
    (nextGraph.source_index.files as Record<string, { content: string }>)['file-script'].content =
      'label start:\n    jump start # cached\n';
    nextGraph.edges[0].metadata = { resolved: true, note: 'stable target' };

    const result = reconcileProjectGraphProjection(previousGraph, previousProjection, nextGraph);
    const relation = result.projection.edges.find((edge) => edge.id === 'relation-home')!;

    expect(result.mode).toBe('presentation');
    expect(nodeById(result.projection, 'jump-home').data.title).toBe('Fast home');
    expect(nodeById(result.projection, 'file-script').data.sourceContent).toContain('# cached');
    expect(relation.data?.metadata).toEqual({ resolved: true, note: 'stable target' });
  });

  it('reuses the complete projection when only diagnostics changed', () => {
    const previousGraph = graphFixture();
    const previousProjection = projectGraphToReactFlow(previousGraph);
    const nextGraph = cloneGraph(previousGraph);
    nextGraph.diagnostics.push({
      id: 'warning',
      code: 'mouse_warning',
      severity: 'warning',
      message: 'RenPy Mouse sees a warning.',
      blocking: false,
      file_id: 'file-script',
      label_id: 'label-start',
      node_id: 'jump-home',
      source_span: null,
      metadata: {},
    });

    const result = reconcileProjectGraphProjection(previousGraph, previousProjection, nextGraph);

    expect(result.mode).toBe('presentation');
    expect(result.projection).toBe(previousProjection);
    expect(result.stats.changedNodes).toBe(0);
    expect(result.stats.changedEdges).toBe(0);
  });

  it('takes the presentation path for a content edit materialized from the real Loro document', () => {
    const doc = createProjectGraphCrdtDoc(graphFixture(), { peerId: '1' });
    const previousGraph = projectGraphFromCrdtDoc(doc);
    const previousProjection = projectGraphToReactFlow(previousGraph);

    updateScenarioNodeContent(doc, 'jump-home', 'jump start # from Loro');
    const nextGraph = projectGraphFromCrdtDoc(doc);
    const result = reconcileProjectGraphProjection(previousGraph, previousProjection, nextGraph);

    expect(result.mode).toBe('presentation');
    expect(result.stats.changedNodes).toBe(1);
    expect(nodeById(result.projection, 'jump-home').data.content).toBe('jump start # from Loro');
  });

  it('uses the dirty-record hint without scanning materialized entity arrays', () => {
    const doc = createProjectGraphCrdtDoc(graphFixture(), { peerId: '1' });
    const readModel = new ProjectGraphReadModel(doc);
    const previousGraph = readModel.graph;
    const previousProjection = projectGraphToReactFlow(previousGraph);

    updateScenarioNodeContent(doc, 'jump-home', 'jump start # direct dirty record');
    const readUpdate = readModel.flush();
    const nextGraph = {
      ...readUpdate.graph,
      nodes: new Proxy(readUpdate.graph.nodes, {
        get(target, property, receiver) {
          if (property === Symbol.iterator || property === 'map' || property === 'filter' || property === 'every') {
            throw new Error('dirty projection must not scan nextGraph.nodes');
          }
          return Reflect.get(target, property, receiver);
        },
      }),
    };

    const result = reconcileProjectGraphProjection(previousGraph, previousProjection, nextGraph, readUpdate);

    expect(result.mode).toBe('presentation');
    expect(result.stats.changedNodes).toBe(1);
    expect(nodeById(result.projection, 'jump-home').data.content).toBe('jump start # direct dirty record');
    readModel.dispose();
  });

  it('uses the full projection oracle when a dirty hint contains geometry fields', () => {
    const doc = createProjectGraphCrdtDoc(graphFixture(), { peerId: '1' });
    const readModel = new ProjectGraphReadModel(doc);
    const previousGraph = readModel.graph;
    const previousProjection = projectGraphToReactFlow(previousGraph);

    moveProjectGraphEntity(doc, 'jump-home', { x: 480, y: 360 });
    const readUpdate = readModel.flush();
    const result = reconcileProjectGraphProjection(previousGraph, previousProjection, readUpdate.graph, readUpdate);

    expect(readUpdate.mode).toBe('incremental');
    expect(readUpdate.entityFieldsById['jump-home']).toEqual(
      expect.arrayContaining(['position_x', 'position_y']),
    );
    expect(result.mode).toBe('full');
    expect(result.projection).toEqual(projectGraphToReactFlow(readUpdate.graph));
    readModel.dispose();
  });

  it.each([
    ['position', (graph: ProjectGraphSnapshot) => (graph.nodes[0].visual.position.x += 10)],
    ['manual layout', (graph: ProjectGraphSnapshot) => (graph.nodes[0].metadata._manual_position = true)],
    ['topology', (graph: ProjectGraphSnapshot) => (graph.nodes[2].parent_node_id = 'menu')],
    ['type', (graph: ProjectGraphSnapshot) => (graph.nodes[2].type = 'call')],
    ['relation target', (graph: ProjectGraphSnapshot) => (graph.edges[0].source_node_id = 'menu')],
  ])('falls back to a full projection for a %s change', (_name, mutate) => {
    const previousGraph = graphFixture();
    const previousProjection = projectGraphToReactFlow(previousGraph);
    const nextGraph = cloneGraph(previousGraph);
    mutate(nextGraph);

    const result = reconcileProjectGraphProjection(previousGraph, previousProjection, nextGraph);

    expect(result.mode).toBe('full');
    expect(result.projection).not.toBe(previousProjection);
  });
});
