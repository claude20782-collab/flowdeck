"use client";

import { useEffect, useState, useRef, useSyncExternalStore } from "react";

/** Re-rendering clock. Timestamp-based (cheap, accurate). */
export function useNow(intervalMs = 1000, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active]);
  return now;
}

/** true after first client render (SSR-safe gating, no effects). */
export function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

/** Track an (options object of) media query. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Click-outside handler for popover-ish components. */
export function useClickOutside<T extends HTMLElement>(
  onOutside: () => void
): React.RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [onOutside]);
  return ref;
}

/** Hide-the-cursor after N ms of no movement (immersive focus). */
export function useCursorIdle(timeoutMs = 3000): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const reset = () => {
      setHidden(false);
      clearTimeout(t);
      t = setTimeout(() => setHidden(true), timeoutMs);
    };
    reset();
    const events: (keyof WindowEventMap)[] = ["pointermove", "pointerdown", "keydown"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(t);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [timeoutMs]);
  return hidden;
}
