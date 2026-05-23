export { StubAuthProvider } from './stub-auth';

/* localStorage key used by the dev-only JWT importer in src/dev/.
 * Kept here (not in stub-auth) because it's read by dev tooling, not by
 * the auth provider itself. The whole src/dev tree is tree-shaken from
 * prod builds — see scripts/verify-no-dev-code.mjs. */
export const DEV_JWT_KEY = 'neoclaw_dev_jwt';
