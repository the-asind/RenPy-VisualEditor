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

    def import_files(self, project_id: str, files: Iterable[str | Path]) -> ProjectGraph:
        paths = [Path(file) for file in files]

        if not project_id or not project_id.strip():
            raise ValueError("project_id is required")

        if not paths:
            raise ValueError("At least one .rpy file is required")

        file_frames: list[FileFrame] = []
        label_frames: list[LabelFrame] = []
        label_starts: list[LabelStartNode] = []
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
            label_frames.extend(labels)
            label_starts.extend(starts)

        return ProjectGraph(
            project_id=project_id,
            files=file_frames,
            labels=label_frames,
            label_starts=label_starts,
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
