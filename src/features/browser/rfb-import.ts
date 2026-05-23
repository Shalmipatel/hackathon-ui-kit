/**
 * @novnc/novnc v1.6 ships CJS with top-level `await` in browser.js.
 * esbuild (used by Vite) cannot `require()` a file that contains TLA,
 * so we load it lazily via dynamic `import()` which Vite handles as a
 * separate async chunk — the TLA runs inside the async module boundary
 * where it's valid.
 */

export type RfbClient = EventTarget & {
  scaleViewport: boolean;
  resizeSession: boolean;
  background: string;
  disconnect: () => void;
  /**
   * Forward a single key event to the remote. Pass `down` = true for press,
   * false for release, or omit for a press+release tap. `keysym` is an X11
   * keysym (see keysym.XK_*); `code` is the W3C UI-Events key code (e.g.
   * "KeyA", "Enter") used for QEMU scancode mapping when supported.
   */
  sendKey: (keysym: number, code: string, down?: boolean) => void;
  /**
   * Push text into the remote session's clipboard via the VNC extended
   * clipboard pseudo-encoding. x11vnc picks this up and sets the X11
   * CLIPBOARD/PRIMARY selection on display :0.
   */
  clipboardPasteFrom: (text: string) => void;
  addEventListener: typeof EventTarget.prototype.addEventListener;
};

export type RfbConstructor = new (
  target: HTMLElement,
  url: string,
  options?: { shared?: boolean },
) => RfbClient;

function unwrapDefaultToConstructor(start: unknown): RfbConstructor {
  let cur: unknown = start;
  for (let i = 0; i < 8; i++) {
    if (typeof cur === 'function') return cur as RfbConstructor;
    if (cur !== null && typeof cur === 'object' && 'default' in cur) {
      cur = (cur as { default: unknown }).default;
      continue;
    }
    break;
  }
  throw new Error(
    `RFB: expected a constructor from @novnc/novnc (after unwrap: ${typeof cur})`,
  );
}

let _cached: RfbConstructor | null = null;

export async function getRFB(): Promise<RfbConstructor> {
  if (_cached) return _cached;
  const mod = await import('@novnc/novnc/lib/rfb.js');
  _cached = unwrapDefaultToConstructor(
    (mod as { default?: unknown }).default ?? mod,
  );
  return _cached;
}
