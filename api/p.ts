/**
 * Edge function: returns the HTML page that iMessage's Link Preview
 * daemon scrapes. The daemon does NOT execute JavaScript, so this
 * response has to carry the og:* meta tags inline — the SPA's
 * index.html can't satisfy per-link previews.
 *
 * Tap behavior: a human who clicks the link is bounced to `href`
 * (defaults to "/") via <meta http-equiv="refresh">. That route lives
 * inside the React app, so it opens the existing trip/booking UI.
 *
 * Query params:
 *   title    — required-ish; shown as the big card heading
 *   subtitle — second line under the title (dates, location, etc.)
 *   meta     — small footer line on the OG image (e.g. trip name)
 *   type     — booking type for color/icon (see api/og.tsx)
 *   href     — in-app path to bounce the user to. Must be a relative
 *              path starting with "/" — absolute URLs are rejected to
 *              keep this from being weaponised as an open redirector.
 *   desc     — overrides og:description (defaults to subtitle)
 *
 * Example:
 *   /p?title=Marriott+Autograph&subtitle=Sept+12%E2%80%9315+%C2%B7+3+nights
 *      &type=hotel&meta=Tokyo+trip&href=%2Ftrip%2Fabc123
 */

export const config = { runtime: 'edge' };

const SITE = 'https://wanderbot-ai.vercel.app';

/* Block javascript:, data:, and absolute URLs so the redirect can't
   be abused — the agent should only ever produce in-app paths. */
function safeHref(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const title = (url.searchParams.get('title') || 'Photon').slice(0, 120);
  const subtitle = (url.searchParams.get('subtitle') || '').slice(0, 160);
  const meta = (url.searchParams.get('meta') || '').slice(0, 80);
  const type = (url.searchParams.get('type') || 'activity').slice(0, 32);
  const desc = (url.searchParams.get('desc') || subtitle).slice(0, 220);
  const href = safeHref(url.searchParams.get('href'));

  /* The og:image URL is built from the same params so the picture
     and the meta tags stay in sync. */
  const ogParams = new URLSearchParams();
  ogParams.set('title', title);
  if (subtitle) ogParams.set('subtitle', subtitle);
  if (meta) ogParams.set('meta', meta);
  ogParams.set('type', type);
  const ogImage = `${SITE}/og?${ogParams.toString()}`;

  const canonical = `${SITE}${url.pathname}${url.search}`;
  const target = `${SITE}${href}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}" />
<link rel="canonical" href="${escapeHtml(canonical)}" />

<!-- Open Graph: what Apple's Link Preview daemon scrapes -->
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Photon" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(desc)}" />
<meta property="og:url" content="${escapeHtml(canonical)}" />
<meta property="og:image" content="${escapeHtml(ogImage)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${escapeHtml(title)}" />

<!-- Twitter Card mirror — covered for completeness; iMessage primarily
     uses og:* but other clients (Slack, etc.) fall back to twitter:*. -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(desc)}" />
<meta name="twitter:image" content="${escapeHtml(ogImage)}" />

<!-- Bounce real visitors into the app. Bots don't follow this. -->
<meta http-equiv="refresh" content="0; url=${escapeHtml(target)}" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #fbfaf9;
    font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #1F2421; }
  .wrap { display: flex; align-items: center; justify-content: center;
    height: 100%; padding: 24px; box-sizing: border-box; text-align: center; }
  .card { max-width: 420px; }
  .card h1 { margin: 0 0 8px; font-size: 22px; letter-spacing: -0.4px; }
  .card p { margin: 0 0 16px; color: rgba(31,36,33,0.6); font-size: 14px; }
  .card a { color: #216869; text-decoration: none; font-weight: 600;
    border-bottom: 1px solid rgba(33, 104, 105, 0.35); }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    ${desc ? `<p>${escapeHtml(desc)}</p>` : ''}
    <p>Opening Photon… <a href="${escapeHtml(target)}">Tap here if it doesn’t.</a></p>
  </div>
</div>
<script>
  /* Hard redirect in JS too, so browsers that have meta-refresh
     disabled still bounce. Bots don't run this. */
  window.location.replace(${JSON.stringify(target)});
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      /* Shorter cache than the image — descriptions/titles might be
         tweaked, and the page is small. */
      'cache-control': 'public, max-age=300, s-maxage=3600',
    },
  });
}
