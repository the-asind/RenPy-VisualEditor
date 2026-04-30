from typing import Any

from .models import (
    FileFrame,
    FramePosition,
    FrameSize,
    FrameVisual,
    ProjectGraph,
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
                    "visual": {
                        "position": {
                            "x": file.visual.position.x,
                            "y": file.visual.position.y,
                        },
                        "size": {
                            "width": file.visual.size.width,
                            "height": file.visual.size.height,
                        },
                    },
                }
                for file in graph.files
            ],
            "labels": graph.labels,
            "label_starts": graph.label_starts,
            "nodes": graph.nodes,
            "edges": graph.edges,
            "diagnostics": graph.diagnostics,
            "source_index": graph.source_index,
        }

    @staticmethod
    def load(snapshot: dict[str, Any]) -> ProjectGraph:
        files = []

        for file in snapshot.get("files", []):
            visual = file.get("visual", {})
            position = visual.get("position", {})
            size = visual.get("size", {})

            files.append(
                FileFrame(
                    id=file["id"],
                    path=file["path"],
                    order=file["order"],
                    visual=FrameVisual(
                        position=FramePosition(
                            x=float(position.get("x", 0.0)),
                            y=float(position.get("y", 0.0)),
                        ),
                        size=FrameSize(
                            width=float(size.get("width", 0.0)),
                            height=float(size.get("height", 0.0)),
                        ),
                    ),
                )
            )

        return ProjectGraph(
            project_id=snapshot["project_id"],
            files=files,
            labels=list(snapshot.get("labels", [])),
            label_starts=list(snapshot.get("label_starts", [])),
            nodes=list(snapshot.get("nodes", [])),
            edges=list(snapshot.get("edges", [])),
            diagnostics=list(snapshot.get("diagnostics", [])),
            source_index=dict(snapshot.get("source_index", {})),
        )