import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    grecaptcha?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback': () => void;
          'error-callback': () => void;
        },
      ) => number;
      reset: (widgetId?: number) => void;
    };
  }
}

const RECAPTCHA_SCRIPT_ID = 'google-recaptcha-v2-script';

type RecaptchaBoxProps = {
  onTokenChange: (token?: string) => void;
};

const loadRecaptchaScript = () => {
  if (document.getElementById(RECAPTCHA_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement('script');
  script.id = RECAPTCHA_SCRIPT_ID;
  script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
};

const RecaptchaBox: React.FC<RecaptchaBoxProps> = ({ onTokenChange }) => {
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<number | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!siteKey) {
      onTokenChange(undefined);
      return;
    }

    loadRecaptchaScript();
    const interval = window.setInterval(() => {
      if (window.grecaptcha && containerRef.current && widgetIdRef.current === null) {
        widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onTokenChange(token),
          'expired-callback': () => onTokenChange(undefined),
          'error-callback': () => onTokenChange(undefined),
        });
        setIsReady(true);
        window.clearInterval(interval);
      }
    }, 120);

    return () => window.clearInterval(interval);
  }, [onTokenChange, siteKey]);

  if (!siteKey) {
    return <div className="auth-recaptcha auth-recaptcha--disabled">reCAPTCHA disabled for local dev</div>;
  }

  return (
    <div className="auth-recaptcha-shell" aria-busy={!isReady}>
      <div ref={containerRef} />
    </div>
  );
};

export default RecaptchaBox;
