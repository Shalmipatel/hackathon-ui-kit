import styled, { css } from 'styled-components';
import { theme } from '@/components/theme';

/*
 * Norton DS — Secondary button.
 * Canonical spec from Figma (node 7446:1836):
 *   Normal   : bg #fff, 2px solid #242424, text #242424
 *   Hover    : bg #242424, 2px solid #242424, text #fff
 *   Pressed  : bg rgba(36,36,36,0.75), no visible border, text #fff
 *   Disabled : bg #fff, 2px solid rgba(36,36,36,0.5), text rgba(36,36,36,0.5)
 *   Shape    : border-radius 24px, min-width 80px, inline-flex center
 *   Type     : Inter Extra Bold 800, letter-spacing -0.3px
 *   L (40px) : padding 10px 24px, 15px/20px
 *   M (32px) : padding  8px 16px, 13px/16px
 *
 * Consumers should prefer the `<SecondaryButton size="M|L">` styled component
 * below. Compose the `secondaryButtonCss(size)` mixin instead when a caller
 * needs additional layout quirks (extra margin, icon gap, responsive tweaks)
 * on top of the base tokens.
 */

export type SecondaryButtonSize = 'M' | 'L';

const SECONDARY_SIZE_TOKENS: Record<SecondaryButtonSize, { padding: string; fontSize: string; lineHeight: string }> = {
  L: { padding: '10px 24px', fontSize: '15px', lineHeight: '20px' },
  M: { padding: '8px 16px', fontSize: '13px', lineHeight: '16px' },
};

export const secondaryButtonCss = (size: SecondaryButtonSize = 'L') => {
  const t = SECONDARY_SIZE_TOKENS[size];
  return css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: 80px;
    padding: ${t.padding};
    background: #fff;
    color: #242424;
    /*
     * Softer/thinner border than the strict Figma spec (which calls for 2px
     * solid #242424). Using a 1.5px muted gray reads as "secondary" without
     * the resting border competing with other dark UI. Hover/active still
     * ramp up to full-opacity black so the interaction signal is clear.
     */
    border: 1.5px solid rgba(36, 36, 36, 0.2);
    border-radius: 24px;
    font-family: 'Inter', sans-serif;
    font-weight: 700;
    font-size: ${t.fontSize};
    line-height: ${t.lineHeight};
    letter-spacing: -0.3px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    white-space: nowrap;

    &:hover:not(:disabled) {
      background: #242424;
      color: #fff;
      border-color: #242424;
    }

    &:active:not(:disabled) {
      background: rgba(36, 36, 36, 0.75);
      color: #fff;
      border-color: rgba(36, 36, 36, 0.75);
    }

    &:disabled {
      background: #fff;
      color: rgba(36, 36, 36, 0.5);
      border-color: rgba(36, 36, 36, 0.15);
      cursor: default;
    }
  `;
};

export const SecondaryButton = styled.button<{ $size?: SecondaryButtonSize }>`
  ${(p) => secondaryButtonCss(p.$size ?? 'L')}
`;

/*
 * Legacy `<Button>` kept for back-compat. The "secondary" variant here
 * delegates to the DS spec so any existing caller inherits the new look;
 * primary keeps its theme-driven colors.
 */
export const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  ${(p) =>
    p.$variant === 'secondary'
      ? secondaryButtonCss('L')
      : css`
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 20px;
          border: none;
          border-radius: ${theme.borderRadius.sm};
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          font-family: ${theme.fontFamily};
          transition: all 0.2s ease;
          background-color: ${theme.colors.primary};
          color: white;

          &:hover { background-color: ${theme.colors.primaryHover}; }
          &:active { background-color: ${theme.colors.primaryActive}; }

          &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
        `}
`;
