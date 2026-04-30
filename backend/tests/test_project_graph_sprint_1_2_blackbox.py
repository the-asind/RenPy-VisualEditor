from collections import Counter, defaultdict
from pathlib import Path

from app.services.project_graph.importer import ProjectGraphImporter
from app.services.project_graph.resolver import ProjectGraphResolver
from app.services.project_graph.snapshot import ProjectGraphSnapshotCodec

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "renpy_mouse"
FIXTURE_FILES = [
    FIXTURE_DIR / "renpy_mouse_day_1.rpy",
    FIXTURE_DIR / "renpy_mouse_day_2.rpy",
    FIXTURE_DIR / "renpy_mouse_diagnostics.rpy",
]


def import_and_resolve_full_mouse_project():
    imported = ProjectGraphImporter().import_files(
        project_id="mouse-renpy-project",
        files=FIXTURE_FILES,
    )
    return ProjectGraphResolver().resolve(imported)


def labels_by_qualified_name(graph):
    labels = defaultdict(list)
    for label in graph.labels:
        labels[label.qualified_name].append(label)
    return labels


def label_start_by_name(graph, qualified_name):
    labels = labels_by_qualified_name(graph)[qualified_name]
    assert len(labels) == 1
    label = labels[0]
    return next(start for start in graph.label_starts if start.label_id == label.id)


def nodes_by_type(graph, node_type):
    return [node for node in graph.nodes if node.type == node_type]


def edge_targets_by_source_content(graph):
    nodes_by_id = {node.id: node for node in graph.nodes}
    targets = defaultdict(list)
    for edge in graph.edges:
        source = nodes_by_id[edge.source_node_id]
        targets[source.content].append(edge.metadata["resolved_qualified_name"])
    return targets


def diagnostics_by_code(graph):
    diagnostics = defaultdict(list)
    for diagnostic in graph.diagnostics:
        diagnostics[diagnostic.code].append(diagnostic)
    return diagnostics


def snapshot_contract(graph):
    return {
        "files": [(file.id, file.path, file.order) for file in graph.files],
        "labels": [
            (label.id, label.file_id, label.parent_label_id, label.qualified_name, label.scope, label.label_start_node_id)
            for label in graph.labels
        ],
        "label_starts": [
            (start.id, start.file_id, start.label_id, start.qualified_name, start.content)
            for start in graph.label_starts
        ],
        "nodes": [
            (node.id, node.file_id, node.label_id, node.parent_node_id, node.type, node.content, node.metadata)
            for node in graph.nodes
        ],
        "edges": [
            (edge.id, edge.kind, edge.source_node_id, edge.target_node_id, edge.metadata)
            for edge in graph.edges
        ],
        "diagnostics": [
            (
                diagnostic.id,
                diagnostic.code,
                diagnostic.severity,
                diagnostic.blocking,
                diagnostic.file_id,
                diagnostic.label_id,
                diagnostic.node_id,
                diagnostic.metadata,
            )
            for diagnostic in graph.diagnostics
        ],
    }


def test_sprint_1_and_2_full_project_graph_blackbox_contract():
    graph = import_and_resolve_full_mouse_project()

    assert graph.project_id == "mouse-renpy-project"
    assert [file.path for file in graph.files] == [file.name for file in FIXTURE_FILES]
    assert [file.order for file in graph.files] == ["0000", "0001", "0002"]
    assert len(graph.source_index["files"]) == 3

    labels = labels_by_qualified_name(graph)
    assert set(labels) >= {
        "start",
        "start.crumb_trail",
        "start.shared_nook",
        "ask_duck",
        "day_two",
        "day_two.cheese_cache",
        "day_two.shared_nook",
        "cheese_count",
        "ending_export",
        "ending_dynamic",
        "unsafe_parent",
    }
    assert len(labels["duplicate_cheese"]) == 2
    assert len(graph.label_starts) == len(graph.labels)
    assert {start.label_id for start in graph.label_starts} == {label.id for label in graph.labels}
    assert labels["start.crumb_trail"][0].parent_label_id == labels["start"][0].id
    assert labels["start.shared_nook"][0].parent_label_id == labels["start"][0].id
    assert labels["day_two.cheese_cache"][0].parent_label_id == labels["day_two"][0].id
    assert labels["day_two.shared_nook"][0].parent_label_id == labels["day_two"][0].id

    node_counts = Counter(node.type for node in graph.nodes)
    assert node_counts["dialogue"] >= 18
    assert node_counts["menu"] == 2
    assert node_counts["menu_prompt"] == 2
    assert node_counts["menu_choice"] == 4
    assert node_counts["if"] == 1
    assert node_counts["elif"] == 1
    assert node_counts["else"] == 1
    assert node_counts["raw_block"] == 3
    assert node_counts["comment"] == 3
    assert node_counts["jump"] == 9
    assert node_counts["call"] == 3

    contents_by_type = {node_type: {node.content for node in nodes_by_type(graph, node_type)} for node_type in node_counts}
    assert 'r "I smell a cheese commit."' in contents_by_type["dialogue"]
    assert "# RenPy wakes up under the keyboard." in contents_by_type["comment"]
    assert "scene kitchen morning" in contents_by_type["raw_action"]
    assert "play music \"tiny_footsteps.ogg\" fadein 1.0" in contents_by_type["raw_action"]
    assert any(node.content.startswith("show renpy happy:") for node in nodes_by_type(graph, "raw_block"))
    assert any(node.content.startswith("python:") for node in nodes_by_type(graph, "raw_block"))
    assert any(node.content.startswith("while ") for node in nodes_by_type(graph, "raw_block"))

    conditioned_choice = next(
        node for node in nodes_by_type(graph, "menu_choice")
        if "golden crumb" in node.content
    )
    assert conditioned_choice.metadata == {
        "choice_text": "Follow the golden crumb trail",
        "condition": "crumb_count == 0",
    }
    assert any(node.parent_node_id == conditioned_choice.id and node.content == "jump .crumb_trail" for node in graph.nodes)

    branch_by_type = {node.type: node for node in graph.nodes if node.type in {"if", "elif", "else"}}
    assert branch_by_type["if"].metadata["condition"] == "crumb_count > 2"
    assert branch_by_type["elif"].metadata["condition"] == "crumb_count == 1"
    assert branch_by_type["else"].metadata["condition"] is None
    assert {
        (node.parent_node_id, node.type, node.content)
        for node in graph.nodes
        if node.parent_node_id in {branch.id for branch in branch_by_type.values()}
    } == {
        (branch_by_type["if"].id, "dialogue", 'r "This is either a feast or a cycle."'),
        (branch_by_type["elif"].id, "dialogue", 'r "One crumb is enough for a prototype."'),
        (branch_by_type["else"].id, "dialogue", 'r "No crumbs, no graph."'),
    }

    assert len(graph.edges) == 9
    edge_targets = edge_targets_by_source_content(graph)
    assert edge_targets["jump day_two"] == ["day_two"]
    assert edge_targets["jump day_two.cheese_cache"] == ["day_two.cheese_cache"]
    assert sorted(edge_targets["jump .shared_nook"]) == ["day_two.shared_nook", "start.shared_nook"]
    assert edge_targets["call ask_duck(\"lint\") from start_after_duck"] == ["ask_duck"]
    assert edge_targets["call cheese_count(crumb_count) from day_two_after_count"] == ["cheese_count"]
    assert "jump missing_cheese_label" not in edge_targets
    assert "jump expression suspicious_target" not in edge_targets
    assert "call expression next_snack_label pass (crumb_count)" not in edge_targets

    diagnostics = diagnostics_by_code(graph)
    assert {code: len(items) for code, items in diagnostics.items()} == {
        "duplicate_global_label": 1,
        "dynamic_target": 2,
        "unresolved_target": 1,
        "unsupported_raw_block": 1,
    }
    assert all(diagnostic.blocking is False for diagnostic in graph.diagnostics)
    assert diagnostics["duplicate_global_label"][0].metadata["qualified_name"] == "duplicate_cheese"
    assert diagnostics["unresolved_target"][0].metadata["target"] == "missing_cheese_label"
    assert {diagnostic.metadata["statement"] for diagnostic in diagnostics["dynamic_target"]} == {
        "jump expression suspicious_target",
        "call expression next_snack_label pass (crumb_count)",
    }
    assert diagnostics["unsupported_raw_block"][0].metadata["raw_block_type"] == "while"

    restored = ProjectGraphSnapshotCodec.load(ProjectGraphSnapshotCodec.dump(graph))
    assert snapshot_contract(restored) == snapshot_contract(graph)
