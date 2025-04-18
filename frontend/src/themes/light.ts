import { createTheme, alpha } from '@mui/material/styles';

// TODO: Define the full light theme palette according to design specs - Issue #XYZ
const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#2563eb', // Deeper blue for better contrast
      light: '#3b82f6',
      dark: '#1d4ed8',
    },
    secondary: {
      main: '#9333ea', // Vibrant purple
      light: '#a855f7',
      dark: '#7e22ce',
    },
    background: {
      default: '#f8fafc', // Very light grayish-blue
      paper: '#ffffff',
    },
    text: {
      primary: '#0f172a', // Very dark blue-gray
      secondary: '#475569', // Medium blue-gray for better contrast
    },
    divider: '#e2e8f0',
    error: { // Ensure error colors are defined
      main: '#d32f2f',
      light: '#ef5350',
      dark: '#c62828',
    },
    warning: { // Ensure warning colors are defined
      main: '#ed6c02',
      light: '#ff9800',
      dark: '#e65100',
    },
    info: { // Ensure info colors are defined
      main: '#0288d1',
      light: '#03a9f4',
      dark: '#01579b',
    },
    success: { // Ensure success colors are defined
      main: '#2e7d32',
      light: '#4caf50',
      dark: '#1b5e20',
    },
    grey: { // Ensure grey scale is defined
      50: '#fafafa',
      100: '#f5f5f5',
      200: '#eeeeee',
      300: '#e0e0e0',
      400: '#bdbdbd',
      500: '#9e9e9e',
      600: '#757575',
      700: '#616161',
      800: '#424242',
      900: '#212121',
      A100: '#d5d5d5',
      A200: '#aaaaaa',
      A400: '#303030',
      A700: '#616161',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 18, // Base font size increased to match dark theme
    h1: {
      fontSize: '3rem',
      fontWeight: 600,
    },
    h2: {
      fontSize: '2.5rem',
      fontWeight: 600,
    },
    h3: {
      fontSize: '2.25rem',
      fontWeight: 600,
    },
    h4: {
      fontSize: '2rem', // Increased for "My Projects" heading
      fontWeight: 700,
    },
    h5: {
      fontSize: '1.5rem',
      fontWeight: 600,
    },
    h6: {
      fontSize: '1.25rem',
      fontWeight: 600,
    },
    body1: {
      fontSize: '1.125rem',
    },
    body2: {
      fontSize: '1rem',
    },
    button: {
      textTransform: 'none',
      fontWeight: 500,
      fontSize: '1rem',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '12px 24px',
          boxShadow: 'none',
        },
        contained: {
          boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          padding: 16,
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#f8fafc',
          borderRight: '1px solid #e2e8f0',
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)',
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 500,
        },
      },
    },
  },
  custom: { // Custom theme variables
    glass: {
      background: alpha('#ffffff', 0.08), // Based on paper
      border: alpha('#e2e8f0', 0.15), // Based on divider
      shadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
    },
    statusChipAlpha: 0.15,
    nodeColors: { // As per guideline
      label: '#facc15', // yellow-500
      action: '#6b7280', // gray-500
      if: '#22c55e', // green-500
      menu: '#9f1239', // rose-800 (Burgundy approximation)
      menuOption: '#f97316', // orange-500
      end: '#6b7280', // gray-500
    },
    loading: {
      background: alpha('#e0e0e0', 0.8), // grey[300]
      border: alpha('#bdbdbd', 0.5), // grey[400]
    },
    error: { // For .error-message class styling via sx
      background: alpha('#ef5350', 0.2), // error.light
      color: '#c62828', // error.dark
      border: alpha('#d32f2f', 0.5), // error.main
    },
    fileOptions: {
      background: alpha('#ffffff', 0.8), // paper
      border: alpha('#e2e8f0', 0.5), // divider
    }
  }
});

// Augment the Theme interface to include custom variables
declare module '@mui/material/styles' {
  interface Theme {
    custom: {
      glass: {
        background: string;
        border: string;
        shadow: string;
      };
      statusChipAlpha: number;
      nodeColors: {
        label: string;
        action: string;
        if: string;
        menu: string;
        menuOption: string;
        end: string;
      };
      loading: {
        background: string;
        border: string;
      };
      error: {
        background: string;
        color: string;
        border: string;
      };
      fileOptions: {
        background: string;
        border: string;
      };
    };
  }
  // allow configuration using `createTheme`
  interface ThemeOptions {
    custom?: {
      glass?: {
        background?: string;
        border?: string;
        shadow?: string;
      };
      statusChipAlpha?: number;
      nodeColors?: {
        label?: string;
        action?: string;
        if?: string;
        menu?: string;
        menuOption?: string;
        end?: string;
      };
      loading?: {
        background?: string;
        border?: string;
      };
      error?: {
        background?: string;
        color?: string;
        border?: string;
      };
      fileOptions?: {
        background?: string;
        border?: string;
      };
    };
  }
}

export default lightTheme;
