/**
 * DEV-ONLY. Lives under `src/dev/` so the entire module (plus its
 * transitive `qrcode` dep, ~40 KB min) is tree-shaken out of prod
 * bundles. Callers must guard the import with `import.meta.env.DEV`:
 *
 *   const DevSettingsOverlay = import.meta.env.DEV
 *     ? React.lazy(() => import('@/dev/features/settings/DevSettingsOverlay'))
 *     : null;
 *
 * The marker string below is scanned by `scripts/verify-no-dev-code.mjs`
 * after every `vite build`; a static import from prod code would leave
 * the literal in `dist/` and fail CI.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import QRCode from 'qrcode';
import type { ExtensionSettings } from '@/types';
import { theme } from '@/components/theme';
import { DEV_JWT_KEY } from '@/providers/auth';

/* Side-effect marker. Attached to `window` at module-eval time (NOT
 * inside an `import.meta.env.DEV` guard) so that if this module is
 * ever statically imported from prod code by mistake, the literal
 * string survives minification and trips the `verify-no-dev-code.mjs`
 * postbuild check. In the happy path (lazy-loaded + dev-gated), the
 * module is dead-coded out of prod entirely and this never runs. */
const DEV_SETTINGS_OVERLAY_MARKER = 'dev-settings-overlay:module-loaded';
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)[DEV_SETTINGS_OVERLAY_MARKER] = true;
}

/* ── Styled components ── */

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1600;
`;

const Panel = styled.div`
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.borderRadius.md};
  padding: 24px;
  min-width: 340px;
  max-width: 460px;
  max-height: 92vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
`;

const Title = styled.h3`
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
  color: ${theme.colors.textPrimary};
`;

const Label = styled.label`
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: ${theme.colors.textSecondary};
  margin-bottom: 6px;

  &:not(:first-of-type) {
    margin-top: 14px;
  }
`;

const Input = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.borderRadius.sm};
  /* theme.colors.background is a dark slate (#242424) that would render
   * textPrimary (#18181b) as unreadable dark-on-dark. Use surfaceMuted
   * (near-white) so text stays legible on the white panel. */
  background: ${theme.colors.surfaceMuted};
  color: ${theme.colors.textPrimary};
  font-size: 14px;
  font-family: ${theme.fontFamily};
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;

  &:focus {
    border-color: ${theme.colors.primary};
    background: ${theme.colors.white};
  }

  &::placeholder {
    color: ${theme.colors.textMuted};
  }
`;

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  margin-bottom: 6px;
`;

const ToggleLabel = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: ${theme.colors.textSecondary};
`;

const Toggle = styled.button<{ $active: boolean }>`
  width: 36px;
  height: 20px;
  border-radius: 10px;
  border: 1px solid ${({ $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ $active }) => ($active ? theme.colors.primary : theme.colors.background)};
  position: relative;
  cursor: pointer;
  padding: 0;
  transition: all 0.2s;

  &::after {
    content: '';
    position: absolute;
    top: 2px;
    left: ${({ $active }) => ($active ? '17px' : '2px')};
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: ${({ $active }) => ($active ? theme.colors.white : theme.colors.textMuted)};
    transition: left 0.2s;
  }
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'danger' }>`
  padding: 6px 16px;
  border: 1px solid
    ${({ $variant }) =>
      $variant === 'danger'
        ? theme.colors.error
        : $variant === 'primary'
          ? theme.colors.primary
          : theme.colors.border};
  border-radius: ${theme.borderRadius.sm};
  background: ${({ $variant }) =>
    $variant === 'primary' ? theme.colors.primary : 'transparent'};
  color: ${({ $variant }) =>
    $variant === 'danger'
      ? theme.colors.error
      : $variant === 'primary'
        ? theme.colors.white
        : theme.colors.textPrimary};
  font-size: 13px;
  font-weight: 600;
  font-family: ${theme.fontFamily};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    opacity: 0.85;
  }
`;

const TokenTextarea = styled.textarea`
  width: 100%;
  min-height: 64px;
  padding: 8px 12px;
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.borderRadius.sm};
  /* See note in Input — surfaceMuted keeps the field legible on the
   * white panel; theme.colors.background is intentionally dark. */
  background: ${theme.colors.surfaceMuted};
  color: ${theme.colors.textPrimary};
  font-size: 12px;
  font-family: monospace;
  outline: none;
  box-sizing: border-box;
  resize: vertical;
  transition: border-color 0.2s;

  &:focus {
    border-color: ${theme.colors.primary};
    background: ${theme.colors.white};
  }

  &::placeholder {
    color: ${theme.colors.textMuted};
    font-family: ${theme.fontFamily};
    font-size: 13px;
  }
`;

const AlertBanner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: ${theme.borderRadius.sm};
  background: ${theme.colors.infoBg};
  border-left: 3px solid ${theme.colors.info};
`;

const AlertIcon = styled.span`
  flex-shrink: 0;
  font-size: 16px;
  line-height: 1.4;
  color: ${theme.colors.info};
`;

const AlertMessage = styled.p`
  font-size: 13px;
  line-height: 1.4;
  color: ${theme.colors.info};
  margin: 0;
`;

const Divider = styled.hr`
  border: none;
  border-top: 1px solid ${theme.colors.border};
  margin: 16px 0;
`;

/* ── QR section ──
 * The whole block is wrapped in `DesktopOnly` below because scanning a QR
 * from the same device you're viewing it on is nonsensical. On mobile we
 * collapse it; the tunnel-URL input stays visible so devs on a phone can
 * still paste a tunnel they opened elsewhere. */

const DesktopOnly = styled.div`
  @media (max-width: 768px) {
    display: none;
  }
`;

const QrCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  padding: 14px;
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.borderRadius.sm};
  /* surfaceMuted keeps the card quietly off-white against the white panel,
   * instead of the dark-slate theme.colors.background which clashes and
   * made nested text/inputs unreadable. */
  background: ${theme.colors.surfaceMuted};
  overflow: hidden;
`;

const QrCanvasWrap = styled.div`
  width: 180px;
  height: 180px;
  flex-shrink: 0;
  background: #ffffff;
  border-radius: 6px;
  padding: 8px;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;

  /* QRCode.toCanvas sets intrinsic width/height attributes on the canvas.
   * We force it to shrink to the wrap using !important so the flex layout
   * never gets overpowered by the intrinsic pixel size. */
  & canvas {
    display: block !important;
    width: 100% !important;
    height: 100% !important;
    max-width: 100% !important;
    max-height: 100% !important;
    image-rendering: pixelated;
  }
`;

const QrUrl = styled.code`
  font-family: monospace;
  font-size: 12px;
  color: ${theme.colors.textPrimary};
  word-break: break-all;
  background: ${theme.colors.white};
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid ${theme.colors.border};
  line-height: 1.4;
  width: 100%;
  box-sizing: border-box;
  text-align: center;
`;

const QrHint = styled.p`
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: ${theme.colors.textMuted};
  text-align: center;
`;

const QrBtnRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
`;

const QrMiniBtn = styled.button`
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  font-family: ${theme.fontFamily};
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.borderRadius.sm};
  background: ${theme.colors.surface};
  color: ${theme.colors.textSecondary};
  cursor: pointer;
  transition: background 0.15s;
  &:hover { background: ${theme.colors.surfaceMuted}; border-color: ${theme.colors.borderActive}; }
  &:disabled { opacity: 0.5; cursor: default; }
`;

const QrChipRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin: 6px 0 2px;
`;

const QrChip = styled.button<{ $active?: boolean }>`
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  font-family: ${theme.fontFamily};
  border: 1px solid ${({ $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  border-radius: 999px;
  background: ${({ $active }) => ($active ? theme.colors.primary : theme.colors.surface)};
  color: ${({ $active }) => ($active ? theme.colors.white : theme.colors.textSecondary)};
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  &:hover { opacity: 0.9; }
`;

const QrWarn = styled.p`
  margin: 6px 0 0;
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.4;
  color: ${theme.colors.textSecondary};
  background: ${theme.colors.infoBg};
  border-left: 2px solid ${theme.colors.info};
  border-radius: 4px;

  & code {
    background: rgba(0, 0, 0, 0.06);
    padding: 1px 4px;
    border-radius: 3px;
  }
`;

/* Replaces the entire QR surface when the current mobile target URL is
 * plain HTTP on a non-loopback origin. Phones loading an HTTP URL get a
 * NON-secure context: crypto.randomUUID, crypto.subtle, clipboard,
 * camera, and service workers are all unavailable, so auth/vault/etc
 * crash. We refuse to show the QR and explain exactly how to fix it.
 *
 * Deliberately loud: border + tinted background + bold copy. This is
 * the dev UI, so "quiet and clean" loses to "impossible to miss". */
const QrHttpsGate = styled.div`
  margin-top: 4px;
  padding: 14px 16px;
  border: 2px solid ${theme.colors.error};
  border-radius: 8px;
  background: ${theme.colors.errorBg};
  color: ${theme.colors.textPrimary};
  line-height: 1.45;

  & h4 {
    margin: 0 0 6px;
    font-size: 13px;
    font-weight: 700;
    color: ${theme.colors.error};
    display: flex;
    align-items: center;
    gap: 6px;
  }

  & p {
    margin: 0 0 10px;
    font-size: 12px;
    color: ${theme.colors.textSecondary};
  }

  & p:last-child { margin-bottom: 0; }

  & code {
    display: inline-block;
    background: ${theme.colors.surface};
    border: 1px solid ${theme.colors.border};
    padding: 1px 6px;
    margin: 1px 0;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px;
    color: ${theme.colors.textPrimary};
  }

  & pre {
    margin: 4px 0 10px;
    padding: 8px 10px;
    background: ${theme.colors.surface};
    border: 1px solid ${theme.colors.border};
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px;
    color: ${theme.colors.textPrimary};
    white-space: pre;
    overflow-x: auto;
  }

  & kbd {
    display: inline-block;
    padding: 1px 5px;
    font-size: 10.5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    background: ${theme.colors.surface};
    border: 1px solid ${theme.colors.border};
    border-bottom-width: 2px;
    border-radius: 3px;
    color: ${theme.colors.textPrimary};
  }
`;

/* Shown inside QrCard when the QR payload contains the raw JWT. The red
 * tint + lock glyph is deliberately loud — anyone screenshotting this QR
 * is also screenshotting a live credential. */
const QrSecretBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 11px;
  line-height: 1.3;
  color: ${theme.colors.error};
  background: ${theme.colors.errorBg};
  border: 1px solid ${theme.colors.error};
  border-radius: 999px;
  font-weight: 600;

  & strong { font-weight: 700; }
`;

/* Tiny inline toggle for "include JWT in QR". Lives inside the QrCard
 * header so it's discoverable but out of the way. */
const QrInlineToggle = styled.label`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: ${theme.colors.textSecondary};
  cursor: pointer;
  user-select: none;

  & input {
    margin: 0;
    cursor: pointer;
    accent-color: ${theme.colors.primary};
  }
`;

const TokenStatus = styled.span<{ $valid: boolean }>`
  font-size: 12px;
  color: ${({ $valid }) => ($valid ? theme.colors.success ?? '#49A078' : theme.colors.textMuted)};
  margin-left: 8px;
  font-weight: 400;
`;

/* ── Helpers ── */

function getJwtExpiry(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.exp) return null;
    return new Date(payload.exp * 1000).toLocaleString();
  } catch {
    return null;
  }
}

/**
 * A phone on the same LAN can't reach `localhost` — that only resolves to the
 * dev machine's own loopback. We surface a warning in that case and suggest
 * running Vite with `VITE_DEV_HOST=0.0.0.0` (or a specific LAN IP).
 */
function isReachableFromPhone(hostname: string): boolean {
  if (!hostname) return false;
  if (hostname === 'localhost') return false;
  if (hostname === '127.0.0.1' || hostname === '0.0.0.0') return false;
  if (hostname === '::1') return false;
  return true;
}

/**
 * LAN IPs injected at Vite startup (see `vite.config.ts` → `define`). Format:
 * "en0:192.168.1.23,en1:10.0.0.5". Empty in production builds.
 */
interface LanEntry {
  name: string;
  address: string;
  url: string;
}

function parseLanIps(): LanEntry[] {
  const raw = (import.meta.env.VITE_DEV_LAN_IPS as string | undefined) || '';
  if (!raw) return [];
  const port = (import.meta.env.VITE_DEV_PORT as string | undefined) || String(window.location.port || 5173);
  const proto = window.location.protocol.startsWith('https') ? 'https' : 'http';
  return raw.split(',')
    .map(token => token.trim())
    .filter(Boolean)
    .map(token => {
      const [name, address] = token.split(':');
      return { name, address, url: `${proto}://${address}:${port}` };
    })
    .filter(e => !!e.address);
}

/* ── Component ── */

interface DevSettingsOverlayProps {
  settings?: ExtensionSettings | null;
  onSave?: (updates: Partial<ExtensionSettings>) => void;
  onClose: () => void;
  /**
   * Optional override for the post-save reload. The auth provider is
   * wired up at app boot from `localStorage`, so settings changes only
   * take effect after a remount. Default behaviour is `location.reload()`,
   * which works whenever the current URL routes through the app shell.
   *
   * Pass an explicit href when the current URL DOESN'T mount the app
   * shell (e.g. the standalone `/` and `/landing` routes that render
   * `<LandingPage />` directly) — a plain reload there would just bring
   * the landing back up with the new settings sitting unused.
   */
  reloadHref?: string;
}

const DevSettingsOverlay: React.FC<DevSettingsOverlayProps> = ({
  settings,
  onSave,
  onClose,
  reloadHref,
}) => {
  const [tokenAuthEnabled, setTokenAuthEnabled] = useState(
    settings?.tokenAuthEnabled ?? false,
  );
  const [pendingReload, setPendingReload] = useState(false);
  const [fallbackIpEnabled, setFallbackIpEnabled] = useState(
    settings?.fallbackTargetIpEnabled ?? false,
  );
  const [fallbackIp, setFallbackIp] = useState(
    settings?.fallbackTargetIp ?? '',
  );
  const [jwtToken, setJwtToken] = useState(
    () => localStorage.getItem(DEV_JWT_KEY) ?? '',
  );

  /* ── Mobile preview (QR) state ── */
  const lanEntries = useMemo(() => parseLanIps(), []);
  /* Pick a sensible default:
   *  1. Previously-chosen URL from localStorage (persists ngrok URLs, etc.)
   *  2. The first LAN IP Vite detected at boot (real phone can reach it)
   *  3. window.location.origin (localhost fallback — shows warning) */
  const [mobileUrl, setMobileUrl] = useState<string>(() => {
    const stored = localStorage.getItem('dev:mobileUrl');
    if (stored) return stored;
    if (lanEntries.length > 0) return lanEntries[0].url;
    return window.location.origin;
  });
  const [copied, setCopied] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  /* Embed-JWT toggle — persisted so the preference sticks between sessions.
   * When ON (default) and the JWT field is non-empty and well-formed, the
   * QR payload includes `#dev-jwt=<jwt>&dev-auth=1` so the phone app can
   * auto-import it. When OFF, the QR is a plain URL (useful for screenshots
   * / sharing). See src/dev/providers/auth/dev-jwt-import.ts for the
   * consumer side. */
  const [embedJwt, setEmbedJwt] = useState<boolean>(() => {
    return localStorage.getItem('dev:embedJwtInQr') !== '0';
  });

  const hasValidJwt = jwtToken.split('.').length === 3 && /^[A-Za-z0-9_.-]+$/.test(jwtToken);
  const jwtExpiry = useMemo(() => jwtToken ? getJwtExpiry(jwtToken) : null, [jwtToken]);

  /* The actual QR payload: base URL + optional dev-jwt fragment. We keep
   * `mobileUrl` as the clean base (that's what shows in the URL pill and
   * in the "pick a LAN IP" chips) and only compute the fragment-augmented
   * URL for what actually gets encoded into the QR and copied. */
  const qrPayload = useMemo(() => {
    if (!mobileUrl) return '';
    if (!embedJwt || !hasValidJwt) return mobileUrl;
    // Strip any existing hash the user may have pasted and append our own.
    const base = mobileUrl.split('#')[0];
    const frag = new URLSearchParams({ 'dev-jwt': jwtToken, 'dev-auth': '1' }).toString();
    return `${base}#${frag}`;
  }, [mobileUrl, embedJwt, hasValidJwt, jwtToken]);

  const qrEmbedsJwt = qrPayload !== mobileUrl && hasValidJwt && embedJwt;

  /* Re-render QR whenever the target URL OR the embedded JWT changes. We
   * render at 2x the CSS pixel size for sharpness on high-DPI displays,
   * then CSS shrinks the canvas to fit the 164 px (180 - padding) wrap.
   * errorCorrectionLevel L (was M) keeps the QR scannable even when a
   * ~900-byte JWT is baked into the fragment — M would force version 25+
   * which struggles on mid-range phones. */
  useEffect(() => {
    const canvas = qrCanvasRef.current;
    if (!canvas || !qrPayload) return;
    QRCode.toCanvas(canvas, qrPayload, {
      errorCorrectionLevel: qrEmbedsJwt ? 'L' : 'M',
      margin: 1,
      width: 328,
      color: { dark: '#111111', light: '#ffffff' },
    }).catch(() => { /* Payload too long or invalid — canvas stays blank. */ });
  }, [qrPayload, qrEmbedsJwt]);

  const mobileHostname = useMemo(() => {
    try { return new URL(mobileUrl).hostname; } catch { return ''; }
  }, [mobileUrl]);
  const mobileReachable = isReachableFromPhone(mobileHostname);

  /* Plain HTTP on a non-loopback origin isn't a "secure context" on the
   * phone — crypto.randomUUID, crypto.subtle, clipboard, camera, and
   * service workers all fail, which crashes auth/vault. Detect this
   * specifically so we can block the QR and tell the user how to fix it.
   *
   * We intentionally check the MOBILE URL's protocol (not the current
   * window's): pasting an https tunnel URL is a valid workaround and
   * should make the gate go away. */
  const mobileIsInsecureHttp = useMemo(() => {
    try {
      const u = new URL(mobileUrl);
      if (u.protocol !== 'http:') return false;
      const h = u.hostname;
      /* Loopback is a "potentially trustworthy" origin per the spec —
       * http://localhost / http://127.0.0.1 remain secure contexts. */
      if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return false;
      return true;
    } catch {
      return false;
    }
  }, [mobileUrl]);

  /* Vite's configured bind host (injected via `define` in vite.config.ts).
   * When this is `localhost` / `127.0.0.1` / `::1` the dev server is on
   * loopback only — a phone on the same Wi-Fi gets ERR_CONNECTION_REFUSED
   * no matter what LAN IP the QR points at. The only non-loopback targets
   * that work in that case are tunnels (ngrok/localtunnel/cloudflared),
   * which the user must paste manually. */
  const mobileIsBoundLoopbackOnly = useMemo(() => {
    const bound = (import.meta.env.VITE_DEV_HOST as string | undefined) ?? '';
    const boundIsLoopback = bound === ''
      || bound === 'localhost'
      || bound === '127.0.0.1'
      || bound === '::1';
    if (!boundIsLoopback) return false;
    /* If the user pasted a public tunnel URL, the tunnel forwards to
     * 127.0.0.1 on the laptop — that path still works, so only block
     * when `mobileUrl` targets a private LAN IP. */
    try {
      const h = new URL(mobileUrl).hostname;
      if (!h) return false;
      if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return false;
      /* RFC1918 + link-local — same filter as the vite.config LAN sweep. */
      if (/^10\./.test(h)) return true;
      if (/^192\.168\./.test(h)) return true;
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
      if (/^169\.254\./.test(h)) return true;
      if (/^fe80:/i.test(h)) return true;
      return false;
    } catch {
      return false;
    }
  }, [mobileUrl]);

  /* Loopback-binding is the more fundamental problem: even if the origin
   * is HTTPS, the socket just won't accept the connection. Check it first
   * so the user sees the right remediation. */
  const qrBlocked = mobileIsBoundLoopbackOnly || mobileIsInsecureHttp;

  const handleCopyMobileUrl = useCallback(async () => {
    try {
      // Copy the FULL QR payload (including any embedded JWT) — matches
      // what the QR encodes, so the user can paste into Safari on a phone
      // that can't scan and get the same auto-import behavior.
      await navigator.clipboard.writeText(qrPayload || mobileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Browsers without clipboard API — silent no-op. */
    }
  }, [qrPayload, mobileUrl]);

  const handleMobileUrlChange = useCallback((v: string) => {
    setMobileUrl(v);
    localStorage.setItem('dev:mobileUrl', v);
  }, []);

  const handlePickLanEntry = useCallback((url: string) => {
    setMobileUrl(url);
    localStorage.setItem('dev:mobileUrl', url);
  }, []);

  const handleToggleEmbedJwt = useCallback(() => {
    setEmbedJwt((prev) => {
      const next = !prev;
      localStorage.setItem('dev:embedJwtInQr', next ? '1' : '0');
      return next;
    });
  }, []);

  const handleTokenAuthToggle = useCallback(() => {
    setTokenAuthEnabled((prev) => !prev);
    setPendingReload(true);
  }, []);

  const handleSave = useCallback(() => {
    const trimmedJwt = jwtToken.trim();
    if (trimmedJwt) {
      localStorage.setItem(DEV_JWT_KEY, trimmedJwt);
    } else {
      localStorage.removeItem(DEV_JWT_KEY);
    }

    const updates: Partial<ExtensionSettings> = {
      tokenAuthEnabled,
      fallbackTargetIpEnabled: fallbackIpEnabled,
      fallbackTargetIp: fallbackIp.trim(),
    };

    if (pendingReload) {
      // Write settings synchronously before reload — async onSave won't complete in time
      const raw = localStorage.getItem('settings');
      const current = raw ? JSON.parse(raw) : {};
      localStorage.setItem('settings', JSON.stringify({
        ...current,
        ...updates,
        updatedAt: Date.now(),
      }));
      if (reloadHref) {
        window.location.assign(reloadHref);
      } else {
        window.location.reload();
      }
      return;
    }

    onSave?.(updates);
    onClose();
  }, [tokenAuthEnabled, fallbackIpEnabled, fallbackIp, jwtToken, pendingReload, reloadHref, onSave, onClose]);

  const handleClear = useCallback(() => {
    setJwtToken('');
    localStorage.removeItem(DEV_JWT_KEY);
    setTokenAuthEnabled(false);
    setFallbackIpEnabled(false);
    setFallbackIp('');
    onSave?.({ tokenAuthEnabled: false, fallbackTargetIpEnabled: false, fallbackTargetIp: '' });
  }, [onSave]);

  return (
    <Overlay onClick={onClose}>
      <Panel onClick={(e) => e.stopPropagation()}>
        <Title>Dev Settings</Title>

        <ToggleRow>
          <ToggleLabel>Token Auth (NeoAuth)</ToggleLabel>
          <Toggle
            type="button"
            $active={tokenAuthEnabled}
            onClick={handleTokenAuthToggle}
            aria-label="Toggle token auth"
          />
        </ToggleRow>
        {pendingReload && (
          <AlertBanner>
            <AlertIcon>&#8505;</AlertIcon>
            <AlertMessage>
              Changing auth mode requires a page reload. Save to apply.
            </AlertMessage>
          </AlertBanner>
        )}

        <Divider />

        <Label>
          JWT Token
          {jwtToken && (
            <TokenStatus $valid={hasValidJwt}>
              {hasValidJwt ? (jwtExpiry ? `expires ${jwtExpiry}` : 'set') : 'invalid format'}
            </TokenStatus>
          )}
        </Label>
        <TokenTextarea
          placeholder="Paste your JWT token here..."
          value={jwtToken}
          onChange={(e) => setJwtToken(e.target.value)}
          spellCheck={false}
          autoFocus
        />

        <Divider />

        <ToggleRow>
          <ToggleLabel>Fallback Target IP</ToggleLabel>
          <Toggle
            type="button"
            $active={fallbackIpEnabled}
            onClick={() => setFallbackIpEnabled((prev) => !prev)}
            aria-label="Toggle fallback IP"
          />
        </ToggleRow>
        {fallbackIpEnabled && (
          <Input
            type="text"
            placeholder="Fallback IP"
            value={fallbackIp}
            onChange={(e) => setFallbackIp(e.target.value)}
          />
        )}

        <DesktopOnly>
          <Divider />

          <Label>
            Open on phone
            <TokenStatus $valid={mobileReachable && !qrBlocked}>
              {mobileIsBoundLoopbackOnly
                ? 'dev server bound to loopback — see below'
                : mobileIsInsecureHttp
                  ? 'HTTPS required — see below'
                  : mobileReachable
                    ? 'scan from your phone'
                    : 'localhost — pick a LAN IP below'}
            </TokenStatus>
          </Label>

          {mobileIsBoundLoopbackOnly ? (
            <QrHttpsGate role="alert">
              <h4>
                <span aria-hidden="true">🚫</span>
                Mobile QR disabled — dev server is bound to loopback only
              </h4>
              <p>
                Vite is listening on <code>{import.meta.env.VITE_DEV_HOST || 'localhost'}</code>,
                so your laptop&rsquo;s LAN IP <code>{mobileHostname}</code> won&rsquo;t accept
                connections. Scanning the QR would just give{' '}
                <code>ERR_CONNECTION_REFUSED</code> on the phone.
              </p>
              <p>
                <strong>Fix:</strong> update <code>.env.local</code> and restart{' '}
                <code>npm&nbsp;run&nbsp;dev</code>:
              </p>
              <pre>{`VITE_DEV_HOST=0.0.0.0
VITE_DEV_HTTPS=1`}</pre>
              <p>
                <code>0.0.0.0</code> binds to every network interface; HTTPS is required so the
                phone has a secure context for crypto / clipboard / vault APIs. Alternatively,
                paste an <code>https://</code> tunnel URL (ngrok, localtunnel, cloudflared) below
                — tunnels forward to loopback and work without rebinding.
              </p>
            </QrHttpsGate>
          ) : mobileIsInsecureHttp ? (
            <QrHttpsGate role="alert">
              <h4>
                <span aria-hidden="true">🚫</span>
                Mobile QR disabled — <code>{mobileHostname}</code> is plain HTTP
              </h4>
              <p>
                Phones (and any non-loopback origin) need a <strong>secure context</strong>
                {' '}to run this app. Without HTTPS the page loads but auth, vault, clipboard,
                and crypto APIs crash on scan.
              </p>
              <p>
                <strong>Fix:</strong> add this to <code>.env.local</code> and restart{' '}
                <code>npm&nbsp;run&nbsp;dev</code>:
              </p>
              <pre>VITE_DEV_HTTPS=1</pre>
              <p>
                First phone scan will show a self-signed cert warning — tap{' '}
                <kbd>Advanced</kbd> → <kbd>Proceed</kbd> once per phone.
                Alternatively, paste an <code>https://</code> tunnel URL
                (ngrok, localtunnel, cloudflared) below.
              </p>
            </QrHttpsGate>
          ) : (
            <>
              <QrCard>
                {qrEmbedsJwt && (
                  <QrSecretBadge role="status" aria-live="polite">
                    <span aria-hidden="true">🔒</span>
                    <span>
                      <strong>QR includes JWT</strong>
                      {jwtExpiry ? ` · expires ${jwtExpiry}` : ''} — don&rsquo;t share.
                    </span>
                  </QrSecretBadge>
                )}
                <QrCanvasWrap>
                  <canvas ref={qrCanvasRef} aria-label={`QR code for ${mobileUrl}`} />
                </QrCanvasWrap>
                <QrUrl>{mobileUrl || '—'}</QrUrl>
                <QrBtnRow>
                  <QrMiniBtn type="button" onClick={handleCopyMobileUrl} disabled={!mobileUrl}>
                    {copied ? 'Copied!' : qrEmbedsJwt ? 'Copy URL + JWT' : 'Copy URL'}
                  </QrMiniBtn>
                  {hasValidJwt && (
                    <QrInlineToggle>
                      <input
                        type="checkbox"
                        checked={embedJwt}
                        onChange={handleToggleEmbedJwt}
                      />
                      Include JWT
                    </QrInlineToggle>
                  )}
                </QrBtnRow>
                <QrHint>
                  {qrEmbedsJwt
                    ? 'Phone will auto-import the JWT and enable Token Auth on scan.'
                    : hasValidJwt
                      ? 'JWT entered but not embedded. Toggle above to include it.'
                      : 'Scan from a phone on the same Wi-Fi, or paste a tunnel URL (ngrok, localtunnel, cloudflared) below.'}
                </QrHint>
              </QrCard>
              {lanEntries.length > 0 && (
                <QrChipRow>
                  {lanEntries.map((e) => (
                    <QrChip
                      key={e.address}
                      type="button"
                      $active={mobileUrl === e.url}
                      onClick={() => handlePickLanEntry(e.url)}
                      title={`${e.name} — ${e.address}`}
                    >
                      {e.name} · {e.address}
                    </QrChip>
                  ))}
                </QrChipRow>
              )}
            </>
          )}

          <Input
            type="text"
            placeholder="https://your-lan-ip:5173  or  https://xxx.ngrok-free.app"
            value={mobileUrl}
            onChange={(e) => handleMobileUrlChange(e.target.value)}
            spellCheck={false}
            style={{ marginTop: 8 }}
          />
          {!qrBlocked && !mobileReachable && (
            <QrWarn>
              <strong>{mobileHostname || 'This URL'}</strong> won&rsquo;t work from a
              phone.{' '}
              {lanEntries.length > 0 ? (
                <>Pick a LAN IP chip above, or paste a tunnel URL.</>
              ) : (
                <>
                  No LAN IPs detected. Connect to Wi-Fi and restart{' '}
                  <code>npm run dev</code>, or start a tunnel
                  (<code>npx localtunnel --port 5173</code>) and paste that URL.
                </>
              )}
            </QrWarn>
          )}
        </DesktopOnly>

        <Actions>
          <ActionButton $variant="danger" onClick={handleClear}>
            Clear All
          </ActionButton>
          <ActionButton onClick={onClose}>Cancel</ActionButton>
          <ActionButton $variant="primary" onClick={handleSave}>
            {pendingReload ? 'Save & Reload' : 'Save'}
          </ActionButton>
        </Actions>
      </Panel>
    </Overlay>
  );
};

export default DevSettingsOverlay;
