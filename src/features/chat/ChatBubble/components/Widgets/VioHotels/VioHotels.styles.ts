import styled from 'styled-components';
import { theme } from '@/components/theme';

export const VioSearchingBox = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 10px;
  background: #f4f4f5;
  font-size: 13px;
  color: #71717a;
`;

export const VioSearchingSpinner = styled.span`
  width: 16px;
  height: 16px;
  border: 2px solid #e4e4e7;
  border-top-color: ${theme.colors.primaryVivid};
  border-radius: 50%;
  flex-shrink: 0;
  display: block;
  animation: vioSearchSpin 0.8s linear infinite;
  @keyframes vioSearchSpin {
    to {
      transform: rotate(360deg);
    }
  }
`;
