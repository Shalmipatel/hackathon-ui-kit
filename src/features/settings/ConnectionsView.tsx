import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styled, { keyframes } from 'styled-components';
import { theme } from '@/components/theme';
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
import {
  useIntegrations,
  useSocialAccounts,
} from '@/features/connections';
import { getGateway, getIntegrationClient, getBrowserConnectionRepository, getSystemSession } from '@/features/app/bootstrap/providers';
import { useAuth } from '@/features/auth';
import { ConnectionPrefsModal } from '@/features/connections/ConnectionPrefsModal';
import { toast } from '@/features/toast/toast-store';
import { useIsMobile } from '@/components/useIsMobile';
import type { BrowserConnection } from '@/types/browser-connection-repository.interface';
import { RemoteBrowserViewer } from '@/features/browser/RemoteBrowserViewer';
import type { BrowserStatus } from '@/features/browser/useBrowser';
import { EVENTS, track } from '@/features/analytics';

/* ══════════════════════════════════════════════════════════════
   Browser connection helpers
   ══════════════════════════════════════════════════════════════ */

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/* ══════════════════════════════════════════════════════════════
   Layout
   ══════════════════════════════════════════════════════════════ */

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
  padding-bottom: 64px;
  @media (max-width: 900px) { width: 100%; }
  @media (max-width: 768px) { padding-bottom: 40px; }
`;

const RightColumn = styled.div`
  width: 380px;
  flex-shrink: 0;
  @media (max-width: 900px) { display: none; }
`;

const SectionLabel = styled.h2`
  font-family: 'Inter', ${theme.fontFamily};
  font-size: 17px;
  font-weight: 700;
  color: #202020;
  letter-spacing: -0.3px;
  margin: 0 0 6px;
`;

const SectionGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 44px;
`;

/* Dev-only row that surfaces the Dev Settings overlay from the
   Connections page. Visually low-key — the bordered button + muted
   label keeps it out of the way of real integrations while still
   being discoverable. */
const DevSettingsRow = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 16px;
  margin-bottom: 24px;
  border: 1px dashed rgba(36, 36, 36, 0.18);
  border-radius: 16px;
  background: rgba(36, 36, 36, 0.02);
`;

const DevSettingsButton = styled.button`
  ${secondaryButtonCss('M')}
`;

const SectionDesc = styled.p`
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  color: rgba(36, 36, 36, 0.5);
  margin: 0 0 14px;
  line-height: 22px;
`;

/* ── Cards ── */

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
`;

const IntegrationCard = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 22px;
  border: 1px solid rgba(36, 36, 36, 0.08);
  border-radius: 16px;
  background: white;
  animation: ${fadeUp} 0.3s ease both;
  @media (max-width: 480px) { padding: 16px; gap: 12px; }
`;

const RestrictedBadge = styled.span`
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 700;
  color: rgba(36, 36, 36, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 4px 10px;
  background: rgba(36, 36, 36, 0.06);
  border-radius: 8px;
  flex-shrink: 0;
`;

const IconWrap = styled.div`
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  & > svg { width: 28px; height: 28px; }
`;

const IntInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const IntName = styled.span`
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 600;
  color: #202020;
  display: block;
`;

const IntDesc = styled.span`
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  color: rgba(36, 36, 36, 0.45);
`;

const DesktopOnlyHint = styled.span`
  display: inline;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 700;
  color: #b45309;
  text-transform: uppercase;
  letter-spacing: 0.4px;
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const BtnSpinner = styled.span`
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(36,36,36,0.15);
  border-top-color: #242424;
  border-radius: 50%;
  animation: ${spin} 0.7s linear infinite;
  margin-right: 6px;
`;

/**
 * "Add" / "Connect" CTA on each integration row. Uses the DS secondary
 * (M) so the resting chrome and
 * hover ramp match every other secondary action across the app. The
 * `flex-shrink: 0` keeps the button from squeezing when the row's text
 * wraps on narrow cards, and the mobile padding bump gives a touch-friendly
 * 40px+ tap target at <=480px.
 */
const ActionBtn = styled.button`
  ${secondaryButtonCss('M')}
  flex-shrink: 0;
  @media (max-width: 480px) { padding: 12px 16px; }
`;

/* ── Social account pills ── */

const AccountPills = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  background: rgba(36,36,36,0.03);
  border-radius: 12px;
  padding: 12px 16px;
  margin-top: 4px;
`;

/**
 * Connected-account pill. Clickable — opens the "Edit connected account"
 * modal so the user can update preferences or disconnect. Rendered as a
 * <button> for correct semantics + focus/keyboard behavior.
 */
const Pill = styled.button`
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 12px;
  background: rgba(36,36,36,0.05);
  border: none;
  border-radius: 20px;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  color: #202020;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;

  &:hover { background: rgba(36,36,36,0.1); }
  &:hover .pill-open-icon { opacity: 0.8; }
  &:active { transform: scale(0.97); }
  &:focus-visible {
    outline: 2px solid rgba(36,36,36,0.35);
    outline-offset: 2px;
  }
`;

/**
 * Two-circle status indicator per design spec (Figma 1177:40730) — a
 * desaturated halo around a solid success-green core. Rendered as a 14px
 * layout slot so the halo doesn't collide with the text baseline.
 */
const StatusDot = styled.span`
  position: relative;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: #018850;
    opacity: 0.25;
  }

  &::after {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #018850;
  }
`;

/**
 * Trailing chevron on each connected-account pill. Signals that clicking
 * the pill opens the "Edit connected account" modal rather than being
 * inert status. Deepens on pill hover via the `.pill-open-icon` selector
 * on <Pill>.
 */
const PillOpenIcon: React.FC = () => (
  <svg
    className="pill-open-icon"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ opacity: 0.45, flexShrink: 0, marginLeft: 2, transition: 'opacity 0.15s ease' }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

/* ── "Platform connected!" / "Edit connected account" modal ── */

/**
 * One modal, two modes:
 *   - first-time: auto-opens after a brand-new OAuth/credentials connect;
 *     title "Platform connected!"; footer shows Submit only.
 *   - edit: user clicked a connected-account pill; title "Edit connected
 *     account"; footer shows Disconnect (left) + Cancel / Submit (right).
 *
 * The entrance is smoothed by a two-track animation — the backdrop fades
 * in while the card slides up a few pixels and grows from 97% scale. Both
 * complete in well under 300ms so the interaction still feels instant.
 */

const overlayFadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

const cardEnter = keyframes`
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`;

const ConnectedOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0,0,0,0.3);
  backdrop-filter: blur(2.5px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: ${overlayFadeIn} 0.18s ease-out;
`;

const ConnectedCard = styled.div`
  background: white;
  border: 1px solid rgba(36,36,36,0.05);
  border-radius: 24px;
  width: 610px;
  max-width: 100%;
  padding: 24px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.18);
  display: flex;
  flex-direction: column;
  gap: 24px;
  transform-origin: center;
  animation: ${cardEnter} 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  @media (max-width: 480px) { padding: 20px; gap: 20px; }
`;

const ConnectedHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
`;

const ConnectedTitleGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
`;

const ConnectedTitle = styled.h3`
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 15px;
  line-height: 24px;
  letter-spacing: -0.3px;
  color: #242424;
  margin: 0;
`;

const ConnectedDesc = styled.p`
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 13px;
  line-height: 20px;
  letter-spacing: -0.3px;
  color: rgba(36,36,36,0.75);
  margin: 0;
`;

const ConnectedCloseBtn = styled.button`
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
  &:hover { background: rgba(36,36,36,0.08); }
  &:disabled { opacity: 0.5; cursor: default; }
`;

const ConnectedAccountPill = styled.div`
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

const ConnectedAccountIcon = styled.div`
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

const ConnectedField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
`;

const ConnectedFieldLabel = styled.label`
  font-family: 'Inter', sans-serif;
  font-weight: 400;
  font-size: 11px;
  line-height: 16px;
  letter-spacing: -0.3px;
  color: rgba(36,36,36,0.75);
  display: block;
`;

const CONNECTED_MAX_LENGTH = 200;

const ConnectedTextarea = styled.textarea`
  width: 100%;
  height: 138px;
  resize: none;
  padding: 12px 14px;
  border: 2px solid rgba(36,36,36,0.1);
  border-radius: 8px;
  background: white;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  line-height: 20px;
  color: #242424;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s ease;

  &::placeholder { color: rgba(36,36,36,0.35); }
  &:focus { border-color: rgba(36,36,36,0.35); }
`;

const ConnectedCharCount = styled.span`
  display: block;
  text-align: right;
  font-family: 'Inter', sans-serif;
  font-weight: 400;
  font-size: 11px;
  line-height: 16px;
  color: rgba(36, 36, 36, 0.45);
  letter-spacing: -0.3px;
  margin-top: 2px;
`;

const ConnectedActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
`;

const ConnectedActionGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

/** Text-only destructive action on the left side of the edit-mode footer. */
const ConnectedDisconnectBtn = styled.button`
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

const ConnectedCancelBtn = styled.button`
  height: 40px;
  padding: 0 22px;
  border: 1.5px solid rgba(36,36,36,0.2);
  border-radius: 20px;
  background: white;
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 13px;
  color: #242424;
  cursor: pointer;
  transition: background 0.15s ease;
  &:hover { background: #f5f5f5; }
  &:disabled { opacity: 0.5; cursor: default; }
`;

const ConnectedSubmitBtn = styled.button`
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

/* ── Platform icons ── */

const GmailIcon = () => (
  <svg width="24" height="24" viewBox="52 42 88 66" xmlns="http://www.w3.org/2000/svg">
    <path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6" />
    <path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15" />
    <path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2" />
    <path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92" />
    <path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2" />
  </svg>
);

const GoogleCalIcon = () => (
  <img src="/google-calendar-icon.png" alt="Google Calendar" width="24" height="24" style={{ borderRadius: 4 }} />
);

const OtherIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="14" rx="2" />
    <path d="M3 9h18" />
  </svg>
);

const FaviconImg: React.FC<{ url: string }> = ({ url }) => {
  const domain = extractDomain(url);
  const [src, setSrc] = useState(
    `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  );
  const [fallbackStage, setFallbackStage] = useState(0);

  const handleError = () => {
    if (fallbackStage === 0) {
      setFallbackStage(2);
    }
  };

  if (fallbackStage === 2) return <OtherIcon />;
  return <img src={src} alt="" width="24" height="24" style={{ borderRadius: 6 }} onError={handleError} />;
};

/* ── Social icons ── */

const SOCIAL_ICONS: Record<string, React.ReactNode> = {
  twitter: <svg width="20" height="20" viewBox="0 0 24 24" fill="#000"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>,
  instagram: <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ig-c" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#feda75" /><stop offset="50%" stopColor="#d62976" /><stop offset="100%" stopColor="#4f5bd5" /></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="5" stroke="url(#ig-c)" strokeWidth="2" /><circle cx="12" cy="12" r="4.5" stroke="url(#ig-c)" strokeWidth="2" /></svg>,
  facebook: <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>,
  linkedin: <svg width="20" height="20" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452z" /></svg>,
  tiktok: <svg width="20" height="20" viewBox="0 0 32 32" fill="none"><path d="M22.72 8.65a5.87 5.87 0 01-3.47-2.55 5.79 5.79 0 01-.82-2.1h-4.2v17.53a3.4 3.4 0 01-3.4 3.17 3.4 3.4 0 01-3.4-3.4 3.4 3.4 0 013.4-3.4c.35 0 .7.05 1.02.14v-4.3a7.55 7.55 0 00-1.02-.07A7.62 7.62 0 003.2 21.3a7.62 7.62 0 007.63 7.62 7.62 7.62 0 007.63-7.62V13.4a10 10 0 005.87 1.9V11a5.88 5.88 0 01-1.6-2.35z" fill="#000" /></svg>,
  youtube: <svg width="20" height="20" viewBox="0 0 24 24" fill="#FF0000"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>,
  pinterest: <svg width="20" height="20" viewBox="0 0 24 24" fill="#E60023"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641 0 12.017 0z" /></svg>,
  reddit: <svg width="20" height="20" viewBox="0 0 24 24" fill="#FF4500"><path d="M12 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0z" /></svg>,
  bluesky: <svg width="20" height="20" viewBox="0 0 24 24" fill="#0085FF"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.785 2.627 3.6 3.476 6.158 3.23-4.387.426-5.56 2.313-3.124 4.203C6.916 20.158 10.365 17.87 12 14.969c1.634 2.901 5.084 5.189 8.342 2.711 2.437-1.89 1.263-3.777-3.124-4.204 2.558.247 5.373-.602 6.158-3.229.246-.828.624-5.789.624-6.479 0-.688-.139-1.86-.902-2.203-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z" /></svg>,
  threads: <svg width="20" height="20" viewBox="0 0 192 192" fill="#000"><path d="M141.537 88.988a67.6 67.6 0 00-2.518-1.143C137.537 60.538 122.616 44.905 97.562 44.745c-.114 0-.228 0-.342 0-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.731-8.695 14.724-10.548 21.348-10.548.076 0 .152 0 .228.001 8.249.052 14.474 2.452 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05-7.314-1.243-15.224-1.625-23.68-1.141-23.82 1.371-39.134 15.264-38.105 34.568.521 9.792 5.4 18.216 13.735 23.719 7.047 4.652 16.124 6.927 25.557 6.412 12.458-.683 22.231-5.436 29.049-14.127 5.178-6.6 8.453-15.153 9.899-25.93 5.937 3.583 10.337 8.298 12.767 13.966 4.132 9.635 4.373 25.468-8.546 38.376-11.319 11.308-24.925 16.2-45.488 16.351-22.809-.169-40.06-7.484-51.275-21.742C34.236 139.966 28.808 120.682 28.605 96c.203-24.682 5.631-43.966 16.133-57.317C55.954 24.425 73.204 17.11 96.013 16.941c22.975.17 40.526 7.52 52.171 21.847 5.71 7.026 10.015 15.86 12.853 26.162l16.147-4.308c-3.44-12.68-8.853-23.606-16.219-32.668C147.036 9.607 125.202.195 97.07 0h-.113C68.882.194 47.292 9.642 32.788 28.079 19.882 44.486 13.224 67.316 13.001 95.932L13 96l.001.068c.223 28.616 6.881 51.446 19.787 67.853C47.292 182.358 68.882 191.806 96.957 192h.113c25.96-.173 43.554-6.708 58.048-21.189 19.963-18.945 19.392-42.692 13.142-57.27-4.484-10.454-13.033-18.945-24.723-24.553z" /></svg>,
};


const EyeIcon = ({ open }: { open: boolean }) => (
  open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 3 18 18" />
      <path d="M10.58 10.58A2 2 0 0 0 13.42 13.42" />
      <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c6.5 0 10 7 10 7a14.8 14.8 0 0 1-2.39 3.19" />
      <path d="M6.61 6.61C4.06 8.26 2 12 2 12s3.5 7 10 7a10.7 10.7 0 0 0 4.12-.82" />
    </svg>
  )
);

/* ── Browser modal styled components ── */

const ModalOverlay = styled.div<{ $closing?: boolean }>`
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(15, 15, 15, 0.45);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ${(p) => (p.$closing ? backdropFadeOut : backdropFadeIn)} ${MODAL_BACKDROP_DURATION} ease forwards;

  @media (max-width: 768px) {
    align-items: flex-start;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
      max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
  }
`;

const ModalCard = styled.div<{ $wide?: boolean; $closing?: boolean }>`
  background: white;
  border-radius: 24px;
  width: ${p => p.$wide ? 'min(94vw, calc((94vh - 200px) * 16 / 9), 1200px)' : '460px'};
  max-width: 94vw;
  max-height: 94vh;
  display: flex;
  flex-direction: column;
  overflow: hidden auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
  transform-origin: center;
  animation: ${cardEnter} 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  @media (max-width: 768px) {
    width: 100vw;
    max-width: 100vw;
    min-height: 0;
    ${p => p.$wide ? `
      height: 100vh;
      height: 100dvh;
      max-height: 100vh;
      max-height: 100dvh;
    ` : `
      height: auto;
      max-height: 100vh;
      max-height: 100dvh;
    `}
    border-radius: 0;
    overflow: hidden;
  }
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  flex-shrink: 0;
`;

const ModalTitle = styled.h3`
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 16px;
  color: #202020;
  margin: 0;
`;

const ModalClose = styled.button`
  background: none; border: none; cursor: pointer; padding: 4px; color: #71717a; font-size: 20px; border-radius: 6px;
  &:hover { background: #f4f4f5; color: #202020; }
`;

const ModalBody = styled.div`
  padding: 0 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
`;

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 14px 24px 24px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  flex-shrink: 0;
`;

/** Scrolls browser modal content on short viewports so footer actions stay reachable. */
const BrowserModalScrollArea = styled.div<{ $wide?: boolean }>`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;

  @media (min-width: 769px) {
    overflow: ${p => (p.$wide ? 'hidden' : 'visible')};
    flex: ${p => (p.$wide ? '1 1 auto' : '0 0 auto')};
    min-height: ${p => (p.$wide ? '0' : 'unset')};
  }
`;

const PasswordInputWrap = styled.div`
  position: relative;
  width: 100%;
`;

const IframeWrap = styled.div`
  width: 100%;
  aspect-ratio: 16 / 9;
  flex-shrink: 0;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(36,36,36,0.08);
  background: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  @media (max-width: 768px) {
    border-radius: 0;
    aspect-ratio: auto;
    flex: 1;
    min-height: 0;
  }
`;

const ModalDesc = styled.p`
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  color: rgba(36,36,36,0.65);
  margin: 0;
  line-height: 22px;
`;

const SaveBtn = styled.button`
  height: 36px;
  padding: 0 20px;
  border: 2px solid #242424;
  border-radius: 18px;
  background: #feeb29;
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 13px;
  color: #242424;
  cursor: pointer;
  &:hover { background: #fde614; }
`;

const CancelBtn = styled.button`
  height: 36px;
  padding: 0 16px;
  border: 1px solid rgba(36,36,36,0.15);
  border-radius: 18px;
  background: white;
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  font-size: 13px;
  color: #242424;
  cursor: pointer;
  &:hover { background: #f9f9f9; }
`;

const DisconnectBtn = styled.button`
  height: 36px;
  padding: 0 16px;
  border: 1px solid rgba(220,38,38,0.3);
  border-radius: 18px;
  background: white;
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  font-size: 13px;
  color: #dc2626;
  cursor: pointer;
  margin-right: auto;
  &:hover { background: #fef2f2; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

/* ── Web app guide modal (3-step instructions) ── */

const GuideModalCard = styled.div<{ $compact?: boolean; $exiting?: boolean }>`
  background: white;
  border: 1px solid rgba(36,36,36,0.05);
  border-radius: 24px;
  width: ${p => p.$compact ? '460px' : 'min(94vw, 1046px)'};
  max-width: 94vw;
  max-height: 94vh;
  display: flex;
  flex-direction: column;
  gap: ${p => p.$compact ? '20px' : '32px'};
  padding: 24px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
  overflow-y: auto;
  transform-origin: center;
  animation: ${cardEnter} 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  opacity: ${p => p.$exiting ? 0 : 1};
  transform: ${p => p.$exiting ? 'translateY(-4px) scale(0.97)' : 'none'};
  transition: opacity 0.18s ease-out, transform 0.18s ease-out;

  @media (max-width: 768px) {
    width: 100vw;
    max-width: 100vw;
    height: 100vh;
    height: 100dvh;
    max-height: 100vh;
    max-height: 100dvh;
    border-radius: 0;
    gap: 20px;
    padding: 20px;
  }
`;

const UrlInput = styled.input`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid rgba(36,36,36,0.12);
  border-radius: 10px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  &:focus { border-color: rgba(36,36,36,0.3); }
`;

const GuideHeader = styled.div`
  display: flex;
  gap: 40px;
  align-items: flex-start;
  width: 100%;
`;

const GuideTitleWrap = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const GuideTitle = styled.h3`
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 15px;
  line-height: 24px;
  letter-spacing: -0.3px;
  color: #242424;
  margin: 0;
`;

const GuideSubtitle = styled.p`
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 13px;
  line-height: 20px;
  letter-spacing: -0.3px;
  color: rgba(36,36,36,0.75);
  margin: 0;
`;

const GuideSteps = styled.div`
  display: flex;
  gap: 16px;
  align-items: stretch;
  width: 100%;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const StepCard = styled.div`
  flex: 1;
  min-width: 0;
  height: 300px;
  background: #fbfaf9;
  border-radius: 24px;
  position: relative;
  overflow: hidden;

  @media (max-width: 768px) {
    height: 260px;
  }
`;

const StepBadge = styled.div`
  position: absolute;
  top: 12px;
  left: 12px;
  width: 30px;
  height: 30px;
  border-radius: 9999px;
  background: #f4f1ed;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 16px;
  line-height: 28px;
  letter-spacing: -0.3px;
  color: #242424;
  z-index: 1;
`;

const StepIllustration = styled.div`
  position: absolute;
  inset: 24px 16px auto 16px;
  height: 208px;
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;

  @media (max-width: 768px) {
    height: 168px;
  }
`;

const StepImg = styled.img`
  display: block;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
`;

const StepLabel = styled.div`
  position: absolute;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 16px;
  line-height: 28px;
  letter-spacing: -0.3px;
  color: #242424;
  white-space: nowrap;
`;

const GuideFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  width: 100%;
`;

const GuideFooterActions = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  margin-left: auto;
`;

const SkipGuideLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 13px;
  line-height: 20px;
  letter-spacing: -0.3px;
  color: #242424;
  cursor: pointer;
  user-select: none;
`;

const SkipGuideCheckbox = styled.input`
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #242424;
`;

/* ══════════════════════════════════════════════════════════════
   Component
   ══════════════════════════════════════════════════════════════ */

const PARTNER_DISABLED_INTEGRATIONS = new Set(['gmail', 'calendar']);

const ConnectionsView: React.FC = () => {
  useEffect(() => {
    track(EVENTS.CONNECTION_BROWSER_OPENED, { surface: 'connections' });
  }, []);

  const { authState } = useAuth();
  const isPartner = authState.role === 'partner';
  const { services, loading, connect, disconnect } = useIntegrations(true, 'Gmail');
  const { services: calServices, loading: calLoading, connect: calConnect, disconnect: calDisconnect } = useIntegrations(true, 'Gcal');
  const { connect: socialConnect } = useSocialAccounts(true);
  const isMobile = useIsMobile();

  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [socialConnectingId, setSocialConnectingId] = useState<string | null>(null);
  /*
   * `platform` is the human-readable name shown in the prefs modal that
   * pops up after a successful first-time browser login. We carry it on
   * the modal state so we don't have to parse it back out of the modal
   * title (which is "Connect X" / "Edit X").
   */
  const [showWebAppGuide, setShowWebAppGuide] = useState(false);
  const [browserModal, setBrowserModal] = useState<{
    title: string;
    url: string;
    slug: string;
    platform: string;
    id?: string;
    skipGuideOnSuccess?: boolean;
    autoClickSelector?: string;
    autoClickText?: string;
    autoClickDelayMs?: number;
  } | null>(null);

  /**
   * Starter-kit guard for the "secure browser" provisioning flow.
   * That flow needs a backend to spawn a remote browser instance for
   * the user to log into the third-party app — without one the modal
   * sits on "Starting secure browser..." forever. Short-circuit with
   * the same alert the OAuth Connect buttons show, then no-op.
   */
  const openBrowserModal: typeof setBrowserModal = (cfg) => {
    if (!import.meta.env.VITE_NEOCLAW_API_URL) {
      window.alert(
        "Browser-based connections need a backend — this starter kit " +
          "ships without one wired up.\n\nSet `VITE_NEOCLAW_API_URL` in " +
          "`.env.local` and restart `npm run dev` to enable the real " +
          "secure-browser flow.",
      );
      return;
    }
    setBrowserModal(cfg);
  };
  const [browserConnections, setBrowserConnections] = useState<BrowserConnection[]>([]);

  /**
   * Drives the "Platform connected!" / "Edit connected account" modal.
   *   - mode 'first-time' auto-opens after a brand-new connect; Submit only.
   *   - mode 'edit' opens when the user clicks a connected-account pill;
   *     footer shows Disconnect + Cancel + Submit so they can update
   *     preferences or remove the account.
   * `connectionType` drives the right disconnect call (Gmail/GCal OAuth
   * revoke vs. browser-connection cleanup); `accountId` is the identifier
   * each disconnect API expects. `connectionKey` is the slug used to
   * persist notes in the browser_connections table.
   */
  type ConnectionType = 'gmail' | 'gcal' | 'browser';
  const [platformConnected, setPlatformConnected] = useState<{
    mode: 'first-time' | 'edit';
    platform: string;
    accountName: string;
    accountId: string;
    connectionType: ConnectionType;
    connectionKey: string;
  } | null>(null);
  const [attentionNotes, setAttentionNotes] = useState('');
  const [ignoreNotes, setIgnoreNotes] = useState('');
  const [submittingPrefs, setSubmittingPrefs] = useState(false);
  const [disconnectingInModal, setDisconnectingInModal] = useState(false);


  // Track accounts we've already seen so we only show the "Platform connected!"
  // modal when a brand-new account appears. Seeded on first load (when the
  // initial list arrives) so pre-existing accounts don't trigger the modal.
  const seenGmailIdsRef = useRef<Set<string> | null>(null);
  const seenGcalIdsRef = useRef<Set<string> | null>(null);

  /* analytics tracking plan §3 Group 3 — `Connection OAuth Completed` carries
   * `time_in_oauth_ms`. The Settings connect path fires `OAuth Started`
   * from the click handler but observes success asynchronously via the
   * accounts-list diff effect (different stack frame, no shared
   * closure). We bridge the two via a platform-keyed start-timestamp
   * ref so the duration is honest end-to-end. Cleared after read so a
   * later silent reconnection doesn't get attributed to the first click. */
  const oauthStartedAtRef = useRef<{ gmail?: number; gcal?: number }>({});

  // `useIntegrations` initializes its state as `loading=false, services=[]`
  // *before* the first fetch kicks off, so we can't seed `seenGmailIdsRef`
  // the moment `loading` is false — we'd seed with an empty set and then
  // wrongly treat every real account as "new" when the fetch finally
  // resolves. These refs track whether we've observed the first
  // `loading: true → false` transition, which is our authoritative signal
  // that `services` reflects real API data and we can trust it.
  const gmailFirstLoadDoneRef = useRef(false);
  const gmailPrevLoadingRef = useRef(false);
  const gcalFirstLoadDoneRef = useRef(false);
  const gcalPrevLoadingRef = useRef(false);


  useEffect(() => {
    let cancelled = false;
    const loadBrowserConnections = async () => {
      try {
        const rows = await getBrowserConnectionRepository().listConnected();
        if (!cancelled) setBrowserConnections(rows);
      } catch {
        // Table may not exist yet on older instances
      }
    };
    loadBrowserConnections();
    return () => { cancelled = true; };
  }, []);

  const isBrowserConnected = useCallback(
    (slug: string) => browserConnections.some((c) => c.slug === slug && c.connected === 1),
    [browserConnections],
  );

  /*
   * Persist a successful browser login + (if it's a brand-new connection
   * for that slug) open the same prefs modal that Gmail/Gcal already
   * trigger. This is the "what should the agent focus on for this
   * account?" question — it was missing for browser-based apps, so the
   * user got silently dropped back into the connections list with no
   * follow-up.
   *
   * "Was this new?" is determined by comparing the saved row's id
   * against what was already in the local browser-connections list.
   * `upsert` returns the same row id on subsequent connects, so a
   * re-login won't re-trigger the modal.
   */
  const handleBrowserLoggedIn = useCallback(async (slug: string, url: string, platform: string) => {
    try {
      const wasAlreadyConnected = browserConnections.some(
        (c) => c.id !== undefined && c.connected === 1 && (
          slug === 'other' ? c.url === url : c.slug === slug
        ),
      );
      const saved = await getBrowserConnectionRepository().upsert(slug, url);
      setBrowserConnections((prev) => {
        const idx = prev.findIndex((c) => c.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
      if (!wasAlreadyConnected) {
        // Derive a friendly "account name" from the URL host so the prefs
        // modal's account-pill has something to show (browser apps don't
        // come with an email like Gmail/Gcal do).
        let host = '';
        try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep '' */ }
        const accountName = host || saved.name || platform;

        // Browser prefs are keyed by slug only (same for Edit via the
        // pill below). Custom 'other' apps currently share a single
        // prefs row — acknowledged limitation.
        const connectionKey = slug;

        setAttentionNotes('');
        setIgnoreNotes('');
        setPlatformConnected({
          mode: 'first-time',
          platform,
          accountName,
          accountId: saved.id,
          connectionType: 'browser',
          connectionKey,
        });
        track(EVENTS.CONNECTION_ADDED, {
          platform: slug,
          source: 'settings',
          ...(slug === 'other' ? { url } : {}),
        });
      }
    } catch (err) {
      console.warn('Failed to persist browser connection:', err);
    }
  }, [browserConnections]);

  const customOtherApps = browserConnections.filter((c) => c.slug === 'other' && c.connected === 1);

  const googleAccounts = services
    .flatMap((s) => s.accounts)
    .filter((a) => a.isConnected)
    .filter((a, i, arr) => arr.findIndex((b) => b.accountId === a.accountId) === i);

  const calendarAccounts = calServices
    .flatMap((s) => s.accounts)
    .filter((a) => a.isConnected)
    .filter((a, i, arr) => arr.findIndex((b) => b.accountId === a.accountId) === i);

  useEffect(() => {
    // Detect the true → false transition once; that's our "first load
    // has actually completed" signal. Until we've seen it, `services` is
    // the pre-fetch empty default and can't be trusted for baselining.
    if (gmailPrevLoadingRef.current && !loading) {
      gmailFirstLoadDoneRef.current = true;
    }
    gmailPrevLoadingRef.current = loading;
    if (loading || !gmailFirstLoadDoneRef.current) return;

    const currentIds = new Set(googleAccounts.map((a) => a.accountId));
    if (seenGmailIdsRef.current === null) {
      seenGmailIdsRef.current = currentIds;
      return;
    }
    const newAcc = googleAccounts.find((a) => !seenGmailIdsRef.current!.has(a.accountId));
    if (newAcc) {
      setAttentionNotes('');
      setIgnoreNotes('');
      setPlatformConnected({
        mode: 'first-time',
        platform: 'Gmail',
        accountName: newAcc.email,
        accountId: newAcc.accountId,
        connectionType: 'gmail',
        connectionKey: `gmail:${newAcc.accountId}`,
      });
      track(EVENTS.CONNECTION_OAUTH_COMPLETED, {
        platform: 'gmail',
        surface: 'settings',
        ...(oauthStartedAtRef.current.gmail
          ? { time_in_oauth_ms: Date.now() - oauthStartedAtRef.current.gmail }
          : {}),
      });
      oauthStartedAtRef.current.gmail = undefined;
      track(EVENTS.CONNECTION_ADDED, {
        platform: 'gmail',
        source: 'settings',
        account_email: newAcc.email,
      });
      seenGmailIdsRef.current = currentIds;
    }
  }, [googleAccounts, loading]);

  useEffect(() => {
    // Same first-load-gate as Gmail above — see that effect for the full
    // rationale. Without this, the pre-fetch empty `services` would seed
    // `seenGcalIdsRef` with an empty set and then fire the modal for every
    // existing calendar account once the real data arrives.
    if (gcalPrevLoadingRef.current && !calLoading) {
      gcalFirstLoadDoneRef.current = true;
    }
    gcalPrevLoadingRef.current = calLoading;
    if (calLoading || !gcalFirstLoadDoneRef.current) return;

    const currentIds = new Set(calendarAccounts.map((a) => a.accountId));
    if (seenGcalIdsRef.current === null) {
      seenGcalIdsRef.current = currentIds;
      return;
    }
    const newAcc = calendarAccounts.find((a) => !seenGcalIdsRef.current!.has(a.accountId));
    if (newAcc) {
      setAttentionNotes('');
      setIgnoreNotes('');
      setPlatformConnected({
        mode: 'first-time',
        platform: 'Google Calendar',
        accountName: newAcc.email,
        accountId: newAcc.accountId,
        connectionType: 'gcal',
        connectionKey: `gcal:${newAcc.accountId}`,
      });
      track(EVENTS.CONNECTION_OAUTH_COMPLETED, {
        platform: 'gcal',
        surface: 'settings',
        ...(oauthStartedAtRef.current.gcal
          ? { time_in_oauth_ms: Date.now() - oauthStartedAtRef.current.gcal }
          : {}),
      });
      oauthStartedAtRef.current.gcal = undefined;
      track(EVENTS.CONNECTION_ADDED, {
        platform: 'gcal',
        source: 'settings',
        account_email: newAcc.email,
      });
      seenGcalIdsRef.current = currentIds;
    }
  }, [calendarAccounts, calLoading]);

  const handleGmailConnect = useCallback(async () => {
    /* analytics tracking plan §3 Group 3 — OAuth lifecycle for the Settings
     * connect path. `Connection Added` itself is fired downstream by
     * the new-account-detection effect (line ~1047) once the freshly
     * connected account appears in `googleAccounts`. The connect()
     * helper here only opens the popup and returns; success/failure
     * is observed asynchronously via the accounts list. */
    track(EVENTS.CONNECTION_SELECTED, { platform: 'gmail', surface: 'settings' });
    track(EVENTS.CONNECTION_OAUTH_STARTED, { platform: 'gmail', surface: 'settings' });
    oauthStartedAtRef.current.gmail = Date.now();
    setConnectingId('gmail');
    await connect();
    setConnectingId(null);
  }, [connect]);

  const handleCalendarConnect = useCallback(async () => {
    track(EVENTS.CONNECTION_SELECTED, { platform: 'gcal', surface: 'settings' });
    track(EVENTS.CONNECTION_OAUTH_STARTED, { platform: 'gcal', surface: 'settings' });
    oauthStartedAtRef.current.gcal = Date.now();
    setConnectingId('gcal');
    await calConnect();
    setConnectingId(null);
  }, [calConnect]);

  /**
   * Persist the user's "pay attention to" / "ignore" notes for the open
   * connection. Saved to the browser_connections table so the data
   * survives across sessions and devices.
   */
  const handleSubmitConnectionPrefs = useCallback(async () => {
    if (!platformConnected) return;
    setSubmittingPrefs(true);
    try {
      await getBrowserConnectionRepository().updatePreferences(
        platformConnected.connectionKey,
        attentionNotes.trim(),
        ignoreNotes.trim(),
        platformConnected.platform,
      );

      getSystemSession().execute({
        type: 'user_preferences',
        payload: {
          trigger: 'connection_preferences',
          platform: platformConnected.platform,
          accountName: platformConnected.accountName,
          attention: attentionNotes.trim(),
          ignore: ignoreNotes.trim(),
        },
      }).catch(() => {});

      /*
       * Send only the booleans — not the note contents — so we can
       * answer "did the user bother to tell us what matters?" without
       * ever shipping their potentially-sensitive free-text notes to
       * analytics. Platform mapping mirrors the disconnect event: for
       * browser integrations the slug lives in connectionKey.
       */
      const eventPlatform =
        platformConnected.connectionType === 'browser'
          ? platformConnected.connectionKey
          : platformConnected.connectionType;
      track(EVENTS.PREFERENCES_SAVED, {
        platform: eventPlatform,
        source: 'settings',
        mode: platformConnected.mode,
        has_attention: attentionNotes.trim().length > 0,
        has_ignore: ignoreNotes.trim().length > 0,
      });
    } catch (err) {
      console.warn('[ConnectionsView] Failed to save connection preferences:', err);
    } finally {
      setSubmittingPrefs(false);
      setPlatformConnected(null);
      setAttentionNotes('');
      setIgnoreNotes('');
    }
  }, [platformConnected, attentionNotes, ignoreNotes]);

  /** Close the modal without saving. Guarded while Submit / Disconnect is mid-flight. */
  const handleCloseModal = useCallback(() => {
    if (submittingPrefs || disconnectingInModal) return;
    setPlatformConnected(null);
    setAttentionNotes('');
    setIgnoreNotes('');
  }, [submittingPrefs, disconnectingInModal]);

  /**
   * Click handler for a connected-account pill. Opens the modal in edit
   * mode with previously-saved notes pre-filled from the database.
   */
  const openEditFor = useCallback(
    async (args: {
      platform: string;
      accountName: string;
      accountId: string;
      connectionType: ConnectionType;
    }) => {
      /*
       * Key layout is type-specific so it matches whatever was written
       * on the first-time connect:
       *   gmail/gcal → `${connectionType}:${accountId}`
       *   browser    → just the slug. Browser rows are keyed by the
       *     raw slug in the repo, not a prefixed key.
       */
      const connectionKey = args.connectionType === 'browser'
        ? args.accountId
        : `${args.connectionType}:${args.accountId}`;
      let attention = '';
      let ignore = '';
      try {
        const row = await getBrowserConnectionRepository().getBySlug(connectionKey);
        if (row) {
          attention = row.focus_text ?? '';
          ignore = row.ignore_text ?? '';
        }
      } catch {
        /* fetch failed — fall through to empty textareas */
      }
      setAttentionNotes(attention);
      setIgnoreNotes(ignore);
      setPlatformConnected({
        mode: 'edit',
        platform: args.platform,
        accountName: args.accountName,
        accountId: args.accountId,
        connectionType: args.connectionType,
        connectionKey,
      });
    },
    [],
  );

  /**
   * Disconnect the account currently open in the modal. Dispatches to
   * the right API based on connectionType, clears the persisted
   * preferences, and forgets the seen-id so a fresh reconnect will
   * re-trigger the first-time modal.
   */
  const handleDisconnectInModal = useCallback(async () => {
    if (!platformConnected || platformConnected.mode !== 'edit') return;
    setDisconnectingInModal(true);
    try {
      if (platformConnected.connectionType === 'gmail') {
        await disconnect(platformConnected.accountId);
        seenGmailIdsRef.current?.delete(platformConnected.accountId);
      } else if (platformConnected.connectionType === 'gcal') {
        await calDisconnect(platformConnected.accountId);
        seenGcalIdsRef.current?.delete(platformConnected.accountId);
      } else if (platformConnected.connectionType === 'browser') {
        /*
         * Drop it from the local list first so the card flips back to
         * its disconnected affordance immediately; deleteBySlug below
         * clears the row + prefs from the repo.
         */
        setBrowserConnections((prev) =>
          prev.filter((c) => c.slug !== platformConnected.connectionKey),
        );
      }
      getBrowserConnectionRepository()
        .deleteBySlug(platformConnected.connectionKey)
        .catch(() => {});
      /*
       * For gmail/gcal the event platform mirrors the connectionType.
       * For browser connections the slug lives in `connectionKey` —
       * see `openEditFor`'s key-layout note.
       */
      const eventPlatform =
        platformConnected.connectionType === 'browser'
          ? platformConnected.connectionKey
          : platformConnected.connectionType;
      /*
       * accountName for gmail/gcal is the connected email (set on line
       * ~1042 / ~1074 when the new-account effect fires). For browser
       * connections it's a display label, which isn't meaningful as an
       * email — so we only include account_email for the Google
       * integrations to keep the property clean.
       */
      const isGoogle =
        platformConnected.connectionType === 'gmail' ||
        platformConnected.connectionType === 'gcal';
      track(EVENTS.CONNECTION_REMOVED, {
        platform: eventPlatform,
        source: 'settings',
        ...(isGoogle && platformConnected.accountName
          ? { account_email: platformConnected.accountName }
          : {}),
      });
      toast({ title: 'Account disconnected' });
    } catch (err) {
      console.warn('[ConnectionsView] Failed to disconnect:', err);
    } finally {
      setDisconnectingInModal(false);
      setPlatformConnected(null);
      setAttentionNotes('');
      setIgnoreNotes('');
    }
  }, [platformConnected, disconnect, calDisconnect]);

  /*
   * Open the prefs modal in edit mode for a browser-based integration.
   * Browser apps don't have an email like Gmail/Gcal, so we use the URL
   * hostname as the account-pill label.
   */
  const openEditForBrowser = useCallback(
    (slug: string, platform: string) => {
      const conn = browserConnections.find((c) => c.slug === slug && c.connected === 1);
      if (!conn) return;
      let host = '';
      try { host = new URL(conn.url).hostname.replace(/^www\./, ''); } catch { /* keep '' */ }
      const accountName = host || conn.name || 'Connected';
      void openEditFor({
        platform,
        accountName,
        accountId: slug,
        connectionType: 'browser',
      });
    },
    [browserConnections, openEditFor],
  );

  const handleSocialConnect = useCallback(async (id: string) => {
    setSocialConnectingId(id);
    await socialConnect(id);
    setSocialConnectingId(null);
  }, [socialConnect]);

  const gmailConnected = googleAccounts.length > 0;

  return (
    <>
    <Grid>
      <LeftColumn>
          {/* Starter kit: Developer row removed. The Dev Settings
              modal is still reachable in dev via:
                  window.dispatchEvent(new Event('app:open-dev-settings'))
              executed from devtools. Re-add a visible button by restoring
              the previous {import.meta.env.DEV && <DevSettingsRow>...} block. */}
          {/* ── Integrations ── */}
          <SectionLabel>Integrations</SectionLabel>
          <SectionDesc>Connect the apps and services you use.</SectionDesc>
          <SectionGroup>
            {/* Gmail and Google Calendar integration cards were removed —
                the starter focuses on browser-based integrations. The
                OAuth handlers (handleGmailConnect / handleCalendarConnect)
                and account-pill plumbing are still in this file for any
                consumer of the starter kit who wants to re-surface those cards. */}

            {/* Starter kit: the baseline integration list is Gmail,
                Google Calendar, and a generic "Any messaging app or
                platform" card. The useIntegrations hook still exposes
                the underlying state, so re-adding a per-platform card
                is a paste of a single IntegrationCard block. */}

            {/* Custom "Other" apps (persisted) */}
            {customOtherApps.map((app) => (
              <IntegrationCard key={app.id}>
                <IconWrap><FaviconImg url={app.url} /></IconWrap>
                <IntInfo>
                  <IntName>{app.name}</IntName>
                  <IntDesc>
                    {extractDomain(app.url)}
                    {isMobile && <> · <DesktopOnlyHint>desktop only</DesktopOnlyHint></>}
                  </IntDesc>
                </IntInfo>
                <ActionBtn onClick={() => {
                  if (isMobile) {
                    toast({
                      title: `Open on desktop to edit ${app.name}`,
                      description: 'This connection can only be managed on desktop.',
                    });
                    return;
                  }
                  openBrowserModal({ title: `Edit ${app.name}`, url: app.url, slug: 'other', platform: app.name || 'Custom App', id: app.id });
                }}>
                  Edit
                </ActionBtn>
              </IntegrationCard>
            ))}

            {/* Other (add new) */}
            <IntegrationCard>
              <IconWrap><OtherIcon /></IconWrap>
              <IntInfo>
                <IntName>Any messaging app or platform</IntName>
                <IntDesc>
                  Messaging apps, social platforms, and more
                  {isMobile && <> · <DesktopOnlyHint>desktop only</DesktopOnlyHint></>}
                </IntDesc>
              </IntInfo>
              <ActionBtn onClick={() => {
                if (isMobile) {
                  toast({
                    title: 'Open on desktop to connect',
                    description: 'Browser-based connections can only be set up on desktop.',
                  });
                  return;
                }
                /* Trip the starter-kit guard first via openBrowserModal,
                 * which alerts and no-ops when there's no backend. Avoids
                 * dragging the user through the URL guide modal only to
                 * land on a permanent "Starting secure browser..." spinner. */
                if (!import.meta.env.VITE_NEOCLAW_API_URL) {
                  openBrowserModal({ title: 'Connect an app', url: '', slug: 'other', platform: 'Custom App' });
                  return;
                }
                if (shouldSkipWebAppGuide()) {
                  setBrowserModal({ title: 'Connect an app', url: '', slug: 'other', platform: 'Custom App' });
                } else {
                  setShowWebAppGuide(true);
                }
              }}>Connect</ActionBtn>
            </IntegrationCard>
          </SectionGroup>

      </LeftColumn>

      {/* ── 3-step guide before opening the custom URL browser modal ── */}
      {showWebAppGuide && (
        <WebAppGuideModal
          onClose={() => setShowWebAppGuide(false)}
          onSubmitUrl={(url, skipGuide) => {
            setShowWebAppGuide(false);
            openBrowserModal({ title: 'Connect an app', url, slug: 'other', platform: 'Custom App', skipGuideOnSuccess: skipGuide });
          }}
        />
      )}
      {browserModal && (
        <BrowserModalInner
          title={browserModal.title}
          targetUrl={browserModal.url}
          platformLabel={browserModal.platform}
          autoClickSelector={browserModal.autoClickSelector}
          autoClickText={browserModal.autoClickText}
          autoClickDelayMs={browserModal.autoClickDelayMs}
          onClose={() => setBrowserModal(null)}
          onLoggedIn={(finalUrl) => {
            if (browserModal.skipGuideOnSuccess) persistSkipWebAppGuide(true);
            handleBrowserLoggedIn(browserModal.slug, finalUrl, browserModal.platform);
            setBrowserModal(null);
          }}
          connectionId={browserModal.id}
          trackCurrentUrl={browserModal.slug === 'other'}
          onDisconnected={() => {
            if (browserModal.id) {
              setBrowserConnections(prev => prev.filter(c => c.id !== browserModal.id));
            }
            track(EVENTS.CONNECTION_REMOVED, {
              platform: browserModal.slug,
              source: 'settings',
            });
            setBrowserModal(null);
          }}
        />
      )}
      {/* ── "Platform connected!" / "Edit connected account" modal ── */}
      {platformConnected && (
        <ConnectionPrefsModal
          mode={platformConnected.mode}
          platform={platformConnected.platform}
          accountName={platformConnected.accountName}
          accountIcon={
            platformConnected.connectionType === 'gmail'
              ? <GmailIcon />
              : platformConnected.connectionType === 'gcal'
                ? <GoogleCalIcon />
                : <OtherIcon />
          }
          attention={attentionNotes}
          ignore={ignoreNotes}
          onAttentionChange={setAttentionNotes}
          onIgnoreChange={setIgnoreNotes}
          onSubmit={handleSubmitConnectionPrefs}
          onClose={handleCloseModal}
          onDisconnect={platformConnected.mode === 'edit' ? handleDisconnectInModal : undefined}
          submitting={submittingPrefs}
          disconnecting={disconnectingInModal}
        />
      )}

    </Grid>
    </>
  );
};

/* ── Browser modal sub-component ── */

const BrowserModalInner: React.FC<{
  title: string;
  targetUrl: string;
  onClose: () => void;
  onLoggedIn: (finalUrl: string) => void;
  connectionId?: string;
  trackCurrentUrl?: boolean;
  onDisconnected?: () => void;
  /** Optional CSS selector to auto-click after the page loads (server-side via CDP). */
  autoClickSelector?: string;
  /** Optional case-insensitive text filter applied on top of `autoClickSelector`. */
  autoClickText?: string;
  /** Optional delay (ms) before firing the auto-click — covers SPA hydration gaps. */
  autoClickDelayMs?: number;
  platformLabel?: string;
}> = ({ title, targetUrl, onClose, onLoggedIn, connectionId, onDisconnected, autoClickSelector, autoClickText, autoClickDelayMs, trackCurrentUrl = false }) => {
  const [url, setUrl] = useState(targetUrl);
  const [showBrowser, setShowBrowser] = useState(!!targetUrl);
  const [status, setStatus] = useState<BrowserStatus | null>(null);
  const [disconnectingBrowser, setDisconnectingBrowser] = useState(false);
  /*
   * Pre-fills the "Confirm web app URL" modal. We want this to reflect the
   * page the user was actually on when they clicked "I've logged in" — they
   * may have navigated past the initial entry URL during login. The remote
   * browser is rendered via noVNC, so the frontend has no DOM access to
   * read the current URL — instead the backend reports it in
   * `BrowserStatus.currentUrl` (sourced from CDP) and we latch the latest
   * non-empty value as the user navigates. Falls back to the entered URL
   * until CDP reports a page. Only updated when `trackCurrentUrl` is on.
   */
  const [latestUrl, setLatestUrl] = useState(targetUrl);
  const [confirmUrlOpen, setConfirmUrlOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { closing, requestClose, startClose } = useModalClose(onClose);

  const fetchStatus = useCallback(async () => {
    try {
      const resp = await getGateway().request('/api/neoclaw-browser/status');
      const data = await resp.json();
      if (data.success && data.data) {
        const next = data.data as BrowserStatus;
        setStatus(next);
        if (trackCurrentUrl && next.currentUrl) {
          setLatestUrl(next.currentUrl);
        }
      }
    } catch { /* retry */ }
  }, []);

  useEffect(() => {
    if (!showBrowser) return;
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [showBrowser, fetchStatus]);

  const openBrowser = () => {
    const v = url.trim();
    if (!v) return;
    const normalized = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    setUrl(normalized);
    setLatestUrl(normalized);
    setShowBrowser(true);
  };

  const handleDisconnect = async () => {
    if (!connectionId) return;
    setDisconnectingBrowser(true);
    try {
      await getGateway().request('/api/neoclaw-data/execute', {
        method: 'POST',
        body: { action: 'delete', table: 'browser_connections', where: { id: connectionId } },
      });
      setDisconnectingBrowser(false);
      startClose(() => { onDisconnected?.(); });
    } catch (err) {
      console.warn('Failed to disconnect browser connection:', err);
      setDisconnectingBrowser(false);
    }
  };

  const handleAutoClickComplete = useCallback(
    (
      success: boolean,
      data?: {
        clicked?: boolean;
        matched?: number;
        visibleCount?: number;
        reason?: string;
        debug?: unknown;
      },
    ) => {
      console.debug(
        '[BrowserModalInner] auto-click resolved, success=',
        success,
        'data=',
        data,
      );
    },
    [],
  );

  return createPortal(
    <ModalOverlay $closing={closing}>
      <ModalCard $wide={showBrowser} $closing={closing} onClick={e => e.stopPropagation()}>
        <BrowserModalScrollArea $wide={showBrowser}>
          <ModalHeader>
            <ModalTitle>{title}</ModalTitle>
            <ModalClose onClick={requestClose}>&times;</ModalClose>
          </ModalHeader>
          <ModalBody>
            {!showBrowser ? (
              <>
                <ModalDesc>Enter the web address for the app you'd like to connect.</ModalDesc>
                <input
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid rgba(36,36,36,0.12)', borderRadius: 10, fontFamily: 'Inter, sans-serif', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                  placeholder="https://example.com"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && url.trim()) openBrowser(); }}
                  autoFocus
                />
              </>
            ) : (
              <>
                <ModalDesc>Log in below, then click <strong>"I've logged in"</strong>.</ModalDesc>
                <IframeWrap>
                  <RemoteBrowserViewer
                    active={!!status?.containerRunning}
                    navigateUrl={url}
                    spinnerColor="#feeb29"
                    loadingText="Starting secure browser..."
                    autoClickSelector={autoClickSelector}
                    autoClickText={autoClickText}
                    autoClickDelayMs={autoClickDelayMs}
                    onAutoClickComplete={handleAutoClickComplete}
                  />
                </IframeWrap>
              </>
            )}
          </ModalBody>
          <ModalFooter>
            {connectionId && (
              <DisconnectBtn onClick={handleDisconnect} disabled={disconnectingBrowser}>
                {disconnectingBrowser ? 'Removing...' : 'Disconnect'}
              </DisconnectBtn>
            )}
            <CancelBtn onClick={requestClose}>Cancel</CancelBtn>
            {!showBrowser ? (
              <SaveBtn onClick={openBrowser} disabled={!url.trim()}>
                Open browser
              </SaveBtn>
            ) : (
              <SaveBtn
                onClick={() =>
                  trackCurrentUrl ? setConfirmUrlOpen(true) : onLoggedIn(url)
                }
              >
                I've logged in
              </SaveBtn>
            )}
          </ModalFooter>
        </BrowserModalScrollArea>
      </ModalCard>
      {confirmUrlOpen && (
        <ConfirmUrlModal
          initialUrl={latestUrl}
          onCancel={() => setConfirmUrlOpen(false)}
          onConfirm={(finalUrl) => {
            setConfirmUrlOpen(false);
            onLoggedIn(finalUrl);
          }}
        />
      )}
    </ModalOverlay>,
    document.body,
  );
};

/* ── Confirm URL sub-modal (overlays the browser modal) ── */

const ConfirmUrlOverlay = styled(ModalOverlay)`
  z-index: 10001;
`;

const ConfirmUrlCard = styled.div`
  background: white;
  border: 1px solid rgba(36,36,36,0.05);
  border-radius: 24px;
  width: min(94vw, 480px);
  max-width: 94vw;
  max-height: 94vh;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.18);
  transform-origin: center;
  animation: ${cardEnter} 0.28s cubic-bezier(0.22, 1, 0.36, 1);

  @media (max-width: 768px) {
    width: 100vw;
    max-width: 100vw;
    border-radius: 0;
    height: auto;
  }
`;

const ConfirmUrlFieldLabel = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 13px;
  letter-spacing: -0.3px;
  color: #242424;
`;

const ConfirmUrlInput = styled.input`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid rgba(36,36,36,0.12);
  border-radius: 10px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  &:focus { border-color: rgba(36,36,36,0.3); }
`;

const ConfirmUrlModal: React.FC<{
  initialUrl: string;
  onCancel: () => void;
  onConfirm: (finalUrl: string) => void;
}> = ({ initialUrl, onCancel, onConfirm }) => {
  const [value, setValue] = useState(initialUrl);

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    const normalized = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    onConfirm(normalized);
  };

  return (
    <ConfirmUrlOverlay onClick={onCancel}>
      <ConfirmUrlCard onClick={e => e.stopPropagation()}>
        <GuideHeader>
          <GuideTitleWrap>
            <GuideTitle>Confirm web app URL</GuideTitle>
            <GuideSubtitle>Make sure the URL goes to the correct app page.</GuideSubtitle>
            <GuideSubtitle>Some web apps use <strong>/client</strong> or <strong>/webapp</strong> in the URL, that's what we need to keep your connection active.</GuideSubtitle>
          </GuideTitleWrap>
          <ModalClose onClick={onCancel} aria-label="Close">&times;</ModalClose>
        </GuideHeader>
        <ConfirmUrlFieldLabel>
          Web app URL
          <ConfirmUrlInput
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && value.trim()) submit(); }}
            autoFocus
          />
        </ConfirmUrlFieldLabel>
        <GuideFooterActions>
          <CancelBtn onClick={onCancel}>Cancel</CancelBtn>
          <SaveBtn onClick={submit} disabled={!value.trim()}>Confirm</SaveBtn>
        </GuideFooterActions>
      </ConfirmUrlCard>
    </ConfirmUrlOverlay>
  );
};

/* ── Web app guide modal sub-component ── */

const WEB_APP_GUIDE_SKIP_KEY = 'connections:webAppGuideSkip';

function shouldSkipWebAppGuide(): boolean {
  try { return localStorage.getItem(WEB_APP_GUIDE_SKIP_KEY) === '1'; } catch { return false; }
}

function persistSkipWebAppGuide(skip: boolean): void {
  try {
    if (skip) localStorage.setItem(WEB_APP_GUIDE_SKIP_KEY, '1');
    else localStorage.removeItem(WEB_APP_GUIDE_SKIP_KEY);
  } catch { /* storage unavailable */ }
}

const WebAppGuideModal: React.FC<{ onClose: () => void; onSubmitUrl: (url: string, skipGuide: boolean) => void }> = ({ onClose, onSubmitUrl }) => {
  const [step, setStep] = useState<'guide' | 'url'>('guide');
  const [exiting, setExiting] = useState(false);
  const [url, setUrl] = useState('');
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const goToUrl = () => {
    setExiting(true);
    setTimeout(() => {
      setStep('url');
      setExiting(false);
    }, 180);
  };

  const submit = () => {
    const v = url.trim();
    if (!v) return;
    const normalized = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    onSubmitUrl(normalized, dontShowAgain);
  };

  return (
    <ModalOverlay onClick={onClose}>
      <GuideModalCard
        key={step}
        $compact={step === 'url'}
        $exiting={exiting}
        onClick={e => e.stopPropagation()}
      >
        <GuideHeader>
          <GuideTitleWrap>
            <GuideTitle>
              {step === 'guide' ? 'Connecting web apps to your assistant' : 'Connect an app'}
            </GuideTitle>
            <GuideSubtitle>
              {step === 'guide'
                ? 'To ensure proper connections to your web apps, please follow this easy three step guideline.'
                : "Enter the web address for the app you'd like to connect."}
            </GuideSubtitle>
          </GuideTitleWrap>
          <ModalClose onClick={onClose} aria-label="Close">&times;</ModalClose>
        </GuideHeader>
        {step === 'guide' ? (
          <GuideSteps>
            <StepCard>
              <StepBadge>1</StepBadge>
              <StepIllustration><StepImg src="/illustrations/connection-step-1.svg" alt="" /></StepIllustration>
              <StepLabel>Enter the website URL</StepLabel>
            </StepCard>
            <StepCard>
              <StepBadge>2</StepBadge>
              <StepIllustration><StepImg src="/illustrations/connection-step-2.svg" alt="" /></StepIllustration>
              <StepLabel>Navigate to the app's login page</StepLabel>
            </StepCard>
            <StepCard>
              <StepBadge>3</StepBadge>
              <StepIllustration><StepImg src="/illustrations/connection-step-3.svg" alt="" /></StepIllustration>
              <StepLabel>Login to the web app and confirm here</StepLabel>
            </StepCard>
          </GuideSteps>
        ) : (
          <UrlInput
            placeholder="https://example.com"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && url.trim()) submit(); }}
            autoFocus
          />
        )}
        <GuideFooter>
          {step === 'guide' && (
            <SkipGuideLabel>
              <SkipGuideCheckbox
                type="checkbox"
                checked={dontShowAgain}
                onChange={e => setDontShowAgain(e.target.checked)}
              />
              Do not show this guideline again
            </SkipGuideLabel>
          )}
          <GuideFooterActions>
            <CancelBtn onClick={onClose}>Cancel</CancelBtn>
            {step === 'guide' ? (
              <SaveBtn onClick={goToUrl}>Enter URL</SaveBtn>
            ) : (
              <SaveBtn onClick={submit} disabled={!url.trim()}>Open browser</SaveBtn>
            )}
          </GuideFooterActions>
        </GuideFooter>
      </GuideModalCard>
    </ModalOverlay>
  );
};

export default ConnectionsView;
