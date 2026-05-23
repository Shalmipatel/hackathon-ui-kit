import React from 'react';
import styled, { keyframes } from 'styled-components';
import { theme } from '@/components/theme';
import type { SmartNotification, SmartClassification } from '@/types';

/* ── Animations ── */

const slideIn = keyframes`
  from { opacity: 0; transform: translateX(100%); }
  to   { opacity: 1; transform: translateX(0); }
`;

const slideOut = keyframes`
  from { opacity: 1; transform: translateX(0); }
  to   { opacity: 0; transform: translateX(100%); }
`;

/* ── Styled Components ── */

const Container = styled.div<{ $fading: boolean }>`
  width: 400px;
  max-width: calc(100vw - 32px);
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.borderRadius.md};
  box-shadow: ${theme.shadows.lg};
  font-family: ${theme.fontFamily};
  animation: ${(p) => (p.$fading ? slideOut : slideIn)} 0.3s ease forwards;
  overflow: hidden;
`;

const TopRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 16px 0;
`;

const IconCircle = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: ${theme.colors.primaryTint};
  color: ${theme.colors.primary};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const ClassificationLabel = styled.span`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: ${theme.colors.primary};
  flex: 1;
`;

const CloseBtn = styled.button`
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: ${theme.colors.textMuted};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: color 0.15s, background 0.15s;

  &:hover {
    color: ${theme.colors.textPrimary};
    background: ${theme.colors.background};
  }
`;

const Body = styled.div`
  padding: 10px 16px 0;
`;

const Title = styled.h3`
  font-size: 15px;
  font-weight: 700;
  color: ${theme.colors.textPrimary};
  margin: 0 0 6px;
  line-height: 1.3;
`;

const Summary = styled.p`
  font-size: 13px;
  color: ${theme.colors.textSecondary};
  margin: 0;
  line-height: 1.5;
`;

/* ── Action inset card ── */

const ActionCard = styled.div`
  margin: 12px 16px 0;
  padding: 12px 14px;
  background: ${theme.colors.background};
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.borderRadius.sm};
`;

const ActionBadgeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
`;

const ActionBadge = styled.span`
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: ${theme.colors.textSecondary};
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.border};
`;

const ActionTitle = styled.p`
  font-size: 13px;
  font-weight: 600;
  color: ${theme.colors.textPrimary};
  margin: 0 0 4px;
`;

const ActionDesc = styled.p`
  font-size: 12px;
  color: ${theme.colors.textSecondary};
  margin: 0;
  line-height: 1.45;
`;

/* ── Draft block ── */

const DraftBlock = styled.div`
  margin: 12px 16px 0;
  padding: 10px 14px;
  background: ${theme.colors.surfaceMuted};
  border-left: 3px solid ${theme.colors.primary};
  border-radius: 0 ${theme.borderRadius.sm} ${theme.borderRadius.sm} 0;
  font-size: 12px;
  color: ${theme.colors.textPrimary};
  line-height: 1.55;
  white-space: pre-wrap;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  max-height: 120px;
  overflow-y: auto;
`;

/* ── Button row ── */

const ButtonRow = styled.div`
  display: flex;
  gap: 8px;
  padding: 14px 16px 16px;
`;

const CtaButton = styled.button`
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: ${theme.borderRadius.sm};
  background: ${theme.colors.primary};
  color: ${theme.colors.white};
  font-size: 13px;
  font-weight: 600;
  font-family: ${theme.fontFamily};
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: ${theme.colors.primaryHover};
  }

  &:active {
    background: ${theme.colors.primaryActive};
  }
`;

const DismissButton = styled.button`
  flex: 1;
  padding: 10px 16px;
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.borderRadius.sm};
  background: transparent;
  color: ${theme.colors.textSecondary};
  font-size: 13px;
  font-weight: 500;
  font-family: ${theme.fontFamily};
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: ${theme.colors.background};
    color: ${theme.colors.textPrimary};
  }
`;

/* ── Classification config ── */

const CLASSIFICATION_CONFIG: Record<SmartClassification, { label: string }> = {
  notify: { label: 'Info' },
  notify_draft: { label: 'Draft Ready' },
  notify_action: { label: 'Action Required' },
};

/* ── Icons ── */

const EnvelopeIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const BellIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const PencilIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

function ClassificationIcon({ classification }: { classification: SmartClassification }) {
  switch (classification) {
    case 'notify':
      return <BellIcon />;
    case 'notify_draft':
      return <PencilIcon />;
    case 'notify_action':
      return <EnvelopeIcon />;
  }
}

/* ── Deck wrapper ── */

const Deck = styled.div`
  position: fixed;
  /* Respect iOS safe area so the deck doesn't slide under the status bar */
  top: calc(env(safe-area-inset-top, 0) + 16px);
  right: calc(env(safe-area-inset-right, 0) + 16px);
  z-index: 9999;
  width: 400px;
  max-width: calc(100vw - 32px - env(safe-area-inset-left, 0) - env(safe-area-inset-right, 0));
`;

const CountBadge = styled.div`
  position: absolute;
  top: -8px;
  left: -8px;
  z-index: 200;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 11px;
  background: ${theme.colors.primary};
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  font-family: ${theme.fontFamily};
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
`;

/* ── Single card ── */

interface CardProps {
  notification: SmartNotification;
  onExecute: (prompt: string) => void;
  onDismiss: () => void;
}

const SmartCard: React.FC<CardProps> = ({ notification, onExecute, onDismiss }) => {
  const config = CLASSIFICATION_CONFIG[notification.classification];

  const handleCta = () => {
    if (notification.execute_prompt) {
      let prompt = notification.execute_prompt;
      if (notification.classification === 'notify_draft' && notification.draft) {
        prompt += `\n\nSend the email directly to the recipient. The draft is: ${notification.draft}`;
      }
      onExecute(prompt);
    } else {
      onDismiss();
    }
  };

  return (
    <Container $fading={false}>
      <TopRow>
        <IconCircle>
          <ClassificationIcon classification={notification.classification} />
        </IconCircle>
        <ClassificationLabel>{config.label}</ClassificationLabel>
        <CloseBtn onClick={onDismiss} aria-label="Dismiss notification">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </CloseBtn>
      </TopRow>

      <Body>
        <Title>{notification.title}</Title>
        <Summary>{notification.summary}</Summary>
      </Body>

      {notification.classification === 'notify_action' && notification.action && (
        <ActionCard>
          <ActionBadgeRow>
            <ActionBadge>Action</ActionBadge>
            <ActionBadge>{notification.action.type.replace(/_/g, ' ')}</ActionBadge>
          </ActionBadgeRow>
          <ActionTitle>{notification.action.title}</ActionTitle>
          <ActionDesc>{notification.action.description}</ActionDesc>
        </ActionCard>
      )}

      {notification.classification === 'notify_draft' && notification.draft && (
        <DraftBlock>{notification.draft}</DraftBlock>
      )}

      <ButtonRow>
        <CtaButton onClick={handleCta}>{notification.ctaLabel}</CtaButton>
        {notification.execute_prompt && (
          <DismissButton onClick={onDismiss}>Dismiss</DismissButton>
        )}
      </ButtonRow>
    </Container>
  );
};

/* ── Public component ── */

interface SmartNotificationToastProps {
  notifications: SmartNotification[];
  onExecute: (index: number, prompt: string) => void;
  onDismiss: (index: number) => void;
}

export const SmartNotificationToast: React.FC<SmartNotificationToastProps> = ({
  notifications,
  onExecute,
  onDismiss,
}) => {
  if (notifications.length === 0) return null;

  const front = notifications[0];

  return (
    <Deck>
      {notifications.length > 1 && <CountBadge>{notifications.length}</CountBadge>}
      <SmartCard
        notification={front}
        onExecute={(prompt) => onExecute(0, prompt)}
        onDismiss={() => onDismiss(0)}
      />
    </Deck>
  );
};

export default SmartNotificationToast;
