from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class FramePosition:
    x: float
    y: float


@dataclass(frozen=True)
class FrameSize:
    width: float
    height: float


@dataclass(frozen=True)
class FrameVisual:
    position: FramePosition
    size: FrameSize


@dataclass(frozen=True)
class FileFrame:
    id: str
    path: str
    order: str
    visual: FrameVisual


@dataclass(frozen=True)
class ProjectGraph:
    project_id: str
    files: list[FileFrame] = field(default_factory=list)
    labels: list[Any] = field(default_factory=list)
    label_starts: list[Any] = field(default_factory=list)
    nodes: list[Any] = field(default_factory=list)
    edges: list[Any] = field(default_factory=list)
    diagnostics: list[Any] = field(default_factory=list)
    source_index: dict[str, Any] = field(default_factory=dict)