import json
import os
import urllib.parse
import urllib.request

from fastapi import APIRouter, Depends, Form, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from typing import Dict, Any, Optional
from pydantic import BaseModel, EmailStr, Field
from starlette.concurrency import run_in_threadpool

from ...services.database import DatabaseService
from ...services.auth import AuthService

# Create router
auth_router = APIRouter(
    prefix="/auth",
    tags=["authentication"],
    responses={401: {"description": "Unauthorized"}},
)

# Initialize services
db_service = DatabaseService()
auth_service = AuthService(db_service)

# OAuth2 scheme for token authentication
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

# Models for API requests/responses
class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8)
    recaptcha_token: Optional[str] = None

class UserUpdate(BaseModel):
    username: Optional[str] = Field(default=None, min_length=3, max_length=50)
    email: Optional[EmailStr] = None

class Token(BaseModel):
    access_token: str
    token_type: str

class SessionTokenCreate(BaseModel):
    project_id: str = Field(..., min_length=1)

class UserResponse(BaseModel):
    id: str
    username: str
    email: str

def verify_recaptcha_token(recaptcha_token: Optional[str]) -> None:
    """Verify Google reCAPTCHA v2 when RECAPTCHA_SECRET_KEY is configured."""
    secret_key = os.environ.get("RECAPTCHA_SECRET_KEY")
    if not secret_key:
        return

    if not recaptcha_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="reCAPTCHA verification is required",
        )

    request_body = urllib.parse.urlencode(
        {"secret": secret_key, "response": recaptcha_token}
    ).encode("utf-8")
    request = urllib.request.Request(
        "https://www.google.com/recaptcha/api/siteverify",
        data=request_body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"reCAPTCHA verification failed: {str(e)}",
        )

    if not payload.get("success"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="reCAPTCHA verification failed",
        )

# Dependency to get current user
async def get_current_user(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
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
    
    user = db_service.get_user_by_id(user_id)
    if user is None:
        raise credentials_exception
    
    return user

# Routes
@auth_router.post("/register", response_model=UserResponse)
async def register_user(user_data: UserCreate) -> Dict[str, Any]:
    """
    Register a new user.
    
    Args:
        user_data: User registration details
        
    Returns:
        Newly created user information
    """
    try:
        await run_in_threadpool(verify_recaptcha_token, user_data.recaptcha_token)

        # Hash the password
        hashed_password = await run_in_threadpool(auth_service.get_password_hash, user_data.password)
        
        # Create user in database
        user_id = db_service.create_user(
            username=user_data.username,
            email=user_data.email,
            password_hash=hashed_password
        )
        
        # Get created user
        user = db_service.get_user_by_id(user_id)
        
        return {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"]
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}"
        )

@auth_router.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    recaptcha_token: Optional[str] = Form(None),
) -> Dict[str, str]:
    """
    Get access token using username and password.
    
    Args:
        form_data: Username and password form data
        
    Returns:
        JWT access token
    """
    await run_in_threadpool(verify_recaptcha_token, recaptcha_token)

    user = await run_in_threadpool(auth_service.authenticate_user, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = auth_service.create_access_token(
        data={"sub": user["id"], "username": user["username"]}
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

@auth_router.post("/session-token", response_model=Token)
async def create_project_session_token(
    token_data: SessionTokenCreate,
    current_user: Dict = Depends(get_current_user)
) -> Dict[str, str]:
    """
    Create a project-scoped session token for real-time collaboration.
    """
    user_projects = db_service.get_user_projects(current_user["id"])
    has_access = any(project["id"] == token_data.project_id for project in user_projects)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied for this project"
        )

    session_token = auth_service.create_session_token(current_user["id"], token_data.project_id)
    return {"access_token": session_token, "token_type": "bearer"}

@auth_router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: Dict = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Get current authenticated user information.
    
    Args:
        current_user: Current user from token validation
        
    Returns:
        Current user information
    """
    return {
        "id": current_user["id"],
        "username": current_user["username"],
        "email": current_user["email"]
    }

@auth_router.patch("/me", response_model=UserResponse)
async def update_current_user_info(
    user_data: UserUpdate,
    current_user: Dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Update current user's basic account settings."""
    try:
        updated_user = db_service.update_user(
            current_user["id"],
            username=user_data.username,
            email=str(user_data.email) if user_data.email is not None else None,
        )
        if not updated_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return {
            "id": updated_user["id"],
            "username": updated_user["username"],
            "email": updated_user["email"],
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@auth_router.delete("/me")
async def delete_current_user(current_user: Dict = Depends(get_current_user)) -> Dict[str, str]:
    """Delete the current user account."""
    deleted = db_service.delete_user(current_user["id"])
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {"status": "success", "message": "Account deleted"}

# TODO: Add password reset and email verification endpoints - #issue/124
