from pathlib import Path

from app.services.project_graph.importer import ProjectGraphImporter
from app.services.project_graph.resolver import ProjectGraphResolver
from app.services.project_graph.snapshot import ProjectGraphSnapshotCodec

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "renpy_mouse"


def import_mouse_graph():
    return ProjectGraphImporter().import_files(
        project_id="mouse-renpy-project",
        files=[
            FIXTURE_DIR / "renpy_mouse_day_1.rpy",
            FIXTURE_DIR / "renpy_mouse_day_2.rpy",
        ],
    )


def resolve_mouse_graph():
    return ProjectGraphResolver().resolve(import_mouse_graph())


def label_start_by_name(graph, qualified_name):
    label = next(label for label in graph.labels if label.qualified_name == qualified_name)
    return next(start for start in graph.label_starts if start.label_id == label.id)


def test_cross_file_jump_resolves_to_target_label_start_node():
    graph = resolve_mouse_graph()
    source = next(node for node in graph.nodes if node.content == "jump day_two")
    target = label_start_by_name(graph, "day_two")

    edge = next(edge for edge in graph.edges if edge.source_node_id == source.id)

    assert edge.kind == "jump"
    assert edge.target_node_id == target.id
    assert edge.metadata["target"] == "day_two"
    assert edge.metadata["resolved_qualified_name"] == "day_two"
    assert source.file_id != target.file_id


def test_global_call_with_arguments_resolves_to_target_label_start_node():
    graph = resolve_mouse_graph()
    source = next(node for node in graph.nodes if node.content.startswith("call cheese_count"))
    target = label_start_by_name(graph, "cheese_count")

    edge = next(edge for edge in graph.edges if edge.source_node_id == source.id)

    assert edge.kind == "call"
    assert edge.target_node_id == target.id
    assert edge.metadata["target"] == "cheese_count"
    assert edge.metadata["args"] == "crumb_count"
    assert edge.metadata["from_label"] == "day_two_after_count"


def test_resolver_does_not_create_edges_for_local_targets_in_global_master_item():
    graph = resolve_mouse_graph()
    local_jump = next(node for node in graph.nodes if node.content == "jump .crumb_trail")
    qualified_local_jump = next(node for node in graph.nodes if node.content == "jump day_two.cheese_cache")

    edge_sources = {edge.source_node_id for edge in graph.edges}

    assert local_jump.id not in edge_sources
    assert qualified_local_jump.id not in edge_sources


def test_resolved_edges_survive_snapshot_roundtrip():
    graph = resolve_mouse_graph()
    restored = ProjectGraphSnapshotCodec.load(ProjectGraphSnapshotCodec.dump(graph))

    assert [
        (edge.id, edge.kind, edge.source_node_id, edge.target_node_id, edge.metadata)
        for edge in restored.edges
    ] == [
        (edge.id, edge.kind, edge.source_node_id, edge.target_node_id, edge.metadata)
        for edge in graph.edges
    ]
