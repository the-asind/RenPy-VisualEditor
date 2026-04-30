from collections import defaultdict

from .models import FileFrame, LabelFrame, ProjectGraph, ScenarioNode


class ProjectGraphExporter:
    """Exports the MVP ProjectGraph semantic subset into normalized Ren'Py files."""

    LABEL_INDENT = "    "
    CHILD_INDENT = "        "

    def export(self, graph: ProjectGraph) -> dict[str, str]:
        labels_by_file = self._labels_by_file(graph.labels)
        nodes_by_label = self._nodes_by_label(graph.nodes)
        children_by_parent = self._children_by_parent(graph.nodes)
        starts_by_label_id = {start.label_id: start for start in graph.label_starts}

        exported: dict[str, str] = {}
        for file in sorted(graph.files, key=lambda item: item.order):
            lines: list[str] = []
            labels = sorted(labels_by_file.get(file.id, []), key=self._source_order)
            for label in labels:
                start = starts_by_label_id[label.id]
                if lines:
                    lines.append("")
                lines.append(start.content)
                for node in sorted(nodes_by_label.get(label.id, []), key=self._source_order):
                    if node.parent_node_id is None:
                        lines.extend(self._render_node(node, children_by_parent, self.LABEL_INDENT))

            exported[file.path] = "\n".join(lines).rstrip() + "\n"

        return exported

    @staticmethod
    def _labels_by_file(labels: list[LabelFrame]) -> dict[str, list[LabelFrame]]:
        grouped: dict[str, list[LabelFrame]] = defaultdict(list)
        for label in labels:
            grouped[label.file_id].append(label)
        return grouped

    @staticmethod
    def _nodes_by_label(nodes: list[ScenarioNode]) -> dict[str, list[ScenarioNode]]:
        grouped: dict[str, list[ScenarioNode]] = defaultdict(list)
        for node in nodes:
            grouped[node.label_id].append(node)
        return grouped

    @staticmethod
    def _children_by_parent(nodes: list[ScenarioNode]) -> dict[str, list[ScenarioNode]]:
        grouped: dict[str, list[ScenarioNode]] = defaultdict(list)
        for node in nodes:
            if node.parent_node_id is not None:
                grouped[node.parent_node_id].append(node)
        return grouped

    @staticmethod
    def _source_order(item: LabelFrame | ScenarioNode) -> tuple[int, str]:
        if item.source_span is None:
            return 1_000_000, getattr(item, "order", "")
        return item.source_span.get("start_line", 1_000_000), getattr(item, "order", "")

    def _render_node(
        self,
        node: ScenarioNode,
        children_by_parent: dict[str, list[ScenarioNode]],
        indent: str,
    ) -> list[str]:
        if node.type == "raw_block":
            return self._render_raw_block(node.content, indent)

        lines = [f"{indent}{node.content}"]
        for child in sorted(children_by_parent.get(node.id, []), key=self._source_order):
            lines.extend(self._render_node(child, children_by_parent, indent + self.LABEL_INDENT))
        return lines

    def _render_raw_block(self, content: str, indent: str) -> list[str]:
        raw_lines = content.splitlines()
        if not raw_lines:
            return []

        lines = [f"{indent}{raw_lines[0].strip()}"]
        child_indent = indent + self.LABEL_INDENT
        for line in raw_lines[1:]:
            if not line.strip():
                lines.append("")
            else:
                lines.append(f"{child_indent}{line.strip()}")
        return lines
