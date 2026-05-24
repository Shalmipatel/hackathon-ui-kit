/**
 * <Toaster /> — Sonner-style stacked toast container.
 *
 * Mount once at the app root. Reads from the toast-store and renders the
 * most recent N toasts (default 3) stacked at the top-center of the screen.
 *
 * Behavior:
 *   • Collapsed (default): newest card in front, older cards peek out
 *     behind with scale + translateY offset (Sonner default view).
 *   • Hover over the stack: all toasts expand into a vertical list using
 *     each card's measured height so rows don't overlap when text wraps.
 *   • Each toast auto-dismisses after its `duration` ms (paused while
 *     hovering the stack).
 *   • Clicking the action button dismisses the toast.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { useToastStore, type ToastData } from './toast-store';

/* ──────────────────────────────────────────────────────────────────────
   CONFIG
   ────────────────────────────────────────────────────────────────────── */

const MAX_VISIBLE = 3;
const STACK_OFFSET = 14;      // vertical translate per rank (collapsed)
const STACK_SCALE = 0.05;     // scale reduction per rank (collapsed)
const EXPANDED_GAP = 10;      // gap between toasts when expanded
const TOAST_WIDTH = 420;      // fixed width for the toast viewport
const DEFAULT_HEIGHT = 84;    // fallback until a card has measured itself

/* ──────────────────────────────────────────────────────────────────────
   STYLED COMPONENTS
   ────────────────────────────────────────────────────────────────────── */

const Viewport = styled.div`
  position: fixed;
  /* Stay clear of the iOS status bar / Dynamic Island. */
  top: calc(env(safe-area-inset-top, 0) + 12px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 100000;
  pointer-events: none;
  width: min(${TOAST_WIDTH}px, calc(100vw - 24px));
`;

const Stack = styled.ol<{ $height: number }>`
  list-style: none;
  margin: 0;
  padding: 0;
  position: relative;
  pointer-events: auto;
  width: 100%;
  height: ${(p) => p.$height}px;
  transition: height 0.28s cubic-bezier(0.22, 1, 0.36, 1);
`;

const ToastItem = styled.li<{
  $rank: number;
  $expanded: boolean;
  $leaving: boolean;
  $mounted: boolean;
  $expandedTop: number;
  $frontHeight: number;
}>`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  transform-origin: top center;
  transition:
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.24s ease,
    top 0.22s cubic-bezier(0.22, 1, 0.36, 1);

  ${(p) => {
    // Pre-mount — slide in from above with fade
    if (!p.$mounted) {
      return `
        top: 0px;
        transform: translateY(-14px) scale(0.96);
        opacity: 0;
        z-index: ${1000 - p.$rank};
        pointer-events: none;
      `;
    }
    // Leaving — slide up and fade out (mirror of the entry animation)
    if (p.$leaving) {
      return `
        top: 0px;
        transform: translateY(-14px) scale(0.96);
        opacity: 0;
        z-index: ${1000 - p.$rank};
        pointer-events: none;
      `;
    }
    // Expanded — space items in a vertical list using measured heights
    if (p.$expanded) {
      return `
        top: ${p.$expandedTop}px;
        transform: translateY(0) scale(1);
        opacity: 1;
        z-index: ${1000 - p.$rank};
        pointer-events: auto;
      `;
    }
    // Collapsed — Sonner-style stack: back cards peek out below the front
    // card. All cards share the front card's height anchor (top: 0) and
    // are offset/scaled so their bottoms step down behind the front.
    const visible = p.$rank < MAX_VISIBLE;
    return `
      top: 0px;
      transform: translateY(${p.$rank * STACK_OFFSET}px) scale(${1 - p.$rank * STACK_SCALE});
      opacity: ${visible ? 1 : 0};
      z-index: ${1000 - p.$rank};
      pointer-events: ${p.$rank === 0 ? 'auto' : 'none'};
      ${p.$rank > 0 && p.$frontHeight > 0 ? `height: ${p.$frontHeight}px;` : ''}
    `;
  }}
`;

const Card = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  background: white;
  border: 1px solid rgba(36, 36, 36, 0.05);
  border-radius: 24px;
  padding: 20px;
  box-shadow:
    0 8px 12px rgba(0, 0, 0, 0.12),
    0 0 12px rgba(0, 0, 0, 0.12);
  width: 100%;
  box-sizing: border-box;
`;

const TextCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1 0 0;
`;

const Title = styled.div`
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 13px;
  line-height: 20px;
  letter-spacing: -0.3px;
  color: #242424;
`;

const Description = styled.div`
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 13px;
  line-height: 20px;
  letter-spacing: -0.3px;
  color: rgba(36, 36, 36, 0.75);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
`;

const ActionBtn = styled.button`
  flex-shrink: 0;
  height: 36px;
  padding: 0 18px;
  background: #216869;
  border: 3px solid #242424;
  border-radius: 20px;
  color: #242424;
  font-family: 'Inter', sans-serif;
  font-weight: 800;
  font-size: 13px;
  line-height: 20px;
  letter-spacing: -0.3px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, transform 0.1s;
  &:hover { background: #fde614; }
  &:active { transform: scale(0.98); }
`;

/* ──────────────────────────────────────────────────────────────────────
   SINGLE TOAST ITEM
   ────────────────────────────────────────────────────────────────────── */

interface ItemProps {
  toast: ToastData;
  rank: number;
  expanded: boolean;
  paused: boolean;
  expandedTop: number;
  frontHeight: number;
  onDismiss: () => void;
  onMeasured: (height: number) => void;
}

const ToastEntry: React.FC<ItemProps> = ({
  toast, rank, expanded, paused, expandedTop, frontHeight, onDismiss, onMeasured,
}) => {
  const [leaving, setLeaving] = useState(false);
  // Start pre-mount (opacity 0) so the very first paint is invisible, then flip
  // true on the next frame so the transition to the mounted state animates in.
  const [itemMounted, setItemMounted] = useState(false);
  const remainingRef = useRef<number>(toast.duration ?? 3000);
  const startRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Flip to mounted on the next frame (or next microtask) so the slide-in
  // transition fires instead of popping instantly. Uses double rAF + a tiny
  // setTimeout fallback to ensure it fires even in background tabs.
  useEffect(() => {
    let cancelled = false;
    const flip = () => { if (!cancelled) setItemMounted(true); };
    const raf1 = requestAnimationFrame(() => requestAnimationFrame(flip));
    const fallback = setTimeout(flip, 16);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      clearTimeout(fallback);
    };
  }, []);

  // Measure card height and report upward. Use a ref to always point at the
  // latest `onMeasured` callback so the ResizeObserver is only created once
  // (avoids a render ↔ observer-fire loop that would blank the page).
  const onMeasuredRef = useRef(onMeasured);
  onMeasuredRef.current = onMeasured;
  useLayoutEffect(() => {
    if (!cardRef.current) return;
    const el = cardRef.current;
    const report = () => onMeasuredRef.current(el.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-dismiss — paused while the stack is hovered
  useEffect(() => {
    if ((toast.duration ?? 0) <= 0) return;
    if (paused) {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        remainingRef.current -= Date.now() - startRef.current;
      }
      return;
    }
    startRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      setLeaving(true);
      setTimeout(onDismiss, 240);
    }, Math.max(0, remainingRef.current));
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [paused, toast.duration, onDismiss]);

  const handleActionClick = () => {
    toast.action?.onClick();
    setLeaving(true);
    setTimeout(onDismiss, 240);
  };

  return (
    <ToastItem
      $rank={rank}
      $expanded={expanded}
      $leaving={leaving}
      $mounted={itemMounted}
      $expandedTop={expandedTop}
      $frontHeight={frontHeight}
    >
      <Card ref={cardRef} role="status" aria-live="polite">
        <TextCol>
          <Title>{toast.title}</Title>
          {toast.description && <Description>{toast.description}</Description>}
        </TextCol>
        {toast.action && (
          <ActionBtn onClick={handleActionClick}>{toast.action.label}</ActionBtn>
        )}
      </Card>
    </ToastItem>
  );
};

/* ──────────────────────────────────────────────────────────────────────
   TOASTER
   ────────────────────────────────────────────────────────────────────── */

export const Toaster: React.FC = () => {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const stackRef = useRef<HTMLOListElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Reconcile expanded with the DOM's actual :hover state whenever the toast
  // list changes. mouseenter/mouseleave only fire on cursor MOVEMENT — they
  // don't re-evaluate when a new toast pops in or out under a stationary
  // cursor, which can leave `expanded` stuck true (toasts spread out) when
  // the user is no longer hovering. :hover is always accurate.
  useEffect(() => {
    if (!stackRef.current) return;
    const isHovered = stackRef.current.matches(':hover');
    setExpanded((prev) => (prev === isHovered ? prev : isHovered));
  }, [toasts.length]);

  // Newest first. Hard cap at MAX_VISIBLE in both collapsed and expanded modes.
  const visible = useMemo(() => {
    const newestFirst = [...toasts].sort((a, b) => b.createdAt - a.createdAt);
    return newestFirst.slice(0, MAX_VISIBLE);
  }, [toasts]);

  const heightOf = (id: string) => heights[id] ?? DEFAULT_HEIGHT;
  const frontHeight = visible.length > 0 ? heightOf(visible[0].id) : DEFAULT_HEIGHT;

  // Cumulative expanded tops — rank i sits below all earlier ranks + gap.
  const expandedTops = useMemo(() => {
    const tops: number[] = [];
    let cursor = 0;
    for (let i = 0; i < visible.length; i++) {
      tops.push(cursor);
      cursor += heightOf(visible[i].id) + EXPANDED_GAP;
    }
    return tops;
  }, [visible, heights]);

  // Stack container height matches front card in collapsed mode (back cards
  // overlay it), or the full cumulative in expanded mode.
  const stackHeight = useMemo(() => {
    if (visible.length === 0) return 0;
    if (expanded) {
      let total = 0;
      for (let i = 0; i < visible.length; i++) {
        total += heightOf(visible[i].id) + (i < visible.length - 1 ? EXPANDED_GAP : 0);
      }
      return total;
    }
    // Collapsed: front card plus the peek offsets for up to MAX_VISIBLE - 1 back cards.
    const extraPeek = Math.min(visible.length - 1, MAX_VISIBLE - 1) * STACK_OFFSET;
    return frontHeight + extraPeek;
  }, [visible, heights, expanded, frontHeight]);

  if (!mounted || visible.length === 0) return null;

  return createPortal(
    <Viewport
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <Stack ref={stackRef} $height={stackHeight}>
        {visible.map((t, i) => (
          <ToastEntry
            key={t.id}
            toast={t}
            rank={i}
            expanded={expanded}
            paused={expanded}
            expandedTop={expandedTops[i] ?? 0}
            frontHeight={frontHeight}
            onDismiss={() => dismiss(t.id)}
            onMeasured={(h) => {
              setHeights((prev) => (prev[t.id] === h ? prev : { ...prev, [t.id]: h }));
            }}
          />
        ))}
      </Stack>
    </Viewport>,
    document.body,
  );
};

export default Toaster;
