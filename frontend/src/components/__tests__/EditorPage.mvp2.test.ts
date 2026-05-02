import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('EditorPage MVP 2.0 isolation', () => {
  it('uses ProjectGraph snapshot/import/export APIs instead of legacy line-range editor APIs', () => {
    const source = readFileSync(new URL('../EditorPage.tsx', import.meta.url), 'utf-8');

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
  });
});
