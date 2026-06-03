# Action Editor Emergency Usability Sprint

Status: urgent corrective sprint before Action Editor graph-node creation.

Created: 2026-06-03.

Related artifacts:

1. `docs/action-editor-interface.md`
2. `docs/action-editor-graph-node-creation.md`
3. `artifacts/action-editor-interface-mockup.jpg`
4. `artifacts/action-editor-visual-check.png`

## Why This Sprint Exists

The current Action editor shell is visually close at the large-layout level, but it fails several basic writer expectations:

1. Dialogue/action rows are not practically scrollable for long Action blocks.
2. Dialogue rows use the same visual treatment for every speaker, making speaker scanning weak.
3. Scene preview uses fake character mockups instead of Ren'Py-like missing-asset placeholders.
4. Row drag handles are text `::` rotated through CSS, not an actual six-dot handle like the mockup.
5. Inline text tag buttons ignore the current textarea selection and tag the whole row.
6. Header mode switch and undo/redo controls do not match the mockup composition closely enough.
7. One-line rows are too tall, reducing the number of visible dialogue lines.

This sprint is mandatory before continuing with graph-node creation Sprints 7-12. Graph operations would be harder to validate if the editor cannot comfortably handle realistic long dialogue blocks.

## Non-negotiable Constraints

1. Keep the implementation modular. No single component should grow into a mixed parsing/rendering/styling blob.
2. React Flow remains projection only. This sprint must not introduce graph mutations.
3. Action node content remains the source for Writer/Raw view content edits.
4. Inline text tag operations must preserve current Ren'Py serialization behavior.
5. Scene preview is a writing aid, not a real Ren'Py renderer. Missing assets must look like honest placeholders.
6. Do not introduce real asset loading or image generation in this sprint.
7. Do not proceed to graph-node creation until this sprint has a visual regression screenshot and tests.

## Target Result

The editor should look and behave like a usable dense Ren'Py action-block editor:

1. Header composition matches the mockup: breadcrumbs/title left, segmented Writer/Raw control, undo/redo icon buttons, save status, close button.
2. Writer rows are dense enough to show many one-line dialogue rows on a 900px-tall viewport.
3. The writer column scrolls independently while the right sidebar stays visible.
4. Speakers have stable, distinct color accents.
5. Missing background/sprite preview is rendered as black or neutral labeled rectangles, for example `black`, `monika happy`, `natsuki 4c`.
6. Drag handles are real six-dot handles.
7. Text tag toolbar applies tags to the selected textarea range, and only falls back to whole-row tagging when no selection is available and the command is explicitly designed that way.

## Emergency Sprint 6.5 TDD Plan

### MVP Action 6.5.1: Scrollable Dense Writer

Black-box expectation:

A long Action node with at least 20 dialogue/command rows keeps the fullscreen editor surface inside the viewport. The writer column scrolls independently, the right sidebar remains visible, and one-line rows are compact enough to show many rows without excessive whitespace.

Atomic tasks:

1. Add a visual/e2e fixture content block with at least 20 mixed rows from `script-ch20.rpy / ch20_main2`.
2. Add a failing component or Playwright layout test proving the Action editor surface height stays inside the viewport.
3. Add a failing test proving `.action-editor__writer-column` or the row list is scrollable when content overflows.
4. Add a failing layout assertion for max one-line dialogue row height.
5. Refactor CSS so only the writer list scrolls, not the full overlay.
6. Reduce one-line dialogue row textarea height and padding while preserving readability.
7. Keep command rows shorter than dialogue rows.
8. Verify sidebar remains pinned and visible during writer scroll.
9. Capture a before/after visual screenshot.
10. Update `UPDATES.md`.
11. Consider MVP Action 6.5.2.

### MVP Action 6.5.2: Speaker Identity Colors

Black-box expectation:

Different speakers receive stable, visually distinct accent colors in row icons, speaker controls, and focused row state. The same speaker always receives the same color within the editor session.

Atomic tasks:

1. Add a pure model/view-model test for deterministic speaker accent assignment.
2. Include speakers from the reported failing case: `y`, `n`, `Monika`, `mc`, and `Narrator`.
3. Ensure at least four different accents are used for those speakers.
4. Implement a small `speakerAccentForId()` helper or equivalent view model.
5. Pass speaker accent as CSS variables to dialogue/narration rows.
6. Style icon, left speaker tile, and focus border with that accent.
7. Preserve accessible contrast for text labels.
8. Verify server-rendered tests still contain speaker labels.
9. Update `UPDATES.md`.
10. Consider MVP Action 6.5.3.

### MVP Action 6.5.3: Ren'Py-like Missing Asset Preview

Black-box expectation:

When the editor has `scene black` or unknown `show` images, Scene preview renders simple labeled rectangles instead of fake people. A black scene renders as a black preview background with visible placeholder labels.

Atomic tasks:

1. Add a sidebar test for `scene black`, `show natsuki 4c`, and `show monika 3m`.
2. The test must assert visible labels for background and each shown image.
3. The test must assert no fake character standee DOM/classes are rendered.
4. Implement a small scene-preview view model from command rows.
5. Render background as a labeled rectangle; use black fill for `black`.
6. Render each shown image as a labeled missing-asset rectangle.
7. Preserve position hints such as `at left`, `at right`, and zorder text when available.
8. Keep the preview honest: no AI/person mockups, no decorative character silhouettes.
9. Capture visual screenshot with the long `ch20_main2` fixture.
10. Update `UPDATES.md`.
11. Consider MVP Action 6.5.4.

### MVP Action 6.5.4: Real Six-dot Row Handles

Black-box expectation:

Every reorderable row shows a real six-dot drag handle matching the mockup position. The handle is not text content, not rotated punctuation, and has a stable accessible label for future drag-and-drop wiring.

Atomic tasks:

1. Add a component test proving row handles render as `aria-label="Reorder row"` or equivalent.
2. Add a test proving the handle does not contain literal `::`.
3. Implement `ActionEditorDragHandle` as a small module.
4. Render six dots through spans or CSS pseudo-elements.
5. Replace dialogue, command, and raw row handles with the component.
6. Align the handle to the right edge of each row like the mockup.
7. Keep the component drag-ready but do not implement reordering behavior in this sprint.
8. Update visual harness screenshot.
9. Update `UPDATES.md`.
10. Consider MVP Action 6.5.5.

### MVP Action 6.5.5: Correct Inline Selection Text Tags

Black-box expectation:

When a user selects one word inside a dialogue textarea and clicks Bold, only that selected word is wrapped in `{b}` / `{/b}`. The same selection behavior applies to italic, underline, strikethrough, color, size, and CPS. Wait, pause, and no-wait insert at the caret.

Atomic tasks:

1. Add an interactive component test using real textarea selection ranges.
2. Test selecting `cute` in `All words are cute girls.` and clicking Bold.
3. Assert serialization changes only the selected word.
4. Add equivalent tests for caret insertion tags `{w}`, `{p}`, and `{nw}`.
5. Refactor `InlineTextTagToolbar` so it receives current textarea selection, not a fake whole-row range.
6. Store per-row selection state on `select`, `keyup`, `mouseup`, and `focus`.
7. Preserve selection when clicking toolbar buttons via `onMouseDown.preventDefault()`.
8. Fall back conservatively when selection is unavailable: paired tags should use the caret or no-op, not whole-row selection.
9. Verify Raw mode is unaffected.
10. Update `UPDATES.md`.
11. Consider MVP Action 6.5.6.

### MVP Action 6.5.6: Header Control Fidelity

Black-box expectation:

The header matches the mockup layout closely: segmented Writer/Raw control is grouped and placed before undo/redo, undo/redo are compact icon-only buttons, save status is aligned after them, and close is the final button. Header controls do not wrap or overlap at desktop mockup width.

Atomic tasks:

1. Add layout assertions in the visual harness for header control ordering.
2. Add component tests for accessible labels on Writer view, Raw Ren'Py, Undo, Redo, Save status, and Close.
3. Tighten header CSS spacing, button sizes, and segmented-control borders.
4. Ensure the mode switch looks like one segmented control, not separate unrelated buttons.
5. Ensure undo/redo buttons match mockup sizing and are not visually merged into mode switch.
6. Keep keyboard/accessibility labels stable.
7. Verify desktop screenshot against `artifacts/action-editor-interface-mockup.jpg`.
8. Update `UPDATES.md`.
9. Consider MVP Action 6.5.7.

### MVP Action 6.5.7: Visual Regression Gate

Black-box expectation:

The urgent sprint cannot be considered closed until the long-dialogue visual harness proves scroll/density/sidebar/preview/header behavior at a desktop viewport and stores a review screenshot.

Atomic tasks:

1. Add or update `frontend/public/e2e/action-editor-visual.html` for the long-dialogue fixture.
2. Add or update `frontend/src/e2e/action-editor-visual.tsx` to use `script-ch20.rpy / ch20_main2`.
3. Add a Playwright visual/layout test or script that captures the editor at `1680x900`.
4. Assert writer area is scrollable by setting `scrollTop` and observing movement.
5. Assert sidebar remains visible after writer scroll.
6. Assert no fake standee classes exist in Scene preview.
7. Assert toolbar applies tags to a selected word.
8. Save the new screenshot as `artifacts/action-editor-emergency-visual-check.png`.
9. Run focused tests and `npm run build`.
10. Update `UPDATES.md` with final checks.
11. Consider graph-node creation Sprint 7 only after this gate passes.

## Implementation Boundaries

In scope:

1. `frontend/src/components/actionEditor/*`
2. `frontend/src/components/actionEditor/__tests__/*`
3. `frontend/public/e2e/action-editor-visual.html`
4. `frontend/src/e2e/action-editor-visual.tsx`
5. `artifacts/action-editor-emergency-visual-check.png`
6. `UPDATES.md`

Out of scope:

1. CRDT graph-node creation.
2. Real Ren'Py image loading.
3. Drag-and-drop row reordering behavior.
4. Undo/redo history implementation beyond visual/header fidelity if it is not already wired.
5. Label picker for jump/call.

## Required Checks

Focused unit/component tests:

```text
npm test -- --run src/components/actionEditor/__tests__/actionEditorModel.test.ts src/components/actionEditor/__tests__/ActionEditorWriter.test.tsx src/components/actionEditor/__tests__/ActionEditorSidebar.test.tsx src/components/actionEditor/__tests__/ActionEditorOverlay.test.tsx
```

Build:

```text
npm run build
```

Visual verification:

1. Open `http://127.0.0.1:3000/e2e/action-editor-visual.html`.
2. Capture `1680x900` screenshot.
3. Confirm:
   - writer list scrolls;
   - many rows fit vertically;
   - sidebar remains fixed;
   - preview uses labeled rectangles;
   - row handles are six-dot handles;
   - selected word tagging works;
   - header matches mockup placement.

## Closure Criteria

This sprint is closed only when:

1. All MVP Actions 6.5.1-6.5.7 pass their tests.
2. `UPDATES.md` records the urgent sprint result.
3. The visual screenshot is stored in `artifacts/action-editor-emergency-visual-check.png`.
4. No fake people/standee preview remains in the Action editor.
5. Inline text tags operate on actual textarea selection.
6. The user can inspect a long Action block without losing the sidebar or scrolling the whole overlay.
