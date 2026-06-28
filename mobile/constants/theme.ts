import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

// LegalBridge brand colours — deep navy + gold accent
export const COLORS = {
  primary: '#1a3a6e',       // deep navy blue
  primaryLight: '#2a5aae',
  primaryDark: '#0d1b3e',
  secondary: '#e8eef8',     // pale blue tint
  accent: '#f4c146',        // gold
  accentDim: 'rgba(244,193,70,0.15)',
  error: '#d32f2f',
  warning: '#f57c00',
  success: '#2ecc71',
  surface: '#ffffff',
  surfaceDark: '#112247',
  background: '#f0f2f7',
  backgroundDark: '#04060a',
  text: '#0d1b3e',
  textSecondary: '#6b7280',
  textTertiary: 'rgba(13,27,62,0.35)',
  border: '#e5e7eb',
  borderDark: 'rgba(255,255,255,0.08)',
  userBubble: '#1a3a6e',
};

export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: COLORS.primary,
    secondary: COLORS.primaryLight,
    background: COLORS.background,
    surface: COLORS.surface,
    error: COLORS.error,
    onPrimary: '#ffffff',
    onSurface: COLORS.text,
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: COLORS.primaryLight,
    secondary: COLORS.primary,
    background: COLORS.backgroundDark,
    surface: '#112247',
    error: '#ef5350',
    onPrimary: '#ffffff',
    onSurface: '#e8edf5',
  },
};
