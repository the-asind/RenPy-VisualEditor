from pathlib import Path

import yaml


ROOT_DIR = Path(__file__).resolve().parents[2]


def test_backend_docker_image_packages_project_graph_snapshot_bridge_runtime():
    compose = yaml.safe_load((ROOT_DIR / "docker-compose.yml").read_text(encoding="utf-8"))
    backend_build = compose["services"]["backend"]["build"]

    assert backend_build == {
        "context": ".",
        "dockerfile": "backend/Dockerfile",
    }

    dockerfile = (ROOT_DIR / "backend" / "Dockerfile").read_text(encoding="utf-8")

    assert "nodejs npm" in dockerfile
    assert "COPY frontend/package*.json ./frontend/" in dockerfile
    assert "npm ci --omit=dev" in dockerfile
    assert "COPY frontend/scripts ./frontend/scripts" in dockerfile
    assert "COPY backend/ ." in dockerfile
