import React, { useState, useCallback, useEffect } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { theme } from '@/components/theme';
import { secondaryButtonCss } from '@/components/Button';
import { useAuth } from '@/features/auth';
/* ── Layout ── */

const ScrollContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  min-height: 0;
`;

/**
 * Two-column grid shell matching Home/Calendar/Connections so the Security
 * page's left-column content caps the same way and collapses on narrow
 * viewports. No right column here — the LeftColumn alone fills the grid
 * row up to its max-width, and `flex: 1` + `max-width: 1400px` cap the
 * content width naturally without the hard-coded `calc(100% - 404px)`
 * we had before.
 */
const Grid = styled.div`
  display: flex;
  gap: 24px;
  align-items: start;
  width: 100%;
  @media (max-width: 900px) { flex-direction: column; }
`;

const LeftColumn = styled.div`
  flex: 1;
  min-width: 0;
  max-width: 1400px;
  display: flex;
  flex-direction: column;
  padding-bottom: 48px;
  @media (max-width: 900px) { width: 100%; }
  /* No side padding on mobile — ViewContainer already supplies the
     16px page gutter, and stacking another 16px here pushes content
     to a 32px inset that doesn't match the rest of the app. */
  @media (max-width: 768px) { padding: 0 0 32px; }
`;

const SectionLabel = styled.h2`
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 500;
  color: #242424;
  letter-spacing: -0.3px;
  line-height: 24px;
  margin: 0;
`;

const SectionSubtitle = styled.p`
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: rgba(36, 36, 36, 0.75);
  letter-spacing: -0.3px;
  line-height: 20px;
  margin: 0;
`;

const SectionGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* 44px between sections — same rhythm ConnectionsView uses. */
  margin-bottom: 44px;
  &:last-child { margin-bottom: 0; }
`;

/* ── Trust Hub Banner ── */

const TrustBanner = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
  border-radius: 24px;
  background: white;
  border: 1px solid rgba(36, 36, 36, 0.05);
  /* Separate the banner from the first section below it — same rhythm as
     the 44px gap between subsequent sections. */
  margin-bottom: 44px;
`;

const TrustTopRow = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  /*
   * On mobile the "Active" badge sits above the shield + title row (per
   * Figma 1257:47509). column-reverse flips the DOM order so the badge
   * (2nd child) appears on top, with align-items:flex-start keeping it
   * left-aligned instead of stretched.
   */
  @media (max-width: 900px) {
    flex-direction: column-reverse;
    align-items: flex-start;
    gap: 16px;
  }
`;

const TrustNortonShield = styled.div`
  flex-shrink: 0;
`;

const TrustContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const TrustTitle = styled.p`
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: #2a2a2a;
  margin: 0;
  line-height: 24px;
  letter-spacing: -0.3px;
`;

const TrustSubtitle = styled.p`
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: rgba(36, 36, 36, 0.5);
  margin: 4px 0 0;
  line-height: 20px;
  letter-spacing: -0.3px;
`;

const TrustBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 9999px;
  background: rgba(1, 136, 80, 0.3);
  color: #018850;
  font-family: 'Inter', ${theme.fontFamily};
  font-size: 11px;
  font-weight: 400;
  letter-spacing: -0.3px;
  flex-shrink: 0;
`;

const TrustDivider = styled.div`
  height: 1px;
  background: #f4f4f5;
  margin-bottom: 16px;
`;

/**
 * Trust features row — three pill items with hairline dividers between them.
 * Row on desktop, column on mobile (per Figma 1257:47509). Also re-used as
 * the actual JSX below — the prior inline-styled version is retired.
 */
const TrustFeaturesRow = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  background: #DCE1DE;
  border-radius: 8px;
  padding: 16px 12px;
  @media (max-width: 900px) {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 16px;
  }
`;

const TrustFeatureCell = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  width: 150px;
  flex-shrink: 0;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: rgba(36, 36, 36, 0.5);
  letter-spacing: -0.3px;
  @media (max-width: 900px) {
    justify-content: flex-start;
    width: 100%;
  }
`;

/**
 * Hairline divider between features. Horizontal line on desktop (fills the
 * gap between two cells), full-width horizontal rule on mobile between
 * stacked rows.
 */
const TrustFeatureDivider = styled.div`
  flex: 1;
  height: 1px;
  background: rgba(36, 36, 36, 0.1);
  @media (max-width: 900px) {
    flex: none;
    width: 100%;
    height: 1px;
  }
`;

const TrustFeatureCheck = styled.div`
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ecfdf5;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const TrustFeatureLabel = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: #52525b;
`;

/* ── Cards ── */

const Card = styled.div`
  padding: 24px;
  border: 1px solid rgba(36, 36, 36, 0.05);
  border-radius: 24px;
  background: white;
`;

const EmptyCard = styled(Card)`
  border-style: dashed;
  border-color: rgba(36, 36, 36, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 40px 16px;
  gap: 16px;
`;

const EmptyIconWrapper = styled.div`
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #f4f4f5;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
`;

const EmptyTitle = styled.p`
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: #2a2a2a;
  letter-spacing: -0.3px;
  line-height: 24px;
  margin: 0;
`;

const EmptyDescription = styled.p`
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: rgba(36, 36, 36, 0.5);
  letter-spacing: -0.3px;
  line-height: 20px;
  margin: 0;
  max-width: 272px;
  text-align: center;
`;

const OutlinedButton = styled.button`
  height: 40px;
  padding: 0 16px;
  border: 2px solid #242424;
  border-radius: 24px;
  background: white;
  color: #242424;
  font-size: 13px;
  font-weight: 800;
  font-family: 'Inter', sans-serif;
  letter-spacing: -0.3px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;

  &:hover {
    background: #f5f5f5;
    border-color: rgba(36, 36, 36, 0.4);
  }
`;

const PrimaryButton = styled.button`
  padding: 8px 20px;
  border: 1px solid #242424;
  border-radius: 24px;
  background: #242424;
  color: white;
  font-size: 13px;
  font-weight: 600;
  font-family: 'Inter', ${theme.fontFamily};
  cursor: pointer;
  transition: opacity 0.15s;

  &:hover { opacity: 0.85; }
`;

const DangerButton = styled.button`
  padding: 5px 14px;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  background: #FFFFFF;
  color: #71717a;
  font-size: 12px;
  font-weight: 500;
  font-family: ${theme.fontFamily};
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: #ef4444;
    color: #ef4444;
    background: #fef2f2;
  }
`;

/* ══════════════════════════════════════
   VAULT — full credential management
   ══════════════════════════════════════ */

type CredentialType = 'login' | 'api_key' | 'ssh_key' | 'database' | 'certificate' | 'secret_note' | 'oauth_token';

interface Credential {
  id: string;
  type: CredentialType;
  name: string;
  username?: string;
  url?: string;
  createdAt: string;
}

const CREDENTIAL_TYPES: { value: CredentialType; label: string; icon: string }[] = [
  { value: 'login', label: 'Login', icon: '🔐' },
  { value: 'api_key', label: 'API Key', icon: '🔑' },
  { value: 'ssh_key', label: 'SSH Key', icon: '🖥️' },
  { value: 'database', label: 'Database', icon: '🗄️' },
  { value: 'certificate', label: 'Certificate', icon: '📜' },
  { value: 'secret_note', label: 'Secure Note', icon: '📝' },
  { value: 'oauth_token', label: 'OAuth Token', icon: '🪙' },
];

const CredentialCard = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 24px;
  border: 1px solid rgba(36, 36, 36, 0.05);
  border-radius: 24px;
  background: white;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: #fafafa;
  }
`;

const CredIcon = styled.span`
  font-size: 20px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f4f4f5;
  border-radius: 8px;
  flex-shrink: 0;
`;

const CredInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const CredName = styled.p`
  font-size: 14px;
  font-weight: 600;
  color: #18181b;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CredMeta = styled.p`
  font-size: 12px;
  color: #a1a1aa;
  margin: 2px 0 0;
`;

const CredTypeBadge = styled.span`
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  background: #f4f4f5;
  color: #71717a;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  flex-shrink: 0;
`;

/* ── Add Credential Modal ── */

const overlayFadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const modalSlideUp = keyframes`
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ${overlayFadeIn} 0.2s ease both;
`;

const ModalCard = styled.div`
  width: 420px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  background: white;
  border-radius: 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  padding: 32px;
  animation: ${modalSlideUp} 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
`;

const ModalTitle = styled.h3`
  font-size: 18px;
  font-weight: 700;
  color: #18181b;
  margin: 0 0 20px;
`;

const ModalSubtitle = styled.p`
  font-size: 13px;
  color: #71717a;
  margin: -12px 0 20px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const FormField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const FormLabel = styled.label`
  font-size: 12px;
  font-weight: 600;
  color: #52525b;
`;

const TextInput = styled.input`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #FFFFFF;
  color: #18181b;
  font-size: 14px;
  font-family: ${theme.fontFamily};
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;

  &::placeholder { color: #a1a1aa; }
  &:focus {
    border-color: #216869;
    box-shadow: 0 0 0 3px rgba(33, 104, 105, 0.1);
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #FFFFFF;
  color: #18181b;
  font-size: 14px;
  font-family: ${theme.fontFamily};
  outline: none;
  transition: border-color 0.15s;
  resize: vertical;
  min-height: 80px;
  line-height: 1.5;
  box-sizing: border-box;

  &::placeholder { color: #a1a1aa; }
  &:focus {
    border-color: #216869;
    box-shadow: 0 0 0 3px rgba(33, 104, 105, 0.1);
  }
`;

const TypeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  @media (max-width: 480px) { grid-template-columns: repeat(3, 1fr); }
  @media (max-width: 380px) { grid-template-columns: repeat(2, 1fr); }
`;

const TypeOption = styled.button<{ $selected: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 6px;
  border: 1.5px solid ${p => p.$selected ? '#216869' : '#e4e4e7'};
  border-radius: 10px;
  background: ${p => p.$selected ? 'rgba(33, 104, 105, 0.04)' : '#FFFFFF'};
  cursor: pointer;
  transition: all 0.15s;
  font-family: ${theme.fontFamily};

  &:hover {
    border-color: ${p => p.$selected ? '#216869' : '#d4d4d8'};
  }
`;

const TypeEmoji = styled.span`
  font-size: 20px;
`;

const TypeLabel = styled.span<{ $selected: boolean }>`
  font-size: 10px;
  font-weight: 600;
  color: ${p => p.$selected ? '#216869' : '#71717a'};
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
`;

const CancelButton = styled.button`
  padding: 9px 20px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #FFFFFF;
  color: #71717a;
  font-size: 13px;
  font-weight: 600;
  font-family: ${theme.fontFamily};
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: #f4f4f5;
    color: #18181b;
  }
`;

/* Login-specific fields */
const LOGIN_FIELDS = ['username', 'password', 'url', 'notes'] as const;
const API_KEY_FIELDS = ['key', 'service', 'notes'] as const;
const SSH_FIELDS = ['host', 'username', 'privateKey', 'passphrase'] as const;
const DB_FIELDS = ['host', 'port', 'database', 'username', 'password'] as const;

function getFieldsForType(type: CredentialType): readonly string[] {
  switch (type) {
    case 'login': return LOGIN_FIELDS;
    case 'api_key': return API_KEY_FIELDS;
    case 'ssh_key': return SSH_FIELDS;
    case 'database': return DB_FIELDS;
    case 'certificate': return ['certificate', 'privateKey', 'passphrase'];
    case 'secret_note': return ['note'];
    case 'oauth_token': return ['accessToken', 'refreshToken', 'service', 'expiresAt'];
    default: return ['value'];
  }
}

function fieldLabel(f: string): string {
  return f
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, c => c.toUpperCase())
    .replace('Url', 'URL')
    .replace('Ssh', 'SSH');
}

/* ══════════════════════════════════════
   IDENTITY — modern card layout
   ══════════════════════════════════════ */

const IdentityGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  /* Stack to single-column at 900px to match the rest of Security's
     responsive breakpoint. */
  @media (max-width: 900px) { grid-template-columns: 1fr; gap: 12px; }
`;

const PersonaCard = styled.div<{ $accent: string }>`
  border: 1px solid rgba(36, 36, 36, 0.05);
  border-radius: 24px;
  background: white;
  overflow: hidden;
`;

const PersonaBanner = styled.div<{ $color: string }>`
  height: 48px;
  background: linear-gradient(135deg, ${p => p.$color} 0%, ${p => p.$color}cc 100%);
  position: relative;
`;

const AvatarCircle = styled.div<{ $color: string }>`
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, ${p => p.$color} 0%, ${p => p.$color}dd 100%);
  border: 3px solid #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  bottom: -26px;
  left: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
`;

const AvatarEmoji = styled.span`
  font-size: 24px;
`;

const PersonaBody = styled.div`
  padding: 36px 20px 20px;
`;

const PersonaName = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
`;

const PersonaNameText = styled.span`
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 500;
  color: #2a2a2a;
  letter-spacing: -0.3px;
  line-height: 24px;
`;

const PersonaRole = styled.p`
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: rgba(36, 36, 36, 0.5);
  letter-spacing: -0.3px;
  line-height: 20px;
  margin: 0;
`;

const EditBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: #f4f4f5;
  border-radius: 6px;
  cursor: pointer;
  color: #a1a1aa;
  transition: all 0.15s;

  &:hover {
    background: rgba(33, 104, 105, 0.1);
    color: #216869;
  }
`;

const PersonaDetail = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;

  &:not(:last-child) {
    border-bottom: 1px solid #f8f8f8;
  }
`;

const DetailLabel = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: #a1a1aa;
`;

const DetailValue = styled.span<{ $muted?: boolean }>`
  font-size: 13px;
  font-weight: 500;
  color: ${p => p.$muted ? '#d4d4d8' : '#18181b'};
`;

/**
 * "+ Create email" CTA inside the AI-agent persona card. The original
 * 24px-tall badge was a bespoke compact variant; promoting it to the
 * DS secondary (M) so the Identity row reads as a first-class action,
 * not a tag. The surrounding card has enough horizontal room to host
 * the standard M padding without clipping.
 */
const EmailBadge = styled.button`
  ${secondaryButtonCss('M')}
`;

const EmailActiveTag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #10b981;
`;

const EmailDot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
`;

/* Behavior toggle */

const BehaviorSection = styled.div`
  margin-top: 16px;
`;

const BehaviorLabel = styled.p`
  font-size: 11px;
  font-weight: 700;
  color: #a1a1aa;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 10px;
`;

const BehaviorToggle = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
`;

const BehaviorOption = styled.button<{ $active: boolean }>`
  padding: 14px 16px;
  border: 1.5px solid ${p => p.$active ? '#216869' : '#e4e4e7'};
  border-radius: 12px;
  background: ${p => p.$active ? 'rgba(33, 104, 105, 0.04)' : '#FFFFFF'};
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  font-family: ${theme.fontFamily};
  position: relative;
  overflow: hidden;

  ${p => p.$active && `
    &::after {
      content: '✓';
      position: absolute;
      top: 8px;
      right: 10px;
      font-size: 12px;
      color: #216869;
      font-weight: 700;
    }
  `}

  &:hover {
    border-color: ${p => p.$active ? '#216869' : '#d4d4d8'};
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }
`;

const BehaviorTitle = styled.p`
  font-size: 13px;
  font-weight: 600;
  color: #18181b;
  margin: 0 0 3px;
`;

const BehaviorDesc = styled.p`
  font-size: 11px;
  color: #71717a;
  margin: 0;
  line-height: 1.4;
`;

/* ── Email Creation Modal — multi-step ── */

const confetti = keyframes`
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(-60px) rotate(720deg); opacity: 0; }
`;

const pulse = keyframes`
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
`;

const EmailModalContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
`;

const EmailModalIcon = styled.div`
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: linear-gradient(135deg, #216869 0%, #143f40 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  box-shadow: 0 8px 24px rgba(33, 104, 105, 0.3);
`;

const EmailModalTitle = styled.h3`
  font-size: 20px;
  font-weight: 700;
  color: #18181b;
  margin: 0 0 8px;
`;

const EmailModalDesc = styled.p`
  font-size: 14px;
  color: #71717a;
  margin: 0 0 28px;
  line-height: 1.5;
  max-width: 320px;
`;

const EmailComposer = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  border: 2px solid #e4e4e7;
  border-radius: 12px;
  overflow: hidden;
  background: #FFFFFF;
  margin-bottom: 8px;
  transition: border-color 0.2s;

  &:focus-within {
    border-color: #216869;
    box-shadow: 0 0 0 4px rgba(33, 104, 105, 0.1);
  }
`;

const EmailComposerInput = styled.input`
  flex: 1;
  padding: 14px 16px;
  border: none;
  outline: none;
  font-size: 16px;
  font-weight: 600;
  font-family: ${theme.fontFamily};
  color: #18181b;
  min-width: 0;
  background: transparent;

  &::placeholder { color: #d4d4d8; }
`;

const EmailComposerDomain = styled.span`
  font-size: 15px;
  font-weight: 600;
  color: #216869;
  padding-right: 16px;
  white-space: nowrap;
  user-select: none;
`;

const EmailPreview = styled.p`
  font-size: 12px;
  color: #a1a1aa;
  margin: 0 0 24px;
  min-height: 18px;
`;

const SuccessIcon = styled.div`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.3);
  animation: ${pulse} 1.5s ease-in-out infinite;
`;

const ConfettiParticle = styled.div<{ $x: number; $delay: number; $color: string }>`
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: ${p => p.$color};
  left: ${p => p.$x}%;
  top: 40%;
  animation: ${confetti} 1.2s ease-out ${p => p.$delay}s both;
`;

const SuccessEmail = styled.p`
  font-size: 18px;
  font-weight: 700;
  color: #18181b;
  margin: 0 0 6px;
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
  letter-spacing: -0.5px;
`;

const SuccessDesc = styled.p`
  font-size: 14px;
  color: #71717a;
  margin: 0 0 28px;
`;

/* ══════════════════════════════════════
   VIRTUAL CREDIT CARD — flip animation
   ══════════════════════════════════════ */

const CreditCardOuter = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const CardPerspective = styled.div`
  perspective: 1000px;
  width: 340px;
  height: 214px;
  margin: 0 auto;
  @media (max-width: 480px) { width: 100%; max-width: 300px; height: auto; aspect-ratio: 340 / 214; }
`;

const flipAnimation = keyframes`
  from { transform: rotateY(0deg); }
  to { transform: rotateY(180deg); }
`;

const CardInner = styled.div<{ $flipped: boolean }>`
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.7s cubic-bezier(0.4, 0, 0.2, 1);
  transform-style: preserve-3d;
  cursor: pointer;
  ${p => p.$flipped && css`transform: rotateY(180deg);`}
`;

const CardFace = styled.div`
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  border-radius: 16px;
  overflow: hidden;
`;

const CardFront = styled(CardFace)`
  background: linear-gradient(135deg, #216869 0%, #143f40 100%);
  padding: 22px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow: 0 8px 32px rgba(33, 104, 105, 0.25), 0 2px 8px rgba(0, 0, 0, 0.08);
`;

const CardBack = styled(CardFace)`
  background: linear-gradient(135deg, #5b4a9e 0%, #3d2d7a 100%);
  transform: rotateY(180deg);
  padding: 22px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow: 0 8px 32px rgba(33, 104, 105, 0.25), 0 2px 8px rgba(0, 0, 0, 0.08);
`;

const CardDecoration = styled.div`
  position: absolute;
  top: -40px;
  right: -40px;
  width: 160px;
  height: 160px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
`;

const CardDecorationSmall = styled.div`
  position: absolute;
  bottom: -20px;
  left: -20px;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.04);
`;

const CardTopRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  z-index: 1;
`;

const CardChip = styled.div`
  width: 36px;
  height: 26px;
  border-radius: 5px;
  background: linear-gradient(135deg, #e8d5a0 0%, #c9a84c 100%);
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 4px;
    right: 4px;
    height: 1px;
    background: rgba(0, 0, 0, 0.15);
  }

  &::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 4px;
    bottom: 4px;
    width: 1px;
    background: rgba(0, 0, 0, 0.1);
  }
`;

const CardBrand = styled.span`
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.7);
  letter-spacing: 1.5px;
  text-transform: uppercase;
`;

const CardNumber = styled.p`
  font-size: 17px;
  font-weight: 500;
  color: #FFFFFF;
  letter-spacing: 3px;
  margin: 0;
  position: relative;
  z-index: 1;
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
`;

const CardBottomRow = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  position: relative;
  z-index: 1;
`;

const CardDetail = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const CardDetailLabel = styled.span`
  font-size: 8px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const CardDetailValue = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: #FFFFFF;
  letter-spacing: 1px;
`;

const FlipHint = styled.p`
  font-size: 11px;
  color: #a1a1aa;
  text-align: center;
  margin: 0;
`;

/* Card back */

const MagStripe = styled.div`
  width: 100%;
  height: 36px;
  background: rgba(0, 0, 0, 0.3);
  margin: 0 -22px;
  padding-left: 22px;
  position: relative;
  width: calc(100% + 44px);
`;

const BackRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const BackLabel = styled.span`
  font-size: 9px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.8px;
`;

const BackValue = styled.span`
  font-size: 15px;
  font-weight: 600;
  color: #FFFFFF;
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
  letter-spacing: 2px;
`;

const BackDetailRow = styled.div`
  display: flex;
  justify-content: space-between;
`;

const BackDetail = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

/* Balance & limits */

const BalanceRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const BalanceInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const BalanceLabel = styled.span`
  font-size: 12px;
  color: #71717a;
  font-weight: 500;
`;

const BalanceAmount = styled.span`
  font-size: 22px;
  font-weight: 700;
  color: #18181b;
`;

const LimitRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-top: 1px solid #f4f4f5;
`;

const LimitLabel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const LimitTitle = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: #18181b;
`;

const LimitDesc = styled.span`
  font-size: 12px;
  color: #a1a1aa;
`;

const LimitInput = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const LimitDollar = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #71717a;
`;

const LimitField = styled.input`
  width: 80px;
  padding: 7px 10px;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  background: #FFFFFF;
  font-size: 14px;
  font-weight: 600;
  color: #18181b;
  font-family: ${theme.fontFamily};
  outline: none;
  text-align: right;
  box-sizing: border-box;

  &:focus {
    border-color: #216869;
    box-shadow: 0 0 0 3px rgba(33, 104, 105, 0.1);
  }
`;

const CardDisclaimer = styled.p`
  font-size: 12px;
  color: #a1a1aa;
  margin: 0;
  line-height: 1.4;
`;

/* ── Add Funds Modal ── */

const FundsAmountGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
`;

const FundsAmountBtn = styled.button<{ $selected: boolean }>`
  padding: 14px;
  border: 1.5px solid ${p => p.$selected ? '#216869' : '#e4e4e7'};
  border-radius: 10px;
  background: ${p => p.$selected ? 'rgba(33, 104, 105, 0.04)' : '#FFFFFF'};
  cursor: pointer;
  transition: all 0.15s;
  font-family: ${theme.fontFamily};
  font-size: 16px;
  font-weight: 700;
  color: ${p => p.$selected ? '#216869' : '#18181b'};

  &:hover {
    border-color: ${p => p.$selected ? '#216869' : '#d4d4d8'};
  }
`;

const CustomAmountRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
`;

const CustomAmountLabel = styled.span`
  font-size: 13px;
  color: #71717a;
  white-space: nowrap;
`;

/* ── Icons ── */

const LockIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="11" width="18" height="11" rx="2" stroke="#a1a1aa" strokeWidth="1.8" fill="none" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#a1a1aa" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    <circle cx="12" cy="16.5" r="1.5" fill="#a1a1aa" />
  </svg>
);

const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M16.474 5.408l2.118 2.118m-.756-3.982L12.109 9.27a2.118 2.118 0 0 0-.58 1.082l-.634 3.174 3.174-.634a2.118 2.118 0 0 0 1.082-.58l5.727-5.727a1.853 1.853 0 1 0-2.621-2.621z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M19 15v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

/* ══════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════ */

const FUND_AMOUNTS = [10, 25, 50, 100, 250, 500];

const SecurityView: React.FC = () => {
  const { authState, updateDisplayName } = useAuth();

  /* ── Identity state ── */
  const [userName, setUserName] = useState(authState.displayName ?? '');
  const [clawName, setClawName] = useState('AI Assistant');

  /* Sync when auth profile loads */
  useEffect(() => {
    if (authState.displayName && !userName) {
      setUserName(authState.displayName);
    }
  }, [authState.displayName]); // eslint-disable-line react-hooks/exhaustive-deps
  const [clawEmail, setClawEmail] = useState('');
  const [behavior, setBehavior] = useState<'as_me' | 'as_agent'>('as_me');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState('');
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailStep, setEmailStep] = useState<'create' | 'success'>('create');
  const [emailDraft, setEmailDraft] = useState('');

  /* ── Card state ── */
  const [cardFlipped, setCardFlipped] = useState(false);
  const [spendingLimit, setSpendingLimit] = useState('50');
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [selectedFundAmount, setSelectedFundAmount] = useState<number | null>(50);
  const [customFundAmount, setCustomFundAmount] = useState('');

  /* ── Identity inline edit ── */
  const startEdit = (field: string, value: string) => {
    setEditingField(field);
    setEditBuffer(value);
  };

  const commitEdit = () => {
    if (editingField === 'userName') {
      setUserName(editBuffer);
      updateDisplayName(editBuffer);
    } else if (editingField === 'clawName') {
      setClawName(editBuffer);
    }
    setEditingField(null);
    setEditBuffer('');
  };

  return (
    <>
      <Grid>
        <LeftColumn>

        {/* ═══ TRUST HUB BANNER ═══ */}
        <TrustBanner>
          <TrustTopRow>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              <TrustNortonShield>
                <img src="/norton-logo.svg" alt="Norton" width="44" height="44" />
              </TrustNortonShield>
              <TrustContent>
                <TrustTitle>Protected by Agent Trust Hub</TrustTitle>
                <TrustSubtitle>Your credentials, actions, and data are secured with enterprise-grade protection.</TrustSubtitle>
              </TrustContent>
            </div>
            <TrustBadge>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#018850" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Active
            </TrustBadge>
          </TrustTopRow>
          <TrustFeaturesRow>
            <TrustFeatureCell>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(36,36,36,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              AES-256 Encryption
            </TrustFeatureCell>
            <TrustFeatureDivider />
            <TrustFeatureCell>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(36,36,36,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>
              Zero Data Training
            </TrustFeatureCell>
            <TrustFeatureDivider />
            <TrustFeatureCell>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(36,36,36,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Audited Actions
            </TrustFeatureCell>
          </TrustFeaturesRow>
        </TrustBanner>


        {/* ═══ IDENTITY ═══ */}
        <SectionGroup>
          <SectionLabel>Identity</SectionLabel>
          <SectionSubtitle>Who you are and how the assistant represents you</SectionSubtitle>

          <IdentityGrid>
            {/* ME card */}
            <PersonaCard $accent="#3b82f6">
              <div style={{ padding: 24 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(36,36,36,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, fontSize: 20, overflow: 'clip' }}>😊</div>
                <PersonaName>
                  {editingField === 'userName' ? (
                    <TextInput
                      value={editBuffer}
                      onChange={e => setEditBuffer(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={e => e.key === 'Enter' && commitEdit()}
                      autoFocus
                      style={{ width: '100%', padding: '6px 10px', fontSize: 15, fontWeight: 600 }}
                    />
                  ) : (
                    <PersonaNameText>{userName || '<username>'}</PersonaNameText>
                  )}
                </PersonaName>
                <PersonaRole>Owner</PersonaRole>
              </div>
            </PersonaCard>

            {/* MY NEOCLAW card */}
            <PersonaCard $accent="#216869">
              <div style={{ padding: 24 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(36,36,36,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, fontSize: 20, overflow: 'clip' }}>🤖</div>
                <PersonaName>
                  {editingField === 'clawName' ? (
                    <TextInput
                      value={editBuffer}
                      onChange={e => setEditBuffer(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={e => e.key === 'Enter' && commitEdit()}
                      autoFocus
                      style={{ width: '100%', padding: '6px 10px', fontSize: 15, fontWeight: 600 }}
                    />
                  ) : (
                    <PersonaNameText>{clawName}</PersonaNameText>
                  )}
                </PersonaName>
                <PersonaRole>Your AI Agent</PersonaRole>
                <PersonaDetail>
                  <DetailLabel>Email</DetailLabel>
                  {clawEmail ? (
                    <EmailActiveTag><EmailDot />{clawEmail}@neoclawmail.com</EmailActiveTag>
                  ) : (
                    <EmailBadge onClick={() => { setShowEmailModal(true); setEmailStep('create'); setEmailDraft(''); }}>
                      + Create email
                    </EmailBadge>
                  )}
                </PersonaDetail>
              </div>
            </PersonaCard>
          </IdentityGrid>

          {/* Behavior toggle — hidden for now */}
        </SectionGroup>

        {/* ═══ VIRTUAL CREDIT CARD ═══ */}
        <SectionGroup>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SectionLabel style={{ margin: 0 }}>Virtual Credit Card</SectionLabel>
            <span style={{
              padding: '3px 10px',
              borderRadius: 20,
              background: 'linear-gradient(135deg, rgba(66,133,244,0.08) 0%, #ede9fe 100%)',
              color: '#216869',
              fontSize: 10,
              fontWeight: 700,
              fontFamily: "'Inter', sans-serif",
              letterSpacing: 0.5,
              textTransform: 'uppercase' as const,
              whiteSpace: 'nowrap' as const,
            }}>Coming Soon</span>
          </div>
          <SectionSubtitle>Fund tasks that require purchases</SectionSubtitle>

          <div style={{ position: 'relative' }}>
            <div style={{ opacity: 0.45, pointerEvents: 'none', filter: 'grayscale(0.3)', userSelect: 'none' as const }}>
              <CreditCardOuter>
                <CardPerspective>
                  <CardInner $flipped={false}>
                    {/* FRONT */}
                    <CardFront>
                      <CardDecoration />
                      <CardDecorationSmall />
                      <CardTopRow>
                        <CardChip />
                        <CardBrand>AI Assistant</CardBrand>
                      </CardTopRow>
                      <CardNumber>&bull;&bull;&bull;&bull; &nbsp;&bull;&bull;&bull;&bull; &nbsp;&bull;&bull;&bull;&bull; &nbsp;4242</CardNumber>
                      <CardBottomRow>
                        <CardDetail>
                          <CardDetailLabel>Card Holder</CardDetailLabel>
                          <CardDetailValue>{clawName.toUpperCase()}</CardDetailValue>
                        </CardDetail>
                        <CardDetail>
                          <CardDetailLabel>Expires</CardDetailLabel>
                          <CardDetailValue>12/28</CardDetailValue>
                        </CardDetail>
                      </CardBottomRow>
                    </CardFront>

                    {/* BACK */}
                    <CardBack>
                      <MagStripe />
                      <BackRow>
                        <BackDetailRow>
                          <BackDetail>
                            <BackLabel>Card Number</BackLabel>
                            <BackValue>4242 8080 1234 4242</BackValue>
                          </BackDetail>
                        </BackDetailRow>
                        <BackDetailRow>
                          <BackDetail>
                            <BackLabel>CVV</BackLabel>
                            <BackValue>321</BackValue>
                          </BackDetail>
                          <BackDetail>
                            <BackLabel>Expires</BackLabel>
                            <BackValue>12/28</BackValue>
                          </BackDetail>
                          <BackDetail>
                            <BackLabel>ZIP</BackLabel>
                            <BackValue>94102</BackValue>
                          </BackDetail>
                        </BackDetailRow>
                      </BackRow>
                      <CardBrand style={{ textAlign: 'right' }}>Virtual Card</CardBrand>
                    </CardBack>
                  </CardInner>
                </CardPerspective>

                <BalanceRow>
                  <BalanceInfo>
                    <BalanceLabel>Available Balance</BalanceLabel>
                    <BalanceAmount>$0.00</BalanceAmount>
                  </BalanceInfo>
                  <PrimaryButton>Add Funds</PrimaryButton>
                </BalanceRow>

                <LimitRow>
                  <LimitLabel>
                    <LimitTitle>Per-purchase limit</LimitTitle>
                    <LimitDesc>Max the assistant can spend on any single purchase</LimitDesc>
                  </LimitLabel>
                  <LimitInput>
                    <LimitDollar>$</LimitDollar>
                    <LimitField
                      type="number"
                      value={spendingLimit}
                      readOnly
                      min="0"
                    />
                  </LimitInput>
                </LimitRow>

                <CardDisclaimer>The assistant uses this virtual card for approved purchases only</CardDisclaimer>
              </CreditCardOuter>
            </div>
          </div>
        </SectionGroup>
        </LeftColumn>
      </Grid>

      {/* ═══ ADD FUNDS MODAL ═══ */}
      {showAddFunds && (
        <ModalOverlay onClick={() => setShowAddFunds(false)}>
          <ModalCard onClick={e => e.stopPropagation()}>
            <ModalTitle>Add Funds</ModalTitle>
            <ModalSubtitle>Choose an amount to add to your virtual card</ModalSubtitle>

            <FundsAmountGrid>
              {FUND_AMOUNTS.map(amt => (
                <FundsAmountBtn
                  key={amt}
                  $selected={selectedFundAmount === amt}
                  onClick={() => { setSelectedFundAmount(amt); setCustomFundAmount(''); }}
                >
                  ${amt}
                </FundsAmountBtn>
              ))}
            </FundsAmountGrid>

            <CustomAmountRow>
              <CustomAmountLabel>Custom:</CustomAmountLabel>
              <LimitDollar>$</LimitDollar>
              <TextInput
                type="number"
                placeholder="0.00"
                value={customFundAmount}
                onChange={e => { setCustomFundAmount(e.target.value); setSelectedFundAmount(null); }}
                style={{ flex: 1 }}
              />
            </CustomAmountRow>

            <ModalActions>
              <CancelButton onClick={() => setShowAddFunds(false)}>Cancel</CancelButton>
              <PrimaryButton onClick={() => setShowAddFunds(false)}>
                Add ${customFundAmount || selectedFundAmount || 0}
              </PrimaryButton>
            </ModalActions>
          </ModalCard>
        </ModalOverlay>
      )}

      {/* ═══ CREATE EMAIL MODAL ═══ */}
      {showEmailModal && (
        <ModalOverlay onClick={() => setShowEmailModal(false)}>
          <ModalCard onClick={e => e.stopPropagation()} style={{ maxWidth: 440, position: 'relative', overflow: 'visible' }}>
            {emailStep === 'create' ? (
              <EmailModalContent>
                <EmailModalIcon>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </EmailModalIcon>
                <EmailModalTitle>Create an email for {clawName}</EmailModalTitle>
                <EmailModalDesc>
                  Give your agent a dedicated email address. It can receive messages, confirmations, and notifications on your behalf.
                </EmailModalDesc>
                <EmailComposer>
                  <EmailComposerInput
                    placeholder="yourname"
                    value={emailDraft}
                    onChange={e => setEmailDraft(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                    autoFocus
                  />
                  <EmailComposerDomain>@neoclawmail.com</EmailComposerDomain>
                </EmailComposer>
                <EmailPreview>
                  {emailDraft ? `${emailDraft}@neoclawmail.com` : 'Choose a username above'}
                </EmailPreview>
                <ModalActions style={{ width: '100%' }}>
                  <CancelButton onClick={() => setShowEmailModal(false)}>Cancel</CancelButton>
                  <PrimaryButton
                    onClick={() => {
                      if (emailDraft.trim()) {
                        setEmailStep('success');
                      }
                    }}
                    style={{ opacity: emailDraft.trim() ? 1 : 0.4, cursor: emailDraft.trim() ? 'pointer' : 'default' }}
                  >
                    Create Email
                  </PrimaryButton>
                </ModalActions>
              </EmailModalContent>
            ) : (
              <EmailModalContent>
                <EmailModalIcon>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </EmailModalIcon>
                <EmailModalTitle>Coming Soon</EmailModalTitle>
                <EmailModalDesc>
                  Agent email is currently in development. We'll notify you when it's ready!
                </EmailModalDesc>
                <PrimaryButton onClick={() => setShowEmailModal(false)} style={{ width: '100%' }}>
                  Got it
                </PrimaryButton>
              </EmailModalContent>
            )}
          </ModalCard>
        </ModalOverlay>
      )}

    </>
  );
};

export default SecurityView;
