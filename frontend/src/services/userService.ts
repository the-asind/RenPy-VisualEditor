import axios from 'axios';

// Base URL for API calls - read from environment variables or use default
const API_URL = import.meta.env.VITE_API_URL;

// Create axios instance with default configuration
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Add request interceptor for authentication
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export interface User {
  id: string;
  username: string;
  email: string;
  is_active: boolean;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
}

const userService = {
  /**
   * Get all available users
   */
  async getUsers(): Promise<User[]> {
    try {
      // TODO: #issue/45 - Implement backend endpoint for listing users
      // For now returning mock data for demonstration
      
      // In future, should call:
      // const response = await api.get('/users');
      // return response.data;
      
      return [
        { id: 'user1', username: 'user1', email: 'user1@example.com', is_active: true },
        { id: 'user2', username: 'user2', email: 'user2@example.com', is_active: true },
        { id: 'user3', username: 'user3', email: 'user3@example.com', is_active: false },
      ];
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  },

  /**
   * Get all available roles
   */
  async getRoles(): Promise<Role[]> {
    try {
      // TODO: #issue/46 - Implement backend endpoint for listing roles
      // For now returning mock data for demonstration
      
      // In future, should call:
      // const response = await api.get('/roles');
      // return response.data;
      
      return [
        { id: 'role_owner', name: 'Owner' },
        { id: 'role_editor', name: 'Editor' },
        { id: 'role_viewer', name: 'Viewer' }
      ];
    } catch (error) {
      console.error('Error fetching roles:', error);
      throw error;
    }
  },

  /**
   * Get current user information
   */
  async getCurrentUser(): Promise<User> {
    try {
      const response = await api.get('/auth/me');
      return response.data;
    } catch (error) {
      console.error('Error fetching current user info:', error);
      throw error;
    }
  }
};

export default userService;
