import unittest
import pytest
import os
import tempfile
import sqlite3
import uuid
import json
from pathlib import Path
import shutil
from fastapi.testclient import TestClient
from fastapi import Depends
from unittest.mock import patch
import builtins

from app.main import app
from app.services.database import DatabaseService
from app.api.routes.auth import get_current_user, oauth2_scheme


test_db_for_auth = None
app_db_service = None  


async def override_get_current_user(token: str = Depends(oauth2_scheme)):
    from app.services.auth import AuthService
    from fastapi import HTTPException, status
    
    global test_db_for_auth
    if test_db_for_auth is None:
        raise ValueError("Test database not initialized")
    
    auth_service = AuthService(test_db_for_auth)
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = auth_service.decode_token(token)
    if payload is None:
        raise credentials_exception
    
    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_exception
    
    user = test_db_for_auth.get_user_by_id(user_id)
    if user is None:
        raise credentials_exception
    
    return user


from app.api.routes import auth as auth_routes
from app.api.routes import projects


app.dependency_overrides[get_current_user] = override_get_current_user
client = TestClient(app)


@pytest.fixture(autouse=True)
def override_app_db_service(temp_db):
    """Override the app's database service with our test database instance."""
    
    original_auth_db = auth_routes.db_service
    original_auth_service = auth_routes.auth_service
    original_projects_db = projects.db_service
    
    
    from app.services.auth import AuthService

    auth_routes.db_service = temp_db
    auth_routes.auth_service = AuthService(temp_db)
    projects.db_service = temp_db
    
    
    def get_db_service():
        return temp_db
    
    
    if hasattr(projects, 'get_db_service'):
        original_get_db_service = projects.get_db_service
        projects.get_db_service = get_db_service
    
    
    original_get_project = projects.get_project
    
    async def debug_get_project(*args, **kwargs):
        print("DEBUG: Using test_db in get_project!")
        print(f"DEBUG: test_db object id: {id(temp_db)}")
        print(f"DEBUG: projects.db_service object id: {id(projects.db_service)}")
        try:
            return await original_get_project(*args, **kwargs)
        except Exception as e:
            print(f"DEBUG: get_project error: {e}")
            raise
    
    projects.get_project = debug_get_project
    
    yield
    
    
    auth_routes.db_service = original_auth_db
    auth_routes.auth_service = original_auth_service
    projects.db_service = original_projects_db
    projects.get_project = original_get_project
    if hasattr(projects, 'get_db_service'):
        projects.get_db_service = original_get_db_service

@pytest.fixture
def temp_db():
    """Create a temporary database for testing."""
    global test_db_for_auth
    
    
    original_db_path = os.environ.get('DATABASE_PATH', None)
    
    
    temp_dir = tempfile.TemporaryDirectory()
    db_path = os.path.join(temp_dir.name, 'test.db')
    os.environ['DATABASE_PATH'] = db_path
    
    
    backend_dir = Path(__file__).parent.parent
    schema_path = backend_dir / 'database' / 'schema.sql'
    
    
    os.makedirs(os.path.dirname(schema_path), exist_ok=True)
    
    
    if not schema_path.exists():
        
        project_root = backend_dir.parent
        source_schema = project_root / 'database' / 'schema.sql'
        if source_schema.exists():
            print(f"Copying schema from {source_schema} to {schema_path}")
            os.makedirs(schema_path.parent, exist_ok=True)
            with open(source_schema, 'r') as src, open(schema_path, 'w') as dest:
                dest.write(src.read())

    
    db_service = None
    try:
        db_service = DatabaseService()
        
        test_db_for_auth = db_service
        
        
        with db_service._get_connection() as conn:
            
            cursor = conn.execute("SELECT COUNT(*) FROM roles")
            if cursor.fetchone()[0] == 0:
                
                roles = [
                    ('role_owner', 'Owner', 'Full control over the project'),
                    ('role_admin', 'Admin', 'Full control over the project except ownership transfer'),
                    ('role_editor', 'Editor', 'Can edit project content'),
                    ('role_viewer', 'Viewer', 'Can view project content'),
                ]
                conn.executemany(
                    "INSERT INTO roles (id, name, description) VALUES (?, ?, ?)", 
                    roles
                )
                conn.commit()
        
        yield db_service
    finally:
        
        if db_service:
            db_service.close()
        
        
        test_db_for_auth = None
        
        
        if original_db_path:
            os.environ['DATABASE_PATH'] = original_db_path
        else:
            os.environ.pop('DATABASE_PATH', None)
        
        
        try:
            temp_dir.cleanup()
        except (PermissionError, OSError) as e:
            print(f"Warning: Could not clean temporary directory: {e}")


@pytest.fixture
def auth_token(temp_db):
    """Create a test user and return auth token."""
    
    username = "admin"
    password = "adminadmin"
    password_hash = "$2b$12$.R2kUy.ihZcA6D.YTvLdEu7h9PAs66LtNlMtcxhzM/9T.xOyTfUPO"
    email = "admin@example.com"
    
    
    with temp_db._get_connection() as conn:
        
        cursor = conn.execute("SELECT id FROM users WHERE username = ?", (username,))
        existing_user = cursor.fetchone()
        
        if existing_user:
            user_id = existing_user['id']
        else:
            
            user_id = str(uuid.uuid4())
            conn.execute(
                "INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)",
                (user_id, username, email, password_hash)
            )
            conn.commit()
    
    
    from app.services.auth import AuthService
    from datetime import timedelta
    
    
    auth_service = AuthService(temp_db)
    
    
    token_data = {
        "sub": user_id,
        "username": username
    }
    
    
    token = auth_service.create_access_token(
        data=token_data,
        expires_delta=timedelta(hours=24)
    )
    
    return token


class TestProjectManagement:
    """Test project management functionality."""
    
    def test_create_project(self, auth_token):
        """Test creating a project through API."""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        
        project_name = "Test Project"
        project_description = "A test project"
        response = client.post(
            "/api/projects/",
            headers=headers,
            json={"name": project_name, "description": project_description}
        )
        
        
        assert response.status_code == 200, f"Failed to create project: {response.text}"
        project_data = response.json()
        project_id = project_data["id"]
        assert project_data["name"] == project_name
            
        
        response = client.get(f"/api/projects/{project_id}", headers=headers)
        assert response.status_code == 200, f"Failed to get project: {response.text}"
        data = response.json()
        assert data["id"] == project_id, "Project ID doesn't match"
        assert data["name"] == project_name, "Project name doesn't match"
    
    def test_list_projects(self, auth_token):
        """Test listing user's projects."""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        
        for i in range(3):
            response = client.post(
                "/api/projects/",
                headers=headers,
                json={"name": f"Test Project {i}", "description": f"Description {i}"}
            )
            assert response.status_code == 200, f"Failed to create project: {response.text}"
        
        
        response = client.get(
            "/api/projects/",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to list projects: {response.text}"
        projects = response.json()
        assert len(projects) >= 3, "Not all created projects returned"

    def test_main_menu_projects_sort_by_last_opened(self, auth_token):
        """The main menu project list is ordered by the user's latest project open."""
        headers = {"Authorization": f"Bearer {auth_token}"}

        first_resp = client.post(
            "/api/projects/",
            headers=headers,
            json={"name": "Mouse Archives", "description": "Opened after creation"},
        )
        assert first_resp.status_code == 200
        first_project_id = first_resp.json()["id"]

        second_resp = client.post(
            "/api/projects/",
            headers=headers,
            json={"name": "Clockwork Library", "description": "Created later"},
        )
        assert second_resp.status_code == 200

        open_resp = client.post(f"/api/projects/{first_project_id}/open", headers=headers)
        assert open_resp.status_code == 200, open_resp.text
        assert open_resp.json()["last_opened_at"]

        list_resp = client.get("/api/projects/", headers=headers)
        assert list_resp.status_code == 200
        projects = list_resp.json()
        assert projects[0]["id"] == first_project_id
        assert projects[0]["last_opened_at"] == open_resp.json()["last_opened_at"]

    def test_project_detail_returns_members_with_named_roles(self, auth_token):
        """Expanded project cuts need member avatars and clickable role names."""
        headers = {"Authorization": f"Bearer {auth_token}"}

        create_resp = client.post(
            "/api/projects/",
            headers=headers,
            json={"name": "Role Cut", "description": "Members visible under the caret"},
        )
        assert create_resp.status_code == 200
        project_id = create_resp.json()["id"]

        detail_resp = client.get(f"/api/projects/{project_id}", headers=headers)
        assert detail_resp.status_code == 200
        members = detail_resp.json()["active_users"]
        assert members
        assert members[0]["username"] == "admin"
        assert members[0]["role"] == "Owner"
        assert members[0]["email"] == "admin@example.com"

    def test_main_menu_list_returns_members_for_collapsed_project_rows(self, auth_token):
        """Collapsed project rows need member avatars without waiting for the caret details call."""
        headers = {"Authorization": f"Bearer {auth_token}"}

        create_resp = client.post(
            "/api/projects/",
            headers=headers,
            json={"name": "Collapsed Members", "description": "Members visible before expand"},
        )
        assert create_resp.status_code == 200
        project_id = create_resp.json()["id"]

        list_resp = client.get("/api/projects/", headers=headers)
        assert list_resp.status_code == 200
        project = next(project for project in list_resp.json() if project["id"] == project_id)
        assert project["active_users"]
        assert project["active_users"][0]["username"] == "admin"
        assert project["active_users"][0]["role"] == "Owner"

    def test_admin_role_can_manage_project_members_assets_and_delete(self, auth_token, temp_db):
        """Admin is a full project role for the main menu cut and editor asset updates."""
        headers_owner = {"Authorization": f"Bearer {auth_token}"}

        create_resp = client.post(
            "/api/projects/",
            headers=headers_owner,
            json={"name": "Admin Managed", "description": "Project an admin can fully manage"},
        )
        assert create_resp.status_code == 200
        project_id = create_resp.json()["id"]

        from app.services.auth import AuthService

        admin_user_id = str(uuid.uuid4())
        editor_user_id = str(uuid.uuid4())
        with temp_db._get_connection() as conn:
            conn.execute(
                "INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)",
                (admin_user_id, "admin_two", "admin_two@example.com", "$2b$12$dummyhashadmin"),
            )
            conn.execute(
                "INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)",
                (editor_user_id, "writer_three", "writer_three@example.com", "$2b$12$dummyhasheditor"),
            )
            conn.commit()

        share_admin_resp = client.post(
            f"/api/projects/{project_id}/share",
            headers=headers_owner,
            json={"user_id": "admin_two", "role": "Admin"},
        )
        assert share_admin_resp.status_code == 200, share_admin_resp.text

        auth_service = AuthService(temp_db)
        token_admin = auth_service.create_access_token({"sub": admin_user_id, "username": "admin_two"})
        headers_admin = {"Authorization": f"Bearer {token_admin}"}

        update_resp = client.patch(
            f"/api/projects/{project_id}",
            headers=headers_admin,
            json={"name": "Admin Renamed", "description": "Admin updated settings"},
        )
        assert update_resp.status_code == 200, update_resp.text
        assert update_resp.json()["name"] == "Admin Renamed"

        invite_resp = client.post(
            f"/api/projects/{project_id}/share",
            headers=headers_admin,
            json={"user_id": "writer_three", "role": "Editor"},
        )
        assert invite_resp.status_code == 200, invite_resp.text

        catalog_resp = client.put(
            f"/api/projects/{project_id}/asset-catalog",
            headers=headers_admin,
            json={
                "root_kind": "renpy-game-root",
                "game_directory": "game",
                "entries": [
                    {
                        "path": "images/renpy/bright.png",
                        "name": "bright.png",
                        "extension": ".png",
                        "kind": "image",
                        "size": 100,
                        "lastModified": 0,
                    }
                ],
            },
        )
        assert catalog_resp.status_code == 200, catalog_resp.text
        assert catalog_resp.json()["updated_by"] == admin_user_id

        delete_resp = client.delete(f"/api/projects/{project_id}", headers=headers_admin)
        assert delete_resp.status_code == 200, delete_resp.text

    def test_owner_can_remove_project_member_with_null_role(self, auth_token, temp_db):
        """The member hover x removes access by posting a null role through the share route."""
        headers = {"Authorization": f"Bearer {auth_token}"}

        create_resp = client.post(
            "/api/projects/",
            headers=headers,
            json={"name": "Member Removal", "description": "Remove user from expanded cut"},
        )
        assert create_resp.status_code == 200
        project_id = create_resp.json()["id"]

        user_id = str(uuid.uuid4())
        username = "writer_two"
        with temp_db._get_connection() as conn:
            conn.execute(
                "INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)",
                (user_id, username, "writer_two@example.com", "$2b$12$dummyhashforwriter"),
            )
            conn.commit()

        share_resp = client.post(
            f"/api/projects/{project_id}/share",
            headers=headers,
            json={"user_id": username, "role": "Editor"},
        )
        assert share_resp.status_code == 200, share_resp.text

        remove_resp = client.post(
            f"/api/projects/{project_id}/share",
            headers=headers,
            json={"user_id": username, "role": None},
        )
        assert remove_resp.status_code == 200, remove_resp.text

        with temp_db._get_connection() as conn:
            row = conn.execute(
                "SELECT role_id FROM project_access WHERE project_id = ? AND user_id = ?",
                (project_id, user_id),
            ).fetchone()
        assert row is None

    def test_project_invite_validation_checks_user_and_role_before_project_creation(self, auth_token, temp_db):
        """The create-project wizard validates member names when Add is clicked, before a project exists."""
        headers = {"Authorization": f"Bearer {auth_token}"}

        user_id = str(uuid.uuid4())
        with temp_db._get_connection() as conn:
            conn.execute(
                "INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)",
                (user_id, "writer_before_create", "writer_before_create@example.com", "$2b$12$dummyhashforwriter"),
            )
            conn.commit()

        valid_resp = client.post(
            "/api/projects/validate-share-target",
            headers=headers,
            json={"user_id": "writer_before_create", "role": "Editor"},
        )
        assert valid_resp.status_code == 200, valid_resp.text
        assert valid_resp.json()["username"] == "writer_before_create"
        assert valid_resp.json()["role"] == "Editor"
        assert "email" not in valid_resp.json()

        missing_resp = client.post(
            "/api/projects/validate-share-target",
            headers=headers,
            json={"user_id": "missing_before_create", "role": "Editor"},
        )
        assert missing_resp.status_code == 404
        assert "missing_before_create" in missing_resp.json()["detail"]

    def test_legacy_script_mutation_routes_reject_viewer_role(self, auth_token, temp_db):
        """Viewer access must not be enough to mutate legacy script content routes."""
        headers_owner = {"Authorization": f"Bearer {auth_token}"}
        create_resp = client.post(
            "/api/projects/",
            headers=headers_owner,
            json={"name": "Legacy Viewer Write Gate", "description": "Viewer cannot write scripts"},
        )
        assert create_resp.status_code == 200
        project_id = create_resp.json()["id"]

        owner_user_id = create_resp.json()["owner_id"]
        script_id = temp_db.save_script(
            project_id,
            "viewer_gate.rpy",
            'label start:\n    "RenPy Mouse keeps viewer role read-only."\n    return\n',
            owner_user_id,
        )

        from app.services.auth import AuthService

        viewer_user_id = str(uuid.uuid4())
        with temp_db._get_connection() as conn:
            conn.execute(
                "INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)",
                (viewer_user_id, "viewer_script_gate", "viewer_script_gate@example.com", "$2b$12$dummyhashviewer"),
            )
            conn.commit()
        temp_db.grant_project_access(project_id, viewer_user_id, "role_viewer")
        viewer_token = AuthService(temp_db).create_access_token(
            {"sub": viewer_user_id, "username": "viewer_script_gate"}
        )
        headers_viewer = {"Authorization": f"Bearer {viewer_token}"}

        parse_resp = client.post(
            "/api/scripts/parse",
            headers=headers_viewer,
            files={"file": ("viewer_gate.rpy", b"label start:\n    return\n", "text/plain")},
            data={"project_id": project_id},
        )
        update_resp = client.post(
            f"/api/scripts/update-node/{script_id}?start_line=1&end_line=1",
            headers=headers_viewer,
            json={"content": '    "Viewer should not overwrite RenPy Mouse."'},
        )
        insert_resp = client.post(
            f"/api/scripts/insert-node/{script_id}?insertion_line=1",
            headers=headers_viewer,
            json={"content": '    "Viewer should not insert."', "node_type": "Action"},
        )

        assert parse_resp.status_code == 404
        assert update_resp.status_code == 404
        assert insert_resp.status_code == 404
        assert "Viewer should not" not in temp_db.get_script(script_id)["content"]

    def test_owner_can_update_project_name_and_description_from_main_menu(self, auth_token):
        """The expanded project settings edit must call a real backend patch route."""
        headers = {"Authorization": f"Bearer {auth_token}"}

        create_resp = client.post(
            "/api/projects/",
            headers=headers,
            json={"name": "Old Name", "description": "Old description"},
        )
        assert create_resp.status_code == 200
        project_id = create_resp.json()["id"]

        update_resp = client.patch(
            f"/api/projects/{project_id}",
            headers=headers,
            json={"name": "New Name", "description": "New description"},
        )
        assert update_resp.status_code == 200, update_resp.text
        assert update_resp.json()["name"] == "New Name"
        assert update_resp.json()["description"] == "New description"

    def test_auth_routes_verify_recaptcha_when_secret_is_configured(self, temp_db, monkeypatch):
        """Login and registration pass the v2 response token to backend verification."""
        monkeypatch.setenv("RECAPTCHA_SECRET_KEY", "test-secret")
        observed_tokens = []

        def fake_verify_recaptcha(token):
            observed_tokens.append(token)

        monkeypatch.setattr(auth_routes, "verify_recaptcha_token", fake_verify_recaptcha, raising=False)

        register_resp = client.post(
            "/api/auth/register",
            json={
                "username": "captcha_mouse",
                "email": "captcha_mouse@example.com",
                "password": "mousepassword",
                "recaptcha_token": "register-token",
            },
        )
        assert register_resp.status_code == 200, register_resp.text

        login_resp = client.post(
            "/api/auth/token",
            data={
                "username": "captcha_mouse",
                "password": "mousepassword",
                "recaptcha_token": "login-token",
            },
        )
        assert login_resp.status_code == 200, login_resp.text
        assert observed_tokens == ["register-token", "login-token"]

    def test_get_project(self, auth_token):
        """Test getting a single project through API."""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        
        project_name = "Project Details"
        project_description = "Test getting project details"
        
        response = client.post(
            "/api/projects/",
            headers=headers,
            json={"name": project_name, "description": project_description}
        )
        assert response.status_code == 200, f"Failed to create project: {response.text}"
        project_data = response.json()
        project_id = project_data["id"]
        
        
        response = client.get(
            f"/api/projects/{project_id}",
            headers=headers
        )
        
        
        print(f"API Response status: {response.status_code}")
        print(f"API Response body: {response.text}")
        
        assert response.status_code == 200, f"Failed to get project: {response.text}"
        project = response.json()
        assert project["id"] == project_id, "Project ID doesn't match"
        assert project["name"] == project_name, "Project name doesn't match"
        assert project["description"] == project_description, "Project description doesn't match"

    def test_legacy_script_upload_is_unavailable_even_to_owner(self, auth_token):
        """Retired upload must neither parse nor persist an owner's file."""
        headers = {"Authorization": f"Bearer {auth_token}"}
        project = client.post("/api/projects/", headers=headers, json={"name": "Mouse RenPy"}).json()
        response = client.post(
            "/api/scripts/parse", headers=headers,
            files={"file": ("mouse.rpy", b'label start:\n    "RenPy Mouse retires the old entrance."\n    return\n')},
            data={"project_id": project["id"]},
        )
        assert response.status_code == 404
        detail = client.get(f"/api/projects/{project['id']}", headers=headers).json()
        assert detail["scripts"] == []

    def test_upload_without_project_id_fails(self, auth_token):
        """Test that uploading a script without a project_id fails."""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        script_content = "label start:\n    \"This should fail.\"\n    return"
        with tempfile.NamedTemporaryFile(suffix=".rpy", delete=False, mode="w+") as temp_file:
            temp_file.write(script_content)
            temp_file_path = temp_file.name

        try:
            with open(temp_file_path, "rb") as f:
                response = client.post(
                    "/api/scripts/parse",
                    headers=headers,
                    files={"file": f},
                    data={}
                )
            
            assert response.status_code == 404
            assert response.json()["detail"] == "Not Found"

        finally:
            try:
                os.unlink(temp_file_path)
            except:
                pass

    def test_share_project(self, auth_token, temp_db):
        """Test sharing a project with another user via API."""
        
        headers_user1 = {"Authorization": f"Bearer {auth_token}"} # Token for the project owner
        
        # 1. Create a project as user1
        project_name = "ProjectToShare"
        create_project_resp = client.post(
            "/api/projects/", 
            headers=headers_user1, 
            json={"name": project_name, "description": "A project to test sharing"}
        )
        assert create_project_resp.status_code == 200, f"Failed to create project: {create_project_resp.text}"
        project_id = create_project_resp.json()["id"]

        # 2. Create a second user (user2) directly in the database for testing
        from app.services.auth import AuthService # Moved import here
        user2_id = str(uuid.uuid4())
        user2_username = "test_share_user2"
        with temp_db._get_connection() as conn:
            conn.execute(
                "INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)",
                (user2_id, user2_username, "share_user2@example.com", "$2b$12$dummyhashforshare")
            )
            conn.commit()

        # 3. User1 shares the project with User2 via API, assigning 'role_viewer'
        # Ensure 'role_viewer' is a valid role ID from your temp_db setup
        role_to_assign = "role_viewer" 
        share_payload = {"user_id": user2_username, "role": role_to_assign}
        
        share_resp = client.post(
            f"/api/projects/{project_id}/share",
            headers=headers_user1, # User1 (owner) performs the share action
            json=share_payload
        )
        assert share_resp.status_code == 200, f"API call to share project failed: {share_resp.text}. Payload: {share_payload}"

        # 4. Verify User2 can now access the project
        auth_service_user2 = AuthService(temp_db)
        token_user2 = auth_service_user2.create_access_token({"sub": user2_id, "username": user2_username})
        headers_user2 = {"Authorization": f"Bearer {token_user2}"}
        
        get_project_resp_user2 = client.get(
            f"/api/projects/{project_id}",
            headers=headers_user2 # User2 attempts to access
        )
        assert get_project_resp_user2.status_code == 200, f"User2 failed to access shared project: {get_project_resp_user2.text}"
        project_details_for_user2 = get_project_resp_user2.json()
        assert project_details_for_user2["id"] == project_id
        # Optionally, assert role if project details include it for the current user
        # assert project_details_for_user2.get("role") == role_to_assign # Or however role is exposed

        # 5. Verify the project sharing record in the database
        with temp_db._get_connection() as conn:
            cursor = conn.execute(
                "SELECT role_id FROM project_access WHERE project_id = ? AND user_id = ?",
                (project_id, user2_id)
            )
            project_user_entry = cursor.fetchone()
            assert project_user_entry is not None, "Project sharing record not found in database after API call"
            assert project_user_entry["role_id"] == role_to_assign, f"Incorrect role_id in database. Expected {role_to_assign}, got {project_user_entry['role_id']}"

    def test_share_project_with_role_name(self, auth_token, temp_db):
        """Test sharing a project with another user via API using the role NAME."""
        
        headers_user1 = {"Authorization": f"Bearer {auth_token}"} # Token for the project owner
        
        # 1. Create a project as user1
        project_name = "ProjectToShareByName"
        create_project_resp = client.post(
            "/api/projects/", 
            headers=headers_user1, 
            json={"name": project_name, "description": "A project to test sharing by role name"}
        )
        assert create_project_resp.status_code == 200, f"Failed to create project: {create_project_resp.text}"
        project_id = create_project_resp.json()["id"]

        # 2. Create a second user (user2)
        from app.services.auth import AuthService
        user2_id = str(uuid.uuid4())
        user2_username = "test_share_user2_by_name"
        with temp_db._get_connection() as conn:
            conn.execute(
                "INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)",
                (user2_id, user2_username, "share_user2_name@example.com", "$2b$12$dummyhashforname")
            )
            conn.commit()

        # 3. User1 shares the project with User2 via API, assigning role by NAME
        role_name_to_send_in_payload = "Viewer"  # This is the role NAME
        expected_role_id_in_db = "role_viewer" # This is the corresponding ID

        share_payload = {"user_id": user2_username, "role": role_name_to_send_in_payload}
        
        share_resp = client.post(
            f"/api/projects/{project_id}/share",
            headers=headers_user1,
            json=share_payload
        )
        
        # IDEAL BEHAVIOR: Backend should accept name, find ID, and return 200
        # or return 4xx if names are not supported / name is invalid.
        # A 500 here indicates a bug in handling this case.
        assert share_resp.status_code == 200, f"API call to share project with role name failed: {share_resp.text}. Payload: {share_payload}"

        # 4. Verify User2 can access
        auth_service_user2 = AuthService(temp_db)
        token_user2 = auth_service_user2.create_access_token({"sub": user2_id, "username": "user_for_delete_test"})
        headers_user2 = {"Authorization": f"Bearer {token_user2}"}
        
        get_project_resp_user2 = client.get(
            f"/api/projects/{project_id}",
            headers=headers_user2
        )
        assert get_project_resp_user2.status_code == 200, f"User2 failed to access project shared by role name: {get_project_resp_user2.text}"
        project_details_for_user2 = get_project_resp_user2.json()
        assert project_details_for_user2["id"] == project_id

        # 5. Verify the correct role_id was stored in the database
        with temp_db._get_connection() as conn:
            cursor = conn.execute(
                "SELECT role_id FROM project_access WHERE project_id = ? AND user_id = ?",
                (project_id, user2_id)
            )
            project_user_entry = cursor.fetchone()
            assert project_user_entry is not None, "Project sharing record not found in database after API call (role name)"
            assert project_user_entry["role_id"] == expected_role_id_in_db, f"Incorrect role_id in database. Expected {expected_role_id_in_db}, got {project_user_entry['role_id']}"


    def test_legacy_create_script_endpoint_is_unavailable_to_owner(self, auth_token):
        headers = {"Authorization": f"Bearer {auth_token}"}
        project = client.post("/api/projects/", headers=headers, json={"name": "Mouse RenPy"}).json()
        response = client.post(
            f"/api/projects/{project['id']}/scripts", headers=headers,
            json={"filename": "mouse.rpy", "content": "label start:\n    return"},
        )
        assert response.status_code == 404
        detail = client.get(f"/api/projects/{project['id']}", headers=headers).json()
        assert detail["scripts"] == []

    def test_delete_project_endpoint(self, auth_token, temp_db):
        """Test deleting a project via the projects/{project_id} endpoint."""
        headers = {"Authorization": f"Bearer {auth_token}"}

        # 1. Create a project
        create_resp = client.post("/api/projects/", headers=headers, json={"name": "ProjectToDelete"})
        assert create_resp.status_code == 200
        project_to_delete_id = create_resp.json()["id"]
        owner_id = create_resp.json()["owner_id"] # Assuming owner_id is returned

        # 2. Delete the project as the owner
        delete_resp = client.delete(f"/api/projects/{project_to_delete_id}", headers=headers)
        assert delete_resp.status_code == 200
        assert delete_resp.json()["message"] == f"Project {project_to_delete_id} deleted successfully."

        # 3. Verify the project is no longer accessible
        get_resp = client.get(f"/api/projects/{project_to_delete_id}", headers=headers)
        assert get_resp.status_code == 404 # Or appropriate error for not found/access denied after deletion

        # 4. Attempt to delete a non-existent project
        non_existent_project_id = str(uuid.uuid4())
        delete_non_existent_resp = client.delete(f"/api/projects/{non_existent_project_id}", headers=headers)
        assert delete_non_existent_resp.status_code == 404

        # 5. Test deletion permission: Create another project
        create_resp_2 = client.post("/api/projects/", headers=headers, json={"name": "ProjectToTestPermissions"})
        assert create_resp_2.status_code == 200
        project_id_perms_test = create_resp_2.json()["id"]

        # 6. Create a second user and token
        from app.services.auth import AuthService
        second_user_id = str(uuid.uuid4())
        with temp_db._get_connection() as conn:
            conn.execute(
                "INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)",
                (second_user_id, "user_for_delete_test", "user_del_test@example.com", "$2b$12$dummyhash")
            )
            conn.commit()
        
        auth_service_2 = AuthService(temp_db)
        token_2 = auth_service_2.create_access_token({"sub": second_user_id, "username": "user_for_delete_test"})
        headers_2 = {"Authorization": f"Bearer {token_2}"}

        # 7. Attempt to delete the project with the second user's token (should fail)
        delete_permission_resp = client.delete(f"/api/projects/{project_id_perms_test}", headers=headers_2)
        assert delete_permission_resp.status_code == 403 # Forbidden

        # 8. Verify project still exists (was not deleted by non-owner)
        get_resp_after_failed_delete = client.get(f"/api/projects/{project_id_perms_test}", headers=headers) # Check with owner token
        assert get_resp_after_failed_delete.status_code == 200


    def _create_mock_tree(self):
        """Create a mock parse tree for testing."""
        from app.services.parser.renpy_parser import ChoiceNode, ChoiceNodeType
        
        
        root = ChoiceNode("root", ChoiceNodeType.LABEL_BLOCK)
        root.start_line = 0
        root.end_line = 5
        
        start_node = ChoiceNode("start", ChoiceNodeType.LABEL_BLOCK)
        start_node.start_line = 1
        start_node.end_line = 4
        
        dialogue = ChoiceNode('"Hello, this is a test script."', ChoiceNodeType.ACTION)
        dialogue.start_line = 2
        dialogue.end_line = 2
        
        return_node = ChoiceNode("return", ChoiceNodeType.ACTION)
        return_node.start_line = 3
        return_node.end_line = 3
        
        start_node.children = [dialogue, return_node]
        root.children = [start_node]
        
        return root
