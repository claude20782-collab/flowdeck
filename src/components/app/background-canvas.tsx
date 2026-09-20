"use client";

import { useEffect, useRef } from "react";
import { RENDERERS, TRAIL_RENDERERS } from "@/lib/backgrounds/renderers";
import { useSettingsStore } from "@/lib/store/settings-store";
import { useUIStore } from "@/lib/store/ui-store";

/**
 * Full-viewport canvas running the active ambient animation renderer.
 * - DPR aware, resize aware, tab-visibility aware
 * - respects reduced motion + master animation toggle
 * - theme colors read from CSS variables so animations re-theme live
 */
export function BackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const lastFrame = useRef<number>(0);
  const visible = useRef(true);

  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const focusLayout = useUIStore((s) => s.focusLayout);
  const paletteOpen = useUIStore((s) => s.paletteOpen);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const systemReduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (systemReduced || !animationsEnabled || reducedMotion) return;

    let rendererId = "none";
    let intensity = 0.5;
    let speed = 1;
    let colors = { accent: "#e8a849", accent2: "#c46a4e", text: "#e7e9ee", bg: "#0b0d12" };

    const readConfig = () => {
      const cs = getComputedStyle(document.documentElement);
      const id = (cs.getPropertyValue("--anim-id") || "none").trim();
      if (id !== rendererId) {
        rendererId = id;
        initRenderer();
      }
      intensity = parseFloat(cs.getPropertyValue("--anim-intensity")) || 0.5;
      speed = parseFloat(cs.getPropertyValue("--anim-speed")) || 1;
      colors = {
        accent: (cs.getPropertyValue("--accent") || "").trim() || colors.accent,
        accent2: (cs.getPropertyValue("--accent-2") || "").trim() || colors.accent2,
        text: (cs.getPropertyValue("--text") || "").trim() || colors.text,
        bg: (cs.getPropertyValue("--app-bg") || "").trim() || colors.bg,
      };
    };

    const sizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initRenderer();
    };

    const initRenderer = () => {
      const renderer = RENDERERS[rendererId];
      if (!renderer) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.init(ctx, canvas.width / dpr, canvas.height / dpr, { intensity, speed, colors });
    };

    const hexToRgb = (hex: string): [number, number, number] => {
      const m = hex.replace("#", "");
      if (m.length === 3) {
        return [parseInt(m[0] + m[0], 16), parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16)];
      }
      if (m.length >= 6) {
        return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
      }
      return [11, 13, 18];
    };

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      const dt = Math.min(64, lastFrame.current ? now - lastFrame.current : 16.7);
      lastFrame.current = now;
      if (!visible.current) return;

      const renderer = RENDERERS[rendererId];
      if (!renderer) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      if (TRAIL_RENDERERS.has(rendererId)) {
        /* trail renderers manage persistence: fade previous frame */
        const [r, g, b] = hexToRgb(colors.bg);
        ctx.fillStyle = `rgba(${r},${g},${b},0.2)`;
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
      try {
        renderer.frame(ctx, dt, w, h, { intensity, speed, colors });
      } catch {
        /* a rendering error must never kill the app */
      }
    };

    readConfig();
    sizeCanvas();

    const ro = new ResizeObserver(sizeCanvas);
    ro.observe(document.documentElement);

    const themeObserver = new MutationObserver(() => readConfig());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });

    const onVisibility = () => {
      visible.current = document.visibilityState === "visible";
      if (visible.current) lastFrame.current = 0;
    };
    document.addEventListener("visibilitychange", onVisibility);

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [animationsEnabled, reducedMotion, focusLayout, paletteOpen]);

  if (!animationsEnabled || reducedMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
      style={{ opacity: focusLayout ? 0.9 : 1, transition: "opacity 0.6s ease" }}
    />
  );
}
