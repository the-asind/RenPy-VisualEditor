import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import EditorPage from '../components/EditorPage';
import { HomePage, LoginPage, RegisterPage } from '../pages';
import { useTranslation } from 'react-i18next';

// Authentication guard component
const RequireAuth: React.FC<{ children: JSX.Element }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" />;
};

const AppRoutes = () => {
  const { t } = useTranslation();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<HomePage />} />
      <Route path="/editor" element={
        <RequireAuth>
          <EditorPage />
        </RequireAuth>
      } />
      <Route
        path="/projects"
        element={
          <RequireAuth>
            <div>{t('placeholder.projects')}</div>
          </RequireAuth>
        }
      />
      <Route
        path="/users"
        element={
          <RequireAuth>
            <div>{t('placeholder.users')}</div>
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <div>{t('placeholder.profile')}</div>
          </RequireAuth>
        }
      />
    </Routes>
  );
};

export default AppRoutes;
