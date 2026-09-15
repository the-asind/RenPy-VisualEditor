import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n';

import type { ProjectGraphDeletionImpact } from '../../utils/projectGraphDeletion';
import { ProjectGraphDeleteDialog } from './ProjectGraphDeleteDialog';

const impact = {
  entity: { id: 'label-ending', kind: 'label', title: 'ending' },
  canDelete: false,
  deleteEntityIds: { files: [], labels: ['label-ending'], labelStarts: ['start-ending'], nodes: ['node-ending'], edges: ['edge-ending'], diagnostics: [] },
  incomingReferences: [{
    edgeId: 'edge-ending', kind: 'jump', sourceNodeId: 'node-jump', sourceNodeContent: 'jump ending',
    sourceFileId: 'file-main', sourceFilePath: 'script.rpy', sourceLabelId: 'label-start', sourceLabelQualifiedName: 'start',
    targetNodeId: 'start-ending', targetLabelId: 'label-ending', targetLabelQualifiedName: 'ending',
  }],
  outgoingReferences: [], blockers: [], warnings: [{ code: 'nested_entities', count: 2 }], replacementPassParents: [],
} satisfies ProjectGraphDeletionImpact;

describe('ProjectGraph deletion dialog', () => {
  it('shows the exact incoming reference, navigation action and disabled destructive action', () => {
    const html = renderToStaticMarkup(
      <ProjectGraphDeleteDialog impact={impact} onCancel={vi.fn()} onConfirm={vi.fn()} onGoToNode={vi.fn()} />,
    );
    expect(html).toContain('Deletion blocked');
    expect(html).toContain('script.rpy · start');
    expect(html).toContain('jump ending');
    expect(html).toContain('Go to reference');
    expect(html).toMatch(/class="project-graph-delete-dialog__delete" disabled=""/);
  });
});
