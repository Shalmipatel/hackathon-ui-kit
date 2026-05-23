import React, { useState, useCallback } from 'react';
import { MessageActionsContainer, MessageActionBtn } from './MessageActions.styles';
import { copyToClipboard } from '../../utils';
import { formatTimestamp12 } from '@/core/utils';
import { useTimezone } from '@/features/settings/useTimezone';

interface MessageActionsProps {
  isUser: boolean;
  content: string;
  timestamp: number;
  isLastAssistant?: boolean;
  onRegenerate?: () => void;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  isUser,
  content,
  timestamp,
  isLastAssistant,
  onRegenerate,
}) => {
  const { timezone } = useTimezone();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    copyToClipboard(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  return (
    <MessageActionsContainer $isUser={isUser}>
      {/* Copy */}
      <MessageActionBtn onClick={handleCopy} title={copied ? 'Copied!' : 'Copy'}>
        {copied ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </MessageActionBtn>

      {/* Share */}
      {/*
      <MessageActionBtn title="Share">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      </MessageActionBtn>
      */}

      {/* Regenerate */}
      {!isUser && isLastAssistant && (
        <MessageActionBtn title="Regenerate" onClick={onRegenerate}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 2v6h-6" />
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M3 22v-6h6" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
        </MessageActionBtn>
      )}

      {/* Feedback */}
      <MessageActionBtn title="Feedback">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 10v12" />
          <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
        </svg>
      </MessageActionBtn>

      {/* Web */}
      {/*
      <MessageActionBtn title="Open in web">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      </MessageActionBtn>
      */}

      {/* Timestamp */}
      <span
        style={{
          fontSize: 11,
          color: 'rgba(36,36,36,0.4)',
          marginLeft: 4,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: '-0.3px',
          whiteSpace: 'nowrap',
        }}
      >
        {formatTimestamp12(timestamp, timezone)}
      </span>
    </MessageActionsContainer>
  );
};

export default MessageActions;
