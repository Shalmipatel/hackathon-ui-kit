# src/dev/

**Everything in this folder is dev-only. None of it ships to production.**

## Convention

- Modules here are imported via `await import('./dev/...')` from sites that
  are gated on `import.meta.env.DEV`.
- Rollup (Vite's prod bundler) replaces `import.meta.env.DEV` with the
  literal `false` in prod builds. The gated `import()` becomes unreachable
  dead code, and the entire module file is tree-shaken out of the bundle.
- A postbuild check (`scripts/verify-no-dev-code.mjs`, wired into
  `npm run build`) greps `dist/` for known dev-only markers and fails the
  build if any are found. So this is a hard guarantee, not just a promise.

## When to add something here

Anything that:

1. Aids local development or debugging, AND
2. Must not be shipped to end users (security, IP, or just noise).

Examples that belong here:
- Secret-injection flows (like `dev-jwt-import` — consumes a JWT from a
  QR-scanned URL fragment and installs it into localStorage).
- Dev-only UI overlays that pull in heavy deps we don't want in prod
  (like `features/settings/DevSettingsOverlay` — statically imports the
  `qrcode` package, ~40 KB min; shipping it via static-import would bloat
  the prod bundle for zero end-user benefit).
- Mock auth providers, API stubs, fixture loaders.
- Browser-API polyfills that only make sense in dev and would be wrong
  (or insecure) in prod. Prefer fixing the root cause first (e.g. run
  HTTPS dev via `VITE_DEV_HTTPS=1` instead of shimming `crypto.*`
  APIs that are intentionally withheld from non-secure contexts).

## When NOT to add something here

- Runtime feature flags that toggle prod behavior (use `ExtensionSettings`).
- Observability / logging (that's prod code).
- Test-only fixtures (those live next to the tests they support).

## Adding a new dev-only module — checklist

1. Put the module under `src/dev/...`.
2. Import it from app code with a dev-gated dynamic import (see patterns
   below — differs slightly for side-effect modules vs. React components).
3. Inside the module, add a belt-and-suspenders runtime guard:
   ```ts
   export function doThing() {
     if (!import.meta.env.DEV) return;
     // ...
   }
   ```
4. If the module introduces a new symbol or URL pattern that should never
   appear in prod bundles (e.g. a URL parameter name like `dev-jwt=`), add
   it to the `FORBIDDEN_MARKERS` list in `scripts/verify-no-dev-code.mjs`.
5. Run `npm run build` — the postbuild check must pass.

### Import patterns

**Side-effect / function module** (e.g. `dev-jwt-import`):

```ts
if (import.meta.env.DEV) {
  const m = await import('@/dev/providers/auth/dev-jwt-import');
  await m.tryImportDevJwt();
}
```

**React component** (e.g. `DevSettingsOverlay`):

```tsx
import { Suspense, lazy } from 'react';

// Wrap `lazy()` in the dev-gate — a bare `React.lazy(() => import(...))`
// keeps the chunk in `dist/` "just in case" because Rollup can't prove
// the callback is never invoked. With `import.meta.env.DEV` inlined to
// `false` in prod, the ternary folds to `null` at build time and the
// chunk (plus transitive deps) is dropped.
const DevOverlay = import.meta.env.DEV
  ? lazy(() => import('@/dev/features/settings/DevSettingsOverlay'))
  : null;

function App() {
  return (
    <>
      {import.meta.env.DEV && DevOverlay && open && (
        <Suspense fallback={null}>
          <DevOverlay />
        </Suspense>
      )}
    </>
  );
}
```

## Why a separate top-level folder?

A `grep -r "from '@/dev/'" src/` instantly shows every touchpoint between
prod code and dev code, so the boundary is visible and auditable. Scattering
dev-only helpers next to their prod counterparts works for small projects
but gets risky as the codebase grows.
