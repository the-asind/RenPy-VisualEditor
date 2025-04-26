import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, TextField, Typography, Alert } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const RegisterPage: React.FC = () => {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<{
    username?: string;
    email?: string;
    password?: string;
  }>({});
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Redirect if already authenticated in an effect to avoid state updates during render
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);
  if (isAuthenticated) {
    return null;
  }

  // Validate form before submission
  const validateForm = () => {
    const errors: {
      username?: string;
      email?: string;
      password?: string;
    } = {};
    let isValid = true;

    // Validate username
    if (username.length < 3) {
      errors.username = t('register.errors.usernameLength', 'Username must be at least 3 characters');
      isValid = false;
    }

    // Validate email (basic validation)
    if (!email.includes('@')) {
      errors.email = t('register.errors.invalidEmail', 'Please enter a valid email address');
      isValid = false;
    }

    // Validate password
    if (password.length < 8) {
      errors.password = t('register.errors.passwordLength', 'Password must be at least 8 characters');
      isValid = false;
    }

    setValidationErrors(errors);
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setValidationErrors({});

    // Validate form before submission
    if (!validateForm()) {
      return;
    }

    const result = await register(username, email, password);
    if (result.success) {
      navigate('/', { replace: true });
    } else {
      // Show specific error from API if available
      setError(result.error || t('register.errors.general', 'Registration failed. Please check your information and try again.'));
    }
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        maxWidth: 400,
        mx: 'auto',
        mt: 8,
        p: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <Typography variant="h5" align="center">
        {t('register.title')}
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField
        label={t('register.username')}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        error={!!validationErrors.username}
        helperText={validationErrors.username || t('register.hints.username', 'Between 3-50 characters')}
        required
      />
      <TextField
        label={t('register.email')}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={!!validationErrors.email}
        helperText={validationErrors.email}
        required
      />
      <TextField
        label={t('register.password')}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={!!validationErrors.password}
        helperText={validationErrors.password || t('register.hints.password', 'Minimum 8 characters')}
        required
      />
      <Button type="submit" variant="contained" color="primary">
        {t('register.submit')}
      </Button>
      <Button onClick={() => navigate('/login')}>
        {t('register.haveAccount')} {t('register.loginLink')}
      </Button>
    </Box>
  );
};

export default RegisterPage;
