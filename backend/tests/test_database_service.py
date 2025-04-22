import os
import tempfile
import pytest
import sqlite3
import time
import uuid
from pathlib import Path
from datetime import datetime, timedelta
from unittest.mock import patch

from app.services.database import DatabaseService, ScriptCache

class TestScriptCache:
    """Test suite for ScriptCache."""
    
    def test_cache_set_get(self):
        """Test basic set and get operations."""
        cache = ScriptCache(max_size=5, ttl_seconds=1)
        cache.set("key1", {"data": "value1"})
        
        # Check that value is retrievable
        assert cache.get("key1") == {"data": "value1"}
        
        # Check that non-existent key returns None
        assert cache.get("nonexistent") is None
    def test_cache_expiration(self):
        """Test that cached items expire after TTL."""
        cache = ScriptCache(max_size=5, ttl_seconds=0.1)
        cache.set("key1", {"data": "value1"})
        
        # Should be available immediately
        assert cache.get("key1") == {"data": "value1"}
        
        # Wait for expiration (adding more time to ensure TTL passes)
        time.sleep(0.3)
        
        # Should be expired now
        assert cache.get("key1") is None
    
    def test_cache_max_size(self):
        """Test that cache respects max_size limit."""
        cache = ScriptCache(max_size=3, ttl_seconds=10)
        
        # Add items
        cache.set("key1", {"data": "value1"})
        cache.set("key2", {"data": "value2"})
        cache.set("key3", {"data": "value3"})
        
        # All items should be available
        assert cache.get("key1") is not None
        assert cache.get("key2") is not None
        assert cache.get("key3") is not None
        
        # Add one more item, should evict oldest
        cache.set("key4", {"data": "value4"})
        
        # key1 should be evicted (oldest by timestamp)
        assert cache.get("key1") is None
        assert cache.get("key2") is not None
        assert cache.get("key3") is not None
        assert cache.get("key4") is not None
    
    def test_cache_delete(self):
        """Test that delete removes an item."""
        cache = ScriptCache(max_size=5, ttl_seconds=10)
        cache.set("key1", {"data": "value1"})
        cache.set("key2", {"data": "value2"})
        
        # Delete item
        cache.delete("key1")
        
        # Verify it's gone
        assert cache.get("key1") is None
        assert cache.get("key2") is not None
    
    def test_cache_clear(self):
        """Test that clear removes all items."""
        cache = ScriptCache(max_size=5, ttl_seconds=10)
        cache.set("key1", {"data": "value1"})
        cache.set("key2", {"data": "value2"})
        
        # Clear cache
        cache.clear()
        
        # Verify all items are gone
        assert cache.get("key1") is None
        assert cache.get("key2") is None


@pytest.fixture
def temp_db(request):
    """Create a temporary database for testing."""
    # Create a unique filename for each test to ensure isolation
    test_id = request.node.name.replace("[", "_").replace("]", "_")
    
    # Use a standalone file path instead of a temporary directory
    # This avoids issues with directory cleanup
    temp_dir = tempfile.gettempdir()  # Using the globally imported tempfile module
    db_path = os.path.join(temp_dir, f'renpy_test_db_{test_id}_{int(time.time())}.db')
    original_db_path = os.environ.get('DATABASE_PATH')
    
    # If the test database already exists, delete it to ensure a clean slate
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except (PermissionError, OSError):
            # If we can't delete it, generate a new unique name
            db_path = os.path.join(temp_dir, f'renpy_test_db_{test_id}_{uuid.uuid4().hex}.db')
    
    print(f"Creating test database at: {db_path}")
    
    # Create parent directory of db_path if it doesn't exist
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    # Copy schema.sql to a location that DatabaseService can find
    backend_dir = Path(__file__).parent.parent
    schema_path = backend_dir / 'database' / 'schema.sql'
    
    # Make sure schema directory exists
    os.makedirs(os.path.dirname(schema_path), exist_ok=True)
    
    # Check if we need to create or copy the schema file
    if not schema_path.exists():
        # Try to find schema.sql from the project root
        project_root = backend_dir.parent
        source_schema = project_root / 'database' / 'schema.sql'
        if source_schema.exists():
            print(f"Copying schema from {source_schema} to {schema_path}")
            os.makedirs(schema_path.parent, exist_ok=True)
            with open(source_schema, 'r') as src, open(schema_path, 'w') as dest:
                dest.write(src.read())
    
    db_service = None
    try:
        os.environ['DATABASE_PATH'] = db_path
        # Initialize the database service
        db_service = DatabaseService()
        
        # Verify the database was initialized correctly
        with db_service._get_connection() as conn:
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            print(f"Tables in test database: {', '.join(tables)}")
        
        yield db_service
    finally:
        # Clean up database connections
        try:
            # Make sure we have no connections to the database before cleanup
            if db_service:
                # Close any explicit connections
                if hasattr(db_service, '_conn') and db_service._conn:
                    try:
                        db_service._conn.close()
                    except:
                        pass
                    db_service._conn = None
                
                # Clear script cache to release any references
                if hasattr(db_service, 'script_cache'):
                    db_service.script_cache.clear()
            
            # Force garbage collection to release file handles
            import gc
            gc.collect()
            
            # Allow a moment for connections to close
            time.sleep(1.0)
            
            # Set database service to None to release references
            db_service = None
            
            # Force another garbage collection
            gc.collect()
        except Exception as e:
            print(f"Warning during db connection cleanup: {e}")
        
        # Restore original database path
        if original_db_path:
            os.environ['DATABASE_PATH'] = original_db_path
        else:
            os.environ.pop('DATABASE_PATH', None)
        
        # Try to clean up the temporary database file
        try:
            if os.path.exists(db_path):
                # Wait a bit more to ensure all file handles are released
                time.sleep(1.0)
                try:
                    # On Windows, sometimes we need to make the file writable first
                    os.chmod(db_path, 0o666)
                    os.remove(db_path)
                except Exception as e:
                    print(f"Note: Could not remove test database file (this is generally safe to ignore): {e}")
                    # If we can't delete it, at least mark it as temporary so Windows might clean it up later
                    try:
                        # Use the globally imported tempfile module, not trying to import it again
                        tmp_wrapper = tempfile._TemporaryFileWrapper(open(db_path, 'a'), db_path)
                        tmp_wrapper.close()
                    except:
                        pass
        except Exception as e:
            print(f"Note: Error during cleanup: {e}")


@pytest.fixture
def populated_db(temp_db):
    """Create a database with test data."""
    # Create test users with a unique identifier to prevent conflicts
    unique_id = uuid.uuid4().hex[:8]
    user_id = temp_db.create_user(f'testuser_{unique_id}', f'test_{unique_id}@example.com', 'password_hash')
    user2_id = temp_db.create_user(f'testuser2_{unique_id}', f'test2_{unique_id}@example.com', 'password_hash')
    project_id = temp_db.create_project('Test Project', user_id)
    
    # Get roles
    with temp_db._get_connection() as conn:
        cursor = conn.execute('SELECT id FROM roles WHERE name = ?', ('Editor',))
        editor_role = cursor.fetchone()
        cursor = conn.execute('SELECT id FROM roles WHERE name = ?', ('Viewer',))
        viewer_role = cursor.fetchone()
    
    # Return IDs for test data
    return {
        'db_service': temp_db,
        'user_id': user_id,
        'user2_id': user2_id,
        'project_id': project_id,
        'editor_role_id': editor_role['id'] if editor_role else None,
        'viewer_role_id': viewer_role['id'] if viewer_role else None
    }


class TestDatabaseService:
    """Test suite for DatabaseService."""
    def test_create_user(self, temp_db):
        """Test user creation."""
        # Use unique username and email for each test run
        unique_suffix = uuid.uuid4().hex[:8]
        username = f"newuser_{unique_suffix}"
        email = f"new_{unique_suffix}@example.com"
        password_hash = "hashed_password"
        
        user_id = temp_db.create_user(username, email, password_hash)
        
        # Verify user exists
        with temp_db._get_connection() as conn:
            cursor = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,))
            user = cursor.fetchone()
        
        assert user is not None
        assert user['username'] == username
        assert user['email'] == email
        assert user['password_hash'] == password_hash
    def test_create_duplicate_user(self, temp_db):
        """Test that duplicate usernames or emails are rejected."""
        # Use unique values to ensure this test starts fresh
        unique_suffix = uuid.uuid4().hex[:8]
        base_username = f"testuser_{unique_suffix}"
        base_email = f"test_{unique_suffix}@example.com"
        
        # Create initial user
        temp_db.create_user(base_username, base_email, "password_hash")
        
        # Try to create user with same username
        with pytest.raises(ValueError):
            temp_db.create_user(base_username, f"different_{unique_suffix}@example.com", "password_hash")
        
        # Try to create user with same email
        with pytest.raises(ValueError):
            temp_db.create_user(f"different_{unique_suffix}", base_email, "password_hash")
    
    def test_create_project(self, populated_db):
        """Test project creation."""
        db_service = populated_db['db_service']
        user_id = populated_db['user_id']
        
        project_name = "New Project"
        project_id = db_service.create_project(project_name, user_id)
        
        # Verify project exists
        with db_service._get_connection() as conn:
            cursor = conn.execute('SELECT * FROM projects WHERE id = ?', (project_id,))
            project = cursor.fetchone()
        
        assert project is not None
        assert project['name'] == project_name
        assert project['owner_id'] == user_id
    
    def test_save_and_get_script(self, populated_db):
        """Test saving and retrieving a script."""
        db_service = populated_db['db_service']
        project_id = populated_db['project_id']
        user_id = populated_db['user_id']
        
        # Save a test script
        script_content = 'label start:\n    "Hello, world!"\n    return'
        script_filename = 'test_script.rpy'
        
        script_id = db_service.save_script(
            project_id, 
            script_filename, 
            script_content, 
            user_id
        )
        
        # Get the script
        script = db_service.get_script(script_id)
        
        # Verify script data
        assert script is not None
        assert script['filename'] == script_filename
        assert script['content'] == script_content
        assert script['project_id'] == project_id
        assert script['content_lines'] == ['label start:', '    "Hello, world!"', '    return']
    
    def test_update_script(self, populated_db):
        """Test updating a script."""
        db_service = populated_db['db_service']
        project_id = populated_db['project_id']
        user_id = populated_db['user_id']
        
        # Save initial script
        script_content = 'label start:\n    "Original content"\n    return'
        script_filename = 'update_test.rpy'
        
        script_id = db_service.save_script(
            project_id, 
            script_filename, 
            script_content, 
            user_id
        )
        
        # Update the script
        updated_content = 'label start:\n    "Updated content"\n    return'
        db_service.update_script(script_id, updated_content, user_id)
        
        # Get updated script
        script = db_service.get_script(script_id)
        
        # Verify updated content
        assert script['content'] == updated_content
        assert script['content_lines'] == ['label start:', '    "Updated content"', '    return']
        
        # Check that version was created
        with db_service._get_connection() as conn:
            cursor = conn.execute('SELECT COUNT(*) as count FROM versions WHERE script_id = ?', (script_id,))
            version_count = cursor.fetchone()['count']
            
        assert version_count == 2  # Initial version + update
    
    def test_delete_script(self, populated_db):
        """Test deleting a script."""
        db_service = populated_db['db_service']
        project_id = populated_db['project_id']
        user_id = populated_db['user_id']
        
        # Save a script to delete
        script_content = 'label start:\n    "To be deleted"\n    return'
        script_filename = 'delete_test.rpy'
        
        script_id = db_service.save_script(
            project_id, 
            script_filename, 
            script_content, 
            user_id
        )
        
        # Verify script exists
        assert db_service.get_script(script_id) is not None
        
        # Delete the script
        result = db_service.delete_script(script_id)
        assert result is True
        
        # Verify script no longer exists
        assert db_service.get_script(script_id) is None
    def test_script_caching(self, populated_db):
        """Test script caching functionality."""
        db_service = populated_db['db_service']
        project_id = populated_db['project_id']
        user_id = populated_db['user_id']
        
        # Save a test script
        script_content = 'label start:\n    "Cached content"\n    return'
        script_filename = 'cache_test.rpy'
        
        script_id = db_service.save_script(
            project_id, 
            script_filename, 
            script_content, 
            user_id
        )
        
        # Access once to ensure it's in cache
        db_service.get_script(script_id)
        
        # Modify directly in database (bypassing the service)
        with sqlite3.connect(os.environ['DATABASE_PATH']) as conn:
            conn.execute(
                'UPDATE scripts SET filename = ? WHERE id = ?',
                ('modified_in_db.rpy', script_id)
            )
        
        # Second access should return cached version with original filename
        script = db_service.get_script(script_id)
        assert script['filename'] == script_filename  # Still the cached value
          # Clear the specific cache entry
        db_service.script_cache.delete(script_id)
        
        # Third access should get the updated data from database
        script = db_service.get_script(script_id)
        assert script['filename'] == 'modified_in_db.rpy'  # Updated value from DB
    def test_search_scripts(self, populated_db):
        """Test searching for scripts."""
        db_service = populated_db['db_service']
        project_id = populated_db['project_id']
        user_id = populated_db['user_id']
        
        # First, clear any existing scripts to ensure test isolation
        with db_service._get_connection() as conn:
            conn.execute('DELETE FROM versions')
            conn.execute('DELETE FROM scripts')
        
        # Create multiple test scripts
        db_service.save_script(
            project_id, 
            'script1.rpy',
            'label start:\n    "First script"\n    return',
            user_id
        )
        db_service.save_script(
            project_id, 
            'script2.rpy',
            'label start:\n    "Second script with special keyword"\n    return',
            user_id
        )
        db_service.save_script(
            project_id, 
            'special.rpy',
            'label start:\n    "Third script"\n    return',
            user_id
        )
        
        # Create a second project with its own script
        project2_id = db_service.create_project('Second Project', user_id)
        db_service.save_script(
            project2_id, 
            'another_script.rpy',
            'label start:\n    "Another script with keyword"\n    return',
            user_id
        )
        
        # Test search by content
        results = db_service.search_scripts(query="special")
        # Should find script2 (with "special keyword") and special.rpy
        assert len(results) == 2
        
        # Test search by project ID
        results = db_service.search_scripts(project_id=project_id)
        assert len(results) == 3  # Should find all scripts in first project
        
        # Test search with both filters
        results = db_service.search_scripts(
            project_id=project_id,
            query="First"
        )
        assert len(results) == 1  # Should find only script1
        file_names = [script['filename'] for script in results]
        assert 'script1.rpy' in file_names
    
    def test_get_user_projects(self, populated_db):
        """Test retrieving projects accessible to a user."""
        db_service = populated_db['db_service']
        user_id = populated_db['user_id']
        user2_id = populated_db['user2_id']
        project_id = populated_db['project_id']
        editor_role_id = populated_db['editor_role_id']
        
        # Create another project owned by user2
        project2_id = db_service.create_project('User2 Project', user2_id)
        
        # Grant user1 access to user2's project
        db_service.grant_project_access(project2_id, user_id, editor_role_id)
        
        # Get user1's projects
        projects = db_service.get_user_projects(user_id)
        
        # Verify both projects are returned
        assert len(projects) == 2
        
        # Check projects and roles
        project_roles = {p['id']: p['role'] for p in projects}
        assert project_roles[project_id] == 'Owner'
        assert project_roles[project2_id] == 'Editor'
    
    def test_grant_project_access(self, populated_db):
        """Test granting and updating access to a project."""
        db_service = populated_db['db_service']
        user_id = populated_db['user_id']
        user2_id = populated_db['user2_id']
        project_id = populated_db['project_id']
        viewer_role_id = populated_db['viewer_role_id']
        editor_role_id = populated_db['editor_role_id']
        
        # Grant initial access as viewer
        db_service.grant_project_access(project_id, user2_id, viewer_role_id)
        
        # Verify access was granted
        projects = db_service.get_user_projects(user2_id)
        assert len(projects) == 1
        assert projects[0]['id'] == project_id
        assert projects[0]['role'] == 'Viewer'
        
        # Update access to editor
        db_service.grant_project_access(project_id, user2_id, editor_role_id)
        
        # Verify access was updated
        projects = db_service.get_user_projects(user2_id)
        assert len(projects) == 1
        assert projects[0]['id'] == project_id
        assert projects[0]['role'] == 'Editor'
    
    def test_get_project_scripts(self, populated_db):
        """Test retrieving all scripts for a project."""
        db_service = populated_db['db_service']
        project_id = populated_db['project_id']
        user_id = populated_db['user_id']
        
        # Add multiple scripts to the project
        for i in range(3):
            db_service.save_script(
                project_id,
                f'script{i}.rpy',
                f'Content for script {i}',
                user_id
            )
        
        # Retrieve project scripts
        scripts = db_service.get_project_scripts(project_id)
        
        # Verify all scripts are returned
        assert len(scripts) == 3
        
        # Check script metadata
        for script in scripts:
            assert 'id' in script
            assert 'filename' in script
            assert 'updated_at' in script
    
    def test_editing_session_lifecycle(self, populated_db):
        """Test the full lifecycle of an editing session."""
        db_service = populated_db['db_service']
        project_id = populated_db['project_id']
        user_id = populated_db['user_id']
        user2_id = populated_db['user2_id']
        
        # Create a script
        script_id = db_service.save_script(
            project_id,
            'session_test.rpy',
            'label start:\n    "Test content"\n    return',
            user_id
        )
        
        # Create an editing session
        session_id = db_service.create_editing_session(script_id)
        
        # Add participants
        db_service.add_session_participant(session_id, user_id)
        db_service.add_session_participant(session_id, user2_id)
        
        # Verify session state
        with db_service._get_connection() as conn:
            cursor = conn.execute('SELECT * FROM sessions WHERE id = ?', (session_id,))
            session = cursor.fetchone()
            
            cursor = conn.execute('SELECT * FROM participants WHERE session_id = ?', (session_id,))
            participants = cursor.fetchall()
        
        assert session is not None
        assert session['script_id'] == script_id
        assert len(participants) == 2
        
        # End session for one participant
        db_service.end_session_for_participant(session_id, user2_id)
        
        # Verify partial session end
        with db_service._get_connection() as conn:
            cursor = conn.execute(
                'SELECT * FROM participants WHERE session_id = ? AND user_id = ?',
                (session_id, user2_id)
            )
            participant = cursor.fetchone()
        
        assert participant is not None
        assert participant['left_at'] is not None
        
        # End session for other participant should keep record for historical tracking
        db_service.end_session_for_participant(session_id, user_id)
        
        # Verify session still exists but participants are marked as left
        with db_service._get_connection() as conn:
            cursor = conn.execute('SELECT * FROM sessions WHERE id = ?', (session_id,))
            session = cursor.fetchone()
            
            cursor = conn.execute(
                'SELECT COUNT(*) as count FROM participants WHERE session_id = ? AND left_at IS NULL',
                (session_id,)
            )
            active_count = cursor.fetchone()['count']
        
        assert session is not None
        assert active_count == 0  # No active participants
    
    def test_track_script_edit(self, populated_db):
        """Test tracking script editing activity."""
        db_service = populated_db['db_service']
        project_id = populated_db['project_id']
        user_id = populated_db['user_id']
        
        # Create a script
        script_id = db_service.save_script(
            project_id,
            'tracking_test.rpy',
            'label start:\n    "Initial content"\n    return',
            user_id
        )
        
        # Track an edit action
        with patch('app.services.database.logger') as mock_logger:
            db_service.track_script_edit(
                script_id,
                user_id,
                'update',
                {'lines_added': 2, 'lines_removed': 1}
            )
            
            # Verify logging (actual DB tracking implementation may vary)
            mock_logger.info.assert_called_once()
            log_message = mock_logger.info.call_args[0][0]
            assert 'update' in log_message
            assert script_id in log_message
            assert user_id in log_message     
    
    def test_node_locks(self, populated_db):
        """Test creating and managing node locks for collaborative editing."""
        db_service = populated_db['db_service']
        project_id = populated_db['project_id']
        user_id = populated_db['user_id']
        user2_id = populated_db['user2_id']
    
        # Create a script and session
        script_id = db_service.save_script(
            project_id,
            'locks_test.rpy',
            'label start:\n    "Test content"\n    return',
            user_id
        )
        session_id = db_service.create_editing_session(script_id)
    
        # Add participants
        db_service.add_session_participant(session_id, user_id)
        db_service.add_session_participant(session_id, user2_id)
    
        # Create a node lock
        node_id = "node123"
        expiry = datetime.now() + timedelta(minutes=5)
    
        # Use the direct database connection since node_locks might not have a high-level method
        with db_service._get_connection() as conn:
            # Create lock for user1
            lock_id = str(uuid.uuid4())
            conn.execute(
                '''
                INSERT INTO node_locks (id, session_id, user_id, node_id, expires_at)
                VALUES (?, ?, ?, ?, ?)
                ''',
                (lock_id, session_id, user_id, node_id, expiry)
            )
    
            # Verify lock exists
            cursor = conn.execute(
                'SELECT * FROM node_locks WHERE node_id = ?',
                (node_id,)
            )
            lock = cursor.fetchone()
    
            assert lock is not None
            assert lock['session_id'] == session_id
            assert lock['user_id'] == user_id
    
            # Try to create a conflicting lock - should fail due to UNIQUE constraint
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(
                    '''
                    INSERT INTO node_locks (id, session_id, user_id, node_id, expires_at)
                    VALUES (?, ?, ?, ?, ?)
                    ''',
                    (str(uuid.uuid4()), session_id, user2_id, node_id, expiry)
                )
            
            # Try to create a lock for a different node - should succeed
            different_node_id = "node456"
            new_lock_id = str(uuid.uuid4())
            conn.execute(
                '''
                INSERT INTO node_locks (id, session_id, user_id, node_id, expires_at)
                VALUES (?, ?, ?, ?, ?)
                ''',
                (new_lock_id, session_id, user_id, different_node_id, expiry)
            )
            
            # Verify second lock exists
            cursor = conn.execute(
                'SELECT * FROM node_locks WHERE node_id = ?',
                (different_node_id,)
            )
            second_lock = cursor.fetchone()
            assert second_lock is not None
            assert second_lock['node_id'] == different_node_id
            
            # Remove locks
            conn.execute('DELETE FROM node_locks WHERE node_id = ?', (node_id,))
            conn.execute('DELETE FROM node_locks WHERE node_id = ?', (different_node_id,))
    
    def test_get_active_locks(self, populated_db):
        """Test retrieving active node locks for a session."""
        db_service = populated_db['db_service']
        project_id = populated_db['project_id']
        user_id = populated_db['user_id']
        
        # Create a script and session
        script_id = db_service.save_script(
            project_id,
            'active_locks_test.rpy',
            'label start:\n    "Test content"\n    return',
            user_id
        )
        session_id = db_service.create_editing_session(script_id)
        
        # Add participant
        db_service.add_session_participant(session_id, user_id)
        
        # Create a few node locks
        locks = []
        nodes = ["node1", "node2", "node3"]
        expiry = datetime.now() + timedelta(minutes=5)
        expiry_str = expiry.strftime('%Y-%m-%d %H:%M:%S.%f')
        
        with db_service._get_connection() as conn:
            for node_id in nodes:
                lock_id = str(uuid.uuid4())
                conn.execute(
                    '''
                    INSERT INTO node_locks (id, session_id, user_id, node_id, locked_at, expires_at)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
                    ''',
                    (lock_id, session_id, user_id, node_id, expiry_str)
                )
                locks.append(lock_id)
            
            # Create an expired lock - using string format for consistent datetime handling
            expired_lock_id = str(uuid.uuid4())
            expired_node = "expired_node"
            expired_time = datetime.now() - timedelta(minutes=5)
            expired_time_str = expired_time.strftime('%Y-%m-%d %H:%M:%S.%f')
            conn.execute(
                '''
                INSERT INTO node_locks (id, session_id, user_id, node_id, locked_at, expires_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
                ''',
                (expired_lock_id, session_id, user_id, expired_node, expired_time_str)
            )
            
            # Format the current time as a string in SQLite format (ISO8601)
            # This ensures proper datetime comparison in SQLite
            current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')
            
            # Get active locks for the session
            cursor = conn.execute(
                '''
                SELECT * FROM node_locks 
                WHERE session_id = ? AND expires_at > ?
                ''',
                (session_id, current_time)
            )
            active_locks = cursor.fetchall()
            
            # Verify only non-expired locks are returned
            assert len(active_locks) == 3
            db_node_ids = [lock['node_id'] for lock in active_locks]
            for node_id in nodes:
                assert node_id in db_node_ids
            assert expired_node not in db_node_ids
