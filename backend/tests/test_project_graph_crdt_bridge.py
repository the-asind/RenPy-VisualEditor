from pathlib import Path

from app.services.project_graph.crdt_bridge import ProjectGraphCrdtSnapshotBridge


def test_project_graph_crdt_bridge_uses_configured_frontend_dir(monkeypatch, tmp_path):
    frontend_dir = tmp_path / "frontend"
    scripts_dir = frontend_dir / "scripts"
    scripts_dir.mkdir(parents=True)
    (scripts_dir / "project-graph-snapshot-cli.mjs").write_text("", encoding="utf-8")

    monkeypatch.setenv("PROJECT_GRAPH_FRONTEND_DIR", str(frontend_dir))

    bridge = ProjectGraphCrdtSnapshotBridge()

    assert bridge.frontend_dir == frontend_dir
    assert bridge.script_path == frontend_dir / "scripts" / "project-graph-snapshot-cli.mjs"


def test_project_graph_crdt_bridge_falls_back_to_nearby_frontend_dir(monkeypatch):
    monkeypatch.delenv("PROJECT_GRAPH_FRONTEND_DIR", raising=False)

    bridge = ProjectGraphCrdtSnapshotBridge()

    assert bridge.frontend_dir == Path(__file__).resolve().parents[2] / "frontend"
