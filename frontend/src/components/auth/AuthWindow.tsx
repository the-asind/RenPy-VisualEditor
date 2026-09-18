import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import brandLogoUrl from '../../assets/logo.svg';
import { useAuth } from '../../contexts/AuthContext';
import RecaptchaBox from './RecaptchaBox';
import './AuthWindow.css';

type AuthWindowProps = {
  mode: 'login' | 'register';
};

const AuthWindow: React.FC<AuthWindowProps> = ({ mode }) => {
  const isRegister = mode === 'register';
  const { t } = useTranslation();
  const { login, register, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const continuePath = new URLSearchParams(location.search).get('intent') === 'import'
    ? '/projects?intent=import'
    : '/projects';

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [recaptchaToken, setRecaptchaToken] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const requiresCaptcha = Boolean(import.meta.env.VITE_RECAPTCHA_SITE_KEY);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(continuePath, { replace: true });
    }
  }, [continuePath, isAuthenticated, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (requiresCaptcha && !recaptchaToken) {
      setError(t('auth.errors.recaptcha'));
      return;
    }

    if (isRegister && password.length < 8) {
      setError(t('auth.errors.passwordLength'));
      return;
    }

    setIsSubmitting(true);
    try {
      if (isRegister) {
        const result = await register(username, email, password, recaptchaToken);
        if (!result.success) {
          setError(result.error || t('auth.errors.register'));
          return;
        }
        navigate(continuePath, { replace: true });
        return;
      }

      const success = await login(username, password, recaptchaToken);
      if (!success) {
        setError(t('auth.errors.login'));
        return;
      }
      navigate(continuePath, { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAuthenticated) {
    return null;
  }

  return (
    <main className="auth-page">
      <div className="auth-brand-bubble">
        <img className="auth-brand-logo" src={brandLogoUrl} alt="Plotmio" />
      </div>
      <section className="auth-window" aria-label={isRegister ? t('auth.register.title') : t('auth.login.title')}>
        <h1 className="auth-title">{isRegister ? t('auth.register.title') : t('auth.login.title')}</h1>
        <p className="auth-subtitle">
          {isRegister ? t('auth.register.subtitle') : t('auth.login.subtitle')}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error ? <div className="auth-error">{error}</div> : null}
          <label className="auth-field">
            {t('auth.fields.nickname')}
            <input value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="username" />
          </label>
          {isRegister ? (
            <label className="auth-field">
              {t('auth.fields.email')}
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </label>
          ) : null}
          <label className="auth-field">
            {t('auth.fields.password')}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
          </label>

          <RecaptchaBox onTokenChange={setRecaptchaToken} />

          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? t('auth.submitting')
              : isRegister
                ? t('auth.register.submit')
                : t('auth.login.submit')}
          </button>
          <button
            className="auth-secondary"
            type="button"
            onClick={() => navigate(isRegister ? `/login${location.search}` : `/register${location.search}`)}
          >
            {isRegister ? t('auth.loginInstead') : t('auth.createAccount')}
          </button>
        </form>
      </section>
    </main>
  );
};

export default AuthWindow;
