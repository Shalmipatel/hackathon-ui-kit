/**
 * Starter-kit stub: the onboarding wizard is removed from the kit, so
 * this hook always reports "complete". Re-introduce the real flow by
 * restoring this file from the upstream repo and re-mounting
 * OnboardingFlow in TabPage.
 */
export function useOnboarding() {
  return {
    showOnboarding: false as const,
    completeOnboarding: () => {
      /* no-op */
    },
  };
}
