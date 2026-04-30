# RenPy Visual Editor 2.0 Architecture Plan

Дата фиксации: 2026-04-30

## 1. Цель

Версия 2.0 должна заменить текущую модель "один файл = один граф" на единый проектный холст. Холст отображает все `.rpy` файлы проекта, глобальные и локальные label-фреймы, statement-ноды и отдельный слой отношений для `jump` / `call`.

Главная цель: сделать редактор предсказуемым для одиночной и совместной работы. React Flow должен быть только визуальной проекцией доменной модели, а не источником правды.

## 2. Критерии Качества и Базовые Решения

Я считаю понимание качественным только если оно проверяется по внешним критериям, а не по ощущению стройности архитектуры.

Критерии качества для архитектуры 2.0:

1. Пользовательский сценарий объясняется без внутренних деталей: автор видит один проектный холст, файлы, label-фреймы, локальные label-фреймы и ноды сценария.
2. Семантика Ren'Py не искажается ради красивого графа: containment, runtime flow и visual layout разделены.
3. MVP отделен от полировки: все, что не нужно для первого рабочего 2.0, фиксируется как задел, но не блокирует основной путь.
4. Каждый master item имеет black-box expectation и может быть закрыт через TDD-круг.
5. Любое решение по React Flow, Loro и Ren'Py сверяется с официальной документацией перед реализацией.
6. Если реализация показывает, что прежнее решение дорого или неверно, документ обновляется до продолжения разработки.

Базовые решения:

1. Серверный parser остается владельцем Ren'Py-семантики.
2. Клиент отвечает за визуальное представление, layout и React Flow projection.
3. Источником правды 2.0 становится `ProjectGraph`, сохраненный в CRDT-модели.
4. `.rpy` файлы после импорта становятся источником начальной семантики и provenance, но не источником live-состояния холста.
5. Экспорт генерирует `.rpy` файлы из `ProjectGraph`.
6. WebSocket в целевой модели пересылает бинарные CRDT updates, а не JSON-патчи структуры.
7. Один проект использует один LoroDoc, потому что целевой UX - один монстр-холст проекта.
8. Фреймы и ноды можно двигать; их позиции сохраняются и синхронизируются как часть проекта.
9. Viewport и zoom являются персональными и не входят в MVP 2.0. Серверное хранение последнего viewport пользователя - полировка после MVP.
10. Официальная документация является обязательным источником перед каждым архитектурным или API-решением.

## 3. Источники Официальной Документации

Перед реализацией каждого мастер-пункта нужно сверяться с актуальной официальной документацией и фиксировать использованные ссылки в decision log этого файла или в отдельном ADR.

Основные источники:

- Ren'Py latest: https://www.renpy.org/latest.html
- Ren'Py Language Basics: https://www.renpy.org/doc/html/language_basics.html
- Ren'Py Labels and Control Flow: https://www.renpy.org/doc/html/label.html
- Ren'Py Menus: https://www.renpy.org/doc/html/menus.html
- Ren'Py source parser: https://github.com/renpy/renpy/blob/master/renpy/parser.py
- React Flow docs: https://reactflow.dev/learn
- React Flow sub-flows / parent-child nodes: https://reactflow.dev/learn/layouting/sub-flows
- React Flow layouting: https://reactflow.dev/learn/layouting/layouting
- React Flow collaborative guidance: https://reactflow.dev/learn/advanced-use/multiplayer
- Loro docs: https://www.loro.dev/docs
- Loro Tree tutorial: https://www.loro.dev/docs/tutorial/tree
- Loro encoding / updates: https://www.loro.dev/docs/tutorial/encoding
- Loro Python package: https://pypi.org/project/loro/

Правило: если документация React Flow, Loro или Ren'Py противоречит нашим предположениям, меняется план, а не документация игнорируется.

## 4. Термины

`ProjectGraph` - доменная модель всего Ren'Py-проекта.

`FileFrame` - визуальная область файла `.rpy` на общем холсте.

`LabelFrame` - визуальный прямоугольный фрейм глобального или локального label. Label-фрейм является ориентиром на холсте и entry point для переходов.

`StatementNode` - визуальная нода конкретного Ren'Py statement или блока statements.

`RelationEdge` - не-древовидная связь, например `jump`, `call`, unresolved dynamic relation, reference или diagnostic relation.

`TreeEdge` - связь владения: file содержит label, label содержит statement, label может содержать вложенный label.

`Projection` - преобразование `ProjectGraph` в React Flow `nodes` / `edges`.

`Sprint` - крупная waterfall-фаза с definition of done.

`Master Item` - завершенный TDD-круг внутри спринта. Для него заранее ясно ожидаемое поведение, можно написать black-box tests, реализовать код и закрыть пункт проверкой.

`Atomic Action` - маленькое действие внутри master item. Оно не обязано быть самостоятельным TDD-кругом, но должно иметь очевидный результат и способ выполнения.

## 5. ProjectGraph IR

Минимальная целевая форма:

```ts
type ProjectGraph = {
  projectId: string;
  files: FileFrame[];
  labels: LabelFrame[];
  statements: StatementNode[];
  treeEdges: TreeEdge[];
  relationEdges: RelationEdge[];
  diagnostics: GraphDiagnostic[];
  sourceIndex: SourceIndex;
};
```

`FileFrame` - глобальный контейнер файла на холсте:

```ts
type FileFrame = {
  id: string;
  path: string;
  order: string;
  visual: {
    position: { x: number; y: number }; // absolute canvas position
    size: { width: number; height: number };
  };
};
```

`LabelFrame` - одновременно визуальный контейнер и техническая React Flow node, к которой можно вести relation edge. Отдельная `LabelEntryNode` не является обязательной для MVP.

```ts
type LabelFrame = {
  id: string;
  fileId: string;
  name: string;
  qualifiedName: string;
  scope: "global" | "local";
  parentLabelId: string | null;
  sourceSpan: SourceSpan | null;
  visual: {
    position: { x: number; y: number }; // local to parent frame
    size: { width: number; height: number };
    colorToken: string;
  };
};
```

`StatementNode` - нода сценарного содержимого. Все обычные Ren'Py-строки, которые parser пока не выделяет как особую конструкцию, остаются нормальными raw/default statement nodes, а не ошибками.

```ts
type StatementNode = {
  id: string;
  fileId: string;
  labelId: string;
  parentStatementId: string | null;
  type:
    | "dialogue"
    | "scene"
    | "show"
    | "hide"
    | "menu"
    | "menu_prompt"
    | "menu_choice"
    | "if"
    | "elif"
    | "else"
    | "jump"
    | "call"
    | "return"
    | "python"
    | "comment"
    | "raw_statement"
    | "raw_block";
  content: string; // plain text, close to .rpy source content
  order: string;
  sourceSpan: SourceSpan | null;
  metadata: Record<string, unknown>;
  visual: {
    position: { x: number; y: number }; // local to parent label/statement frame
    size: { width: number; height: number };
  };
};
```

`RelationEdge` - связь только между React Flow nodes. Source чаще всего statement node (`jump` / `call`), target может быть `LabelFrame` node или другой `StatementNode`, если речь о ветке внутри label.

```ts
type RelationEdge = {
  id: string;
  kind: "jump" | "call" | "dynamic_jump" | "dynamic_call" | "reference" | "diagnostic";
  sourceId: string;
  targetId: string | null;
  targetRef: string | null;
  resolved: boolean;
  derived: boolean;
  visual: {
    style: "dashed" | "solid" | "faded";
    opacity: number;
  };
};
```

Позиционная модель:

1. `FileFrame.position` хранится в координатах всего холста.
2. `LabelFrame.position` хранится локально относительно parent frame.
3. `StatementNode.position` хранится локально относительно parent label/statement frame.
4. Перемещения фреймов и нод сохраняются в CRDT и видны другим участникам.
5. Viewport/zoom не сохраняются в ProjectGraph.

## 6. Холст 2.0

На итоговом холсте 2.0 ничего не должно складываться или сворачиваться. Для коллаборационной работы сворачивание контринтуитивно: один участник может потерять визуальный контекст другого.

Ориентир: ясная генерация и оформление всего холста, чтобы пользователь мог зумить, перемещаться, искать и быстро находить нужный узел.

Структура холста:

```text
Canvas
  FileFrame
    Global LabelFrame
      Local/Nested LabelFrame
        StatementNode
        StatementNode
        If/Menu branch nodes
```

Обязательные UX-решения:

1. Все файлы проекта видимы как `FileFrame`.
2. Все глобальные и локальные labels видимы как `LabelFrame`.
3. Sibling label-фреймы не пересекаются.
4. Вложенные labels отображаются как frame внутри frame.
5. Связи отображаются только между React Flow nodes.
6. `jump` / `call` не перестраивают containment tree. Они создают relation edges и layout constraints.
7. Relation edge для `jump` / `call` может идти напрямую к label-frame, потому что label-frame сам является React Flow node. Отдельная visible `LabelEntryNode` не нужна для MVP.
8. Если в будущем прямое подключение к frame ухудшит routing/handles, можно добавить скрытые технические handles внутри label-frame без введения отдельной видимой ноды.
9. Layout всего холста строится по flow-связям, а не по source order. Source order остается fallback и экспортным порядком, если flow-связь не дает ответа.
10. Навигация MVP опирается на zoom, minimap, search и problems/log panel, но не на collapse.

Почему не нужна обязательная `LabelEntryNode`:

1. React Flow group/frame тоже является node, если мы реализуем label-frame как custom node.
2. Edge может вести на label-frame node напрямую.
3. Отдельная entry-нода нужна только если мы хотим иметь стабильную видимую точку входа внутри frame, но это усложняет холст.
4. Для MVP проще и понятнее: `jump/call statement node -> target label-frame node`.

## 7. Parser Strategy

У Ren'Py нет очевидного официального ANTLR-файла. Практический источник правды - официальный Python parser, lexer и AST.

Стратегия:

1. Закрепить версию Ren'Py, относительно которой проект проверяется.
2. Построить matrix statements по официальному `renpy/parser.py`.
3. Разделить statements на first-class nodes, raw/default statement nodes, preserved raw blocks и blocking diagnostics.
4. Начать с narrative/control-flow subset.
5. Все parser-расширения писать через fixtures и black-box tests.

Критический инвариант: строка Ren'Py внутри label не становится проблемой только потому, что parser пока не знает ее как отдельный typed statement. Например `show eileen happy at left with dissolve` для MVP может стать обычной `raw_statement` нодой и спокойно экспортироваться.

Минимальный parser subset для 2.0 MVP:

- global label;
- local label;
- nested label;
- dialogue / say;
- comments inside editable block;
- raw/default statement;
- raw/default block;
- menu prompt text;
- menu choice;
- menu choice condition;
- if / elif / else;
- jump;
- call;
- return.

## 8. Label Semantics

Глобальные и локальные labels являются frame'ами на доске.

Правила:

1. Global label создает top-level `LabelFrame` внутри `FileFrame`.
2. Local label начинается с `.` и получает `parentLabelId`.
3. Nested label создает вложенный `LabelFrame`.
4. Label-фреймы одного уровня не должны пересекаться.
5. Вложенность frame'ов отражает лексическое положение в исходниках, а не runtime-переходы.
6. Resolver обязан различать `jump label`, `jump .local`, `jump global.local`, dynamic jump/call.
7. Runtime-связи между labels используются для layout constraints и relation overlay, но не меняют containment.
8. Связи должны идти между nodes: jump/call statement node -> target label-frame node.

## 9. Menu Semantics

Меню нельзя считать только набором choice-веток.

Нужные элементы:

1. `menu:` или named menu.
2. Prompt/caption text, отображаемый во время выбора.
3. Choice text.
4. Choice condition.
5. Choice arguments.
6. Statements внутри choice.
7. Unknown menu children preserved with diagnostic.

## 10. CRDT Strategy

Целевой CRDT-слой должен хранить `ProjectGraph`, а не React Flow state напрямую.

MVP-модель:

1. Один LoroDoc на проект.
2. Loro Tree хранит containment hierarchy: file -> label -> local/nested label -> statement.
3. Loro Map/List хранит attributes: text content, visual positions, metadata, diagnostics и cached relation edges.
4. Позиции file frames глобальные; позиции label frames и statement nodes локальные относительно parent frame.
5. Текст statement node хранится как plain string, близко к `.rpy`.
6. Relation edges для `jump/call` считаются derived from content, но могут кэшироваться в CRDT для быстрых projection/layout.
7. React Flow projection подписывается на изменения CRDT-документа.
8. UI operations превращаются в доменные операции, затем в CRDT operations.
9. Сервер принимает и ретранслирует бинарные updates.
10. Сервер периодически сохраняет snapshot и, если это дешево, append-only update log.

История редактирования:

1. Loro имеет OpLog, version/frontiers и time travel. Это значит, что фундамент истории уже есть в библиотеке.
2. Для MVP не строим полноценный UI истории редактирования.
3. Если timestamp recording и update log подключаются без существенной сложности, включаем их как технический фундамент.
4. Пользовательский timeline, откаты, сравнения версий и удобный history UI остаются полировкой после MVP.

Персональное состояние:

1. Viewport, zoom, выбранные панели и последний фокус пользователя не входят в ProjectGraph MVP.
2. Их можно хранить на сервере позже как user preferences, чтобы пользователь возвращался туда, где остановился.

## 11. Persistence Strategy

Целевая БД должна хранить не только текст scripts, но и проектное состояние.

Минимальные сущности MVP:

- project graph snapshot;
- optional CRDT update log, если стоимость внедрения мала;
- source file records;
- export versions;
- import provenance;
- diagnostics/log records для клиента.

SQLite допустим для локального MVP, но схема не должна мешать PostgreSQL.

Политика snapshot/update log:

1. Snapshot - обязательный механизм восстановления проекта.
2. Update log - желателен, особенно если он естественно ложится на Loro updates.
3. Старые updates можно compact'ить после нового snapshot.
4. Полный пользовательский edit history не блокирует MVP 2.0.

## 12. Export Strategy

Экспорт должен генерировать обратно набор `.rpy` файлов.

Правила MVP:

1. `FileFrame.path` определяет файл назначения.
2. Порядок labels/statements определяется flow-layout order там, где он однозначен, и source/order fallback там, где flow не дает ответа.
3. Raw/default statements экспортируются спокойно.
4. Comments сохраняются внутри соответствующего editable block и видны пользователю при редактировании этого блока.
5. Пустые строки и точные исходные отступы не обязаны сохраняться.
6. Export нормализует форматирование и делает стабильный `.rpy` output.
7. Metadata редактора не записывается в `.rpy` при экспорте.
8. Blocking diagnostics для MVP минимальны: по возможности экспортируем с предупреждением, а не блокируем.
9. Export blocker нужен только когда есть высокий риск создать код, который Ren'Py не сможет скомпилировать или который потеряет смысл.
10. Экспорт должен иметь semantic roundtrip tests.

## 13. Метод Разработки

Разработка идет waterfall-спринтами. Каждый спринт содержит master items. Каждый master item является законченным TDD-кругом:

1. Описать black-box ожидание.
2. Написать тесты до реализации.
3. Убедиться, что тесты падают по ожидаемой причине.
4. Реализовать минимальный код.
5. Запустить тесты.
6. Обновить документацию/decision log.
7. Закрыть master item.

Внутри master item есть atomic actions. Atomic actions должны быть мелкими, однозначными и проверяемыми по локальному результату. Они могут быть техническими шагами, но не заменяют black-box тест master item.

Шаблон master item:

```md
#### Master Item N.M: Название

Black-box expectation: ясное внешнее ожидание, проверяемое тестом.

Atomic actions:

1. Маленькое действие с очевидным способом выполнения.
2. Следующее действие.
3. Проверка результата.
```

## 14. Waterfall Sprints

### Sprint 0. Architecture Freeze

Цель: зафиксировать язык, границы и инварианты 2.0.

Definition of Done:

- принят `ProjectGraph IR`;
- принят подход label-frame;
- принят запрет на collapse;
- принят docs-first процесс;
- создан parser coverage matrix;
- определен первый набор master items.

#### Master Item 0.1: Architecture Document

Black-box expectation: в репозитории есть документ, по которому разработчик может понять целевую модель 2.0, TDD-процесс и ограничения холста.

Atomic actions:

1. Создать `docs/editor-2.0-architecture.md`.
2. Описать цель 2.0.
3. Описать `ProjectGraph`.
4. Описать label-frame модель.
5. Зафиксировать отсутствие collapse.
6. Зафиксировать docs-first правило.
7. Описать waterfall sprints.
8. Описать master item / atomic action workflow.
9. Закоммитить документ в отдельной ветке.

#### Master Item 0.2: Parser Coverage Matrix

Black-box expectation: есть таблица statements из официального parser'а Ren'Py с решением `first-class`, `raw/default`, `preserved raw block`, `blocking diagnostic`.

Atomic actions:

1. Проверить актуальный Ren'Py release.
2. Открыть официальный `renpy/parser.py`.
3. Найти statement handlers.
4. Выписать initial matrix.
5. Пометить MVP subset.
6. Добавить ссылки на официальную документацию.
7. Создать тестовый список fixtures, которые понадобятся в Sprint 1.

### Sprint 1. ProjectGraph IR And Parser MVP

Цель: получить доменную модель из одного или нескольких файлов без UI.

Definition of Done:

- parser imports multi-file project;
- stable IDs не зависят от адресов объектов в памяти;
- global/local/nested labels представлены как frames;
- menu prompt и choices представлены отдельно;
- jump/call извлекаются как relation edges;
- fixtures покрыты black-box tests.

#### Master Item 1.1: Stable ID Import

Black-box expectation: один и тот же входной проект при двух импортах создает одинаковые deterministic IDs для импортированных сущностей.

Atomic actions:

1. Написать fixture с одним файлом и двумя labels.
2. Написать тест двойного импорта.
3. Убедиться, что текущая реализация с `id(node)` тест проваливает.
4. Спроектировать deterministic ID format.
5. Реализовать ID builder.
6. Подключить ID builder в parser serialization.
7. Проверить тест.

#### Master Item 1.2: Multi-file Project Import

Black-box expectation: два `.rpy` файла импортируются в один `ProjectGraph` с двумя `FileFrame`.

Atomic actions:

1. Создать fixture `script_a.rpy`.
2. Создать fixture `script_b.rpy`.
3. Написать black-box тест на количество files и labels.
4. Добавить import service для списка файлов.
5. Сохранить file path/order в IR.
6. Проверить тест.

#### Master Item 1.3: Label Frames

Black-box expectation: global, local и nested labels импортируются как `LabelFrame` с корректными `scope`, `parentLabelId` и `qualifiedName`.

Atomic actions:

1. Создать fixture с global label.
2. Добавить local label `.local`.
3. Добавить nested label внутри label/block.
4. Написать тест ожидаемых frames.
5. Реализовать label scope detection.
6. Реализовать parent label tracking.
7. Проверить тест.

#### Master Item 1.4: Menu Prompt And Choices

Black-box expectation: menu text, choice text и statements внутри choice представлены разными IR-узлами.

Atomic actions:

1. Создать fixture с `menu:` и prompt text.
2. Добавить несколько choices.
3. Добавить choice condition.
4. Написать тест структуры меню.
5. Расширить parser.
6. Проверить тест.

#### Master Item 1.5: Jump/Call Relations

Black-box expectation: `jump` и `call` создают `RelationEdge`, не меняя tree hierarchy.

Atomic actions:

1. Создать fixture с `jump target`.
2. Создать fixture с `call target`.
3. Добавить local label target.
4. Добавить unresolved target.
5. Написать тест relation edges и diagnostics.
6. Реализовать relation extraction.
7. Проверить тест.

### Sprint 2. Label Resolver And Diagnostics

Цель: надежно разрешать связи на уровне проекта.

Definition of Done:

- global labels ищутся по всему проекту;
- local labels резолвятся относительно owning global label;
- duplicates диагностируются;
- unresolved/dynamic targets диагностируются;
- relation layer отделен от tree layer.

#### Master Item 2.1: Global Resolver

Black-box expectation: `jump label_in_other_file` резолвится к label-frame другого файла.

Atomic actions:

1. Создать multi-file fixture.
2. Написать тест cross-file jump.
3. Реализовать project label index.
4. Реализовать relation target resolution.
5. Проверить тест.

#### Master Item 2.2: Local Resolver

Black-box expectation: `jump .local` резолвится к local label внутри текущего global scope.

Atomic actions:

1. Создать fixture с global label и `.local`.
2. Добавить второй global label с `.local` того же имени.
3. Написать тест scope isolation.
4. Реализовать local scope index.
5. Проверить тест.

#### Master Item 2.3: Resolver Diagnostics

Black-box expectation: duplicate global labels, unresolved targets и dynamic targets возвращаются как diagnostics.

Atomic actions:

1. Создать duplicate labels fixture.
2. Создать missing target fixture.
3. Создать dynamic jump/call fixture.
4. Написать тест diagnostics.
5. Реализовать diagnostic builder.
6. Проверить тест.

### Sprint 3. Export Roundtrip

Цель: научиться возвращать `ProjectGraph` в `.rpy` файлы.

Definition of Done:

- import -> export -> import дает semantic equivalence для MVP subset;
- файл назначения сохраняется;
- unknown preserved statements не теряются;
- blocking diagnostics останавливают export.

#### Master Item 3.1: Single-file Export

Black-box expectation: простой файл импортируется и экспортируется без потери семантики.

Atomic actions:

1. Создать simple fixture.
2. Написать semantic roundtrip test.
3. Реализовать statement renderer.
4. Реализовать file renderer.
5. Проверить тест.

#### Master Item 3.2: Multi-file Export

Black-box expectation: nodes возвращаются в исходные файлы по `FileFrame.path`.

Atomic actions:

1. Создать multi-file fixture.
2. Написать roundtrip test.
3. Реализовать per-file grouping.
4. Реализовать deterministic output ordering.
5. Проверить тест.

### Sprint 4. React Flow Projection

Цель: показать `ProjectGraph` на холсте без collapse.

Definition of Done:

- file frames, label frames и statements отображаются;
- nested label frames отображаются как frame inside frame;
- sibling frames не пересекаются;
- relation overlay отделен от tree edges;
- связи между labels/нелокальными переходами идут только между React Flow nodes;
- layout использует flow-связи как главный источник расположения;
- поведение согласовано с официальной документацией React Flow.

#### Master Item 4.1: Static Frame Projection

Black-box expectation: `ProjectGraph` с двумя файлами и nested labels превращается в React Flow nodes с parent-child relations.

Atomic actions:

1. Проверить актуальную документацию React Flow по sub-flows.
2. Написать projection unit test.
3. Создать `projectGraphToFlow` adapter.
4. Реализовать file frame nodes.
5. Реализовать label frame nodes.
6. Реализовать statement nodes.
7. Реализовать direct relation edge to label-frame node.
8. Проверить тест.

#### Master Item 4.2: Flow-first Layout Without Collapse

Black-box expectation: layout генерирует непересекающиеся sibling frames, корректные bounds parent frame и располагает файлы/labels по flow-связям, а не только по source order.

Atomic actions:

1. Проверить официальную документацию React Flow по layouting.
2. Учесть официальный риск Dagre для sub-flows со связями наружу.
3. Написать layout invariant tests.
4. Сначала реализовать простой MVP layout: statements inside labels, labels inside files, files on canvas.
5. Использовать flow-связи как главный ordering signal.
6. Использовать source order только как fallback.
7. Сохранять manual positions после пользовательского drag.
8. Не перетирать manual positions автоматическим relayout без явной команды пользователя.
9. Проверить тест.

#### Master Item 4.3: Relation Overlay

Black-box expectation: jump/call relation edges отображаются отдельно от tree edges и ведут к target label-frame node.

Atomic actions:

1. Написать projection test для jump/call.
2. Добавить handles на label-frame node, если они нужны React Flow routing.
3. Реализовать dashed/faded edge style.
4. Реализовать unresolved relation visual как warning/log, без блокировки холста.
5. Проверить тест.

### Sprint 5. Loro CRDT Adapter

Цель: хранить `ProjectGraph` в CRDT и получать convergence.

Definition of Done:

- два клиента сходятся после независимых операций;
- hierarchy changes не создают циклы;
- relation/metadata/positions синхронизируются;
- adapter покрыт tests без UI.

#### Master Item 5.1: Loro Container Proof

Black-box expectation: минимальный `ProjectGraph` сохраняется в LoroDoc, экспортируется, импортируется и восстанавливается.

Atomic actions:

1. Проверить официальную документацию Loro Tree.
2. Проверить официальную документацию Loro encoding.
3. Написать snapshot roundtrip test.
4. Реализовать minimal Loro adapter.
5. Проверить тест.

#### Master Item 5.2: CRDT Convergence

Black-box expectation: две независимые копии документа после обмена updates сходятся к одинаковому `ProjectGraph`.

Atomic actions:

1. Написать тест с двумя LoroDoc.
2. Смоделировать edit metadata на клиенте A.
3. Смоделировать move/order на клиенте B.
4. Обменять updates.
5. Реализовать missing adapter operations.
6. Проверить тест.

### Sprint 6. WebSocket Relay And Persistence

Цель: заменить JSON structure updates бинарными CRDT updates.

Definition of Done:

- WebSocket route принимает binary update;
- server не интерпретирует update на hot path;
- остальные клиенты получают update;
- snapshot сохраняется и загружается;
- tests покрывают relay и persistence.

#### Master Item 6.1: Binary Relay

Black-box expectation: update, отправленный клиентом A, доставляется клиенту B без JSON-transform.

Atomic actions:

1. Написать WebSocket integration test.
2. Добавить binary receive path.
3. Добавить room broadcast bytes.
4. Сохранить presence messages отдельно от CRDT channel.
5. Проверить тест.

#### Master Item 6.2: Snapshot Persistence

Black-box expectation: после сохранения snapshot новый клиент открывает проект с тем же `ProjectGraph`.

Atomic actions:

1. Спроектировать DB migration.
2. Написать persistence test.
3. Добавить snapshot table.
4. Добавить save/load service.
5. Проверить тест.

### Sprint 7. Editor Migration

Цель: перевести UI на `ProjectGraph` projection и CRDT operations.

Definition of Done:

- старый line-range editing больше не является live source of truth;
- React Flow events становятся domain operations;
- node editor пишет в CRDT;
- export работает из `ProjectGraph`;
- collaborative editing проходит end-to-end tests.

#### Master Item 7.1: Read-only ProjectGraph Canvas

Black-box expectation: UI открывает проектный graph snapshot и отображает весь холст 2.0.

Atomic actions:

1. Добавить route/load path для graph snapshot.
2. Подключить projection adapter.
3. Отрисовать file/label frames.
4. Отрисовать relation overlay.
5. Добавить smoke test.

#### Master Item 7.2: Editable ProjectGraph Canvas

Black-box expectation: изменение node content в UI меняет `ProjectGraph`, синхронизируется через CRDT и сохраняется.

Atomic actions:

1. Написать UI/domain operation test.
2. Подключить node editor к domain operation.
3. Преобразовать operation в Loro update.
4. Проверить второй клиент.
5. Проверить persistence.

## 15. Decision Log

### 2026-04-30

1. Label должен быть визуальным frame, а не обычной карточкой.
2. Global и local labels могут быть frame'ами на холсте.
3. Вложенные labels отображаются frame inside frame.
4. Sibling frames не должны пересекаться.
5. `jump` / `call` отображаются как relation overlay и layout constraints, но не как containment hierarchy.
6. Relation edge может идти напрямую к label-frame node; отдельная visible `LabelEntryNode` не нужна для MVP.
7. Холст 2.0 не использует collapse/fold.
8. Связи на холсте идут только между React Flow nodes.
9. Layout должен быть flow-first: source order является fallback.
10. Ноды и фреймы можно двигать; позиции сохраняются и синхронизируются.
11. Viewport/zoom персональные и не входят в MVP 2.0.
12. Один проект использует один LoroDoc.
13. Текст нод хранится как plain text.
14. Relation edges derived from content, но могут кэшироваться.
15. Loro history/time travel считаем техническим фундаментом; полноценный history UI - полировка после MVP.
16. Обычные непонятые Ren'Py-строки внутри label становятся `raw_statement`, а не проблемой.
17. Comments сохраняются и видны при редактировании блока.
18. Пустые строки и точное исходное форматирование не сохраняются как обязательство MVP.
19. Metadata редактора не экспортируется в `.rpy`.
20. Стабильный нормализованный export важнее похожести на исходный файл.
21. Разработка идет через waterfall sprints.
22. Каждый master item является завершенным TDD-кругом.
23. Atomic actions живут внутри master item и должны быть маленькими и однозначными.
24. Официальная документация React Flow, Loro и Ren'Py обязательна перед реализацией.

## 16. Remaining Questions

Эти вопросы не блокируют MVP 2.0, но должны быть закрыты по мере разработки master items.

1. Exact Loro container layout: подтвердить через proof-of-concept, что Tree + Map/List структура удобна для ProjectGraph.
2. Update log scope: включить, если он естественно ложится на Loro updates; полноценный user-facing history оставить после MVP.
3. Layout engine: начать с простого flow-first hybrid, но после первых tests решить, нужен ли ELK вместо Dagre из-за nested frames и внешних связей.
4. Diagnostics UX: для MVP сделать problems/log panel, search и переход к найденной ноде; подсветку фреймов оставить позже.
5. Export blockers: для MVP блокировать только высокорисковые случаи, которые явно мешают Ren'Py compile/export safety.
6. Raw block fallback: если parser понимает, что внутри сложного parent block структура ломается, сохранить весь parent block as raw и экспортировать с предупреждением.
7. User viewport persistence: хранить персональный viewport/zoom на сервере после MVP как UX-полировку.
