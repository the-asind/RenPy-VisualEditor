import pytest
from jose import jwt
import time
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from app.services.auth import AuthService

class TestAuthService:
    """Test suite for AuthService."""
    
    @pytest.fixture
    def mock_db_service(self):
        """Create a mock database service."""
        db_service = MagicMock()
        return db_service
    
    @pytest.fixture
    def auth_service(self, mock_db_service):
        """Create an instance of AuthService with mocked DB."""
        return AuthService(mock_db_service)
    
    def test_password_hashing(self, auth_service):
        """Test that password hashing and verification work correctly."""
        password = "test_password"
        
        # Hash the password
        hashed = auth_service.get_password_hash(password)
        
        # Password hash should be different from original
        assert hashed != password
        
        # Verify password should succeed with correct password
        assert auth_service.verify_password(password, hashed) is True
        
        # Verify password should fail with incorrect password
        assert auth_service.verify_password("wrong_password", hashed) is False
    
    def test_authenticate_user_success(self, auth_service, mock_db_service):
        """Test successful user authentication."""
        username = "testuser"
        password = "password123"
        
        # Create a password hash
        hashed_password = auth_service.get_password_hash(password)
        
        # Configure mock to return a valid user
        mock_db_service.get_user_by_username.return_value = {
            "id": "user_id_123",
            "username": username,
            "email": "test@example.com",
            "password_hash": hashed_password
        }
        
        # Authenticate should succeed
        user = auth_service.authenticate_user(username, password)
        
        # Verify user was returned
        assert user is not None
        assert user["id"] == "user_id_123"
        assert user["username"] == username
    
    def test_authenticate_user_failure(self, auth_service, mock_db_service):
        """Test authentication failures."""
        # Test user not found
        mock_db_service.get_user_by_username.return_value = None
        assert auth_service.authenticate_user("nonexistent", "password123") is None
        
        # Test incorrect password
        hashed_password = auth_service.get_password_hash("real_password")
        mock_db_service.get_user_by_username.return_value = {
            "id": "user_id_123",
            "username": "testuser",
            "password_hash": hashed_password
        }
        
        assert auth_service.authenticate_user("testuser", "wrong_password") is None
    
    def test_create_access_token(self, auth_service):
        """Test JWT token creation."""
        # Data to encode
        data = {"sub": "user_id_123", "username": "testuser"}
        
        # Create token with default expiry
        token = auth_service.create_access_token(data)
        
        # Token should be a non-empty string
        assert isinstance(token, str)
        assert len(token) > 0
        
        # Create token with custom expiry
        token = auth_service.create_access_token(
            data, 
            expires_delta=timedelta(minutes=5)
        )
        
        # Decode token to verify contents (using the library directly)
        from app.services.auth import SECRET_KEY, ALGORITHM
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # Check required data is present
        assert payload["sub"] == "user_id_123"
        assert payload["username"] == "testuser"
        assert "exp" in payload  # Expiry time
    
    def test_decode_token(self, auth_service):
        """Test JWT token decoding."""
        # Create a token
        data = {"sub": "user_id_123", "username": "testuser"}
        token = auth_service.create_access_token(data)
        
        # Decode token
        payload = auth_service.decode_token(token)
        
        # Verify payload
        assert payload is not None
        assert payload["sub"] == "user_id_123"
        assert payload["username"] == "testuser"
    
    def test_decode_invalid_token(self, auth_service):
        """Test decoding invalid tokens returns None."""
        # Invalid token
        assert auth_service.decode_token("invalid.token.string") is None
        
        # Expired token
        data = {"sub": "user_id_123"}
        from app.services.auth import SECRET_KEY, ALGORITHM
        expired_payload = {
            **data,
            "exp": datetime.utcnow() - timedelta(minutes=5)  # Set expiry in the past
        }
        expired_token = jwt.encode(expired_payload, SECRET_KEY, algorithm=ALGORITHM)
        
        assert auth_service.decode_token(expired_token) is None
    
    def test_register_user(self, auth_service, mock_db_service):
        """Test user registration."""
        username = "newuser"
        email = "newuser@example.com"
        password = "Password123!"
        
        # Mock database service to return a new user ID
        mock_db_service.create_user.return_value = "new_user_id_456"
        
        # Register user
        user_id = auth_service.register_user(username, email, password)
        
        # Verify user was created
        assert user_id == "new_user_id_456"
        
        # Verify create_user was called with correct parameters
        mock_db_service.create_user.assert_called_once()
        call_args = mock_db_service.create_user.call_args[0]
        assert call_args[0] == username
        assert call_args[1] == email
        # Password should be hashed
        assert call_args[2] != password
        
    def test_register_user_existing_username(self, auth_service, mock_db_service):
        """Test handling of registration with an existing username."""
        # Mock database service to raise an error for duplicate username
        mock_db_service.create_user.side_effect = ValueError("Username or email already exists")
        
        # Attempt to register with existing username should raise ValueError
        with pytest.raises(ValueError):
            auth_service.register_user("existinguser", "new@example.com", "password123")
    
    def test_get_user_info(self, auth_service, mock_db_service):
        """Test retrieving user information."""
        user_id = "user_id_123"
        expected_user = {
            "id": user_id,
            "username": "testuser",
            "email": "test@example.com",
            "created_at": datetime.now().isoformat()
        }
        
        # Configure mock to return a valid user
        mock_db_service.get_user_by_id.return_value = expected_user
        
        # Get user info
        user = auth_service.get_user_info(user_id)
        
        # Verify user info was returned
        assert user == expected_user
        mock_db_service.get_user_by_id.assert_called_once_with(user_id)
    
    def test_get_nonexistent_user_info(self, auth_service, mock_db_service):
        """Test retrieving information for a non-existent user."""
        mock_db_service.get_user_by_id.return_value = None
        
        # Get non-existent user info should return None
        assert auth_service.get_user_info("nonexistent_id") is None
    
    def test_check_project_access(self, auth_service, mock_db_service):
        """Test checking if a user has access to a project."""
        user_id = "user_id_123"
        project_id = "project_id_456"
        
        # Mock user projects query to include the test project with 'Owner' role
        mock_db_service.get_user_projects.return_value = [
            {"id": project_id, "role": "Owner"},
            {"id": "other_project", "role": "Editor"}
        ]
        
        # Check access - should return True for owner
        has_access = auth_service.check_project_access(user_id, project_id)
        assert has_access is True
        
        # Check with required role that matches
        has_owner_access = auth_service.check_project_access(user_id, project_id, required_role="Owner")
        assert has_owner_access is True
        
        # Check with required role that doesn't match
        mock_db_service.get_user_projects.return_value = [
            {"id": project_id, "role": "Editor"},
        ]
        has_owner_access = auth_service.check_project_access(user_id, project_id, required_role="Owner")
        assert has_owner_access is False
    
    def test_check_project_access_no_access(self, auth_service, mock_db_service):
        """Test checking access for a project the user doesn't have access to."""
        user_id = "user_id_123"
        project_id = "project_id_456"
        
        # Mock user projects query to not include the test project
        mock_db_service.get_user_projects.return_value = [
            {"id": "other_project", "role": "Editor"}
        ]
        
        # Check access - should return False
        has_access = auth_service.check_project_access(user_id, project_id)
        assert has_access is False
    
    def test_get_user_roles(self, auth_service, mock_db_service):
        """Test retrieving user roles."""
        user_id = "user_id_123"
        expected_roles = ["Admin", "Editor"]
        
        # Configure mock to return roles
        mock_db_service.get_user_roles.return_value = expected_roles
        
        # Get user roles
        roles = auth_service.get_user_roles(user_id)
        
        # Verify roles were returned
        assert roles == expected_roles
        mock_db_service.get_user_roles.assert_called_once_with(user_id)
    
    def test_check_role_permission(self, auth_service):
        """Test checking if a role has sufficient permission level."""
        # Define role hierarchy (higher index = higher permission)
        hierarchy = ["Viewer", "Editor", "Owner", "Admin"]
        auth_service.role_hierarchy = hierarchy
        
        # Same role should have sufficient permission
        assert auth_service.check_role_permission("Editor", "Editor") is True
        
        # Higher role should have sufficient permission
        assert auth_service.check_role_permission("Owner", "Editor") is True
        assert auth_service.check_role_permission("Admin", "Viewer") is True
        
        # Lower role should not have sufficient permission
        assert auth_service.check_role_permission("Viewer", "Editor") is False
        assert auth_service.check_role_permission("Editor", "Owner") is False
    
    def test_create_session_token(self, auth_service):
        """Test creating a session token with short expiry for real-time collaboration."""
        user_id = "user_id_123"
        script_id = "script_id_456"
        
        # Create session token
        token = auth_service.create_session_token(user_id, script_id)
        
        # Decode and verify token
        from app.services.auth import SECRET_KEY, ALGORITHM
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # Check session-specific data
        assert payload["sub"] == user_id
        assert payload["script_id"] == script_id
        assert "exp" in payload
        
        # Session token should have shorter expiry than regular token
        # Calculate remaining time
        expiry_time = datetime.fromtimestamp(payload["exp"])
        time_left = expiry_time - datetime.utcnow()
        
        # Should be less than the default token expiry but more than 10 minutes
        assert time_left < timedelta(days=1)  # Less than default
        assert time_left > timedelta(minutes=10)  # Enough for a collaboration session
    
    def test_validate_session_token(self, auth_service):
        """Test validating a session token for real-time access."""
        user_id = "user_id_123"
        script_id = "script_id_456"
        
        # Create session token
        token = auth_service.create_session_token(user_id, script_id)
        
        # Validate token for the same script
        result = auth_service.validate_session_token(token, script_id)
        assert result == user_id
        
        # Validate token for a different script (should fail)
        wrong_script_result = auth_service.validate_session_token(token, "different_script")
        assert wrong_script_result is None
    
    def test_validate_expired_session_token(self, auth_service):
        """Test that expired session tokens are invalidated."""
        user_id = "user_id_123"
        script_id = "script_id_456"
        
        # Create and modify a token with immediate expiry
        data = {"sub": user_id, "script_id": script_id}
        from app.services.auth import SECRET_KEY, ALGORITHM
        expired_payload = {
            **data,
            "exp": datetime.utcnow() - timedelta(seconds=1)  # Set expiry in the past
        }
        expired_token = jwt.encode(expired_payload, SECRET_KEY, algorithm=ALGORITHM)
        
        # Validate expired token (should fail)
        result = auth_service.validate_session_token(expired_token, script_id)
        assert result is None
    
    def test_refresh_session_token(self, auth_service):
        """Test refreshing a session token to extend its validity."""
        user_id = "user_id_123"
        script_id = "script_id_456"
        
        # Create initial token
        initial_token = auth_service.create_session_token(user_id, script_id)
        initial_payload = auth_service.decode_token(initial_token)
        initial_expiry = initial_payload["exp"]
        
        # Allow a small delay to ensure timestamps are different
        time.sleep(1)
        
        # Refresh token
        refreshed_token = auth_service.refresh_session_token(initial_token)
        refreshed_payload = auth_service.decode_token(refreshed_token)
        refreshed_expiry = refreshed_payload["exp"]
        
        # Verify refreshed token has later expiry
        assert refreshed_expiry > initial_expiry
        
        # Verify other details remain the same
        assert refreshed_payload["sub"] == initial_payload["sub"]
        assert refreshed_payload["script_id"] == initial_payload["script_id"]
