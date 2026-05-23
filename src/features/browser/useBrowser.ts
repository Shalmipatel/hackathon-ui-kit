/**
 * useBrowser - Web-native hook for browser panel status and control.
 *
 * Uses GatewayTransport for all API calls (auth via cookie, not manual
 * Bearer headers). noVNC iframe URL uses cookie auth -- no token in URL.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getGateway } from '@/features/app/bootstrap/providers';
import type { ExtensionSettings } from '@/types';

export type ControlMode = 'agent' | 'user';

export interface BrowserStatus {
  containerRunning: boolean;
  controlMode: ControlMode;
  noVncUrl: string | null;
  currentUrl: string | null;
  lastUpdated: string;
}

export interface UseBrowserReturn {
  status: BrowserStatus | null;
  loading: boolean;
  error: string | null;
  panelVisible: boolean;
  togglePanel: () => void;
  setControlMode: (mode: ControlMode) => Promise<void>;
  refreshStatus: () => Promise<void>;
  getNoVncIframeUrl: () => string | null;
}

export function useBrowser(
  settings: ExtensionSettings | null,
  pollingInterval: number = 5000,
  pollingEnabled: boolean = true,
): UseBrowserReturn {
  const [status, setStatus] = useState<BrowserStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const resp = await getGateway().request('/api/neoclaw-browser/status');
      const data = await resp.json();
      if (data.success && data.data) {
        setStatus(data.data as BrowserStatus);
        setError(null);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch browser status');
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    await fetchStatus();
    setLoading(false);
  }, [fetchStatus]);

  const setControlMode = useCallback(async (mode: ControlMode) => {
    try {
      setLoading(true);
      const resp = await getGateway().request('/api/neoclaw-browser/control', {
        method: 'POST',
        body: { mode },
      });

      const data = await resp.json();
      if (data.success && data.data) {
        setStatus((prev) =>
          prev ? { ...prev, controlMode: data.data.controlMode } : null,
        );
        setError(null);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set control mode');
    } finally {
      setLoading(false);
    }
  }, []);

  const togglePanel = useCallback(() => {
    setPanelVisible((prev) => !prev);
  }, []);

  const getNoVncIframeUrl = useCallback(() => {
    if (!status?.containerRunning) return null;

    const fallbackIp =
      settings?.fallbackTargetIpEnabled && settings?.fallbackTargetIp
        ? settings.fallbackTargetIp
        : null;

    const params = new URLSearchParams({
      autoconnect: 'true',
      resize: 'scale',
    });

    if (fallbackIp) {
      params.set('fallbackIp', fallbackIp);
    }

    return `/api/neoclaw-browser/novnc/vnc.html?${params.toString()}`;
  }, [status?.containerRunning, settings?.fallbackTargetIpEnabled, settings?.fallbackTargetIp]);

  useEffect(() => {
    if (panelVisible) {
      refreshStatus();
    }
  }, [panelVisible, refreshStatus]);

  useEffect(() => {
    if (!panelVisible || !pollingEnabled || pollingInterval <= 0) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    pollingRef.current = setInterval(fetchStatus, pollingInterval);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [panelVisible, pollingEnabled, pollingInterval, fetchStatus]);

  return {
    status,
    loading,
    error,
    panelVisible,
    togglePanel,
    setControlMode,
    refreshStatus,
    getNoVncIframeUrl,
  };
}
