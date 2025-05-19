import sqlite3
import uuid
import os
import logging
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timedelta
import time

DATABASE_PATH = os.environ.get('DATABASE_PATH', 'database/renpy_editor.db')
logger = logging.getLogger(__name__)

class SimpleCache:
    """Simple in-memory cache implementation."""
    
    def __init__(self, max_size=100):
        self.cache = {}
        self.max_size = max_size
    
    def get(self, key):
        """Get value from cache."""
        return self.cache.get(key)
    
    def set(self, key, value):
        """Set value in cache."""
        # Simple eviction policy: remove random item if cache is full
        if len(self.cache) >= self.max_size and key not in self.cache:
            # Remove a random key
            self.cache.pop(next(iter(self.cache)))
        self.cache[key] = value
    
    def delete(self, key):
        """Delete key from cache."""
        if key in self.cache:
            del self.cache[key]
    
    def clear(self):
        """Clear all cache entries."""
        self.cache.clear()

class ScriptCache:
    """
    Memory cache for script content to reduce database queries.
    Implements TTL-based expiration and max size constraints.
    """
    def __init__(self, max_size: int = 100, ttl_seconds: int = 300):
        """
        Initialize the cache with max size and time-to-live settings.
        
        Args:
            max_size: Maximum number of items to store in the cache
            ttl_seconds: Time to live for cache entries in seconds
        """
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._access_times: Dict[str, float] = {}
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
    
    def set(self, key: str, value: Any) -> None:
        """
        Set a value in the cache with the current timestamp.
        
        Args:
            key: Cache key
            value: Value to cache
        """
        # If cache is full, remove oldest item
        if len(self._cache) >= self.max_size and key not in self._cache:
            self._evict_oldest()
        
        # Store the value and update access time
        self._cache[key] = value
        self._access_times[key] = time.time()
    
    def get(self, key: str) -> Optional[Any]:
        """
        Get a value from the cache if it exists and hasn't expired.
        
        Args:
            key: Cache key to retrieve
            
        Returns:
            Cached value or None if not found or expired
        """
        if key not in self._cache:
            return None
        
        # Check if the entry has expired
        current_time = time.time()
        if current_time - self._access_times[key] > self.ttl_seconds:
            # Remove expired entry
            self.delete(key)
            return None
        
        # Update access time and return value
        self._access_times[key] = current_time
        return self._cache[key]
    
    def delete(self, key: str) -> None:
        """
        Delete an item from the cache.
        
        Args:
            key: Cache key to delete
        """
        if key in self._cache:
            del self._cache[key]
        
        if key in self._access_times:
            del self._access_times[key]
    
    def clear(self) -> None:
        """Clear all items from the cache."""
        self._cache.clear()
        self._access_times.clear()
    
    def _evict_oldest(self) -> None:
        """Remove the oldest item from the cache based on access time."""
        if not self._access_times:
            return
        
        # Find the key with the oldest access time
        oldest_key = min(self._access_times, key=self._access_times.get)
        self.delete(oldest_key)

class DatabaseService:
    """Service for interacting with the database."""
    
    def __init__(self):
        """Initialize the database service."""
        self.db_path = Path(os.environ.get('DATABASE_PATH', DATABASE_PATH))
        logger.info(f"Initializing database at {self.db_path}")
        
        self.db_path.parent.mkdir(exist_ok=True)
        self._initialize_database()
        self.script_cache = ScriptCache(max_size=50, ttl_seconds=600)
    
    def _initialize_database(self):
        """Create database schema if it doesn't exist."""
        try:
            # Check if the database file already has tables (for tests)
            tables = []
            if os.path.exists(self.db_path):
                try:
                    with sqlite3.connect(self.db_path) as conn:
                        cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
                        tables = [row[0] for row in cursor.fetchall()]
                        
                    logger.info(f"Found existing database with tables: {', '.join(tables)}")
                    if tables:  # If tables exist, we don't need to initialize again
                        return
                except Exception as e:
                    logger.warning(f"Error checking existing database: {e}")
            
            # Get the project root directory (two levels up from this file)
            project_root = Path(__file__).parent.parent.parent.parent
            schema_path = project_root / 'database' / 'schema.sql'
            
            # Try multiple paths to find the schema file
            schema_paths = [
                schema_path,  # Standard path
                Path(__file__).parent.parent.parent / 'database' / 'schema.sql',  # Backend folder
                Path.cwd() / 'database' / 'schema.sql',  # Current working directory
                Path(__file__).parent.parent.parent.parent / 'database' / 'schema.sql'  # Project root
            ]
            
            schema_content = None
            schema_used_path = None
            
            # Try each path until we find a valid schema file
            for path in schema_paths:
                logger.debug(f"Looking for schema at: {path}")
                if path.exists():
                    logger.info(f"Found schema file at {path}")
                    schema_used_path = path
                    with open(path, encoding='utf-8') as f:
                        schema_content = f.read()
                    break
                    
            # If no schema file was found, try an alternative path or raise an error
            if not schema_content:
                # Try looking for the schema in any subdirectory
                for root, dirs, files in os.walk(project_root):
                    for file in files:
                        if file == 'schema.sql':
                            alt_schema_path = os.path.join(root, file)
                            logger.info(f"Using alternative schema path: {alt_schema_path}")
                            schema_used_path = alt_schema_path
                            with open(alt_schema_path, encoding='utf-8') as f:
                                schema_content = f.read()
                                break
                    if schema_content:
                        break
                        
                if not schema_content:
                    # If still not found, raise an error
                    paths_str = "\n".join(str(p) for p in schema_paths)
                    error_msg = f"Schema file not found. Tried paths:\n{paths_str}"
                    logger.error(error_msg)
                    raise FileNotFoundError(error_msg)
            
            with sqlite3.connect(self.db_path) as conn:
                # Set foreign keys pragma
                conn.execute("PRAGMA foreign_keys = ON")
                
                # Read and execute the schema SQL
                logger.debug("Executing schema script")
                conn.executescript(schema_content)
                conn.commit()
                
                # Verify tables were created
                cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
                tables = [row[0] for row in cursor.fetchall()]
                logger.info(f"Tables created in database: {', '.join(tables)}")
                
                # Verify required tables exist
                required_tables = ["users", "projects", "scripts", "roles", "sessions", "participants", "node_locks"]
                missing_tables = [table for table in required_tables if table not in tables]
                if missing_tables:
                    raise RuntimeError(f"Failed to create required tables: {', '.join(missing_tables)}")
                
            logger.info(f"Database initialized successfully at {self.db_path}")
        except Exception as e:
            logger.error(f"Database initialization failed: {str(e)}")
            raise
    
    def _get_connection(self):
        """Get a new database connection with proper settings."""
        # Removed connection caching to prevent threading issues with TestClient
        connection = sqlite3.connect(self.db_path, isolation_level=None, check_same_thread=False) # Allow cross-thread usage for FastAPI TestClient context
        connection.row_factory = sqlite3.Row  # Return rows as dictionaries
        connection.execute("PRAGMA foreign_keys = ON") # Ensure foreign keys are enabled for each connection
        return connection
    
    def close(self):
        """Explicitly close any open database connections (if any were cached - now deprecated)."""
        # Connection caching is removed, so this method might be less critical,
        # but kept for potential future use or explicit cleanup needs.
        try:
            # Clear the script cache
            if hasattr(self, 'script_cache'):
                self.script_cache.clear()
        except Exception as e:
            print(f"Error during database service cleanup: {e}")
    
    def __del__(self):
        """Ensure cleanup on object garbage collection."""
        # No connection to close here anymore due to removal of caching
        pass
    
    def create_project(self, name: str, owner_id: str, description: str = None) -> str:
        """Create a new project and return its ID."""
        project_id = str(uuid.uuid4())
        try:
            # Handle None description by setting it to an empty string
            description = description or ""
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    'INSERT INTO projects (id, name, description, owner_id) VALUES (?, ?, ?, ?)',
                    (project_id, name, description, owner_id)
                )
            logger.info(f"Created project {name} with ID {project_id}")
            return project_id
        except Exception as e:
            logger.error(f"Failed to create project: {str(e)}")
            raise
    
    def save_script(self, project_id: str, filename: str, content: str, user_id: Optional[str] = None) -> str:
        """Save a script to the database and return its ID."""
        script_id = str(uuid.uuid4())
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('BEGIN TRANSACTION')
                try:
                    # Insert the script
                    conn.execute(
                        'INSERT INTO scripts (id, project_id, filename, content, last_edited_by) VALUES (?, ?, ?, ?, ?)',
                        (script_id, project_id, filename, content, user_id)
                    )
                    
                    # Create initial version if user_id is provided
                    if user_id:
                        version_id = str(uuid.uuid4())
                        conn.execute(
                            'INSERT INTO versions (id, script_id, content, created_by) VALUES (?, ?, ?, ?)',
                            (version_id, script_id, content, user_id)
                        )
                    
                    conn.execute('COMMIT')
                    # Update cache
                    self.script_cache.set(script_id, {
                        "id": script_id,
                        "project_id": project_id,
                        "filename": filename,
                        "content": content,
                        "content_lines": content.splitlines(),
                        "last_edited_by": user_id
                    })
                    logger.info(f"Saved script {filename} with ID {script_id}")
                    return script_id
                except Exception as e:
                    conn.execute('ROLLBACK')
                    raise
        except Exception as e:
            logger.error(f"Failed to save script: {str(e)}")
            raise
    
    def update_script(self, script_id: str, content: str, user_id: str) -> None:
        """Update script content and create a version entry."""
        # Invalidate cache for this script
        self.script_cache.delete(script_id)
        try:
            with sqlite3.connect(self.db_path) as conn:
                # Begin a transaction
                conn.execute('BEGIN TRANSACTION')
                try:
                    conn.execute(
                        'UPDATE scripts SET content = ?, updated_at = CURRENT_TIMESTAMP, last_edited_by = ? WHERE id = ?',
                        (content, user_id, script_id)
                    )
                    conn.execute(
                        'INSERT INTO versions (id, script_id, content, created_by) VALUES (?, ?, ?, ?)',
                        (str(uuid.uuid4()), script_id, content, user_id)
                    )
                    # Commit the transaction
                    conn.execute('COMMIT')
                    # Update cache if exists
                    cached_script = self.script_cache.get(script_id)
                    if cached_script:
                        cached_script.update({
                            "content": content,
                            "content_lines": content.splitlines(),
                            "last_edited_by": user_id
                        })
                        self.script_cache.set(script_id, cached_script)
                    logger.info(f"Updated script {script_id} by user {user_id}")
                except Exception as e:
                    # Rollback in case of error
                    conn.execute('ROLLBACK')
                    logger.error(f"Failed to update script (transaction rolled back): {str(e)}")
                    raise
        except Exception as e:
            logger.error(f"Database connection error: {str(e)}")
            raise
    
    def get_script(self, script_id: str) -> Optional[Dict[str, Any]]:
        """Get script details by ID with caching."""
        # Try to get from cache first
        cached_script = self.script_cache.get(script_id)
        if cached_script:
            return cached_script
            
        # If not in cache, get from database
        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    '''
                    SELECT id, project_id, filename, content, created_at, updated_at, last_edited_by
                    FROM scripts WHERE id = ?
                    ''',
                    (script_id,)
                )
                script = cursor.fetchone()
                if not script:
                    return None
                
                script_dict = dict(script)
                script_dict["content_lines"] = script_dict["content"].splitlines()
                
                # Add to cache
                self.script_cache.set(script_id, script_dict)
                return script_dict
        except Exception as e:
            logger.error(f"Failed to get script: {str(e)}")
            raise
    
    def delete_script(self, script_id: str) -> bool:
        """Delete a script and its versions."""
        # Invalidate cache
        self.script_cache.delete(script_id)
        try:
            with self._get_connection() as conn:
                conn.execute('BEGIN TRANSACTION')
                try:
                    # Delete versions first due to foreign key constraint
                    conn.execute('DELETE FROM versions WHERE script_id = ?', (script_id,))
                    result = conn.execute('DELETE FROM scripts WHERE id = ?', (script_id,))
                    deleted = result.rowcount > 0
                    conn.execute('COMMIT')
                    
                    # Remove from cache if exists
                    self.script_cache.delete(script_id)
                    
                    return deleted
                except Exception as e:
                    conn.execute('ROLLBACK')
                    raise
        except Exception as e:
            logger.error(f"Failed to delete script: {str(e)}")
            raise

    # TODO: Add methods for script searching and filtering - #issue/123
    def search_scripts(self, project_id: Optional[str] = None, query: Optional[str] = None, limit: int = 20) -> List[Dict]:
        """Search scripts by project and/or content keywords."""
        try:
            with self._get_connection() as conn:
                sql = """
                SELECT s.id, s.project_id, s.filename, s.updated_at, 
                       u.username as last_editor
                FROM scripts s
                LEFT JOIN users u ON s.last_edited_by = u.id
                WHERE 1=1
                """
                params = []
                
                if project_id:
                    sql += " AND s.project_id = ?"
                    params.append(project_id)
                
                if query:
                    sql += " AND (s.filename LIKE ? OR s.content LIKE ?)"
                    search = f"%{query}%"
                    params.extend([search, search])
                
                sql += " ORDER BY s.updated_at DESC LIMIT ?"
                params.append(limit)
                
                cursor = conn.execute(sql, params)
                return [dict(row) for row in cursor.fetchall()]
        except Exception as e:
            logger.error(f"Failed to search scripts: {str(e)}")
            raise

    # TODO: Add user management methods
    def create_user(self, username: str, email: str, password_hash: str) -> str:
        """Create a new user and return their ID."""
        user_id = str(uuid.uuid4())
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    'INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)',
                    (user_id, username, email, password_hash)
                )
            logger.info(f"Created user {username} with ID {user_id}")
            return user_id
        except sqlite3.IntegrityError:
            logger.error(f"Username or email already exists: {username}, {email}")
            raise ValueError("Username or email already exists")
        except Exception as e:
            logger.error(f"Failed to create user: {str(e)}")
            raise
    
    def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        """Fetches a user by their username."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT id, username, email, password_hash, created_at FROM users WHERE username = ?", (username,))
            user_data = cursor.fetchone()
            if user_data:
                return dict(user_data)  # sqlite3.Row can be directly converted to dict
            return None
        except sqlite3.Error as e:
            logger.error(f"Database error when fetching user by username '{username}': {e}", exc_info=True)
            return None
        finally:
            if conn:
                conn.close()

    def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user details by ID."""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    'SELECT id, username, email, password_hash, created_at FROM users WHERE id = ?',
                    (user_id,)
                )
                user = cursor.fetchone()
                if not user:
                    return None
                
                return dict(user)
        except Exception as e:
            logger.error(f"Failed to get user by ID: {str(e)}")
            raise
    
    def get_user_projects(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all projects accessible by a user."""
        try:
            with self._get_connection() as conn:
                # Get projects owned by user
                owned_cursor = conn.execute(
                    '''
                    SELECT p.id, p.name, p.description, p.created_at, p.updated_at, p.owner_id,
                           'Owner' as role
                    FROM projects p
                    WHERE p.owner_id = ?
                    ''',
                    (user_id,)
                )
                owned_projects = [dict(row) for row in owned_cursor.fetchall()]
                
                # Get projects shared with user
                shared_cursor = conn.execute(
                    '''
                    SELECT p.id, p.name, p.description, p.created_at, p.updated_at, p.owner_id,
                           r.name as role
                    FROM projects p
                    JOIN project_access pa ON p.id = pa.project_id
                    JOIN roles r ON pa.role_id = r.id
                    WHERE pa.user_id = ?
                    ''',
                    (user_id,)
                )
                shared_projects = [dict(row) for row in shared_cursor.fetchall()]
                
                # Combine and ensure uniqueness (a user could be owner and also have explicit access)
                all_projects_dict = {p["id"]: p for p in owned_projects}
                for p in shared_projects:
                    if p["id"] not in all_projects_dict:
                        all_projects_dict[p["id"]] = p
                    # Potentially update role if a more specific one is granted than just 'Owner'
                    # For now, owner role takes precedence if listed as owned.
                    # Or, if a user is an owner, their role is 'Owner' regardless of project_access entries.

                return list(all_projects_dict.values())
        except Exception as e:
            logger.error(f"Failed to get user projects: {str(e)}")
            raise
    
    def get_role_by_id(self, role_id: str) -> Optional[Dict[str, Any]]:
        """Get role details by role ID."""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    "SELECT id, name, description FROM roles WHERE id = ?",
                    (role_id,)
                )
                role = cursor.fetchone()
                return dict(role) if role else None
        except Exception as e:
            logger.error(f"Failed to get role by ID '{role_id}': {str(e)}")
            raise

    def get_role_by_name(self, role_name: str) -> Optional[Dict[str, Any]]:
        """Get role details by role name."""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    "SELECT id, name, description FROM roles WHERE name = ?",
                    (role_name,)
                )
                role = cursor.fetchone()
                return dict(role) if role else None
        except Exception as e:
            logger.error(f"Failed to get role by name '{role_name}': {str(e)}")
            raise
    
    def grant_project_access(self, project_id: str, user_id: str, role_id: str) -> bool:
        """Grant a user a specific role on a project."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            # Check if access already exists
            cursor.execute("SELECT role_id FROM project_access WHERE project_id = ? AND user_id = ?", (project_id, user_id))
            existing_access = cursor.fetchone()

            if existing_access:
                if existing_access["role_id"] == role_id:
                    logger.info(f"User {user_id} already has role {role_id} for project {project_id}. No change needed.")
                    return True
                else:
                    logger.info(f"Updating role for user {user_id} on project {project_id} from {existing_access['role_id']} to {role_id}")
                    cursor.execute("UPDATE project_access SET role_id = ? WHERE project_id = ? AND user_id = ?",
                                   (role_id, project_id, user_id))
            else:
                logger.info(f"Granting new role {role_id} to user {user_id} for project {project_id}")
                cursor.execute("INSERT INTO project_access (project_id, user_id, role_id) VALUES (?, ?, ?)",
                               (project_id, user_id, role_id))
            conn.commit()
            return True
        except sqlite3.IntegrityError as e:
            logger.error(f"Database integrity error granting access for project {project_id} to user {user_id} with role {role_id}: {e}", exc_info=True)
            conn.rollback()
            return False
        except sqlite3.Error as e:
            logger.error(f"Database error granting access for project {project_id} to user {user_id} with role {role_id}: {e}", exc_info=True)
            conn.rollback()
            return False
        finally:
            if conn:
                conn.close()
    
    def get_project_scripts(self, project_id: str) -> List[Dict[str, Any]]:
        """Get all scripts for a project."""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    '''
                    SELECT s.id, s.filename, s.created_at, s.updated_at,
                           u.username as last_editor
                    FROM scripts s
                    LEFT JOIN users u ON s.last_edited_by = u.id
                    WHERE s.project_id = ?
                    ORDER BY s.updated_at DESC
                    ''',
                    (project_id,)
                )
                return [dict(row) for row in cursor.fetchall()]
        except Exception as e:
            logger.error(f"Failed to get project scripts: {str(e)}")
            raise
    
    def get_project_details(self, project_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve project details by project ID.

        Args:
            project_id: The ID of the project to retrieve.

        Returns:
            A dictionary containing project details (id, name, description, owner_id, created_at, updated_at)
            or None if the project is not found.
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    "SELECT id, name, description, owner_id, created_at, updated_at FROM projects WHERE id = ?",
                    (project_id,)
                )
                row = cursor.fetchone()
                if row:
                    return {
                        "id": row[0],
                        "name": row[1],
                        "description": row[2],
                        "owner_id": row[3],
                        "created_at": row[4],
                        "updated_at": row[5]
                    }
                return None
        except sqlite3.Error as e:
            logger.error(f"Error fetching project details for project_id {project_id}: {e}", exc_info=True)
            return None

    def delete_project(self, project_id: str) -> bool:
        """
        Delete a project and all its associated data (scripts, versions, access).

        Args:
            project_id: The ID of the project to delete.

        Returns:
            True if the project was deleted, False otherwise.
        """
        try:
            with self._get_connection() as conn:
                conn.execute('BEGIN TRANSACTION')
                try:
                    # Get all script IDs for the project
                    cursor = conn.execute("SELECT id FROM scripts WHERE project_id = ?", (project_id,))
                    script_ids = [row[0] for row in cursor.fetchall()]

                    # Delete versions for each script
                    for script_id in script_ids:
                        conn.execute("DELETE FROM versions WHERE script_id = ?", (script_id,))
                        # Invalidate script cache
                        self.script_cache.delete(script_id)
                    
                    # Delete scripts
                    conn.execute("DELETE FROM scripts WHERE project_id = ?", (project_id,))
                    
                    # Delete project access records
                    conn.execute("DELETE FROM project_access WHERE project_id = ?", (project_id,))
                    
                    # Delete the project itself
                    result = conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
                    
                    conn.execute('COMMIT')
                    
                    deleted = result.rowcount > 0
                    if deleted:
                        logger.info(f"Successfully deleted project {project_id} and all associated data.")
                    else:
                        logger.warning(f"Project {project_id} not found for deletion or already deleted.")
                    return deleted
                except Exception as e:
                    conn.execute('ROLLBACK')
                    logger.error(f"Failed to delete project {project_id} (transaction rolled back): {str(e)}", exc_info=True)
                    raise
        except sqlite3.Error as e:
            logger.error(f"Database connection error during project deletion for {project_id}: {str(e)}", exc_info=True)
            raise

    # Editing session methods
    def create_editing_session(self, script_id: str) -> str:
        """Create a new editing session and return its ID."""
        session_id = str(uuid.uuid4())
        try:
            with self._get_connection() as conn:
                conn.execute(
                    'INSERT INTO sessions (id, script_id) VALUES (?, ?)',
                    (session_id, script_id)
                )
                return session_id
        except Exception as e:
            logger.error(f"Failed to create editing session: {str(e)}")
            raise
    
    def add_session_participant(self, session_id: str, user_id: str) -> None:
        """Add a participant to an editing session."""
        try:
            with self._get_connection() as conn:
                conn.execute(
                    'INSERT INTO participants (session_id, user_id) VALUES (?, ?)',
                    (session_id, user_id)
                )
        except Exception as e:
            logger.error(f"Failed to add session participant: {str(e)}")
            raise
    
    def end_session_for_participant(self, session_id: str, user_id: str) -> None:
        """End a participant's session by setting left_at time."""
        try:
            with self._get_connection() as conn:
                conn.execute(
                    '''
                    UPDATE participants 
                    SET left_at = CURRENT_TIMESTAMP
                    WHERE session_id = ? AND user_id = ? AND left_at IS NULL
                    ''',
                    (session_id, user_id)
                )
        except Exception as e:
            logger.error(f"Failed to end session for participant: {str(e)}")
            raise
    
    def get_active_locks(self, session_id: str) -> List[Dict[str, Any]]:
        """Get all active locks for a session."""
        # Format the current time as a string in SQLite format (ISO8601)
        # This ensures proper datetime comparison in SQLite
        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')
        
        with self._get_connection() as conn:
            cursor = conn.execute(
                '''
                SELECT * FROM node_locks
                WHERE session_id = ? AND expires_at > ?
                ''',
                (session_id, current_time)
            )
            return [dict(row) for row in cursor.fetchall()]
    
    def get_active_project_users(self, project_id: str) -> List[Dict[str, Any]]:
        """Get users currently active in a project."""
        try:
            with self._get_connection() as conn:
                # Get users with access to this project
                cursor = conn.execute(
                    '''
                    SELECT u.id, u.username, pa.role_id as role
                    FROM users u
                    JOIN project_access pa ON u.id = pa.user_id
                    WHERE pa.project_id = ?
                    ''',
                    (project_id,)
                )
                return [dict(row) for row in cursor.fetchall()]
        except Exception as e:
            logger.error(f"Failed to get active project users: {str(e)}")
            return []  # Return empty list on error to ensure API doesn't completely fail

    # TODO: Add usage statistics tracking methods - #issue/130
    def track_script_edit(self, script_id: str, user_id: str, action_type: str, metadata: Optional[Dict] = None) -> None:
        """Track a script editing action for analytics."""
        # This method would typically insert into a usage_logs or analytics table
        # For now, we'll just log it
        logger.info(f"Usage tracking: User {user_id} performed {action_type} on script {script_id}")
        # TODO: Implement actual database tracking when analytics schema is added
