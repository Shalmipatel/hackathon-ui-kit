export const theme = {
  colors: {
    primary: '#866af5',
    primaryHover: '#7559e0',
    primaryActive: '#6548cb',
    primaryTint: '#f5f3ff',
    primaryTintHover: '#f9f8ff',
    primaryVivid: '#7c3aed',
    gradient: 'linear-gradient(135deg, #866af5 0%, #7559e0 100%)',

    surface: '#FFFFFF',
    surfaceMuted: '#fafafc',
    background: '#242424',
    white: '#ffffff',

    textPrimary: '#18181b',
    textSecondary: '#71717a',
    textMuted: '#71717a',

    border: '#e4e4e7',
    borderActive: '#d1d5db',

    userBubble: 'rgba(36, 36, 36, 0.1)',
    userBubbleText: '#18181b',
    assistantBubble: '#f4f4f5',

    error: '#D93025',
    errorBg: '#FDF2F2',
    info: '#4B8BEA',
    infoBg: '#F0F5FE',
    success: '#2DA07A',
    successBg: 'rgba(45, 160, 122, 0.15)',

    streaming: '#866af5',
    questionAsked: '#fb923c',
    brand: '#feeb29',
  },
  shadows: {
    sm: '0px 1px 3px 0px rgba(0, 0, 0, 0.1), 0px 1px 2px 0px rgba(0, 0, 0, 0.06)',
    md: '0px 0px 6px 0px rgba(0, 0, 0, 0.1), 0px 2px 4px 0px rgba(0, 0, 0, 0.06)',
    lg: '0 8px 32px rgba(0, 0, 0, 0.18)',
    overlay: '0 4px 16px rgba(0, 0, 0, 0.1)',
  },
  borderRadius: {
    sm: '8px',
    md: '12px',
    lg: '24px',
    pill: '9999px',
  },
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
} as const;

export type Theme = typeof theme;
