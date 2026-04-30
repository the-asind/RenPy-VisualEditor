from pathlib import Path
from typing import Iterable
from uuid import uuid4

from .models import (
    FileFrame,
    FramePosition,
    FrameSize,
    FrameVisual,
    LabelFrame,
    LabelStartNode,
    ProjectGraph,
    ScenarioNode,
)


class ProjectGraphImporter:
    """Imports Ren'Py files into the early ProjectGraph MVP model."""

    DEFAULT_FILE_WIDTH = 1200.0
    DEFAULT_FILE_HEIGHT = 800.0
    DEFAULT_FILE_GAP = 160.0
    DEFAULT_LABEL_WIDTH = 960.0
    DEFAULT_LABEL_HEIGHT = 360.0
    DEFAULT_LABEL_GAP = 96.0
    DEFAULT_LABEL_START_WIDTH = 280.0
    DEFAULT_LABEL_START_HEIGHT = 72.0
    DEFAULT_NODE_WIDTH = 320.0
    DEFAULT_NODE_HEIGHT = 88.0

    def import_files(self, project_id: str, files: Iterable[str | Path]) -> ProjectGraph:
        paths = [Path(file) for file in files]

        if not project_id or not project_id.strip():
            raise ValueError("project_id is required")

        if not paths:
            raise ValueError("At least one .rpy file is required")

        file_frames: list[FileFrame] = []
        label_frames: list[LabelFrame] = []
        label_starts: list[LabelStartNode] = []
        scenario_nodes: list[ScenarioNode] = []
        source_files: dict[str, dict[str, str]] = {}

        for index, path in enumerate(paths):
            if not path.exists():
                raise FileNotFoundError(str(path))

            if path.suffix.lower() != ".rpy":
                raise ValueError("Only .rpy files can be imported into ProjectGraph")

            content = path.read_text(encoding="utf-8")
            file_id = str(uuid4())
            order = f"{index:04d}"

            file_frames.append(
                FileFrame(
                    id=file_id,
                    path=path.name,
                    order=order,
                    visual=FrameVisual(
                        position=FramePosition(
                            x=index * (self.DEFAULT_FILE_WIDTH + self.DEFAULT_FILE_GAP),
                            y=0.0,
                        ),
                        size=FrameSize(
                            width=self.DEFAULT_FILE_WIDTH,
                            height=self.DEFAULT_FILE_HEIGHT,
                        ),
                    ),
                )
            )
            source_files[file_id] = {
                "path": path.name,
                "content": content,
            }

            labels, starts = self._scan_labels(file_id=file_id, content=content)
            menu_nodes, consumed_menu_lines = self._scan_menu_nodes(
                file_id=file_id,
                content=content,
                labels=labels,
            )
            conditional_nodes, consumed_conditional_lines = self._scan_conditional_nodes(
                file_id=file_id,
                content=content,
                labels=labels,
                consumed_lines=consumed_menu_lines,
            )
            action_nodes = self._scan_action_and_raw_nodes(
                file_id=file_id,
                content=content,
                labels=labels,
                consumed_lines=consumed_menu_lines | consumed_conditional_lines,
            )

            label_frames.extend(labels)
            label_starts.extend(starts)
            scenario_nodes.extend(action_nodes)
            scenario_nodes.extend(conditional_nodes)
            scenario_nodes.extend(menu_nodes)

        return ProjectGraph(
            project_id=project_id,
            files=file_frames,
            labels=label_frames,
            label_starts=label_starts,
            nodes=scenario_nodes,
            source_index={"files": source_files},
        )

    def _scan_labels(self, file_id: str, content: str) -> tuple[list[LabelFrame], list[LabelStartNode]]:
        labels: list[LabelFrame] = []
        starts: list[LabelStartNode] = []
        current_global: LabelFrame | None = None
        global_by_name: dict[str, LabelFrame] = {}
        label_index_by_parent: dict[str | None, int] = {None: 0}

        for line_number, line in enumerate(content.splitlines()):
            stripped = line.strip()
            label_name = self._extract_label_name(stripped)
            if label_name is None:
                continue

            parent_label: LabelFrame | None = None
            scope = "global"
            qualified_name = label_name

            if label_name.startswith("."):
                if current_global is not None:
                    parent_label = current_global
                    qualified_name = f"{current_global.qualified_name}{label_name}"
                    scope = "local"
                else:
                    scope = "local"
                    qualified_name = label_name.lstrip(".")
            elif "." in label_name:
                global_name, local_name = label_name.split(".", 1)
                parent_label = global_by_name.get(global_name)
                if parent_label is not None:
                    scope = "local"
                    qualified_name = f"{parent_label.qualified_name}.{local_name}"
                else:
                    scope = "nested"
            else:
                current_global = None

            label_id = str(uuid4())
            start_id = str(uuid4())
            parent_id = parent_label.id if parent_label else None
            sibling_index = label_index_by_parent.get(parent_id, 0)
            label_index_by_parent[parent_id] = sibling_index + 1

            label = LabelFrame(
                id=label_id,
                file_id=file_id,
                parent_label_id=parent_id,
                name=label_name,
                qualified_name=qualified_name,
                scope=scope,  # type: ignore[arg-type]
                label_start_node_id=start_id,
                source_span={"start_line": line_number, "end_line": line_number},
                visual=FrameVisual(
                    position=FramePosition(
                        x=48.0,
                        y=48.0 + sibling_index * (self.DEFAULT_LABEL_HEIGHT + self.DEFAULT_LABEL_GAP),
                    ),
                    size=FrameSize(
                        width=self.DEFAULT_LABEL_WIDTH,
                        height=self.DEFAULT_LABEL_HEIGHT,
                    ),
                ),
            )
            start = LabelStartNode(
                id=start_id,
                file_id=file_id,
                label_id=label_id,
                qualified_name=qualified_name,
                content=stripped,
                visual=FrameVisual(
                    position=FramePosition(x=32.0, y=32.0),
                    size=FrameSize(
                        width=self.DEFAULT_LABEL_START_WIDTH,
                        height=self.DEFAULT_LABEL_START_HEIGHT,
                    ),
                ),
            )

            labels.append(label)
            starts.append(start)

            if scope == "global":
                current_global = label
                global_by_name[label_name] = label

        return labels, starts

    def _scan_menu_nodes(
        self,
        file_id: str,
        content: str,
        labels: list[LabelFrame],
    ) -> tuple[list[ScenarioNode], set[int]]:
        lines = content.splitlines()
        labels_by_start = self._labels_by_start(labels)
        current_label: LabelFrame | None = None
        nodes: list[ScenarioNode] = []
        consumed_lines: set[int] = set()
        node_order = 0
        index = 0

        while index < len(lines):
            if index in labels_by_start:
                current_label = labels_by_start[index]
                index += 1
                continue

            stripped = lines[index].strip()
            if current_label is None or not self._is_menu_line(stripped):
                index += 1
                continue

            menu_indent = self._indent_level(lines[index])
            menu_id = str(uuid4())
            consumed_lines.add(index)
            nodes.append(
                self._make_node(
                    file_id=file_id,
                    label_id=current_label.id,
                    parent_node_id=None,
                    node_type="menu",
                    content=stripped,
                    order=node_order,
                    line_number=index,
                    metadata={},
                    node_id=menu_id,
                )
            )
            node_order += 1
            index += 1

            while index < len(lines):
                line = lines[index]
                child_indent = self._indent_level(line)
                child = line.strip()

                if not child:
                    consumed_lines.add(index)
                    index += 1
                    continue

                if self._extract_label_name(child) is not None or child_indent <= menu_indent:
                    break

                if self._is_menu_prompt_line(child):
                    consumed_lines.add(index)
                    nodes.append(
                        self._make_node(
                            file_id=file_id,
                            label_id=current_label.id,
                            parent_node_id=menu_id,
                            node_type="menu_prompt",
                            content=child,
                            order=node_order,
                            line_number=index,
                            metadata={"prompt_text": child.strip('"')},
                        )
                    )
                    node_order += 1
                    index += 1
                    continue

                if self._is_menu_choice_line(child):
                    consumed_lines.add(index)
                    choice_id = str(uuid4())
                    choice_metadata = self._parse_choice_metadata(child)
                    nodes.append(
                        self._make_node(
                            file_id=file_id,
                            label_id=current_label.id,
                            parent_node_id=menu_id,
                            node_type="menu_choice",
                            content=child,
                            order=node_order,
                            line_number=index,
                            metadata=choice_metadata,
                            node_id=choice_id,
                        )
                    )
                    node_order += 1
                    choice_indent = child_indent
                    index += 1

                    while index < len(lines):
                        statement_line = lines[index]
                        statement = statement_line.strip()
                        statement_indent = self._indent_level(statement_line)

                        if not statement:
                            consumed_lines.add(index)
                            index += 1
                            continue

                        if self._extract_label_name(statement) is not None or statement_indent <= choice_indent:
                            break

                        consumed_lines.add(index)
                        statement_type = self._statement_node_type(statement)
                        nodes.append(
                            self._make_node(
                                file_id=file_id,
                                label_id=current_label.id,
                                parent_node_id=choice_id,
                                node_type=statement_type,
                                content=statement,
                                order=node_order,
                                line_number=index,
                                metadata={},
                            )
                        )
                        node_order += 1
                        index += 1

                    continue

                consumed_lines.add(index)
                index += 1

        return nodes, consumed_lines

    def _scan_conditional_nodes(
        self,
        file_id: str,
        content: str,
        labels: list[LabelFrame],
        consumed_lines: set[int],
    ) -> tuple[list[ScenarioNode], set[int]]:
        lines = content.splitlines()
        labels_by_start = self._labels_by_start(labels)
        current_label: LabelFrame | None = None
        nodes: list[ScenarioNode] = []
        conditional_lines: set[int] = set()
        node_order = 0
        index = 0

        while index < len(lines):
            if index in labels_by_start:
                current_label = labels_by_start[index]
                index += 1
                continue

            if index in consumed_lines:
                index += 1
                continue

            stripped = lines[index].strip()
            branch_type = self._conditional_node_type(stripped)
            if current_label is None or branch_type is None:
                index += 1
                continue

            branch_indent = self._indent_level(lines[index])
            branch_id = str(uuid4())
            conditional_lines.add(index)
            nodes.append(
                self._make_node(
                    file_id=file_id,
                    label_id=current_label.id,
                    parent_node_id=None,
                    node_type=branch_type,
                    content=stripped,
                    order=node_order,
                    line_number=index,
                    metadata={"condition": self._conditional_condition(stripped)},
                    node_id=branch_id,
                )
            )
            node_order += 1
            index += 1

            while index < len(lines):
                child_line = lines[index]
                child = child_line.strip()
                child_indent = self._indent_level(child_line)

                if not child:
                    conditional_lines.add(index)
                    index += 1
                    continue

                if self._extract_label_name(child) is not None or child_indent <= branch_indent:
                    break

                conditional_lines.add(index)
                child_type = self._statement_node_type(child)
                if child.startswith("#"):
                    child_type = "comment"
                elif child_type == "raw_action" and self._is_dialogue_line(child):
                    child_type = "dialogue"

                nodes.append(
                    self._make_node(
                        file_id=file_id,
                        label_id=current_label.id,
                        parent_node_id=branch_id,
                        node_type=child_type,
                        content=child,
                        order=node_order,
                        line_number=index,
                        metadata={},
                    )
                )
                node_order += 1
                index += 1

        return nodes, conditional_lines

    def _scan_action_and_raw_nodes(
        self,
        file_id: str,
        content: str,
        labels: list[LabelFrame],
        consumed_lines: set[int],
    ) -> list[ScenarioNode]:
        lines = content.splitlines()
        labels_by_start = self._labels_by_start(labels)
        current_label: LabelFrame | None = None
        nodes: list[ScenarioNode] = []
        node_order = 0
        index = 0

        while index < len(lines):
            if index in labels_by_start:
                current_label = labels_by_start[index]
                index += 1
                continue

            if index in consumed_lines:
                index += 1
                continue

            stripped = lines[index].strip()
            if current_label is None or not stripped:
                index += 1
                continue

            if stripped.startswith("#"):
                nodes.append(
                    self._make_node(
                        file_id=file_id,
                        label_id=current_label.id,
                        parent_node_id=None,
                        node_type="comment",
                        content=stripped,
                        order=node_order,
                        line_number=index,
                        metadata={},
                    )
                )
                node_order += 1
                index += 1
                continue

            block_type = self._raw_block_type(stripped)
            if block_type is not None:
                block_indent = self._indent_level(lines[index])
                block_start = index
                block_lines = [stripped]
                index += 1
                while index < len(lines):
                    child = lines[index]
                    child_stripped = child.strip()
                    if child_stripped and self._indent_level(child) <= block_indent:
                        break
                    block_lines.append(child.rstrip())
                    index += 1

                nodes.append(
                    self._make_node(
                        file_id=file_id,
                        label_id=current_label.id,
                        parent_node_id=None,
                        node_type="raw_block",
                        content="\n".join(block_lines).rstrip(),
                        order=node_order,
                        line_number=block_start,
                        metadata={"raw_block_type": block_type},
                    )
                )
                node_order += 1
                continue

            node_type = self._statement_node_type(stripped)
            if node_type == "raw_action" and self._is_dialogue_line(stripped):
                node_type = "dialogue"

            if node_type != "raw_action" or self._is_safe_raw_action(stripped) or node_type == "dialogue":
                nodes.append(
                    self._make_node(
                        file_id=file_id,
                        label_id=current_label.id,
                        parent_node_id=None,
                        node_type=node_type,
                        content=stripped,
                        order=node_order,
                        line_number=index,
                        metadata={},
                    )
                )
                node_order += 1

            index += 1

        return nodes

    def _make_node(
        self,
        file_id: str,
        label_id: str,
        parent_node_id: str | None,
        node_type: str,
        content: str,
        order: int,
        line_number: int,
        metadata: dict[str, object],
        node_id: str | None = None,
    ) -> ScenarioNode:
        return ScenarioNode(
            id=node_id or str(uuid4()),
            file_id=file_id,
            label_id=label_id,
            parent_node_id=parent_node_id,
            type=node_type,
            content=content,
            order=f"{order:04d}",
            source_span={"start_line": line_number, "end_line": line_number},
            metadata=metadata,
            visual=FrameVisual(
                position=FramePosition(x=96.0, y=136.0 + order * 112.0),
                size=FrameSize(width=self.DEFAULT_NODE_WIDTH, height=self.DEFAULT_NODE_HEIGHT),
            ),
        )

    @staticmethod
    def _extract_label_name(stripped_line: str) -> str | None:
        if not stripped_line.startswith("label ") or not stripped_line.endswith(":"):
            return None

        label_header = stripped_line[len("label "):-1].strip()
        if not label_header:
            return None

        if "(" in label_header:
            label_header = label_header.split("(", 1)[0].strip()

        return label_header or None

    @staticmethod
    def _labels_by_start(labels: list[LabelFrame]) -> dict[int, LabelFrame]:
        return {
            label.source_span["start_line"]: label
            for label in labels
            if label.source_span is not None
        }

    @staticmethod
    def _indent_level(line: str) -> int:
        return len(line) - len(line.lstrip(" "))

    @staticmethod
    def _is_menu_line(stripped_line: str) -> bool:
        return stripped_line.startswith("menu") and stripped_line.endswith(":")

    @staticmethod
    def _is_menu_prompt_line(stripped_line: str) -> bool:
        return stripped_line.startswith('"') and stripped_line.endswith('"')

    @staticmethod
    def _is_menu_choice_line(stripped_line: str) -> bool:
        return stripped_line.startswith('"') and stripped_line.endswith(":")

    @staticmethod
    def _parse_choice_metadata(choice_line: str) -> dict[str, str | None]:
        without_colon = choice_line[:-1].strip()
        closing_quote_index = without_colon.find('"', 1)
        if closing_quote_index == -1:
            return {"choice_text": without_colon.strip('"'), "condition": None}

        choice_text = without_colon[1:closing_quote_index]
        suffix = without_colon[closing_quote_index + 1:].strip()
        condition = None
        if suffix.startswith("if "):
            condition = suffix[len("if "):].strip()

        return {
            "choice_text": choice_text,
            "condition": condition,
        }

    @staticmethod
    def _conditional_node_type(statement: str) -> str | None:
        if statement.startswith("if ") and statement.endswith(":"):
            return "if"
        if statement.startswith("elif ") and statement.endswith(":"):
            return "elif"
        if statement == "else:":
            return "else"
        return None

    @staticmethod
    def _conditional_condition(statement: str) -> str | None:
        if statement.startswith("if ") and statement.endswith(":"):
            return statement[len("if "):-1].strip()
        if statement.startswith("elif ") and statement.endswith(":"):
            return statement[len("elif "):-1].strip()
        return None

    @staticmethod
    def _statement_node_type(statement: str) -> str:
        if statement.startswith("jump "):
            return "jump"
        if statement.startswith("call "):
            return "call"
        if statement.startswith("return"):
            return "return"
        return "raw_action"

    @staticmethod
    def _raw_block_type(statement: str) -> str | None:
        if not statement.endswith(":"):
            return None
        if statement.startswith("python"):
            return "python"
        if statement.startswith("show "):
            return "show"
        if statement.startswith("image "):
            return "image"
        return None

    @staticmethod
    def _is_dialogue_line(statement: str) -> bool:
        if '"' not in statement or not statement.rstrip().endswith('"'):
            return False
        return statement.startswith('"') or ' "' in statement

    @staticmethod
    def _is_safe_raw_action(statement: str) -> bool:
        prefixes = (
            "scene ",
            "show ",
            "hide ",
            "with ",
            "play ",
            "queue ",
            "stop ",
            "voice ",
            "image ",
            "define ",
            "default ",
            "$ ",
            "pass",
        )
        return statement.startswith(prefixes)
