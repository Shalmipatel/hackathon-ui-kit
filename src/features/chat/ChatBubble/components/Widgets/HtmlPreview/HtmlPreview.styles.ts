import styled from 'styled-components';
import { theme } from '@/components/theme';

export const CodeBlockWrapper = styled.div<{ $hasTabs: boolean }>`
  border-radius: ${theme.borderRadius.sm};
  overflow: hidden;
  margin: 0;
  background: ${theme.colors.white};
  border: 1px solid ${theme.colors.border};
`;

export const CodeBlockTabs = styled.div`
  display: flex;
  background: ${theme.colors.surfaceMuted};
  border-bottom: 1px solid ${theme.colors.border};
`;

export const CodeBlockTab = styled.button<{ $active: boolean }>`
  padding: 8px 16px;
  border: none;
  background: ${(p) => (p.$active ? theme.colors.surface : 'transparent')};
  color: ${(p) => (p.$active ? theme.colors.textPrimary : theme.colors.textSecondary)};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  border-bottom: 2px solid ${(p) => (p.$active ? theme.colors.primary : 'transparent')};
  margin-bottom: -1px;

  &:hover {
    color: ${theme.colors.textPrimary};
    background: ${(p) => (p.$active ? theme.colors.surface : 'rgba(0, 0, 0, 0.03)')};
  }
`;

export const CodeBlockContent = styled.div`
  background: ${theme.colors.textPrimary};
  padding: 14px;
  overflow-x: auto;

  code {
    font-family: 'SF Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 0.85em;
    color: #e5e7eb;
    background: transparent;
    padding: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }
`;

export const PreviewIframe = styled.iframe`
  width: 100%;
  border: none;
  background: ${theme.colors.white};
  display: block;
  min-height: 60px;
`;

export const PreviewLoading = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100px;
  background: ${theme.colors.surfaceMuted};
  color: ${theme.colors.textSecondary};
  font-size: 13px;
  gap: 8px;
`;

export const LoadingSpinner = styled.div`
  width: 16px;
  height: 16px;
  border: 2px solid ${theme.colors.border};
  border-top-color: ${theme.colors.primary};
  border-radius: 50%;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;
