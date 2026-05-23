export {
  useNavigationStore,
  type NavigationTarget,
} from './navigation-store';

/**
 * Expose navigation helpers on `window.__nav` so they can be called from
 * the browser DevConsole during development (e.g. `__nav.goToChat('id')`).
 */
if (import.meta.env.DEV) {
  import('./navigation-store').then(({ useNavigationStore: store }) => {
    const { goToHome, goToCalendarEvent, goToChat } = store.getState();
    (window as Record<string, unknown>).__nav = {
      goToHome,
      goToCalendarEvent,
      goToChat,
    };
  });
}
