from pathlib import Path

from app.services.project_graph.exporter import ProjectGraphExporter
from app.services.project_graph.importer import ProjectGraphImporter
from app.services.project_graph.resolver import ProjectGraphResolver


def semantic_signature(graph):
    labels = sorted(label.qualified_name for label in graph.labels)
    nodes = sorted(
        (
            node.type,
            node.content,
            node.parent_node_id is not None,
            tuple(sorted(node.metadata.items())),
        )
        for node in graph.nodes
    )
    diagnostics = sorted((diagnostic.code, diagnostic.severity, diagnostic.blocking) for diagnostic in graph.diagnostics)
    return labels, nodes, diagnostics


def import_and_resolve(path: Path):
    return ProjectGraphResolver().resolve(
        ProjectGraphImporter().import_files(
            project_id="single-export-project",
            files=[path],
        )
    )


def test_single_file_roundtrip_preserves_mvp_semantics(tmp_path):
    source = tmp_path / "single_mouse_story.rpy"
    source.write_text(
        "\n".join(
            [
                'define r = Character("RenPy")',
                "",
                "label start:",
                "    # Comment stays editable.",
                "    scene kitchen morning",
                "    r \"Roundtrip smells like cheese.\"",
                "    menu:",
                "        \"Pick a route.\"",
                "        \"Nibble\" if True:",
                "            jump .nibble",
                "    if True:",
                "        r \"The branch survives.\"",
                "    else:",
                "        r \"The fallback survives.\"",
                "",
                "label .nibble:",
                "    show renpy happy:",
                "        xalign 0.5",
                "        linear 0.2 yoffset -10",
                "    return",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    graph = import_and_resolve(source)
    exported = ProjectGraphExporter().export(graph)

    assert list(exported) == ["single_mouse_story.rpy"]
    assert "label start:" in exported["single_mouse_story.rpy"]
    assert "label .nibble:" in exported["single_mouse_story.rpy"]
    assert "# Comment stays editable." in exported["single_mouse_story.rpy"]
    assert "show renpy happy:" in exported["single_mouse_story.rpy"]

    roundtrip_path = tmp_path / "roundtrip" / "single_mouse_story.rpy"
    roundtrip_path.parent.mkdir()
    roundtrip_path.write_text(exported["single_mouse_story.rpy"], encoding="utf-8")
    roundtripped = import_and_resolve(roundtrip_path)

    assert semantic_signature(roundtripped) == semantic_signature(graph)
