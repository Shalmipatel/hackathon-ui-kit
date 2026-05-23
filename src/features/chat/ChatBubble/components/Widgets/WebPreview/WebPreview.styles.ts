import styled from 'styled-components';

export const WebPreviewLoadingBox = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(36, 36, 36, 0.05);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: rgba(36, 36, 36, 0.75);
  letter-spacing: -0.3px;
`;

export const WebPreviewLoadingSpinner = styled.span`
  width: 16px;
  height: 16px;
  border: 2px solid rgba(36, 36, 36, 0.1);
  border-top-color: #242424;
  border-radius: 50%;
  flex-shrink: 0;
  display: block;
  animation: webPreviewSpin 0.8s linear infinite;

  @keyframes webPreviewSpin {
    to {
      transform: rotate(360deg);
    }
  }
`;
