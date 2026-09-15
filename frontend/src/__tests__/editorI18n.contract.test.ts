import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { editorTranslations } from '../locales/editorTranslations';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf-8');

const componentSources = {
  editorPage: source('../components/EditorPage.tsx'),
  canvas: source('../components/projectGraph/ProjectGraphCanvas.tsx'),
  overlay: source('../components/actionEditor/ActionEditorOverlay.tsx'),
  sidebar: source('../components/actionEditor/ActionEditorSidebar.tsx'),
  writer: source('../components/actionEditor/ActionEditorWriter.tsx'),
  raw: source('../components/actionEditor/ActionEditorRawCodeEditor.tsx'),
  dragHandle: source('../components/actionEditor/ActionEditorDragHandle.tsx'),
};

const locales = Object.fromEntries(
  ['en', 'ru', 'de', 'ja', 'zh'].map((code) => [
    code,
    JSON.parse(source(`../locales/${code}.json`)) as Record<string, string>,
  ]),
);

const flattenKeys = (value: unknown, prefix = ''): string[] =>
  Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' ? flattenKeys(child, path) : [path];
  });

describe('editor i18n contract', () => {
  it('routes the canvas and every action-editor surface through react-i18next', () => {
    for (const [name, componentSource] of Object.entries(componentSources)) {
      expect(componentSource, name).toContain('useTranslation');
    }
  });

  it('removes the hardcoded canvas and action-editor labels reported by users', () => {
    expect(componentSources.canvas).not.toContain('<span>перейти</span>');
    expect(componentSources.canvas).toContain("t('canvas.inspector.goToTarget')");
    expect(componentSources.overlay).not.toContain('<span>Writer view</span>');
    expect(componentSources.sidebar).not.toContain('<h2>Scene preview</h2>');
    expect(componentSources.writer).not.toContain('Add dialogue or command');
  });

  it('keeps every editor translation branch available in all supported locales', () => {
    const englishKeys = flattenKeys(editorTranslations.en).sort();
    expect(englishKeys.length).toBeGreaterThan(100);
    for (const code of ['ru', 'de', 'ja', 'zh'] as const) {
      expect(flattenKeys(editorTranslations[code]).sort(), `${code} editor keys`).toEqual(englishKeys);
    }
  });
});
