/**
 * usePlatformEvents - Hook to subscribe to platform events via PlatformEvents.
 *
 * Replaces the bridge-based onNotificationMessage with web-native SSE.
 * Starts the service on mount, subscribes handlers, and cleans up on unmount.
 */

import { useEffect, useRef } from 'react';
import { getPlatformEvents } from '@/features/app/bootstrap/providers';
import type { CronNotification } from '@/types';
import type { BrowserActiveEventData, ConfigChangedEventData } from '@/providers/events';

export type { CronNotification };
export type { BrowserActiveEventData, ConfigChangedEventData };

export interface PlatformEventHandlers {
  onBrowserActive?: (data: BrowserActiveEventData) => void;
  onBrowserIdle?: (data: BrowserActiveEventData) => void;
  onCronRun?: (data: CronNotification) => void;
  onConfigChanged?: (data: ConfigChangedEventData) => void;
}

export function usePlatformEvents(handlers: PlatformEventHandlers): void {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    const service = getPlatformEvents();

    const unsubscribe = service.subscribe({
      onCronRun: (data) => handlersRef.current.onCronRun?.(data),
      onBrowserActive: (data) => handlersRef.current.onBrowserActive?.(data),
      onBrowserIdle: (data) => handlersRef.current.onBrowserIdle?.(data),
      onConfigChanged: (data) => handlersRef.current.onConfigChanged?.(data),
    });

    service.start().catch((err) => {
      console.error('[usePlatformEvents] Failed to start PlatformEvents:', err);
    });

    return () => {
      unsubscribe();
    };
  }, []);
}
