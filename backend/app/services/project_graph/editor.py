from copy import deepcopy
from dataclasses import replace

from .models import ProjectGraph


class ProjectGraphEditor:
    """Small immutable-style ProjectGraph edit helpers for MVP tests."""

    def update_source_content(
        self,
        graph: ProjectGraph,
        file_id: str,
        content: str,
    ) -> ProjectGraph:
        source_index = deepcopy(graph.source_index)
        files = source_index.setdefault("files", {})

        if file_id not in files:
            raise KeyError(f"Unknown file_id: {file_id}")

        files[file_id] = {
            **files[file_id],
            "content": content,
        }

        return replace(graph, source_index=source_index)