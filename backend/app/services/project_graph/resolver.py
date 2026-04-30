from dataclasses import replace
from uuid import uuid4

from .models import FlowEdge, LabelFrame, LabelStartNode, ProjectGraph, ScenarioNode


class ProjectGraphResolver:
    """Resolves project-wide static Ren'Py relations into node-to-node edges."""

    def resolve(self, graph: ProjectGraph) -> ProjectGraph:
        global_labels = self._global_label_index(graph.labels)
        labels_by_id = {label.id: label for label in graph.labels}
        labels_by_qualified_name = {label.qualified_name: label for label in graph.labels}
        starts_by_label_id = {start.label_id: start for start in graph.label_starts}
        edges: list[FlowEdge] = []

        for node in graph.nodes:
            if node.type not in {"jump", "call"}:
                continue

            target_info = self._static_target(node)
            if target_info is None:
                continue

            target_label = self._resolve_target_label(
                target_name=target_info["target"],
                source_label=labels_by_id.get(node.label_id),
                global_labels=global_labels,
                labels_by_id=labels_by_id,
                labels_by_qualified_name=labels_by_qualified_name,
            )
            if target_label is None:
                continue

            target_start = starts_by_label_id.get(target_label.id)
            if target_start is None:
                continue

            edges.append(
                FlowEdge(
                    id=str(uuid4()),
                    source_node_id=node.id,
                    target_node_id=target_start.id,
                    kind=node.type,  # type: ignore[arg-type]
                    metadata={
                        **target_info,
                        "resolved_qualified_name": target_label.qualified_name,
                        "target_label_id": target_label.id,
                    },
                )
            )

        return replace(graph, edges=edges)

    @staticmethod
    def _global_label_index(labels: list[LabelFrame]) -> dict[str, LabelFrame]:
        return {
            label.qualified_name: label
            for label in labels
            if label.parent_label_id is None and label.scope == "global"
        }

    def _resolve_target_label(
        self,
        target_name: str | None,
        source_label: LabelFrame | None,
        global_labels: dict[str, LabelFrame],
        labels_by_id: dict[str, LabelFrame],
        labels_by_qualified_name: dict[str, LabelFrame],
    ) -> LabelFrame | None:
        if not target_name:
            return None

        if target_name.startswith("."):
            owning_global = self._owning_global_label(source_label, labels_by_id)
            if owning_global is None:
                return None
            return labels_by_qualified_name.get(f"{owning_global.qualified_name}{target_name}")

        if "." in target_name:
            return labels_by_qualified_name.get(target_name)

        return global_labels.get(target_name)

    def _owning_global_label(
        self,
        label: LabelFrame | None,
        labels_by_id: dict[str, LabelFrame],
    ) -> LabelFrame | None:
        current = label
        while current is not None and current.parent_label_id is not None:
            current = labels_by_id.get(current.parent_label_id)

        if current is None or current.scope != "global":
            return None
        return current

    def _static_target(self, node: ScenarioNode) -> dict[str, str | None] | None:
        content = node.content.strip()
        if node.type == "jump":
            return self._jump_target(content)
        if node.type == "call":
            return self._call_target(content)
        return None

    @staticmethod
    def _jump_target(content: str) -> dict[str, str | None] | None:
        if not content.startswith("jump "):
            return None

        rest = content[len("jump "):].strip()
        if rest.startswith("expression ") or not rest:
            return None

        target = rest.split()[0]
        return {"target": target, "args": None, "from_label": None}

    @staticmethod
    def _call_target(content: str) -> dict[str, str | None] | None:
        if not content.startswith("call "):
            return None

        rest = content[len("call "):].strip()
        if rest.startswith("expression ") or not rest:
            return None

        before_from, from_label = ProjectGraphResolver._split_call_from(rest)
        target_expr = before_from.strip()
        first_space = target_expr.find(" ")
        if first_space != -1:
            target_expr = target_expr[:first_space]

        args = None
        target = target_expr
        if "(" in target_expr and target_expr.endswith(")"):
            target, args_part = target_expr.split("(", 1)
            args = args_part[:-1]

        if not target:
            return None

        return {"target": target, "args": args, "from_label": from_label}

    @staticmethod
    def _split_call_from(rest: str) -> tuple[str, str | None]:
        marker = " from "
        if marker not in rest:
            return rest, None

        before_from, after_from = rest.rsplit(marker, 1)
        from_label = after_from.strip().split()[0] if after_from.strip() else None
        return before_from, from_label
