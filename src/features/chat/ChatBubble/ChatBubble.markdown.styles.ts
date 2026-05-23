import styled from 'styled-components';
import { theme } from '@/components/theme';

export const BaseMarkdownContent = styled.div`
  p {
    margin: 0 0 12px 0;

    &:last-child {
      margin: 0;
    }
  }

  strong {
    font-weight: 700;
  }

  em {
    font-style: italic;
  }

  code {
    font-family: 'SF Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 0.88em;
    background-color: rgba(0, 0, 0, 0.06);
    padding: 2px 6px;
    border-radius: 4px;
  }

  pre {
    background-color: ${theme.colors.textPrimary};
    color: #e5e7eb;
    padding: 14px;
    border-radius: ${theme.borderRadius.sm};
    overflow-x: auto;
    margin: 12px 0;

    &:last-child {
      margin-bottom: 0;
    }

    code {
      background-color: transparent;
      padding: 0;
      font-size: 0.85em;
      color: inherit;
    }

    &:has(iframe),
    &:has([data-html-preview]) {
      background: transparent;
      padding: 0;
      margin: 12px 0;
      border-radius: 0;
    }
  }

  ul,
  ol {
    margin: 6px 0 12px 0;
    padding-left: 22px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  li {
    margin-bottom: 6px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    margin: 16px 0 8px 0;
    font-weight: 700;

    &:first-child {
      margin-top: 0;
    }
  }

  h1 {
    font-size: 1.35em;
  }
  h2 {
    font-size: 1.25em;
  }
  h3 {
    font-size: 1.15em;
  }
  h4,
  h5,
  h6 {
    font-size: 1.05em;
  }

  a {
    color: ${theme.colors.primary};
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  hr {
    border: none;
    border-top: 1px solid ${theme.colors.border};
    margin: 12px 0;
  }

  blockquote {
    margin: 6px 0 12px 0;
    padding-left: 14px;
    border-left: 3px solid ${theme.colors.border};
    color: ${theme.colors.textSecondary};
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 0.92em;
    overflow-x: auto;
    display: block;

    &:last-child {
      margin-bottom: 0;
    }
  }

  thead {
    background-color: rgba(0, 0, 0, 0.04);
  }

  th {
    font-weight: 600;
    text-align: left;
    padding: 8px 12px;
    border-bottom: 2px solid ${theme.colors.border};
    white-space: nowrap;
  }

  td {
    padding: 6px 12px;
    border-bottom: 1px solid ${theme.colors.border};
    vertical-align: top;
  }

  tr:last-child td {
    border-bottom: none;
  }

  .footnotes {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid ${theme.colors.border};
    font-size: 0.88em;
    color: ${theme.colors.textSecondary};

    h2 {
      font-size: 0.95em;
      margin: 0 0 12px 0;
    }

    ol {
      margin: 0;
      padding-left: 20px;
    }

    li {
      margin-bottom: 8px;

      &:last-child {
        margin-bottom: 0;
      }
    }

    .data-footnote-backref {
      text-decoration: none;
      margin-left: 4px;
    }
  }

  sup a {
    color: ${theme.colors.primary};
    text-decoration: none;
    font-weight: 500;

    &:hover {
      text-decoration: underline;
    }
  }

  dl {
    margin: 12px 0;

    &:last-child {
      margin-bottom: 0;
    }
  }

  dt {
    font-weight: 600;
    margin-top: 12px;

    &:first-child {
      margin-top: 0;
    }
  }

  dd {
    margin: 4px 0 0 20px;
    color: ${theme.colors.textSecondary};
  }

  tbody tr:hover {
    background-color: rgba(0, 0, 0, 0.02);
  }
`;
