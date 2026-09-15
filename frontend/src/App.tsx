import React from 'react';
import { Box } from '@mui/material';

import AppRoutes from './routes/AppRoutes';
import { useAuth } from './contexts/AuthContext';

function App() {
  useAuth();

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
      }}
    >
      <AppRoutes />
    </Box>
  );
}

export default App;
