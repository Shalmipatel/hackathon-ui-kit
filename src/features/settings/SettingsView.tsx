import React, { useState, useRef, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { theme } from '@/components/theme';
import { TimezoneSelect } from './TimezoneSelect';
import { useTimezone } from './useTimezone';
import { useLocation } from './useLocation';
import { useAnalyticsOptOut } from './useAnalyticsOptOut';
import { formatLocationLabel } from '@/core/utils';
import { useAuth } from '@/features/auth';
import { EVENTS, track, deleteUserProfile } from '@/features/analytics';
import { hostBridge } from '@/providers/host-bridge';
import { pushBridge, type PushPermission } from '@/providers/host-bridge/features/push';
import { permissionsBridge } from '@/providers/host-bridge/features/permissions';

/* ── Layout shell — mirrors SecurityView / ConnectionsView ── */

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

const SectionLabel = styled.h2`
  font-family: 'Inter', ${theme.fontFamily};
  font-size: 17px;
  font-weight: 700;
  color: #202020;
  letter-spacing: -0.3px;
  margin: 0 0 6px;
`;

const SectionDesc = styled.p`
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  color: rgba(36, 36, 36, 0.5);
  margin: 0 0 14px;
  line-height: 22px;
`;

const SectionGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 44px;
  &:last-child { margin-bottom: 0; }
`;

/* ── Row card — one control per row ── */

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 24px;
  border: 1px solid rgba(36, 36, 36, 0.05);
  border-radius: 24px;
  background: white;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 20px;
  }
`;

const RowLabel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
`;

const RowName = styled.span`
  font-size: 15px;
  font-weight: 500;
  color: #242424;
`;

const RowDesc = styled.span`
  font-size: 13px;
  color: rgba(36, 36, 36, 0.75);
`;

const RowControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;

  /* Let selects span the full row when stacked on mobile so wider
     timezone / location triggers aren't clipped by the card edge. */
  @media (max-width: 640px) {
    width: 100%;
  }
`;

const LocationDisplay = styled.span`
  font-family: 'Inter', ${theme.fontFamily};
  font-size: 14px;
  color: #242424;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(36, 36, 36, 0.04);
  white-space: nowrap;
`;

/* ── Inline spinner for pending writes ── */

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const ButtonSpinner = styled.span`
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid #e4e4e7;
  border-top-color: #242424;
  border-radius: 50%;
  animation: ${spin} 0.7s linear infinite;
  vertical-align: middle;
`;

/* ── Interval dropdown (local select for unit / interval pairs) ── */

const IntervalWrapper = styled.div`
  position: relative;
  display: inline-flex;
`;

const IntervalTrigger = styled.button<{ $open: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid
    ${(p) => (p.$open ? 'rgba(36, 36, 36, 0.4)' : 'rgba(36, 36, 36, 0.2)')};
  border-radius: 12px;
  background: white;
  font-size: 14px;
  font-family: 'Inter', ${theme.fontFamily};
  color: #242424;
  cursor: pointer;
  outline: none;
  min-width: 70px;
  text-align: left;
  transition: border-color 0.15s;

  &:hover { border-color: rgba(36, 36, 36, 0.4); }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const IntervalChevron = styled.span<{ $open: boolean }>`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: rgba(36, 36, 36, 0.5);
  transition: transform 0.15s;
  transform: ${(p) => (p.$open ? 'rotate(180deg)' : 'rotate(0deg)')};
`;

const IntervalMenu = styled.ul`
  list-style: none;
  margin: 0;
  padding: 6px;
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 1000;
  min-width: 100%;
  background: white;
  border: 1px solid rgba(36, 36, 36, 0.1);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  max-height: 240px;
  overflow-y: auto;
`;

const IntervalMenuItem = styled.li<{ $selected: boolean }>`
  padding: 8px 12px;
  font-size: 14px;
  font-family: 'Inter', ${theme.fontFamily};
  color: ${(p) => (p.$selected ? '#242424' : 'rgba(36, 36, 36, 0.85)')};
  font-weight: ${(p) => (p.$selected ? 600 : 500)};
  background: ${(p) => (p.$selected ? 'rgba(36, 36, 36, 0.05)' : 'transparent')};
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;

  &:hover { background: rgba(36, 36, 36, 0.05); }
`;

interface IntervalOption<T extends string | number> {
  value: T;
  label: string;
}

interface IntervalDropdownProps<T extends string | number> {
  value: T;
  options: ReadonlyArray<IntervalOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

function IntervalDropdown<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
}: IntervalDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <IntervalWrapper ref={wrapperRef}>
      <IntervalTrigger
        type="button"
        $open={open}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((p) => !p)}
      >
        <span>{selected?.label ?? ''}</span>
        <IntervalChevron $open={open}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </IntervalChevron>
      </IntervalTrigger>
      {open && (
        <IntervalMenu role="listbox">
          {options.map((o) => (
            <IntervalMenuItem
              key={String(o.value)}
              role="option"
              aria-selected={o.value === value}
              $selected={o.value === value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </IntervalMenuItem>
          ))}
        </IntervalMenu>
      )}
    </IntervalWrapper>
  );
}

/* ── Account section (destructive actions live here) ── */

const DangerButton = styled.button`
  padding: 8px 20px;
  border: 1px solid #e4e4e7;
  border-radius: 24px;
  background: white;
  color: #71717a;
  font-size: 13px;
  font-weight: 600;
  font-family: 'Inter', ${theme.fontFamily};
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;

  &:hover {
    border-color: #ef4444;
    color: #ef4444;
    background: #fef2f2;
  }
`;

/* ── Confirmation modal ── */

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
  background: white;
  border-radius: 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  padding: 32px;
  animation: ${modalSlideUp} 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
`;

const ModalTitle = styled.h3`
  font-family: 'Inter', ${theme.fontFamily};
  font-size: 18px;
  font-weight: 700;
  color: #18181b;
  margin: 0 0 12px;
`;

const ModalBody = styled.p`
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  color: #71717a;
  line-height: 22px;
  margin: 0 0 24px;
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
`;

const CancelButton = styled.button`
  padding: 9px 20px;
  border: 1px solid #e4e4e7;
  border-radius: 24px;
  background: white;
  color: #71717a;
  font-size: 13px;
  font-weight: 600;
  font-family: 'Inter', ${theme.fontFamily};
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: #f4f4f5;
    color: #18181b;
  }
`;

const DestructiveButton = styled.button`
  padding: 9px 20px;
  border: 1px solid #ef4444;
  border-radius: 24px;
  background: #ef4444;
  color: white;
  font-size: 13px;
  font-weight: 600;
  font-family: 'Inter', ${theme.fontFamily};
  cursor: pointer;
  transition: opacity 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 8px;

  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const ModalError = styled.p`
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  color: #ef4444;
  margin: 0 0 12px;
`;

/* ── Toggle Switch ── */

const ToggleTrack = styled.button<{ $on: boolean }>`
  position: relative;
  width: 44px;
  height: 24px;
  border-radius: 12px;
  border: none;
  background: ${(p) => (p.$on ? '#242424' : 'rgba(36, 36, 36, 0.15)')};
  cursor: pointer;
  transition: background 0.2s ease;
  flex-shrink: 0;
  padding: 0;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ToggleThumb = styled.span<{ $on: boolean }>`
  position: absolute;
  top: 2px;
  left: ${(p) => (p.$on ? '22px' : '2px')};
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  transition: left 0.2s ease;
`;

/* ── Main Component ── */

const SettingsView: React.FC = () => {
  const { timezone: selectedTimezone, isLoading: updatingTimezone, updateTimezone } = useTimezone();
  const { location: selectedLocation, isLoading: updatingLocation } = useLocation();
  const {
    optedOut: loggingOptedOut,
    isLoading: loggingPrefLoading,
    setOptedOut: setLoggingOptedOut,
  } = useAnalyticsOptOut();
  const [loggingToggling, setLoggingToggling] = useState(false);
  const { signOut } = useAuth();

  const handleLoggingToggle = useCallback(async () => {
    if (loggingToggling || loggingPrefLoading) return;
    setLoggingToggling(true);
    try {
      // Toggle ON in the UI means "logging enabled" (the friendly framing),
      // which maps to `analyticsOptOut: false` in the preference store.
      await setLoggingOptedOut(!loggingOptedOut);
    } finally {
      setLoggingToggling(false);
    }
  }, [loggingToggling, loggingPrefLoading, loggingOptedOut, setLoggingOptedOut]);

  /* ── Push notification toggle state ── */
  const [pushPermission, setPushPermission] = useState<PushPermission | null>(null);
  const [pushRegistered, setPushRegistered] = useState(false);
  const [pushToggling, setPushToggling] = useState(false);
  const pushMountedRef = useRef(true);

  useEffect(() => {
    pushMountedRef.current = true;
    if (!hostBridge.isNative()) return;

    pushBridge.getStatus().then((status) => {
      if (pushMountedRef.current && status) {
        setPushPermission(status.permission);
        setPushRegistered(status.registered);
      }
    });

    const unsubscribe = pushBridge.onStatusChanged((payload) => {
      if (pushMountedRef.current) {
        setPushPermission(payload.permission);
        setPushRegistered(payload.registered);
      }
    });

    return () => {
      pushMountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const handlePushToggle = useCallback(async () => {
    if (pushToggling) return;
    setPushToggling(true);

    try {
      if (pushRegistered) {
        await pushBridge.unregister();
        if (pushMountedRef.current) setPushRegistered(false);
      } else {
        if (pushPermission === 'denied') {
          await permissionsBridge.openSettings();
          setPushToggling(false);
          return;
        }
        if (pushPermission === 'undetermined') {
          const result = await pushBridge.requestPermission();
          if (pushMountedRef.current) setPushPermission(result);
          if (result !== 'granted') {
            setPushToggling(false);
            return;
          }
        }
        const regResult = await pushBridge.register();
        if (pushMountedRef.current && regResult) {
          setPushRegistered(regResult.status !== 'no_permission');
        }
      }
    } finally {
      if (pushMountedRef.current) setPushToggling(false);
    }
  }, [pushRegistered, pushPermission, pushToggling]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteAccount = useCallback(async () => {
    setDeleting(true);
    setDeleteError(null);

    try {
      const resp = await fetch('/api/account/delete', {
        method: 'POST',
        credentials: 'include',
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        throw new Error(body?.message || `Delete failed (${resp.status})`);
      }

      track(EVENTS.ACCOUNT_DELETED, {
        connections_at_deletion: 0,
        days_active: 0,
      });
      deleteUserProfile();

      await signOut();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setDeleting(false);
    }
  }, [signOut]);

  return (
    <>
      <Grid>
        <LeftColumn>
          {/* ── Notifications ── */}
          {hostBridge.isNative() && (
            <>
              <SectionLabel>Notifications</SectionLabel>
              <SectionDesc>Control push notification delivery to this device.</SectionDesc>
              <SectionGroup>
                <Row>
                  <RowLabel>
                    <RowName>Push Notifications</RowName>
                    <RowDesc>
                      {pushPermission === 'denied'
                        ? 'Notifications are blocked. Tap to open Settings.'
                        : 'Receive alerts from the assistant.'}
                    </RowDesc>
                  </RowLabel>
                  <RowControls>
                    {pushToggling && <ButtonSpinner />}
                    <ToggleTrack
                      type="button"
                      $on={pushRegistered && pushPermission === 'granted'}
                      onClick={handlePushToggle}
                      disabled={pushToggling}
                      aria-label="Toggle push notifications"
                      aria-pressed={pushRegistered && pushPermission === 'granted'}
                    >
                      <ToggleThumb $on={pushRegistered && pushPermission === 'granted'} />
                    </ToggleTrack>
                  </RowControls>
                </Row>
              </SectionGroup>
            </>
          )}

          {/* ── Localization ── */}
          <SectionLabel>Localization</SectionLabel>
          <SectionDesc>Used to display times and localize content.</SectionDesc>
          <SectionGroup>
            <Row>
              <RowLabel>
                <RowName>Timezone</RowName>
                <RowDesc>Times across the app use this timezone.</RowDesc>
              </RowLabel>
              <RowControls>
                <TimezoneSelect
                  value={selectedTimezone}
                  onChange={updateTimezone}
                  disabled={updatingTimezone}
                />
                {updatingTimezone && <ButtonSpinner />}
              </RowControls>
            </Row>
            <Row>
              <RowLabel>
                <RowName>Location</RowName>
                <RowDesc>
                  Auto-detected from your network — used to localize
                  results with local context.
                </RowDesc>
              </RowLabel>
              <RowControls>
                <LocationDisplay>
                  {formatLocationLabel(selectedLocation) ||
                    (updatingLocation ? 'Detecting…' : 'Unknown')}
                </LocationDisplay>
                {updatingLocation && <ButtonSpinner />}
              </RowControls>
            </Row>
          </SectionGroup>

          {/* ── About ── */}
          <SectionLabel>About</SectionLabel>
          <SectionDesc>AI Assistant Starter v1.0.0</SectionDesc>
        </LeftColumn>
      </Grid>

      {showDeleteConfirm && (
        <ModalOverlay onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <ModalCard onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Delete your account?</ModalTitle>
            <ModalBody>
              This will permanently delete your data, connections, and
              preferences. You'll need to sign up again to use the app.
            </ModalBody>
            {deleteError && <ModalError>{deleteError}</ModalError>}
            <ModalActions>
              <CancelButton
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </CancelButton>
              <DestructiveButton
                onClick={handleDeleteAccount}
                disabled={deleting}
              >
                {deleting && <ButtonSpinner style={{ borderTopColor: 'white' }} />}
                {deleting ? 'Deleting...' : 'Delete account'}
              </DestructiveButton>
            </ModalActions>
          </ModalCard>
        </ModalOverlay>
      )}
    </>
  );
};

export default SettingsView;
