import React from 'react';
import ReactDOM from 'react-dom/client';
import i18n from './i18n';
import { ThemeProvider } from '@mui/material/styles';
import lightTheme from './themes/light';

const languageSelector = document.getElementById('landing-language');
if (languageSelector instanceof HTMLSelectElement) {
  const routeLocale = window.location.pathname.match(/^\/(en|ru|ja|zh|de)(?:\/|$)/)?.[1];
  languageSelector.value = routeLocale ? `/${routeLocale}/` : '/';
  languageSelector.addEventListener('change', () => {
    const language = languageSelector.value.split('/').filter(Boolean)[0] || 'en';
    try {
      window.localStorage.setItem('plotmio-language-choice', language);
      window.localStorage.setItem('language', language);
    } catch { /* Navigation still works when storage is disabled. */ }
    window.location.assign(languageSelector.value);
  });
}

const button = document.getElementById('demo-start');
const demoRoot = document.getElementById('demo-root');
if (button instanceof HTMLButtonElement && demoRoot) {
  let loading = false;
  const start = async () => {
    if (loading) return;
    loading = true;
    button.disabled = true;
    button.textContent = i18n.t('loadingCanvas');
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
      button.textContent = i18n.t('demoAgain');
    }
  };
  button.addEventListener('click', start);
  void start();
}
