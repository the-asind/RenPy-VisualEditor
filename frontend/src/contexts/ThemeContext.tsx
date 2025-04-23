import React, { createContext, useState, useMemo, useContext, useEffect } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import lightTheme from '../themes/light'; 
import darkTheme from '../themes/dark';  

interface ThemeContextProps {
  toggleTheme: () => void;
  mode: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextProps>({
  toggleTheme: () => { console.warn('toggleTheme function not yet initialized'); },
  mode: 'light',
});

export const useThemeContext = () => useContext(ThemeContext);

interface ThemeProviderWrapperProps {
  children: React.ReactNode;
}

export const ThemeProviderWrapper: React.FC<ThemeProviderWrapperProps> = ({ children }) => {
  // TODO: Read initial theme preference from local storage - Issue #ABC
  const [mode, setMode] = useState<'light' | 'dark'>('light');

  // TODO: Persist theme preference to local storage on change - Issue #ABC
  useEffect(() => {
    const storedTheme = localStorage.getItem('themeMode');
    if (storedTheme === 'dark' || storedTheme === 'light') {
        setMode(storedTheme);
    } else {
        // Optional: Check system preference
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        setMode(prefersDark ? 'dark' : 'light');
    }
  }, []);

  const toggleTheme = () => {
    setMode((prevMode) => {
        const newMode = prevMode === 'light' ? 'dark' : 'light';
        localStorage.setItem('themeMode', newMode);
        return newMode;
    });
  };

  const theme = useMemo(() => (mode === 'light' ? lightTheme : darkTheme), [mode]);

  const contextValue = useMemo(() => ({ toggleTheme, mode }), [toggleTheme, mode]);

  return (
    <ThemeContext.Provider value={contextValue}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline /> {/* Normalize styles */} 
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};
