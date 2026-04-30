from dataclasses import dataclass, field
from typing import Any, Literal


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
class LabelFrame:
    id: str
    file_id: str
    parent_label_id: str | None
    name: str
    qualified_name: str
    scope: Literal["global", "local", "nested"]
    label_start_node_id: str
    source_span: dict[str, int] | None
    visual: FrameVisual


@dataclass(frozen=True)
class LabelStartNode:
    id: str
    file_id: str
    label_id: str
    qualified_name: str
    content: str
    visual: FrameVisual


@dataclass(frozen=True)
class ScenarioNode:
    id: str
    file_id: str
    label_id: str
    parent_node_id: str | None
    type: str
    content: str
    order: str
    source_span: dict[str, int] | None
    metadata: dict[str, Any]
    visual: FrameVisual


@dataclass(frozen=True)
class FlowEdge:
    id: str
    source_node_id: str
    target_node_id: str
    kind: Literal["jump", "call"]
    metadata: dict[str, Any]


@dataclass(frozen=True)
class GraphDiagnostic:
    id: str
    code: str
    severity: Literal["info", "warning", "error"]
    message: str
    blocking: bool
    file_id: str | None
    label_id: str | None
    node_id: str | None
    source_span: dict[str, int] | None
    metadata: dict[str, Any]


@dataclass(frozen=True)
class ProjectGraph:
    project_id: str
    files: list[FileFrame] = field(default_factory=list)
    labels: list[LabelFrame] = field(default_factory=list)
    label_starts: list[LabelStartNode] = field(default_factory=list)
    nodes: list[ScenarioNode] = field(default_factory=list)
    edges: list[FlowEdge] = field(default_factory=list)
    diagnostics: list[GraphDiagnostic] = field(default_factory=list)
    source_index: dict[str, Any] = field(default_factory=dict)