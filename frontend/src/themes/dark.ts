import { createTheme, alpha } from '@mui/material/styles';

// TODO: Define the full dark theme palette according to design specs - Issue #XYZ
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#60a5fa', // Bright blue that stands out in dark mode
      light: '#93c5fd',
      dark: '#3b82f6',
    },
    secondary: {
      main: '#c084fc', // Vibrant purple for dark mode
      light: '#d8b4fe',
      dark: '#a855f7',
    },
    background: {
      default: '#1a2544', // Deep blue background matching screenshot
      paper: '#243155', // Slightly lighter blue for cards,
    },
    text: {
      primary: '#f8fafc', // Very light gray, almost white
      secondary: '#cbd5e1', // Light blue-gray for secondary text
    },
    divider: '#334155',
    error: { // Ensure error colors are defined
      main: '#f44336',
      light: '#e57373',
      dark: '#d32f2f',
    },
    warning: { // Ensure warning colors are defined
      main: '#ffa726',
      light: '#ffb74d',
      dark: '#f57c00',
    },
    info: { // Ensure info colors are defined
      main: '#29b6f6',
      light: '#4fc3f7',
      dark: '#0288d1',
    },
    success: { // Ensure success colors are defined
      main: '#66bb6a',
      light: '#81c784',
      dark: '#388e3c',
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
    fontSize: 18, // Even larger base font size (1.5x larger than previous)
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
        },
        contained: {
          boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.3), 0 1px 2px -1px rgb(0 0 0 / 0.3)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          padding: 16,
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3)',
          background: '#243155',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#1a2544', // Match the sidebar color in screenshot
          borderRight: 'none',
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#1a2544',
          boxShadow: 'none',
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
      background: alpha('#243155', 0.08), // Based on paper
      border: alpha('#334155', 0.2), // Based on divider
      shadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    },
    statusChipAlpha: 0.2, // Slightly more opaque chip in dark mode
    nodeColors: { // Adjusted for dark mode contrast if needed
      label: '#facc15', // yellow-500
      action: '#9ca3af', // gray-400 (lighter gray)
      if: '#22c55e', // green-500
      menu: '#fda4af', // rose-300 (lighter burgundy)
      menuOption: '#fb923c', // orange-400 (lighter orange)
      end: '#9ca3af', // gray-400
    },
    loading: {
      background: alpha('#424242', 0.8), // grey[800]
      border: alpha('#616161', 0.5), // grey[700]
    },
    error: { // For .error-message class styling via sx
      background: alpha('#d32f2f', 0.3), // error.dark
      color: '#e57373', // error.light
      border: alpha('#f44336', 0.5), // error.main
    },
    fileOptions: {
      background: alpha('#243155', 0.8), // paper
      border: alpha('#334155', 0.5), // divider
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

export default darkTheme;
