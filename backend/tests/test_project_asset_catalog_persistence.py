import os

from app.services.database import DatabaseService


def test_project_asset_catalog_roundtrip_and_overwrite(tmp_path):
    original_db_path = os.environ.get("DATABASE_PATH")
    os.environ["DATABASE_PATH"] = str(tmp_path / "renpy_editor_test.db")
    try:
        db = DatabaseService()
        user_id = db.create_user("catalog_owner", "catalog_owner@example.com", "hash")
        project_id = db.create_project("Catalog Project", user_id)

        first_catalog = {
            "root_kind": "renpy-game-root",
            "game_directory": "game",
            "entries": [
                {
                    "path": "script.rpy",
                    "name": "script.rpy",
                    "extension": ".rpy",
                    "kind": "script",
                    "size": 42,
                    "lastModified": 1000,
                },
                {
                    "path": "images/monika/monika 1a.png",
                    "name": "monika 1a.png",
                    "extension": ".png",
                    "kind": "image",
                    "size": 12000,
                    "lastModified": 2000,
                },
            ],
        }
        second_catalog = {
            "root_kind": "renpy-game-root",
            "game_directory": "game",
            "entries": [
                {
                    "path": "audio/t2.ogg",
                    "name": "t2.ogg",
                    "extension": ".ogg",
                    "kind": "audio",
                    "size": 5000,
                    "lastModified": 3000,
                }
            ],
        }

        assert db.get_project_asset_catalog(project_id) is None

        db.save_project_asset_catalog(project_id, first_catalog, updated_by=user_id)
        restored_first = db.get_project_asset_catalog(project_id)

        assert restored_first["project_id"] == project_id
        assert restored_first["revision"] == 1
        assert restored_first["updated_by"] == user_id
        assert restored_first["catalog"]["entries"] == first_catalog["entries"]

        db.save_project_asset_catalog(project_id, second_catalog, updated_by=user_id)
        restored_second = db.get_project_asset_catalog(project_id)

        assert restored_second["revision"] == 2
        assert restored_second["catalog"]["entries"] == second_catalog["entries"]
    finally:
        if original_db_path is None:
            os.environ.pop("DATABASE_PATH", None)
        else:
            os.environ["DATABASE_PATH"] = original_db_path


def test_database_initialization_migrates_existing_database_with_missing_asset_catalog_table(tmp_path):
    original_db_path = os.environ.get("DATABASE_PATH")
    os.environ["DATABASE_PATH"] = str(tmp_path / "renpy_editor_test.db")
    try:
        db = DatabaseService()
        with db._get_connection() as conn:
            conn.execute("DROP TABLE IF EXISTS project_asset_catalogs")

        migrated = DatabaseService()

        with migrated._get_connection() as conn:
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_asset_catalogs'"
            )
            assert cursor.fetchone() is not None
    finally:
        if original_db_path is None:
            os.environ.pop("DATABASE_PATH", None)
        else:
            os.environ["DATABASE_PATH"] = original_db_path
