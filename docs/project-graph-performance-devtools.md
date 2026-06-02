# ProjectGraph Canvas Performance Devtools

Дата фиксации: 2026-06-01

Статус: техническая документация по текущим средствам диагностики и визуального упрощения ProjectGraph canvas.

## 1. Назначение

Этот артефакт описывает performance-инструменты, добавленные для анализа лагов на больших ProjectGraph canvas.

Цель изменений:

1. Дать видимую dev-инфографику прямо на странице редактора.
2. Разделить стоимость ProjectGraph projection, React Flow render payload, viewport pan, edges, minimap, node DOM и CSS effects.
3. Проверять гипотезы через A/B toggles без изменения ProjectGraph и CRDT state.
4. Снизить стоимость дальних zoom levels через LOD.
5. Экспериментально подобрать адаптивное упрощение rendering на конкретном клиенте.

React Flow остается только projection layer. Все performance toggles работают поверх React Flow payload или CSS/DOM presentation и не меняют доменную модель.

## 2. Entry Points

Основные файлы:

1. `frontend/src/components/projectGraph/ProjectGraphCanvas.tsx`
2. `frontend/src/components/projectGraph/ProjectGraphCanvas.css`
3. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`

Смежные query helpers:

1. `frontend/src/components/editorPageQuery.ts`
2. `frontend/src/components/EditorPage.tsx`

Документационная память:

1. `UPDATES.md`
2. `docs/project-graph-performance-devtools.md`

## 3. Query Flags

### `devPerf=1`

Включает dev performance overlay на canvas.

Только при `devPerf=1` собираются FPS metrics и включаются dev A/B toggles. В обычном режиме FPS sampler не запускается.

Причина: постоянный FPS sampler сам является runtime overhead и не должен работать в production editor path без явного dev-запроса.

### `visibleOnly`

Управляет `ReactFlow.onlyRenderVisibleElements`.

Текущий default editor path использует `visibleOnly=1`, потому что на больших проектах это дает качественный выигрыш.

Для сравнения полного render path можно открыть editor route с:

```text
&visibleOnly=0
```

Важно: `onlyRenderVisibleElements` снижает число DOM nodes в viewport, но добавляет собственный overhead на пересчет видимости во время pan. Поэтому его нужно сравнивать отдельно от других оптимизаций.

## 4. Dev Performance Overlay

Overlay показывает:

1. ProjectGraph counts: files, labels, scenario nodes.
2. React Flow payload counts: nodes and edges.
3. Visible estimate: visible nodes and crossing edges.
4. FPS sample.
5. Active phase: `idle`, `pan`, `zoom`, `nodeDrag`.
6. Frame time average and max.
7. Long frames over `50 ms`.
8. Pan-specific FPS and long frames.
9. Idle / zoom / drag FPS.
10. Projection time.
11. Viewport zoom and flow rect size.
12. LOD bucket.
13. Derived edge count.
14. Animated edge count.
15. Visible rendering state.
16. Minimap mode.
17. Visible node type breakdown.

Основные helpers:

1. `summarizeProjectGraphFrameMetrics()`
2. `summarizeProjectGraphPhaseFrameMetrics()`
3. `calculateProjectGraphViewportMetrics()`
4. `shouldTrackProjectGraphViewportLive()`

## 5. Interaction Phase Metrics

Frame samples распределяются по фазам:

```ts
type ProjectGraphFramePhase = 'idle' | 'pan' | 'zoom' | 'nodeDrag';
```

Фаза определяется так:

1. `onMoveStart` переводит sampler в `pan`.
2. `onMove` сравнивает текущий zoom с предыдущим viewport и различает `pan` / `zoom`.
3. Custom node drag переводит sampler в `nodeDrag`.
4. `onMoveEnd` возвращает фазу в `idle`.

Это нужно потому, что общий FPS может выглядеть нормальным в статике, но pan-path может иметь длинные frames.

## 6. Dev A/B Toggles

Overlay содержит toggles:

1. `Visible only`
2. `Auto light`
3. `Edges`
4. `Derived edges`
5. `MiniMap`
6. `Background`
7. `Node body`
8. `Node effects`
9. `Text LOD`

### `Edges`

Если off, React Flow получает пустой edge list.

Это проверяет стоимость всего SVG edge layer.

Helper:

```ts
getProjectGraphRenderEdges()
```

### `Derived edges`

Если off, остаются только relation edges из ProjectGraph.

Derived sequence/branch edges являются projection-only подсказками. Их отключение не меняет ProjectGraph.

### `MiniMap`

Если off, minimap не рендерится.

Текущая minimap реализация больше не использует React Flow `MiniMap`. Вместо нее используется static SVG minimap, построенная только по `projectFrame` и `labelFrame`.

Helper:

```ts
buildProjectGraphStaticMiniMapModel()
```

### `Background`

Если off, не рендерится React Flow background grid.

### `Node body`

Если off, body/text области нод заменяются легкими bar-заглушками.

### `Node effects`

Если off, снимаются декоративные effects вроде shadows/background details, где они заданы canvas CSS классами.

### `Text LOD`

Если off, zoom-based text simplification принудительно отключается и LOD bucket считается как `full`.

## 7. Zoom LOD

LOD bucket рассчитывается по zoom:

```ts
type ProjectGraphLodLevel = 'full' | 'compact' | 'bars' | 'map';
```

Текущие пороги:

1. `full`: `zoom >= 0.55`
2. `compact`: `zoom >= 0.25`
3. `bars`: `zoom >= 0.12`
4. `map`: ниже `0.12`

Helper:

```ts
getProjectGraphLodLevel()
```

### `full`

Полный node DOM: header, title, content, typed visual styles.

### `compact`

Текст остается частично читаемым, длинный body content упрощается.

### `bars`

Нечитаемый текст заменяется mock bars.

Scenario nodes и `LabelStartNode` получают simple node DOM: один same-size rectangle с mock text lines.

File and label frames не получают full simple replacement, чтобы не появлялся фантомный body text внутри больших frame interiors. В `bars` у них остается только узкая mock header зона сверху.

### `map`

Самый дальний режим. Body content hidden, node rendering максимально близок к map-level overview.

## 8. Simple Node Rendering

Simple node rendering заменяет обычную DOM-структуру:

```text
pg-node
  pg-node__drag-handle
    pg-node__eyebrow
  pg-node__body
    pg-node__title
    pg-node__content
```

на более легкую структуру:

```text
pg-node pg-node--mock
  pg-node__mock-hit
    pg-node__mock-line
    pg-node__mock-line
    pg-node__mock-line
```

Helper:

```ts
shouldRenderProjectGraphSimpleNodes()
```

Правила:

1. `scenarioNode` и `labelStart` могут быть заменены на simple DOM в `bars`, `map` или adaptive light level `>= 1`.
2. `projectFrame` и `labelFrame` не заменяются целиком на simple DOM.
3. Frame drag hit zone остается на header, а не на всей площади frame.

## 9. Edge LOD

Edge LOD выполняется после dev edge toggles и selected dashed-edge animation.

Helper:

```ts
applyProjectGraphEdgeLod()
```

В `full` и `compact` edges остаются без LOD-упрощения.

В `bars` и `map`:

1. Убирается `markerEnd`, то есть arrow marker.
2. `interactionWidth` становится `0`.
3. Скрываются простые прямые derived sequence edges.

Straight sequence filter:

```ts
shouldHideProjectGraphEdgeInLod(edge, lodLevel)
```

Скрывается только:

```ts
edge.type === 'straight' && edge.data?.kind === 'sequence'
```

Остаются видимыми:

1. Branch edges.
2. Jump/call relation edges.
3. Routed sequence edges with turns: `step` / `nearTargetStep`.
4. Rejoin and alternative routing.

Цель: убрать визуальный шум и SVG cost от простых вертикальных линий без потери branch structure.

## 10. Dashed Edge Animation

Jump/call dashed edges не анимируются постоянно.

Base projection ставит relation edges как static.

Canvas применяет animation только когда selected node является source или target edge.

Helper:

```ts
applySelectedDashedEdgeAnimation()
```

Это снижает постоянную стоимость SVG stroke animation.

## 11. React Flow Handles

React Flow handles остаются в DOM как routing anchors, но визуально скрыты:

```css
.pg-node__handle {
  visibility: hidden;
  pointer-events: none;
}
```

Причина: handles нужны React Flow для edge source/target anchors, но белые кружки не несут полезной информации для текущего editor UX и добавляют лишние painted elements.

## 12. Static SVG MiniMap

React Flow `MiniMap` заменена на lightweight static SVG component:

```ts
ProjectGraphStaticMiniMap
```

Она строит модель только по:

1. `projectFrame`
2. `labelFrame`

Не рисуются:

1. `scenarioNode`
2. `labelStart`
3. individual edges

Viewport rectangle считается из текущего viewport and canvas size.

Компонент находится вне React Flow tree, поэтому он не подписан напрямую на React Flow minimap store. Это снижает pan-path overhead, особенно когда исходная React Flow minimap рисовала сотни мелких nodes.

## 13. Viewport State Throttling

Canvas больше не вызывает `setViewport()` на каждом `onMove` в обычном single-user path.

Live viewport state нужен только когда есть remote cursors, потому что их screen-space projection зависит от live viewport.

Helper:

```ts
shouldTrackProjectGraphViewportLive(remoteCursorCount)
```

Поведение:

1. Without remote cursors: `onMove` обновляет только refs and interaction phase.
2. `setViewport()` выполняется на `onMoveEnd`.
3. With remote cursors: live viewport tracking включается.

## 14. Dev Adaptive Light

`Auto light` доступен только при `devPerf=1`.

Helper:

```ts
getNextProjectGraphAdaptiveLightLevel()
```

Adaptive light level:

1. `L0`: normal current LOD behavior.
2. `L1`: simple node DOM включается даже ближе, чем static zoom LOD.
3. `L2`: additionally edge LOD behaves like distant LOD for markers/hit-width.
4. `L3`: additionally derived edges are hidden.

Level повышается только на pan samples, когда:

1. active phase is `pan`.
2. sample has at least 3 frames.
3. visible node count is at least 100.
4. FPS / average frame / long frame metrics indicate slow pan.

Current thresholds:

1. low pan FPS: `< 28`
2. high average pan frame: `>= 36 ms`
3. recovered pan FPS: `>= 52`
4. recovered average pan frame: `<= 22 ms`

Adaptive mode может снижать level, если pan recovered and no long frames are observed.

Важно: adaptive light не работает вне `devPerf=1`, потому что он использует FPS metrics.

## 15. Production Boundary

В обычном editor mode:

1. FPS sampler не запускается.
2. Dev overlay не рендерится.
3. Dev toggles недоступны.
4. Adaptive light отключен.
5. Static zoom LOD остается активным.
6. `visibleOnly=1` остается default unless query overrides it.

Это сохраняет production path предсказуемым и не добавляет постоянную diagnostic cost.

## 16. Measurement Workflow

Рекомендуемый порядок анализа:

1. Открыть editor with `devPerf=1`.
2. Зафиксировать zoom, visible nodes and crossing edges.
3. Выполнить одинаковый pan pattern, например 2 px туда-сюда.
4. Записать Pan FPS, Pan long frames, frame average and max.
5. Переключать toggles по одному.
6. Повторять pan pattern after each toggle.

Приоритет toggles:

1. `Edges`
2. `Derived edges`
3. `MiniMap`
4. `Background`
5. `Node body`
6. `Node effects`
7. `Text LOD`
8. `Visible only`
9. `Auto light`

Интерпретация:

1. Large gain from `Edges` means SVG edge layer dominates.
2. Large gain from `Derived edges` means projection-only sequence/branch hints dominate.
3. Large gain from `MiniMap` means minimap still participates in pan cost.
4. No gain from `Node body` / `Node effects` means CSS text and decorative node styles are not the primary bottleneck.
5. Poor FPS even with simple nodes and no derived edges points to React Flow viewport, visible-element calculation, hit testing, or remaining SVG cost.

## 17. Current Known Risks

1. React Flow `onlyRenderVisibleElements` helps large canvases but can add pan-time overhead.
2. SVG edges are still React Flow edges, not a custom canvas/WebGL layer.
3. Static minimap updates viewport rectangle through React state and therefore can still update on `onMoveEnd`; it should not update every pan frame unless remote cursor tracking is active.
4. Adaptive light is intentionally DEV-only; production adaptive rendering needs a separate design if it must avoid FPS sampling.
5. CSS simplification can affect visual clarity, so every new LOD rule must be checked visually around transition thresholds.

## 18. Future Optimization Candidates

1. Replace React Flow SVG edges with one custom canvas or static SVG edge layer.
2. Temporarily hide or bitmap-cache edges during active pan and restore them on pan end.
3. Implement spatial-index projection before React Flow so React Flow receives fewer nodes and edges, instead of relying only on `onlyRenderVisibleElements`.
4. Promote adaptive thresholds from DEV to production only if they can be based on stable heuristics such as zoom, visible node count, edge count, and device class without continuous FPS sampling.
5. Add browser trace export checklist for comparing `Hit test`, `Layout`, `Paint`, `Layerize`, and `Scripting`.

## 19. Test Coverage

Focused coverage lives in:

```text
frontend/src/utils/__tests__/projectGraphProjection.test.ts
```

Covered helpers:

1. `getProjectGraphRenderEdges()`
2. `summarizeProjectGraphPhaseFrameMetrics()`
3. `getProjectGraphLodLevel()`
4. `applyProjectGraphEdgeLod()`
5. `shouldHideProjectGraphEdgeInLod()`
6. `buildProjectGraphStaticMiniMapModel()`
7. `shouldRenderProjectGraphSimpleNodes()`
8. `getNextProjectGraphAdaptiveLightLevel()`
9. `applySelectedDashedEdgeAnimation()`

Expected check:

```bash
npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts
```

Build check:

```bash
npm run build
```

