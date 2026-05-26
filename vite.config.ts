import { defineConfig, loadEnv, type Plugin } from 'vite';
import { resolve } from 'path';
import { networkInterfaces } from 'os';
import { readFileSync } from 'fs';
import basicSsl from '@vitejs/plugin-basic-ssl';
import QRCode from 'qrcode';

/**
 * Read the package version once per Vite boot so we can stamp it on every
 * analytics event via the `app_version` super-property. Safe at
 * config-load time — the JSON is read synchronously and substituted into
 * the bundle.
 */
const APP_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, 'package.json'), 'utf8'),
    ) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
})();

/**
 * Enumerate non-internal IPv4 addresses on this machine. Returns names
 * alongside IPs so the dev overlay can label them (e.g. "en0: 192.168.1.23").
 */
/**
 * RFC1918 + common non-routable ranges: only these addresses are likely
 * reachable from a phone on the same Wi-Fi. Filtering out CGNAT (100.64/10),
 * link-local (169.254/16), and tunnel interfaces (utun*, tailscale*, tun*,
 * tap*) keeps the QR list focused on things that actually work.
 */
function isPrivateLanIpv4(addr: string): boolean {
  if (addr.startsWith('192.168.')) return true;
  if (addr.startsWith('10.')) return true;
  // 172.16.0.0 – 172.31.255.255
  if (addr.startsWith('172.')) {
    const second = parseInt(addr.split('.')[1] || '0', 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function isTunnelInterface(name: string): boolean {
  const n = name.toLowerCase();
  return n.startsWith('utun')
    || n.startsWith('tun')
    || n.startsWith('tap')
    || n.startsWith('tailscale')
    || n.startsWith('zt')            // zerotier
    || n.startsWith('wg')            // wireguard
    || n.startsWith('ppp');          // dial-up / VPN
}

function getLanAddresses(): Array<{ name: string; address: string }> {
  const out: Array<{ name: string; address: string }> = [];
  try {
    const ifaces = networkInterfaces();
    for (const [name, list] of Object.entries(ifaces)) {
      if (!list) continue;
      if (isTunnelInterface(name)) continue;
      for (const info of list) {
        // Node >=18 uses `family: 'IPv4'`, older versions used the integer 4.
        const isIpv4 = typeof info.family === 'string'
          ? info.family === 'IPv4'
          : (info.family as unknown as number) === 4;
        if (!isIpv4) continue;
        if (info.internal) continue;
        if (!isPrivateLanIpv4(info.address)) continue;
        out.push({ name, address: info.address });
      }
    }
  } catch (err) {
    // Some sandboxed environments block `uv_interface_addresses` —
    // silently fall back to no LAN IPs rather than crashing the dev server.
    console.warn('[dev-qr] networkInterfaces() unavailable:', err instanceof Error ? err.message : err);
  }
  return out;
}

/**
 * Dev-only plugin: prints a QR code to the terminal for every URL the dev
 * server is reachable at (localhost + each LAN IP). Handy for scanning from
 * a real phone on the same network. No-op in `vite build`.
 */
function devQrPlugin(): Plugin {
  return {
    name: 'dev-qr',
    apply: 'serve',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer?.address();
        if (!addr || typeof addr === 'string') return;
        const port = addr.port;
        const proto = server.config.server.https ? 'https' : 'http';

        const urls: Array<{ label: string; url: string }> = [];
        urls.push({ label: 'localhost', url: `${proto}://localhost:${port}` });
        for (const { name, address } of getLanAddresses()) {
          urls.push({ label: `${name} (LAN)`, url: `${proto}://${address}:${port}` });
        }

        /* ANSI: bold, bright colors. Falls back cleanly in plain
         * terminals because escape codes just render as nothing. */
        const RED = '\x1b[1;31m';
        const YELLOW = '\x1b[1;33m';
        const CYAN = '\x1b[1;36m';
        const MAGENTA = '\x1b[1;35m';
        const GREEN = '\x1b[1;32m';
        const DIM = '\x1b[2m';
        const RESET = '\x1b[0m';

        /* Vite's bound address, not the machine's LAN IPs. If Vite is
         * listening on 127.0.0.1 only, a LAN IP QR would point at a
         * socket that refuses connections (`ERR_CONNECTION_REFUSED`).
         * `0.0.0.0` / `::` mean "all interfaces" and are the only
         * values that make the LAN IPs reachable. */
        const boundToLoopbackOnly = addr.address === '127.0.0.1'
          || addr.address === '::1';

        /* Delay a tick so our banner lands AFTER Vite's built-in "ready" log. */
        setTimeout(async () => {
          const phoneUrls = urls.filter(u => !u.url.includes('localhost'));

          /* Config problem #1: dev server is bound to loopback only, so
           * no phone on the same Wi-Fi can reach it no matter what the
           * LAN IPs are. Refuse to print a misleading QR and say why. */
          if (boundToLoopbackOnly) {
            console.log(
              '\n' +
              `  ${RED}\u{1F6AB}  Mobile QR disabled \u2014 dev server is bound to ${addr.address} (loopback only)${RESET}\n` +
              `  ${YELLOW}Your laptop's LAN IP won't accept connections, so a phone on the same${RESET}\n` +
              `  ${YELLOW}Wi-Fi can't reach the dev server. The QR would just give ERR_CONNECTION_REFUSED.${RESET}\n\n` +
              `  ${CYAN}To enable phone testing, update .env.local and restart \`npm run dev\`:${RESET}\n` +
              `      ${CYAN}VITE_DEV_HOST=0.0.0.0${RESET}\n` +
              `      ${CYAN}VITE_DEV_HTTPS=1${RESET}\n\n` +
              `  ${DIM}0.0.0.0 binds to every network interface; HTTPS is required so the${RESET}\n` +
              `  ${DIM}phone has a secure context for crypto / clipboard / vault APIs.${RESET}\n` +
              `  ${DIM}See .env.example and src/dev/README.md for details.${RESET}\n`
            );
            return;
          }

          if (phoneUrls.length === 0) {
            console.log(
              '\n  \u{1F4F1}  No LAN IPs detected \u2014 connect to a network to test on a phone.\n'
            );
            return;
          }

          /* Config problem #2: bound to LAN but plain HTTP. A phone
           * scanning plain-HTTP on a non-loopback origin lands on a
           * NON-secure context: `crypto.randomUUID`, `crypto.subtle`,
           * clipboard, camera, and service workers are all unavailable.
           * That crashes auth, vault, and a pile of other flows. */
          if (!server.config.server.https) {
            console.log(
              '\n' +
              `  ${RED}\u{1F6AB}  Mobile QR disabled \u2014 dev server is plain HTTP${RESET}\n` +
              `  ${YELLOW}Phones (and any non-loopback origin) need a secure context to run this app.${RESET}\n` +
              `  ${YELLOW}Without HTTPS the page will load but auth, vault, and crypto APIs will crash.${RESET}\n\n` +
              `  ${CYAN}To enable phone testing, add this to .env.local and restart \`npm run dev\`:${RESET}\n` +
              `      ${CYAN}VITE_DEV_HTTPS=1${RESET}\n\n` +
              `  ${DIM}Accept the self-signed cert once per phone (tap Advanced \u2192 Proceed).${RESET}\n` +
              `  ${DIM}See .env.example and src/dev/README.md for details.${RESET}\n`
            );
            return;
          }

          console.log('\n  \u{1F4F1}  Scan from a phone on the same Wi-Fi:');
          for (const { label, url } of phoneUrls) {
            try {
              const qr = await QRCode.toString(url, {
                type: 'terminal',
                small: true,
                errorCorrectionLevel: 'M',
              });
              console.log(`\n  ${label}  \u2192  ${url}`);
              /* Indent the QR block by 2 spaces so it reads as part of Vite's log. */
              console.log(qr.split('\n').map(l => '  ' + l).join('\n'));
            } catch {
              console.log(`  (failed to render QR for ${url})`);
            }
          }

          /* Seamless-login breadcrumb. These QRs point at the bare origin —
           * scanning them just opens the app on a phone but leaves the user
           * on the sign-in screen. The magenta block below tells the dev
           * how to get a one-tap auto-login instead (DevSettings → paste
           * JWT → re-scan the JWT-embedded QR from the in-app overlay,
           * which runs `dev-jwt-import.ts` on arrival). */
          console.log(
            '\n' +
            `  ${MAGENTA}\u{2728}  For seamless mobile login:${RESET}\n` +
            `     ${GREEN}1.${RESET} Open the app on your laptop \u2192 ${GREEN}Dev Settings${RESET}\n` +
            `     ${GREEN}2.${RESET} Paste your JWT into the ${GREEN}Token${RESET} field (leave ${GREEN}Include JWT${RESET} checked)\n` +
            `     ${GREEN}3.${RESET} Scan the ${GREEN}QR from that overlay${RESET} \u2014 phone auto-signs-in on arrival\n` +
            `  ${DIM}The QRs above are plain URLs; the in-app QR embeds the JWT as a URL fragment${RESET}\n` +
            `  ${DIM}and is consumed by src/dev/providers/auth/dev-jwt-import.ts before React mounts.${RESET}\n`
          );
        }, 60);
      });
    },
  };
}

/**
 * Dev-only stub backend for the starter kit.
 *
 * Only registered when `VITE_NEOCLAW_API_URL` is empty — i.e. the user
 * has cloned the repo and not yet pointed it at their backend. Without
 * this, chat requests fall through to the SPA's index.html, the stream
 * parser chokes on the HTML and surfaces "Request failed with status 404"
 * as the first message a new user sees, and the Connections page spams
 * the console with failed integration-status calls. Bad first impression
 * on both fronts.
 *
 * Behaviour:
 *  - `POST /v1/responses` streams a friendly canned reply over SSE in the
 *    same `response.output_text.delta` / `response.completed` shape the real
 *    backend uses, so the chat appears functional out of the box.
 *  - Everything else under `/api/*`, `/tools/*`, `/v1/*` returns `200 OK`
 *    with a JSON envelope containing every list field the various clients
 *    look for (apps, credentials, kids, activities, accounts, tokens). The
 *    clients all do `data.<field> ?? []` so a single shape satisfies them
 *    all — empty state everywhere, zero 404s.
 */
function starterStubBackendPlugin(): Plugin {
  const STUB_REPLY = [
    "You're running the AI Assistant starter without a backend wired up — this is a mock reply.",
    '',
    'When you\'re ready to go live, set `VITE_NEOCLAW_API_URL` in `.env.local` to point at your backend gateway and restart the dev server. The chat will then stream real responses from your model.',
    '',
    'Have a look at `src/providers/chat/stream-client.ts` to see how the streaming protocol works.',
  ].join('\n');

  const EMPTY_ENVELOPE = {
    apps: [],
    credentials: [],
    kids: [],
    activities: [],
    accounts: [],
    tokens: [],
    jobs: [],
    events: [],
    files: [],
  };

  type Sse = import('http').ServerResponse;

  const writeSseHeaders = (res: Sse) => {
    res.statusCode = 200;
    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
  };

  /* `/v1/responses` shape — matches src/providers/chat/sse-parser.util.ts. */
  const responsesSseStub = async (res: Sse) => {
    writeSseHeaders(res);
    const writeEvent = (event: string, data: Record<string, unknown>) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const tokens = STUB_REPLY.split(/(\s+)/);
    for (const tok of tokens) {
      if (!tok) continue;
      writeEvent('response.output_text.delta', { delta: tok });
      await new Promise((r) => setTimeout(r, 15));
    }
    writeEvent('response.completed', {});
    res.end();
  };

  /* `/api/neoclaw-agent/chat` shape — matches src/providers/stream/
   * agent-sse-parser.ts. Text deltas arrive as `event: agent` frames
   * with `stream:"assistant"` and `data.delta`, then a lifecycle:end
   * event signals completion. This is the path the app actually uses
   * by default (agentApiEnabled defaults to true in DEFAULT_SETTINGS). */
  const agentSseStub = async (res: Sse) => {
    writeSseHeaders(res);
    const writeEvent = (event: string, data: Record<string, unknown>) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const runId = `stub-${Date.now()}`;
    writeEvent('agent', { stream: 'lifecycle', data: { phase: 'start' }, runId });

    const tokens = STUB_REPLY.split(/(\s+)/);
    for (const tok of tokens) {
      if (!tok) continue;
      writeEvent('agent', {
        stream: 'assistant',
        data: { delta: tok },
        runId,
      });
      await new Promise((r) => setTimeout(r, 15));
    }

    writeEvent('agent', { stream: 'lifecycle', data: { phase: 'end' }, runId });
    res.write('data: [DONE]\n\n');
    res.end();
  };

  /* Paths the stub should NOT swallow — they're handled by other dev
   * plugins (transcription proxy, vault proxy) and need to fall through
   * to the next middleware. */
  const SKIP_PREFIXES = [
    '/_transcribe',
    '/api/vault',
  ];

  return {
    name: 'starter-stub-backend',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';

        if (SKIP_PREFIXES.some((p) => url.startsWith(p))) return next();

        if (url.startsWith('/v1/responses')) {
          if (req.method !== 'POST') return next();
          void responsesSseStub(res);
          return;
        }

        if (url.startsWith('/api/neoclaw-agent/chat')) {
          if (req.method !== 'POST') return next();
          /* Drain body before streaming back so the request socket
           * doesn't reset mid-stream. */
          req.on('data', () => { /* discard */ });
          req.on('end', () => {
            void agentSseStub(res);
          });
          return;
        }

        const isStubbed =
          url.startsWith('/api/') ||
          url.startsWith('/v1/') ||
          url.startsWith('/tools/');
        if (!isStubbed) return next();

        /* Drain any request body before responding so the client doesn't
         * see a connection reset on POST/PUT/DELETE. */
        req.on('data', () => { /* discard */ });
        req.on('end', () => {
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(EMPTY_ENVELOPE));
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(__dirname), '');
  const neoclawApiUrl = env.VITE_NEOCLAW_API_URL ?? '';
  const transcriptionUrl = env.VITE_TRANSCRIPTION_URL || neoclawApiUrl;
  const identityUrl = env.VITE_IDENTITY_BASE_URL || neoclawApiUrl;
  const integrationUrl = env.VITE_INTEGRATION_BASE_URL ?? identityUrl;
  const localServerUrl = env.VITE_LOCAL_SERVER_URL ?? '';
  const vaultUrl = env.VITE_VAULT_BASE_URL ?? '';

  /**
   * Default to 0.0.0.0 so the dev server is reachable from any device on
   * the same Wi-Fi (phone QR flow). `localhost` and `127.0.0.1` still work
   * for the dev machine itself. Override with `VITE_DEV_HOST=localhost` if
   * you need to restrict binding (e.g. untrusted network).
   *
   * HTTPS (`basicSsl`) is enabled when either:
   *   - A *named* host is used (existing OAuth dev flow), OR
   *   - `VITE_DEV_HTTPS=1` is set — required for phone testing on a LAN IP
   *     because browsers only expose `crypto.randomUUID`, `crypto.subtle`,
   *     clipboard, service workers, etc. on "secure contexts". Plain HTTP
   *     on non-loopback origins (e.g. http://192.168.x.x:5173) is NOT a
   *     secure context and will crash code paths that call those APIs.
   *     First-time phone scan: accept the self-signed cert warning once.
   */
  const devHost = env.VITE_DEV_HOST || '0.0.0.0';
  const devPort = Number(env.VITE_DEV_PORT || '5173');
  const httpsOptIn = env.VITE_DEV_HTTPS === '1' || env.VITE_DEV_HTTPS === 'true';
  const useHttps = httpsOptIn
    || (devHost !== 'localhost'
      && devHost !== '0.0.0.0'
      && devHost !== '127.0.0.1');

  /**
   * Rewrites Set-Cookie headers on proxied responses so login cookies work
   * on plain-HTTP LAN hostnames (e.g. http://172.20.10.2:5173 from iPhone).
   *
   * - Strips `Secure` — Safari drops Secure cookies over HTTP on non-localhost.
   * - Rewrites `SameSite=None` → `SameSite=Lax` — `None` requires Secure,
   *   so the browser would drop these otherwise.
   * - Strips `Domain=...` — makes the cookie apply to whatever host the
   *   browser is on, instead of the backend's original domain.
   */
  function relaxCookiesForLocalDev(setCookieHeader: string[] | string | undefined): string[] | undefined {
    if (!setCookieHeader) return undefined;
    const arr = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    return arr.map((c) =>
      c
        .replace(/;\s*Secure/gi, '')
        .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
        .replace(/;\s*Domain=[^;]+/gi, ''),
    );
  }

  const relaxCookieProxyConfigure = (proxy: { on: (e: string, fn: (...a: unknown[]) => void) => void }) => {
    proxy.on('proxyRes', (proxyRes: { headers: Record<string, string[] | string | undefined> }) => {
      const sc = proxyRes.headers['set-cookie'];
      const rewritten = relaxCookiesForLocalDev(sc);
      if (rewritten) proxyRes.headers['set-cookie'] = rewritten;
    });
  };

  /* Only register proxy entries when we have a real target. http-proxy
   * crashes on empty target strings (TypeError in setupOutgoing.split).
   * Users start without a .env.local by default -- keep the dev server
   * bootable and let unrouted requests 404 cleanly instead.
   *
   * Why the `/api/gw` rewrite below:
   *   VITE_NEOCLAW_API_URL points at a gateway that tunnels any request
   *   under `/api/gw/<path>` to the underlying instance owning the
   *   bearer token, stripping the `/api/gw` prefix before forwarding.
   *   So a browser request like `POST /v1/responses` has to leave the
   *   dev server as `POST /api/gw/v1/responses` to actually reach the
   *   `/v1/responses` endpoint on your backend. If your backend exposes
   *   routes directly (no gateway tunneling), set VITE_GATEWAY_DIRECT=1
   *   to skip the prefix rewrite.
   *
   *   `/api/session` is the gateway's own session API (not an instance
   *   route), so it must NOT be rewritten — left as-is below. */
  const INSTANCE_GATEWAY_PREFIX = '/api/gw';
  const directBackend = env.VITE_GATEWAY_DIRECT === '1' || env.VITE_GATEWAY_DIRECT === 'true';
  const prependInstanceGateway = (urlPath: string) =>
    `${INSTANCE_GATEWAY_PREFIX}${urlPath}`;
  const neoclawApiProxy = neoclawApiUrl
    ? Object.fromEntries(
        ['/api/session', '/api', '/v1', '/tools', '/websockify', '/neoclaw-files'].map((path) => {
          const isAdminSession = path === '/api/session';
          return [
            path,
            {
              target: neoclawApiUrl,
              changeOrigin: true,
              secure: false,
              ...(isAdminSession || directBackend
                ? {
                    cookieDomainRewrite: '',
                    configure: relaxCookieProxyConfigure,
                  }
                : { rewrite: prependInstanceGateway }),
              ...(path === '/websockify' && { ws: true }),
            },
          ];
        }),
      )
    : {};

  /* Discover LAN IPs once per Vite boot so the dev overlay can show a QR
   * that a phone on the same network can scan. In production this resolves
   * to an empty string and the overlay's QR section falls back to the
   * current window.location.origin. */
  const lanIps = mode === 'development'
    ? getLanAddresses().map(i => `${i.name}:${i.address}`).join(',')
    : '';

  return {
    root: resolve(__dirname),
    plugins: [
      ...(useHttps ? [basicSsl()] : []),
      ...(mode === 'development' ? [devQrPlugin()] : []),
      /* Stub backend kicks in only when the user hasn't wired their
       * own backend yet — keeps the kit usable on first clone. */
      ...(mode === 'development' && !neoclawApiUrl ? [starterStubBackendPlugin()] : []),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    define: {
      'import.meta.env.VITE_TRANSCRIPTION_URL': JSON.stringify(
        mode === 'development' && transcriptionUrl ? '/_transcribe' : transcriptionUrl,
      ),
      'import.meta.env.VITE_DEV_LAN_IPS': JSON.stringify(lanIps),
      'import.meta.env.VITE_DEV_PORT': JSON.stringify(String(devPort)),
      /* Surfaces the bound-host config to the client so DevSettingsOverlay
       * can disable the phone-QR when Vite is listening on loopback only
       * (a LAN IP QR would give ERR_CONNECTION_REFUSED on the phone). */
      'import.meta.env.VITE_DEV_HOST': JSON.stringify(devHost),
      /* package.json version, baked in at build time. Surfaced as the
       * `app_version` analytics super-property — see features/analytics. */
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(APP_VERSION),
    },
    esbuild: {
      jsx: 'automatic',
    },
    server: {
      host: devHost,
      port: devPort,
      strictPort: useHttps,
      // Allow tunneled hosts (localtunnel, ngrok, cloudflare) for iOS device testing
      allowedHosts: ['.loca.lt', '.ngrok-free.app', '.ngrok.io', '.trycloudflare.com'],
      proxy: {
        ...(transcriptionUrl ? {
          '/_transcribe': {
            target: transcriptionUrl,
            changeOrigin: true,
            secure: false,
            rewrite: (path) => path.replace(/^\/_transcribe/, ''),
          },
        } : {}),
        ...(identityUrl ? {
          '/api/identity': {
            target: identityUrl,
            changeOrigin: true,
            secure: false,
            cookieDomainRewrite: '',
            configure: relaxCookieProxyConfigure,
          },
        } : {}),
        ...(vaultUrl ? {
          '/api/vault': {
            target: vaultUrl,
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path.replace(/^\/api\/vault/, '/api'),
          },
        } : {}),
        ...(integrationUrl ? {
          '/api/integration': {
            target: integrationUrl,
            changeOrigin: true,
            secure: false,
            configure: relaxCookieProxyConfigure,
          },
        } : {}),
        ...(localServerUrl ? {
          '/api/public/integration': {
            target: localServerUrl,
            changeOrigin: true,
            secure: false,
          },
          '/api/public/feedback': {
            target: localServerUrl,
            changeOrigin: true,
            secure: false,
          },
        } : {}),
        '/api/nsl/': {
          target: env.VITE_GATEWAY_URL ?? 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
        ...neoclawApiProxy,
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        input: {
          /* Main SPA entry. */
          main: resolve(__dirname, 'index.html'),
          /* iOS sign-in bridge — loaded by ASWebAuthenticationSession,
             drives Firebase Auth via signInWithRedirect, then bounces
             the resulting ID token back to the iOS app via a custom
             URL scheme. See src/auth-bridge.ts. */
          auth: resolve(__dirname, 'auth.html'),
        },
      },
    },
  };
});
