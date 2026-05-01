# RenPy Visual Editor 2.0 Architecture

Дата фиксации: 2026-05-01

Статус: архитектурная и миграционная ветка `codex/editor-2-architecture`.

## 1. Цель

MVP 2.0 должен заменить модель `один файл = один граф` на модель `один проект = один большой холст`.

На холсте видны все `.rpy` файлы проекта, все глобальные labels, все локальные/nested labels и все ноды, которые нужны автору для понимания повествования и переходов. React Flow показывает проекцию доменной модели. Он не является источником правды.

Источник правды MVP 2.0 - `ProjectGraph`, сохраненный в CRDT-состоянии проекта.

## 2. Критерии Качества Понимания

Архитектура считается понятой качественно только если она проверяется внешними критериями:

1. Автор видит один холст проекта: файлы, label-фреймы, вложенные label-фреймы, стартовые ноды labels и сценарные ноды.
2. Containment, runtime flow и visual layout не смешиваются.
3. `jump` и `call` не перестраивают дерево владения, но дают relation edges и layout hints.
4. Все связи React Flow идут только между нодами.
5. Каждый sprint делится на master items, а каждый master item является завершенным TDD-кругом.
6. Внутри master item есть атомарные действия с ясным способом выполнения.
7. MVP отделен от полировки. История, viewport persistence и сложная диагностика не блокируют MVP, если они не нужны для главного цикла.
8. Перед реализацией каждого master item проверяются официальные docs Ren'Py, React Flow или Loro.
9. Если официальная документация или тесты противоречат плану, меняется план.
10. Документы `AGENTS.md`, `UPDATES.md` и этот файл остаются синхронизированными.

## 3. Документационные Столпы

Каждый агент перед изменением кода читает:

1. `AGENTS.md`
2. `UPDATES.md`
3. `docs/editor-2.0-architecture.md`

Старый README и MVP 1.0 реализация не являются источником архитектурной истины.

## 4. Официальные Источники

Перед master item нужно сверяться с актуальными официальными источниками:

- Ren'Py latest: https://www.renpy.org/latest.html
- Ren'Py Language Basics: https://www.renpy.org/doc/html/language_basics.html
- Ren'Py Labels and Control Flow: https://www.renpy.org/doc/html/label.html
- Ren'Py Menus: https://www.renpy.org/doc/html/menus.html
- Ren'Py source parser: https://github.com/renpy/renpy/blob/master/renpy/parser.py
- React Flow docs: https://reactflow.dev/learn
- React Flow sub-flows / parent-child nodes: https://reactflow.dev/learn/layouting/sub-flows
- React Flow layouting: https://reactflow.dev/learn/layouting/layouting
- React Flow multiplayer guidance: https://reactflow.dev/learn/advanced-use/multiplayer
- Loro docs: https://www.loro.dev/docs
- Loro Tree tutorial: https://www.loro.dev/docs/tutorial/tree
- Loro encoding / updates: https://www.loro.dev/docs/tutorial/encoding
- Loro Python package: https://pypi.org/project/loro/

Если будет найден сторонний ANTLR/grammar-файл для Ren'Py, его можно использовать только как подсказку. Источник правды остается официальный Ren'Py parser и официальная документация.

## 5. Простые Термины

`ProjectGraph` - доменная модель всего Ren'Py-проекта.

`FileFrame` - прямоугольник файла `.rpy` на общем холсте.

`LabelFrame` - прямоугольник label. Может быть глобальным или вложенным.

`LabelStartNode` - видимая мастер-нода начала label внутри `LabelFrame`. Именно к ней ведут `jump` и `call`.

`ScenarioNode` - нода содержимого: диалог, меню, условие, переход, комментарий, action/raw блок.

`FlowEdge` - связь между двумя нодами. Связей frame-to-frame в MVP 2.0 нет.

`Containment` - владение: файл содержит label, label содержит вложенный label или ноду.

`Projection` - превращение `ProjectGraph` в React Flow nodes/edges.

`Master Item` - законченный TDD-круг внутри спринта: black-box test, код, проверка.

`Atomic Action` - маленькое действие внутри master item с очевидным результатом.

## 6. Холст 2.0

На итоговом холсте ничего не складывается и не сворачивается. Это важно для коллаборации: все участники видят один и тот же структурный контекст.

Структура:

```text
Project Canvas
  FileFrame script_a.rpy
    LabelFrame start
      LabelStartNode start
      ScenarioNode dialogue/action/menu/if/jump/call
      LabelFrame .local
        LabelStartNode start.local
        ScenarioNode ...
  FileFrame day_2.rpy
    LabelFrame day_two
      LabelStartNode day_two
      ScenarioNode ...
```

Правила холста:

1. Все файлы проекта отображаются как `FileFrame`.
2. Все глобальные labels отображаются как `LabelFrame` внутри файла.
3. Локальные и nested labels отображаются как вложенные `LabelFrame`.
4. Каждый `LabelFrame` содержит ровно один `LabelStartNode`.
5. Все связи идут только между нодами.
6. `jump/call source node -> target LabelStartNode`.
7. Sibling фреймы не пересекаются.
8. Фрейм может содержать фрейм, но containment не должен теряться системно.
9. Layout строится преимущественно по flow-связям; source order является fallback.
10. Search, minimap и problems/log panel являются MVP-навигацией вместо collapse.

## 7. ProjectGraph IR

Минимальная целевая форма:

```ts
type ProjectGraph = {
  projectId: string;
  files: FileFrame[];
  labels: LabelFrame[];
  labelStarts: LabelStartNode[];
  nodes: ScenarioNode[];
  edges: FlowEdge[];
  diagnostics: GraphDiagnostic[];
  sourceIndex: SourceIndex;
};
```

Фрейм файла:

```ts
type FileFrame = {
  id: string;
  path: string;
  order: string;
  visual: {
    position: { x: number; y: number }; // global canvas position
    size: { width: number; height: number };
  };
};
```

Фрейм label:

```ts
type LabelFrame = {
  id: string;
  fileId: string;
  parentLabelId: string | null;
  name: string;
  qualifiedName: string;
  scope: "global" | "local" | "nested";
  labelStartNodeId: string;
  sourceSpan: SourceSpan | null;
  visual: {
    position: { x: number; y: number }; // local to parent frame
    size: { width: number; height: number };
    colorToken: string;
  };
};
```

Старт-нода label:

```ts
type LabelStartNode = {
  id: string;
  fileId: string;
  labelId: string;
  qualifiedName: string;
  content: string; // usually "label name:"
  visual: {
    position: { x: number; y: number }; // local to owning LabelFrame
    size: { width: number; height: number };
  };
};
```

Сценарная нода:

```ts
type ScenarioNode = {
  id: string;
  fileId: string;
  labelId: string;
  parentNodeId: string | null;
  type:
    | "dialogue"
    | "menu"
    | "menu_prompt"
    | "menu_choice"
    | "if"
    | "elif"
    | "else"
    | "jump"
    | "call"
    | "return"
    | "comment"
    | "action"
    | "raw_action"
    | "raw_block";
  content: string;
  order: string;
  sourceSpan: SourceSpan | null;
  metadata: Record<string, unknown>;
  visual: {
    position: { x: number; y: number }; // local to parent label/node frame
    size: { width: number; height: number };
  };
};
```

Связь:

```ts
type FlowEdge = {
  id: string;
  kind: "sequence" | "branch" | "jump" | "call" | "dynamic" | "diagnostic";
  sourceNodeId: string;
  targetNodeId: string | null;
  targetRef: string | null;
  resolved: boolean;
  derived: boolean;
  visual: {
    style: "solid" | "dashed" | "faded";
    opacity: number;
  };
};
```

ID policy:

1. При первичном импорте можно генерировать UUID.
2. Детерминированность ID между двумя независимыми импортами не является требованием MVP.
3. После импорта ID должны храниться в `ProjectGraph`/CRDT и не меняться при редактировании, сохранении, загрузке, перемещениях и коллаборации.
4. Запрещены ID на основе адреса объекта в памяти, индекса массива как единственного идентификатора или временной позиции на холсте.

Позиции:

1. `FileFrame.position` - глобальная позиция на холсте.
2. `LabelFrame.position` - локальная позиция относительно parent frame.
3. `LabelStartNode.position` и `ScenarioNode.position` - локальные позиции относительно owning label/node frame.
4. Движение нод и фреймов сохраняется в CRDT и видно другим участникам.
5. Viewport, zoom и текущий фокус пользователя персональные и не входят в MVP ProjectGraph.

## 8. Parser Strategy

MVP parser должен быть качественным уже в первой версии. Качество означает не максимальное количество special nodes, а корректное сохранение смысла и структуры.

Граница parser:

1. First-class nodes нужны для повествования, ветвлений, переходов и редактируемых автором блоков.
2. Непереходные presentation/action statements не создают отдельную сложную графовую семантику.
3. `scene`, `show`, `hide`, `with`, audio, image/effect blocks, python snippets и похожие statements становятся `action`, `raw_action` или `raw_block`, если они не создают ветку графа.
4. Строка вроде `show eileen happy at left with dissolve` никогда не является проблемой построения графа сама по себе.
5. Если parser не понимает statement, но может безопасно сохранить его как текст, он создает raw/action node и предупреждение максимум informational/warning уровня.
6. Blocking diagnostic нужен только когда нельзя безопасно сохранить/экспортировать структуру или становится неоднозначной вложенность.
7. Если сложный parent block невозможно разобрать безопасно, весь parent block сохраняется как `raw_block` с предупреждением.

MVP first-class subset:

1. Global label.
2. Local label.
3. Nested label.
4. `LabelStartNode`.
5. Dialogue/say.
6. Comment inside editable block.
7. Menu block.
8. Menu prompt text.
9. Menu choice text.
10. Menu choice condition.
11. Statements inside menu choice.
12. `if` / `elif` / `else`.
13. `jump`.
14. `call`.
15. `return`.
16. Action/raw line.
17. Action/raw block.

Тестовые fixtures должны быть общими для parser/resolver/export/layout. Они рассказывают историю про мышонка Ренпи и покрывают все инварианты применения `.rpy`, которые входят в MVP.

## 9. Label Semantics

Labels являются фреймами, а начало label является нодой.

Правила:

1. `label start:` создает `LabelFrame` и `LabelStartNode`.
2. `label .local:` создает вложенный `LabelFrame` внутри owning global label.
3. Nested labels создают вложенные `LabelFrame` по лексической структуре.
4. `LabelStartNode` принадлежит своему `LabelFrame` и является первой нодой label.
5. `jump label`, `jump .local`, `jump global.local`, `call label` резолвятся к `LabelStartNode`.
6. Dynamic targets создают unresolved/dynamic edge и diagnostic, но не ломают холст.
7. Runtime flow не меняет containment.
8. Фрейм не является endpoint связи.

Почему нужен `LabelStartNode`:

1. Пользователь уже ожидает отдельную мастер-ноду начала label.
2. Правило `edges only between nodes` остается строгим.
3. React Flow routing и handles проще: переход идет в конкретную ноду, а не в визуальный контейнер.
4. Label frame остается контейнером и визуальным ориентиром, а не смешивается с runtime endpoint.

## 10. React Flow Projection And Layout

React Flow получает только проекцию `ProjectGraph`.

Правила projection:

1. `FileFrame` и `LabelFrame` являются parent/group nodes React Flow.
2. `LabelStartNode` и `ScenarioNode` являются обычными visible nodes.
3. Containment передается через parent-child model, а не через видимые tree edges.
4. `FlowEdge` отображается только между node endpoints.
5. `jump`/`call` edge должен быть пунктирным или полупрозрачным, чтобы отличаться от локального flow.
6. Unresolved/dynamic edge может отображаться faded и попадать в problems/log panel.

Layout MVP:

1. Начать с flow-first hybrid layout.
2. Source order использовать только как fallback.
3. File frames расположить на общем холсте так, чтобы связанные flow-файлы были ближе.
4. Labels внутри file frame расположить по flow-связям и fallback order.
5. Nodes внутри label расположить по локальному flow.
6. Sibling frames не должны пересекаться.
7. Parent frame bounds считаются из children плюс padding.
8. Manual positions после drag сохраняются и не перетираются автоматическим relayout без явной команды.
9. Перед implementation проверить официальные React Flow docs по sub-flows/layouting. Если Dagre конфликтует с nested frames и внешними edges, перейти к ELK или гибридному layout.

## 11. Loro CRDT Strategy

Один проект использует один LoroDoc.

Целевая модель:

1. Loro Tree хранит containment: file -> label -> nested label -> label start/scenario node.
2. Loro Map/List хранит attributes: content, positions, sizes, metadata, diagnostics, cached edges.
3. UI operation превращается в domain operation.
4. Domain operation меняет CRDT state.
5. React Flow подписывается на projection из CRDT state.
6. WebSocket передает binary CRDT updates.
7. Сервер на hot path не интерпретирует graph, а ретранслирует updates по комнате.
8. Сервер сохраняет snapshots и, если дешево, append-only update log.

История:

1. Loro имеет технические primitives истории/version/frontiers.
2. Если их включение дешево, сохраняем как фундамент.
3. Пользовательский history UI, откаты и сравнение версий - полировка после MVP.

## 12. Persistence And Export

Persistence MVP:

1. Project graph snapshot обязателен.
2. Update log желателен, если естественно ложится на Loro updates.
3. Source file records нужны для import provenance.
4. Diagnostics/log records нужны, чтобы клиент мог показывать проблемы.
5. SQLite можно оставить для локального MVP, если схема не мешает PostgreSQL.

Export MVP:

1. Экспорт генерирует набор `.rpy` файлов из `ProjectGraph`.
2. `FileFrame.path` определяет файл назначения.
3. Labels и statements экспортируются в стабильном нормализованном виде.
4. Raw/action nodes экспортируются спокойно.
5. Comments сохраняются в соответствующем block UI и экспортируются.
6. Пустые строки и точная исходная indent/formatting не являются MVP-гарантией.
7. Metadata редактора не попадает в `.rpy`.
8. Export блокируется только high-risk diagnostics, которые явно мешают compile/export safety.

## 13. Diagnostics, Logs And Search

MVP diagnostics должны помогать, но не превращаться в отдельный продукт.

MVP включает:

1. Problems/log panel.
2. Поиск по словам внутри node content.
3. Переход к найденной ноде.
4. Warnings для unresolved/dynamic references.
5. Warnings для raw parent block fallback.
6. Blocking только для случаев, где нельзя безопасно сохранить/export.

Не MVP:

1. Подсветка всех affected frames.
2. Большой performance diagnostics UI.
3. Полноценная история редактирования в интерфейсе.
4. Персональное сохранение viewport/zoom.

## 14. Cleanup And Migration Policy

Пользователь хочет удалить все, что не пригодится для MVP 2.0. Это правильно, но удаление должно идти после инвентаризации.

Старый код классифицируется:

1. `keep` - можно использовать напрямую.
2. `adapt` - полезно, но нужно привести к 2.0.
3. `replace` - концепт нужен, реализацию лучше переписать.
4. `delete` - мешает или вводит в заблуждение.

Первый cleanup master item должен зафиксировать классификацию backend, frontend, parser, websocket, storage, tests и fixtures. После этого можно делать focused deletion commits.

## 15. TDD Process

Sprint - крупная waterfall-фаза.

Master item - завершенный TDD-круг внутри sprint:

1. Black-box expectation.
2. Fixture/test first.
3. Минимальная implementation.
4. Test verification.
5. Update docs/log.
6. Close.

Atomic actions - мелкие шаги внутри master item. Они помогают выполнить item, но не заменяют тест.

Начиная со Sprint 8, чтобы быстрее довести проект до рабочего MVP 2.0, планирование использует более мелкую единицу: `MVP Action`.

`MVP Action` - это атомарный пользовательский или системный результат внутри спринта. Каждый `MVP Action` обязан иметь:

1. Black-box expectation: что должно быть видно снаружи.
2. Action tests: тесты, которые падают до реализации именно этого результата.
3. Integration tests: связь этого результата с предыдущими actions и прошлыми спринтами.
4. Implementation: минимальный код, который закрывает expectation.
5. Verification: локальный тест action, затем затронутые integration tests.
6. Artifact update: запись в `UPDATES.md`; архитектурный документ обновляется, если меняется план.

Внутри `MVP Action` могут быть мелкие engineering steps, но они не считаются закрытыми без black-box и integration tests.

Шаблон:

```md
#### Master Item N.M: Name

Black-box expectation: внешнее поведение, проверяемое тестом.

Atomic actions:

1. Действие с ясным результатом.
2. Действие с ясным результатом.
3. Проверка.
```

## 16. Waterfall Sprints

### Sprint 0. Architecture Freeze And Cleanup Gate

Цель: закрепить правила MVP 2.0 и не дать старой базе путать разработку.

Definition of Done:

- README не содержит старую MVP 1.0 roadmap как источник правды.
- `AGENTS.md`, `UPDATES.md`, architecture doc существуют.
- LabelStartNode принят как обязательная нода.
- Parser/action/raw boundary принят.
- Есть cleanup inventory перед удалением кода.

#### Master Item 0.1: Documentation Pillars

Black-box expectation: новый агент может открыть repo и понять, какие документы являются источником истины.

Atomic actions:

1. Создать/заменить `AGENTS.md`.
2. Создать `UPDATES.md`.
3. Заменить старую README roadmap на указатель к новым документам.
4. Обновить architecture doc по последним решениям.
5. Проверить список tracked `.md`.
6. Закоммитить изменения.

#### Master Item 0.2: MVP 1.0 Inventory

Black-box expectation: перед удалением есть таблица `keep/adapt/replace/delete` по текущему коду и тестам.

Atomic actions:

1. Просмотреть backend modules.
2. Просмотреть frontend modules.
3. Просмотреть parser and flow transformer.
4. Просмотреть websocket/collab code.
5. Просмотреть tests and fixtures.
6. Записать классификацию в `UPDATES.md` или migration note.
7. Удалять только файлы, помеченные `delete`.

#### Master Item 0.3: Parser Coverage Matrix

Black-box expectation: есть matrix Ren'Py statements с решением `first-class`, `action/raw`, `raw_block`, `blocking`.

Atomic actions:

1. Проверить актуальные Ren'Py docs.
2. Проверить официальный `renpy/parser.py`.
3. Выписать statement categories.
4. Отметить MVP subset.
5. Отметить post-MVP subset.
6. Добавить ссылки на docs.
7. Связать matrix с будущими fixtures про мышонка Ренпи.

### Sprint 1. Fixtures And Parser MVP

Цель: получить `ProjectGraph` из multi-file `.rpy` проекта без UI.

Definition of Done:

- Есть fixture corpus про мышонка Ренпи.
- Multi-file import создает один `ProjectGraph`.
- Labels превращаются в frames и start nodes.
- Menu prompt text поддержан.
- Unknown/action statements сохраняются.
- IDs стабильны после импорта и сохранения.

#### Master Item 1.1: Mouse RenPy Fixture Corpus

Black-box expectation: тестовый проект содержит multi-file историю про мышонка Ренпи и покрывает MVP parser invariants.

Atomic actions:

1. Создать fixture file for day one.
2. Создать fixture file for day two.
3. Добавить global labels.
4. Добавить local/nested labels.
5. Добавить menus with prompt text and conditions.
6. Добавить if/elif/else.
7. Добавить jump/call/return.
8. Добавить comments/action/raw blocks.
9. Добавить duplicate/unresolved/dynamic reference fixtures для diagnostics.

#### Master Item 1.2: Multi-file Import

Black-box expectation: список `.rpy` файлов импортируется в один `ProjectGraph` с несколькими `FileFrame`.

Atomic actions:

1. Написать black-box test на fixture corpus.
2. Найти текущую MVP 1.0 загрузку нескольких файлов.
3. Решить `adapt` или `replace`.
4. Реализовать project import service.
5. Сохранить file path/order.
6. Проверить test.

#### Master Item 1.3: Persistent Generated IDs

Black-box expectation: после import -> snapshot -> load -> edit IDs тех же сущностей не меняются.

Atomic actions:

1. Написать test на сохранение IDs после load.
2. Написать test на сохранение IDs после content edit.
3. Убрать ID на основе runtime object identity.
4. Генерировать UUID при создании сущности.
5. Сохранять UUID в ProjectGraph/CRDT payload.
6. Проверить tests.

#### Master Item 1.4: Label Frames And LabelStartNode

Black-box expectation: global/local/nested labels импортируются как `LabelFrame`, и каждый имеет `LabelStartNode`.

Atomic actions:

1. Написать test на global label frame.
2. Написать test на local label frame.
3. Написать test на nested label frame.
4. Написать test на ровно один start node per label.
5. Реализовать scope/parent tracking.
6. Проверить tests.

#### Master Item 1.5: Menu Semantics

Black-box expectation: menu prompt text, choice text, choice condition и statements внутри choice представлены отдельно.

Atomic actions:

1. Написать fixture menu with prompt text.
2. Написать fixture choices with conditions.
3. Написать black-box parser test.
4. Реализовать menu parser mapping.
5. Проверить tests.

#### Master Item 1.6: Action And Raw Preservation

Black-box expectation: `show`, `scene`, effects, python/action lines and unknown safe blocks становятся action/raw nodes и экспортируются без потери текста.

Atomic actions:

1. Добавить action/raw examples в mouse fixture.
2. Написать parser test.
3. Написать export preservation test stub or expectation.
4. Реализовать action/raw mapper.
5. Проверить tests.

#### Master Item 1.7: If/Elif/Else And Comments

Black-box expectation: runtime `if`/`elif`/`else` chains and comments inside editable label blocks import as first-class `ScenarioNode`s and survive snapshot roundtrip.

Atomic actions:

1. Reuse mouse fixture `if`/`elif`/`else` chain and label comments.
2. Write black-box parser tests for branch nodes and branch child statements.
3. Write black-box parser tests for comment nodes.
4. Implement conditional/comment mapping without duplicating consumed lines in action/raw scan.
5. Verify Sprint 1 tests.

### Sprint 2. Resolver And Diagnostics

Цель: надежно разрешать `jump/call` на уровне проекта.

Definition of Done:

- Global labels ищутся по проекту.
- Local labels резолвятся в своем scope.
- Cross-file jumps работают.
- Edges target `LabelStartNode`.
- Dynamic/unresolved references диагностируются.

#### Master Item 2.1: Global And Cross-file Resolver

Black-box expectation: `jump label_in_other_file` создает resolved edge к `LabelStartNode` другого файла.

Atomic actions:

1. Написать cross-file fixture.
2. Написать resolver test.
3. Создать project label index.
4. Resolve target to LabelStartNode.
5. Проверить test.

#### Master Item 2.2: Local Resolver

Black-box expectation: `jump .local` резолвится внутри owning global label, даже если другое `.local` есть в соседнем label.

Atomic actions:

1. Добавить два global labels с одинаковыми local names.
2. Написать scope isolation test.
3. Реализовать local index.
4. Resolve local target to LabelStartNode.
5. Проверить test.

#### Master Item 2.3: Diagnostics MVP

Black-box expectation: duplicate labels, unresolved targets and dynamic targets попадают в diagnostics/log, но безопасные raw/action nodes не блокируют graph.

Atomic actions:

1. Написать duplicate label test.
2. Написать unresolved target test.
3. Написать dynamic target test.
4. Написать safe raw/action non-error test.
5. Реализовать diagnostic builder.
6. Проверить tests.

### Sprint 3. Export Roundtrip

Цель: генерировать `.rpy` из `ProjectGraph`.

Definition of Done:

- Import -> export -> import сохраняет семантику MVP subset.
- Multi-file destinations сохраняются.
- Raw/action content не теряется.
- Editor metadata не попадает в `.rpy`.

#### Master Item 3.1: Single-file Roundtrip

Black-box expectation: простой file fixture roundtrip сохраняет labels, nodes, comments, action/raw text.

Atomic actions:

1. Написать semantic equivalence test.
2. Реализовать node renderer.
3. Реализовать label renderer.
4. Реализовать file renderer.
5. Проверить test.

#### Master Item 3.2: Multi-file Roundtrip

Black-box expectation: nodes экспортируются в файлы по `FileFrame.path`.

Atomic actions:

1. Написать multi-file export test.
2. Реализовать per-file grouping.
3. Реализовать stable normalized ordering.
4. Убедиться, что metadata не экспортируется.
5. Проверить test.

### Sprint 4. React Flow Projection And Layout

Цель: показать весь `ProjectGraph` на холсте без collapse.

Definition of Done:

- File frames, label frames, LabelStartNode and scenario nodes отображаются.
- Parent-child containment не теряется.
- Sibling frames не пересекаются.
- Edges только node-to-node.
- Layout flow-first.

#### Master Item 4.1: Static Projection

Black-box expectation: `ProjectGraph` превращается в React Flow nodes/edges with correct parent-child ids.

Atomic actions:

1. Проверить React Flow sub-flow docs.
2. Написать projection unit test.
3. Реализовать FileFrame nodes.
4. Реализовать LabelFrame group nodes.
5. Реализовать LabelStartNode nodes.
6. Реализовать ScenarioNode nodes.
7. Реализовать FlowEdge projection.
8. Проверить test.

#### Master Item 4.2: Flow-first Layout

Black-box expectation: layout располагает files/labels/nodes по flow-связям, не пересекает siblings и не использует collapse.

Atomic actions:

1. Проверить React Flow layout docs.
2. Проверить Dagre limitations for sub-flows.
3. Написать layout invariant tests.
4. Реализовать simple hybrid layout.
5. Добавить source order fallback.
6. Сохранить manual positions after drag.
7. Проверить tests.

#### Master Item 4.3: Search And Problems Panel

Black-box expectation: пользователь ищет текст и переходит к найденной ноде; diagnostics доступны в log panel.

Atomic actions:

1. Написать search test over ProjectGraph.
2. Реализовать node text index.
3. Реализовать navigation target.
4. Реализовать problems/log projection.
5. Проверить tests.

### Sprint 5. Loro CRDT Adapter

Цель: хранить ProjectGraph в Loro и получать convergence.

Definition of Done:

- Snapshot roundtrip работает.
- Два клиента сходятся после обмена updates.
- Containment operations не теряют вложенность.
- Positions/content/metadata синхронизируются.

#### Master Item 5.1: Loro Storage Proof

Black-box expectation: minimal ProjectGraph сохраняется в LoroDoc and restores back equal by semantics and IDs.

Atomic actions:

1. Проверить Loro Tree docs.
2. Проверить Loro encoding docs.
3. Написать snapshot roundtrip test.
4. Реализовать minimal adapter.
5. Проверить test.

#### Master Item 5.2: CRDT Convergence

Black-box expectation: две копии после независимых edits and update exchange converge to same ProjectGraph.

Atomic actions:

1. Написать two-doc convergence test.
2. Изменить content на client A.
3. Переместить node/frame на client B.
4. Обменять binary updates.
5. Реализовать missing operations.
6. Проверить test.

### Sprint 6. WebSocket Relay And Persistence

Цель: заменить JSON structure updates binary CRDT relay.

Definition of Done:

- WebSocket принимает binary updates.
- Server routes by project room.
- Presence/log messages отделены от CRDT updates.
- Snapshot save/load работает.

#### Master Item 6.1: Binary Relay

Black-box expectation: update from client A reaches client B byte-for-byte enough for CRDT merge.

Atomic actions:

1. Написать websocket integration test.
2. Добавить binary receive path.
3. Broadcast bytes to room.
4. Keep presence as separate channel/message type.
5. Проверить test.

#### Master Item 6.2: Snapshot Persistence

Black-box expectation: after snapshot save, new client opens same ProjectGraph with same IDs.

Atomic actions:

1. Спроектировать DB migration.
2. Написать persistence test.
3. Добавить snapshot table/model.
4. Добавить save/load service.
5. Проверить test.

### Sprint 7. Editor Migration

Цель: перевести UI на ProjectGraph/CRDT without old line-range source of truth.

Definition of Done:

- UI открывает project graph snapshot.
- Node editor writes domain operations.
- React Flow drag writes positions to CRDT.
- Collaboration end-to-end работает.
- Export uses ProjectGraph.

#### Master Item 7.1: Read-only Canvas 2.0

Black-box expectation: UI opens project graph and renders one full canvas with files, labels and nodes.

Atomic actions:

1. Add load route for ProjectGraph snapshot.
2. Connect projection adapter.
3. Render frames and nodes.
4. Render node-to-node edges.
5. Add smoke test.

#### Master Item 7.2: Editable Collaborative Canvas

Black-box expectation: content edit or drag changes CRDT state, appears on second client and survives reload.

Atomic actions:

1. Написать UI/domain operation test.
2. Connect node editor to domain operation.
3. Connect drag to position operation.
4. Convert operations to Loro updates.
5. Verify second client.
6. Verify persistence.

### Sprint 8. Product Import And Open Pipeline

Цель: пользователь может загрузить `.rpy` файлы проекта и открыть рабочий ProjectGraph 2.0 canvas без ручной подготовки snapshot.

Definition of Done:

- Multi-file `.rpy` upload creates one ProjectGraph.
- Import runs parser, resolver, diagnostics, initial layout, and CRDT snapshot save.
- Opening a project loads the saved ProjectGraph snapshot into the canvas.
- Export after import uses ProjectGraph and returns normalized multi-file `.rpy`.
- Old line-range script tree is not required for this path.

#### MVP Action 8.1: ProjectGraph Import API

Black-box expectation: authenticated user uploads multiple `.rpy` files to a project and receives a ProjectGraph import result with saved CRDT snapshot.

Action tests:

1. Upload mouse RenPy fixture files to `POST /api/projects/{project_id}/graph-import`.
2. Assert response includes project ID, file count, label count, node count, diagnostics summary, and snapshot availability.
3. Assert the saved snapshot reloads through `GET /graph-snapshot` and preserves entity IDs.

Integration tests:

1. Import API uses Sprint 1 parser/importer, Sprint 2 resolver, Sprint 5 CRDT snapshot, and Sprint 6 persistence.
2. Imported graph exports through Sprint 3 exporter without editor metadata.

#### MVP Action 8.2: Frontend Import Flow

Black-box expectation: user selects project files in the UI, starts import, and then lands on the ProjectGraph canvas for that project.

Action tests:

1. Frontend API posts a `multipart/form-data` import request with several `.rpy` files.
2. Import result routes the editor to `?project={project_id}`.
3. Error state is shown when import returns blocking diagnostics or server failure.

Integration tests:

1. Import flow calls Sprint 7 snapshot loading after the backend saves the CRDT snapshot.
2. Canvas projection from Sprint 4 renders file frames, label frames, label starts, nodes, and relation edges from the imported snapshot.

#### MVP Action 8.3: Import Diagnostics UX

Black-box expectation: after import, non-blocking diagnostics are visible in Problems, while safe raw/action statements do not block opening the canvas.

Action tests:

1. Import diagnostic fixture with duplicate label, unresolved target, dynamic target, and unsupported raw block.
2. Assert non-blocking diagnostics appear in Problems panel with searchable/focusable node references where available.
3. Assert safe `scene/show/with/audio/python/raw` preservation does not create blocking errors.

Integration tests:

1. Diagnostics semantics match Sprint 2 resolver/import diagnostics.
2. Problems projection and search behavior match Sprint 4 canvas contracts.

#### MVP Action 8.4: Import To Export Contract

Black-box expectation: imported multi-file project can be immediately exported back into normalized `.rpy` files with the same MVP semantics.

Action tests:

1. Import full mouse RenPy corpus through the API.
2. Export through `POST /graph-export`.
3. Re-import exported files and compare semantic labels, node type counts, edges, diagnostics semantics, comments, and raw/action content.

Integration tests:

1. Covers Sprint 1 parser, Sprint 2 resolver, Sprint 3 exporter, Sprint 6 persistence, and Sprint 7 editor export route in one contract.

### Sprint 9. Real Collaboration And Persistence Hardening

Цель: доказать, что MVP 2.0 работает в реальном браузерном сценарии с двумя клиентами, reload и сохранением.

Definition of Done:

- Two browser clients open one project canvas.
- Edit and drag in one client appear in the other.
- Latest state survives reload.
- Snapshot saving is debounced and observable.
- JSON presence/log messages never corrupt binary CRDT state.

#### MVP Action 9.1: Browser Two-client Collaboration Smoke

Black-box expectation: two real browser contexts see the same project; edit/drag in client A appears in client B without manual refresh.

Action tests:

1. Start backend and frontend test server.
2. Open the same imported project in two browser contexts.
3. Edit one scenario node in client A.
4. Drag one frame or node in client A.
5. Assert client B displays the new content and position.

Integration tests:

1. Verifies Sprint 4 React Flow projection, Sprint 5 CRDT updates, Sprint 6 WebSocket relay, and Sprint 7 editor session together.

#### MVP Action 9.2: Debounced Snapshot Persistence

Black-box expectation: rapid edits do not spam snapshot saves, but the final state is persisted and reloadable.

Action tests:

1. Perform multiple fast content edits and drag events in one session.
2. Assert save indicator enters saving/saved/error states correctly.
3. Assert save calls are debounced or coalesced.
4. Reload project and assert final content/position survived.

Integration tests:

1. Snapshot bytes remain valid Loro snapshots after debounced saves.
2. Reload uses Sprint 7 `GET /graph-snapshot` and opens through Sprint 4 canvas.

#### MVP Action 9.3: Reconnect And Remote Update Recovery

Black-box expectation: a client that disconnects and reconnects catches up from the latest snapshot or incoming updates without losing local graph shape.

Action tests:

1. Open two clients.
2. Disconnect client B.
3. Edit/drag in client A and persist.
4. Reconnect or reload client B.
5. Assert client B sees the latest graph and no duplicate entities.

Integration tests:

1. Uses Sprint 5 duplicate update idempotency.
2. Uses Sprint 6 room routing and Sprint 7 snapshot load.

#### MVP Action 9.4: Presence And Binary Channel Separation

Black-box expectation: active user JSON events and binary CRDT updates share one project socket without corrupting each other.

Action tests:

1. Connect two clients to one project room.
2. Assert presence JSON is displayed or safely ignored by CRDT logic.
3. Send binary update and assert only CRDT state changes.
4. Send ping/presence JSON and assert graph does not change.

Integration tests:

1. Extends Sprint 6 mixed-frame backend tests.
2. Extends Sprint 7 frontend WebSocket helper tests.

### Sprint 10. Editor UX And Export Readiness

Цель: сделать canvas 2.0 достаточно удобным для реального MVP-использования без расширенной полировки.

Definition of Done:

- Node editor handles MVP node types without metadata leakage.
- Drag/manual layout survives reload.
- Export has predictable user-facing behavior.
- Blocking diagnostics gate unsafe export; warnings do not block.
- Search and Problems work after live CRDT updates.

#### MVP Action 10.1: Typed Scenario Node Editor

Black-box expectation: user can edit dialogue, comment, jump, call, return, raw_action, raw_block, menu prompt, and menu choice content through one clear editor surface.

Action tests:

1. Select each MVP node type and edit its user-visible text.
2. Assert ProjectGraph CRDT state changes only the intended content/metadata fields.
3. Assert editor metadata is not added to export output.

Integration tests:

1. Edited nodes export correctly through Sprint 3 exporter.
2. Edited nodes sync through Sprint 9 collaboration path.

#### MVP Action 10.2: Manual Layout Persistence

Black-box expectation: manual positions after drag remain stable after save, reload, and collaboration update.

Action tests:

1. Drag `FileFrame`, `LabelFrame`, `LabelStartNode`, and `ScenarioNode`.
2. Save snapshot and reload.
3. Assert local/global position rules are preserved.

Integration tests:

1. Uses Sprint 4 containment projection.
2. Uses Sprint 5 CRDT position storage.
3. Uses Sprint 9 real browser collaboration if available.

#### MVP Action 10.3: Export Safety Gate

Black-box expectation: export is allowed with warnings but blocked by diagnostics that explicitly make safe export impossible.

Action tests:

1. Export graph with warning diagnostics and assert files are returned.
2. Export graph with blocking diagnostic and assert clear user-facing failure.
3. Assert dynamic/unresolved warnings remain visible but do not block MVP export unless marked blocking.

Integration tests:

1. Matches Sprint 2 diagnostics semantics.
2. Matches Sprint 3 metadata exclusion and raw preservation.
3. Matches Sprint 7 `POST /graph-export` route.

#### MVP Action 10.4: Live Search And Problems After Edits

Black-box expectation: after collaborative edits or local edits, Search and Problems operate on the current CRDT graph, not stale initial projection.

Action tests:

1. Edit node content so it starts matching a new search query.
2. Assert search result appears and focuses the edited node.
3. Apply remote diagnostic-bearing update and assert Problems panel updates.

Integration tests:

1. Connects Sprint 4 search/problems projection, Sprint 5 CRDT graph conversion, and Sprint 9 collaboration updates.

#### MVP Action 10.5: Export UX Contract

Black-box expectation: user can request export from the canvas and receive the generated file set in a predictable format.

Action tests:

1. Click export in canvas.
2. Assert export status transitions through exporting/success/failure.
3. Assert returned file names match `FileFrame.path`.
4. Assert file contents are normalized `.rpy` text.

Integration tests:

1. Uses Sprint 8 imported graph.
2. Uses Sprint 10 edited graph.
3. Uses Sprint 3 exporter through Sprint 7 route.

### Sprint 11. MVP 2.0 Release Gate And Cleanup

Цель: превратить технически собранный vertical slice в рабочий MVP 2.0, который можно дать пользователю без ручных шагов.

Definition of Done:

- One end-to-end release test covers import, open, edit, drag, collaborate, reload, search, problems, export, and re-import.
- Old MVP 1.0 paths that conflict with MVP 2.0 are removed or clearly isolated.
- Build/test commands are green from clean checkout.
- Known non-blocking follow-ups are documented.
- Architecture and `UPDATES.md` say MVP 2.0 is ready only if the release gate passes.

#### MVP Action 11.1: Full MVP 2.0 End-to-end Contract

Black-box expectation: one test proves the complete user path from `.rpy` files to collaborative canvas and exported `.rpy` files.

Action tests:

1. Create project.
2. Import mouse RenPy fixture files.
3. Open canvas.
4. Edit one node.
5. Drag one frame.
6. Open second client and verify sync.
7. Reload first client and verify persisted state.
8. Search for edited text.
9. Open Problems for known warning.
10. Export files.
11. Re-import exported files and compare semantics.

Integration tests:

1. This is the cross-sprint release test for Sprints 1-10.

#### MVP Action 11.2: MVP 1.0 Conflict Cleanup

Black-box expectation: MVP 2.0 editor path no longer depends on or accidentally routes through old line-range editor/collaboration code.

Action tests:

1. Open MVP 2.0 editor route and assert it uses ProjectGraph snapshot API.
2. Assert old line-range insert/update endpoints are not called by the MVP 2.0 editor path.
3. Assert old JSON lock collaboration does not run for ProjectGraph canvas.

Integration tests:

1. Cleanup follows `docs/mvp-1-inventory.md`.
2. Full backend and frontend suites remain green after each focused deletion/isolation step.

#### MVP Action 11.3: Build And Bundle Release Gate

Black-box expectation: production build succeeds and either meets an explicit bundle budget or documents a conscious MVP exception.

Action tests:

1. Run production build from clean frontend state.
2. Assert no TypeScript/Vite build failure.
3. Assert bundle size is checked against the current MVP budget.

Integration tests:

1. If `loro-crdt/base64` remains, document it as accepted MVP exception with post-MVP optimization task.
2. If replaced with explicit WASM/code splitting, rerun Sprint 5/7/9 collaboration tests.

#### MVP Action 11.4: Release Documentation And Operator Notes

Black-box expectation: a new agent or developer can run, test, and demo MVP 2.0 without relying on chat history.

Action tests:

1. Follow README/AGENTS instructions from a clean checkout.
2. Run documented backend tests, frontend tests, and frontend build.
3. Confirm MVP 2.0 demo path is documented: create project, import files, open canvas, collaborate, export.

Integration tests:

1. Documentation links to current artifacts only.
2. `UPDATES.md` records final release gate status and known follow-ups.

## 17. Decision Log

### 2026-05-01

1. `LabelStartNode` обязателен. Это видимая мастер-нода начала label.
2. `jump/call` target is `LabelStartNode`, not `LabelFrame`.
3. Edges only between nodes.
4. `LabelFrame` is a frame/container, not runtime endpoint.
5. ID determinism across independent imports is not MVP requirement. Stable persisted IDs after import are required.
6. Parser MVP must be high quality: safe unknown/action statements become action/raw nodes, not graph errors.
7. Presentation/effect statements that do not create narrative branches are action/raw nodes.
8. Test fixtures must tell a story about a mouse named RenPy and cover MVP invariants.
9. Old MVP 1.0 README roadmap replaced with pointers to MVP 2.0 artifacts.
10. Broad code deletion requires inventory first.

### 2026-04-30

1. One project uses one large canvas.
2. One project uses one LoroDoc.
3. File frames and label frames are visual anchors.
4. Nested labels are frames inside frames.
5. No collapse/fold in MVP 2.0.
6. Layout is flow-first; source order is fallback.
7. Viewport/zoom are personal and not part of MVP ProjectGraph.
8. Comments are preserved and visible in related block UI.
9. Stable normalized export is more important than exact source formatting.
10. Official docs are mandatory before implementation decisions.

## 18. Open Questions That Do Not Block MVP

1. Exact Loro container layout: confirm Tree + Map/List through Sprint 5 proof.
2. Layout engine: start hybrid; switch to ELK if React Flow/Dagre limitations make nested frames unreliable.
3. User-facing history UI: postpone unless Loro primitives make a tiny version almost free.
4. Personal viewport persistence: store later as user preference.
5. Rich diagnostics UX: postpone frame highlighting and large-project performance UI.
