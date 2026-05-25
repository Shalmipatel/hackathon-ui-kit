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

/* Saturated, white-text-legible accent colors used for the masthead
   band at the top of the card. Each is a darker / more confident
   variant of the in-app TONE_BG tint so the card identity carries
   the same hue family as the booking card but at much higher
   chroma — the "pop" the design needs. All have ≥4.5:1 contrast
   with #ffffff. */
const TYPE_ACCENT: Record<CardType, string> = {
  trip: '#216869',
  flight: '#0284c7',
  hotel: '#a16207',
  attraction: '#9a3412',
  experience: '#0f766e',
  event: '#be185d',
  activity: '#7e22ce',
  restaurant: '#b91c1c',
  transport: '#15803d',
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

  /* Magazine-cover title treatment: if the caller used the
     "<question frame> · <entity>" pattern, split into a small
     all-caps eyebrow above a single dominant hero title. When the
     question frame *is* the entity (no ` · `), the whole title
     becomes the hero — no eyebrow row. */
  const titleParts = title.split(' · ');
  const hasEyebrow = titleParts.length > 1;
  const eyebrow = hasEyebrow ? titleParts[0] : '';
  const heroTitle = hasEyebrow ? titleParts.slice(1).join(' · ') : title;

  /* Hero font tiers — sized so the hero is genuinely "headline"
     scale when short, with graceful step-downs for long entity
     names like "Renaissance Zurich Tower Hotel" so they still fit
     on one line in the 1088px-wide content column. */
  const heroSize =
    heroTitle.length > 36
      ? 76
      : heroTitle.length > 24
        ? 102
        : heroTitle.length > 14
          ? 132
          : 156;

  const accent = TYPE_ACCENT[type];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#fbfaf9',
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#1F2421',
        }}
      >
        {/* ── MASTHEAD ───────────────────────────────────────── */}
        {/* Full-bleed saturated band at the top — the visual hook
            that makes the card pop in a dark iMessage thread. White
            wordmark and type indicator sit on the accent color. The
            band itself carries the type identity, so the body can
            be pure typography below. */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '36px 56px',
            background: accent,
            color: '#ffffff',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            {/* White paper plane inlined here so the masthead has no
                external glyph dependency. Matches PlaneGlyph shape. */}
            <svg
              width="28"
              height="28"
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
                letterSpacing: '-0.7px',
                color: '#ffffff',
              }}
            >
              Wanderbot
            </span>
          </div>
          {/* Type chip with icon + label — white-on-white-tint chip
              inside the colored band. Reads as a category tag without
              competing with the wordmark for attention. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 18px 10px 14px',
              borderRadius: 999,
              background: 'rgba(255, 255, 255, 0.16)',
              color: '#ffffff',
            }}
          >
            <Icon type={type} size={26} stroke="#ffffff" />
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {TYPE_LABEL[type]}
            </span>
          </div>
        </div>

        {/* ── BODY ───────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '48px 56px 36px',
            position: 'relative',
          }}
        >
          {/* Eyebrow + optional cost row. Renders when EITHER the
              title had a ` · ` split OR a cost was provided — keeps
              the upper-body row from collapsing when only one half is
              present. */}
          {(hasEyebrow || cost) && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: accent,
                }}
              >
                {eyebrow || ' '}
              </div>
              {cost && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      fontSize: 36,
                      fontWeight: 700,
                      letterSpacing: '-0.6px',
                      color: '#1F2421',
                      lineHeight: 1,
                    }}
                  >
                    {cost}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: 'rgba(31, 36, 33, 0.42)',
                      marginTop: 4,
                    }}
                  >
                    Total
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Hero title — magazine-cover headline. Tightly tracked,
              flush with the body's left padding. */}
          <div
            style={{
              display: 'flex',
              fontSize: heroSize,
              fontWeight: 800,
              letterSpacing: '-3px',
              lineHeight: 0.96,
              color: '#1F2421',
            }}
          >
            {heroTitle}
          </div>

          {subtitle && (
            <div
              style={{
                display: 'flex',
                fontSize: 36,
                fontWeight: 500,
                color: 'rgba(31, 36, 33, 0.72)',
                letterSpacing: '-0.5px',
                lineHeight: 1.2,
                marginTop: 22,
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
                fontSize: 26,
                fontWeight: 500,
                color: 'rgba(31, 36, 33, 0.56)',
                letterSpacing: '-0.3px',
                marginTop: 14,
              }}
            >
              <PinGlyph />
              <span>{loc}</span>
            </div>
          )}

          {/* Spacer pushes the footer to the bottom of the body. */}
          <div style={{ display: 'flex', flex: 1 }} />

          {/* Footer row — subtle, just enough to anchor the
              tap-affordance and trip-name context. */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
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
                color: accent,
                fontWeight: 700,
                letterSpacing: '-0.3px',
              }}
            >
              {cta}
            </div>
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
