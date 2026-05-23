import React, { useCallback, useRef, useState, useEffect } from 'react';
import { getChatStore } from '@/features/app/bootstrap';
import { useSendMessage } from '@/features/chat/useSendMessage';
import { useIsAnswered } from '../../../hooks/useIsAnswered';
import { parseChoicesJson } from './choicesUtils';
import {
  ChoicesLoadingBox,
  ChoicesLoadingSpinner,
  ChoicesScrollWrap,
  ChoicesRow,
  ChoiceCard,
} from './Choices.styles';

interface ChoicesData {
  choices: string[];
}

interface ChoicesWidgetProps {
  json: string;
  isComplete: boolean;
  messageId: string;
}

const SELECTED_PREFIX = 'Selected: ';

function usePreviousChoice(messageId: string): string | null {
  const store = getChatStore();
  return store((state) => {
    const sessionId = state.activeSessionId;
    if (!sessionId) return null;
    const session = state.sessions[sessionId];
    if (!session) return null;
    const { messages } = session;
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return null;
    for (let i = idx + 1; i < messages.length; i++) {
      if (messages[i].role === 'user') {
        const text = messages[i].content;
        if (text.startsWith(SELECTED_PREFIX)) {
          return text.slice(SELECTED_PREFIX.length);
        }
        return null;
      }
    }
    return null;
  });
}

function useScrollEdges(ref: React.RefObject<HTMLDivElement | null>) {
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 4);
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [ref, update]);

  return { showLeft, showRight };
}

export const ChoicesWidget: React.FC<ChoicesWidgetProps> = React.memo(
  ({ json, isComplete, messageId }) => {
    const sendMessage = useSendMessage();
    const isAnswered = useIsAnswered(messageId);
    const previousChoice = usePreviousChoice(messageId);
    const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { showLeft, showRight } = useScrollEdges(scrollRef);

    const handleSelect = useCallback(
      (choice: string) => {
        if (isAnswered || selectedChoice) return;
        setSelectedChoice(choice);
        sendMessage(`Selected: ${choice}`);
      },
      [isAnswered, selectedChoice, sendMessage],
    );

    if (!isComplete) {
      return (
        <ChoicesLoadingBox>
          <ChoicesLoadingSpinner />
          Agent is preparing options...
        </ChoicesLoadingBox>
      );
    }

    const data = parseChoicesJson<ChoicesData>(json);
    if (!data?.choices?.length) return null;

    const activeSelection = selectedChoice ?? previousChoice;
    const disabled = isAnswered || activeSelection !== null;

    return (
      <ChoicesScrollWrap $showLeft={showLeft} $showRight={showRight}>
        <ChoicesRow ref={scrollRef}>
          {data.choices.map((choice) => (
            <ChoiceCard
              key={choice}
              $selected={activeSelection === choice}
              $disabled={disabled}
              onClick={() => handleSelect(choice)}
              type="button"
            >
              {choice}
            </ChoiceCard>
          ))}
        </ChoicesRow>
      </ChoicesScrollWrap>
    );
  },
);

ChoicesWidget.displayName = 'ChoicesWidget';
