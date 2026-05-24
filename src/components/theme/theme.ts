/**
 * Palette (wanderbot, May 2026):
 *   #1F2421 charcoal      → body text, dark surfaces
 *   #216869 deep teal     → primary brand, links, primary buttons
 *   #49A078 sage          → CTAs, success
 *   #9CC5A1 pale sage     → highlights / active fills / soft badges
 *   #DCE1DE near-white    → page background
 *
 * Source: https://coolors.co/1f2421-216869-49a078-9cc5a1-dce1de
 */
export const theme = {
  colors: {
    primary: '#216869',
    primaryHover: '#1a5253',
    primaryActive: '#143f40',
    primaryTint: '#e6f0f0',
    primaryTintHover: '#dbe9e9',
    primaryVivid: '#216869',
    gradient: 'linear-gradient(135deg, #216869 0%, #49A078 100%)',

    surface: '#FFFFFF',
    surfaceMuted: '#DCE1DE',
    background: '#1F2421',
    white: '#ffffff',

    textPrimary: '#1F2421',
    textSecondary: '#4a524e',
    textMuted: '#6b736e',

    border: 'rgba(31, 36, 33, 0.12)',
    borderActive: 'rgba(31, 36, 33, 0.25)',

    userBubble: 'rgba(33, 104, 105, 0.10)',
    userBubbleText: '#1F2421',
    assistantBubble: '#eef3ef',

    error: '#D93025',
    errorBg: '#FDF2F2',
    info: '#216869',
    infoBg: '#e6f0f0',
    success: '#49A078',
    successBg: 'rgba(73, 160, 120, 0.15)',

    streaming: '#216869',
    questionAsked: '#d97757',
    brand: '#216869',
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
