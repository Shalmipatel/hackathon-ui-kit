import React, { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '@/types';
import type { ChatBubbleProps } from './types';
import { MessageWrapper, BubbleRow, Bubble } from './ChatBubble.styles';
import { MessageActions, UserBubbleContent, AssistantBubbleContent } from './components';
import { getRandomThinkingMessage } from './components/ToolIndicator';

const THINKING_DELAY_MS = 1500;
const ANIMATION_WINDOW_MS = 500;

const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  isLastAssistant,
  isStreaming,
  onRegenerate,
  activeTool,
}) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isAssistant = message.role === 'assistant';

  const [isThinking, setIsThinking] = useState(false);
  const [thinkingMessage, setThinkingMessage] = useState('');
  const [shouldAnimate] = useState(() => Date.now() - message.timestamp < ANIMATION_WINDOW_MS);
  const lastContentRef = useRef(message.content);
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showCursor = isStreaming && message.content.length > 0;

  useEffect(() => {
    if (!showCursor) {
      setIsThinking(false);
      if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
      return;
    }

    if (message.content !== lastContentRef.current) {
      lastContentRef.current = message.content;
      setIsThinking(false);
      if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);

      thinkingTimerRef.current = setTimeout(() => {
        setThinkingMessage(getRandomThinkingMessage());
        setIsThinking(true);
      }, THINKING_DELAY_MS);
    }

    return () => {
      if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
    };
  }, [showCursor, message.content]);

  return (
    <MessageWrapper $animate={shouldAnimate} $isUser={isUser}>
      <BubbleRow $isUser={isUser}>
        <Bubble $isUser={isUser} $isSystem={isSystem}>
          {isUser ? (
            <UserBubbleContent message={message} />
          ) : (
            <AssistantBubbleContent
              content={message.content}
              messageId={message.id}
              isStreaming={isStreaming}
              isLastAssistant={isLastAssistant}
              activeTool={activeTool}
              isThinking={isThinking}
              thinkingMessage={thinkingMessage}
            />
          )}
        </Bubble>
      </BubbleRow>

      <MessageActions
        isUser={isUser}
        content={message.content}
        timestamp={message.timestamp}
        isLastAssistant={isLastAssistant}
        onRegenerate={onRegenerate}
      />
    </MessageWrapper>
  );
};

export default ChatBubble;
