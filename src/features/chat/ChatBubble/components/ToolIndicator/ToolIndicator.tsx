import React from 'react';
import { TOOL_INDICATOR_MODE } from '@/types/constants';
import type { ActiveToolInfo } from '../../types';
import { getToolCategory, ToolIcons, getToolDisplayText } from './toolUtils';
import {
  ThinkingIndicator,
  ThinkingDots,
  InlineThinkingIndicator,
  ToolIndicatorPill,
  ToolDots,
  InlineToolIndicator,
  InlineToolSpinner,
  InlineToolIconWrapper,
  InlineToolText,
} from './ToolIndicator.styles';

interface InlineToolIconProps {
  toolName: string;
}

export const InlineToolIcon: React.FC<InlineToolIconProps> = ({ toolName }) => {
  const category = getToolCategory(toolName);
  const icon = ToolIcons[category];

  if (icon) {
    return <InlineToolIconWrapper>{icon}</InlineToolIconWrapper>;
  }
  return <InlineToolSpinner />;
};

interface ThinkingIndicatorComponentProps {
  message?: string;
}

export const ThinkingIndicatorComponent: React.FC<ThinkingIndicatorComponentProps> = ({
  message = 'Thinking...',
}) => {
  if (TOOL_INDICATOR_MODE === 'pill') {
    return (
      <ThinkingIndicator>
        <ThinkingDots>
          <span />
          <span />
          <span />
        </ThinkingDots>
        {message}
      </ThinkingIndicator>
    );
  }

  return (
    <InlineThinkingIndicator>
      <InlineToolSpinner />
      {message}
    </InlineThinkingIndicator>
  );
};

interface ToolIndicatorComponentProps {
  activeTool: ActiveToolInfo;
}

export const ToolIndicatorComponent: React.FC<ToolIndicatorComponentProps> = ({ activeTool }) => {
  const displayText = getToolDisplayText(activeTool);

  if (TOOL_INDICATOR_MODE === 'pill') {
    return (
      <ToolIndicatorPill>
        <ToolDots>
          <span />
          <span />
          <span />
        </ToolDots>
        {displayText}
      </ToolIndicatorPill>
    );
  }

  return (
    <InlineToolIndicator>
      <InlineToolIcon toolName={activeTool.name} />
      <InlineToolText
        key={`${activeTool.name}-${activeTool.status}-${JSON.stringify(activeTool.args)}`}
      >
        {displayText}
      </InlineToolText>
    </InlineToolIndicator>
  );
};

export default ToolIndicatorComponent;
