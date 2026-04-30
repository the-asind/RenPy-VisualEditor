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


def test_local_jump_resolves_inside_owning_global_label():
    graph = resolve_mouse_graph()
    source = next(node for node in graph.nodes if node.content == "jump .crumb_trail")
    target = label_start_by_name(graph, "start.crumb_trail")

    edge = next(edge for edge in graph.edges if edge.source_node_id == source.id)

    assert edge.kind == "jump"
    assert edge.target_node_id == target.id
    assert edge.metadata["target"] == ".crumb_trail"
    assert edge.metadata["resolved_qualified_name"] == "start.crumb_trail"


def test_qualified_local_jump_resolves_to_explicit_label_start_node():
    graph = resolve_mouse_graph()
    source = next(node for node in graph.nodes if node.content == "jump day_two.cheese_cache")
    target = label_start_by_name(graph, "day_two.cheese_cache")

    edge = next(edge for edge in graph.edges if edge.source_node_id == source.id)

    assert edge.kind == "jump"
    assert edge.target_node_id == target.id
    assert edge.metadata["target"] == "day_two.cheese_cache"
    assert edge.metadata["resolved_qualified_name"] == "day_two.cheese_cache"


def test_same_local_name_resolves_by_source_scope():
    graph = resolve_mouse_graph()
    shared_jumps = [node for node in graph.nodes if node.content == "jump .shared_nook"]
    assert len(shared_jumps) == 2

    edges_by_source = {edge.source_node_id: edge for edge in graph.edges}
    labels_by_id = {label.id: label for label in graph.labels}

    resolved_pairs = {
        labels_by_id[source.label_id].qualified_name: edges_by_source[source.id].metadata["resolved_qualified_name"]
        for source in shared_jumps
    }

    assert resolved_pairs == {
        "start": "start.shared_nook",
        "day_two": "day_two.shared_nook",
    }


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
