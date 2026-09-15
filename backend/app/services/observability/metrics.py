from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram, generate_latest
from prometheus_client.exposition import CONTENT_TYPE_LATEST

METRICS_PREFIX = "rve"

registry = CollectorRegistry()

http_requests_total = Counter(
    f"{METRICS_PREFIX}_http_requests_total",
    "Total HTTP requests handled by the RenPy Visual Editor backend.",
    ["method", "route", "status_class"],
    registry=registry,
)

http_request_duration_seconds = Histogram(
    f"{METRICS_PREFIX}_http_request_duration_seconds",
    "HTTP request duration in seconds for the RenPy Visual Editor backend.",
    ["method", "route", "status_class"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60),
    registry=registry,
)

http_request_in_progress = Gauge(
    f"{METRICS_PREFIX}_http_request_in_progress",
    "HTTP requests currently in progress in the RenPy Visual Editor backend.",
    ["method"],
    registry=registry,
)

_COUNT_BUCKETS = (0, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000)
_BYTE_BUCKETS = (0, 128, 512, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304, 16777216)
_DURATION_BUCKETS = (0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60)

graph_import_requests_total = Counter(
    f"{METRICS_PREFIX}_graph_import_requests_total",
    "Total ProjectGraph import requests by source and result.",
    ["result", "source"],
    registry=registry,
)
graph_import_duration_seconds = Histogram(
    f"{METRICS_PREFIX}_graph_import_duration_seconds",
    "ProjectGraph import duration in seconds.",
    ["result", "source"],
    buckets=_DURATION_BUCKETS,
    registry=registry,
)
graph_import_files = Histogram(
    f"{METRICS_PREFIX}_graph_import_files",
    "Number of files in a ProjectGraph import.",
    ["source"],
    buckets=_COUNT_BUCKETS,
    registry=registry,
)
graph_import_labels = Histogram(
    f"{METRICS_PREFIX}_graph_import_labels",
    "Number of labels produced by a ProjectGraph import.",
    ["source"],
    buckets=_COUNT_BUCKETS,
    registry=registry,
)
graph_import_label_starts = Histogram(
    f"{METRICS_PREFIX}_graph_import_label_starts",
    "Number of label start nodes produced by a ProjectGraph import.",
    ["source"],
    buckets=_COUNT_BUCKETS,
    registry=registry,
)
graph_import_nodes = Histogram(
    f"{METRICS_PREFIX}_graph_import_nodes",
    "Number of scenario nodes produced by a ProjectGraph import.",
    ["source"],
    buckets=_COUNT_BUCKETS,
    registry=registry,
)
graph_import_edges = Histogram(
    f"{METRICS_PREFIX}_graph_import_edges",
    "Number of flow edges produced by a ProjectGraph import.",
    ["source"],
    buckets=_COUNT_BUCKETS,
    registry=registry,
)
graph_import_diagnostics = Histogram(
    f"{METRICS_PREFIX}_graph_import_diagnostics",
    "Number of diagnostics produced by a ProjectGraph import.",
    ["source", "severity"],
    buckets=_COUNT_BUCKETS,
    registry=registry,
)
graph_import_snapshot_bytes = Histogram(
    f"{METRICS_PREFIX}_graph_import_snapshot_bytes",
    "Binary Loro snapshot size produced by a ProjectGraph import.",
    ["source"],
    buckets=_BYTE_BUCKETS,
    registry=registry,
)
graph_import_catalog_entries = Histogram(
    f"{METRICS_PREFIX}_graph_import_catalog_entries",
    "Number of asset catalog entries included with a ProjectGraph import.",
    ["source"],
    buckets=_COUNT_BUCKETS,
    registry=registry,
)

crdt_snapshot_loads_total = Counter(
    f"{METRICS_PREFIX}_crdt_snapshot_loads_total",
    "Total ProjectGraph CRDT snapshot load requests.",
    ["result"],
    registry=registry,
)
crdt_snapshot_load_duration_seconds = Histogram(
    f"{METRICS_PREFIX}_crdt_snapshot_load_duration_seconds",
    "ProjectGraph CRDT snapshot load duration in seconds.",
    ["result"],
    buckets=_DURATION_BUCKETS,
    registry=registry,
)
crdt_snapshot_saves_total = Counter(
    f"{METRICS_PREFIX}_crdt_snapshot_saves_total",
    "Total ProjectGraph CRDT snapshot save requests.",
    ["result"],
    registry=registry,
)
crdt_snapshot_save_duration_seconds = Histogram(
    f"{METRICS_PREFIX}_crdt_snapshot_save_duration_seconds",
    "ProjectGraph CRDT snapshot save duration in seconds.",
    ["result"],
    buckets=_DURATION_BUCKETS,
    registry=registry,
)
crdt_snapshot_bytes = Histogram(
    f"{METRICS_PREFIX}_crdt_snapshot_bytes",
    "ProjectGraph CRDT snapshot size in bytes.",
    ["operation"],
    buckets=_BYTE_BUCKETS,
    registry=registry,
)

loro_bridge_runs_total = Counter(
    f"{METRICS_PREFIX}_loro_bridge_runs_total",
    "Total Loro snapshot bridge runs.",
    ["operation", "result"],
    registry=registry,
)
loro_bridge_duration_seconds = Histogram(
    f"{METRICS_PREFIX}_loro_bridge_duration_seconds",
    "Loro snapshot bridge duration in seconds.",
    ["operation", "result"],
    buckets=_DURATION_BUCKETS,
    registry=registry,
)
loro_bridge_output_bytes = Histogram(
    f"{METRICS_PREFIX}_loro_bridge_output_bytes",
    "Loro snapshot bridge output size in bytes.",
    ["operation"],
    buckets=_BYTE_BUCKETS,
    registry=registry,
)

graph_export_requests_total = Counter(
    f"{METRICS_PREFIX}_graph_export_requests_total",
    "Total ProjectGraph export requests.",
    ["result"],
    registry=registry,
)
graph_export_duration_seconds = Histogram(
    f"{METRICS_PREFIX}_graph_export_duration_seconds",
    "ProjectGraph export duration in seconds.",
    ["result"],
    buckets=_DURATION_BUCKETS,
    registry=registry,
)
graph_export_files = Histogram(
    f"{METRICS_PREFIX}_graph_export_files",
    "Number of files produced by ProjectGraph export.",
    buckets=_COUNT_BUCKETS,
    registry=registry,
)
graph_export_bytes = Histogram(
    f"{METRICS_PREFIX}_graph_export_bytes",
    "Total byte size of ProjectGraph export output.",
    buckets=_BYTE_BUCKETS,
    registry=registry,
)
graph_export_blocking_diagnostics = Histogram(
    f"{METRICS_PREFIX}_graph_export_blocking_diagnostics",
    "Number of blocking diagnostics found during ProjectGraph export.",
    buckets=_COUNT_BUCKETS,
    registry=registry,
)
graph_export_warning_diagnostics = Histogram(
    f"{METRICS_PREFIX}_graph_export_warning_diagnostics",
    "Number of warning diagnostics found during ProjectGraph export.",
    buckets=_COUNT_BUCKETS,
    registry=registry,
)

asset_catalog_requests_total = Counter(
    f"{METRICS_PREFIX}_asset_catalog_requests_total",
    "Total ProjectGraph asset catalog requests.",
    ["operation", "result"],
    registry=registry,
)
asset_catalog_duration_seconds = Histogram(
    f"{METRICS_PREFIX}_asset_catalog_duration_seconds",
    "ProjectGraph asset catalog operation duration in seconds.",
    ["operation", "result"],
    buckets=_DURATION_BUCKETS,
    registry=registry,
)
asset_catalog_entries = Histogram(
    f"{METRICS_PREFIX}_asset_catalog_entries",
    "Asset catalog entry count by kind for one catalog operation.",
    ["kind", "operation"],
    buckets=_COUNT_BUCKETS,
    registry=registry,
)
asset_catalog_total_entries = Histogram(
    f"{METRICS_PREFIX}_asset_catalog_total_entries",
    "Total asset catalog entry count for one catalog operation.",
    ["operation"],
    buckets=_COUNT_BUCKETS,
    registry=registry,
)
asset_catalog_character_image_mappings = Histogram(
    f"{METRICS_PREFIX}_asset_catalog_character_image_mappings",
    "Number of character image mappings in one asset catalog operation.",
    ["operation"],
    buckets=_COUNT_BUCKETS,
    registry=registry,
)

ws_project_connections_current = Gauge(
    f"{METRICS_PREFIX}_ws_project_connections_current",
    "Current project WebSocket connections across all project rooms.",
    registry=registry,
)
ws_project_rooms_current = Gauge(
    f"{METRICS_PREFIX}_ws_project_rooms_current",
    "Current project WebSocket rooms with at least one connected client.",
    registry=registry,
)
ws_project_connections_total = Counter(
    f"{METRICS_PREFIX}_ws_project_connections_total",
    "Total project WebSocket connection attempts.",
    ["result"],
    registry=registry,
)
ws_project_disconnects_total = Counter(
    f"{METRICS_PREFIX}_ws_project_disconnects_total",
    "Total project WebSocket disconnects.",
    ["reason"],
    registry=registry,
)
ws_messages_total = Counter(
    f"{METRICS_PREFIX}_ws_messages_total",
    "Total project WebSocket frames by type, direction, and result.",
    ["frame_type", "direction", "result"],
    registry=registry,
)
ws_binary_update_bytes = Histogram(
    f"{METRICS_PREFIX}_ws_binary_update_bytes",
    "Project WebSocket binary CRDT update frame size in bytes.",
    ["direction"],
    buckets=_BYTE_BUCKETS,
    registry=registry,
)
ws_json_messages_total = Counter(
    f"{METRICS_PREFIX}_ws_json_messages_total",
    "Total project WebSocket JSON messages by normalized message type.",
    ["message_type", "direction", "result"],
    registry=registry,
)
ws_broadcast_duration_seconds = Histogram(
    f"{METRICS_PREFIX}_ws_broadcast_duration_seconds",
    "Project WebSocket broadcast duration in seconds.",
    ["frame_type", "result"],
    buckets=_DURATION_BUCKETS,
    registry=registry,
)

_WS_MESSAGE_TYPES = {
    "active_users",
    "cursor_update",
    "error",
    "invalid_json",
    "ping",
    "pong",
    "project_shared",
    "share_project",
    "unknown",
    "user_left_project",
}
_WS_DIRECTIONS = {"incoming", "outgoing"}
_WS_FRAME_TYPES = {"binary", "text", "other"}
_WS_RESULTS = {
    "authentication_failed",
    "broadcast_error",
    "error",
    "ignored",
    "invalid_json",
    "no_room",
    "permission_denied",
    "success",
}
_WS_DISCONNECT_REASONS = {"client_disconnect", "error", "unknown"}


def observe_http_request(method: str, route: str, status_code: int, duration_seconds: float) -> None:
    status_class = f"{status_code // 100}xx"
    labels = {"method": method, "route": route, "status_class": status_class}
    http_requests_total.labels(**labels).inc()
    http_request_duration_seconds.labels(**labels).observe(duration_seconds)


def observe_graph_import(
    *,
    source: str,
    result: str,
    duration_seconds: float,
    file_count: int = 0,
    label_count: int = 0,
    label_start_count: int = 0,
    node_count: int = 0,
    edge_count: int = 0,
    diagnostics: dict[str, int] | None = None,
    snapshot_bytes: int = 0,
    catalog_entry_count: int = 0,
) -> None:
    graph_import_requests_total.labels(result=result, source=source).inc()
    graph_import_duration_seconds.labels(result=result, source=source).observe(duration_seconds)
    if result == "success":
        graph_import_files.labels(source=source).observe(file_count)
        graph_import_labels.labels(source=source).observe(label_count)
        graph_import_label_starts.labels(source=source).observe(label_start_count)
        graph_import_nodes.labels(source=source).observe(node_count)
        graph_import_edges.labels(source=source).observe(edge_count)
        graph_import_snapshot_bytes.labels(source=source).observe(snapshot_bytes)
        graph_import_catalog_entries.labels(source=source).observe(catalog_entry_count)
        for severity, count in (diagnostics or {}).items():
            if severity != "total":
                graph_import_diagnostics.labels(source=source, severity=severity).observe(count)


def observe_crdt_snapshot_load(*, result: str, duration_seconds: float, snapshot_bytes: int = 0) -> None:
    crdt_snapshot_loads_total.labels(result=result).inc()
    crdt_snapshot_load_duration_seconds.labels(result=result).observe(duration_seconds)
    if result == "success":
        crdt_snapshot_bytes.labels(operation="load").observe(snapshot_bytes)


def observe_crdt_snapshot_save(*, result: str, duration_seconds: float, snapshot_bytes: int = 0) -> None:
    crdt_snapshot_saves_total.labels(result=result).inc()
    crdt_snapshot_save_duration_seconds.labels(result=result).observe(duration_seconds)
    if result == "success":
        crdt_snapshot_bytes.labels(operation="save").observe(snapshot_bytes)


def observe_loro_bridge(
    *,
    operation: str,
    result: str,
    duration_seconds: float,
    output_bytes: int = 0,
) -> None:
    loro_bridge_runs_total.labels(operation=operation, result=result).inc()
    loro_bridge_duration_seconds.labels(operation=operation, result=result).observe(duration_seconds)
    if result == "success":
        loro_bridge_output_bytes.labels(operation=operation).observe(output_bytes)


def observe_graph_export(
    *,
    result: str,
    duration_seconds: float,
    file_count: int = 0,
    output_bytes: int = 0,
    blocking_diagnostics: int = 0,
    warning_diagnostics: int = 0,
) -> None:
    graph_export_requests_total.labels(result=result).inc()
    graph_export_duration_seconds.labels(result=result).observe(duration_seconds)
    if result == "success":
        graph_export_files.observe(file_count)
        graph_export_bytes.observe(output_bytes)
    if result in {"success", "blocked"}:
        graph_export_blocking_diagnostics.observe(blocking_diagnostics)
        graph_export_warning_diagnostics.observe(warning_diagnostics)


def observe_asset_catalog(
    *,
    operation: str,
    result: str,
    duration_seconds: float,
    catalog: dict | None = None,
) -> None:
    asset_catalog_requests_total.labels(operation=operation, result=result).inc()
    asset_catalog_duration_seconds.labels(operation=operation, result=result).observe(duration_seconds)
    if result != "success" or catalog is None:
        return

    entries = catalog.get("entries", [])
    if not isinstance(entries, list):
        entries = []
    asset_catalog_total_entries.labels(operation=operation).observe(len(entries))
    counts: dict[str, int] = {}
    for entry in entries:
        kind = str(entry.get("kind", "other")) if isinstance(entry, dict) else "other"
        counts[kind] = counts.get(kind, 0) + 1
    for kind, count in counts.items():
        asset_catalog_entries.labels(kind=kind, operation=operation).observe(count)
    character_images = catalog.get("characterImages", {})
    asset_catalog_character_image_mappings.labels(operation=operation).observe(
        len(character_images) if isinstance(character_images, dict) else 0
    )


def _bounded(value: str | None, allowed_values: set[str], default: str = "other") -> str:
    if not value:
        return default
    return value if value in allowed_values else default


def observe_ws_project_connection(*, result: str, current_connections: int = 0, current_rooms: int = 0) -> None:
    ws_project_connections_total.labels(result=_bounded(result, _WS_RESULTS, default="error")).inc()
    if result == "success":
        ws_project_connections_current.set(current_connections)
        ws_project_rooms_current.set(current_rooms)


def observe_ws_project_state(*, current_connections: int, current_rooms: int) -> None:
    ws_project_connections_current.set(current_connections)
    ws_project_rooms_current.set(current_rooms)


def observe_ws_project_disconnect(*, reason: str, current_connections: int, current_rooms: int) -> None:
    ws_project_disconnects_total.labels(reason=_bounded(reason, _WS_DISCONNECT_REASONS, default="unknown")).inc()
    observe_ws_project_state(current_connections=current_connections, current_rooms=current_rooms)


def observe_ws_message(
    *,
    frame_type: str,
    direction: str,
    result: str,
    payload_bytes: int | None = None,
) -> None:
    bounded_frame_type = _bounded(frame_type, _WS_FRAME_TYPES)
    bounded_direction = _bounded(direction, _WS_DIRECTIONS, default="incoming")
    bounded_result = _bounded(result, _WS_RESULTS, default="error")
    ws_messages_total.labels(
        frame_type=bounded_frame_type,
        direction=bounded_direction,
        result=bounded_result,
    ).inc()
    if bounded_frame_type == "binary" and payload_bytes is not None and bounded_result == "success":
        ws_binary_update_bytes.labels(direction=bounded_direction).observe(payload_bytes)


def observe_ws_json_message(*, message_type: str | None, direction: str, result: str) -> None:
    ws_json_messages_total.labels(
        message_type=_bounded(message_type, _WS_MESSAGE_TYPES, default="unknown"),
        direction=_bounded(direction, _WS_DIRECTIONS, default="incoming"),
        result=_bounded(result, _WS_RESULTS, default="error"),
    ).inc()


def observe_ws_broadcast(*, frame_type: str, result: str, duration_seconds: float) -> None:
    ws_broadcast_duration_seconds.labels(
        frame_type=_bounded(frame_type, _WS_FRAME_TYPES),
        result=_bounded(result, _WS_RESULTS, default="error"),
    ).observe(duration_seconds)


def generate_metrics() -> bytes:
    return generate_latest(registry)
