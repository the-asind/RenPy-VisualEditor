import unittest
import os
import tempfile
from pathlib import Path
import sqlite3
import uuid
from datetime import datetime, timedelta
import time
import logging
import shutil

# Import the database service
from app.services.database import DatabaseService, ScriptCache

# Setup logging for debugging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class TestDatabaseService(unittest.TestCase):
    """Test suite for DatabaseService."""
    
    def setUp(self):
        """Set up a temporary database for testing."""
        # Create a temporary directory
        self.temp_dir = tempfile.TemporaryDirectory()
        # Set the database path to a temporary file
        self.db_path = os.path.join(self.temp_dir.name, 'test.db')
        os.environ['DATABASE_PATH'] = self.db_path
        
        logger.debug(f"Setting up test database at: {self.db_path}")
        
        # Find the schema file
        schema_content = None
        schema_locations = [
            # Look in the backend/database directory
            Path(__file__).parent.parent / 'database' / 'schema.sql',
            # Look in the root database directory
            Path(__file__).parent.parent.parent / 'database' / 'schema.sql',
            # Look in the current directory
            Path.cwd() / 'database' / 'schema.sql'
        ]
        
        schema_path = None
        for loc in schema_locations:
            logger.debug(f"Checking for schema at: {loc}")
            if loc.exists():
                schema_path = loc
                logger.debug(f"Found schema at: {schema_path}")
                with open(schema_path, 'r', encoding='utf-8') as f:
                    schema_content = f.read()
                break
        
        if not schema_content:
            # If we couldn't find the schema file, create it with required tables
            logger.warning("Schema file not found. Creating basic schema for testing.")
            schema_content = """
                -- Schema for RenPy Visual Editor database (test version)

                -- Users table
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                -- Projects table
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    owner_id TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
                );

                -- Roles table
                CREATE TABLE IF NOT EXISTS roles (
                    id TEXT PRIMARY KEY,
                    name TEXT UNIQUE NOT NULL,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                -- Project access permissions
                CREATE TABLE IF NOT EXISTS project_access (
                    project_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    role_id TEXT NOT NULL,
                    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (project_id, user_id),
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
                );

                -- Scripts table
                CREATE TABLE IF NOT EXISTS scripts (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    content TEXT NOT NULL,
                    last_edited_by TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    FOREIGN KEY (last_edited_by) REFERENCES users(id) ON DELETE SET NULL
                );

                -- Script versions
                CREATE TABLE IF NOT EXISTS versions (
                    id TEXT PRIMARY KEY,
                    script_id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_by TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
                    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
                );

                -- Editing sessions
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    script_id TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    ended_at TIMESTAMP,
                    FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
                );

                -- Session participants
                CREATE TABLE IF NOT EXISTS participants (
                    session_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    left_at TIMESTAMP,
                    PRIMARY KEY (session_id, user_id),
                    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                -- Node locks for collaborative editing
                CREATE TABLE IF NOT EXISTS node_locks (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    node_id TEXT NOT NULL,
                    locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    UNIQUE(node_id, session_id)
                );

                -- Insert default roles
                INSERT OR IGNORE INTO roles (id, name, description) VALUES 
                    ('role_owner', 'Owner', 'Full control over project and can manage access'),
                    ('role_editor', 'Editor', 'Can edit scripts and create new versions'),
                    ('role_viewer', 'Viewer', 'Read-only access to scripts');
            """
        
        # Create a database file and apply schema directly
        logger.debug("Applying schema to test database")
        # Ensure the database file doesn't exist before creating it
        if os.path.exists(self.db_path):
            os.unlink(self.db_path)
            
        # Now create the database with schema
        with sqlite3.connect(self.db_path) as conn:
            logger.debug("Executing schema script")
            conn.executescript(schema_content)
            conn.commit()
            
            # Verify tables were created
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            logger.debug(f"Tables in test database: {', '.join(tables)}")
            
            # Verify essential tables exist
            required_tables = ["users", "projects", "scripts", "roles", "sessions", "participants", "node_locks"]
            for table in required_tables:
                self.assertIn(table, tables, f"Required table '{table}' not found in database")
        
        # Initialize the database service after schema is applied
        logger.debug("Initializing DatabaseService")
        self.db_service = DatabaseService()
        
        # Create test users with unique identifiers to avoid conflicts
        unique_id = uuid.uuid4().hex[:8]
        self.test_user_id = self.db_service.create_user(
            f'testuser_{unique_id}', f'test_{unique_id}@example.com', 'password_hash'
        )
        self.test_user2_id = self.db_service.create_user(
            f'testuser2_{unique_id}', f'test2_{unique_id}@example.com', 'password_hash'
        )
    
    def tearDown(self):
        """Clean up temporary files."""
        # Explicitly close database connections
        if hasattr(self, 'db_service') and self.db_service:
            try:
                self.db_service.close()
            except Exception as e:
                logger.error(f"Error closing DB service: {e}")
        
        # Release references
        self.db_service = None
        
        # Force garbage collection to release file handles
        import gc
        gc.collect()
        
        # Allow time for connections to close
        time.sleep(0.5)
        
        try:
            # Close all connections to the database
            if hasattr(self, 'db_path') and os.path.exists(self.db_path):
                conn = sqlite3.connect(self.db_path)
                conn.close()
        except Exception as e:
            logger.warning(f"Error closing database connection: {e}")
        
        # Now cleanup with error handling
        try:
            if hasattr(self, 'temp_dir') and self.temp_dir:
                # On Windows, explicitly close the temp_dir handle
                self.temp_dir.cleanup()
        except (PermissionError, OSError) as e:
            logger.warning(f"Could not clean temporary directory: {e}")
            # On Windows, use a more forceful approach if cleanup fails
            if hasattr(self, 'db_path') and os.path.exists(self.db_path):
                try:
                    os.chmod(self.db_path, 0o666)  # Ensure we have permission
                    os.unlink(self.db_path)
                    logger.debug("Successfully removed database file manually")
                except Exception as ignore:
                    logger.warning(f"Could not manually remove database file: {ignore}")
            
            if hasattr(self, 'temp_dir') and os.path.exists(self.temp_dir.name):
                try:
                    shutil.rmtree(self.temp_dir.name, ignore_errors=True)
                    logger.debug("Successfully removed temp directory manually")
                except Exception as ignore:
                    logger.warning(f"Could not manually remove temp directory: {ignore}")

    def test_create_project(self):
        """Test creating a project."""
        project_name = "Test Project"
        project_id = self.db_service.create_project(project_name, self.test_user_id)
        
        # Verify project was created
        with sqlite3.connect(os.environ['DATABASE_PATH']) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                'SELECT * FROM projects WHERE id = ?',
                (project_id,)
            )
            project = cursor.fetchone()
        
        self.assertIsNotNone(project)
        self.assertEqual(project['name'], project_name)
        self.assertEqual(project['owner_id'], self.test_user_id)
    
    def test_save_script(self):
        """Test saving a script."""
        # Create a project first
        project_id = self.db_service.create_project("Test Project", self.test_user_id)
        
        script_filename = "test.rpy"
        script_content = "label start:\n    \"Hello, world!\"\n    return"
        script_id = self.db_service.save_script(project_id, script_filename, script_content)
        
        # Verify script was saved
        with sqlite3.connect(os.environ['DATABASE_PATH']) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                'SELECT * FROM scripts WHERE id = ?',
                (script_id,)
            )
            script = cursor.fetchone()
        
        self.assertIsNotNone(script)
        self.assertEqual(script['filename'], script_filename)
        self.assertEqual(script['content'], script_content)
        self.assertEqual(script['project_id'], project_id)
    
    def test_update_script(self):
        """Test updating a script."""
        # Create project and script
        project_id = self.db_service.create_project("Test Project", self.test_user_id)
        script_id = self.db_service.save_script(
            project_id, "test.rpy", "Original content"
        )
        
        # Update script
        updated_content = "Updated content"
        self.db_service.update_script(script_id, updated_content, self.test_user_id)
        
        # Verify script was updated
        with sqlite3.connect(os.environ['DATABASE_PATH']) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                'SELECT * FROM scripts WHERE id = ?',
                (script_id,)
            )
            script = cursor.fetchone()
            
            # Check version was created
            cursor = conn.execute(
                'SELECT * FROM versions WHERE script_id = ?',
                (script_id,)
            )
            version = cursor.fetchone()
        
        self.assertEqual(script['content'], updated_content)
        self.assertIsNotNone(version)
        self.assertEqual(version['content'], updated_content)
        self.assertEqual(version['created_by'], self.test_user_id)
    
    def test_create_user(self):
        """Test creating a user."""
        username = f"newuser_{uuid.uuid4().hex[:8]}"
        email = f"{username}@example.com"
        password_hash = "hashed_password"
        
        user_id = self.db_service.create_user(username, email, password_hash)
        
        # Verify user was created
        with sqlite3.connect(os.environ['DATABASE_PATH']) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                'SELECT * FROM users WHERE id = ?',
                (user_id,)
            )
            user = cursor.fetchone()
        
        self.assertIsNotNone(user)
        self.assertEqual(user['username'], username)
        self.assertEqual(user['email'], email)
        self.assertEqual(user['password_hash'], password_hash)
    
    def test_get_user_by_username(self):
        """Test retrieving a user by username."""
        # First create a user with known username for testing
        unique_id = uuid.uuid4().hex[:8]
        username = f'testuser_retrieve_{unique_id}'
        email = f'test_retrieve_{unique_id}@example.com'
        user_id = self.db_service.create_user(username, email, 'password_hash')
        
        # Now retrieve the user
        user = self.db_service.get_user_by_username(username)
        
        self.assertIsNotNone(user)
        self.assertEqual(user['id'], user_id)
        self.assertEqual(user['username'], username)
        self.assertEqual(user['email'], email)
    
    def test_editing_session_lifecycle(self):
        """Test creating and managing an editing session."""
        # Create project and script
        project_id = self.db_service.create_project("Test Project", self.test_user_id)
        script_id = self.db_service.save_script(
            project_id, "test.rpy", "Test content"
        )
        
        # Create session
        session_id = self.db_service.create_editing_session(script_id)
        
        # Add participants
        self.db_service.add_session_participant(session_id, self.test_user_id)
        self.db_service.add_session_participant(session_id, self.test_user2_id)
        
        # End session for one participant
        self.db_service.end_session_for_participant(session_id, self.test_user2_id)
        
        # Verify session state
        with sqlite3.connect(os.environ['DATABASE_PATH']) as conn:
            conn.row_factory = sqlite3.Row
            
            # Check session exists
            cursor = conn.execute(
                'SELECT * FROM sessions WHERE id = ?',
                (session_id,)
            )
            session = cursor.fetchone()
            self.assertIsNotNone(session)
            
            # Check participants
            cursor = conn.execute(
                'SELECT * FROM participants WHERE session_id = ?',
                (session_id,)
            )
            participants = cursor.fetchall()
            self.assertEqual(len(participants), 2)
            
            # Find participants by user_id instead of assuming a specific order
            user1_participant = None
            user2_participant = None
            
            for participant in participants:
                if participant['user_id'] == self.test_user_id:
                    user1_participant = participant
                elif participant['user_id'] == self.test_user2_id:
                    user2_participant = participant
                    
            # Check first participant (still active)
            self.assertIsNotNone(user1_participant)
            self.assertIsNone(user1_participant['left_at'])
            
            # Check second participant (left)
            self.assertIsNotNone(user2_participant)
            self.assertIsNotNone(user2_participant['left_at'])

    def test_script_cache(self):
        """Test the script caching functionality."""
        # Create a new ScriptCache with short TTL for testing
        cache = ScriptCache(max_size=3, ttl_seconds=1)
        
        # Add items to cache
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.set("key3", "value3")
        
        # Test retrieval
        self.assertEqual(cache.get("key1"), "value1")
        self.assertEqual(cache.get("key2"), "value2")
        self.assertEqual(cache.get("key3"), "value3")
        
        # Test max size enforcement (oldest item should be evicted)
        cache.set("key4", "value4")
        self.assertIsNone(cache.get("key1"))
        self.assertEqual(cache.get("key4"), "value4")
        
        # Test TTL expiration
        time.sleep(1.1)  # Wait just over the TTL
        self.assertIsNone(cache.get("key2"))
        
        # Test delete
        cache.delete("key3")
        self.assertIsNone(cache.get("key3"))
        
        # Test clear
        cache.clear()
        self.assertIsNone(cache.get("key4"))
    
    def test_get_user_by_id(self):
        """Test retrieving a user by ID."""
        # Use the test user created in setUp
        user = self.db_service.get_user_by_id(self.test_user_id)
        
        self.assertIsNotNone(user)
        self.assertEqual(user['id'], self.test_user_id)
    
    def test_get_script(self):
        """Test retrieving a script with cache interaction."""
        # Create project and script
        project_id = self.db_service.create_project("Test Project", self.test_user_id)
        script_content = "label start:\n    \"Hello, world!\"\n    return"
        script_id = self.db_service.save_script(project_id, "test_get.rpy", script_content, self.test_user_id)
        
        # Get script (should come from database first time)
        script = self.db_service.get_script(script_id)
        
        self.assertIsNotNone(script)
        self.assertEqual(script['content'], script_content)
        self.assertEqual(len(script['content_lines']), 3)  # Three lines in our content
        
        # Get again (should come from cache)
        # This is harder to test directly, but we can verify it returns the same data
        script_again = self.db_service.get_script(script_id)
        self.assertEqual(script['content'], script_again['content'])
    
    def test_delete_script(self):
        """Test deleting a script and its versions."""
        # Create project and script with version
        project_id = self.db_service.create_project("Test Project", self.test_user_id)
        script_id = self.db_service.save_script(
            project_id, "test_delete.rpy", "Initial content", self.test_user_id
        )
        
        # Update to create version
        self.db_service.update_script(script_id, "Updated content", self.test_user_id)
        
        # Delete script
        result = self.db_service.delete_script(script_id)
        self.assertTrue(result)
        
        # Verify script and versions are gone
        with sqlite3.connect(os.environ['DATABASE_PATH']) as conn:
            conn.row_factory = sqlite3.Row
            
            # Check script
            cursor = conn.execute('SELECT * FROM scripts WHERE id = ?', (script_id,))
            self.assertIsNone(cursor.fetchone())
            
            # Check versions
            cursor = conn.execute('SELECT * FROM versions WHERE script_id = ?', (script_id,))
            self.assertIsNone(cursor.fetchone())
    
    def test_search_scripts(self):
        """Test searching for scripts."""
        # Create project
        project_id = self.db_service.create_project("Search Test Project", self.test_user_id)
        
        # Create multiple scripts with different content
        script1_id = self.db_service.save_script(
            project_id, "script1.rpy", "label start:\n    \"This is a test script\"", self.test_user_id
        )
        script2_id = self.db_service.save_script(
            project_id, "script2.rpy", "label another:\n    \"Another script with different content\"", self.test_user_id
        )
        script3_id = self.db_service.save_script(
            project_id, "example_script.rpy", "label example:\n    \"Example content\"", self.test_user_id
        )
        
        # Search by project
        project_scripts = self.db_service.search_scripts(project_id=project_id)
        self.assertEqual(len(project_scripts), 3)
        
        # Search by content
        test_scripts = self.db_service.search_scripts(query="test")
        self.assertGreaterEqual(len(test_scripts), 1)
        
        # Search by filename
        example_scripts = self.db_service.search_scripts(query="example")
        self.assertGreaterEqual(len(example_scripts), 1)
        
        # Combined search
        project_example_scripts = self.db_service.search_scripts(project_id=project_id, query="example")
        self.assertGreaterEqual(len(project_example_scripts), 1)
        self.assertLessEqual(len(project_example_scripts), len(project_scripts))
    
    def test_get_project_scripts(self):
        """Test getting all scripts for a project."""
        # Create project
        project_id = self.db_service.create_project("Script List Project", self.test_user_id)
        
        # Create multiple scripts
        for i in range(3):
            self.db_service.save_script(
                project_id, f"script{i}.rpy", f"Content for script {i}", self.test_user_id
            )
        
        # Get project scripts
        scripts = self.db_service.get_project_scripts(project_id)
        
        # Verify all scripts are returned
        self.assertEqual(len(scripts), 3)
        
        # Verify script information
        for script in scripts:
            self.assertIn('id', script)
            self.assertIn('filename', script)
            self.assertIn('updated_at', script)
    
    def test_get_user_projects(self):
        """Test getting projects accessible by a user."""
        # Create projects owned by test user
        owned_project_id = self.db_service.create_project("Owned Project", self.test_user_id)
        
        # Create project owned by another user
        other_project_id = self.db_service.create_project("Other Project", self.test_user2_id)
        
        # Grant access to test user for the other project
        # First get the role ID (assuming 'Editor' role exists from schema)
        with sqlite3.connect(os.environ['DATABASE_PATH']) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute('SELECT id FROM roles WHERE name = ?', ('Editor',))
            role = cursor.fetchone()
            role_id = role['id']
        
        # Grant access
        self.db_service.grant_project_access(other_project_id, self.test_user_id, role_id)
        
        # Get user projects
        projects = self.db_service.get_user_projects(self.test_user_id)
        
        # Verify both projects are returned
        self.assertEqual(len(projects), 2)
        
        # Check for owned project
        owned_found = False
        shared_found = False
        
        for project in projects:
            if project['id'] == owned_project_id and project['role'] == 'Owner':
                owned_found = True
            if project['id'] == other_project_id and project['role'] == 'Editor':
                shared_found = True
        
        self.assertTrue(owned_found, "Owned project not found in user projects")
        self.assertTrue(shared_found, "Shared project not found in user projects")
    
    def test_grant_project_access(self):
        """Test granting project access to a user."""
        # Create a project
        project_id = self.db_service.create_project("Access Test Project", self.test_user_id)
        
        # Get a role ID
        with sqlite3.connect(os.environ['DATABASE_PATH']) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute('SELECT id FROM roles WHERE name = ?', ('Viewer',))
            role = cursor.fetchone()
            role_id = role['id']
        
        # Grant access
        result = self.db_service.grant_project_access(project_id, self.test_user2_id, role_id)
        self.assertTrue(result)
        
        # Verify access was granted
        with sqlite3.connect(os.environ['DATABASE_PATH']) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                'SELECT * FROM project_access WHERE project_id = ? AND user_id = ?',
                (project_id, self.test_user2_id)
            )
            access = cursor.fetchone()
            
            self.assertIsNotNone(access)
            self.assertEqual(access['role_id'], role_id)
        
        # Test updating existing access
        with sqlite3.connect(os.environ['DATABASE_PATH']) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute('SELECT id FROM roles WHERE name = ?', ('Editor',))
            new_role = cursor.fetchone()
            new_role_id = new_role['id']
        
        # Update access with new role
        result = self.db_service.grant_project_access(project_id, self.test_user2_id, new_role_id)
        self.assertTrue(result)
        
        # Verify access was updated
        with sqlite3.connect(os.environ['DATABASE_PATH']) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                'SELECT * FROM project_access WHERE project_id = ? AND user_id = ?',
                (project_id, self.test_user2_id)
            )
            access = cursor.fetchone()
            
            self.assertIsNotNone(access)
            self.assertEqual(access['role_id'], new_role_id)


if __name__ == '__main__':
    unittest.main()
