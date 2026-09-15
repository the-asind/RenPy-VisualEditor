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

    assert "ENV PROJECT_GRAPH_FRONTEND_DIR=/app/frontend" in dockerfile
    assert "FROM node:20-bookworm-slim AS frontend-crdt-deps" in dockerfile
    assert "COPY frontend/package*.json ./frontend/" in dockerfile
    assert "npm ci --omit=dev" in dockerfile
    assert "COPY --from=frontend-crdt-deps /usr/local/bin/node /usr/local/bin/node" in dockerfile
    assert "COPY --from=frontend-crdt-deps /frontend/node_modules ./frontend/node_modules" in dockerfile
    assert "apt-get install" not in dockerfile
    assert "COPY frontend/scripts ./frontend/scripts" in dockerfile
    assert "COPY backend/ ." in dockerfile


def test_backend_compose_requires_production_jwt_secret_and_explicit_cors_origins():
    compose = yaml.safe_load((ROOT_DIR / "docker-compose.yml").read_text(encoding="utf-8"))
    backend_environment = compose["services"]["backend"]["environment"]

    assert "APP_ENV=production" in backend_environment
    assert "JWT_SECRET_KEY=${JWT_SECRET_KEY:?JWT_SECRET_KEY is required}" in backend_environment
    assert "CORS_ALLOW_ORIGINS=${CORS_ALLOW_ORIGINS:?CORS_ALLOW_ORIGINS is required}" in backend_environment
