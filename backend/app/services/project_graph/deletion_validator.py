from __future__ import annotations

from typing import Any

from .models import FlowEdge, ProjectGraph, ScenarioNode


BLOCK_PARENT_TYPES = {"menu_choice", "if", "elif", "else"}


def _descendant_labels(graph: ProjectGraph, root_id: str) -> set[str]:
    result = {root_id}
    changed = True
    while changed:
        changed = False
        for label in graph.labels:
            if label.parent_label_id in result and label.id not in result:
                result.add(label.id)
                changed = True
    return result


def _descendant_nodes(graph: ProjectGraph, roots: set[str]) -> set[str]:
    result = set(roots)
    changed = True
    while changed:
        changed = False
        for node in graph.nodes:
            if node.parent_node_id in result and node.id not in result:
                result.add(node.id)
                changed = True
    return result


def _conditional_roots(graph: ProjectGraph, node: ScenarioNode) -> set[str]:
    if node.type != "if":
        return {node.id}
    siblings = sorted(
        (candidate for candidate in graph.nodes if candidate.label_id == node.label_id and candidate.parent_node_id == node.parent_node_id),
        key=lambda candidate: candidate.order,
    )
    start = next(index for index, candidate in enumerate(siblings) if candidate.id == node.id)
    roots = {node.id}
    for sibling in siblings[start + 1:]:
        if sibling.type not in {"elif", "else"}:
            break
        roots.add(sibling.id)
    return roots


def _reference(graph: ProjectGraph, edge: FlowEdge) -> dict[str, Any]:
    source = next((node for node in graph.nodes if node.id == edge.source_node_id), None)
    source_file = next((file for file in graph.files if file.id == (source.file_id if source else None)), None)
    source_label = next((label for label in graph.labels if label.id == (source.label_id if source else None)), None)
    target_start = next((start for start in graph.label_starts if start.id == edge.target_node_id), None)
    target_label = next((label for label in graph.labels if label.id == (target_start.label_id if target_start else None)), None)
    return {
        "edgeId": edge.id, "kind": edge.kind, "sourceNodeId": edge.source_node_id,
        "sourceNodeContent": source.content if source else "", "sourceFileId": source.file_id if source else "",
        "sourceFilePath": source_file.path if source_file else "", "sourceLabelId": source.label_id if source else "",
        "sourceLabelQualifiedName": source_label.qualified_name if source_label else "",
        "targetNodeId": edge.target_node_id, "targetLabelId": target_label.id if target_label else None,
        "targetLabelQualifiedName": target_label.qualified_name if target_label else None,
    }


def analyze_deletion(graph: ProjectGraph, entity_id: str) -> dict[str, Any]:
    file = next((candidate for candidate in graph.files if candidate.id == entity_id), None)
    label = next((candidate for candidate in graph.labels if candidate.id == entity_id), None)
    label_start = next((candidate for candidate in graph.label_starts if candidate.id == entity_id), None)
    scenario = next((candidate for candidate in graph.nodes if candidate.id == entity_id), None)
    if not any((file, label, label_start, scenario)):
        raise ValueError(f"Unknown ProjectGraph entity: {entity_id}")

    file_ids: set[str] = set()
    label_ids: set[str] = set()
    node_ids: set[str] = set()
    blockers: list[dict[str, Any]] = []
    kind = "scenario"
    title = scenario.content.splitlines()[0] if scenario and scenario.content else entity_id
    if label_start:
        title = label_start.qualified_name
        blockers.append({"code": "protected_label_start", "nodeId": label_start.id})
    elif file:
        kind, title = "file", file.path
        file_ids.add(file.id)
        label_ids.update(candidate.id for candidate in graph.labels if candidate.file_id == file.id)
    elif label:
        kind, title = "label", label.qualified_name
        label_ids.update(_descendant_labels(graph, label.id))
    elif scenario:
        node_ids.update(_descendant_nodes(graph, _conditional_roots(graph, scenario)))

    node_ids.update(node.id for node in graph.nodes if node.label_id in label_ids)
    label_start_ids = {start.id for start in graph.label_starts if start.label_id in label_ids}
    runtime_node_ids = node_ids | label_start_ids
    if file_ids and len(file_ids) == len(graph.files):
        blockers.append({"code": "last_file", "nodeId": None})
    protected_start = next((candidate for candidate in graph.labels if candidate.id in label_ids and candidate.scope == "global" and candidate.qualified_name == "start"), None)
    if protected_start:
        blockers.append({"code": "protected_start_label", "nodeId": protected_start.label_start_node_id})

    incoming_edges = [edge for edge in graph.edges if edge.target_node_id in runtime_node_ids and edge.source_node_id not in node_ids]
    outgoing_edges = [edge for edge in graph.edges if edge.source_node_id in node_ids and edge.target_node_id not in runtime_node_ids]
    deleted_edges = [edge for edge in graph.edges if edge.target_node_id in runtime_node_ids or edge.source_node_id in node_ids]
    if label_ids:
        blockers.extend(
            {"code": "dynamic_reference", "nodeId": diagnostic.node_id, "diagnosticId": diagnostic.id}
            for diagnostic in graph.diagnostics
            if diagnostic.code == "dynamic_target" and diagnostic.node_id and diagnostic.node_id not in node_ids
        )

    replacement_parents: list[dict[str, str]] = []
    for candidate in graph.labels:
        if candidate.id in label_ids:
            continue
        before = [node for node in graph.nodes if node.label_id == candidate.id and node.parent_node_id is None]
        if any(node.id in node_ids for node in before) and not any(node.id not in node_ids for node in before):
            replacement_parents.append({"kind": "label", "id": candidate.id})
    for parent in graph.nodes:
        if parent.id in node_ids or parent.type not in BLOCK_PARENT_TYPES:
            continue
        before = [node for node in graph.nodes if node.parent_node_id == parent.id]
        if any(node.id in node_ids for node in before) and not any(node.id not in node_ids for node in before):
            replacement_parents.append({"kind": "scenario", "id": parent.id})
    for menu in (node for node in graph.nodes if node.type == "menu" and node.id not in node_ids):
        choices = [node for node in graph.nodes if node.parent_node_id == menu.id and node.type == "menu_choice"]
        if choices and all(choice.id in node_ids for choice in choices):
            blockers.append({"code": "empty_menu", "nodeId": menu.id})

    diagnostic_ids = [
        diagnostic.id for diagnostic in graph.diagnostics
        if diagnostic.file_id in file_ids or diagnostic.label_id in label_ids or diagnostic.node_id in runtime_node_ids
    ]
    warnings: list[dict[str, Any]] = []
    nested_count = len(file_ids) + len(label_ids) + len(label_start_ids) + len(node_ids) - 1
    if nested_count > 0:
        warnings.append({"code": "nested_entities", "count": nested_count})
    if outgoing_edges:
        warnings.append({"code": "outgoing_references", "count": len(outgoing_edges)})
    if diagnostic_ids:
        warnings.append({"code": "diagnostics_removed", "count": len(diagnostic_ids)})
    if replacement_parents:
        warnings.append({"code": "pass_inserted", "count": len(replacement_parents)})
    source_files = graph.source_index.get("files", {}) if isinstance(graph.source_index, dict) else {}
    affected_file_ids = file_ids | {label.file_id for label in graph.labels if label.id in label_ids}
    if any(isinstance(source_files.get(file_id), dict) and str(source_files[file_id].get("content", "")).strip() for file_id in affected_file_ids):
        warnings.append({"code": "opaque_code", "count": 1})

    return {
        "entity": {"id": entity_id, "kind": kind, "title": title},
        "canDelete": not blockers and not incoming_edges,
        "deleteEntityIds": {
            "files": sorted(file_ids), "labels": sorted(label_ids), "labelStarts": sorted(label_start_ids),
            "nodes": sorted(node_ids), "edges": [edge.id for edge in deleted_edges], "diagnostics": diagnostic_ids,
        },
        "incomingReferences": [_reference(graph, edge) for edge in incoming_edges],
        "outgoingReferences": [_reference(graph, edge) for edge in outgoing_edges],
        "blockers": blockers, "warnings": warnings, "replacementPassParents": replacement_parents,
    }


def validate_delete_command(payload: Any, graph: ProjectGraph) -> dict[str, Any]:
    entity_id = payload.get("entityId") if isinstance(payload, dict) else None
    if not isinstance(entity_id, str) or not entity_id:
        raise ValueError("ProjectGraph delete entityId is required")
    impact = analyze_deletion(graph, entity_id)
    if not impact["canDelete"]:
        raise UnsafeProjectGraphDeletion(impact)
    return {"kind": "delete", "entityId": entity_id, **impact}


class UnsafeProjectGraphDeletion(ValueError):
    def __init__(self, impact: dict[str, Any]):
        super().__init__("ProjectGraph deletion is blocked")
        self.impact = impact
