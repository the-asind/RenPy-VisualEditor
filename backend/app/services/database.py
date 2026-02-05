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
            
            # Initialize database with schema
            with sqlite3.connect(self.db_path) as conn:
                conn.executescript(schema_content)
                logger.info("Database initialized successfully.")
                
        except Exception as e:
            logger.error(f"Database initialization failed: {str(e)}")
            raise

    def _get_connection(self):
        """Get a database connection."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    # User methods
    def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        """Get user by username."""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    "SELECT * FROM users WHERE username = ?",
                    (username,)
                )
                row = cursor.fetchone()
                if row:
                    return dict(row)
                return None
        except Exception as e:
            logger.error(f"Failed to get user by username: {str(e)}")
            raise

    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Get user by email."""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    "SELECT * FROM users WHERE email = ?",
                    (email,)
                )
                row = cursor.fetchone()
                if row:
                    return dict(row)
                return None
        except Exception as e:
            logger.error(f"Failed to get user by email: {str(e)}")
            raise

    def create_user(self, username: str, email: str, password_hash: str) -> str:
        """Create a new user."""
        user_id = str(uuid.uuid4())
        try:
            with self._get_connection() as conn:
                conn.execute(
                    "INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)",
                    (user_id, username, email, password_hash)
                )
                return user_id
        except sqlite3.IntegrityError:
            # Check if it was username or email constraint
            existing_username = self.get_user_by_username(username)
            if existing_username:
                raise ValueError("Username already exists")
            raise ValueError("Email already exists")
        except Exception as e:
            logger.error(f"Failed to create user: {str(e)}")
            raise

    # Project methods
    def create_project(self, name: str, description: str, owner_id: str) -> str:
        """Create a new project."""
        project_id = str(uuid.uuid4())
        try:
            with self._get_connection() as conn:
                conn.execute(
                    "INSERT INTO projects (id, name, description, owner_id) VALUES (?, ?, ?, ?)",
                    (project_id, name, description, owner_id)
                )
                # Add owner access
                conn.execute(
                    "INSERT INTO project_access (project_id, user_id, role_id) VALUES (?, ?, ?)",
                    (project_id, owner_id, 'role_owner')
                )
                return project_id
        except Exception as e:
            logger.error(f"Failed to create project: {str(e)}")
            raise

    def get_user_projects(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all projects accessible to a user."""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    '''
                    SELECT p.*, r.name as role, r.id as role_id
                    FROM projects p
                    JOIN project_access pa ON p.id = pa.project_id
                    JOIN roles r ON pa.role_id = r.id
                    WHERE pa.user_id = ?
                    ''',
                    (user_id,)
                )
                return [dict(row) for row in cursor.fetchall()]
        except Exception as e:
            logger.error(f"Failed to get user projects: {str(e)}")
            raise

    # Script methods
    def get_script(self, script_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a script by ID.
        Uses caching to improve performance for frequently accessed scripts.
        """
        # Try to get from cache first
        cached_script = self.script_cache.get(script_id)
        if cached_script:
            return cached_script
            
        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    "SELECT * FROM scripts WHERE id = ?",
                    (script_id,)
                )
                row = cursor.fetchone()
                if row:
                    script_data = dict(row)
                    # Convert content to lines for easier processing if needed
                    # But store raw content in cache
                    if "content" in script_data:
                        script_data["content_lines"] = script_data["content"].splitlines()

                    # Cache the result
                    self.script_cache.set(script_id, script_data)
                    return script_data
                return None
        except Exception as e:
            logger.error(f"Failed to get script: {str(e)}")
            raise

    def update_script(self, script_id: str, content: str, user_id: str) -> None:
        """
        Update script content and create a new version.
        Invalidates the cache for this script.
        """
        try:
            with self._get_connection() as conn:
                # Update script content
                conn.execute(
                    '''
                    UPDATE scripts
                    SET content = ?, last_edited_by = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    ''',
                    (content, user_id, script_id)
                )
                
                # Create new version
                # Check if message column exists in versions table (it was missing in schema.sql but referenced in code)
                # For compatibility with schema.sql which doesn't have 'message', we omit it if not needed
                # Or check schema.sql content. It doesn't have message.
                # So we should remove message from insert query.
                conn.execute(
                    '''
                    INSERT INTO versions (id, script_id, content, created_by)
                    VALUES (?, ?, ?, ?)
                    ''',
                    (str(uuid.uuid4()), script_id, content, user_id)
                )

            # Invalidate cache
            self.script_cache.delete(script_id)

        except Exception as e:
            logger.error(f"Failed to update script: {str(e)}")
            raise

    def search_scripts(self, project_id: Optional[str] = None, query: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
        """Search for scripts."""
        try:
            sql = "SELECT id, project_id, filename, updated_at FROM scripts"
            params = []
            conditions = []

            if project_id:
                conditions.append("project_id = ?")
                params.append(project_id)

            if query:
                conditions.append("(filename LIKE ? OR content LIKE ?)")
                params.append(f"%{query}%")
                params.append(f"%{query}%")

            if conditions:
                sql += " WHERE " + " AND ".join(conditions)

            sql += " ORDER BY updated_at DESC LIMIT ?"
            params.append(limit)

            with self._get_connection() as conn:
                cursor = conn.execute(sql, params)
                return [dict(row) for row in cursor.fetchall()]
        except Exception as e:
            logger.error(f"Failed to search scripts: {str(e)}")
            raise

    # Collaboration methods
    def acquire_node_lock(self, script_id: str, node_id: str, user_id: str, session_id: str, duration_seconds: int = 300) -> bool:
        """
        Acquire a lock on a node for editing.

        Args:
            script_id: The ID of the script containing the node
            node_id: The ID of the node to lock
            user_id: The ID of the user requesting the lock
            session_id: The editing session ID
            duration_seconds: How long the lock should be valid (default 5 minutes)

        Returns:
            True if lock acquired, False if already locked by someone else
        """
        expires_at = datetime.now() + timedelta(seconds=duration_seconds)

        try:
            with self._get_connection() as conn:
                conn.execute("BEGIN TRANSACTION")

                # Check for existing valid lock
                cursor = conn.execute(
                    '''
                    SELECT user_id, expires_at FROM node_locks
                    WHERE session_id = ? AND node_id = ?
                    ''',
                    (session_id, node_id)
                )
                existing_lock = cursor.fetchone()

                if existing_lock:
                    lock_user = existing_lock[0]
                    lock_expiry = datetime.fromisoformat(existing_lock[1]) if isinstance(existing_lock[1], str) else existing_lock[1]

                    # If locked by another user and not expired
                    if lock_user != user_id and lock_expiry > datetime.now():
                        conn.rollback()
                        return False

                    # If locked by same user or expired, update it
                    conn.execute(
                        '''
                        UPDATE node_locks
                        SET user_id = ?, expires_at = ?, locked_at = CURRENT_TIMESTAMP
                        WHERE session_id = ? AND node_id = ?
                        ''',
                        (user_id, expires_at, session_id, node_id)
                    )
                else:
                    # Create new lock
                    conn.execute(
                        '''
                        INSERT INTO node_locks (id, session_id, user_id, node_id, expires_at)
                        VALUES (?, ?, ?, ?, ?)
                        ''',
                        (str(uuid.uuid4()), session_id, user_id, node_id, expires_at)
                    )
                
                conn.commit()
                return True
        except Exception as e:
            logger.error(f"Failed to acquire lock: {str(e)}")
            return False

    def release_node_lock(self, script_id: str, node_id: str, user_id: str) -> bool:
        """Release a lock on a node."""
        try:
            with self._get_connection() as conn:
                # We need to find the lock first to verify ownership
                # Note: Schema uses session_id, but here we query by script_id logic?
                # The node_locks table has session_id, not script_id directly.
                # Assuming caller provides enough info or we look up session.
                # Actually, node_locks is (node_id, session_id) unique.
                # But we might have multiple sessions for a script?
                # Typically one session per script per implementation?
                # Let's assume we delete by node_id and user_id across any session for now,
                # or we need session_id passed in.
                # The previous implementation passed script_id which implies looking up sessions?
                # Let's just try to delete where node_id and user_id matches.
                
                conn.execute(
                    '''
                    DELETE FROM node_locks
                    WHERE node_id = ? AND user_id = ?
                    ''',
                    (node_id, user_id)
                )
                return True
        except Exception as e:
            logger.error(f"Failed to release lock: {str(e)}")
            return False

    def check_node_lock(self, script_id: str, node_id: str) -> Optional[str]:
        """
        Check if a node is locked and return the user_id if it is.
        Returns None if not locked or lock expired.
        """
        try:
            with self._get_connection() as conn:
                # Need to join with sessions to filter by script_id if needed,
                # or just check all locks for this node_id
                cursor = conn.execute(
                    '''
                    SELECT user_id, expires_at FROM node_locks
                    WHERE node_id = ?
                    ''',
                    (node_id,)
                )
                rows = cursor.fetchall()

                current_time = datetime.now()
                for row in rows:
                    expiry = row[1]
                    if isinstance(expiry, str):
                        expiry = datetime.fromisoformat(expiry)

                    if expiry > current_time:
                        return row[0]

                return None
        except Exception as e:
            logger.error(f"Failed to check lock: {str(e)}")
            return None

    def refresh_node_lock(self, script_id: str, node_id: str, user_id: str, duration_seconds: int = 300) -> bool:
        """Refresh an existing lock."""
        expires_at = datetime.now() + timedelta(seconds=duration_seconds)
        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    '''
                    UPDATE node_locks
                    SET expires_at = ?
                    WHERE node_id = ? AND user_id = ?
                    ''',
                    (expires_at, node_id, user_id)
                )
                return cursor.rowcount > 0
        except Exception as e:
            logger.error(f"Failed to refresh lock: {str(e)}")
            return False

    def grant_project_access(self, project_id: str, user_id: str, role_id: str) -> bool:
        """Grant a user access to a project with a specific role."""
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

    def create_script(self, project_id: str, filename: str, content: str, user_id: str) -> str:
        """
        Create a new script in the database.

        Args:
            project_id: The ID of the project.
            filename: The name of the script file.
            content: The initial content of the script.
            user_id: The ID of the user creating the script.

        Returns:
            The ID of the newly created script.
        """
        script_id = str(uuid.uuid4())
        try:
            with self._get_connection() as conn:
                conn.execute(
                    '''
                    INSERT INTO scripts (id, project_id, filename, content, last_edited_by)
                    VALUES (?, ?, ?, ?, ?)
                    ''',
                    (script_id, project_id, filename, content, user_id)
                )

                # Create initial version
                # Removed 'message' column to match schema.sql
                conn.execute(
                    '''
                    INSERT INTO versions (id, script_id, content, created_by)
                    VALUES (?, ?, ?, ?)
                    ''',
                    (str(uuid.uuid4()), script_id, content, user_id)
                )

                return script_id
        except Exception as e:
            logger.error(f"Failed to create script: {str(e)}")
            raise

    def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user by ID."""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    "SELECT * FROM users WHERE id = ?",
                    (user_id,)
                )
                row = cursor.fetchone()
                if row:
                    return dict(row)
                return None
        except Exception as e:
            logger.error(f"Failed to get user by id: {str(e)}")
            raise
