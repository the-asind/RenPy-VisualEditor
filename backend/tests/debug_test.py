import os
import pytest
import sqlite3
import uuid
from app.services.database import DatabaseService

def test_debug_db():
    """Debug test to examine database state"""
    # Create a unique database file
    db_path = f"debug_temp_{uuid.uuid4().hex}.db"
    os.environ['DATABASE_PATH'] = db_path
    
    try:
        # Create database service
        db = DatabaseService()
        
        # Check tables
        with db._get_connection() as conn:
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            print(f"Tables in database: {tables}")
            
            # Check if any users exist
            if 'users' in tables:
                cursor = conn.execute("SELECT id, username, email FROM users")
                users = [dict(row) for row in cursor.fetchall()]
                print(f"Users in database: {users}")
    finally:
        # Clean up
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except:
                print(f"Could not remove {db_path}")
