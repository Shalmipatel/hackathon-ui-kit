import React from 'react';
import styled, { keyframes } from 'styled-components';
import { theme } from '@/components/theme';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const IndicatorRow = styled.div`
  display: flex;
  justify-content: flex-start;
  padding: 4px 16px;
`;

const StatusRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const SpinnerIcon = styled.div`
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ${spin} 1.5s linear infinite;
  color: ${theme.colors.textSecondary};
`;

const StatusText = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: ${theme.colors.textSecondary};
  line-height: 16px;
`;

const TypingIndicator: React.FC = () => (
  <IndicatorRow>
    <StatusRow>
      <SpinnerIcon>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M9.99935 1.66699V5.00033M13.4993 6.50024L15.916 4.08358M14.9993 10.0003H18.3327M13.4993 13.5003L15.916 15.917M9.99935 15.0003V18.3337M4.0826 15.917L6.49927 13.5003M1.66602 10.0003H4.99935M4.0826 4.08358L6.49927 6.50024" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </SpinnerIcon>
      <StatusText>Working...</StatusText>
    </StatusRow>
  </IndicatorRow>
);

export default TypingIndicator;
