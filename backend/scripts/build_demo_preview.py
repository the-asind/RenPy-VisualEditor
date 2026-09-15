"""Build the public demo artifact, or check that its inputs have not changed."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile

BACKEND = Path(__file__).resolve().parents[1]
OUTPUT = BACKEND / "app/demo_assets/clockwork-library/v1/preview.json"


def source_digest():
    inputs = [Path(__file__), BACKEND / "app/api/routes/projects.py"]
    inputs.extend((BACKEND / "app/demo_projects/clockwork_library/game").rglob("*.rpy"))
    inputs.extend((BACKEND / "app/services/project_graph").rglob("*.py"))
    digest = hashlib.sha256()
    for path in sorted(inputs):
        digest.update(path.relative_to(BACKEND).as_posix().encode())
        digest.update(b"\0")
        digest.update(path.read_bytes().replace(b"\r\n", b"\n"))
        digest.update(b"\0")
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        if not OUTPUT.exists() or json.loads(OUTPUT.read_text(encoding="utf-8")).get("source_digest") != source_digest():
            raise SystemExit("Demo preview is stale: run python backend/scripts/build_demo_preview.py")
        print("Demo preview inputs verified")
        return

    # Route imports initialize database services. Never use an operator's database.
    with tempfile.TemporaryDirectory(prefix="renpy-preview-build-") as temp_dir:
        os.environ["DATABASE_PATH"] = str(Path(temp_dir) / "build.db")
        sys.path.insert(0, str(BACKEND))
        from app.api.routes.projects import _load_clockwork_library_demo_graph
        from app.services.project_graph.snapshot import ProjectGraphSnapshotCodec

        graph, catalog = _load_clockwork_library_demo_graph("clockwork-library-demo-preview")
        for entry in catalog.get("entries", []):
            if "lastModified" in entry:
                entry["lastModified"] = 0
        payload = {
            "project_id": graph.project_id,
            "graph": ProjectGraphSnapshotCodec.dump(graph),
            "asset_catalog": catalog,
            "source_digest": source_digest(),
        }
        OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"Built demo preview: {OUTPUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
