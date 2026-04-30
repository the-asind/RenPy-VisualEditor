from pathlib import Path

from app.services.project_graph.importer import ProjectGraphImporter
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


def labels_by_qualified_name(graph):
    return {label.qualified_name: label for label in graph.labels}


def starts_by_label_id(graph):
    return {start.label_id: start for start in graph.label_starts}


def test_import_creates_global_label_frames_and_start_nodes():
    graph = import_mouse_graph()
    labels = labels_by_qualified_name(graph)

    for name in ["start", "ask_duck", "day_two", "cheese_count", "ending_export", "ending_dynamic"]:
        assert name in labels
        assert labels[name].scope == "global"
        assert labels[name].parent_label_id is None

        start_node = starts_by_label_id(graph)[labels[name].id]
        assert start_node.qualified_name == name
        assert start_node.label_id == labels[name].id
        assert labels[name].label_start_node_id == start_node.id
        assert start_node.content.startswith("label ")


def test_import_creates_local_label_frames_inside_owning_global_label():
    graph = import_mouse_graph()
    labels = labels_by_qualified_name(graph)

    crumb_trail = labels["start.crumb_trail"]
    start = labels["start"]
    assert crumb_trail.scope == "local"
    assert crumb_trail.name == ".crumb_trail"
    assert crumb_trail.parent_label_id == start.id
    assert crumb_trail.file_id == start.file_id

    cheese_cache = labels["day_two.cheese_cache"]
    day_two = labels["day_two"]
    assert cheese_cache.scope == "local"
    assert cheese_cache.name == ".cheese_cache"
    assert cheese_cache.parent_label_id == day_two.id
    assert cheese_cache.file_id == day_two.file_id


def test_every_label_has_exactly_one_label_start_node():
    graph = import_mouse_graph()

    label_ids = {label.id for label in graph.labels}
    start_label_ids = [start.label_id for start in graph.label_starts]

    assert set(start_label_ids) == label_ids
    assert len(start_label_ids) == len(set(start_label_ids))


def test_label_frames_and_start_nodes_survive_snapshot_roundtrip():
    graph = import_mouse_graph()
    snapshot = ProjectGraphSnapshotCodec.dump(graph)
    restored = ProjectGraphSnapshotCodec.load(snapshot)

    assert [(label.id, label.qualified_name, label.label_start_node_id) for label in restored.labels] == [
        (label.id, label.qualified_name, label.label_start_node_id) for label in graph.labels
    ]
    assert [(start.id, start.label_id, start.qualified_name) for start in restored.label_starts] == [
        (start.id, start.label_id, start.qualified_name) for start in graph.label_starts
    ]
