import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import MainMenuPage from '../components/mainMenu/MainMenuPage';

const HomePage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <MainMenuPage /> : <Navigate to="/login" replace />;
};

export default HomePage;
