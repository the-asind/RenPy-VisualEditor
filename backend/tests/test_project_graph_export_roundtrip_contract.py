from collections import Counter, defaultdict
from pathlib import Path

from app.services.project_graph.exporter import ProjectGraphExporter
from app.services.project_graph.importer import ProjectGraphImporter
from app.services.project_graph.resolver import ProjectGraphResolver

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "renpy_mouse"
FIXTURE_FILES = [
    FIXTURE_DIR / "renpy_mouse_day_1.rpy",
    FIXTURE_DIR / "renpy_mouse_day_2.rpy",
    FIXTURE_DIR / "renpy_mouse_diagnostics.rpy",
]


def import_resolve(paths):
    return ProjectGraphResolver().resolve(
        ProjectGraphImporter().import_files(
            project_id="mouse-renpy-project",
            files=paths,
        )
    )


def labels_by_name(graph):
    names = defaultdict(int)
    for label in graph.labels:
        names[label.qualified_name] += 1
    return dict(sorted(names.items()))


def edge_signature(graph):
    nodes_by_id = {node.id: node for node in graph.nodes}
    return sorted(
        (
            edge.kind,
            nodes_by_id[edge.source_node_id].content,
            edge.metadata["resolved_qualified_name"],
        )
        for edge in graph.edges
    )


def diagnostic_signature(graph):
    def stable_metadata(diagnostic):
        if diagnostic.code == "duplicate_global_label":
            return (
                ("qualified_name", diagnostic.metadata["qualified_name"]),
                ("duplicate_count", len(diagnostic.metadata["label_ids"])),
            )
        if diagnostic.code == "unresolved_target":
            return (
                ("target", diagnostic.metadata["target"]),
                ("args", diagnostic.metadata["args"]),
                ("from_label", diagnostic.metadata["from_label"]),
            )
        return tuple(sorted(diagnostic.metadata.items()))

    return sorted(
        (
            diagnostic.code,
            diagnostic.severity,
            diagnostic.blocking,
            stable_metadata(diagnostic),
        )
        for diagnostic in graph.diagnostics
    )


def semantic_signature(graph):
    return {
        "files": [file.path for file in graph.files],
        "labels": labels_by_name(graph),
        "node_types": Counter(node.type for node in graph.nodes),
        "node_content": sorted((node.type, node.content) for node in graph.nodes),
        "edges": edge_signature(graph),
        "diagnostics": diagnostic_signature(graph),
    }


def test_sprint_3_full_mouse_project_export_roundtrip_contract(tmp_path):
    original = import_resolve(FIXTURE_FILES)
    exported = ProjectGraphExporter().export(original)

    assert list(exported) == [file.name for file in FIXTURE_FILES]
    assert all(content.endswith("\n") for content in exported.values())

    exported_dir = tmp_path / "exported_mouse_project"
    exported_dir.mkdir()
    exported_paths = []
    for path, content in exported.items():
        exported_path = exported_dir / path
        exported_path.write_text(content, encoding="utf-8")
        exported_paths.append(exported_path)

    roundtripped = import_resolve(exported_paths)

    assert semantic_signature(roundtripped) == semantic_signature(original)

    combined_export = "\n".join(exported.values())
    assert "label duplicate_cheese:" in combined_export
    assert "jump missing_cheese_label" in combined_export
    assert "jump expression suspicious_target" in combined_export
    assert "call expression next_snack_label pass (crumb_count)" in combined_export
    assert "while crumb_count < 3:" in combined_export
    assert "resolved_qualified_name" not in combined_export
    assert "duplicate_global_label" not in combined_export
    assert "source_span" not in combined_export
