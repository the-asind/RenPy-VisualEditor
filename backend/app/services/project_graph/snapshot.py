from typing import Any

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


def _dump_visual(visual: FrameVisual) -> dict[str, Any]:
    return {
        "position": {
            "x": visual.position.x,
            "y": visual.position.y,
        },
        "size": {
            "width": visual.size.width,
            "height": visual.size.height,
        },
    }


def _load_visual(raw: dict[str, Any]) -> FrameVisual:
    position = raw.get("position", {})
    size = raw.get("size", {})
    return FrameVisual(
        position=FramePosition(
            x=float(position.get("x", 0.0)),
            y=float(position.get("y", 0.0)),
        ),
        size=FrameSize(
            width=float(size.get("width", 0.0)),
            height=float(size.get("height", 0.0)),
        ),
    )


class ProjectGraphSnapshotCodec:
    """Serializes the MVP ProjectGraph shell without regenerating IDs."""

    @staticmethod
    def dump(graph: ProjectGraph) -> dict[str, Any]:
        return {
            "project_id": graph.project_id,
            "files": [
                {
                    "id": file.id,
                    "path": file.path,
                    "order": file.order,
                    "visual": _dump_visual(file.visual),
                }
                for file in graph.files
            ],
            "labels": [
                {
                    "id": label.id,
                    "file_id": label.file_id,
                    "parent_label_id": label.parent_label_id,
                    "name": label.name,
                    "qualified_name": label.qualified_name,
                    "scope": label.scope,
                    "label_start_node_id": label.label_start_node_id,
                    "source_span": label.source_span,
                    "visual": _dump_visual(label.visual),
                }
                for label in graph.labels
            ],
            "label_starts": [
                {
                    "id": start.id,
                    "file_id": start.file_id,
                    "label_id": start.label_id,
                    "qualified_name": start.qualified_name,
                    "content": start.content,
                    "visual": _dump_visual(start.visual),
                }
                for start in graph.label_starts
            ],
            "nodes": [
                {
                    "id": node.id,
                    "file_id": node.file_id,
                    "label_id": node.label_id,
                    "parent_node_id": node.parent_node_id,
                    "type": node.type,
                    "content": node.content,
                    "order": node.order,
                    "source_span": node.source_span,
                    "metadata": node.metadata,
                    "visual": _dump_visual(node.visual),
                }
                for node in graph.nodes
            ],
            "edges": graph.edges,
            "diagnostics": graph.diagnostics,
            "source_index": graph.source_index,
        }

    @staticmethod
    def load(snapshot: dict[str, Any]) -> ProjectGraph:
        files = [
            FileFrame(
                id=file["id"],
                path=file["path"],
                order=file["order"],
                visual=_load_visual(file.get("visual", {})),
            )
            for file in snapshot.get("files", [])
        ]
        labels = [
            LabelFrame(
                id=label["id"],
                file_id=label["file_id"],
                parent_label_id=label.get("parent_label_id"),
                name=label["name"],
                qualified_name=label["qualified_name"],
                scope=label["scope"],
                label_start_node_id=label["label_start_node_id"],
                source_span=label.get("source_span"),
                visual=_load_visual(label.get("visual", {})),
            )
            for label in snapshot.get("labels", [])
        ]
        label_starts = [
            LabelStartNode(
                id=start["id"],
                file_id=start["file_id"],
                label_id=start["label_id"],
                qualified_name=start["qualified_name"],
                content=start["content"],
                visual=_load_visual(start.get("visual", {})),
            )
            for start in snapshot.get("label_starts", [])
        ]
        nodes = [
            ScenarioNode(
                id=node["id"],
                file_id=node["file_id"],
                label_id=node["label_id"],
                parent_node_id=node.get("parent_node_id"),
                type=node["type"],
                content=node["content"],
                order=node["order"],
                source_span=node.get("source_span"),
                metadata=dict(node.get("metadata", {})),
                visual=_load_visual(node.get("visual", {})),
            )
            for node in snapshot.get("nodes", [])
        ]

        return ProjectGraph(
            project_id=snapshot["project_id"],
            files=files,
            labels=labels,
            label_starts=label_starts,
            nodes=nodes,
            edges=list(snapshot.get("edges", [])),
            diagnostics=list(snapshot.get("diagnostics", [])),
            source_index=dict(snapshot.get("source_index", {})),
        )