/**
 * Edge function: renders the iMessage link-preview card as a 1200x630 PNG.
 *
 * Query params (all optional except `title`):
 *   title    — top-line heading, e.g. "Marriott Autograph"
 *   subtitle — secondary line, e.g. "Sept 12–15 · 3 nights"
 *   type     — card type, controls the tile color + icon:
 *              flight | hotel | attraction | experience | event |
 *              activity | restaurant | transport | trip
 *              (`trip` is the higher-level overview variant —
 *              e.g. "Switzerland · Jun 19–28")
 *   loc      — optional third line under the subtitle. For bookings
 *              use the address ("Roppongi, Tokyo"); for trips use
 *              traveler info ("with Shubh & Mia") or stats line.
 *   cost     — optional chip rendered top-right of the hero. Pre-
 *              formatted by the caller, e.g. "$2,200" or "¥18,400".
 *   meta     — optional footer line (left side), e.g. trip name.
 *   cta      — optional override for the right-side footer CTA.
 *              Defaults to "Open in Wanderbot →".
 *
 * Apple's Link Preview daemon scrapes this URL via the `og:image` meta
 * tag on /p (see api/p.ts). Output dimensions match Apple/Twitter
 * "large summary" cards.
 */

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

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

const TILE_BG: Record<CardType, string> = {
  flight: 'rgba(56, 189, 248, 0.22)',
  hotel: 'rgba(250, 204, 21, 0.28)',
  attraction: 'rgba(217, 119, 6, 0.22)',
  experience: 'rgba(20, 184, 166, 0.22)',
  event: 'rgba(236, 72, 153, 0.22)',
  activity: 'rgba(168, 85, 247, 0.22)',
  restaurant: 'rgba(248, 113, 113, 0.22)',
  transport: 'rgba(73, 160, 120, 0.22)',
  /* Trips use the brand teal tint — they sit one level above the
     per-booking colors, so the card visually reads as "the whole
     trip" rather than any specific item within it. */
  trip: 'rgba(33, 104, 105, 0.18)',
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
  return s in TILE_BG;
}

/* SVGs ported from BookingCard's <BookingIcon>. Inline so the edge
   runtime has no asset-loader dependency. Sized to fit the 160px tile
   with stroke=3.4 for the larger surface. */
function Icon({ type }: { type: CardType }) {
  const stroke = '#1F2421';
  const sw = 3.4;
  const common = {
    width: 100,
    height: 100,
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

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const title = (url.searchParams.get('title') || 'Wanderbot').slice(0, 120);
  const subtitle = (url.searchParams.get('subtitle') || '').slice(0, 160);
  const loc = (url.searchParams.get('loc') || '').slice(0, 120);
  const cost = (url.searchParams.get('cost') || '').slice(0, 24);
  const meta = (url.searchParams.get('meta') || '').slice(0, 80);
  const cta = (url.searchParams.get('cta') || 'Open in Wanderbot →').slice(0, 48);
  const rawType = url.searchParams.get('type') || 'activity';
  const type: CardType = isCardType(rawType) ? rawType : 'activity';

  /* Title font scales down for long strings so it doesn't overflow.
     Three tiers — keeps short titles dramatically large (the brand
     hook) and lets long ones still fit without ellipsis tricks. */
  const titleSize =
    title.length > 36 ? 72 : title.length > 22 ? 92 : 116;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          /* Subtle type-tinted wash at the top fading to the warm
             off-white — gives the card depth without competing with
             the content. Stop at 38% so 60%+ of the canvas remains
             clean for the hero and footer. */
          background: `linear-gradient(180deg, ${TILE_BG[type]} 0%, #fbfaf9 38%)`,
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#1F2421',
        }}
      >
        {/* ── HEADER ─────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '36px 56px 24px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <PlaneGlyph />
            <span
              style={{
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: '-0.6px',
                color: '#216869',
              }}
            >
              Wanderbot
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              padding: '8px 18px',
              borderRadius: 999,
              background: TILE_BG[type],
              color: '#1F2421',
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {TYPE_LABEL[type]}
          </div>
        </div>

        {/* Thin teal divider between header and hero — gives the
            card a discernible structure rather than feeling like
            three floating chunks of text on a flat background. */}
        <div
          style={{
            display: 'flex',
            height: 1,
            background: 'rgba(33, 104, 105, 0.18)',
            margin: '0 56px',
          }}
        />

        {/* ── HERO ───────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            gap: 36,
            padding: '32px 56px',
            position: 'relative',
          }}
        >
          {/* Cost — top-right of the hero. Refined treatment: no pill
              chrome, just confident currency-style typography with a
              hairline divider underneath. Reads as a price tag, not a
              button. Only renders when the caller provides it. */}
          {cost && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  fontSize: 32,
                  fontWeight: 700,
                  letterSpacing: '-0.6px',
                  color: '#1F2421',
                }}
              >
                {cost}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'rgba(31, 36, 33, 0.42)',
                  marginTop: 2,
                }}
              >
                Total
              </div>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              width: 180,
              height: 180,
              borderRadius: 40,
              background: TILE_BG[type],
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon type={type} />
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: titleSize,
                fontWeight: 700,
                letterSpacing: '-2.6px',
                lineHeight: 0.98,
                color: '#1F2421',
              }}
            >
              {title}
            </div>
            {subtitle && (
              <div
                style={{
                  display: 'flex',
                  fontSize: 38,
                  fontWeight: 500,
                  color: 'rgba(31, 36, 33, 0.72)',
                  letterSpacing: '-0.5px',
                  lineHeight: 1.2,
                }}
              >
                {subtitle}
              </div>
            )}
            {loc && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontSize: 28,
                  fontWeight: 500,
                  color: 'rgba(31, 36, 33, 0.56)',
                  letterSpacing: '-0.3px',
                  marginTop: 6,
                }}
              >
                <PinGlyph />
                <span>{loc}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── FOOTER ─────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            padding: '24px 56px 36px',
            fontSize: 22,
            color: 'rgba(31, 36, 33, 0.5)',
            fontWeight: 500,
            letterSpacing: '-0.2px',
          }}
        >
          <div style={{ display: 'flex' }}>{meta || ' '}</div>
          <div
            style={{
              display: 'flex',
              color: '#216869',
              fontWeight: 700,
              letterSpacing: '-0.3px',
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
      headers: {
        /* Apple aggressively caches link previews — let our CDN cache
           too so repeats are instant. Image is fully derived from the
           query string, so it's safe to cache for a long time. */
        'cache-control': 'public, max-age=86400, s-maxage=604800, immutable',
      },
    },
  );
}
