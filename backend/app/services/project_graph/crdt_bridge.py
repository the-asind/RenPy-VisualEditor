import json
import os
import subprocess
from pathlib import Path

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
        payload = json.dumps(ProjectGraphSnapshotCodec.dump(graph), ensure_ascii=False).encode("utf-8")

        try:
            result = subprocess.run(
                ["node", str(self.script_path.relative_to(self.frontend_dir)), "encode"],
                input=payload,
                cwd=self.frontend_dir,
                check=True,
                capture_output=True,
            )
        except FileNotFoundError as exc:
            raise RuntimeError("Node.js is required to create ProjectGraph Loro snapshots") from exc
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.decode("utf-8", errors="replace")
            raise RuntimeError(f"Failed to create ProjectGraph Loro snapshot: {stderr}") from exc

        if not result.stdout:
            raise RuntimeError("ProjectGraph Loro snapshot bridge returned an empty snapshot")

        return result.stdout
