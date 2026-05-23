#!/usr/bin/env node
/**
 * verify-no-dev-code.mjs
 *
 * Postbuild CI guard: scans the production bundle in dist/ for markers
 * that belong exclusively to dev-only code under src/dev/. If any are
 * found, the build fails loudly.
 *
 * This is a hard guarantee (not just a convention) that dev-only
 * features like the #dev-jwt= URL-fragment importer never leak into
 * shipped bundles. See src/dev/README.md for the full convention.
 *
 * How to add a new dev-only marker:
 *   1. Put your new code under src/dev/...
 *   2. Pick a string literal that exists ONLY in that module (e.g. a
 *      sessionStorage key, a unique URL param name). It must be a
 *      plain string literal — function/variable names get minified
 *      and renamed by Rollup, strings do not.
 *   3. Add it to FORBIDDEN_MARKERS below.
 *   4. Run `npm run build` to confirm it passes.
 *
 * Exits 0 on success, 1 on failure.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, '..', 'dist');

/**
 * Markers unique to src/dev/**. Each entry is a plain string (not regex
 * — we want zero false positives). If any of these appears in a
 * production JS/CSS asset, the build fails.
 *
 * Notes on what NOT to list:
 *  - The DEV_JWT_KEY localStorage value — also used by the real auth
 *    provider in prod to *read* a possibly-stored dev token (no-op in
 *    the common case), so it legitimately appears in bundles.
 */
const FORBIDDEN_MARKERS = [
  'dev-jwt-import:consumed',            // REENTRY_FLAG in dev-jwt-import.ts
  'dev-jwt-import:pending-toast',       // PENDING_TOAST_KEY in dev-jwt-import.ts
  'dev-settings-overlay:module-loaded', // marker in dev/features/settings/DevSettingsOverlay.tsx
];

/**
 * Which files under dist/ to scan. We only scan emitted JS/CSS bundles
 * — source maps (.map) are allowed to contain dev markers because they
 * ship separately and are typically not served in prod, and HTML is
 * scanned too in case a literal ends up inlined.
 */
const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.css', '.html']);

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

async function main() {
  let distExists = false;
  try {
    const s = await stat(DIST_DIR);
    distExists = s.isDirectory();
  } catch { /* missing */ }

  if (!distExists) {
    console.error(`[verify-no-dev-code] dist/ not found at ${DIST_DIR}`);
    console.error('[verify-no-dev-code] Run `npm run build` first.');
    process.exit(1);
  }

  const hits = [];
  let scanned = 0;

  for await (const file of walk(DIST_DIR)) {
    const ext = file.slice(file.lastIndexOf('.'));
    if (!SCAN_EXTENSIONS.has(ext)) continue;
    scanned++;
    const content = await readFile(file, 'utf8');
    for (const marker of FORBIDDEN_MARKERS) {
      if (content.includes(marker)) {
        hits.push({ file: file.replace(DIST_DIR + '/', ''), marker });
      }
    }
  }

  if (hits.length > 0) {
    console.error('\n❌ [verify-no-dev-code] Dev-only markers found in production bundle:\n');
    for (const { file, marker } of hits) {
      console.error(`   ${file}`);
      console.error(`     → contains forbidden marker: ${JSON.stringify(marker)}`);
    }
    console.error('\nThis usually means a `src/dev/**` module was statically');
    console.error('imported from prod code, bypassing the `import.meta.env.DEV`');
    console.error('gate in src/index.tsx. See src/dev/README.md.\n');
    process.exit(1);
  }

  console.log(
    `✓ [verify-no-dev-code] scanned ${scanned} file(s) in dist/, ` +
    `no dev-only markers leaked.`,
  );
}

main().catch((err) => {
  console.error('[verify-no-dev-code] unexpected error:', err);
  process.exit(1);
});
