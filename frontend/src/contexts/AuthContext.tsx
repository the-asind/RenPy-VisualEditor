import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

// Get API URL from environment variable or use default
const API_URL = import.meta.env.VITE_API_URL;

// Types for API responses
type ApiError = {
  detail: string | { msg: string; type: string }[];
};

type AuthContextType = {
  isAuthenticated: boolean;
  token: string | null;
  user: UserInfo | null;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
};

type UserInfo = {
  id: string;
  username: string;
  email: string;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('auth_token'));
  const [user, setUser] = useState<UserInfo | null>(null);
  const navigate = useNavigate();

  // Check if user is authenticated on mount
  useEffect(() => {
    const checkAuth = async () => {
      if (token) {
        try {
          const response = await fetch(`${API_URL}/auth/me`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (response.ok) {
            const userData = await response.json();
            setUser(userData);
          } else {
            // Token is invalid or expired
            localStorage.removeItem('auth_token');
            setToken(null);
            setUser(null);
          }
        } catch (error) {
          console.error('Authentication check failed:', error);
          localStorage.removeItem('auth_token');
          setToken(null);
          setUser(null);
        }
      }
    };
    
    checkAuth();
  }, [token]);

  // Login function
  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const formData = new FormData();
      formData.append('username', username);
      formData.append('password', password);
      
      const response = await fetch(`${API_URL}/auth/token`, {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('auth_token', data.access_token);
        setToken(data.access_token);
        
        // Fetch user info
        const userResponse = await fetch(`${API_URL}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${data.access_token}`
          }
        });
        
        if (userResponse.ok) {
          const userData = await userResponse.json();
          setUser(userData);
        }
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  // Register function
  const register = async (username: string, email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, email, password })
      });
      
      if (response.ok) {
        // Auto-login after registration
        const loginSuccess = await login(username, password);
        return { success: loginSuccess };
      }
      
      // Handle specific error responses
      const errorData: ApiError = await response.json().catch(() => ({ detail: 'Unknown error' }));
      
      // Format error message based on response structure
      let errorMessage: string;
      if (Array.isArray(errorData.detail)) {
        // FastAPI validation error format
        errorMessage = errorData.detail.map(err => err.msg).join(', ');
      } else {
        // Simple error message
        errorMessage = String(errorData.detail);
      }
      
      console.error('Registration failed with error:', errorMessage);
      return { success: false, error: errorMessage };
    } catch (error) {
      console.error('Registration failed:', error);
      return { success: false, error: 'Network error. Please check your connection.' };
    }
  };

  // Logout function
  const logout = () => {
    localStorage.removeItem('auth_token');
    setToken(null);
    setUser(null);
    navigate('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!token,
        token,
        user,
        login,
        register,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
