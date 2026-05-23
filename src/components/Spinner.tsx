import styled, { keyframes } from 'styled-components';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

/**
 * Reusable spinning SVG loader.
 *
 * @param size     – icon width/height in px (default 24)
 * @param duration – rotation period, e.g. "1.5s" (default "1.5s")
 * @param color    – stroke colour (default "currentColor")
 */
export const Spinner: React.FC<{
  size?: number;
  duration?: string;
  color?: string;
  className?: string;
}> = ({ size = 24, duration = '1.5s', color = 'currentColor', className }) => (
  <SpinnerSvg
    $duration={duration}
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </SpinnerSvg>
);

const SpinnerSvg = styled.svg<{ $duration: string }>`
  animation: ${spin} ${(p) => p.$duration} linear infinite;
`;
