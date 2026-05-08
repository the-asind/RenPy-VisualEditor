# Canvas Layout Usability Audit

Дата: 2026-05-06.

Статус: рабочий артефакт для исправления читаемости MVP 2.0 canvas.

Основание: ручной smoke-test single-file проекта `artifacts/smoke_single_file_layout.rpy`.

Скриншот текущего состояния:

`artifacts/single-file-layout-smoke.png`

Тестовый проект:

1. URL: `http://127.0.0.1:5173/editor?project=1988eb90-56a7-4a5d-9dc5-0ffc39a7c1d6`
2. Import result: 1 file, 3 labels, 3 label starts, 17 scenario nodes, 3 edges, 0 diagnostics.

## 1. Целевой Визуальный Ориентир

Пользователь ожидает не хаотичный canvas dump, а базовое дерево сверху-вниз.

Под "базовым деревом" здесь понимается:

1. Главный runtime/source flow читается сверху вниз.
2. `LabelStartNode` является первым видимым якорем label.
3. Последовательные statement-ноды идут ниже старта label в понятном порядке.
4. Branch nodes (`menu`, `if`, `elif`, `else`) визуально раскрывают свои дочерние ноды внутри себя или рядом с очевидной вложенностью.
5. `jump`/`call` показываются relation edges, но не ломают основной вертикальный порядок.
6. File/label frames дают контекст containment, но не доминируют над деревом и не создают огромные пустые области.
7. Ничего не сворачивается и не скрывается.

Референс пользователя: тёмный MVP 1.0 screenshot с явным top-down graph, где ноды расположены как читаемая вертикальная история с ветвлениями.

## 2. Найденные Проблемы

### P1. `LabelStartNode` Не Является Первым Визуальным Якорем

Наблюдение:

В single-file smoke локальный label `start.cupboard` визуально оказался выше и заметнее, чем `LabelStartNode` глобального `start`. Из-за этого автор видит вложенный label как начало истории, хотя структурно начало истории - `label start:`.

Почему это плохо:

1. Нарушается базовое ожидание Ren'Py: label начинается с `label name:`.
2. Пользователь теряет точку входа в файл.
3. Jump/call relation edges начинают восприниматься как случайные линии, потому что endpoint визуально не является стабильным началом блока.

Потенциал улучшения:

1. В каждом `LabelFrame` первым в вертикальном порядке должен стоять его `LabelStartNode`.
2. Вложенные `LabelFrame` не должны вставать выше `LabelStartNode` parent label.
3. Если layout строится source-first, nested label должен располагаться в source position относительно parent flow, но не до старта parent label.

Проверки закрытия:

1. Unit/integration test: для каждого `LabelFrame` `LabelStartNode.position.y` меньше `position.y` всех sibling scenario nodes и nested label frames.
2. Projection invariant: `LabelStartNode` помещается внутри parent label frame и не пересекается с nested frames.
3. Visual smoke: на screenshot первым читаемым блоком внутри `start` является `start / label start:`.

### P2. Nested Label Визуально Смешивается С Основным Label Flow

Наблюдение:

`start.cupboard` выглядит как часть верхней последовательности `start`, а не как вложенный frame с отдельным локальным началом. Его frame пересекается/накладывается на зону восприятия parent label.

Почему это плохо:

1. Лексическая вложенность есть технически, но не читается глазами.
2. Пользователь не понимает, где заканчиваются statements parent label и начинается nested/local label.
3. В больших проектах это превратится в неразборчивый набор вложенных прямоугольников.

Потенциал улучшения:

1. Nested `LabelFrame` должен иметь отдельный визуальный lane внутри parent frame.
2. Parent label flow и nested label flow должны быть разделены по X или по вертикальному source-slot, но без overlap.
3. Вложенность должна быть видна frame border + отступом, а не гигантским фоном.

Проверки закрытия:

1. Layout invariant: sibling `LabelFrame` и scenario nodes внутри одного parent не пересекаются.
2. Visual smoke: локальный label `.cupboard` читается как вложенный блок, а не как случайная нода поверх `start`.
3. Browser screenshot assertion/manual checklist: граница nested frame видна полностью и не перекрывает текст parent flow.

### P3. Frame-Ноды Имеют Непропорционально Огромные Размеры

Наблюдение:

`FileFrame` и `LabelFrame` занимают большую пустую область. `fitView` вынужден отдалять canvas, поэтому текст становится слишком мелким, а реальные ноды занимают малую часть экрана.

Почему это плохо:

1. Даже single-file проект выглядит как маленькая колонка в огромной рамке.
2. Масштаб по умолчанию не помогает читать содержимое.
3. В multi-file проекте пустые frame bounds будут экспоненциально ухудшать навигацию.

Потенциал улучшения:

1. Frame bounds должны считаться от фактических children + padding.
2. Стартовые дефолтные размеры importer могут быть только min-size, а не доминирующим размером.
3. `fitView` должен показывать дерево в читаемом масштабе, а не весь запас пустого пространства.

Проверки закрытия:

1. Unit test: parent frame width/height равны max child bounds + padding, но не меньше разумного minimum.
2. Regression test: single-file smoke после projection не имеет label/file frame с пустой площадью больше заданного коэффициента относительно bounds children.
3. Browser screenshot: при открытии проекта текст нод читается без ручного zoom-in.

### P4. Основной Flow Не Расположен Сверху-Вниз

Наблюдение:

Текущий canvas формально содержит все nodes, но порядок восприятия не похож на дерево. Вложенный label и его nodes оказываются визуально раньше top-level statements (`scene`, dialogue, `menu`) из parent label.

Почему это плохо:

1. Автор читает граф не как историю, а как техническую структуру.
2. Top-down reference пользователя не выполняется.
3. Проверка сценария глазами становится медленнее, чем чтение `.rpy` текста.

Потенциал улучшения:

1. Внутри label нужен основной вертикальный lane: `LabelStartNode -> statements by source/flow`.
2. `menu` и `if` должны занимать понятные tree blocks в том же вертикальном flow.
3. Nested labels должны размещаться после или рядом с точкой source-встречи, но не разрушать основной lane.

Проверки закрытия:

1. Black-box layout test: y-position top-level nodes внутри label монотонно растёт по source order.
2. Branch children test: children `menu_choice`, `if/else` находятся ниже/внутри parent branch node и не выходят в произвольные места.
3. Visual smoke: single-file screenshot читается сверху вниз без необходимости знать source file.

### P5. Jump/Call Edges Пересекают Контент И Воспринимаются Как Шум

Наблюдение:

Пунктирные jump edges проходят через frames/nodes и не помогают понять переход. На маленьком проекте это уже мешает, на большом будет сильнее.

Почему это плохо:

1. Relation edges не должны ломать containment и visual tree.
2. Jump/call должны быть вторичными подсказками, а не главным визуальным шумом.
3. Edge routing через середину nodes ухудшает читаемость текста.

Потенциал улучшения:

1. Jump/call edges должны использовать менее агрессивный стиль: faded/dashed, lower opacity.
2. Relation edge routing должен уходить в side lanes, насколько это возможно в React Flow.
3. Для long-distance jump/call можно добавить node footnote/link affordance как пользователь предлагал ранее.

Проверки закрытия:

1. Edge style test: jump/call edges имеют dashed/faded style и opacity ниже sequence/branch edges.
2. Browser visual check: на single-file smoke jump edges не проходят поверх текста нод.
3. Large fixture visual check: relation edges не закрывают основной top-down lane.

### P6. Branch Blocks Не Дают Явного Дерева Ветвления

Наблюдение:

`menu` содержит prompt, choices и jumps, но визуально это похоже на вложенные карточки в рамке, а не на дерево выбора. `if` и `else` видны как блоки, но связь между ними как альтернативными ветками не очевидна.

Почему это плохо:

1. Меню и условия - главные narrative branching structures.
2. Автор должен быстро видеть ветки и их outcomes.
3. Текущий вид не даёт преимущества над plain text.

Потенциал улучшения:

1. `menu` должен быть branch parent with vertical branch lanes or clearly nested ordered children.
2. `if/elif/else` должны группироваться как один conditional cluster или как последовательные branch blocks с понятной альтернативностью.
3. Children branch nodes должны иметь стабильные отступы и не раздувать parent произвольно.

Проверки закрытия:

1. Unit test: all branch children remain inside branch parent bounds or assigned branch lane.
2. Visual smoke: `menu` choices читаются как варианты, а jumps внутри choices как outcomes.
3. Visual smoke: `if` and `else` visually read as related conditional alternatives.

### P7. UI Панели Занимают Место Поверх Canvas Без Умного Контекста

Наблюдение:

Toolbar/search panel всегда висит сверху слева и занимает место рядом с graph. Для текущего маленького graph это не блокирует ноды, но при fitView может конфликтовать с первым file frame.

Почему это плохо:

1. Первый экран должен помогать читать graph, а не конкурировать с ним.
2. Search/export важны, но не должны закрывать top-left origin дерева.
3. В больших проектах fixed panels могут скрывать важные стартовые nodes.

Потенциал улучшения:

1. FitView должен учитывать overlay padding.
2. Toolbar можно сделать компактнее и закрепить так, чтобы graph origin не попадал под неё.
3. Search results должны открываться как panel only when query exists.

Проверки закрытия:

1. Browser screenshot: после initial fitView первый visible `FileFrame`/`LabelStartNode` не находится под toolbar.
2. Component test: toolbar does not render search results panel when query is empty.
3. Visual check: top-left canvas content remains readable at default viewport.

### P8. Текст И Масштаб Слишком Мелкие После Initial Fit

Наблюдение:

На screenshot content text в нодах читается с трудом. Это следствие огромных frames и initial fit, но для пользователя это отдельная usability проблема.

Почему это плохо:

1. Основная ценность editor - читать и редактировать сценарий.
2. Если первый экран требует zoom, MVP ощущается сломанным.
3. Ноды с multiline text должны быть scan-friendly.

Потенциал улучшения:

1. Исправить frame bounds, чтобы initial zoom был ближе.
2. Задать более уверенные node dimensions для короткого текста.
3. Сделать title/type и content hierarchy читаемой на default zoom.

Проверки закрытия:

1. Browser screenshot: на 1280x900 smoke screenshot основной content text читается без zoom.
2. Pixel/DOM check: projected graph occupies meaningful viewport area, not tiny strip.
3. Manual UX gate: пользователь может назвать story order по screenshot без взаимодействия.

### P9. Layout Не Имеет Отдельного Release Gate

Наблюдение:

MVP release gate проверяет импорт, CRDT, export и базовую проекцию, но не фиксирует качество top-down canvas как пользовательского результата.

Почему это плохо:

1. Технически зелёные тесты могут пропустить непригодный canvas.
2. Layout regressions видны только руками.
3. Пользовательская цель "понятный монстр-холст" не закрывается автоматически.

Потенциал улучшения:

1. Добавить `Canvas Layout Usability Gate`.
2. Включить single-file smoke, mouse fixture smoke и multi-file smoke.
3. Для каждого smoke хранить expected layout invariants and screenshot review checklist.

Проверки закрытия:

1. Unit tests for projection invariants: no sibling overlap, compact parent bounds, monotonic top-down order.
2. E2E visual smoke: open imported project, screenshot, assert required labels/nodes visible.
3. Manual screenshot checklist before closing layout sprint.

## 3. Принципы Исправления

1. Не лечить layout случайными CSS-правками. Источник проблемы - projection/import initial coordinates and layout policy.
2. React Flow остаётся projection layer. Layout может менять projected positions only when graph has no trusted manual layout or when auto-layout is explicitly requested.
3. Manual drag positions нельзя silently перетирать после пользовательского редактирования.
4. Initial import layout должен быть usable сразу после загрузки `.rpy`.
5. Frames должны помогать containment, а не становиться главным визуальным объектом.
6. Runtime relation edges (`jump`, `call`) вторичны к основному readable tree.
7. Для MVP важнее читаемое top-down дерево, чем идеальная graph-theory раскладка всех long-distance references.

## 4. Минимальный Gate Для Закрытия Layout Улучшения

Layout improvement можно закрыть только если выполнены все пункты:

1. Single-file smoke открывается как readable top-down tree.
2. `LabelStartNode` всегда первый визуальный элемент label.
3. Top-level scenario nodes внутри label идут сверху вниз по source/flow order.
4. Nested label frames не пересекаются с sibling nodes/frames.
5. Parent frame bounds compact: children visible, padding есть, гигантского пустого пространства нет.
6. `menu`, `if`, `else` читаются как branch structures.
7. Jump/call edges не закрывают текст и остаются вторичными relation hints.
8. Initial fitView показывает readable graph без обязательного zoom-in.
9. Existing collaboration/manual drag tests remain green.
10. Screenshot текущего smoke проекта обновлён и приложен к artifacts.

## 5. Предлагаемый Порядок Работы

1. Зафиксировать black-box tests на текущий single-file smoke graph.
2. Исправить backend initial import layout для новых snapshots.
3. Исправить frontend projection fallback для уже сохранённых плохих snapshots.
4. Добавить compact frame bounds calculation.
5. Добавить top-down label layout rule.
6. Добавить branch layout rule для `menu` and conditionals.
7. Настроить edge style/routing as secondary relation hints.
8. Прогнать unit tests, backend import tests, frontend projection tests.
9. Открыть smoke project in browser, сделать screenshot.
10. Закрыть только после прохождения checklist из раздела 4.

## 6. Первый Проход Улучшения

Дата: 2026-05-06.

Статус: частично закрывает P1, P2, P3, P4, P6, P8, P9.

Изменения:

1. Backend importer теперь нормализует initial positions scenario nodes внутри label/scenario parent по source order.
2. Frontend projection добавил fallback-компактацию для старых плохих snapshots с явным import stacking.
3. `LabelStartNode` принудительно становится первым visual sibling внутри `LabelFrame`.
4. Parent frame bounds считаются от реальных children + padding и больше не доверяют огромному imported default как обязательному размеру.
5. Branch children (`menu_prompt`, `menu_choice`, nested jump/call) укладываются внутри parent scenario node без sibling overlap.
6. Auto-compaction больше не использует любой overlap как сигнал плохого импорта, чтобы не перетирать ручные CRDT drag positions.
7. Initial viewport больше не пытается fit-ить весь высокий холст в мелкий масштаб; после открытия canvas фокусируется на первом `LabelStartNode` с читаемым zoom.
8. Обновленный screenshot сохранен: `artifacts/single-file-layout-smoke-after.png`.

Проверки:

1. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` - passed, 8 tests.
2. `python -m pytest backend/tests/test_project_graph_importer.py backend/tests/test_project_graph_import_route.py -q` - passed, 9 tests.
3. `npm test -- --run` - passed, 33 frontend tests.
4. `npm run build` - passed.
5. Browser smoke на `http://127.0.0.1:5173/editor?project=1988eb90-56a7-4a5d-9dc5-0ffc39a7c1d6` показал readable top-down стартовый участок: file frame, global `start`, `LabelStartNode`, comment/action/dialogue/menu идут сверху вниз и читаются без ручного zoom-in.

Остаточные проблемы:

1. P5 не закрыта полностью: jump/call edges уже вторичные по стилю, но routing всё ещё может проходить через контент на больших графах.
2. P6 закрыта минимально: menu читается как nested block, но полноценные branch lanes/conditional clusters ещё не реализованы.
3. P7 не закрыта полностью: toolbar не перекрывает текущий smoke graph, но fit/viewport padding для overlays ещё не формализован отдельным тестом.

## 7. Второй Проход Улучшения

Дата: 2026-05-06.

Статус: дополнительно закрывает P2, P3, P4, P5 для single-file smoke.

Изменения:

1. Layout normalization теперь выполняет несколько arrange/expand pass, чтобы sibling frames разъезжались после финального роста parent bounds.
2. Если imported group уже был распознан как stacked/невалидный, повторные passes продолжают compact-ить этот group с актуальными размерами children.
3. Добавлена black-box проверка, что global label `ask_duck` не пересекается с expanded global label `start`.
4. Добавлена black-box проверка, что top-level nodes внутри `start` не пересекаются друг с другом и с nested label frame.
5. Relation edges `jump/call` больше не показывают текстовые labels на canvas.
6. `jump/call` edges стали сильно более прозрачными и тонкими; `jump` больше не получает arrow marker, чтобы relation hint не конкурировал с основным деревом.
7. File/label frame backgrounds стали менее плотными, чтобы containment был виден, но не давил на scenario nodes.
8. Обновлены screenshots:
   - `artifacts/single-file-layout-smoke-after-2.png`
   - `artifacts/single-file-layout-smoke-lower-after-2.png`

Проверки:

1. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts src/utils/__tests__/projectGraphCollaboration.test.ts` - passed, 20 tests.
2. `npm test -- --run` - passed, 33 frontend tests.
3. `python -m pytest backend/tests/test_project_graph_importer.py backend/tests/test_project_graph_import_route.py -q` - passed, 9 tests.
4. `npm run build` - passed.
5. Browser hot check: local smoke project was re-imported into `1988eb90-56a7-4a5d-9dc5-0ffc39a7c1d6`, opened in the browser, then checked at top label start and focused `start.cupboard`.

Остаточные проблемы:

1. Branch layout is still block-based, not true side-by-side branch lanes.
2. Long-distance relation edge routing is still provided by React Flow smoothstep and may need a post-MVP footnote/link mode.
3. Very large projects still need a dedicated visual/performance gate beyond the single-file smoke.

## 8. Третий Проход Улучшения

Дата: 2026-05-06.

Статус: дополнительно закрывает P5 и P7 для single-file smoke.

Изменения:

1. Relation edges `jump/call` остаются в React Flow projection как node-to-node связи, но в default view стали навигационным background-layer: `selectable=false`, `focusable=false`, `interactionWidth=1`, низкая opacity и тонкий stroke.
2. `jump` и `call` ещё сильнее отделены от основного top-down дерева: `jump` без arrow marker, `call` с минимальным marker/animation как вторичная подсказка.
3. CSS stroke для relation edges дополнительно приглушён, чтобы dashed lines не спорили с `FileFrame`/`LabelFrame` и текстом nodes.
4. После перехода к результату поиска search query очищается, поэтому список результатов больше не остаётся поверх дерева и не создаёт ложную "кашу".
5. Toolbar получил ограничение высоты и собственный scroll, чтобы длинные search results не перекрывали весь canvas.
6. Обновлён screenshot: `artifacts/single-file-layout-smoke-after-3.png`.

Проверки:

1. Сначала был добавлен failing projection test на non-interactive/faded relation edges.
2. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` - passed, 8 tests.
3. `npm test -- --run` - passed, 33 frontend tests.
4. `npm run build` - passed.
5. Browser hot check: проект `1988eb90-56a7-4a5d-9dc5-0ffc39a7c1d6` был перезагружен, проверен стартовый top-down участок, затем через search выполнен переход к `start.cupboard`; search panel исчез после фокуса, а нижняя часть с `start.cupboard` и `ask_duck` читается без перекрытия.

Остаточные проблемы:

1. Branch layout still remains vertical/block-based. Для следующего UX-прохода нужен отдельный TDD action на branch lanes или более явные conditional/menu clusters.
2. Long-distance relation navigation может стать лучше через footnote/link affordance на `jump/call` nodes, но это отдельный продуктовый выбор.
3. Large project usability пока подтверждён только косвенно unit invariants; нужен dedicated large fixture visual gate.

## 9. Action Blocks And Nested If Smoke

Дата: 2026-05-06.

Статус: закрывает отдельную проблему построчного шума и добавляет stress-smoke для nested `if/else`.

Наблюдение пользователя:

1. В визуальной новелле до развилки могут быть сотни строк текста, сцен, show/with/audio и других непереходных statements.
2. Если каждая строка становится отдельной карточкой на холсте, canvas перестает помогать понимать структуру истории.
3. Для nested `if/else` внутри `if/else` текущая модель рисковала стать особенно нечитаемой.

Изменения:

1. Добавлен fixture `backend/tests/fixtures/renpy_mouse/renpy_mouse_nested_if_blocks.rpy`.
2. Importer теперь группирует непрерывный линейный текст в один `action` block до ближайшего управляющего statement.
3. Nested conditional blocks импортируются рекурсивно: inner `if/else` остаются дочерними блоками своего parent branch.
4. Action block получает `metadata.default_title` из первой непустой строки, а UI может сохранить пользовательский `metadata.title`.
5. Export разворачивает multiline `action` block обратно в нормализованный `.rpy` без editor metadata.

Проверки закрытия:

1. Black-box importer test: top-level `nested_if_maze` имеет порядок `action -> if -> else -> action -> jump`.
2. Black-box hierarchy test: `if crumb_count > 3`, `if secret_duck_mode`, `if backup_duck_ready` остаются вложенными в корректные parent nodes.
3. Roundtrip test: import -> export -> import сохраняет количество `action`, `if` и `else` nodes.
4. Browser smoke screenshot: `artifacts/nested-if-action-blocks-smoke.png`.
5. Visual check: первые шесть линейных строк сценария видны как один `ACTION` block, а не как шесть отдельных карточек.

Остаточные проблемы:

1. Deep nested conditionals всё ещё рисуются вертикально-вложенными blocks. Это лучше построчного шума, но может требовать отдельного branch-lane/cluster pass.
2. Multiline action preview сейчас сжимает содержимое в одну карточку; нужен следующий UX-шаг для удобного раскрытого редактирования action block без collapse/fold на самом canvas.

## 10. Sequence And Branch Arrows Pass

Дата: 2026-05-06.

Статус: первый проход по визуальному дереву ветвлений после пользовательского замечания, что `if/else` не должны выглядеть просто как вложенные контейнеры.

Основание:

1. Визуальный ориентир пользователя - top-down tree с явными стрелками последовательности и развилок.
2. Containment frames нужны для файла/label/вложенности, но они не должны быть единственным способом понять runtime/source flow.
3. `if/elif/else` должны читаться как branch lanes, а не как вертикальная стопка одинаковых nested blocks.

Изменения:

1. Projection теперь добавляет derived `sequence` edges из `LabelStartNode` и между линейными scenario nodes.
2. Projection теперь добавляет derived `branch` edges от входящей ноды к `if/elif/else` альтернативам и от branch node к первому дочернему блоку.
3. Derived edges не пишутся в ProjectGraph/CRDT как пользовательские данные; это React Flow projection поверх доменной структуры.
4. Consecutive `if/elif/else` siblings раскладываются горизонтальными lanes на одной высоте.
5. Длинные "rejoin" arrows из всех веток к следующему общему блоку сознательно не добавлены в MVP-проходе, потому что browser smoke показал, что они пересекают контент и создают шум.
6. Node handles разделены на flow handles top/bottom и relation handles left/right, чтобы sequence/branch arrows шли сверху вниз, а `jump/call` оставались боковыми relation hints.
7. Minimap сделан меньше и прозрачнее, чтобы не закрывать правую часть branch tree.

Проверки закрытия:

1. Projection test: single scenario label получает `LabelStartNode -> first scenario` sequence edge.
2. Projection test: conditional tree получает `action -> if`, `action -> else`, `if -> first child`, `else -> first child` branch edges.
3. Projection test: `if` and `else` siblings имеют одинаковую `y` позицию, разведены по `x`, не пересекаются, а следующий block расположен ниже branch row.
4. Browser smoke screenshot: `artifacts/nested-if-branch-arrows-smoke.png`.

Остаточные проблемы:

1. Вложенные branch groups всё ещё могут становиться широкими на больших глубинах; нужен следующий pass по branch lane compaction/viewport.
2. Полноценное rejoin routing лучше делать отдельным алгоритмом terminal-node detection, иначе оно быстро превращается в шумные длинные линии.
3. Текущий pass улучшает дерево, но не заменяет будущий layout engine для больших проектов.

## 11. Conditional Visual Tree Detachment And LTR Branch Pass

Дата: 2026-05-07.

Статус: закрывает критическую проблему, где `if/else` превращались в огромные nested containers вместо branch graph.

Наблюдение пользователя:

1. `if/else` blocks не должны быть визуальными контейнерами для своих дочерних statements.
2. Они должны читаться как обычные cards, связанные стрелками, как `start` или `action`.
3. Для текущего UX рассматривается left-to-right graph: линейный flow идет вправо, branch lanes расходятся и затем сходятся в следующий block.

Изменения:

1. React Flow `parentId` для потомков `if/elif/else` больше не равен условной ноде. Доменная вложенность `parent_node_id` сохраняется в `ProjectGraph`, но визуально такие потомки становятся sibling nodes внутри owning `LabelFrame`.
2. Conditional nodes больше не растут до размеров своих children, поэтому `if/else` выглядят как обычные scenario cards.
3. Projection строит `sequence` и `branch` edges по доменному `parent_node_id`, а не по React Flow visual parent.
4. Conditional-heavy labels получают left-to-right layout: `LabelStartNode -> action -> if`, branch lanes идут вправо и вниз, terminal nodes сходятся в следующий линейный block справа.
5. `else/elif` lanes начинаются справа от `if`, а не длинной вертикальной линией под всей true subtree.
6. Если LTR layout дал отрицательные local coordinates из-за высокой action-card, nodes внутри label сдвигаются вниз до safe padding, чтобы общий normalizer не откатывал layout в старую vertical stack.
7. Горизонтальные sequence/branch edges используют side handles; vertical alternatives используют flow handles.
8. Обновлён screenshot: `artifacts/nested-if-left-to-right-branches-smoke.png`.

Проверки закрытия:

1. Failing projection test был расширен nested `if/else` fixture: потомки conditional nodes должны иметь `parentId` owning `LabelFrame`, а не `if/else`.
2. Projection test проверяет left-to-right ordering: `intro -> if -> branch child`, `else` lane справа от `if`, nested `else` lane справа от nested `if`, rejoin action справа от terminal branch nodes.
3. Projection test проверяет derived edges: `sequence` для линейного flow/rejoin и `branch` для alternatives/branch children.
4. Browser smoke: проект `1988eb90-56a7-4a5d-9dc5-0ffc39a7c1d6` re-imported `renpy_mouse_nested_if_blocks.rpy`, затем search-focus на `if cheese_compass_ready` и rejoin action подтвердили визуальный переход к LTR branch graph.
5. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` - passed, 10 tests.
6. `npm test -- --run` - passed, 35 frontend tests.
7. `npm run build` - passed.

Остаточные проблемы:

1. Edge routing всё ещё использует React Flow `smoothstep`; на больших branch forests rejoin линии могут требовать отдельный custom edge/router.
2. Branch lane compaction пока покрывает conditional-heavy labels, но menu branch lanes ещё требуют отдельного UX pass.
3. Большой multi-file проект всё ещё нуждается в dedicated visual gate после следующего layout stabilization pass.

## 12. Conditional Edge Spacing And Rejoin Line Pass

Дата: 2026-05-07.

Статус: закрывает следующий слой проблемы, где left-to-right branch graph уже появился, но линии и отступы всё ещё читались как хаотичная проводка.

Наблюдение пользователя:

1. Branch cards стали обычными нодами, но edge routing всё ещё пересекал содержимое и создавал ощущение случайных линий.
2. `else` lane мог начинаться слишком близко к true subtree, если true branch содержал вложенный `if/else`.
3. Схождение веток в следующий линейный block визуально конкурировало с основными branch arrows.

Изменения:

1. Derived flow edges переведены с `smoothstep` на React Flow `step`, чтобы локальный flow читался как ортогональное дерево.
2. Branch lane spacing теперь считает нижнюю границу всего branch subtree и только после этого размещает следующую alternative lane.
3. Увеличены базовые column/row gaps для conditional-heavy labels, чтобы cards не прилипали к линиям и соседним веткам.
4. Rejoin edges получили `data.flowRole = "rejoin"` и отдельный слабый серый стиль.
5. Projection test теперь проверяет не только порядок нод, но и routing contract: derived edges имеют `type="step"`, rejoin edges помечены ролью, слабее обычных линий и не перетягивают внимание.

Проверки закрытия:

1. Failing projection expectations были добавлены до реализации: `step` routing, rejoin role/style и spacing между true subtree и `else` lane.
2. Browser smoke: project `1988eb90-56a7-4a5d-9dc5-0ffc39a7c1d6`, search-focus на `if crumb_count > 3` и на post-branch action.
3. Screenshot: `artifacts/nested-if-edge-spacing-pass.png`.
4. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` - passed, 10 tests.
5. `npm test -- --run` - passed, 35 frontend tests.
6. `npm run build` - passed.

Остаточные проблемы:

1. Для очень больших branch forests текущий `step` routing всё ещё может давать длинные rejoin corridors. Следующий уровень качества - custom edge/router с lane ownership.
2. Menu branch lanes ещё не получили такой же dedicated spacing pass.
3. Нужен отдельный large-project visual gate, чтобы проверять не только nested-if fixture, но и большой multi-file canvas.

## 13. Near-target Rejoin Routing Pass

Дата: 2026-05-07.

Статус: закрывает уточнение, что rejoin-линии не должны поворачивать на половине пути.

Наблюдение пользователя:

1. Встроенный React Flow `step` поворачивает линию примерно в середине пути.
2. Когда несколько rejoin-линий идут к одной ноде из разных мест, такие повороты выглядят как хаотичная сетка.
3. Ожидаемое поведение: линии должны идти по общей трассе и поворачивать около target node на фиксированном отступе.

Изменения:

1. Добавлен custom React Flow edge type `nearTargetStep`.
2. Rejoin edges переведены на `nearTargetStep`; обычные forward/branch edges остаются `step`.
3. Path строится как `source -> target-side lane -> target`, где target-side lane считается по `targetX - targetTurnOffset`.
4. `targetTurnOffset` закреплен в projection data и сейчас равен `72`.
5. Поворот rejoin-линий теперь определяется target node, а не midpoint между source и target.

Проверки закрытия:

1. Projection test: rejoin edges имеют `type="nearTargetStep"` и `data.targetTurnOffset = 72`.
2. Pure path test: две линии из разных source в один target получают одинаковый `turnX`.
3. Browser smoke: `After the maze` на проекте `1988eb90-56a7-4a5d-9dc5-0ffc39a7c1d6`.
4. Screenshot: `artifacts/nested-if-near-target-rejoin-routing.png`.
5. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` - passed, 11 tests.
6. `npm test -- --run` - passed, 36 tests.
7. `npm run build` - passed.

Остаточные проблемы:

1. Target-side lane пока одна на target node. Для очень плотных больших графов может понадобиться несколько lane offsets по группам веток.
2. Relation edges `jump/call` пока не используют такой router; они intentionally faint, но позже могут получить собственный footnote/link pattern.

## 14. Top-down Conditional Narrative Layout Pass

Дата: 2026-05-07.

Статус: меняет основную читаемую ориентацию conditional-heavy labels с left-to-right на top-down.

Наблюдение пользователя:

1. Left-to-right narrative flow невыгоден для экранного пространства: граф быстро вытягивается по горизонтали.
2. Для визуальной новеллы естественнее читать основной поток сверху-вниз.
3. Branch split должен происходить от центра `if`, а не от левого верхнего угла.
4. `LabelStartNode` должен иметь больший top offset и явную sequence-связь с первым scenario block.

Изменения:

1. Conditional-heavy layout теперь ставит `LabelStartNode`, первый action и `if` на вертикальную центральную ось.
2. True branch уходит вправо-вниз от центра `if`.
3. `else/elif` branch уходит влево-вниз от центра `if`.
4. Nested `if/else` применяет то же правило относительно своего локального `if`.
5. Все derived local flow edges используют top/bottom handles, чтобы стрелки выходили из центра нижней границы и входили в центр верхней границы.
6. Custom near-target rejoin path получил vertical mode: поворот происходит на фиксированном отступе над target node.
7. Start node получил безопасный верхний отступ внутри label frame.

Проверки закрытия:

1. Projection test: start node находится ниже title zone и связан с первым action через `flow-out -> flow-in`.
2. Projection test: `start -> action -> if` идут сверху-вниз по одной центральной оси.
3. Projection test: true branch расположен справа от центра `if`, else branch - слева.
4. Projection test: rejoin block расположен ниже terminal branch nodes и снова центрирован под `if`.
5. Pure path test: vertical `nearTargetStep` поворачивает на `targetY - targetOffset`.
6. Browser screenshot: `artifacts/nested-if-top-down-branch-layout.png`.
7. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` - passed, 11 tests.
8. `npm test -- --run` - passed, 36 tests.
9. `npm run build` - passed.

Остаточные проблемы:

1. Top-down branch width всё ещё может расти при очень глубокой вложенности, но рост теперь локализован вокруг branch groups, а не всего narrative flow.
2. Menu branch layout пока не получил отдельную top-down специализацию.

## 15. Else/Elif Branch Header Pass

Дата: 2026-05-07.

Статус: уточняет визуальную роль `else/elif`: доменная нода нужна, но на холсте она не должна выглядеть как полноценный самостоятельный content block.

Наблюдение пользователя:

1. Отдельный `ELSE` block полезен для semantics/export, но визуально он занимает слишком много веса.
2. Удобнее читать `ELSE` как плоскую шапку над следующим block своей ветки.
3. От `IF` стрелки должны уходить влево и вправо.
4. Все стрелки должны входить в target строго сверху.

Изменения:

1. `else/elif` projection получил `data.visualRole = "branchHeader"`.
2. Branch header имеет компактную высоту и показывает только label `ELSE`/`ELIF`.
3. Первый дочерний `ACTION`/`IF` располагается близко под header, чтобы branch читался как единый блок.
4. Локальные `sequence`/`branch` edges уже используют top/bottom handles; relation `jump/call` теперь тоже входят в target через `flow-in`.
5. Domain model не менялась: `else/elif` остаются обычными `ScenarioNode` в ProjectGraph.

Проверки закрытия:

1. Projection test: `else/elif` имеют compact height и `visualRole="branchHeader"`.
2. Projection test: `else -> child` идет через `flow-out -> flow-in`.
3. Projection test: `jump/call` relation target handle теперь `flow-in`.
4. Browser screenshot: `artifacts/nested-if-else-branch-headers.png`.
5. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` - passed, 11 tests.
6. `npm test -- --run` - passed, 36 tests.
7. `npm run build` - passed.

Остаточные проблемы:

1. `elif` fixture coverage пока косвенное через общий type contract; нужен отдельный visual smoke с `elif`, если начнем полировать chains.
2. Menu choice headers могут получить похожую компактную роль позже.

## 16. Attached Else Headers And Target-Side Branch Routing Pass

Дата: 2026-05-07.

Статус: закрывает следующий слой замечаний по пользовательским скриншотам: branch/rejoin lines не должны поворачивать через соседние ноды, `ELSE` должен выглядеть как шапка содержимого, а `jump` должен явно вести к другому label frame.

Наблюдение пользователя:

1. Линии иногда проходили рядом с чужими нодами или визуально пересекали их область внимания.
2. `ELSE` header был отдельной нодой со стрелкой и зазором к следующему action/if block.
3. Схождение rejoin-линий происходило слишком далеко от target node, из-за чего нижние схождения читались криво.
4. `JUMP` node не давал достаточно заметной связи к target `LabelStartNode`, а target label frame было трудно связать с переходом.

Изменения:

1. `ELSE/ELIF` branch header теперь совпадает по ширине и центру с первым child block.
2. Gap между branch header и первым child block равен `0`.
3. Derived edge `else/elif -> first child` больше не рисуется; header и child читаются как один визуальный блок.
4. Branch edges переведены на `nearTargetStep`, как и rejoin edges.
5. `targetTurnOffset` для branch/rejoin уменьшен до `24`, чтобы поворот происходил ближе к target edge.
6. `jump/call` relation edges получили arrow marker, больший `interactionWidth`, `zIndex = 2` и более видимый dashed stroke.

Проверки закрытия:

1. Projection test: branch edge set не содержит `else -> child`.
2. Projection test: branch headers имеют `visualRole="branchHeader"`, attached y-position, одинаковую ширину и один центр с первым child.
3. Projection test: branch/rejoin edges используют `nearTargetStep`, `direction="vertical"` и `targetTurnOffset = 24`.
4. Projection test: `jump/call` relation edges входят в target через `flow-in`, имеют arrow marker и более заметный style/z-index contract.
5. Browser screenshot: `artifacts/nested-if-attached-else-routing-after-css.png`.
6. Browser screenshot: `artifacts/nested-if-jump-target-frame-after-css.png`.
7. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` - passed, 11 tests.
8. `npm test -- --run` - passed, 36 tests.
9. `npm run build` - passed.

Остаточные проблемы:

1. `ELSE` всё ещё существует как отдельная React Flow node, потому что domain node должен оставаться редактируемым и стабильным. Если позже потребуется полностью слитая карточка, понадобится отдельная projection роль для child node, а не простое CSS-склеивание.
2. Jump/call relation edges стали читаемее, но UX перехода по target label может потребовать отдельного clickable footnote/link pattern.
3. Menu choice branch headers ещё не получили такой же attached-header pass.

## 17. Menu Branch Tree And Drag Header Pass

Дата: 2026-05-07.

Статус: закрывает пользовательское требование привести `menu` к той же branch-tree форме, что и `if/else`, и сделать drag только через шапки нод/фреймов.

Наблюдение пользователя:

1. `menu` должен выглядеть как branch source: сверху `menu`, ниже расходятся choices, под каждым choice идет его content.
2. `menu_prompt` нужно показывать внутри самого `menu`, а не отдельной canvas-нoдой.
3. Ноды и фреймы слишком легко случайно сдвинуть, если drag начинается из любой точки body.
4. Нужна Unix-window-like header zone, отделенная тонкой линией в цвет контура.

Изменения:

1. `menu_prompt` скрыт из видимой React Flow projection и добавлен в `data.menuPrompt` owning `menu` node.
2. `menu_choice` и descendants `menu_choice` визуально detached из React Flow parent-child вложенности и располагаются внутри owning `LabelFrame`.
3. `menu -> menu_choice` edges стали `branch` edges с `nearTargetStep` routing.
4. `menu_choice -> first child` content идет вниз как локальный flow конкретной ветки.
5. Auto branch layout защищен от последующей normalize-compaction, но nested label frames после branch group всё еще отодвигаются ниже, чтобы не пересекаться.
6. Все projected nodes получили `dragHandle = ".pg-node__drag-handle"`.
7. Components получили `.pg-node__drag-handle` и `.pg-node__body`; body помечен `nodrag`.
8. React Flow теперь применяет `applyNodeChanges` локально во время drag и сохраняет финальную позицию через CRDT на `onNodeDragStop`.
9. Scenario drag ставит metadata `_manual_position = true`; auto-layout и normalize не перетирают labels, где есть manual scenario positions.

Проверки закрытия:

1. Projection test: `menu_prompt` не появляется как React Flow node.
2. Projection test: `menu.data.menuPrompt` содержит prompt text.
3. Projection test: `menu_choice` nodes имеют `parentId` owning `LabelFrame`, но `original.parent_node_id` остается `menu`.
4. Projection test: two menu choices находятся на одной branch row и расходятся влево/вправо от menu center.
5. Projection test: all nodes use `.pg-node__drag-handle`.
6. Collaboration integration test: ручной drag scenario node сохраняется в projection и не перетирается auto-layout.
7. Browser smoke: `artifacts/menu-branch-layout-and-node-headers.png`.
8. Browser smoke: body-drag не двинул menu node, header-drag двинул menu node и сохранил позицию; screenshot `artifacts/menu-drag-handle-smoke.png`.
9. `npm test -- --run` - passed, 36 tests.
10. `npm run build` - passed.

Остаточные проблемы:

1. После manual drag пользователь может создать локальную визуальную кашу; это ожидаемо для MVP без отдельной команды relayout.
2. `menu_choice` пока выглядит как обычная branch card, не как attached-header. Это нормально для текущей модели, потому что choice сам является читаемым текстом выбора.
3. Нужен отдельный UX pass для drag affordance и возможного hover state шапок, если пользователю будет недостаточно видимой тонкой линии.

## 18. Canvas Pan And Branch Drag Stabilization

Дата: 2026-05-07.

Статус: закрывает следующий слой UX-проблем после проверки menu/if tree: body drag должен панорамировать холст, а ручной drag не должен разрушать branch layout.

Наблюдение пользователя:

1. Drag по пустому месту панорамирует холст, но drag по body ноды/фрейма ничего не делал.
2. Drag по header должен двигать объект.
3. Блоки под `else` могли двигаться без attached `else` header.
4. После движения одной scenario-ноды весь `if/else/menu` tree мог перейти в fallback compaction и визуально превратиться в кашу.
5. `jump/call` relation edges были слишком бледными для многофайлового проекта.

Изменения:

1. React Flow wrapper ноды получил pointer-through CSS: body/content зоны пропускают LMB drag в pane pan.
2. Header зоны получили собственный pointer drag handler; native React Flow node drag отключен для этого canvas path.
3. Projection добавляет `dragGroupIds` для scenario nodes.
4. Attached `else/elif` header и первый block ветки попадают в одну drag group.
5. `_manual_position` больше не исключает весь label из branch auto-layout.
6. `jump/call` relation edges стали контрастнее и плотнее пунктиром.

Проверки закрытия:

1. Projection test: `else/elif` header и branch child имеют общую drag group.
2. Projection test: branch-managed label сохраняет `autoBranchLayout` даже при `_manual_position` на scenario child.
3. Projection test: relation edges имеют более заметный style contract.
4. Browser smoke: многофайловый проект `1988eb90-56a7-4a5d-9dc5-0ffc39a7c1d6` загрузился с 91 React Flow node.
5. `npm test -- --run` - passed, 36 tests.
6. `npm run build` - passed.

Остаточные проблемы:

1. Долговременная семантика arbitrary manual offsets внутри branch-managed story tree требует отдельного design pass. Текущий фикс защищает дерево от collapse/compaction regression.
2. Browser screenshot capture в in-app browser после reload timed out; визуальный smoke нужно повторить, когда browser automation стабилизируется.

## 19. Nested Local Label Lane Separation

Дата: 2026-05-07.

Статус: закрывает проблему, где вложенный local label frame оказывался рядом с активной веткой родительского label и его внутренние/relationship линии визуально проходили через parent story tree.

Наблюдение пользователя:

1. В многофайловом mouse smoke проекте две ветки визуально наслаивались.
2. Nested `LabelFrame` local label был размещен внутри той же зоны, где читается parent `menu/if` tree.
3. После ручного drag в проекте сохраненный `_manual_position` мог неявно отключить нормальную branch projection для соседних элементов.

Изменения:

1. `normalizeLayout` теперь сначала обрабатывает `autoBranchLayout` groups.
2. Nested `LabelFrame` siblings branch-managed label ставятся ниже фактического bottom активного story-flow.
3. `_manual_position` больше не может отменить это правило для branch-managed parent label.
4. Regression test покрывает случай, где branch child имеет `_manual_position`, а nested local label всё равно уходит ниже story-flow.

Проверки закрытия:

1. Projection test: nested local label расположен ниже bottom всех `autoBranchLayout` nodes parent label.
2. Projection test: тот же invariant сохраняется при `_manual_position` на child ветки.
3. Browser smoke: проект `1988eb90-56a7-4a5d-9dc5-0ffc39a7c1d6`, search-focus `start.crumb_trail`.
4. Browser screenshot: `artifacts/nested-local-label-lane-separation.png`.
5. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` - passed, 11 tests.
6. `npm test -- --run` - passed, 36 tests.
7. `npm run build` - passed.

Остаточные проблемы:

1. `jump/call` relation edges всё ещё могут проходить длинными пунктирными линиями через большие участки холста. Это вторичные hints; для polished UX нужен отдельный clickable jump/call navigation pattern или lane routing для cross-label relations.
2. Полная защита от любых ручных перекрытий требует отдельной команды/режима relayout, а не скрытого auto-correct каждого drag.

## 20. Small Label Frame Header Padding

Дата: 2026-05-08.

Статус: закрывает проблему маленьких/simple labels, где `LabelStartNode` визуально залезал в header `LabelFrame`.

Наблюдение пользователя:

1. Small label вроде `ask_duck` отображался так, что `START` node перекрывал область `LABEL ask_duck`.
2. Branch-managed labels выглядели лучше, потому что им уже задавался больший top padding, а simple labels сохраняли импортный `y=24/32`.

Изменения:

1. Добавлен минимальный top padding для children внутри любого `LabelFrame`.
2. `compactSiblings` для parent `labelFrame` теперь стартует ниже header zone.
3. `normalizeLayout` применяет этот reserve до branch/manual/compact веток, поэтому правило работает для branch labels, simple labels и labels с manual-position children.

Проверки закрытия:

1. Projection test: `LabelStartNode.position.y >= 72` внутри `LabelFrame`.
2. Browser smoke: проект `1546d43e-481b-488c-84d1-5cbc7c3c838d`, focus `ask_duck`.
3. Browser screenshot: `artifacts/small-label-frame-header-padding.png`.
4. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` - passed, 11 tests.
5. `npm test -- --run` - passed, 36 tests.
6. `npm run build` - passed.

Остаточные проблемы:

1. Header sizes are still hard-coded in projection/CSS. If visual density changes, extract these layout constants into a shared measured design token instead of duplicating assumptions.

## 21. Live Parent Frame Expansion During Drag

Статус: закрывает UX-проблему, где вложенную ноду или локальный `LabelFrame` можно было тянуть к краю parent frame, но сам parent визуально не освобождал место до следующего projection pass.

### Наблюдение

1. Пользователь ожидает поведение как у вложенных canvas objects: если child ведут к стенке parent frame, стенка должна отодвигаться сразу.
2. Для движения вправо/вниз достаточно увеличить bounds parent frame.
3. Для движения влево/вверх нужно сдвинуть origin parent frame и компенсировать local positions children, иначе остальные children визуально прыгнут.
4. Native React Flow `expandParent` не используется напрямую, потому что текущий canvas использует custom header-only drag, чтобы body ноды оставался pan-поверхностью.

### Изменение

1. Добавлен custom equivalent of React Flow `expandParent` в header-drag layer.
2. Во время pointermove пересчитываются ancestor `FileFrame`/`LabelFrame` bounds для dragged group.
3. Если child уходит за left/top padding, parent frame ребейзится, а его direct children получают обратный local shift.
4. Pointer-up сохраняет все измененные positions grouped CRDT operation.
5. Сценарные siblings, сдвинутые только из-за rebase, не получают `_manual_position`; manual semantics получает только реально dragged group.
6. Follow-up correction: preview bounds are recalculated from current child bounds on every drag tick. A previously expanded parent frame can shrink back when the held child moves inward, and right/bottom expansion does not add any extra movement to the held child.
7. Second follow-up correction: each pointermove preview is derived from the original pointer-down graph plus the current pointer delta, not from the previous preview nodes. This prevents a left-wall rebase or stale expansion from leaking into later drag ticks after the user moves the held node back inward.

### Проверка Закрытия

1. Projection test: dragged nested frame near right/bottom edge expands parent and outer ancestor frame.
2. Projection test: dragged nested frame near left/top edge moves parent wall while another child keeps the same absolute canvas position.
3. Collaboration test: grouped drag persistence preserves all changed positions and marks only dragged scenario nodes as manual.
4. Full frontend tests and production build pass.
5. Regression test: stale oversized parent frame shrinks from current children without moving the dragged child away from its pointer-controlled local position.
6. Regression test: sequential drag preview pushes the left wall, pushes the right wall, then returns inward; the held child keeps the expected absolute pointer-derived position in every phase and the parent frame restores baseline bounds after return.

### Остаток

1. This pass preserves positions and live frame bounds, but it does not introduce collision avoidance during arbitrary manual drag. A separate explicit relayout command is still the better product answer for user-created layout knots.
