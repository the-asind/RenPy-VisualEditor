import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  getEditorDevPerformanceEnabled,
  getEditorProjectId,
  getEditorVisibleOnlyEnabled,
} from '../editorPageQuery';

describe('EditorPage MVP 2.0 isolation', () => {
  it('parses project and dev performance query parameters', () => {
    expect(getEditorProjectId('?project=mouse&devPerf=1&visibleOnly=true')).toBe('mouse');
    expect(getEditorDevPerformanceEnabled('?project=mouse&devPerf=1')).toBe(true);
    expect(getEditorDevPerformanceEnabled('?project=mouse&devPerf=true')).toBe(true);
    expect(getEditorDevPerformanceEnabled('?project=mouse')).toBe(false);
    expect(getEditorVisibleOnlyEnabled('?project=mouse&visibleOnly=1')).toBe(true);
    expect(getEditorVisibleOnlyEnabled('?project=mouse&visibleOnly=true')).toBe(true);
    expect(getEditorVisibleOnlyEnabled('?project=mouse')).toBe(true);
    expect(getEditorVisibleOnlyEnabled('?project=mouse&visibleOnly=0')).toBe(false);
    expect(getEditorVisibleOnlyEnabled('?project=mouse&visibleOnly=false')).toBe(false);
  });

  it('uses ProjectGraph snapshot/import/export APIs instead of legacy line-range editor APIs', () => {
    const source = readFileSync(new URL('../EditorPage.tsx', import.meta.url), 'utf-8');

    expect(source).toContain('projectService');
    expect(source).toContain('.getProject(projectId)');
    expect(source).toContain('projectName={projectName}');
    expect(source).toContain('loadProjectGraphCrdtDocument');
    expect(source).toContain('importProjectGraphFiles');
    expect(source).toContain('exportProjectGraphFiles');
    expect(source).toContain('saveProjectGraphCrdtSnapshot');

    expect(source).not.toMatch(/\bparseScript\b/);
    expect(source).not.toMatch(/\bupdateNodeContent\b/);
    expect(source).not.toMatch(/\binsertNode\b/);
    expect(source).not.toMatch(/\bCollabProvider\b/);
    expect(source).not.toMatch(/\bCollaborationProvider\b/);
    expect(source).not.toContain('/scripts/parse');
    expect(source).not.toContain('/scripts/update-node');
    expect(source).not.toContain('/scripts/insert-node');
    expect(source).not.toContain('lock_node');
    expect(source).not.toContain('Project ${projectId}');
  });

  it('keeps the ProjectGraph canvas shell headerless and action-based', () => {
    const source = readFileSync(new URL('../projectGraph/ProjectGraphCanvas.tsx', import.meta.url), 'utf-8');

    expect(source).toContain('project-graph-canvas__brand');
    expect(source).toContain('project-graph-canvas__top-actions');
    expect(source).toContain('aria-label="Open node search"');
    expect(source).toContain('project-graph-canvas__participant-stack');
    expect(source).toContain('project-graph-canvas__invite-popover');
    expect(source).toContain('Invite people');

    expect(source).not.toContain('className="project-graph-canvas__toolbar"');
    expect(source).not.toContain('placeholder="Search nodes"');
  });

  it('keeps search and invite surfaces action-triggered and dismissible', () => {
    const source = readFileSync(new URL('../projectGraph/ProjectGraphCanvas.tsx', import.meta.url), 'utf-8');

    expect(source).toContain('openSearchPopover');
    expect(source).toContain('closeCanvasPopovers');
    expect(source).toContain("event.key === 'Escape'");
    expect(source).toContain("event.key.toLocaleLowerCase() === 'k'");
    expect(source).toContain("document.addEventListener('pointerdown'");
    expect(source).toContain('project-graph-canvas__search-popover');
    expect(source).toContain('project-graph-canvas__invite-popover');
  });

  it('uses a compact selection-driven Inspector for scenario editing', () => {
    const source = readFileSync(new URL('../projectGraph/ProjectGraphCanvas.tsx', import.meta.url), 'utf-8');

    expect(source).toContain('project-graph-canvas__node-editor');
    expect(source).toContain('Inspector');
    expect(source).toContain('project-graph-canvas__inspector-type');
    expect(source).toContain('project-graph-canvas__inspector-breadcrumb');
    expect(source).toContain('selectedScenarioFile?.path');
    expect(source).toContain('selectedScenarioLabel?.qualified_name');
  });

  it('uses bottom-right canvas controls for status, frames, zoom, help, and minimap', () => {
    const source = readFileSync(new URL('../projectGraph/ProjectGraphCanvas.tsx', import.meta.url), 'utf-8');
    const styles = readFileSync(new URL('../projectGraph/ProjectGraphCanvas.css', import.meta.url), 'utf-8');

    expect(source).toContain('project-graph-canvas__control-cluster');
    expect(source).toContain('project-graph-canvas__control-toolbar');
    expect(source).toContain('project-graph-canvas__frames-popover');
    expect(source).toContain('project-graph-canvas__problems-popover');
    expect(source).toContain('reactFlowInstance?.zoomOut');
    expect(source).toContain('reactFlowInstance?.zoomIn');
    expect(source).toContain('isMinimapVisible');
    expect(source).toContain('ProjectGraphStaticMiniMap');
    expect(source).toContain('buildProjectGraphStaticMiniMapModel');
    expect(source).toContain('project-graph-canvas__minimap-frame--${frame.type}');
    expect(styles).toContain('project-graph-canvas__minimap-frame--labelFrame');
    expect(styles).toContain('bottom: 78px;');
    expect(source).not.toContain('<Controls showInteractive={false} />');
  });

  it('keeps collaboration presence separate from ProjectGraph CRDT state', () => {
    const editorSource = readFileSync(new URL('../EditorPage.tsx', import.meta.url), 'utf-8');
    const canvasSource = readFileSync(new URL('../projectGraph/ProjectGraphCanvas.tsx', import.meta.url), 'utf-8');

    expect(editorSource).toContain('onPresenceUsers');
    expect(editorSource).toContain('onRemoteCursor');
    expect(editorSource).toContain('participants={participants}');
    expect(editorSource).toContain('remoteCursors={Object.values(remoteCursorsByUserId)}');
    expect(editorSource).toContain("type: 'share_project'");
    expect(canvasSource).toContain('project-graph-canvas__remote-cursor');
    expect(canvasSource).toContain('participantsToShow');
  });
});
