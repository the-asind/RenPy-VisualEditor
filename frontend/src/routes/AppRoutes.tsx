import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import EditorPage from '../components/EditorPage';
import { LoginPage, RegisterPage } from '../pages';
import MainMenuPage from '../components/mainMenu/MainMenuPage';

// Authentication guard component
const RequireAuth: React.FC<{ children: JSX.Element }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" />;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route path="/editor" element={
        <RequireAuth>
          <EditorPage />
        </RequireAuth>
      } />
      <Route
        path="/projects"
        element={
          <RequireAuth>
            <MainMenuPage />
          </RequireAuth>
        }
      />
      <Route
        path="/users"
        element={
          <RequireAuth>
            <Navigate to="/" replace />
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <Navigate to="/" replace />
          </RequireAuth>
        }
      />
    </Routes>
  );
};

export default AppRoutes;
