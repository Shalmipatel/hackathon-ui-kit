/**
 * Edge function: renders the iMessage link-preview card as a 1200x630 PNG.
 *
 * Layout (matches the rich travel-card reference design):
 *   ┌─────────────────────────────────────┐
 *   │  illustrated hero scene (320px)     │  ← sky + mountains/skyline/etc.
 *   │  + wordmark + type chip overlay     │
 *   │  + small caps context + title       │
 *   ├─────────────────────────────────────┤
 *   │  stats row (DATES | LENGTH | PARTY) │  ← 3 columns w/ dividers
 *   ├─────────────────────────────────────┤
 *   │  numbered agenda list               │  ← color-coded by item type
 *   │  ① Walk around Zürich         PM    │
 *   │  ② Lindt Home of Chocolate  TICKETS │
 *   │  ③ Dinner at Haus Hiltl       6:00  │
 *   │  ④ Renaissance Zürich Tower   STAY  │
 *   └─────────────────────────────────────┘
 *
 * Query params (all optional except `title`):
 *   title    — hero headline, e.g. "Switzerland" or "Marriott Autograph"
 *   eyebrow  — small uppercase line above the title, e.g.
 *              "SAT JUN 20 · LANDS 3:45 PM · ZRH". When omitted but
 *              `title` contains " · ", the leading segment becomes
 *              the eyebrow automatically.
 *   type     — card type — drives the type chip + per-item number
 *              accent colors:
 *              flight | hotel | attraction | experience | event |
 *              activity | restaurant | transport | trip
 *   scene    — illustrated hero scene to render BEHIND the title.
 *              One of: `mountain` (Alps/Rockies/Andes), `city`
 *              (skyline silhouette), `coast` (palm + horizon),
 *              `desert` (dunes + sun), `forest` (trees + sky),
 *              `snow` (winter scene). Defaults to `mountain` for
 *              `type=trip` and a generic gradient otherwise.
 *   stats    — pipe-separated `label:value` pairs for the stats
 *              row. Up to 3. Example:
 *              `DATES:Jun 19–28|LENGTH:9 days|PARTY:2 travelers`
 *   items    — pipe-separated agenda items, each as
 *              `<itemType>:<text>:<sideTag>`. Up to 5 items.
 *              `<itemType>` controls the numeral accent color and
 *              maps to the same enum as `type` (activity, hotel,
 *              restaurant, etc.). Example:
 *              `activity:Walk around Zürich:PM|attraction:Lindt Home:TICKETS|restaurant:Dinner at Hiltl:6:00|hotel:Renaissance Zürich Tower:STAY`
 *   note     — short paragraph of body text (~120 chars). Use
 *              instead of items/stats when the answer is free-form
 *              prose ("Pack layers + waterproof", "Local time is
 *              currently 4 hours ahead", "Avg high 22°C this week").
 *              Renders below the hero in a generous editorial type
 *              size. Can coexist with stats — note renders between
 *              stats and items.
 *   meta     — small footer line (left side). Defaults to empty.
 *   cta      — small footer line (right side). Defaults to
 *              "Open in Wanderbot →".
 *
 * Apple's Link Preview daemon scrapes this URL via the `og:image` meta
 * tag on /p (see api/p.ts). Output dimensions match Apple/Twitter
 * "large summary" cards.
 */

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

/* Load a font file shipped in /public/fonts/ as a binary buffer.
   Edge-runtime-only path: just fetch from same-origin. Vercel
   serves /public/* at root, so `/fonts/<file>.ttf` resolves to the
   font bundled in this repo.

   PREVIOUSLY: this had a node-fs fallback for local rendering. That
   crashed in Edge Runtime — Vercel disallows `new Function()` (the
   trick used to hide the dynamic import from the bundler), and a
   plain `await import('node:fs/promises')` also fails because the
   edge bundler statically analyzes all imports. Both forms 500'd
   the function.

   For local visual iteration, scripts/render-card.tsx now monkey-
   patches globalThis.fetch BEFORE importing this handler — it
   intercepts requests for `/fonts/*` and serves them from disk,
   so this same code path Just Works in both environments. */
async function loadFont(req: Request, filename: string): Promise<ArrayBuffer> {
  const fontUrl = new URL(`/fonts/${filename}`, req.url).href;
  const res = await fetch(fontUrl);
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`);
  return res.arrayBuffer();
}

/* Card type drives icon + tile color. Most values mirror the in-app
   BookingType (so a booking card on iMessage matches what the user
   sees inside Wanderbot). `trip` is an additional, higher-level
   variant for trip-overview previews ("Switzerland · Jun 19–28"). */
type CardType =
  | 'flight'
  | 'hotel'
  | 'attraction'
  | 'experience'
  | 'event'
  | 'activity'
  | 'restaurant'
  | 'transport'
  | 'trip';

/* Per-type accent colors used for the numeral squares on agenda
   items and incidental accents. Palette is earthy/editorial to
   match the reference design — warm sage greens, ochre, ember
   orange, deep charcoal — not the corporate-teal of earlier
   iterations. White-text-legible at the saturations chosen. */
const TYPE_ACCENT: Record<CardType, string> = {
  trip: '#1c3640',         /* deep teal-navy — sophisticated hero */
  flight: '#0d4a6e',       /* deep ocean blue */
  hotel: '#1c3640',        /* charcoal-navy — anchored stays */
  attraction: '#8c4a1a',   /* burnt sienna */
  experience: '#3d6e5f',   /* muted forest teal */
  event: '#9c2a4f',        /* deep magenta */
  activity: '#4f6b3a',     /* sage / outdoor green */
  restaurant: '#c8763e',   /* warm ember orange */
  transport: '#3a5a2f',    /* deep moss green */
};

/* Hero illustration background gradients — used when no `scene`
   is provided OR as the sky base under the scene SVG. */
const HERO_BG: Record<CardType, string> = {
  trip: 'linear-gradient(180deg, #0d2433 0%, #2d5d6e 60%, #5a8896 100%)',
  flight: 'linear-gradient(180deg, #0a2a44 0%, #1d5680 60%, #4a85af 100%)',
  hotel: 'linear-gradient(180deg, #1a1a1f 0%, #34302d 60%, #5a4e44 100%)',
  attraction: 'linear-gradient(180deg, #3b1f0e 0%, #6e3a18 60%, #a96a3a 100%)',
  experience: 'linear-gradient(180deg, #16302a 0%, #2f5949 60%, #5f8a76 100%)',
  event: 'linear-gradient(180deg, #2c0e1e 0%, #5b1d3e 60%, #9c2a4f 100%)',
  activity: 'linear-gradient(180deg, #1a2810 0%, #3c5026 60%, #6e8a4f 100%)',
  restaurant: 'linear-gradient(180deg, #3b1d10 0%, #7a3e1e 60%, #c8763e 100%)',
  transport: 'linear-gradient(180deg, #14220e 0%, #354c25 60%, #5e7c4a 100%)',
};

const TYPE_LABEL: Record<CardType, string> = {
  flight: 'Flight',
  hotel: 'Hotel',
  attraction: 'Attraction',
  experience: 'Experience',
  event: 'Event',
  activity: 'Activity',
  restaurant: 'Restaurant',
  transport: 'Transport',
  trip: 'Trip',
};

function isCardType(s: string): s is CardType {
  return s in TYPE_ACCENT;
}

/* SVGs ported from BookingCard's <BookingIcon>. Inline so the edge
   runtime has no asset-loader dependency. Stroke color and size are
   parameterized so the same icon can render light-on-dark inside the
   masthead (size 36, stroke #fff) and dark-on-light if ever needed
   in the body. */
function Icon({
  type,
  size = 36,
  stroke = '#ffffff',
}: { type: CardType; size?: number; stroke?: string }) {
  const sw = 2.2;
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke,
    strokeWidth: sw,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (type) {
    case 'flight':
      return (
        <svg {...common}>
          <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
        </svg>
      );
    case 'hotel':
      return (
        <svg {...common}>
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case 'activity':
      return (
        <svg {...common} strokeWidth={2.8}>
          <path d="M14 22V16L12 14M12 14L13 8M12 14H10M13 8C14 9.16667 15.6 11 18 11M13 8L12.8212 7.82124C12.2565 7.25648 11.2902 7.54905 11.1336 8.33223L10 14M10 14L8 22M18 9.5V22M8 7H7.72076C7.29033 7 6.90819 7.27543 6.77208 7.68377L5.5 11.5L7 12L8 7ZM14.5 3.5C14.5 4.05228 14.0523 4.5 13.5 4.5C12.9477 4.5 12.5 4.05228 12.5 3.5C12.5 2.94772 12.9477 2.5 13.5 2.5C14.0523 2.5 14.5 2.94772 14.5 3.5Z" />
        </svg>
      );
    case 'attraction':
      return (
        <svg {...common}>
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      );
    case 'experience':
      return (
        <svg {...common}>
          <path d="M12 3v3" />
          <path d="M12 18v3" />
          <path d="M3 12h3" />
          <path d="M18 12h3" />
          <path d="m5.6 5.6 2.1 2.1" />
          <path d="m16.3 16.3 2.1 2.1" />
          <path d="m5.6 18.4 2.1-2.1" />
          <path d="m16.3 7.7 2.1-2.1" />
        </svg>
      );
    case 'event':
      return (
        <svg {...common}>
          <path d="M3 7v3a2 2 0 0 0 0 4v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a2 2 0 0 0 0-4V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" />
          <path d="M13 5v2" />
          <path d="M13 17v2" />
          <path d="M13 11v2" />
        </svg>
      );
    case 'restaurant':
      return (
        <svg {...common}>
          <path d="M3 2v7c0 1.7 1.3 3 3 3v10" />
          <path d="M7 2v20" />
          <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.7 1.3 3 3 3v6" />
        </svg>
      );
    case 'transport':
      return (
        <svg {...common}>
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
          <circle cx="7" cy="17" r="2" />
          <path d="M9 17h6" />
          <circle cx="17" cy="17" r="2" />
        </svg>
      );
    case 'trip':
      /* Folded map — echoes the in-app TripMap and reads as "the whole
         trip" rather than any one place on it. Lucide "map" silhouette. */
      return (
        <svg {...common}>
          <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
          <line x1="9" y1="3" x2="9" y2="18" />
          <line x1="15" y1="6" x2="15" y2="21" />
        </svg>
      );
  }
}

/* Paper plane glyph for the wordmark — same shape as MobileApp's
   <PaperPlaneIcon>, kept inline so the edge runtime has no asset
   dependency. Slightly chunky stroke to read clearly at 24px. */
function PlaneGlyph() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#216869"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22L11 13L2 9L22 2Z" />
    </svg>
  );
}

/* Tiny location-pin glyph for the optional `loc` row. Sized to
   match the 28px loc text height. */
function PinGlyph() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="rgba(31, 36, 33, 0.56)"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

/* ─── ILLUSTRATED HERO SCENES ───────────────────────────────────
   Each scene is a complete SVG (1200x320) rendered as the hero
   backdrop behind the wordmark + title. Embedded into the layout
   as a data-URL <img> so Satori (which has limited inline-SVG
   support) gets a self-contained raster source it can place. */

type SceneName =
  | 'mountain'
  | 'city'
  | 'coast'
  | 'desert'
  | 'forest'
  | 'snow'
  | 'aurora'
  | 'river'
  | 'default';

function isSceneName(s: string): s is SceneName {
  return [
    'mountain',
    'city',
    'coast',
    'desert',
    'forest',
    'snow',
    'aurora',
    'river',
    'default',
  ].includes(s);
}

/* Stylized Alpine/Rockies/Andes scene — layered mountain silhouettes,
   sun/moon disc, deep teal-to-cyan sky gradient. Matches the
   reference design's main illustration. Five depth layers (sky →
   stars → far mist → mid range → front peaks → foreground silhouettes)
   for editorial depth rather than a flat triangle stack. SVG is
   1200×470 so the same illustration scales cleanly whether the hero
   is 290px (with agenda) or 470px (no agenda). */
function mountainScene(): string {
  /* Procedurally-generated star coordinates so the sky doesn't read
     as flat. Spread upper 2/3 of the canvas; brightness varies. */
  const stars = Array.from({ length: 32 })
    .map((_, i) => {
      const x = ((i * 173.7) % 1200) | 0;
      const y = (((i * 91.3) % 220) + 30) | 0;
      const r = i % 5 === 0 ? 1.6 : 0.9;
      const opacity = (((i * 7) % 4) + 6) / 14;
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fbfaf9" opacity="${opacity.toFixed(2)}"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 470" preserveAspectRatio="xMidYMax slice">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#091a26"/>
      <stop offset="40%" stop-color="#1e4859"/>
      <stop offset="80%" stop-color="#3d7384"/>
      <stop offset="100%" stop-color="#5e8d99"/>
    </linearGradient>
    <radialGradient id="moonGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#f6e6c5" stop-opacity="0.5"/>
      <stop offset="60%" stop-color="#f6e6c5" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#f6e6c5" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="470" fill="url(#sky)"/>
  ${stars}
  <!-- Moon w/ soft halo -->
  <circle cx="640" cy="150" r="130" fill="url(#moonGlow)"/>
  <circle cx="640" cy="150" r="52" fill="#f6e6c5"/>
  <circle cx="624" cy="142" r="6" fill="#e8d2a8" opacity="0.6"/>
  <circle cx="656" cy="160" r="4" fill="#e8d2a8" opacity="0.5"/>
  <!-- Layer 1: distant misty range (lightest, most atmospheric) -->
  <polygon points="-50,390 80,310 180,350 280,290 400,360 520,300 640,360 760,290 880,360 1020,310 1180,360 1250,330 1250,470 -50,470" fill="#3d6473" opacity="0.42"/>
  <!-- Layer 2: mid-distance range -->
  <polygon points="-50,420 50,340 160,390 240,310 360,400 460,330 580,280 700,360 820,310 940,360 1060,320 1180,370 1250,340 1250,470" fill="#2c4f5e" opacity="0.75"/>
  <!-- Layer 3: featured central peak (Matterhorn-style) with sharp ridge -->
  <polygon points="320,470 470,300 540,230 580,170 620,235 660,290 760,400 870,470" fill="#1a323d"/>
  <!-- Snow cap on featured peak — jagged, flowing -->
  <path d="M520 280 L580 170 L640 280 L625 260 L605 285 L585 245 L562 285 L545 255 Z" fill="#fbfaf9"/>
  <path d="M530 320 L560 295 L585 320 L575 330 L555 326 L540 330 Z" fill="#fbfaf9"/>
  <!-- Layer 4: medium left peak with snow -->
  <polygon points="50,470 160,340 240,260 320,330 360,470" fill="#1a323d"/>
  <path d="M195 300 L240 260 L290 305 L270 295 L255 320 L230 295 L210 318 Z" fill="#fbfaf9"/>
  <!-- Layer 4: medium right peaks -->
  <polygon points="820,470 920,330 1010,290 1080,380 1150,470" fill="#1a323d"/>
  <path d="M945 320 L1010 290 L1070 380 L1050 360 L1025 380 L990 340 L965 360 Z" fill="#fbfaf9"/>
  <!-- Layer 5: front-most darker silhouettes (foreground) -->
  <polygon points="-30,470 90,400 180,440 260,390 360,440 440,420 540,470" fill="#0e1f28"/>
  <polygon points="640,470 760,420 850,440 960,400 1060,440 1180,410 1250,470" fill="#0e1f28"/>
  <!-- Pine tree silhouettes scattered along the foreground -->
  <g fill="#0a1820">
    <polygon points="200,460 220,420 240,460"/>
    <polygon points="260,465 278,432 296,465"/>
    <polygon points="380,463 398,430 416,463"/>
    <polygon points="780,463 800,425 820,463"/>
    <polygon points="900,460 920,420 940,460"/>
    <polygon points="1040,465 1060,430 1080,465"/>
  </g>
</svg>`;
}

/* Tokyo / NYC / Paris-style city skyline — flat shapes, building
   silhouettes, hint of fog at the horizon. Useful for trips to
   urban destinations or any booking in a city setting. */
function cityScene(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 320" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sky2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a1530"/>
      <stop offset="50%" stop-color="#4a3954"/>
      <stop offset="100%" stop-color="#c2674e"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="320" fill="url(#sky2)"/>
  <!-- Sun disc, low on the horizon -->
  <circle cx="900" cy="240" r="60" fill="#f4c074" opacity="0.95"/>
  <circle cx="900" cy="240" r="98" fill="#f4c074" opacity="0.16"/>
  <!-- Far buildings (lightest) -->
  <rect x="0" y="180" width="60" height="140" fill="#3e2a45" opacity="0.7"/>
  <rect x="70" y="200" width="40" height="120" fill="#3e2a45" opacity="0.7"/>
  <rect x="120" y="170" width="80" height="150" fill="#3e2a45" opacity="0.7"/>
  <rect x="210" y="195" width="50" height="125" fill="#3e2a45" opacity="0.7"/>
  <rect x="270" y="160" width="70" height="160" fill="#3e2a45" opacity="0.7"/>
  <rect x="350" y="185" width="55" height="135" fill="#3e2a45" opacity="0.7"/>
  <rect x="1000" y="170" width="60" height="150" fill="#3e2a45" opacity="0.7"/>
  <rect x="1070" y="190" width="50" height="130" fill="#3e2a45" opacity="0.7"/>
  <rect x="1130" y="175" width="70" height="145" fill="#3e2a45" opacity="0.7"/>
  <!-- Mid buildings -->
  <rect x="50" y="160" width="60" height="160" fill="#251a30"/>
  <rect x="130" y="140" width="50" height="180" fill="#251a30"/>
  <polygon points="200,320 230,140 260,160 290,140 320,320" fill="#251a30"/>
  <rect x="340" y="125" width="80" height="195" fill="#251a30"/>
  <polygon points="440,320 470,100 500,320" fill="#251a30"/>
  <rect x="520" y="145" width="60" height="175" fill="#251a30"/>
  <rect x="600" y="120" width="50" height="200" fill="#251a30"/>
  <rect x="670" y="155" width="80" height="165" fill="#251a30"/>
  <rect x="770" y="130" width="60" height="190" fill="#251a30"/>
  <polygon points="850,320 880,90 910,320" fill="#251a30"/>
  <rect x="930" y="140" width="60" height="180" fill="#251a30"/>
  <rect x="1010" y="155" width="80" height="165" fill="#251a30"/>
  <rect x="1110" y="135" width="50" height="185" fill="#251a30"/>
  <!-- Front detail buildings (darkest) -->
  <rect x="20" y="220" width="40" height="100" fill="#100a18"/>
  <rect x="80" y="230" width="60" height="90" fill="#100a18"/>
  <rect x="160" y="205" width="50" height="115" fill="#100a18"/>
  <rect x="240" y="220" width="60" height="100" fill="#100a18"/>
  <rect x="380" y="240" width="55" height="80" fill="#100a18"/>
  <rect x="500" y="215" width="60" height="105" fill="#100a18"/>
  <rect x="630" y="240" width="50" height="80" fill="#100a18"/>
  <rect x="720" y="220" width="70" height="100" fill="#100a18"/>
  <rect x="830" y="210" width="50" height="110" fill="#100a18"/>
  <rect x="940" y="230" width="60" height="90" fill="#100a18"/>
  <rect x="1050" y="220" width="60" height="100" fill="#100a18"/>
  <rect x="1130" y="240" width="50" height="80" fill="#100a18"/>
</svg>`;
}

/* Tropical coast / beach — palm trees, hint of ocean, warm sky.
   Useful for tropical destinations. */
function coastScene(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 320" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sky3" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2a3358"/>
      <stop offset="55%" stop-color="#d4825e"/>
      <stop offset="100%" stop-color="#f4c074"/>
    </linearGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2e6478"/>
      <stop offset="100%" stop-color="#103a4e"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="320" fill="url(#sky3)"/>
  <circle cx="600" cy="160" r="56" fill="#f9d490" opacity="0.95"/>
  <circle cx="600" cy="160" r="100" fill="#f9d490" opacity="0.18"/>
  <!-- Sea horizon band -->
  <rect x="0" y="225" width="1200" height="95" fill="url(#sea)"/>
  <!-- Distant island silhouettes -->
  <polygon points="200,225 280,200 380,225" fill="#1c3640" opacity="0.6"/>
  <polygon points="700,225 830,195 950,225" fill="#1c3640" opacity="0.6"/>
  <!-- Palm tree silhouettes -->
  <g fill="#0a1c20">
    <!-- Left palm -->
    <path d="M120,320 Q124,210 130,160 Q140,160 138,190 Q150,180 168,170 Q160,180 142,200 Q160,195 188,195 Q172,205 144,215 Q160,220 180,235 Q160,225 138,225 Q134,260 122,320 Z"/>
    <!-- Right palm -->
    <path d="M1040,320 Q1044,210 1052,150 Q1060,150 1056,180 Q1080,165 1098,160 Q1085,175 1062,190 Q1090,188 1115,195 Q1095,205 1062,210 Q1085,222 1105,240 Q1080,225 1056,222 Q1052,260 1042,320 Z"/>
  </g>
</svg>`;
}

/* Desert dunes — warm rolling sand shapes, low sun. */
function desertScene(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 320" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sky4" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7a3a4a"/>
      <stop offset="55%" stop-color="#d97e4a"/>
      <stop offset="100%" stop-color="#f4c074"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="320" fill="url(#sky4)"/>
  <circle cx="800" cy="170" r="58" fill="#fae0a0"/>
  <circle cx="800" cy="170" r="100" fill="#fae0a0" opacity="0.18"/>
  <!-- Dune layers (back to front, getting darker) -->
  <path d="M0,320 L0,250 Q300,180 600,230 Q900,280 1200,210 L1200,320 Z" fill="#c87b48"/>
  <path d="M0,320 L0,290 Q200,220 500,270 Q800,310 1200,250 L1200,320 Z" fill="#a85a30"/>
  <path d="M0,320 L0,310 Q400,255 800,295 Q1000,305 1200,280 L1200,320 Z" fill="#7a3a20"/>
</svg>`;
}

/* Pine forest under a deep sky — silhouetted conifers. */
function forestScene(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 320" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sky5" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0e1c1a"/>
      <stop offset="60%" stop-color="#2a4030"/>
      <stop offset="100%" stop-color="#587058"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="320" fill="url(#sky5)"/>
  <circle cx="950" cy="100" r="42" fill="#f3e6c2" opacity="0.92"/>
  <circle cx="950" cy="100" r="80" fill="#f3e6c2" opacity="0.15"/>
  <!-- Far tree silhouettes -->
  <g fill="#1a2c22" opacity="0.65">
    ${Array.from({ length: 18 })
      .map((_, i) => {
        const x = i * 70 + 20;
        const h = 50 + ((i * 13) % 40);
        return `<polygon points="${x},260 ${x + 18},${260 - h} ${x + 36},260"/>`;
      })
      .join('')}
  </g>
  <!-- Mid tree silhouettes -->
  <g fill="#0e1c14">
    ${Array.from({ length: 14 })
      .map((_, i) => {
        const x = i * 90 + 10;
        const h = 80 + ((i * 17) % 60);
        return `<polygon points="${x},320 ${x + 28},${320 - h} ${x + 56},320"/>`;
      })
      .join('')}
  </g>
  <!-- Front tree silhouettes -->
  <g fill="#050d09">
    ${Array.from({ length: 10 })
      .map((_, i) => {
        const x = i * 130 + 40;
        const h = 130 + ((i * 23) % 70);
        return `<polygon points="${x},320 ${x + 38},${320 - h} ${x + 76},320"/>`;
      })
      .join('')}
  </g>
</svg>`;
}

/* Winter / Hokkaido / Aspen / Lapland — falling snow over a snowy
   landscape with bare trees. Brighter, lighter palette than the
   mountain scene. */
function snowScene(): string {
  const flakes = Array.from({ length: 60 })
    .map((_, i) => {
      const x = ((i * 217.3) % 1200) | 0;
      const y = ((i * 73.7) % 380) | 0;
      const r = (i % 4) + 1.4;
      const opacity = (((i * 11) % 5) + 5) / 12;
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fbfaf9" opacity="${opacity.toFixed(2)}"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 470" preserveAspectRatio="xMidYMax slice">
  <defs>
    <linearGradient id="sky-snow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3a5570"/>
      <stop offset="50%" stop-color="#7892a8"/>
      <stop offset="100%" stop-color="#b0c5d4"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="470" fill="url(#sky-snow)"/>
  ${flakes}
  <!-- Distant misty mountains -->
  <polygon points="-50,400 100,320 220,360 350,290 480,360 600,310 730,360 850,290 980,360 1100,310 1250,360 1250,470 -50,470" fill="#a3b8c8" opacity="0.6"/>
  <!-- Mid range snowy peaks -->
  <polygon points="-50,440 80,340 200,400 320,310 450,400 580,340 700,400 830,300 960,400 1080,330 1250,400 1250,470" fill="#7b91a4"/>
  <!-- Snow on mid peaks -->
  <polygon points="280,340 320,310 360,360 340,348 322,365 305,338" fill="#fbfaf9"/>
  <polygon points="800,340 830,300 870,345 850,330 830,355" fill="#fbfaf9"/>
  <!-- Snowy ground - rolling drifts -->
  <path d="M-50,470 L-50,410 Q200,380 400,410 Q600,440 800,400 Q1000,370 1250,420 L1250,470 Z" fill="#e8eef3"/>
  <path d="M-50,470 L-50,440 Q300,415 600,440 Q900,460 1250,430 L1250,470 Z" fill="#fbfaf9"/>
  <!-- Bare trees scattered -->
  <g stroke="#1c2530" stroke-width="2.5" fill="none" stroke-linecap="round">
    <path d="M180,440 L180,395 M180,420 L168,408 M180,415 L192,400 M180,408 L172,398 M180,402 L188,392"/>
    <path d="M350,445 L350,400 M350,425 L338,413 M350,418 L362,405 M350,410 L344,400 M350,405 L358,395"/>
    <path d="M620,442 L620,395 M620,420 L606,408 M620,415 L634,400 M620,408 L612,398 M620,402 L628,392"/>
    <path d="M880,445 L880,398 M880,425 L867,413 M880,418 L893,403 M880,410 L872,400 M880,405 L890,394"/>
    <path d="M1080,442 L1080,395 M1080,420 L1066,408 M1080,415 L1094,400"/>
  </g>
</svg>`;
}

/* Aurora / Iceland / Norway / Alaska — green and purple aurora
   ribbons over a dark night sky and silhouetted mountains. */
function auroraScene(): string {
  const stars = Array.from({ length: 50 })
    .map((_, i) => {
      const x = ((i * 137.5) % 1200) | 0;
      const y = ((i * 51.3) % 280) | 0;
      const r = i % 6 === 0 ? 1.8 : 0.8;
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fbfaf9" opacity="0.7"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 470" preserveAspectRatio="xMidYMax slice">
  <defs>
    <linearGradient id="sky-aur" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#040d1a"/>
      <stop offset="70%" stop-color="#0e1f2e"/>
      <stop offset="100%" stop-color="#1e3142"/>
    </linearGradient>
    <linearGradient id="aurora1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2dd388" stop-opacity="0"/>
      <stop offset="40%" stop-color="#2dd388" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#7e3fc6" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="aurora2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7e3fc6" stop-opacity="0"/>
      <stop offset="50%" stop-color="#a85ad2" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#2dd388" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="470" fill="url(#sky-aur)"/>
  ${stars}
  <!-- Aurora ribbons - flowing curves -->
  <path d="M-50,80 Q200,160 450,90 Q700,40 950,140 Q1100,180 1250,100 L1250,300 Q1100,350 950,290 Q700,250 450,310 Q200,360 -50,260 Z" fill="url(#aurora1)" opacity="0.85"/>
  <path d="M-50,160 Q250,240 500,180 Q780,120 1050,220 Q1200,260 1250,200 L1250,340 Q1100,360 950,300 Q700,260 400,320 Q150,360 -50,290 Z" fill="url(#aurora2)" opacity="0.7"/>
  <!-- Foreground mountain silhouettes -->
  <polygon points="-50,470 100,360 280,400 420,330 580,400 720,350 880,400 1040,340 1250,400 1250,470" fill="#0a1820"/>
  <polygon points="-50,470 80,420 220,440 340,410 480,440 620,420 760,445 900,420 1040,440 1180,420 1250,440 1250,470" fill="#06121a"/>
</svg>`;
}

/* River / Bangkok / Amsterdam / Venice — calm water with shoreline
   silhouettes and a soft sunset reflection. */
function riverScene(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 470" preserveAspectRatio="xMidYMax slice">
  <defs>
    <linearGradient id="sky-rv" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3a2a4e"/>
      <stop offset="50%" stop-color="#c9684c"/>
      <stop offset="100%" stop-color="#f4b772"/>
    </linearGradient>
    <linearGradient id="water-rv" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#c9684c" stop-opacity="0.55"/>
      <stop offset="40%" stop-color="#5b3a4a"/>
      <stop offset="100%" stop-color="#1e2235"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="470" fill="url(#sky-rv)"/>
  <!-- Sun low on the horizon -->
  <circle cx="640" cy="270" r="58" fill="#f9d490"/>
  <circle cx="640" cy="270" r="110" fill="#f9d490" opacity="0.15"/>
  <!-- Shoreline silhouettes (left bank: pagodas/houses, right: buildings) -->
  <g fill="#1a1626">
    <!-- Left bank: temple/pagoda roofs -->
    <rect x="60" y="240" width="60" height="60"/>
    <polygon points="50,240 90,210 130,240"/>
    <polygon points="60,220 90,195 120,220"/>
    <rect x="140" y="255" width="50" height="45"/>
    <polygon points="130,255 165,225 200,255"/>
    <rect x="210" y="265" width="60" height="35"/>
    <polygon points="205,265 240,245 275,265"/>
    <rect x="290" y="260" width="40" height="40"/>
    <rect x="340" y="250" width="60" height="50"/>
    <polygon points="332,250 370,220 408,250"/>
    <rect x="420" y="270" width="40" height="30"/>
    <!-- Right bank: modern buildings -->
    <rect x="820" y="245" width="50" height="55"/>
    <rect x="880" y="220" width="40" height="80"/>
    <rect x="930" y="260" width="55" height="40"/>
    <rect x="995" y="230" width="50" height="70"/>
    <rect x="1055" y="250" width="45" height="50"/>
    <rect x="1110" y="220" width="40" height="80"/>
    <rect x="1160" y="245" width="40" height="55"/>
  </g>
  <!-- Water -->
  <rect x="0" y="300" width="1200" height="170" fill="url(#water-rv)"/>
  <!-- Sun reflection on water -->
  <ellipse cx="640" cy="320" rx="80" ry="6" fill="#f9d490" opacity="0.4"/>
  <ellipse cx="640" cy="345" rx="60" ry="4" fill="#f9d490" opacity="0.3"/>
  <ellipse cx="640" cy="370" rx="42" ry="3" fill="#f9d490" opacity="0.22"/>
  <ellipse cx="640" cy="395" rx="28" ry="2" fill="#f9d490" opacity="0.15"/>
  <!-- Building reflections on water (faint, inverted-ish) -->
  <g fill="#1a1626" opacity="0.35">
    <rect x="60" y="300" width="60" height="30"/>
    <rect x="140" y="300" width="50" height="25"/>
    <rect x="820" y="300" width="50" height="28"/>
    <rect x="880" y="300" width="40" height="40"/>
    <rect x="995" y="300" width="50" height="35"/>
    <rect x="1110" y="300" width="40" height="40"/>
  </g>
  <!-- Small boat silhouette -->
  <g fill="#0e0a18">
    <path d="M380,360 L460,360 L450,378 L390,378 Z"/>
    <rect x="412" y="345" width="3" height="20"/>
  </g>
</svg>`;
}

const SCENE_BUILDERS: Record<SceneName, () => string> = {
  mountain: mountainScene,
  city: cityScene,
  coast: coastScene,
  desert: desertScene,
  forest: forestScene,
  snow: snowScene,
  aurora: auroraScene,
  river: riverScene,
  default: mountainScene,
};

/* Wrap SVG markup in a base64 data URL so Satori can embed it as a
   first-class <img> source. Base64 is what Satori expects internally
   — it re-encodes URL-form data URLs via btoa which trips on any
   non-ASCII byte that slipped through (HTML entities, unicode-ish
   chars in path data). Encoding upfront with a Buffer / btoa keeps
   the pipeline clean. Node and Edge both have btoa available; for
   Node we use Buffer.from for symmetry. */
function sceneDataUrl(scene: SceneName): string {
  const svg = SCENE_BUILDERS[scene]();
  /* Plain btoa rejects any char above 0xFF (raw em-dashes in our SVG
     comments would crash it). UTF-8-encode first, then base64 the
     resulting byte string. Works in both Edge Runtime and Node 18+
     (both have TextEncoder + btoa as globals). */
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/* Parse the `stats` query param into up to 3 label/value pairs.
   Format: `LABEL:VALUE|LABEL:VALUE|LABEL:VALUE`. Empty / missing
   parts are dropped so the stats row can be 1/2/3 columns. */
function parseStats(raw: string): { label: string; value: string }[] {
  return raw
    .split('|')
    .map((s) => {
      const idx = s.indexOf(':');
      if (idx === -1) return null;
      const label = s.slice(0, idx).trim();
      const value = s.slice(idx + 1).trim();
      if (!label || !value) return null;
      return { label: label.slice(0, 24), value: value.slice(0, 28) };
    })
    .filter((x): x is { label: string; value: string } => x !== null)
    .slice(0, 3);
}

/* Parse the `items` query param into up to 5 agenda rows. Each row
   is `<itemType>:<text>:<sideTag>` separated by `|`. The itemType
   is one of the CardTypes (drives the numeral color); the sideTag
   is the optional small uppercase text on the right (PM, TICKETS,
   6:00, STAY, etc.). All fields are optional EXCEPT the row must
   have at least a text. */
function parseItems(
  raw: string,
): { type: CardType; text: string; tag: string }[] {
  return raw
    .split('|')
    .map((s) => {
      const parts = s.split(':');
      let itemType: CardType = 'activity';
      let text = '';
      let tag = '';
      if (parts.length === 1) {
        text = parts[0].trim();
      } else if (parts.length === 2) {
        const maybeType = parts[0].trim();
        if (isCardType(maybeType)) {
          itemType = maybeType;
          text = parts[1].trim();
        } else {
          text = parts[0].trim();
          tag = parts[1].trim();
        }
      } else {
        const maybeType = parts[0].trim();
        if (isCardType(maybeType)) {
          itemType = maybeType;
          text = parts[1].trim();
          tag = parts.slice(2).join(':').trim();
        } else {
          text = parts[0].trim();
          tag = parts.slice(1).join(':').trim();
        }
      }
      if (!text) return null;
      return { type: itemType, text: text.slice(0, 60), tag: tag.slice(0, 14) };
    })
    .filter(
      (x): x is { type: CardType; text: string; tag: string } => x !== null,
    )
    .slice(0, 5);
}

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const title = (url.searchParams.get('title') || 'Wanderbot').slice(0, 120);
  const eyebrowParam = (url.searchParams.get('eyebrow') || '').slice(0, 80);
  const statsRaw = (url.searchParams.get('stats') || '').slice(0, 240);
  const itemsRaw = (url.searchParams.get('items') || '').slice(0, 480);
  const note = (url.searchParams.get('note') || '').slice(0, 200);
  const meta = (url.searchParams.get('meta') || '').slice(0, 80);
  const cta = (url.searchParams.get('cta') || 'Open in Wanderbot →').slice(0, 48);
  const rawType = url.searchParams.get('type') || 'trip';
  const type: CardType = isCardType(rawType) ? rawType : 'trip';
  const rawScene = url.searchParams.get('scene') || (type === 'trip' ? 'mountain' : 'default');
  const scene: SceneName = isSceneName(rawScene) ? rawScene : 'mountain';

  /* Eyebrow resolution: explicit param wins; otherwise auto-split
     the title on ` · ` (the contextual title pattern the
     imessage-card skill teaches the agent to use). */
  let eyebrow = eyebrowParam;
  let heroTitle = title;
  if (!eyebrow) {
    const parts = title.split(' · ');
    if (parts.length > 1) {
      eyebrow = parts[0];
      heroTitle = parts.slice(1).join(' · ');
    }
  }

  /* Hero serif scales down for long entity names so they always fit
     on one line in the 1088px-wide content area. */
  const heroSize =
    heroTitle.length > 24
      ? 92
      : heroTitle.length > 16
        ? 116
        : heroTitle.length > 10
          ? 132
          : 148;

  const stats = parseStats(statsRaw);
  const items = parseItems(itemsRaw);
  const accent = TYPE_ACCENT[type];
  const sceneSrc = sceneDataUrl(scene);

  /* Hero height adapts based on body density. When the agent passes
     a full agenda, we leave maximum room for it below (hero=290).
     When the body is lighter, the hero extends into the unused
     space so the card never feels half-empty. Tested values:
     290 (items present) / 340 (items+stats borderline) /
     420 (stats-only or note-only) / 490 (title only). */
  const heroHeight = items.length > 0
    ? 290
    : note.length > 0
      ? 380
      : stats.length > 0
        ? 420
        : 490;

  /* Custom fonts. When custom fonts are passed to ImageResponse, the
     default Geist fallback disappears — so we MUST also load Inter,
     otherwise every text node renders in whatever single font we
     provided. Load in parallel; tolerate individual failures so the
     card still renders (sans Playfair) if the network blips. */
  const [playfairItalic, interMedium, interBold] = await Promise.all([
    loadFont(req, 'PlayfairDisplay-Italic.ttf').catch((e) => {
      console.warn('[og] Playfair font load failed:', e);
      return null as ArrayBuffer | null;
    }),
    loadFont(req, 'Inter-Medium.ttf').catch((e) => {
      console.warn('[og] Inter Medium font load failed:', e);
      return null as ArrayBuffer | null;
    }),
    loadFont(req, 'Inter-Bold.ttf').catch((e) => {
      console.warn('[og] Inter Bold font load failed:', e);
      return null as ArrayBuffer | null;
    }),
  ]);

  const fonts: { name: string; data: ArrayBuffer; weight: 400 | 500 | 700; style: 'normal' | 'italic' }[] = [];
  if (interMedium) fonts.push({ name: 'Inter', data: interMedium, weight: 500, style: 'normal' });
  if (interBold) fonts.push({ name: 'Inter', data: interBold, weight: 700, style: 'normal' });
  if (playfairItalic) fonts.push({ name: 'Playfair Display', data: playfairItalic, weight: 700, style: 'italic' });

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#fbf7f0',
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#1F2421',
        }}
      >
        {/* ── HERO ──────────────────────────────────────────── */}
        {/* Layered scene illustration with overlay text. The scene
            SVG is a data-URL <img> so Satori treats it as a self-
            contained raster source. Everything else sits on top
            via position:absolute. */}
        <div
          style={{
            display: 'flex',
            position: 'relative',
            width: 1200,
            height: heroHeight,
            background: HERO_BG[type],
          }}
        >
          <img
            src={sceneSrc}
            width={1200}
            height={heroHeight}
            style={{ position: 'absolute', top: 0, left: 0 }}
          />
          {/* Dark gradient overlay at the bottom of the hero so the
              serif italic title sits in a shadowed zone and reads
              cleanly even when mountain peaks / building silhouettes
              poke up into its vertical band. Top stays clear so
              the moon/sun and sky remain prominent. Sloped steeply
              from 35% so the bottom 65% is meaningfully darkened. */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              background:
                'linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.78) 100%)',
            }}
          />
          {/* Top-left wordmark, overlay on illustration. */}
          <div
            style={{
              position: 'absolute',
              top: 28,
              left: 40,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
            <span
              style={{
                fontSize: 30,
                fontWeight: 700,
                letterSpacing: '-0.5px',
                color: '#ffffff',
              }}
            >
              Wanderbot
            </span>
          </div>
          {/* Top-right type chip, outlined on illustration. */}
          <div
            style={{
              position: 'absolute',
              top: 28,
              right: 40,
              display: 'flex',
              alignItems: 'center',
              padding: '10px 20px',
              borderRadius: 999,
              border: '1.5px solid rgba(255,255,255,0.6)',
              color: '#ffffff',
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            }}
          >
            {TYPE_LABEL[type]}
          </div>
          {/* Bottom-left overlay: eyebrow + serif italic hero title. */}
          <div
            style={{
              position: 'absolute',
              left: 40,
              bottom: 28,
              right: 40,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {eyebrow && (
              <div
                style={{
                  display: 'flex',
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.94)',
                }}
              >
                {eyebrow}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                fontSize: heroSize,
                fontFamily: playfairItalic
                  ? 'Playfair Display, Inter, serif'
                  : 'Inter, system-ui, sans-serif',
                fontStyle: 'italic',
                fontWeight: 700,
                letterSpacing: '-1.5px',
                lineHeight: 1,
                color: '#fbf7f0',
              }}
            >
              {heroTitle}
            </div>
          </div>
        </div>

        {/* ── STATS ROW ─────────────────────────────────────── */}
        {stats.length > 0 && (
          <div
            style={{
              display: 'flex',
              padding: '14px 40px 10px',
              gap: 0,
            }}
          >
            {stats.map((s, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flex: 1,
                  flexDirection: 'column',
                  gap: 4,
                  paddingLeft: i === 0 ? 0 : 24,
                  borderLeft: i === 0 ? 'none' : '1px solid rgba(28,54,64,0.18)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'rgba(28,54,64,0.6)',
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 36,
                    fontWeight: 700,
                    letterSpacing: '-0.4px',
                    color: '#1c3640',
                  }}
                >
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── NOTE (free-form prose body) ───────────────────── */}
        {note && (
          <div
            style={{
              display: 'flex',
              padding: '8px 40px 0',
              fontSize: 36,
              fontWeight: 500,
              color: '#1c3640',
              letterSpacing: '-0.4px',
              lineHeight: 1.25,
            }}
          >
            {note}
          </div>
        )}

        {/* ── AGENDA ────────────────────────────────────────── */}
        {items.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '4px 40px 0',
              gap: 6,
            }}
          >
            {items.map((it, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 18,
                }}
              >
                {/* Color-coded numeral square — the visual hook
                    of the reference design. Per-item type maps to
                    its own accent color so dinner reads orange,
                    hotel reads navy, activity reads sage, etc. */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 52,
                    height: 52,
                    borderRadius: 12,
                    background: TYPE_ACCENT[it.type],
                    color: '#fbf7f0',
                    fontSize: 26,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </div>
                <div
                  style={{
                    display: 'flex',
                    flex: 1,
                    fontSize: 30,
                    fontWeight: 600,
                    color: '#1c3640',
                    letterSpacing: '-0.3px',
                  }}
                >
                  {it.text}
                </div>
                {it.tag && (
                  <div
                    style={{
                      display: 'flex',
                      fontSize: 19,
                      fontWeight: 700,
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      color: 'rgba(28,54,64,0.55)',
                    }}
                  >
                    {it.tag}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Spacer pushes footer down when fewer items render. */}
        <div style={{ display: 'flex', flex: 1 }} />

        {/* ── FOOTER ───────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            padding: '12px 40px 22px',
            fontSize: 22,
            color: 'rgba(28,54,64,0.55)',
            fontWeight: 500,
            letterSpacing: '-0.15px',
          }}
        >
          <div style={{ display: 'flex' }}>{meta || ' '}</div>
          <div
            style={{
              display: 'flex',
              color: accent,
              fontWeight: 700,
              letterSpacing: '-0.2px',
            }}
          >
            {cta}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: fonts.length > 0 ? fonts : undefined,
      headers: {
        /* Apple aggressively caches link previews — let our CDN cache
           too so repeats are instant. Image is fully derived from the
           query string, so it's safe to cache for a long time. */
        'cache-control': 'public, max-age=86400, s-maxage=604800, immutable',
      },
    },
  );
}
