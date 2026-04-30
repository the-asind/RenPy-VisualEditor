from pathlib import Path
from typing import Iterable
from uuid import uuid4

from .models import FileFrame, FramePosition, FrameSize, FrameVisual, ProjectGraph


class ProjectGraphImporter:
    """Imports a set of Ren'Py files into the first ProjectGraph shell.

    This class intentionally handles only file frames in Master Item 1.2.
    Label parsing starts in the next master item so tests stay focused.
    """

    DEFAULT_FILE_WIDTH = 1200.0
    DEFAULT_FILE_HEIGHT = 800.0
    DEFAULT_FILE_GAP = 160.0

    def import_files(self, project_id: str, files: Iterable[str | Path]) -> ProjectGraph:
        paths = [Path(file) for file in files]

        if not project_id or not project_id.strip():
            raise ValueError("project_id is required")

        if not paths:
            raise ValueError("At least one .rpy file is required")

        file_frames: list[FileFrame] = []
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

        return ProjectGraph(
            project_id=project_id,
            files=file_frames,
            source_index={"files": source_files},
        )