import base64
import json
import os
import subprocess
import time
from pathlib import Path

from ...security import (
    MAX_CRDT_SNAPSHOT_BYTES,
    PROJECT_GRAPH_BRIDGE_MAX_INPUT_BYTES,
    PROJECT_GRAPH_BRIDGE_MAX_OUTPUT_BYTES,
    PROJECT_GRAPH_BRIDGE_TIMEOUT_SECONDS,
)
from ..observability.metrics import observe_loro_bridge
from .models import ProjectGraph
from .snapshot import ProjectGraphSnapshotCodec


class ProjectGraphCrdtSnapshotBridge:
    """Creates frontend-compatible Loro snapshots from backend ProjectGraph data."""

    def __init__(self, frontend_dir: Path | None = None) -> None:
        self.frontend_dir = frontend_dir or self._default_frontend_dir()
        self.script_path = self.frontend_dir / "scripts" / "project-graph-snapshot-cli.mjs"

    def _default_frontend_dir(self) -> Path:
        configured_dir = os.environ.get("PROJECT_GRAPH_FRONTEND_DIR")
        if configured_dir:
            return Path(configured_dir)

        service_path = Path(__file__).resolve()
        candidates = [
            service_path.parents[4] / "frontend",
            service_path.parents[3] / "frontend",
            Path("/app/frontend"),
        ]
        for candidate in candidates:
            if (candidate / "scripts" / "project-graph-snapshot-cli.mjs").exists():
                return candidate

        return candidates[0]

    def export_snapshot(self, graph: ProjectGraph) -> bytes:
        start_time = time.perf_counter()
        payload = json.dumps(ProjectGraphSnapshotCodec.dump(graph), ensure_ascii=False).encode("utf-8")
        self._ensure_bridge_input_size(payload)

        try:
            result = subprocess.run(
                ["node", str(self.script_path.relative_to(self.frontend_dir)), "encode"],
                input=payload,
                cwd=self.frontend_dir,
                check=True,
                capture_output=True,
                timeout=PROJECT_GRAPH_BRIDGE_TIMEOUT_SECONDS,
            )
        except FileNotFoundError as exc:
            observe_loro_bridge(
                operation="encode",
                result="node_missing",
                duration_seconds=time.perf_counter() - start_time,
            )
            raise RuntimeError("Node.js is required to create ProjectGraph Loro snapshots") from exc
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.decode("utf-8", errors="replace")
            observe_loro_bridge(
                operation="encode",
                result="subprocess_error",
                duration_seconds=time.perf_counter() - start_time,
            )
            raise RuntimeError(f"Failed to create ProjectGraph Loro snapshot: {stderr}") from exc
        except subprocess.TimeoutExpired as exc:
            observe_loro_bridge(
                operation="encode",
                result="timeout",
                duration_seconds=time.perf_counter() - start_time,
            )
            raise RuntimeError("ProjectGraph Loro snapshot bridge timed out") from exc

        if not result.stdout:
            observe_loro_bridge(
                operation="encode",
                result="empty_output",
                duration_seconds=time.perf_counter() - start_time,
            )
            raise RuntimeError("ProjectGraph Loro snapshot bridge returned an empty snapshot")
        self._ensure_bridge_output_size(result.stdout)
        if len(result.stdout) > MAX_CRDT_SNAPSHOT_BYTES:
            observe_loro_bridge(
                operation="encode",
                result="too_large",
                duration_seconds=time.perf_counter() - start_time,
                output_bytes=len(result.stdout),
            )
            raise RuntimeError("ProjectGraph Loro snapshot bridge returned an oversized snapshot")

        observe_loro_bridge(
            operation="encode",
            result="success",
            duration_seconds=time.perf_counter() - start_time,
            output_bytes=len(result.stdout),
        )
        return result.stdout

    def import_snapshot(self, snapshot: bytes) -> ProjectGraph:
        """Decode an opaque Loro snapshot for authoritative domain validation."""
        if not snapshot:
            raise ValueError("ProjectGraph Loro snapshot is empty")
        if len(snapshot) > MAX_CRDT_SNAPSHOT_BYTES:
            raise ValueError("ProjectGraph Loro snapshot is too large")
        try:
            result = subprocess.run(
                ["node", str(self.script_path.relative_to(self.frontend_dir)), "decode"],
                input=snapshot,
                cwd=self.frontend_dir,
                check=True,
                capture_output=True,
                timeout=PROJECT_GRAPH_BRIDGE_TIMEOUT_SECONDS,
            )
        except FileNotFoundError as exc:
            raise RuntimeError("Node.js is required to decode ProjectGraph Loro snapshots") from exc
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.decode("utf-8", errors="replace")
            raise ValueError(f"Invalid ProjectGraph Loro snapshot: {stderr}") from exc
        except subprocess.TimeoutExpired as exc:
            raise ValueError("ProjectGraph Loro snapshot bridge timed out") from exc
        self._ensure_bridge_output_size(result.stdout)
        return ProjectGraphSnapshotCodec.load(json.loads(result.stdout.decode("utf-8")))

    def mutate_continuation(self, snapshot: bytes, command: dict) -> dict:
        """Apply a ProjectGraph continuation command inside the Loro snapshot bridge."""
        if not snapshot:
            raise ValueError("ProjectGraph Loro snapshot is empty")
        if len(snapshot) > MAX_CRDT_SNAPSHOT_BYTES:
            raise ValueError("ProjectGraph Loro snapshot is too large")
        payload = json.dumps(
            {
                "snapshotBase64": base64.b64encode(snapshot).decode("ascii"),
                "command": command,
            },
            ensure_ascii=False,
        ).encode("utf-8")
        self._ensure_bridge_input_size(payload)
        try:
            result = subprocess.run(
                ["node", str(self.script_path.relative_to(self.frontend_dir)), "mutate-continuation"],
                input=payload,
                cwd=self.frontend_dir,
                check=True,
                capture_output=True,
                timeout=PROJECT_GRAPH_BRIDGE_TIMEOUT_SECONDS,
            )
        except FileNotFoundError as exc:
            raise RuntimeError("Node.js is required to mutate ProjectGraph Loro snapshots") from exc
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.decode("utf-8", errors="replace")
            raise ValueError(f"Invalid ProjectGraph continuation command: {stderr}") from exc
        except subprocess.TimeoutExpired as exc:
            raise ValueError("ProjectGraph continuation bridge timed out") from exc

        self._ensure_bridge_output_size(result.stdout)
        response = json.loads(result.stdout.decode("utf-8"))
        return {
            "snapshot": base64.b64decode(response["snapshotBase64"]),
            "update": base64.b64decode(response["updateBase64"]),
            "result": response["result"],
        }

    def mutate_structure(self, snapshot: bytes, command: dict) -> dict:
        """Apply a validated file/label structure command inside the Loro snapshot bridge."""
        if not snapshot:
            raise ValueError("ProjectGraph Loro snapshot is empty")
        if len(snapshot) > MAX_CRDT_SNAPSHOT_BYTES:
            raise ValueError("ProjectGraph Loro snapshot is too large")
        payload = json.dumps(
            {"snapshotBase64": base64.b64encode(snapshot).decode("ascii"), "command": command},
            ensure_ascii=False,
        ).encode("utf-8")
        self._ensure_bridge_input_size(payload)
        try:
            result = subprocess.run(
                ["node", str(self.script_path.relative_to(self.frontend_dir)), "mutate-structure"],
                input=payload,
                cwd=self.frontend_dir,
                check=True,
                capture_output=True,
                timeout=PROJECT_GRAPH_BRIDGE_TIMEOUT_SECONDS,
            )
        except FileNotFoundError as exc:
            raise RuntimeError("Node.js is required to mutate ProjectGraph Loro snapshots") from exc
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.decode("utf-8", errors="replace")
            raise ValueError(f"Invalid ProjectGraph structure command: {stderr}") from exc
        except subprocess.TimeoutExpired as exc:
            raise ValueError("ProjectGraph structure bridge timed out") from exc

        self._ensure_bridge_output_size(result.stdout)
        response = json.loads(result.stdout.decode("utf-8"))
        return {
            "snapshot": base64.b64decode(response["snapshotBase64"]),
            "update": base64.b64decode(response["updateBase64"]),
            "result": response["result"],
        }

    def _ensure_bridge_input_size(self, payload: bytes) -> None:
        if len(payload) > PROJECT_GRAPH_BRIDGE_MAX_INPUT_BYTES:
            raise ValueError("ProjectGraph bridge input is too large")

    def _ensure_bridge_output_size(self, payload: bytes) -> None:
        if len(payload) > PROJECT_GRAPH_BRIDGE_MAX_OUTPUT_BYTES:
            raise ValueError("ProjectGraph bridge output is too large")
