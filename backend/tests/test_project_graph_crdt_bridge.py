import json
import base64
from pathlib import Path
import subprocess

from app.services.project_graph import crdt_bridge
from app.services.project_graph.crdt_bridge import ProjectGraphCrdtSnapshotBridge
from app.services.project_graph.snapshot import ProjectGraphSnapshotCodec
from app.services.project_graph.deletion_validator import validate_delete_command


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


def test_project_graph_crdt_bridge_runs_snapshot_cli_with_timeout(monkeypatch, tmp_path):
    frontend_dir = tmp_path / "frontend"
    scripts_dir = frontend_dir / "scripts"
    scripts_dir.mkdir(parents=True)
    (scripts_dir / "project-graph-snapshot-cli.mjs").write_text("", encoding="utf-8")
    captured = {}

    def fake_run(*args, **kwargs):
        captured.update(kwargs)
        return subprocess.CompletedProcess(args[0], 0, stdout=b"\x01snapshot", stderr=b"")

    monkeypatch.setattr(crdt_bridge, "PROJECT_GRAPH_BRIDGE_TIMEOUT_SECONDS", 0.25, raising=False)
    monkeypatch.setattr(subprocess, "run", fake_run)

    graph = ProjectGraphSnapshotCodec.load({
        "project_id": "bridge-timeout",
        "files": [],
        "labels": [],
        "label_starts": [],
        "nodes": [],
        "edges": [],
        "diagnostics": [],
        "source_index": {"files": {}},
    })

    ProjectGraphCrdtSnapshotBridge(frontend_dir=frontend_dir).export_snapshot(graph)

    assert captured["timeout"] == 0.25


def test_snapshot_bridge_deletes_scenario_relation_and_inserts_pass():
    frontend_dir = Path(__file__).resolve().parents[2] / "frontend"
    graph = {
        "project_id": "bridge-delete-mouse",
        "files": [
            {"id": "file-main", "path": "script.rpy", "order": "0000", "visual": {"position": {"x": 0, "y": 0}, "size": {"width": 800, "height": 600}}},
            {"id": "file-ending", "path": "ending.rpy", "order": "0001", "visual": {"position": {"x": 900, "y": 0}, "size": {"width": 800, "height": 600}}},
        ],
        "labels": [
            {"id": "label-start", "file_id": "file-main", "parent_label_id": None, "name": "start", "qualified_name": "start", "scope": "global", "label_start_node_id": "start-start", "source_span": None, "visual": {"position": {"x": 40, "y": 40}, "size": {"width": 600, "height": 400}}},
            {"id": "label-ending", "file_id": "file-ending", "parent_label_id": None, "name": "ending", "qualified_name": "ending", "scope": "global", "label_start_node_id": "start-ending", "source_span": None, "visual": {"position": {"x": 40, "y": 40}, "size": {"width": 600, "height": 400}}},
        ],
        "label_starts": [
            {"id": "start-start", "file_id": "file-main", "label_id": "label-start", "qualified_name": "start", "content": "label start:", "visual": {"position": {"x": 32, "y": 32}, "size": {"width": 260, "height": 72}}},
            {"id": "start-ending", "file_id": "file-ending", "label_id": "label-ending", "qualified_name": "ending", "content": "label ending:", "visual": {"position": {"x": 32, "y": 32}, "size": {"width": 260, "height": 72}}},
        ],
        "nodes": [
            {"id": "node-jump", "file_id": "file-main", "label_id": "label-start", "parent_node_id": None, "type": "jump", "content": "jump ending", "order": "0000", "source_span": None, "metadata": {}, "visual": {"position": {"x": 64, "y": 136}, "size": {"width": 320, "height": 88}}},
            {"id": "node-ending", "file_id": "file-ending", "label_id": "label-ending", "parent_node_id": None, "type": "return", "content": "return", "order": "0000", "source_span": None, "metadata": {}, "visual": {"position": {"x": 64, "y": 136}, "size": {"width": 320, "height": 88}}},
        ],
        "edges": [{"id": "edge-ending", "source_node_id": "node-jump", "target_node_id": "start-ending", "kind": "jump", "metadata": {"target": "ending"}}],
        "diagnostics": [], "source_index": {"files": {}},
    }
    bridge = ProjectGraphCrdtSnapshotBridge(frontend_dir=frontend_dir)
    snapshot = bridge.export_snapshot(ProjectGraphSnapshotCodec.load(graph))
    command = validate_delete_command({"kind": "delete", "entityId": "node-jump"}, bridge.import_snapshot(snapshot))
    mutation = bridge.mutate_structure(snapshot, command)
    updated = bridge.import_snapshot(mutation["snapshot"])

    assert not any(node.id == "node-jump" for node in updated.nodes)
    assert updated.edges == []
    replacement = next(node for node in updated.nodes if node.label_id == "label-start")
    assert replacement.content == "pass"
    assert mutation["result"]["deletedEntityIds"]["nodes"] == ["node-jump"]


def test_snapshot_cli_emits_schema_v2_native_scenario_order_and_keyed_edges():
    frontend_dir = Path(__file__).resolve().parents[2] / "frontend"
    graph = {
        "project_id": "bridge-schema-v2",
        "files": [{
            "id": "file-main",
            "path": "script.rpy",
            "order": "0000",
            "visual": {"position": {"x": 0, "y": 0}, "size": {"width": 800, "height": 600}},
        }],
        "labels": [{
            "id": "label-start",
            "file_id": "file-main",
            "parent_label_id": None,
            "name": "start",
            "qualified_name": "start",
            "scope": "global",
            "label_start_node_id": "start-start",
            "source_span": {"start_line": 0, "end_line": 0},
            "visual": {"position": {"x": 40, "y": 40}, "size": {"width": 600, "height": 400}},
        }],
        "label_starts": [{
            "id": "start-start",
            "file_id": "file-main",
            "label_id": "label-start",
            "qualified_name": "start",
            "content": "label start:",
            "visual": {"position": {"x": 32, "y": 32}, "size": {"width": 260, "height": 72}},
        }],
        "nodes": [
            {
                "id": "node-action",
                "file_id": "file-main",
                "label_id": "label-start",
                "parent_node_id": None,
                "type": "action",
                "content": "pass",
                "order": "0000",
                "source_span": {"start_line": 1, "end_line": 1},
                "metadata": {},
                "visual": {"position": {"x": 64, "y": 136}, "size": {"width": 320, "height": 88}},
            },
            {
                "id": "node-call",
                "file_id": "file-main",
                "label_id": "label-start",
                "parent_node_id": None,
                "type": "call",
                "content": "call start",
                "order": "0001",
                "source_span": {"start_line": 2, "end_line": 2},
                "metadata": {"target": "start"},
                "visual": {"position": {"x": 64, "y": 248}, "size": {"width": 280, "height": 72}},
            },
        ],
        "edges": [{
            "id": "edge-call-start",
            "source_node_id": "node-call",
            "target_node_id": "start-start",
            "kind": "call",
            "metadata": {"target": "start"},
        }],
        "diagnostics": [],
        "source_index": {"files": {}},
    }
    snapshot = subprocess.run(
        ["node", "scripts/project-graph-snapshot-cli.mjs", "encode"],
        cwd=frontend_dir,
        input=json.dumps(graph).encode(),
        capture_output=True,
        check=True,
    ).stdout
    inspector = """
import { LoroDoc } from 'loro-crdt';
const chunks = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
const doc = LoroDoc.fromSnapshot(new Uint8Array(Buffer.concat(chunks)));
const label = doc.getTree('project_graph_tree').toJSON()[0].children.find((node) => node.meta.entity_id === 'label-start');
const scenarioIds = label.children.filter((node) => node.meta.kind === 'scenario').map((node) => node.meta.entity_id);
console.log(JSON.stringify({
  schemaVersion: doc.getMap('project_graph_meta').get('schema_version'),
  scenarioIds,
  edgeIds: Object.keys(doc.getMap('project_graph_edges').toJSON()),
}));
"""
    inspected = subprocess.run(
        ["node", "--input-type=module", "-e", inspector],
        cwd=frontend_dir,
        input=snapshot,
        capture_output=True,
        check=True,
    )
    result = json.loads(inspected.stdout)

    assert result == {
        "schemaVersion": 2,
        "scenarioIds": ["node-action", "node-call"],
        "edgeIds": ["edge-call-start"],
    }


def test_snapshot_cli_mutates_continuation_with_new_relation_target():
    frontend_dir = Path(__file__).resolve().parents[2] / "frontend"
    graph = {
        "project_id": "bridge-continuation",
        "files": [{
            "id": "file-main",
            "path": "renpy_mouse_day_1.rpy",
            "order": "0000",
            "visual": {"position": {"x": 0, "y": 0}, "size": {"width": 800, "height": 600}},
        }],
        "labels": [{
            "id": "label-start",
            "file_id": "file-main",
            "parent_label_id": None,
            "name": "start",
            "qualified_name": "start",
            "scope": "global",
            "label_start_node_id": "start-start",
            "source_span": {"start_line": 0, "end_line": 0},
            "visual": {"position": {"x": 40, "y": 40}, "size": {"width": 600, "height": 400}},
        }],
        "label_starts": [{
            "id": "start-start",
            "file_id": "file-main",
            "label_id": "label-start",
            "qualified_name": "start",
            "content": "label start:",
            "visual": {"position": {"x": 32, "y": 32}, "size": {"width": 260, "height": 72}},
        }],
        "nodes": [{
            "id": "node-action",
            "file_id": "file-main",
            "label_id": "label-start",
            "parent_node_id": None,
            "type": "action",
            "content": 'r "RenPy Mouse asks for a new cheese route."',
            "order": "0000",
            "source_span": {"start_line": 1, "end_line": 1},
            "metadata": {},
            "visual": {"position": {"x": 64, "y": 136}, "size": {"width": 320, "height": 88}},
        }],
        "edges": [],
        "diagnostics": [],
        "source_index": {"files": {}},
    }
    snapshot = subprocess.run(
        ["node", "scripts/project-graph-snapshot-cli.mjs", "encode"],
        cwd=frontend_dir,
        input=json.dumps(graph).encode(),
        capture_output=True,
        check=True,
    ).stdout

    response = subprocess.run(
        ["node", "scripts/project-graph-snapshot-cli.mjs", "mutate-continuation"],
        cwd=frontend_dir,
        input=json.dumps({
            "snapshotBase64": base64.b64encode(snapshot).decode(),
            "command": {
                "sourceNodeId": "node-action",
                "action": "jump",
                "target": {
                    "kind": "new",
                    "draftId": "draft-cheese-heist",
                    "file": {"kind": "new", "path": "chapters/cheese_heist.rpy"},
                    "scope": "global",
                    "ownerLabelId": None,
                    "name": "cheese_heist",
                },
                "idSeed": "mouse-seed",
            },
        }).encode(),
        capture_output=True,
        check=True,
    )
    payload = json.loads(response.stdout)
    mutated_snapshot = base64.b64decode(payload["snapshotBase64"])
    decoded = subprocess.run(
        ["node", "scripts/project-graph-snapshot-cli.mjs", "decode"],
        cwd=frontend_dir,
        input=mutated_snapshot,
        capture_output=True,
        check=True,
    )
    updated_graph = json.loads(decoded.stdout)

    assert payload["updateBase64"]
    assert payload["result"]["createdTargetIds"]["files"]
    assert "chapters/cheese_heist.rpy" in [file["path"] for file in updated_graph["files"]]
    created_file = next(file for file in updated_graph["files"] if file["path"] == "chapters/cheese_heist.rpy")
    assert updated_graph["source_index"]["files"][created_file["id"]] == {"path": "chapters/cheese_heist.rpy", "content": ""}
    assert "cheese_heist" in [label["qualified_name"] for label in updated_graph["labels"]]
    jump = next(node for node in updated_graph["nodes"] if node["type"] == "jump")
    target_start = next(start for start in updated_graph["label_starts"] if start["qualified_name"] == "cheese_heist")
    target_pass = next(node for node in updated_graph["nodes"] if node["label_id"] == target_start["label_id"])
    assert jump["content"] == "jump cheese_heist"
    assert target_pass["type"] == "action"
    assert target_pass["content"] == "pass"
    assert any(edge["source_node_id"] == jump["id"] and edge["target_node_id"] == target_start["id"] for edge in updated_graph["edges"])


def test_snapshot_cli_mutates_nested_continuation_with_local_relation_target():
    frontend_dir = Path(__file__).resolve().parents[2] / "frontend"
    graph = {
        "project_id": "bridge-local-continuation",
        "files": [{
            "id": "file-main",
            "path": "renpy_mouse_day_1.rpy",
            "order": "0000",
            "visual": {"position": {"x": 0, "y": 0}, "size": {"width": 800, "height": 600}},
            "metadata": {"code_only": True, "code_only_reason": "no_labels"},
        }],
        "labels": [{
            "id": "label-start",
            "file_id": "file-main",
            "parent_label_id": None,
            "name": "start",
            "qualified_name": "start",
            "scope": "global",
            "label_start_node_id": "start-start",
            "source_span": {"start_line": 0, "end_line": 0},
            "visual": {"position": {"x": 40, "y": 40}, "size": {"width": 600, "height": 400}},
        }],
        "label_starts": [{
            "id": "start-start",
            "file_id": "file-main",
            "label_id": "label-start",
            "qualified_name": "start",
            "content": "label start:",
            "visual": {"position": {"x": 32, "y": 32}, "size": {"width": 260, "height": 72}},
        }],
        "nodes": [{
            "id": "node-action",
            "file_id": "file-main",
            "label_id": "label-start",
            "parent_node_id": None,
            "type": "action",
            "content": 'r "RenPy Mouse checks the cache condition."',
            "order": "0000",
            "source_span": {"start_line": 1, "end_line": 1},
            "metadata": {},
            "visual": {"position": {"x": 64, "y": 136}, "size": {"width": 320, "height": 88}},
        }],
        "edges": [],
        "diagnostics": [],
        "source_index": {"files": {}},
    }
    snapshot = subprocess.run(
        ["node", "scripts/project-graph-snapshot-cli.mjs", "encode"],
        cwd=frontend_dir,
        input=json.dumps(graph).encode(),
        capture_output=True,
        check=True,
    ).stdout

    response = subprocess.run(
        ["node", "scripts/project-graph-snapshot-cli.mjs", "mutate-continuation"],
        cwd=frontend_dir,
        input=json.dumps({
            "snapshotBase64": base64.b64encode(snapshot).decode(),
            "command": {
                "sourceNodeId": "node-action",
                "action": "conditional",
                "conditionalDraft": {
                    "mode": "builder",
                    "ifBranch": {
                        "condition": "renpy_mouse_hungry",
                        "continuation": {
                            "kind": "call",
                            "target": {
                                "kind": "new",
                                "draftId": "draft-cache",
                                "file": {"kind": "existing", "fileId": "file-main"},
                                "scope": "local",
                                "ownerLabelId": "label-start",
                                "name": "cheese_cache",
                            },
                        },
                    },
                    "elifBranches": [],
                    "elseBranch": None,
                },
                "idSeed": "local-seed",
            },
        }).encode(),
        capture_output=True,
        check=True,
    )
    payload = json.loads(response.stdout)
    updated_graph = json.loads(subprocess.run(
        ["node", "scripts/project-graph-snapshot-cli.mjs", "decode"],
        cwd=frontend_dir,
        input=base64.b64decode(payload["snapshotBase64"]),
        capture_output=True,
        check=True,
    ).stdout)

    local_label = next(label for label in updated_graph["labels"] if label["qualified_name"] == "start.cheese_cache")
    assert local_label["parent_label_id"] == "label-start"
    assert local_label["name"] == ".cheese_cache"
    assert updated_graph["files"][0].get("metadata", {}) == {}
    call = next(node for node in updated_graph["nodes"] if node["type"] == "call")
    if_node = next(node for node in updated_graph["nodes"] if node["type"] == "if")
    target_start = next(start for start in updated_graph["label_starts"] if start["label_id"] == local_label["id"])
    assert if_node["content"] == "if renpy_mouse_hungry:"
    assert call["parent_node_id"] == if_node["id"]
    assert call["content"] == "call start.cheese_cache"
    assert any(edge["source_node_id"] == call["id"] and edge["target_node_id"] == target_start["id"] for edge in updated_graph["edges"])
