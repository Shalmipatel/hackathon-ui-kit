/**
 * Local visual-iteration tool for the iMessage rich-link card.
 *
 * Runs the actual `api/og.tsx` edge-function handler with a fake
 * Request, captures the rendered PNG, and writes it to disk so we
 * can iterate on the card design WITHOUT round-tripping through
 * Vercel's deploy queue.
 *
 * Usage:
 *   node node_modules/.bin/esbuild scripts/render-card.tsx \
 *     --bundle --platform=node --format=esm \
 *     --external:@vercel/og --outfile=/tmp/render-card.mjs \
 *     && node /tmp/render-card.mjs
 *
 * Or via the shorthand npm script: `npm run render-card`.
 *
 * Edit the URL_QUERY below to test different card variants.
 */

import handler from '../api/og.tsx';
import { writeFileSync } from 'node:fs';

const VARIANTS: { name: string; query: string }[] = [
  {
    /* Day-plan question — prose already has the agenda; card carries
       complementary facts (Day 1 of 9, 4 plans today) NOT in prose. */
    name: 'switzerland-day1',
    query:
      'title=Switzerland&eyebrow=SAT%20JUN%2020%20%C2%B7%20LANDS%203%3A45%20PM%20%C2%B7%20ZRH&type=trip&scene=mountain' +
      '&stats=DATES%3AJun%2019%E2%80%9328%7CDAY%201%20OF%3A9%7CPLANS%3A4%20today' +
      '&meta=wanderbot-ai.vercel.app',
  },
  {
    /* Trip-highlights teaser — short prose ("Switzerland, Jun 19-28")
       leaves room for items to surface things the prose didn't name. */
    name: 'switzerland-highlights',
    query:
      'title=Switzerland&eyebrow=NEXT%20TRIP%20%C2%B7%20JUN%2019%E2%80%9328&type=trip&scene=mountain' +
      '&stats=DATES%3AJun%2019%E2%80%9328%7CLENGTH%3A9%20days%7CPARTY%3A2%20travelers' +
      '&items=attraction%3AMatterhorn%20%26%20Glacier%20Express%7Cexperience%3AThermal%20baths%20at%20Vals%7Crestaurant%3AFondue%20in%20Lauterbrunnen%7Cactivity%3ABern%20Old%20Town%20walk' +
      '&meta=wanderbot-ai.vercel.app',
  },
  {
    /* Packing question — prose has the advice; card surfaces climate
       facts the prose didn't mention (no `note`, just stats). */
    name: 'switzerland-packing',
    query:
      'title=Pack%20Light&eyebrow=PACKING%20%C2%B7%20SWITZERLAND%20%C2%B7%20JUN%2019%E2%80%9328&type=trip&scene=snow' +
      '&stats=AVG%20HIGH%3A22%C2%B0C%7CAVG%20LOW%3A8%C2%B0C%7CRAIN%3A4%20days' +
      '&meta=wanderbot-ai.vercel.app',
  },
  {
    /* Trip-overview without items — illustration + stats only. */
    name: 'trip-overview-tokyo',
    query:
      'title=Tokyo&eyebrow=NEXT%20TRIP%20%C2%B7%20SEPT%2012%E2%80%9318&type=trip&scene=city' +
      '&stats=DATES%3ASept%2012%E2%80%9318%7CLENGTH%3A6%20days%7CPARTY%3A2%20travelers' +
      '&meta=wanderbot-ai.vercel.app',
  },
  {
    /* Coastal trip example. */
    name: 'trip-coast-bali',
    query:
      'title=Bali&eyebrow=NEXT%20TRIP%20%C2%B7%20DEC%204%E2%80%9314&type=trip&scene=coast' +
      '&stats=DATES%3ADec%204%E2%80%9314%7CLENGTH%3A10%20days%7CPARTY%3A4%20travelers' +
      '&meta=wanderbot-ai.vercel.app',
  },
  {
    /* River / Bangkok-style. */
    name: 'trip-river-bangkok',
    query:
      'title=Bangkok&eyebrow=NEXT%20TRIP%20%C2%B7%20MAR%2011%E2%80%9319&type=trip&scene=river' +
      '&stats=DATES%3AMar%2011%E2%80%9319%7CLENGTH%3A8%20days%7CPARTY%3A3%20travelers' +
      '&meta=wanderbot-ai.vercel.app',
  },
  {
    /* Aurora / Reykjavik. */
    name: 'trip-aurora-reykjavik',
    query:
      'title=Reykjav%C3%ADk&eyebrow=NEXT%20TRIP%20%C2%B7%20NOV%2014%E2%80%9320&type=trip&scene=aurora' +
      '&stats=DATES%3ANov%2014%E2%80%9320%7CLENGTH%3A6%20days%7CPARTY%3A2%20travelers' +
      '&meta=wanderbot-ai.vercel.app',
  },
  {
    /* Snow / Hokkaido. */
    name: 'trip-snow-hokkaido',
    query:
      'title=Hokkaid%C5%8D&eyebrow=NEXT%20TRIP%20%C2%B7%20FEB%208%E2%80%9314&type=trip&scene=snow' +
      '&stats=DATES%3AFeb%208%E2%80%9314%7CLENGTH%3A6%20days%7CPARTY%3A2%20travelers' +
      '&meta=wanderbot-ai.vercel.app',
  },
  {
    /* Desert trip. */
    name: 'trip-desert-marrakech',
    query:
      'title=Marrakech&eyebrow=NEXT%20TRIP%20%C2%B7%20APR%208%E2%80%9314&type=trip&scene=desert' +
      '&stats=DATES%3AApr%208%E2%80%9314%7CLENGTH%3A6%20days%7CPARTY%3A2%20travelers' +
      '&meta=wanderbot-ai.vercel.app',
  },
  {
    /* Forest / Pacific Northwest trip. */
    name: 'trip-forest-portland',
    query:
      'title=Portland&eyebrow=NEXT%20TRIP%20%C2%B7%20OCT%207%E2%80%9312&type=trip&scene=forest' +
      '&stats=DATES%3AOct%207%E2%80%9312%7CLENGTH%3A5%20days%7CPARTY%3A2%20travelers' +
      '&meta=wanderbot-ai.vercel.app',
  },
];

async function main() {
  for (const variant of VARIANTS) {
    const req = new Request(`http://local/og?${variant.query}`);
    const res = await handler(req);
    const buf = Buffer.from(await res.arrayBuffer());
    const outPath = `/tmp/card-${variant.name}.png`;
    writeFileSync(outPath, buf);
    console.log(`  ${variant.name.padEnd(16)} → ${outPath}  (${buf.length} bytes)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
