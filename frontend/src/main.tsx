import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom'; 
import App from './App.tsx';
import './index.css';
import './i18n';
import { ThemeProviderWrapper } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <BrowserRouter> {/* Wrap with BrowserRouter */} 
        <AuthProvider> {/* Wrap with AuthProvider */}
          <ThemeProviderWrapper> {/* Wrap with ThemeProviderWrapper */} 
            <App />
          </ThemeProviderWrapper>
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
} else {
  console.error('Failed to find the root element');
}
