import styled from 'styled-components';
import { theme } from '@/components/theme';
import { BaseMarkdownContent } from '../../ChatBubble.markdown.styles';

export const MarkdownContent = styled(BaseMarkdownContent)<{ $showCursor?: boolean }>`
  @keyframes cursorBlink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0;
    }
  }

  .neoclaw-widget-wrap {
    margin: 16px 0;

    &:first-child {
      margin-top: 0;
    }

    &:last-child {
      margin-bottom: 0;
    }
  }

  & > :last-child::after {
    content: ${({ $showCursor }) => ($showCursor ? '"│"' : 'none')};
    display: ${({ $showCursor }) => ($showCursor ? 'inline' : 'none')};
    color: ${theme.colors.primary};
    margin-left: 2px;
    animation: cursorBlink 1s step-end infinite;
  }
`;
