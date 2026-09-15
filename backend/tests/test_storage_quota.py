from concurrent.futures import ThreadPoolExecutor
import pytest
from app.services import database


@pytest.fixture
def store(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DATABASE_PATH', str(tmp_path / 'quota.db'))
    monkeypatch.setenv('DATABASE_PATH', str(tmp_path / 'quota.db'))
    monkeypatch.setattr(database, 'MAX_OWNER_STORAGE_BYTES', 100, raising=False)
    db = database.DatabaseService()
    owner = db.create_user('owner', 'owner@example.test', 'hash')
    return db, owner


def test_quota_replacement_deletion_and_concurrent_writes(store):
    db, owner = store
    projects = [db.create_project(str(i), owner) for i in range(2)]
    def save(project):
        try:
            db.save_project_crdt_snapshot(project, b'x' * 60)
            return True
        except database.StorageQuotaExceededError:
            return False
    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(save, projects)) == [False, True]
    winner = next(p for p in projects if db.get_project_crdt_snapshot(p))
    other = next(p for p in projects if p != winner)
    db.save_project_crdt_snapshot(winner, b'y' * 90)
    with pytest.raises(database.StorageQuotaExceededError):
        db.save_project_crdt_snapshot(other, b'z' * 11)
    assert db.get_project_crdt_snapshot(winner) == b'y' * 90
    db.delete_project(winner)
    db.save_project_crdt_snapshot(other, b'z' * 100)


def test_import_rolls_back_snapshot_and_catalog_together(store):
    db, owner = store
    project = db.create_project('RenPy mouse', owner)
    db.save_project_crdt_snapshot(project, b'old')
    with pytest.raises(database.StorageQuotaExceededError):
        db.save_project_graph_data(project, b'x' * 90, {'story': 'mouse'}, owner)
    assert db.get_project_crdt_snapshot(project) == b'old'
    assert db.get_project_asset_catalog(project) is None


def test_cas_quota_failure_preserves_revision(store):
    db, owner = store
    project = db.create_project('RenPy', owner)
    db.save_project_crdt_snapshot(project, b'old')
    with pytest.raises(database.StorageQuotaExceededError):
        db.compare_and_swap_project_crdt_snapshot(project, b'x' * 101, 1)
    assert db.get_project_crdt_snapshot_record(project) == {'snapshot': b'old', 'revision': 1}
    assert not db.compare_and_swap_project_crdt_snapshot(project, b'x' * 101, 99)


def test_collaborator_catalog_is_charged_to_owner_in_utf8(store):
    db, owner = store
    project = db.create_project('RenPy', owner)
    editor = db.create_user('editor', 'editor@example.test', 'hash')
    db.save_project_crdt_snapshot(project, b'x' * 90)
    with pytest.raises(database.StorageQuotaExceededError):
        db.save_project_asset_catalog(project, {'mouse': 'мышь'}, editor)
    assert db.get_project_asset_catalog(project) is None
