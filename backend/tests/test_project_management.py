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


from app.api.routes import projects
from app.api.routes import scripts


app.dependency_overrides[get_current_user] = override_get_current_user
client = TestClient(app)


@pytest.fixture(autouse=True)
def override_app_db_service(temp_db):
    """Override the app's database service with our test database instance."""
    
    original_projects_db = projects.db_service
    original_scripts_db = scripts.db_service
    
    
    projects.db_service = temp_db
    scripts.db_service = temp_db
    
    
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
    
    
    projects.db_service = original_projects_db
    scripts.db_service = original_scripts_db
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

    @patch('app.api.routes.scripts.parse_script')
    def test_script_upload_with_project(self, mock_parse_script, auth_token):
        """Test uploading a script with explicit project selection."""
        
        mock_parse_script.return_value = {
            "script_id": str(uuid.uuid4()),
            "filename": "test_script.rpy",
            "tree": {"id": "mock_tree", "node_type": "LabelBlock", "label_name": "root", "children": []}
        }
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        
        project_name = "Script Project"
        project_description = "Project for script testing"
        
        response = client.post(
            "/api/projects/",
            headers=headers,
            json={"name": project_name, "description": project_description}
        )
        assert response.status_code == 200, f"Failed to create project: {response.text}"
        project_data = response.json()
        project_id = project_data["id"]
        
        
        script_content = """
label start:
    "Hello, this is a test script."
    return
"""
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
            
            assert response.status_code == 200, f"Script upload failed: {response.text}"
            data = response.json()
            assert "script_id" in data, "Script ID not returned"
            assert "filename" in data, "Filename not returned"
            assert "tree" in data, "Parsed tree not returned"
            
            
            response = client.get(
                f"/api/projects/{project_id}",
                headers=headers
            )
            project = response.json()
            assert "scripts" in project, "Scripts not included in project details"
            assert len(project["scripts"]) > 0, "No scripts associated with project"
            script_found = False
            for script in project["scripts"]:
                if script["id"] == data["script_id"]:
                    script_found = True
                    break
            assert script_found, "Uploaded script not found in project scripts"
        
        finally:
            
            try:
                os.unlink(temp_file_path)
            except:
                pass

    @patch('app.api.routes.scripts.parse_script')
    def test_create_default_project(self, mock_parse_script, auth_token):
        """Test the system creates a default project when needed."""
        
        script_id1 = str(uuid.uuid4())
        script_id2 = str(uuid.uuid4())
        
        
        mock_parse_script.side_effect = [
            {
                "script_id": script_id1,
                "filename": "test_script1.rpy",
                "tree": {"id": "mock_tree1", "node_type": "LabelBlock", "label_name": "root", "children": []}
            },
            {
                "script_id": script_id2,
                "filename": "test_script2.rpy",
                "tree": {"id": "mock_tree2", "node_type": "LabelBlock", "label_name": "root", "children": []}
            }
        ]
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        
        response = client.get("/api/projects/", headers=headers)
        assert response.status_code == 200
        projects_before = response.json()
        default_projects_before = [p for p in projects_before if p["name"] == "Default Project"]
        
        
        script_content = """
label start:
    "Hello, this is a test script for default project."
    return
"""
        with tempfile.NamedTemporaryFile(suffix=".rpy", delete=False, mode="w+") as temp_file:
            temp_file.write(script_content)
            temp_file_path = temp_file.name
        
        try:
            
            with open(temp_file_path, "rb") as f:
                response = client.post(
                    "/api/scripts/parse",
                    headers=headers,
                    files={"file": f}
                )
            
            assert response.status_code == 200, f"Script upload failed: {response.text}"
            data1 = response.json()
            
            
            response = client.get("/api/projects/", headers=headers)
            projects = response.json()
            default_projects = [p for p in projects if p["name"] == "Default Project"]
            assert len(default_projects) == 1, "Default project not created or multiple defaults found"
            default_project = default_projects[0]
            
            
            with open(temp_file_path, "rb") as f:
                response = client.post(
                    "/api/scripts/parse",
                    headers=headers,
                    files={"file": f}
                )
            
            assert response.status_code == 200, f"Script upload failed: {response.text}"
            data2 = response.json()
            
            
            response = client.get(f"/api/projects/{default_project['id']}", headers=headers)
            updated_project = response.json()
            assert "scripts" in updated_project, "Scripts not included in project details"
            script_ids = [s["id"] for s in updated_project["scripts"]]
            assert data1["script_id"] in script_ids, "First script not in default project"
            assert data2["script_id"] in script_ids, "Second script not in default project"
            
            
            response = client.get("/api/projects/", headers=headers)
            projects = response.json()
            default_projects = [p for p in projects if p["name"] == "Default Project"]
            assert len(default_projects) == 1, "Multiple default projects found"
        
        finally:
            
            try:
                os.unlink(temp_file_path)
            except:
                pass

    def test_share_project(self, auth_token, temp_db):
        """Test sharing a project with another user."""
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        resp = client.post("/api/projects/", headers=headers, json={"name":"ShareProj"})
        project_id = resp.json()["id"]

        
        from app.services.auth import AuthService
        second_id = str(uuid.uuid4())
        with temp_db._get_connection() as conn:
            conn.execute(
                "INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)",
                (second_id, "user2", "user2@example.com", "$2b$12$dummyhash")
            )
            temp_db.grant_project_access(project_id, second_id, "role_viewer")

        
        auth2 = AuthService(temp_db)
        token2 = auth2.create_access_token({"sub": second_id, "username": "user2"})

        
        share_resp = client.post(
            f"/api/projects/{project_id}/share",
            headers=headers,
            json={"user_id": second_id, "role": "role_viewer"}
        )
        assert share_resp.status_code == 200

        
        resp2 = client.get(
            f"/api/projects/{project_id}",
            headers={"Authorization": f"Bearer {token2}"}
        )
        assert resp2.status_code == 200
        proj2 = resp2.json()
        assert proj2["id"] == project_id

    def test_create_script_endpoint(self, auth_token):
        """Test creating a script via the projects/{project_id}/scripts endpoint."""
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        resp = client.post("/api/projects/", headers=headers, json={"name":"ScriptProj"})
        project_id = resp.json()["id"]

        
        payload = {"filename":"a.rpy", "content":"label a:\n    return"}
        create_resp = client.post(
            f"/api/projects/{project_id}/scripts",
            headers=headers,
            json=payload
        )
        assert create_resp.status_code == 200
        script_id = create_resp.json()["id"]

        
        proj = client.get(f"/api/projects/{project_id}", headers=headers).json()
        assert any(s["id"] == script_id for s in proj["scripts"])

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
