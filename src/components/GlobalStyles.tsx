import { createGlobalStyle } from 'styled-components';
import { theme } from '@/components/theme';

export const GlobalStyles = createGlobalStyle`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html, body {
    background-color: ${theme.colors.background};
  }

  body {
    font-family: ${theme.fontFamily};
    font-style: normal;
    font-feature-settings: normal;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    color: ${theme.colors.textPrimary};
    line-height: 1.65;
  }

  /* On mobile, drop the #242424 desktop frame entirely — paint html/body
     with the same color as the app content (#DCE1DE) so the page flows
     continuously from under the iOS status bar through to the bottom,
     with no visible "bar" boundaries at the top or bottom. */
  @media (max-width: 768px) {
    html, body { background-color: #DCE1DE; }

    /* iOS Safari auto-zooms when the focused input has font-size < 16px.
       Force a minimum 16px so tapping any text field stays at 1× zoom —
       matches a native-app feel. Pinch-to-zoom is still allowed. */
    input, textarea, select {
      font-size: max(16px, 1em);
    }

    /* Kill the 300ms double-tap-zoom delay on interactive elements so
       taps feel instant (also blocks accidental zoom on double-tap). */
    button, a, [role="button"], input, textarea, select, label {
      touch-action: manipulation;
    }
  }

  #root {
    min-height: 100vh;
  }
`;
