/**
 * Diagnostic edge function — no @vercel/og dependency.
 * If THIS 500s, the issue is the project's edge runtime config.
 * If this works but /og 500s, the issue is @vercel/og specifically.
 */
export const config = { runtime: 'edge' };

export default function handler(req: Request) {
  return new Response(
    `edge OK\nrequest url: ${req.url}\nnow: ${new Date().toISOString()}`,
    {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    },
  );
}
