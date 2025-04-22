from fastapi import HTTPException, status
from typing import Optional, Dict, Any

class BaseAppException(HTTPException):
    """Base exception class for application-specific exceptions."""
    def __init__(
        self, 
        status_code: int, 
        detail: str, 
        headers: Optional[Dict[str, Any]] = None
    ):
        super().__init__(status_code=status_code, detail=detail, headers=headers)


class ResourceNotFoundException(BaseAppException):
    """Exception raised when a requested resource is not found."""
    def __init__(self, resource_type: str, resource_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{resource_type} with ID {resource_id} not found"
        )


class AuthenticationException(BaseAppException):
    """Exception raised for authentication errors."""
    def __init__(self, detail: str = "Authentication failed"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"}
        )


class PermissionDeniedException(BaseAppException):
    """Exception raised when user doesn't have permission for an action."""
    def __init__(self, action: str, resource_type: Optional[str] = None):
        message = f"Permission denied for {action}"
        if resource_type:
            message += f" on {resource_type}"
        
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=message
        )


class ValidationException(BaseAppException):
    """Exception raised for invalid input data."""
    def __init__(self, detail: str):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail
        )


class DuplicateResourceException(BaseAppException):
    """Exception raised when trying to create a duplicate resource."""
    def __init__(self, resource_type: str, field: str, value: str):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{resource_type} with {field} '{value}' already exists"
        )


class DatabaseException(BaseAppException):
    """Exception raised for database-related errors."""
    def __init__(self, operation: str, detail: Optional[str] = None):
        message = f"Database error occurred during {operation}"
        if detail:
            message += f": {detail}"
            
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=message
        )

# TODO: Add more specific exception types as needed - #issue/125
