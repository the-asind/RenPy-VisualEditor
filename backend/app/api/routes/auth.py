from fastapi import APIRouter, Depends, HTTPException, status, Body
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from typing import Dict, Any, Optional
from datetime import timedelta
from pydantic import BaseModel, EmailStr, Field

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

class Token(BaseModel):
    access_token: str
    token_type: str

class UserResponse(BaseModel):
    id: str
    username: str
    email: str

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
        # Hash the password
        hashed_password = auth_service.get_password_hash(user_data.password)
        
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
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()) -> Dict[str, str]:
    """
    Get access token using username and password.
    
    Args:
        form_data: Username and password form data
        
    Returns:
        JWT access token
    """
    user = auth_service.authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=30)
    access_token = auth_service.create_access_token(
        data={"sub": user["id"], "username": user["username"]},
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

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

# TODO: Add password reset and email verification endpoints - #issue/124
