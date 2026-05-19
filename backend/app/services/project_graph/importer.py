from pathlib import Path
from dataclasses import replace
import re
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
            statement_nodes = self._scan_statement_nodes(
                file_id=file_id,
                content=content,
                labels=labels,
            )
            file_scenario_nodes = self._normalize_node_visuals(statement_nodes)

            label_frames.extend(labels)
            label_starts.extend(starts)
            scenario_nodes.extend(file_scenario_nodes)

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
            stripped = self._normalize_statement_colon_spacing(line.strip())
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

    def _scan_statement_nodes(
        self,
        file_id: str,
        content: str,
        labels: list[LabelFrame],
    ) -> list[ScenarioNode]:
        lines = content.splitlines()
        labels_by_start = self._labels_by_start(labels)
        label_start_lines = sorted(labels_by_start)
        nodes: list[ScenarioNode] = []
        node_order = [0]

        for label in sorted(labels, key=lambda item: item.source_span["start_line"] if item.source_span else 999999):
            if label.source_span is None:
                continue

            label_line = label.source_span["start_line"]
            next_label_line = next((line for line in label_start_lines if line > label_line), len(lines))
            label_indent = self._indent_level(lines[label_line]) if label_line < len(lines) else 0
            self._parse_statement_block(
                file_id=file_id,
                label=label,
                lines=lines,
                index=label_line + 1,
                end_index=next_label_line,
                parent_indent=label_indent,
                parent_node_id=None,
                nodes=nodes,
                node_order=node_order,
            )

        return nodes

    def _parse_statement_block(
        self,
        file_id: str,
        label: LabelFrame,
        lines: list[str],
        index: int,
        end_index: int,
        parent_indent: int,
        parent_node_id: str | None,
        nodes: list[ScenarioNode],
        node_order: list[int],
    ) -> int:
        while index < end_index:
            leading_comments, leading_start, statement_index = self._collect_leading_comments_before_control(
                lines=lines,
                index=index,
                end_index=end_index,
                parent_indent=parent_indent,
            )
            if leading_comments:
                index = statement_index

            line = lines[index]
            stripped = self._normalize_statement_colon_spacing(line.strip())

            if not stripped:
                index += 1
                continue

            line_indent = self._indent_level(line)
            if line_indent <= parent_indent or self._extract_label_name(stripped) is not None:
                break

            branch_type = self._conditional_node_type(stripped)
            if branch_type is not None:
                branch_id = str(uuid4())
                branch_content = self._prepend_leading_comments(leading_comments, stripped)
                nodes.append(
                    self._make_node(
                        file_id=file_id,
                        label_id=label.id,
                        parent_node_id=parent_node_id,
                        node_type=branch_type,
                        content=branch_content,
                        order=node_order[0],
                        line_number=leading_start if leading_comments else index,
                        metadata={"condition": self._conditional_condition(stripped)},
                        node_id=branch_id,
                        source_end_line=index,
                    )
                )
                node_order[0] += 1
                index = self._parse_statement_block(
                    file_id=file_id,
                    label=label,
                    lines=lines,
                    index=index + 1,
                    end_index=end_index,
                    parent_indent=line_indent,
                    parent_node_id=branch_id,
                    nodes=nodes,
                    node_order=node_order,
                )
                continue

            if self._is_menu_line(stripped):
                index = self._parse_menu_block(
                    file_id=file_id,
                    label=label,
                    lines=lines,
                    index=index,
                    end_index=end_index,
                    parent_node_id=parent_node_id,
                    nodes=nodes,
                    node_order=node_order,
                    leading_comments=leading_comments,
                    leading_start=leading_start,
                )
                continue

            statement_type = self._statement_node_type(stripped)
            if statement_type in {"jump", "call", "return"}:
                statement_content = self._prepend_leading_comments(leading_comments, stripped)
                nodes.append(
                    self._make_node(
                        file_id=file_id,
                        label_id=label.id,
                        parent_node_id=parent_node_id,
                        node_type=statement_type,
                        content=statement_content,
                        order=node_order[0],
                        line_number=leading_start if leading_comments else index,
                        metadata={},
                        source_end_line=index,
                    )
                )
                node_order[0] += 1
                index += 1
                continue

            block_lines, block_start, block_end = self._collect_action_block(
                lines=lines,
                index=index,
                end_index=end_index,
                parent_indent=parent_indent,
            )
            if block_lines:
                default_title = next((item for item in block_lines if item.strip()), block_lines[0])
                nodes.append(
                    self._make_node(
                        file_id=file_id,
                        label_id=label.id,
                        parent_node_id=parent_node_id,
                        node_type="action",
                        content="\n".join(block_lines).rstrip(),
                        order=node_order[0],
                        line_number=block_start,
                        metadata={"default_title": default_title},
                        source_end_line=block_end - 1,
                    )
                )
                node_order[0] += 1
            index = block_end

        return index

    def _collect_leading_comments_before_control(
        self,
        lines: list[str],
        index: int,
        end_index: int,
        parent_indent: int,
        *,
        include_menu_choice: bool = False,
        include_menu_prompt: bool = False,
    ) -> tuple[list[str], int, int]:
        if index >= end_index:
            return [], index, index

        comments: list[str] = []
        comment_start = index
        comment_indent: int | None = None
        cursor = index

        while cursor < end_index:
            line = lines[cursor]
            stripped = self._normalize_statement_colon_spacing(line.strip())

            if not stripped:
                if comments:
                    comments.append("")
                    cursor += 1
                    continue
                return [], index, index

            line_indent = self._indent_level(line)
            if line_indent <= parent_indent or self._extract_label_name(stripped) is not None:
                return [], index, index

            if stripped.startswith("#"):
                if comment_indent is None:
                    comment_indent = line_indent
                    comment_start = cursor
                if line_indent != comment_indent:
                    return [], index, index
                comments.append(line[comment_indent:].rstrip())
                cursor += 1
                continue

            if (
                comments
                and line_indent == comment_indent
                and (
                    self._is_control_statement(stripped)
                    or self._is_menu_line(stripped)
                    or (include_menu_choice and self._is_menu_choice_line(stripped))
                    or (include_menu_prompt and self._is_menu_prompt_line(stripped))
                )
            ):
                while comments and not comments[-1].strip():
                    comments.pop()
                return comments, comment_start, cursor

            return [], index, index

        return [], index, index

    @staticmethod
    def _prepend_leading_comments(comments: list[str], statement: str) -> str:
        return "\n".join([*comments, statement]) if comments else statement

    def _parse_menu_block(
        self,
        file_id: str,
        label: LabelFrame,
        lines: list[str],
        index: int,
        end_index: int,
        parent_node_id: str | None,
        nodes: list[ScenarioNode],
        node_order: list[int],
        leading_comments: list[str] | None = None,
        leading_start: int | None = None,
    ) -> int:
        menu_line = lines[index]
        menu_content = self._normalize_statement_colon_spacing(menu_line.strip())
        menu_content = self._prepend_leading_comments(leading_comments or [], menu_content)
        menu_indent = self._indent_level(menu_line)
        menu_id = str(uuid4())
        nodes.append(
            self._make_node(
                file_id=file_id,
                label_id=label.id,
                parent_node_id=parent_node_id,
                node_type="menu",
                content=menu_content,
                order=node_order[0],
                line_number=leading_start if leading_comments else index,
                metadata={},
                node_id=menu_id,
                source_end_line=index,
            )
        )
        node_order[0] += 1
        index += 1

        while index < end_index:
            leading_comments, leading_start, statement_index = self._collect_leading_comments_before_control(
                lines=lines,
                index=index,
                end_index=end_index,
                parent_indent=menu_indent,
                include_menu_choice=True,
                include_menu_prompt=True,
            )
            if leading_comments:
                index = statement_index

            line = lines[index]
            child = self._normalize_statement_colon_spacing(line.strip())
            child_indent = self._indent_level(line)

            if not child:
                index += 1
                continue

            if child_indent <= menu_indent or self._extract_label_name(child) is not None:
                break

            if self._is_menu_prompt_line(child):
                prompt_content = self._prepend_leading_comments(leading_comments, child)
                nodes.append(
                    self._make_node(
                        file_id=file_id,
                        label_id=label.id,
                        parent_node_id=menu_id,
                        node_type="menu_prompt",
                        content=prompt_content,
                        order=node_order[0],
                        line_number=leading_start if leading_comments else index,
                        metadata={"prompt_text": child.strip('"')},
                        source_end_line=index,
                    )
                )
                node_order[0] += 1
                index += 1
                continue

            if self._is_menu_choice_line(child):
                choice_id = str(uuid4())
                choice_content = self._prepend_leading_comments(leading_comments, child)
                nodes.append(
                    self._make_node(
                        file_id=file_id,
                        label_id=label.id,
                        parent_node_id=menu_id,
                        node_type="menu_choice",
                        content=choice_content,
                        order=node_order[0],
                        line_number=leading_start if leading_comments else index,
                        metadata=self._parse_choice_metadata(child),
                        node_id=choice_id,
                        source_end_line=index,
                    )
                )
                node_order[0] += 1
                index = self._parse_statement_block(
                    file_id=file_id,
                    label=label,
                    lines=lines,
                    index=index + 1,
                    end_index=end_index,
                    parent_indent=child_indent,
                    parent_node_id=choice_id,
                    nodes=nodes,
                    node_order=node_order,
                )
                continue

            block_lines, block_start, block_end = self._collect_action_block(
                lines=lines,
                index=index,
                end_index=end_index,
                parent_indent=menu_indent,
            )
            if block_lines:
                default_title = next((item for item in block_lines if item.strip()), block_lines[0])
                nodes.append(
                    self._make_node(
                        file_id=file_id,
                        label_id=label.id,
                        parent_node_id=menu_id,
                        node_type="action",
                        content="\n".join(block_lines).rstrip(),
                        order=node_order[0],
                        line_number=block_start,
                        metadata={"default_title": default_title},
                        source_end_line=block_end - 1,
                    )
                )
                node_order[0] += 1
            index = block_end

        return index

    def _collect_action_block(
        self,
        lines: list[str],
        index: int,
        end_index: int,
        parent_indent: int,
    ) -> tuple[list[str], int, int]:
        block_start = index
        block_lines: list[str] = []
        block_indent: int | None = None

        while index < end_index:
            line = lines[index]
            stripped = self._normalize_statement_colon_spacing(line.strip())

            if not stripped:
                if block_lines:
                    block_lines.append("")
                index += 1
                continue

            line_indent = self._indent_level(line)
            if line_indent <= parent_indent or self._extract_label_name(stripped) is not None:
                break

            if block_indent is None:
                block_indent = line_indent

            if line_indent <= block_indent and self._is_control_statement(stripped):
                break

            if line_indent >= block_indent:
                block_lines.append(line[block_indent:].rstrip())
            else:
                block_lines.append(stripped)
            index += 1

        while block_lines and not block_lines[-1].strip():
            block_lines.pop()

        return block_lines, block_start, index

    def _collect_raw_block(
        self,
        lines: list[str],
        index: int,
        end_index: int,
        block_indent: int,
    ) -> tuple[list[str], int]:
        block_lines = [lines[index].strip()]
        index += 1

        while index < end_index:
            child = lines[index]
            child_stripped = child.strip()
            if child_stripped and self._indent_level(child) <= block_indent:
                break
            block_lines.append(child.rstrip())
            index += 1

        return block_lines, index

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

            stripped = self._normalize_statement_colon_spacing(lines[index].strip())
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
                child = self._normalize_statement_colon_spacing(line.strip())

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
                        statement = self._normalize_statement_colon_spacing(statement_line.strip())
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

            stripped = self._normalize_statement_colon_spacing(lines[index].strip())
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
                child = self._normalize_statement_colon_spacing(child_line.strip())
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

            stripped = self._normalize_statement_colon_spacing(lines[index].strip())
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
        source_end_line: int | None = None,
    ) -> ScenarioNode:
        line_count = max(1, len(content.splitlines()))
        node_height = self.DEFAULT_NODE_HEIGHT
        if node_type == "action":
            node_height = min(180.0, max(104.0, 56.0 + line_count * 18.0))
        elif node_type == "raw_block":
            node_height = min(220.0, max(104.0, 56.0 + line_count * 18.0))

        return ScenarioNode(
            id=node_id or str(uuid4()),
            file_id=file_id,
            label_id=label_id,
            parent_node_id=parent_node_id,
            type=node_type,
            content=content,
            order=f"{order:04d}",
            source_span={"start_line": line_number, "end_line": source_end_line if source_end_line is not None else line_number},
            metadata=metadata,
            visual=FrameVisual(
                position=FramePosition(x=96.0, y=136.0 + order * 112.0),
                size=FrameSize(width=self.DEFAULT_NODE_WIDTH, height=node_height),
            ),
        )

    def _normalize_node_visuals(self, nodes: list[ScenarioNode]) -> list[ScenarioNode]:
        node_ids = {node.id for node in nodes}
        nodes_by_parent: dict[str, list[ScenarioNode]] = {}
        normalized_by_id: dict[str, ScenarioNode] = {}

        for node in nodes:
            parent_key = node.parent_node_id if node.parent_node_id in node_ids else node.label_id
            nodes_by_parent.setdefault(parent_key, []).append(node)

        for parent_key, siblings in nodes_by_parent.items():
            parent_is_scenario = parent_key in node_ids
            start_x = 24.0 if parent_is_scenario else 96.0
            start_y = 64.0 if parent_is_scenario else 136.0
            cursor_y = start_y

            for sibling in sorted(siblings, key=self._node_source_order):
                normalized_by_id[sibling.id] = replace(
                    sibling,
                    visual=FrameVisual(
                        position=FramePosition(x=start_x, y=cursor_y),
                        size=sibling.visual.size,
                    ),
                )
                cursor_y += sibling.visual.size.height + 24.0

        return [normalized_by_id.get(node.id, node) for node in nodes]

    @staticmethod
    def _node_source_order(node: ScenarioNode) -> tuple[int, str]:
        source_line = 999999
        if node.source_span is not None:
            source_line = int(node.source_span["start_line"])
        return source_line, node.order

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
        normalized = ProjectGraphImporter._normalize_statement_colon_spacing(stripped_line)
        return normalized.startswith("menu") and normalized.endswith(":")

    @staticmethod
    def _is_menu_prompt_line(stripped_line: str) -> bool:
        return stripped_line.startswith('"') and stripped_line.endswith('"')

    @staticmethod
    def _is_menu_choice_line(stripped_line: str) -> bool:
        normalized = ProjectGraphImporter._normalize_statement_colon_spacing(stripped_line)
        return normalized.startswith('"') and normalized.endswith(":")

    @staticmethod
    def _parse_choice_metadata(choice_line: str) -> dict[str, str | None]:
        normalized = ProjectGraphImporter._normalize_statement_colon_spacing(choice_line)
        without_colon = normalized[:-1].strip()
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
        normalized = ProjectGraphImporter._normalize_statement_colon_spacing(statement)
        if normalized.startswith("if ") and normalized.endswith(":"):
            return "if"
        if normalized.startswith("elif ") and normalized.endswith(":"):
            return "elif"
        if normalized == "else:":
            return "else"
        return None

    @staticmethod
    def _conditional_condition(statement: str) -> str | None:
        normalized = ProjectGraphImporter._normalize_statement_colon_spacing(statement)
        if normalized.startswith("if ") and normalized.endswith(":"):
            return normalized[len("if "):-1].strip()
        if normalized.startswith("elif ") and normalized.endswith(":"):
            return normalized[len("elif "):-1].strip()
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
        normalized = ProjectGraphImporter._normalize_statement_colon_spacing(statement)
        if not normalized.endswith(":"):
            return None
        if normalized.startswith("python"):
            return "python"
        if normalized.startswith("show "):
            return "show"
        if normalized.startswith("image "):
            return "image"
        if normalized.startswith("while "):
            return "while"
        return None

    @staticmethod
    def _normalize_statement_colon_spacing(stripped_line: str) -> str:
        return re.sub(r"\s+:\s*$", ":", stripped_line)

    def _is_control_statement(self, statement: str) -> bool:
        return (
            self._conditional_node_type(statement) is not None
            or self._is_menu_line(statement)
            or self._statement_node_type(statement) in {"jump", "call", "return"}
        )

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
