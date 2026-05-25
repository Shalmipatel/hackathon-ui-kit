import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const title = url.searchParams.get('title') || 'Wanderbot';
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fbf7f0',
            fontSize: 96,
            fontWeight: 700,
            color: '#1c3640',
          }}
        >
          {title}
        </div>
      ),
      { width: 1200, height: 630 },
    );
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ''}` : String(e);
    return new Response(`OG render failed (minimal probe):\n${msg}`, {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}
