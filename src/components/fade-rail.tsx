"use client";

import { useCallback, useEffect, useRef, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Horizontal chip rail with scroll-aware edge fades.
 *
 * Replaces the static `.fade-r` mask: the right-edge fade only appears while
 * there is hidden content on the right, a left-edge fade appears once the user
 * has scrolled away from the start, and both disappear at the ends.
 *
 * The fade state is synced straight to the `data-fade` DOM attribute (consumed
 * by CSS in globals.css) — no React state, so scrolling never re-renders.
 * Initial value "start" (right-only fade) is also the no-JS/pre-measure default.
 */
export function FadeRail({ className, children, ...rest }: ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const overflow = el.scrollWidth - el.clientWidth;
    if (overflow <= 4) {
      el.dataset.fade = "end";
      return;
    }
    const atStart = el.scrollLeft <= 4;
    const atEnd = overflow - el.scrollLeft <= 4;
    el.dataset.fade = atStart ? "start" : atEnd ? "end" : "mid";
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [measure]);

  return (
    <div
      ref={ref}
      data-fade="start"
      className={cn("fade-r no-scrollbar overflow-x-auto", className)}
      {...rest}
    >
      {children}
    </div>
  );
}
