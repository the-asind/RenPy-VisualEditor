import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import LandingPage from '../components/landing/LandingPage';
import MainMenuPage from '../components/mainMenu/MainMenuPage';

const HomePage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <MainMenuPage /> : <LandingPage />;
};

export default HomePage;
