# Ren'Py Parser Coverage Matrix For MVP 2.0

Дата: 2026-05-01

Статус: Sprint 0 / Master Item 0.3.

Цель: зафиксировать, какие Ren'Py statements становятся first-class ProjectGraph nodes в MVP 2.0, какие сохраняются как агрегированный `action` text, какие legacy raw nodes поддерживаются только для старых snapshots, и какие могут блокировать export/import safety.

## Official Sources Checked

Docs/version checked on 2026-05-01:

1. Ren'Py 8.5.3 Language Basics: https://www.renpy.org/doc/html/language_basics.html
2. Ren'Py 8.5.3 Labels & Control Flow: https://www.renpy.org/doc/html/label.html
3. Ren'Py 8.5.3 In-Game Menus: https://www.renpy.org/doc/html/menus.html
4. Ren'Py 8.5.3 Conditional Statements: https://www.renpy.org/doc/html/conditional.html
5. Ren'Py 8.5.3 Dialogue and Narration: https://www.renpy.org/doc/html/dialogue.html
6. Ren'Py 8.5.3 Displaying Images: https://www.renpy.org/doc/html/displaying_images.html
7. Ren'Py 8.5.3 Python Statements: https://www.renpy.org/doc/html/python.html
8. Ren'Py official parser source: https://github.com/renpy/renpy/blob/master/renpy/parser.py

Important official-doc implications:

1. Ren'Py combines all `.rpy` files under `game/`; splitting story by files is normal and control can transfer between files.
2. Comments are ignored by Ren'Py, but MVP 2.0 preserves them for author editing context.
3. Ren'Py logical lines can span physical lines through backslashes, unmatched delimiters, or strings.
4. Ren'Py indentation must use spaces and defines blocks.
5. Menus may include prompt/caption text before choices.
6. Labels have global and local forms, and local labels can be referenced as `.local` or `global.local`.
7. `jump expression` and `call expression` are dynamic targets.
8. `call ... from ...` may create an explicit return label; MVP 2.0 must not discard it.

## Coverage Classes

`first-class`: dedicated ProjectGraph concept/node because it affects story structure, branches, navigation, editing, or relation resolution.

`action`: safe non-branching statement shown as a normal scenario/action node.

`raw_action`: legacy-compatible safe statement type. New imports should prefer aggregated `action`.

`raw_block`: legacy-compatible snapshot type. New imports should not create visible `raw_block` canvas nodes; raw-like Ren'Py blocks are preserved as text inside `action`.

`blocking`: syntax/structure issue that prevents safe import/export or destroys containment certainty.

`post-MVP`: useful later, but not part of first MVP parser semantics.

## MVP First-Class Matrix

| Statement / Construct | MVP class | ProjectGraph output | Fixture requirement | Notes |
| --- | --- | --- | --- | --- |
| `.rpy` file | first-class | `FileFrame` | Two story files | One project graph contains all files. |
| `label name:` | first-class | `LabelFrame` + `LabelStartNode` | Global labels in both files | Global labels share project namespace. |
| `label .local:` | first-class | nested/local `LabelFrame` + `LabelStartNode` | Local label under global label | Resolve `.local` relative to owning global label. |
| `label global.local:` | first-class | local `LabelFrame` + `LabelStartNode` | Explicit full local label | Does not create separate global label by itself. |
| label parameters | raw metadata on label | `LabelFrame.metadata.parameters` and start content | `label snack(count=1):` | Do not execute/evaluate; preserve for export. |
| say/narration string | first-class | `ScenarioNode(type="dialogue")` | Narration and character dialogue | Includes `"Text"`, `e "Text"`, `"Name" "Text"`. |
| say with transition | first-class dialogue with raw suffix | `dialogue` node content | `"Bam" with vpunch` | Transition does not create graph branch. |
| `menu:` | first-class | `ScenarioNode(type="menu")` | Menu with prompt and choices | Must contain choices to be valid Ren'Py. |
| named `menu name:` | first-class | `LabelFrame` or metadata plus menu node | Named menu fixture | Official parser can create a label for named menu; MVP should preserve name. |
| menu prompt/caption string | first-class | `ScenarioNode(type="menu_prompt")` | Prompt text before choices | User explicitly called this out as missing today. |
| menu choice string | first-class | `ScenarioNode(type="menu_choice")` | Multiple choices | Choice owns its block statements. |
| menu choice `if expr` | first-class metadata/content | choice condition | Conditional menu choice | Condition visible/editable on choice. |
| menu choice arguments | first-class metadata/raw | choice metadata | Choice with arguments | Preserve even if UI edits later. |
| statements inside menu choice | first-class/recursive | child nodes | Choice block with dialogue/jump/action | Same parser rules as label body. |
| `if` | first-class | `ScenarioNode(type="if")` | If branch | Owns true block. |
| `elif` | first-class branch | `ScenarioNode(type="elif")` or branch entry | If/elif/else chain | Preserve ordering and conditions. |
| `else` | first-class branch | `ScenarioNode(type="else")` or branch entry | Else block | Preserve fallback branch. |
| `jump target` | first-class relation | `ScenarioNode(type="jump")` + `FlowEdge(kind="jump")` | Global/local/cross-file targets | Edge target is destination `LabelStartNode`. |
| `jump expression expr` | first-class dynamic relation | `jump` node + unresolved/dynamic edge + warning | Dynamic jump fixture | Does not block graph. |
| `call target` | first-class relation | `ScenarioNode(type="call")` + `FlowEdge(kind="call")` | Global/local/cross-file call | Edge target is destination `LabelStartNode`. |
| `call target(args)` | first-class relation | `call` node with args metadata | Call with arguments | Preserve args for export. |
| `call expression expr pass (...)` | first-class dynamic relation | dynamic call edge + warning | Dynamic call fixture | Preserve `pass` syntax. |
| `call ... from label` | first-class plus label artifact | call node + return label preservation | Call from fixture | Must not discard explicit return label. |
| `return` / `return expr` | first-class | `ScenarioNode(type="return")` | Return with and without expr | Important call-stack control. |
| comment line | first-class editable context | `ScenarioNode(type="comment")` or attached comments | Comment inside label/menu/if | Ren'Py ignores it, UI preserves it. |

## MVP Action Text Matrix

| Statement / Construct | MVP class | ProjectGraph output | Fixture requirement | Notes |
| --- | --- | --- | --- | --- |
| `scene ...` | action | aggregated `ScenarioNode(type="action")` | Scene line | Presentation statement; no graph branch. |
| `scene ...:` ATL block | action | same action block with relative child indentation | Scene with block | Preserve block text; do not graph ATL internals. |
| `show ...` | action | aggregated action node | `show renpy happy at left with dissolve` | Must never become graph problem by itself. |
| `show ...:` ATL block | action | same action block with relative child indentation | Show block | Preserve block text. |
| `show layer ...` | action | aggregated action node | Optional fixture | Presentation. |
| `camera ...` | action | aggregated action node | Optional fixture | Presentation. |
| `hide ...` | action | aggregated action node | Hide line | Presentation. |
| `with expr` | action | aggregated action node | With transition line | Presentation. |
| `image ... = ...` | action | file prelude or aggregated action text | Image definition | Not a narrative branch. |
| `image ...:` ATL block | action | same action block with relative child indentation | Image ATL fixture | Preserve safely. |
| `define ...` | action/source prelude | file prelude or aggregated action text | Define character/default var | Important source content, not graph branch. |
| `default ...` | action/source prelude | file prelude or aggregated action text | Default variable | Preserve. |
| `$ python` | action | aggregated action node | One-line python | Preserve text. |
| `python:` | action | same action block with relative child indentation | Python block | Do not parse inner Python as Ren'Py graph. |
| `python hide:` / `python early:` | action | same action block with relative child indentation | Python modifier fixture | Preserve modifiers. |
| `pass` | action | aggregated action node | Pass inside branch | Safe no-op; may be generated/exported. |
| `while expr:` | action with warning | same action block + `unsupported_control_block` warning | While fixture | It is control flow, but looping graph semantics are post-MVP. |
| `IF` / `ELIF` / `ELSE` compile-time conditional | action/post-MVP with warning | same action block where safe | Optional fixture | Different semantics from runtime `if`; avoid pretending it is normal branch. |

## Post-MVP / Preserve Matrix

| Statement / Construct | MVP class | Reason |
| --- | --- | --- |
| `transform` | action/post-MVP | ATL/presentation definition. |
| `screen` language | action/post-MVP | Separate language; preserve as text without graph semantics where safe. |
| `init` / `init python` | action/post-MVP | Initialization semantics; preserve safely. |
| `translate` blocks | action/post-MVP | Localization workflow; preserve but do not graph in MVP. |
| `style` statements | raw_action/post-MVP | UI style definitions. |
| `play` / `queue` / `stop` audio | action/raw_action | Presentation/audio, no story branch. |
| `voice` | action/raw_action | Audio/narration support. |
| `window` | action/raw_action | Presentation. |
| `pause` | action/raw_action | Runtime pacing; no branch. |
| `nvl` | raw_action/post-MVP | Mode/UI behavior. |
| `show screen` / `call screen` / `hide screen` | raw_action/post-MVP | Screen interactions can affect control indirectly; preserve and warn if needed. |
| creator-defined statements | action text | Unknown statement should preserve text and warn, not fail by default. |

## Blocking Diagnostics

Blocking diagnostics are intentionally rare in MVP. We block only when safe import/export is not possible.

Blocking cases:

1. Indentation that makes block containment impossible to determine.
2. Logical line continuation that cannot be reconstructed into a stable statement.
3. Menu choice line followed by a block but missing required colon.
4. `menu:` without any valid choices if exact preservation as action text fails.
5. Label declaration whose name cannot be parsed enough to preserve and resolve.
6. A parent block where partial parsing would lose statements; fallback must preserve the whole parent block as `action` text. If fallback also fails, block.
7. Duplicate IDs inside imported ProjectGraph payload after IDs already exist.

Non-blocking diagnostics:

1. Unresolved `jump`/`call` target.
2. Dynamic `jump expression` / `call expression`.
3. Safe unknown statement preserved as action text.
4. Presentation/action block preserved inside an aggregated action node.
5. Duplicate global label: warning/high severity for resolver, but import can preserve both frames with diagnostic unless export target would be ambiguous.

## Fixture Corpus Requirements

All parser fixtures should be part of one continuous story about a mouse named RenPy.

Minimum files:

1. `renpy_mouse_day_1.rpy`
2. `renpy_mouse_day_2.rpy`
3. `renpy_mouse_diagnostics.rpy`

Required coverage in the story:

1. Global labels across files.
2. Local `.local` labels.
3. Fully qualified local labels.
4. Nested label with block semantics.
5. Label with parameters.
6. Dialogue/narration forms.
7. Menu prompt/caption text.
8. Menu choices with conditions and blocks.
9. If/elif/else chain.
10. Jump to same-file label.
11. Jump to cross-file label.
12. Jump to local label.
13. Dynamic jump expression.
14. Call with arguments.
15. Call expression with `pass`.
16. Call with `from` label.
17. Return with and without expression.
18. Comments inside editable blocks.
19. Presentation/action statements: scene/show/hide/with/audio.
20. Raw-like text inside action blocks: python, ATL-style show/image block.
21. Diagnostics: duplicate label, unresolved target, suspicious indentation or unsupported control block preserved inside action text.

## Sprint 1 Test Order

1. Create fixture corpus first.
2. Write ProjectGraph import tests for files/labels/LabelStartNode.
3. Write tests for menu prompt and choices.
4. Write tests for aggregated action text preservation.
5. Write resolver tests for jump/call after basic import exists.
6. Write export roundtrip tests after import/resolver shape stabilizes.

## Decisions

1. Parser MVP focuses on graph-relevant narrative/control-flow structure, not exhaustive typed AST parity with Ren'Py.
2. Presentation and implementation statements are preserved as aggregated action text unless they create graph branches.
3. Dynamic references remain visible as unresolved/dynamic relations with warnings.
4. Unknown safe statements must not become graph errors.
5. Official Ren'Py parser remains the source of truth for syntax categories; this matrix is the MVP editor interpretation layer.
