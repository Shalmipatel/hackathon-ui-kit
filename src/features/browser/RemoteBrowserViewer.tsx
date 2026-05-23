import React, { useEffect, useRef, useCallback, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { getGateway } from '@/features/app/bootstrap/providers';
import { getRFB, type RfbClient } from './rfb-import';

/**
 * Flip this to switch between direct RFB (websockify) and the stock noVNC
 * iframe viewer. `true` = direct RFB, `false` = iframe embedding vnc.html.
 */
const USE_DIRECT_RFB = true;

/* ── Animations ── */

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const ringScale = keyframes`
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.1); }
`;

/* ── Styled helpers ── */

const ViewerWrap = styled.div`
  width: 100%;
  height: 100%;
  background: #111;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
`;

const RfbScreen = styled.div`
  width: 100%;
  height: 100%;

  & > canvas {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`;

const StyledIframe = styled.iframe`
  width: 100%;
  height: 100%;
  border: none;
  background: #000;
`;

const LoadingScreen = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  animation: ${fadeIn} 0.5s ease both;
`;

const LogoWrap = styled.div`
  position: relative;
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const LogoRing = styled.div`
  position: absolute;
  inset: -10px;
  border-radius: 50%;
  border: 2px solid rgba(255, 224, 26, 0.2);
  animation: ${ringScale} 3s ease-in-out infinite;
`;

const LogoImg = styled.div`
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const LoadingTextGroup = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
`;

const LoadingTitle = styled.div`
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  font-size: 14px;
  letter-spacing: -0.2px;
  color: rgba(255, 255, 255, 0.9);
`;

const LoadingSubtitle = styled.div`
  font-family: 'Inter', sans-serif;
  font-weight: 400;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  display: flex;
  align-items: center;
  gap: 6px;
`;

const ShieldIcon = () => (
  <svg width="12" height="13" viewBox="0 0 12 13" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 1L1.5 3V6.25C1.5 9.15 3.42 11.83 6 12.5C8.58 11.83 10.5 9.15 10.5 6.25V3L6 1Z"
      stroke="rgba(255,255,255,0.55)" strokeWidth="1" strokeLinejoin="round" fill="none" />
    <path d="M4.5 6.5L5.5 7.5L7.5 5.5" stroke="rgba(255,255,255,0.55)" strokeWidth="1"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const StatusOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(17, 17, 17, 0.85);
  backdrop-filter: blur(6px);
  z-index: 1;
`;

/* Floating clipboard-paste button — always visible in the bottom-right
 * corner so the user has an explicit "paste" affordance (especially useful
 * on mobile where Ctrl+V isn't available). */
const PasteButton = styled.button<{ $flash?: boolean }>`
  position: absolute;
  right: 12px;
  bottom: 12px;
  width: 40px;
  height: 40px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: ${({ $flash }) =>
    $flash ? 'rgba(34, 197, 94, 0.85)' : 'rgba(30, 30, 30, 0.75)'};
  color: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  transition: background 0.15s ease, transform 0.1s ease;
  touch-action: manipulation;

  &:active {
    transform: scale(0.94);
  }
  &:hover {
    background: rgba(50, 50, 50, 0.85);
  }
`;

const ClipboardIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
  </svg>
);

/* Toast notification for paste feedback */
const PasteToast = styled.div<{ $visible: boolean }>`
  position: absolute;
  bottom: 60px;
  right: 12px;
  padding: 6px 12px;
  border-radius: 8px;
  background: rgba(30, 30, 30, 0.9);
  color: rgba(255, 255, 255, 0.9);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 500;
  backdrop-filter: blur(8px);
  pointer-events: none;
  z-index: 3;
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transform: translateY(${({ $visible }) => ($visible ? '0' : '4px')});
  transition: opacity 0.2s ease, transform 0.2s ease;
`;

/* ── URL builders ──
 *
 * Connects to the backend's public WS endpoint at
 * `wss://<api-url>/ws/public-browser?token=<access-token>` and streams
 * binary VNC frames to the noVNC client. We connect cross-origin — no
 * Vite proxy, no cookie, no header manipulation.
 *
 * Returns an empty string when the env vars aren't configured. RFB will
 * surface that as a disconnect, which the overlay already handles.
 */
function buildPublicBrowserWsUrl(): string {
  const apiUrl = (import.meta.env.VITE_NEOCLAW_API_URL ?? '').trim();
  const token = (import.meta.env.VITE_NEOCLAW_API_KEY ?? '').trim();
  if (!apiUrl || !token) {
    console.warn(
      '[RemoteBrowserViewer] VITE_NEOCLAW_API_URL or VITE_NEOCLAW_API_KEY ' +
      'is empty — noVNC will not connect. Set both in .env.local.',
    );
    return '';
  }
  const wsBase = apiUrl
    .replace(/^https:\/\//i, 'wss://')
    .replace(/^http:\/\//i, 'ws://')
    .replace(/\/+$/, '');
  return `${wsBase}/ws/public-browser?token=${encodeURIComponent(token)}`;
}

/* Iframe fallback (USE_DIRECT_RFB=false) points at the admin's hosted
 * /browser HTML page, which embeds the same /ws/public-browser stream
 * via the same token. Kept for parity with the direct-RFB path. */
function buildNoVncIframeUrl(): string {
  const apiUrl = (import.meta.env.VITE_NEOCLAW_API_URL ?? '').trim();
  const token = (import.meta.env.VITE_NEOCLAW_API_KEY ?? '').trim();
  if (!apiUrl || !token) return '';
  const httpBase = apiUrl.replace(/\/+$/, '');
  return `${httpBase}/browser?token=${encodeURIComponent(token)}`;
}

/* ── Component ── */

export interface RemoteBrowserViewerProps {
  /** When false the viewer does not attempt to connect. */
  active: boolean;
  /** URL to open in the remote Chromium when the viewer connects. */
  navigateUrl?: string;
  /** Spinner accent colour (e.g. '#feeb29') */
  spinnerColor?: string;
  /** Loading text shown while connecting */
  loadingText?: string;
  autoClickSelector?: string;
  autoClickText?: string;
  autoClickDelayMs?: number;
  onAutoClickComplete?: (success: boolean, data?: {
    clicked?: boolean;
    matched?: number;
    visibleCount?: number;
    reason?: string;
    debug?: unknown;
  }) => void;
  headless?: boolean;
}

/**
 * Read text from the host clipboard via the async Clipboard API.
 * Returns null when unavailable or permission is denied. Only used
 * by the explicit paste-button click (keyboard Ctrl+V uses the
 * synchronous clipboardData from the native paste event instead).
 */
async function readHostClipboard(): Promise<string | null> {
  try {
    if (navigator.clipboard?.readText) {
      return await navigator.clipboard.readText();
    }
  } catch {
    /* Permission denied or not in a secure context */
  }
  return null;
}

/**
 * Send clipboard text to the remote browser via the CDP paste API.
 * Best-effort — failures are silently ignored so we always fall back
 * to the VNC clipboard path.
 */
function sendClipboardViaCdp(text: string): void {
  getGateway().request('/api/neoclaw-browser/paste', {
    method: 'POST',
    body: { text },
  }).catch(() => { /* best-effort */ });
}

/**
 * Push text through both clipboard channels:
 *  1. VNC extended clipboard (sets remote X11 selection)
 *  2. CDP Input.insertText (types directly into focused element)
 */
function pasteToRemote(
  text: string,
  rfbRef: React.MutableRefObject<RfbClient | null>,
): void {
  const client = rfbRef.current;
  if (client) {
    try { client.clipboardPasteFrom(text); } catch { /* ignore */ }
  }
  sendClipboardViaCdp(text);
}

export const RemoteBrowserViewer: React.FC<RemoteBrowserViewerProps> = ({
  active,
  navigateUrl,
  spinnerColor,
  loadingText = 'Connecting to browser...',
  autoClickSelector,
  autoClickText,
  autoClickDelayMs = 0,
  onAutoClickComplete,
  headless = false,
}) => {
  const screenRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RfbClient | null>(null);
  const [rfbState, setRfbState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const navigatedRef = useRef(false);

  const [pasteToast, setPasteToast] = useState<string | null>(null);
  const [pasteFlash, setPasteFlash] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const showPasteToast = useCallback((msg: string) => {
    setPasteToast(msg);
    setPasteFlash(true);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setPasteToast(null);
      setPasteFlash(false);
    }, 1800);
  }, []);

  /**
   * Paste-button click handler — uses the async Clipboard API since
   * there's no native paste event to read clipboardData from.
   */
  const handlePasteButtonClick = useCallback(async () => {
    const text = await readHostClipboard();
    if (!text) {
      showPasteToast('Clipboard empty or denied');
      return;
    }
    pasteToRemote(text, rfbRef);
    const preview = text.length > 40 ? `${text.slice(0, 40)}…` : text;
    showPasteToast(`Pasted: ${preview}`);
  }, [showPasteToast]);

  /**
   * Capture-phase listeners on the RfbScreen element. noVNC's canvas
   * registers its own keydown/keyup handlers that swallow all keyboard
   * input — by the time events bubble to our React wrapper they've been
   * preventDefault'd. We must intercept in the CAPTURE phase on the
   * container so we see Ctrl+V before noVNC does.
   *
   * Strategy:
   *  - keydown capture: intercept Ctrl+V, stop noVNC from seeing it,
   *    read clipboard via async API (valid — a physical keypress counts
   *    as a user gesture), then push to remote.
   *  - paste capture: intercept native paste events (right-click Paste,
   *    OS paste menu), read from the synchronous clipboardData.
   */
  useEffect(() => {
    const el = screenRef.current;
    if (!el || rfbState !== 'connected') return;

    const doPaste = (text: string) => {
      pasteToRemote(text, rfbRef);
      const preview = text.length > 40 ? `${text.slice(0, 40)}…` : text;
      showPasteToast(`Pasted: ${preview}`);
    };

    const onKeyDownCapture = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.stopImmediatePropagation();
        e.preventDefault();
        readHostClipboard().then((text) => {
          if (text) doPaste(text);
          else showPasteToast('Clipboard empty or denied');
        });
      }
    };

    const onPasteCapture = (e: ClipboardEvent) => {
      e.stopImmediatePropagation();
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain');
      if (text) doPaste(text);
    };

    el.addEventListener('keydown', onKeyDownCapture, true);
    el.addEventListener('paste', onPasteCapture, true);

    return () => {
      el.removeEventListener('keydown', onKeyDownCapture, true);
      el.removeEventListener('paste', onPasteCapture, true);
    };
  }, [rfbState, showPasteToast]);

  const destroyRfb = useCallback(() => {
    if (rfbRef.current) {
      try { rfbRef.current.disconnect(); } catch { /* ignore */ }
      rfbRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  useEffect(() => {
    navigatedRef.current = false;
  }, [navigateUrl]);

  useEffect(() => {
    if (!active || !headless || !navigateUrl) return;
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        await getGateway().request('/api/neoclaw-browser/navigate', {
          method: 'POST',
          body: { url: navigateUrl },
        });
        if (cancelled || !autoClickSelector) return;
        if (autoClickDelayMs > 0) {
          await new Promise((r) => setTimeout(r, autoClickDelayMs));
        }
        if (cancelled) return;
        let urlContains: string | undefined;
        try { urlContains = new URL(navigateUrl).hostname; } catch { /* noop */ }
        const resp = await getGateway().request(
          '/api/neoclaw-browser/click',
          {
            method: 'POST',
            body: {
              selector: autoClickSelector,
              text: autoClickText,
              urlContains,
              timeoutMs: 15000,
              settleMs: 800,
            },
            timeoutMs: 22_000,
          },
        );
        if (cancelled) return;
        let success = false;
        let data: Record<string, unknown> | undefined;
        try {
          const json = await resp.json();
          success = !!(json?.success && json?.data?.clicked);
          data = json?.data as Record<string, unknown> | undefined;
        } catch { /* malformed → success stays false */ }
        onAutoClickComplete?.(
          success,
          data as Parameters<NonNullable<typeof onAutoClickComplete>>[1],
        );
      } catch {
        if (!cancelled) onAutoClickComplete?.(false);
      }
    })();
    return () => { cancelled = true; };
  }, [active, headless, navigateUrl, autoClickSelector, autoClickText, autoClickDelayMs, onAutoClickComplete]);

  useEffect(() => {
    if (!USE_DIRECT_RFB || !active || headless) return;

    const el = screenRef.current;
    if (!el) return;

    setRfbState('connecting');

    const wsUrl = buildPublicBrowserWsUrl();
    let cancelled = false;

    (async () => {
      try {
        destroyRfb();
        const RFB = await getRFB();
        if (cancelled) return;

        const client = new RFB(el, wsUrl, { shared: true });
        rfbRef.current = client;
        client.background = '#000';

        const applyScale = () => {
          if (cancelled || !rfbRef.current) return;
          rfbRef.current.scaleViewport = true;
        };

        client.addEventListener('connect', () => {
          if (cancelled) return;
          setRfbState('connected');
          applyScale();
          requestAnimationFrame(() => {
            applyScale();
            setTimeout(applyScale, 50);
            setTimeout(applyScale, 250);
          });

          if (navigateUrl && !navigatedRef.current) {
            navigatedRef.current = true;
            getGateway()
              .request('/api/neoclaw-browser/navigate', {
                method: 'POST',
                body: { url: navigateUrl },
              })
              .then(async () => {
                if (!autoClickSelector) return;
                if (autoClickDelayMs > 0) {
                  await new Promise(r => setTimeout(r, autoClickDelayMs));
                }
                let urlContains: string | undefined;
                try {
                  urlContains = new URL(navigateUrl).hostname;
                } catch { /* leave undefined → use first page tab */ }
                const resp = await getGateway().request(
                  '/api/neoclaw-browser/click',
                  {
                    method: 'POST',
                    body: {
                      selector: autoClickSelector,
                      text: autoClickText,
                      urlContains,
                      timeoutMs: 15000,
                      settleMs: 800,
                    },
                    // Outer fetch timeout has to outlive the in-page
                    // poll (see headless branch above for full reasoning).
                    timeoutMs: 22_000,
                  },
                );
                let success = false;
                let data: Record<string, unknown> | undefined;
                try {
                  const json = await resp.json();
                  success = !!(json?.success && json?.data?.clicked);
                  data = json?.data as Record<string, unknown> | undefined;
                } catch { /* malformed response → success stays false */ }
                onAutoClickComplete?.(success, data as Parameters<NonNullable<typeof onAutoClickComplete>>[1]);
              })
              .catch(() => {
                onAutoClickComplete?.(false);
              });
          }
        });

        client.addEventListener('disconnect', () => {
          if (cancelled) return;
          setRfbState('disconnected');
        });

        client.addEventListener('securityfailure', () => {
          if (cancelled) return;
          setRfbState('disconnected');
        });
      } catch {
        if (!cancelled) setRfbState('disconnected');
      }
    })();

    return () => {
      cancelled = true;
      destroyRfb();
    };
  }, [active, headless, destroyRfb]);

  // Rescale on container resize
  useEffect(() => {
    if (!USE_DIRECT_RFB || !active || headless) return;
    const el = screenRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      if (rfbRef.current) {
        rfbRef.current.scaleViewport = true;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [active, headless]);

  // Headless mode renders nothing — caller owns the visible UI.
  if (headless) return null;

  if (!active) {
    return (
      <ViewerWrap>
        <LoadingScreen>
          <LogoWrap>
            <LogoRing />
            <LogoImg>
              <svg width="48" height="48" viewBox="0 0 36 36" fill="none">
                <rect width="36" height="36" rx="18" fill="#FEEB29" />
                <path d="M18 7.5l9 3.5v7.7c0 4.7-3 8.8-9 10.8-6-2-9-6.1-9-10.8V11l9-3.5Z" fill="#242424" />
                <path d="M13.4 18.2 16.8 22l6-7.8" stroke="#FEEB29" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </LogoImg>
          </LogoWrap>
          <LoadingTextGroup>
            <LoadingTitle>{loadingText}</LoadingTitle>
            <LoadingSubtitle><ShieldIcon /> Private &amp; encrypted session</LoadingSubtitle>
          </LoadingTextGroup>
        </LoadingScreen>
      </ViewerWrap>
    );
  }

  if (!USE_DIRECT_RFB) {
    return (
      <ViewerWrap>
        <StyledIframe
          src={buildNoVncIframeUrl()}
          title="Browser View"
          sandbox="allow-scripts allow-same-origin"
        />
      </ViewerWrap>
    );
  }

  return (
    <ViewerWrap>
      <RfbScreen ref={screenRef} />
      {rfbState === 'connected' && (
        <>
          <PasteButton
            type="button"
            $flash={pasteFlash}
            aria-label="Paste from clipboard"
            onClick={handlePasteButtonClick}
          >
            <ClipboardIcon />
          </PasteButton>
          <PasteToast $visible={!!pasteToast}>{pasteToast}</PasteToast>
        </>
      )}
      {rfbState !== 'connected' && (
        <StatusOverlay>
          <LoadingScreen>
            <LogoWrap>
              <LogoRing />
              <LogoImg>
              <svg width="48" height="48" viewBox="0 0 36 36" fill="none">
                <rect width="36" height="36" rx="18" fill="#FEEB29" />
                <path d="M18 7.5l9 3.5v7.7c0 4.7-3 8.8-9 10.8-6-2-9-6.1-9-10.8V11l9-3.5Z" fill="#242424" />
                <path d="M13.4 18.2 16.8 22l6-7.8" stroke="#FEEB29" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </LogoImg>
            </LogoWrap>
            <LoadingTextGroup>
              <LoadingTitle>
                {rfbState === 'connecting' ? loadingText : 'Reconnecting to secure browser...'}
              </LoadingTitle>
              <LoadingSubtitle><ShieldIcon /> Private &amp; encrypted session</LoadingSubtitle>
            </LoadingTextGroup>
          </LoadingScreen>
        </StatusOverlay>
      )}
    </ViewerWrap>
  );
};
