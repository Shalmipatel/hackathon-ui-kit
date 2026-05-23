import React, { useCallback } from 'react';
import AgentQuestionCard from '@/features/chat/AgentQuestionCard';
import type { QuestionStep } from '@/features/chat/AgentQuestionCard';
import { useSendMessage } from '@/features/chat/useSendMessage';
import { useIsAnswered } from '../../../hooks/useIsAnswered';
import { parseQuestionJson } from './questionUtils';
import { QuestionLoadingBox, QuestionLoadingSpinner } from './Question.styles';

interface QuestionData {
  steps: QuestionStep[];
  showComments?: boolean;
}

interface QuestionWidgetProps {
  json: string;
  isComplete: boolean;
  messageId: string;
}

function formatAnswer(
  steps: QuestionStep[],
  answers: Record<number, string[]>,
  comments: Record<number, string>,
): string {
  const parts: string[] = [];

  if (steps.length === 1) {
    const selected = answers[0];
    if (selected?.length) {
      parts.push(`Answer: ${selected.join(', ')}`);
    }
    const c = comments[0]?.trim();
    if (c) parts.push(`Comment: ${c}`);
  } else {
    for (let i = 0; i < steps.length; i++) {
      const selected = answers[i];
      if (selected?.length) {
        parts.push(`Step ${i + 1}: ${selected.join(', ')}`);
      }
      const c = comments[i]?.trim();
      if (c) parts.push(`Step ${i + 1} comment: ${c}`);
    }
  }

  return parts.join('\n') || 'No selection';
}

export const QuestionWidget: React.FC<QuestionWidgetProps> = React.memo(
  ({ json, isComplete, messageId }) => {
    const sendMessage = useSendMessage();
    const isAnswered = useIsAnswered(messageId);

    const handleSubmit = useCallback(
      (answers: Record<number, string[]>, comments: Record<number, string>) => {
        const data = parseQuestionJson<QuestionData>(json);
        if (!data) return;
        const text = formatAnswer(data.steps, answers, comments);
        sendMessage(text);
      },
      [json, sendMessage],
    );

    const handleDismiss = useCallback(() => {
      sendMessage('Dismissed');
    }, [sendMessage]);

    if (!isComplete) {
      return (
        <QuestionLoadingBox>
          <QuestionLoadingSpinner />
          Agent is preparing questions...
        </QuestionLoadingBox>
      );
    }

    const data = parseQuestionJson<QuestionData>(json);
    if (!data?.steps?.length) return null;

    if (isAnswered) {
      return (
        <div style={{ opacity: 0.6, pointerEvents: 'none' }}>
          <AgentQuestionCard
            steps={data.steps}
            showComments={data.showComments ?? true}
          />
        </div>
      );
    }

    return (
      <AgentQuestionCard
        steps={data.steps}
        showComments={data.showComments ?? true}
        onSubmit={handleSubmit}
        onDismiss={handleDismiss}
      />
    );
  },
);

QuestionWidget.displayName = 'QuestionWidget';
