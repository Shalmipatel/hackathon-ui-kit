/**
 * Edge function: renders the iMessage link-preview card as a 1200x630 PNG.
 *
 * Query params (all optional except `title`):
 *   title    — top-line heading, e.g. "Marriott Autograph"
 *   subtitle — secondary line, e.g. "Sept 12–15 · 3 nights"
 *   type     — booking type, controls the tile color + icon:
 *              flight | hotel | attraction | experience | event |
 *              activity | restaurant | transport
 *   meta     — optional tiny line under the subtitle (e.g. "Tokyo trip")
 *
 * Apple's Link Preview daemon scrapes this URL via the `og:image` meta
 * tag on /p (see api/p.ts). Output dimensions match Apple/Twitter
 * "large summary" cards.
 */

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

type BookingType =
  | 'flight'
  | 'hotel'
  | 'attraction'
  | 'experience'
  | 'event'
  | 'activity'
  | 'restaurant'
  | 'transport';

/* Per-type tile tints, mirrored from src/features/travel/BookingCard.tsx
   so the preview reads as the same brand the user sees in-app. */
const TILE_BG: Record<BookingType, string> = {
  flight: 'rgba(56, 189, 248, 0.22)',
  hotel: 'rgba(250, 204, 21, 0.28)',
  attraction: 'rgba(217, 119, 6, 0.22)',
  experience: 'rgba(20, 184, 166, 0.22)',
  event: 'rgba(236, 72, 153, 0.22)',
  activity: 'rgba(168, 85, 247, 0.22)',
  restaurant: 'rgba(248, 113, 113, 0.22)',
  transport: 'rgba(73, 160, 120, 0.22)',
};

const TYPE_LABEL: Record<BookingType, string> = {
  flight: 'Flight',
  hotel: 'Hotel',
  attraction: 'Attraction',
  experience: 'Experience',
  event: 'Event',
  activity: 'Activity',
  restaurant: 'Restaurant',
  transport: 'Transport',
};

function isBookingType(s: string): s is BookingType {
  return s in TILE_BG;
}

/* SVGs ported from BookingCard's <BookingIcon>. Inline so the edge
   runtime has no asset-loader dependency. Each is sized to fit the
   144px tile with stroke=3.2 for the larger surface. */
function Icon({ type }: { type: BookingType }) {
  const stroke = '#1F2421';
  const sw = 3.2;
  const common = {
    width: 88,
    height: 88,
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
        <svg {...common} strokeWidth={2.6}>
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
  }
}

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const title = (url.searchParams.get('title') || 'Photon').slice(0, 120);
  const subtitle = (url.searchParams.get('subtitle') || '').slice(0, 160);
  const meta = (url.searchParams.get('meta') || '').slice(0, 80);
  const rawType = url.searchParams.get('type') || 'activity';
  const type: BookingType = isBookingType(rawType) ? rawType : 'activity';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#fbfaf9',
          padding: '64px 72px',
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#1F2421',
        }}
      >
        {/* Top row: wordmark + type pill */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 22,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontWeight: 700,
              letterSpacing: '-0.4px',
              color: '#216869',
            }}
          >
            <span
              style={{
                display: 'flex',
                width: 36,
                height: 36,
                borderRadius: 10,
                background: '#216869',
                color: '#fff',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                fontWeight: 800,
              }}
            >
              P
            </span>
            <span>Photon</span>
          </div>
          <div
            style={{
              display: 'flex',
              padding: '8px 16px',
              borderRadius: 999,
              background: TILE_BG[type],
              color: '#1F2421',
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            {TYPE_LABEL[type]}
          </div>
        </div>

        {/* Main card body */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            gap: 36,
            marginTop: 48,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 144,
              height: 144,
              borderRadius: 32,
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
                fontSize: 64,
                fontWeight: 700,
                letterSpacing: '-1.5px',
                lineHeight: 1.05,
                color: '#1F2421',
              }}
            >
              {title}
            </div>
            {subtitle && (
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 500,
                  color: 'rgba(31, 36, 33, 0.62)',
                  letterSpacing: '-0.3px',
                  lineHeight: 1.3,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
        </div>

        {/* Footer meta line */}
        {meta && (
          <div
            style={{
              display: 'flex',
              fontSize: 20,
              color: 'rgba(31, 36, 33, 0.5)',
              fontWeight: 500,
              letterSpacing: '-0.1px',
            }}
          >
            {meta}
          </div>
        )}
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
