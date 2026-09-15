from dataclasses import replace
from uuid import uuid4

from .models import FlowEdge, GraphDiagnostic, LabelFrame, ProjectGraph, ScenarioNode


class ProjectGraphResolver:
    """Resolves project-wide static Ren'Py relations into node-to-node edges."""

    def resolve(self, graph: ProjectGraph) -> ProjectGraph:
        global_labels = self._global_label_index(graph.labels)
        labels_by_id = {label.id: label for label in graph.labels}
        labels_by_qualified_name = {label.qualified_name: label for label in graph.labels}
        starts_by_label_id = {start.label_id: start for start in graph.label_starts}
        edges: list[FlowEdge] = []
        diagnostics: list[GraphDiagnostic] = list(graph.diagnostics)
        diagnostics.extend(self._duplicate_global_label_diagnostics(graph.labels))

        for node in graph.nodes:
            if node.type not in {"jump", "call"}:
                continue

            dynamic_target = self._dynamic_target(node)
            if dynamic_target is not None:
                diagnostics.append(
                    self._diagnostic(
                        code="dynamic_target",
                        severity="info",
                        message="Dynamic jump/call target is preserved but cannot be resolved statically in MVP.",
                        file_id=node.file_id,
                        label_id=node.label_id,
                        node_id=node.id,
                        source_span=node.source_span,
                        metadata={"statement": node.content, "target_expression": dynamic_target},
                    )
                )
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
                diagnostics.append(
                    self._diagnostic(
                        code="unresolved_target",
                        severity="warning",
                        message="Static jump/call target could not be resolved to a label in the project.",
                        file_id=node.file_id,
                        label_id=node.label_id,
                        node_id=node.id,
                        source_span=node.source_span,
                        metadata={
                            **target_info,
                            "source_label_id": node.label_id,
                        },
                    )
                )
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

        diagnostics.extend(self._unsupported_control_block_diagnostics(graph.nodes))
        return replace(graph, edges=edges, diagnostics=diagnostics)

    def _duplicate_global_label_diagnostics(self, labels: list[LabelFrame]) -> list[GraphDiagnostic]:
        labels_by_name: dict[str, list[LabelFrame]] = {}
        for label in labels:
            if label.parent_label_id is None and label.scope == "global":
                labels_by_name.setdefault(label.qualified_name, []).append(label)

        diagnostics: list[GraphDiagnostic] = []
        for qualified_name, duplicates in labels_by_name.items():
            if len(duplicates) < 2:
                continue

            first = duplicates[0]
            diagnostics.append(
                self._diagnostic(
                    code="duplicate_global_label",
                    severity="warning",
                    message="Duplicate global label names make jump/call resolution ambiguous.",
                    file_id=first.file_id,
                    label_id=first.id,
                    node_id=None,
                    source_span=first.source_span,
                    metadata={
                        "qualified_name": qualified_name,
                        "label_ids": [label.id for label in duplicates],
                    },
                )
            )
        return diagnostics

    def _unsupported_control_block_diagnostics(self, nodes: list[ScenarioNode]) -> list[GraphDiagnostic]:
        diagnostics: list[GraphDiagnostic] = []
        for node in nodes:
            control_block_type: str | None = None
            if node.type == "raw_block" and node.metadata.get("raw_block_type") == "while":
                control_block_type = "while"
            elif node.type == "action":
                control_block_type = self._unsupported_control_block_type_in_action(node.content)

            if control_block_type is None:
                continue

            diagnostics.append(
                self._diagnostic(
                    code="unsupported_control_block",
                    severity="warning",
                    message="Unsupported control-flow block is preserved inside an action block for MVP.",
                    file_id=node.file_id,
                    label_id=node.label_id,
                    node_id=node.id,
                    source_span=node.source_span,
                    metadata={"control_block_type": control_block_type},
                )
            )
        return diagnostics

    @staticmethod
    def _unsupported_control_block_type_in_action(content: str) -> str | None:
        for line in content.splitlines():
            if line.startswith("while "):
                return "while"
        return None

    def _diagnostic(
        self,
        code: str,
        severity: str,
        message: str,
        file_id: str | None,
        label_id: str | None,
        node_id: str | None,
        source_span: dict[str, int] | None,
        metadata: dict[str, object],
    ) -> GraphDiagnostic:
        return GraphDiagnostic(
            id=str(uuid4()),
            code=code,
            severity=severity,  # type: ignore[arg-type]
            message=message,
            blocking=False,
            file_id=file_id,
            label_id=label_id,
            node_id=node_id,
            source_span=source_span,
            metadata=metadata,
        )

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

    def _dynamic_target(self, node: ScenarioNode) -> str | None:
        content = node.content.strip()
        if node.type == "jump" and content.startswith("jump expression "):
            return content[len("jump expression "):].strip()
        if node.type == "call" and content.startswith("call expression "):
            return content[len("call expression "):].strip()
        return None

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
