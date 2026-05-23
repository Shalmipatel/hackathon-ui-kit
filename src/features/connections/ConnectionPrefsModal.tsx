/**
 * Shared "pay attention to / ignore" modal used both by the Connections
 * settings page and by the onboarding platform-connect step. The host owns
 * the textarea state and save/disconnect implementations — this component
 * owns the UI and layout so the two surfaces look identical.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { secondaryButtonCss } from '@/components/Button';
import {
  backdropFadeIn,
  backdropFadeOut,
  modalScaleIn,
  modalScaleOut,
  MODAL_BACKDROP_DURATION,
  MODAL_SURFACE_DURATION,
  useModalClose,
} from '@/components/modal';

export type ConnectionPrefsModalMode = 'first-time' | 'edit';

interface Props {
  mode: ConnectionPrefsModalMode;
  /** Human-readable platform label shown in the account pill (e.g. "Gmail"). */
  platform: string;
  /** Account identifier shown next to the platform icon (email, display name). */
  accountName: string;
  /** Icon rendered inside the account pill — e.g. <GmailIcon /> or <img />. */
  accountIcon: React.ReactNode;
  attention: string;
  ignore: string;
  onAttentionChange: (value: string) => void;
  onIgnoreChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  /** Only wired when `mode === 'edit'`. Omit on first-time flow. */
  onDisconnect?: () => void;
  submitting?: boolean;
  disconnecting?: boolean;
}

const Overlay = styled.div<{ $closing?: boolean }>`
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(15, 15, 15, 0.45);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: ${(p) => (p.$closing ? backdropFadeOut : backdropFadeIn)} ${MODAL_BACKDROP_DURATION} ease forwards;
`;

const Card = styled.div<{ $closing?: boolean }>`
  background: white;
  border: 1px solid rgba(36, 36, 36, 0.05);
  border-radius: 24px;
  width: 610px;
  max-width: 100%;
  padding: 24px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18), 0 4px 12px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 24px;
  transform-origin: center;
  animation: ${(p) => (p.$closing ? modalScaleOut : modalScaleIn)} ${MODAL_SURFACE_DURATION} ease forwards;
  @media (max-width: 480px) { padding: 20px; gap: 20px; }
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
`;

const TitleGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
`;

const Title = styled.h3`
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 15px;
  line-height: 24px;
  letter-spacing: -0.3px;
  color: #242424;
  margin: 0;
`;

const Desc = styled.p`
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 13px;
  line-height: 20px;
  letter-spacing: -0.3px;
  color: rgba(36, 36, 36, 0.75);
  margin: 0;
`;

const CloseBtn = styled.button`
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #242424;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 6px;
  flex-shrink: 0;
  transition: background 0.15s ease;
  &:hover { background: rgba(36, 36, 36, 0.08); }
  &:disabled { opacity: 0.5; cursor: default; }
`;

const AccountPill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  padding: 4px 16px 4px 4px;
  background: #fbfaf9;
  border-radius: 9999px;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: #242424;
  letter-spacing: -0.3px;
  line-height: 20px;
`;

const AccountIconWrap = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;

  & > img, & > svg {
    width: 30px;
    height: 30px;
    object-fit: contain;
  }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
`;

const FieldLabel = styled.label`
  font-family: 'Inter', sans-serif;
  font-weight: 400;
  font-size: 11px;
  line-height: 16px;
  letter-spacing: -0.3px;
  color: rgba(36, 36, 36, 0.75);
  display: block;
`;

const Textarea = styled.textarea`
  width: 100%;
  height: 138px;
  resize: vertical;
  padding: 12px 14px;
  border: 2px solid rgba(36, 36, 36, 0.1);
  border-radius: 8px;
  background: white;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  line-height: 20px;
  color: #242424;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s ease;

  &::placeholder { color: rgba(36, 36, 36, 0.35); }
  &:focus { border-color: rgba(36, 36, 36, 0.35); }
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
`;

const ActionGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const DisconnectBtn = styled.button`
  border: none;
  background: transparent;
  padding: 0;
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: -0.3px;
  color: #d40404;
  cursor: pointer;
  transition: opacity 0.15s ease;
  &:hover { opacity: 0.7; }
  &:disabled { opacity: 0.5; cursor: default; }
`;

/* Norton DS secondary (size L). */
const CancelBtn = styled.button`
  ${secondaryButtonCss('L')}
`;

const SubmitBtn = styled.button`
  height: 40px;
  padding: 0 26px;
  border: 2px solid #242424;
  border-radius: 20px;
  background: #feeb29;
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 13px;
  color: #242424;
  cursor: pointer;
  transition: background 0.15s ease;
  &:hover { background: #fde614; }
  &:disabled { opacity: 0.6; cursor: default; }
`;

export const ConnectionPrefsModal: React.FC<Props> = ({
  mode,
  platform: _platform,
  accountName,
  accountIcon,
  attention,
  ignore,
  onAttentionChange,
  onIgnoreChange,
  onSubmit,
  onClose,
  onDisconnect,
  submitting = false,
  disconnecting = false,
}) => {
  const busy = submitting || disconnecting;
  const { closing, requestClose, startClose } = useModalClose(onClose);

  const handleSubmit = () => {
    if (busy) return;
    startClose(onSubmit);
  };

  const handleDisconnect = () => {
    if (!onDisconnect || busy) return;
    startClose(onDisconnect);
  };

  return createPortal(
    <Overlay
      $closing={closing}
      onClick={(e) => {
        if (busy) return;
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <Card $closing={closing} onClick={(e) => e.stopPropagation()}>
        <Header>
          <TitleGroup>
            <Title>
              {mode === 'first-time' ? 'Platform connected!' : 'Edit connected account'}
            </Title>
            <Desc>
              Tell us what information to pay attention to or ignore. The more details we
              have, the more personalized your experience will be.
            </Desc>
          </TitleGroup>
          <CloseBtn onClick={requestClose} disabled={busy} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </CloseBtn>
        </Header>

        <AccountPill>
          <AccountIconWrap>{accountIcon}</AccountIconWrap>
          {accountName}
        </AccountPill>

        <Field>
          <FieldLabel htmlFor="connection-prefs-attention">
            Pay attention to these (optional)
          </FieldLabel>
          <Textarea
            id="connection-prefs-attention"
            value={attention}
            onChange={(e) => onAttentionChange(e.target.value)}
            placeholder="e.g. school emails, schedule updates, field trip notices..."
            disabled={busy}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="connection-prefs-ignore">
            Ignore these (optional)
          </FieldLabel>
          <Textarea
            id="connection-prefs-ignore"
            value={ignore}
            onChange={(e) => onIgnoreChange(e.target.value)}
            placeholder="e.g. weekly newsletters, fundraising emails, promotional offers..."
            disabled={busy}
          />
        </Field>

        <Actions>
          {mode === 'edit' && onDisconnect ? (
            <DisconnectBtn onClick={handleDisconnect} disabled={busy}>
              {disconnecting ? 'Disconnecting\u2026' : 'Disconnect'}
            </DisconnectBtn>
          ) : (
            <span />
          )}
          <ActionGroup>
            {mode === 'edit' && (
              <CancelBtn onClick={requestClose} disabled={busy}>
                Cancel
              </CancelBtn>
            )}
            <SubmitBtn onClick={handleSubmit} disabled={busy}>
              {submitting ? 'Saving\u2026' : 'Submit'}
            </SubmitBtn>
          </ActionGroup>
        </Actions>
      </Card>
    </Overlay>,
    document.body,
  );
};

export default ConnectionPrefsModal;
