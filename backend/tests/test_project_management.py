import pytest
import tempfile
import os
import uuid
import json
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.services.database import DatabaseService
from app.api.routes.auth import get_current_user, oauth2_scheme
from fastapi import Depends

client = TestClient(app)

# --- Mocks and Helpers ---

test_db_for_auth = None

@pytest.fixture(scope="module")
def temp_db():
    global test_db_for_auth
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as temp_db_file:
        temp_db_path = temp_db_file.name

    os.environ['DATABASE_PATH'] = temp_db_path
    db_service = DatabaseService()
    test_db_for_auth = db_service

    yield db_service

    # Cleanup
    if os.path.exists(temp_db_path):
        os.remove(temp_db_path)
    test_db_for_auth = None

@pytest.fixture
def auth_token(temp_db):
    """Creates a user and returns a valid auth token."""
    from app.services.auth import AuthService

    user_id = str(uuid.uuid4())
    username = "admin"

    # Check if user exists first to avoid unique constraint error in repeated tests using same db fixture
    exists = temp_db.get_user_by_username(username)
    if not exists:
        with temp_db._get_connection() as conn:
            conn.execute(
                "INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)",
                (user_id, username, "admin@example.com", "b2")
            )
            conn.commit()
    else:
        user_id = exists["id"]

    auth_service = AuthService(temp_db)
    token = auth_service.create_access_token({"sub": user_id, "username": username})
    return token

# Mock get_current_user dependency to use our test DB for user validation
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

app.dependency_overrides[get_current_user] = override_get_current_user


class TestProjectManagement:
    
    def test_create_project(self, auth_token):
        """Test creating a new project."""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = client.post(
            "/api/projects/",
            headers=headers,
            json={"name": "New Project", "description": "A test project"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "New Project"
        assert "id" in data
        assert "owner_id" in data

    def test_list_projects(self, auth_token):
        """Test listing projects for a user."""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Create a few projects
        client.post("/api/projects/", headers=headers, json={"name": "Project 1"})
        client.post("/api/projects/", headers=headers, json={"name": "Project 2"})
        
        response = client.get("/api/projects/", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 2
        assert any(p["name"] == "Project 1" for p in data)

    def test_get_project(self, auth_token):
        """Test retrieving a specific project."""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Create project
        create_resp = client.post("/api/projects/", headers=headers, json={"name": "Target Project"})
        project_id = create_resp.json()["id"]
        
        # Get project
        response = client.get(f"/api/projects/{project_id}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == project_id
        assert data["name"] == "Target Project"

    def test_script_upload_integration(self, auth_token):
        """Test uploading a script (integration style)."""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # 1. Create project
        create_resp = client.post("/api/projects/", headers=headers, json={"name": "Upload Project"})
        assert create_resp.status_code == 200
        project_id = create_resp.json()["id"]
        
        # 2. Upload script
        script_content = "label start:\n    return"
        
        with tempfile.NamedTemporaryFile(suffix=".rpy", delete=False, mode="w+") as temp_file:
            temp_file.write(script_content)
            temp_file_path = temp_file.name
            
        try:
            with open(temp_file_path, "rb") as f:
                response = client.post(
                    "/api/scripts/parse",
                    headers=headers,
                    files={"file": f},
                    data={"project_id": project_id}
                )
            
            assert response.status_code == 200
            data = response.json()
            assert "script_id" in data
            assert data["content"] == script_content
            # tree should NOT be in data anymore
            assert "tree" not in data
            
        finally:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)

    def test_upload_without_project_id_fails(self, auth_token):
        """Test that uploading without project_id fails (validation error)."""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        with tempfile.NamedTemporaryFile(suffix=".rpy", delete=False, mode="w+") as temp_file:
            temp_file.write("label start:\n    return")
            temp_file_path = temp_file.name

        try:
            with open(temp_file_path, "rb") as f:
                response = client.post(
                    "/api/scripts/parse",
                    headers=headers,
                    files={"file": f}
                    # Missing data={"project_id": ...}
                )
            # 422 Unprocessable Entity due to missing form field
            assert response.status_code == 422
        finally:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)

    def test_share_project(self, auth_token, temp_db):
        """Test sharing a project with another user."""
        headers_user1 = {"Authorization": f"Bearer {auth_token}"}
        
        # 1. Create project
        create_resp = client.post("/api/projects/", headers=headers_user1, json={"name": "Shared Project"})
        project_id = create_resp.json()["id"]
        
        # 2. Create user2
        user2_id = str(uuid.uuid4())
        user2_username = "test_share_user2"
        # Check uniqueness
        if not temp_db.get_user_by_username(user2_username):
            with temp_db._get_connection() as conn:
                conn.execute(
                    "INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)",
                    (user2_id, user2_username, "share_user2@example.com", "hash")
                )
                conn.commit()
        else:
            user2_id = temp_db.get_user_by_username(user2_username)["id"]

        # 3. Share project
        share_resp = client.post(
            f"/api/projects/{project_id}/share",
            headers=headers_user1,
            json={"user_id": user2_username, "role": "role_viewer"}
        )
        assert share_resp.status_code == 200

        # 4. Verify access
        from app.services.auth import AuthService
        auth_service = AuthService(temp_db)
        token_user2 = auth_service.create_access_token({"sub": user2_id, "username": user2_username})
        headers_user2 = {"Authorization": f"Bearer {token_user2}"}
        
        get_resp = client.get(f"/api/projects/{project_id}", headers=headers_user2)
        assert get_resp.status_code == 200

    def test_share_project_with_role_name(self, auth_token, temp_db):
        """Test sharing a project using role name (e.g. 'Viewer')."""
        headers_user1 = {"Authorization": f"Bearer {auth_token}"}
        
        create_resp = client.post("/api/projects/", headers=headers_user1, json={"name": "RoleName Share"})
        project_id = create_resp.json()["id"]
        
        user2_id = str(uuid.uuid4())
        user2_username = "role_name_user"
        if not temp_db.get_user_by_username(user2_username):
            with temp_db._get_connection() as conn:
                conn.execute(
                    "INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)",
                    (user2_id, user2_username, "role_name@example.com", "hash")
                )
                conn.commit()
        else:
            user2_id = temp_db.get_user_by_username(user2_username)["id"]

        share_resp = client.post(
            f"/api/projects/{project_id}/share",
            headers=headers_user1,
            json={"user_id": user2_username, "role": "Viewer"}
        )
        assert share_resp.status_code == 200
        
        # Verify DB
        with temp_db._get_connection() as conn:
            row = conn.execute(
                "SELECT role_id FROM project_access WHERE project_id = ? AND user_id = ?",
                (project_id, user2_id)
            ).fetchone()
            assert row["role_id"] == "role_viewer"

    def test_delete_project_endpoint(self, auth_token, temp_db):
        """Test deleting a project."""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        create_resp = client.post("/api/projects/", headers=headers, json={"name": "Del Project"})
        assert create_resp.status_code == 200
        project_id = create_resp.json()["id"]
        
        del_resp = client.delete(f"/api/projects/{project_id}", headers=headers)
        assert del_resp.status_code == 200
        
        get_resp = client.get(f"/api/projects/{project_id}", headers=headers)
        assert get_resp.status_code == 404
