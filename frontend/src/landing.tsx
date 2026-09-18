import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n';
import './marketing.css';
import { ThemeProviderWrapper } from './contexts/ThemeContext';

const button = document.getElementById('demo-start');
const demoRoot = document.getElementById('demo-root');

if (button instanceof HTMLButtonElement && demoRoot) {
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Loading demo…';
    demoRoot.hidden = false;
    demoRoot.setAttribute('data-demo-started', 'true');
    demoRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      const { default: LandingDemo } = await import('./components/landing/LandingPage');
      ReactDOM.createRoot(demoRoot).render(
        <React.StrictMode>
          <ThemeProviderWrapper>
            <LandingDemo />
          </ThemeProviderWrapper>
        </React.StrictMode>,
      );
    } catch {
      button.disabled = false;
      button.textContent = 'Try the demo again';
      demoRoot.textContent = 'The interactive demo could not load. Please try again.';
    }
  });
}
