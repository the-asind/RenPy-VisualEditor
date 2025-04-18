import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom'; 
import App from './App.tsx';
import './index.css';
import { ThemeProviderWrapper } from './contexts/ThemeContext';

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <BrowserRouter> {/* Wrap with BrowserRouter */} 
        <ThemeProviderWrapper> {/* Wrap with ThemeProviderWrapper */} 
          <App />
        </ThemeProviderWrapper>
      </BrowserRouter>
    </React.StrictMode>,
  );
} else {
  console.error('Failed to find the root element');
}
