from pathlib import Path

from app.services.project_graph.importer import ProjectGraphImporter
from app.services.project_graph.resolver import ProjectGraphResolver
from app.services.project_graph.snapshot import ProjectGraphSnapshotCodec

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "renpy_mouse"


def import_diagnostics_graph():
    return ProjectGraphImporter().import_files(
        project_id="mouse-renpy-project",
        files=[
            FIXTURE_DIR / "renpy_mouse_day_1.rpy",
            FIXTURE_DIR / "renpy_mouse_day_2.rpy",
            FIXTURE_DIR / "renpy_mouse_diagnostics.rpy",
        ],
    )


def resolve_diagnostics_graph():
    return ProjectGraphResolver().resolve(import_diagnostics_graph())


def diagnostics_by_code(graph):
    return {diagnostic.code: diagnostic for diagnostic in graph.diagnostics}


def test_duplicate_global_label_creates_non_blocking_diagnostic():
    graph = resolve_diagnostics_graph()
    diagnostic = diagnostics_by_code(graph)["duplicate_global_label"]

    assert diagnostic.severity == "warning"
    assert diagnostic.blocking is False
    assert diagnostic.label_id is not None
    assert diagnostic.metadata["qualified_name"] == "duplicate_cheese"
    assert len(diagnostic.metadata["label_ids"]) == 2


def test_unresolved_static_jump_creates_non_blocking_diagnostic_without_edge():
    graph = resolve_diagnostics_graph()
    source = next(node for node in graph.nodes if node.content == "jump missing_cheese_label")
    diagnostic = diagnostics_by_code(graph)["unresolved_target"]

    assert diagnostic.severity == "warning"
    assert diagnostic.blocking is False
    assert diagnostic.node_id == source.id
    assert diagnostic.metadata["target"] == "missing_cheese_label"
    assert source.id not in {edge.source_node_id for edge in graph.edges}


def test_dynamic_jump_creates_non_blocking_diagnostic_without_edge():
    graph = resolve_diagnostics_graph()
    source = next(node for node in graph.nodes if node.content == "jump expression suspicious_target")
    diagnostic = diagnostics_by_code(graph)["dynamic_target"]

    assert diagnostic.severity == "info"
    assert diagnostic.blocking is False
    assert diagnostic.node_id == source.id
    assert diagnostic.metadata["statement"] == "jump expression suspicious_target"
    assert source.id not in {edge.source_node_id for edge in graph.edges}


def test_unsupported_while_block_is_preserved_as_raw_block_with_warning():
    graph = resolve_diagnostics_graph()
    raw_block = next(node for node in graph.nodes if node.type == "raw_block" and node.content.startswith("while "))
    diagnostic = diagnostics_by_code(graph)["unsupported_raw_block"]

    assert "Loop crumbs are preserved as a raw block for MVP." in raw_block.content
    assert diagnostic.severity == "warning"
    assert diagnostic.blocking is False
    assert diagnostic.node_id == raw_block.id
    assert diagnostic.metadata["raw_block_type"] == "while"


def test_safe_raw_action_nodes_do_not_create_diagnostics():
    graph = resolve_diagnostics_graph()
    diagnostic_node_ids = {diagnostic.node_id for diagnostic in graph.diagnostics}
    safe_nodes = [node for node in graph.nodes if node.type in {"raw_action", "dialogue", "comment"}]

    assert safe_nodes
    assert all(node.id not in diagnostic_node_ids for node in safe_nodes)


def test_diagnostics_survive_snapshot_roundtrip():
    graph = resolve_diagnostics_graph()
    restored = ProjectGraphSnapshotCodec.load(ProjectGraphSnapshotCodec.dump(graph))

    assert [
        (
            diagnostic.id,
            diagnostic.code,
            diagnostic.severity,
            diagnostic.blocking,
            diagnostic.node_id,
            diagnostic.label_id,
            diagnostic.metadata,
        )
        for diagnostic in restored.diagnostics
    ] == [
        (
            diagnostic.id,
            diagnostic.code,
            diagnostic.severity,
            diagnostic.blocking,
            diagnostic.node_id,
            diagnostic.label_id,
            diagnostic.metadata,
        )
        for diagnostic in graph.diagnostics
    ]
