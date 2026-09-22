import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n';
import './marketing.css';
import { ThemeProvider } from '@mui/material/styles';
import lightTheme from './themes/light';

const button = document.getElementById('demo-start');
const demoRoot = document.getElementById('demo-root');
if (button instanceof HTMLButtonElement && demoRoot) {
  let loading = false;
  const start = async () => {
    if (loading) return;
    loading = true;
    button.disabled = true;
    button.textContent = 'Loading the canvas…';
    try {
      const { default: LandingDemo } = await import('./components/landing/LandingPage');
      ReactDOM.createRoot(demoRoot).render(
        <React.StrictMode><ThemeProvider theme={lightTheme}><LandingDemo /></ThemeProvider></React.StrictMode>,
      );
      demoRoot.setAttribute('data-demo-started', 'true');
      document.getElementById('demo-fallback')?.setAttribute('hidden', '');
    } catch {
      loading = false;
      button.disabled = false;
      button.textContent = 'Try the demo again';
    }
  };
  button.addEventListener('click', start);
  void start();
}
