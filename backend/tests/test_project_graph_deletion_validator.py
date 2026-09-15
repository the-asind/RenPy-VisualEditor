from app.services.project_graph.deletion_validator import analyze_deletion
from app.services.project_graph.models import (
    FileFrame, FlowEdge, FramePosition, FrameSize, FrameVisual, LabelFrame, LabelStartNode, ProjectGraph, ScenarioNode,
)


def _delete_graph() -> ProjectGraph:
    visual = FrameVisual(FramePosition(0, 0), FrameSize(100, 100))
    return ProjectGraph(
        project_id="delete-mouse",
        files=[FileFrame("file-main", "script.rpy", "0000", visual), FileFrame("file-ending", "ending.rpy", "0001", visual)],
        labels=[
            LabelFrame("label-start", "file-main", None, "start", "start", "global", "start-start", None, visual),
            LabelFrame("label-ending", "file-ending", None, "ending", "ending", "global", "start-ending", None, visual),
            LabelFrame("label-cheese", "file-ending", "label-ending", ".cheese", "ending.cheese", "local", "start-cheese", None, visual),
        ],
        label_starts=[
            LabelStartNode("start-start", "file-main", "label-start", "start", "label start:", visual),
            LabelStartNode("start-ending", "file-ending", "label-ending", "ending", "label ending:", visual),
            LabelStartNode("start-cheese", "file-ending", "label-cheese", "ending.cheese", "label .cheese:", visual),
        ],
        nodes=[
            ScenarioNode("node-jump", "file-main", "label-start", None, "jump", "jump ending", "0000", None, {}, visual),
            ScenarioNode("node-ending", "file-ending", "label-ending", None, "dialogue", 'r "The mouse finds cheese."', "0000", None, {}, visual),
            ScenarioNode("node-cheese", "file-ending", "label-cheese", None, "return", "return", "0000", None, {}, visual),
        ],
        edges=[FlowEdge("edge-ending", "node-jump", "start-ending", "jump", {"target": "ending"})],
    )


def test_label_delete_is_blocked_by_external_jump_and_reports_source_location():
    impact = analyze_deletion(_delete_graph(), "label-ending")
    assert impact["canDelete"] is False
    assert impact["deleteEntityIds"]["labels"] == ["label-cheese", "label-ending"]
    assert impact["incomingReferences"] == [{
        "edgeId": "edge-ending", "kind": "jump", "sourceNodeId": "node-jump", "sourceNodeContent": "jump ending",
        "sourceFileId": "file-main", "sourceFilePath": "script.rpy", "sourceLabelId": "label-start",
        "sourceLabelQualifiedName": "start", "targetNodeId": "start-ending", "targetLabelId": "label-ending",
        "targetLabelQualifiedName": "ending",
    }]


def test_source_jump_delete_removes_outgoing_edge_and_requests_replacement_pass():
    impact = analyze_deletion(_delete_graph(), "node-jump")
    assert impact["canDelete"] is True
    assert [reference["edgeId"] for reference in impact["outgoingReferences"]] == ["edge-ending"]
    assert impact["deleteEntityIds"]["edges"] == ["edge-ending"]
    assert impact["replacementPassParents"] == [{"kind": "label", "id": "label-start"}]


def test_protects_label_start_global_start_and_last_file():
    graph = _delete_graph()
    assert {item["code"] for item in analyze_deletion(graph, "start-ending")["blockers"]} == {"protected_label_start"}
    assert {item["code"] for item in analyze_deletion(graph, "label-start")["blockers"]} == {"protected_start_label"}
    single = ProjectGraph(
        project_id=graph.project_id, files=graph.files[:1], labels=graph.labels[:1], label_starts=graph.label_starts[:1],
        nodes=graph.nodes[:1], edges=[],
    )
    assert {item["code"] for item in analyze_deletion(single, "file-main")["blockers"]} == {"last_file", "protected_start_label"}
