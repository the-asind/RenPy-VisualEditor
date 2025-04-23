import os
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from passlib.context import CryptContext
from jose import JWTError, jwt

logger = logging.getLogger(__name__)

# JWT Configuration
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "YOUR_SUPER_SECRET_KEY_CHANGE_IN_PRODUCTION")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class AuthService:
    """Authentication service for user authentication and JWT handling."""
    
    def __init__(self, db_service):
        self.db_service = db_service
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify that a plain password matches a hashed password."""
        return pwd_context.verify(plain_password, hashed_password)
    
    def get_password_hash(self, password: str) -> str:
        """Hash a password for storage."""
        return pwd_context.hash(password)
    
    def authenticate_user(self, username: str, password: str) -> Optional[Dict[str, Any]]:
        """Authenticate a user by username and password."""
        try:
            user = self.db_service.get_user_by_username(username)
            if not user:
                return None
            if not self.verify_password(password, user["password_hash"]):
                return None
            return user
        except Exception as e:
            logger.error(f"Authentication error: {str(e)}")
            return None
    
    def create_access_token(self, data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
        """Create a JWT access token."""
        to_encode = data.copy()
        
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
            
        to_encode.update({"exp": expire})
        
        try:
            encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
            return encoded_jwt
        except Exception as e:
            logger.error(f"Token creation error: {str(e)}")
            raise
    
    def decode_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Decode and verify a JWT token."""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return payload
        except JWTError as e:
            logger.error(f"Token validation error: {str(e)}")
            return None

    def register_user(self, username: str, email: str, password: str) -> str:
        """Register a new user by hashing password and storing in DB."""
        hashed = self.get_password_hash(password)
        return self.db_service.create_user(username, email, hashed)

    def get_user_info(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve user information by user ID."""
        return self.db_service.get_user_by_id(user_id)

    def check_project_access(self, user_id: str, project_id: str, required_role: Optional[str] = None) -> bool:
        """Check if a user has access to a project, optionally with a required role."""
        projects = self.db_service.get_user_projects(user_id)
        for proj in projects:
            if proj.get('id') == project_id:
                if not required_role or proj.get('role') == required_role:
                    return True
        return False

    def get_user_roles(self, user_id: str) -> List[str]:
        """Get roles assigned to a user."""
        return self.db_service.get_user_roles(user_id)

    def check_role_permission(self, role: str, required_role: str) -> bool:
        """Check if a role has sufficient permission based on hierarchy."""
        if not hasattr(self, 'role_hierarchy'):
            return False
        try:
            return self.role_hierarchy.index(role) >= self.role_hierarchy.index(required_role)
        except ValueError:
            return False

    def create_session_token(self, user_id: str, script_id: str) -> str:
        """Create a session token for real-time collaboration."""
        data = {"sub": user_id, "script_id": script_id}
        return self.create_access_token(data)

    def validate_session_token(self, token: str, script_id: str) -> Optional[str]:
        """Validate a session token and ensure it matches the script."""
        payload = self.decode_token(token)
        if not payload:
            return None
        if payload.get('script_id') != script_id:
            return None
        return payload.get('sub')

    def refresh_session_token(self, token: str) -> str:
        """Refresh a session token to extend its validity."""
        payload = self.decode_token(token)
        user_id = payload.get('sub')
        script_id = payload.get('script_id')
        return self.create_session_token(user_id, script_id)
