/**
 * Diagnostic: NO JSX, NO @vercel/og imports beyond ImageResponse.
 * Uses React.createElement directly. If this still 500s, the
 * issue isn't JSX compilation.
 */
import { ImageResponse } from '@vercel/og';
import { createElement } from 'react';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const title = url.searchParams.get('title') || 'Wanderbot';
    return new ImageResponse(
      createElement(
        'div',
        {
          style: {
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fbf7f0',
            fontSize: 96,
            fontWeight: 700,
            color: '#1c3640',
          },
        },
        title,
      ),
      { width: 1200, height: 630 },
    );
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ''}` : String(e);
    return new Response(`probe failed:\n${msg}`, {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}
