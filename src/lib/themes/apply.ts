import type { ThemeDefinition, WallpaperSettings } from "./types";
import { mix, tintOver, withAlpha, round, FONT_STACKS } from "./color";

export interface AppearanceOverrides {
  animationsEnabled?: boolean;
  animationIntensity?: number; // 0..1
  animationSpeed?: number; // 0.25..2
  animation?: string | null; // null = theme default
  font?: string | null;
  reducedMotion?: boolean;
  widgetAlpha?: number | null; // null = theme default
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/**
 * Writes theme + overrides + wallpaper to CSS custom properties on <html>.
 * All derived colors (cards, popovers, muted surfaces) are computed here so
 * the rest of the app can consume flat, final variables.
 */
export function applyTheme(
  theme: ThemeDefinition,
  overrides: AppearanceOverrides = {},
  wallpaper?: WallpaperSettings | null
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  const c = theme.colors;
  const e = theme.effects;

  const widgetAlpha = overrides.widgetAlpha != null ? clamp01(overrides.widgetAlpha) : e.widgetAlpha;
  const radius = e.radius;
  const blur = e.blur;

  /* --- background + wallpaper --- */
  let bg = c.bg;
  let bgImage = c.bgImage || "none";
  if (wallpaper && wallpaper.type !== "none" && wallpaper.value) {
    if (wallpaper.type === "solid") {
      bg = wallpaper.value;
      bgImage = "none";
    } else if (wallpaper.type === "gradient") {
      bg = theme.dark ? "#0a0a0c" : "#f2f2f4";
      bgImage = wallpaper.value;
    } else if (wallpaper.type === "image") {
      bg = theme.dark ? "#0a0a0c" : "#f2f2f4";
      const dim = wallpaper.dim ?? 0.5;
      const wBlur = wallpaper.blur ?? 0;
      bgImage = [
        `linear-gradient(rgba(0,0,0,${theme.dark ? dim * 0.9 : dim * 0.55}), rgba(0,0,0,${
          theme.dark ? dim * 0.9 + 0.12 : dim * 0.55 + 0.05
        }))`,
        `url("${wallpaper.value}")`,
      ].join(", ");
      if (wBlur > 0) {
        // Approximate blur by scaling + blurring the wallpaper layer
        root.setProperty("--wallpaper-filter", `blur(${wBlur}px)`);
      } else {
        root.removeProperty("--wallpaper-filter");
      }
    }
  } else {
    root.removeProperty("--wallpaper-filter");
  }

  root.setProperty("--app-bg", bg);
  root.setProperty("--app-bg-image", bgImage);

  /* --- text --- */
  root.setProperty("--text", c.text);
  root.setProperty("--text-muted", c.textMuted);

  /* --- accents --- */
  root.setProperty("--accent", c.accent);
  root.setProperty("--accent-fg", c.accentFg);
  root.setProperty("--accent-2", c.accent2);
  root.setProperty("--positive", c.positive);
  root.setProperty("--negative", c.negative);
  root.setProperty("--warning", c.warning);

  /* --- borders --- */
  root.setProperty("--border-c", c.border);

  /* --- surfaces (computed final values) --- */
  root.setProperty("--card-solid", c.surface);
  root.setProperty("--card", withAlpha(c.surface, widgetAlpha));
  root.setProperty("--popover", withAlpha(c.surface, Math.min(1, widgetAlpha + 0.22)));
  root.setProperty("--secondary", tintOver(c.surface, c.text, 0.05));
  root.setProperty("--muted", tintOver(c.surface, c.text, 0.04));

  /* --- geometry + depth --- */
  root.setProperty("--radius", `${radius}px`);
  root.setProperty("--app-radius", `${radius}px`);
  root.setProperty("--blur", `${blur}px`);
  const shadowBase = theme.dark ? "0, 0, 0" : "90, 96, 110";
  root.setProperty("--shadow-1", `0 1px 2px rgba(${shadowBase}, ${theme.dark ? 0.28 : 0.1})`);
  root.setProperty("--shadow-2", `0 10px 34px rgba(${shadowBase}, ${theme.dark ? 0.38 : 0.14})`);
  root.setProperty("--shadow-3", `0 24px 70px rgba(${shadowBase}, ${theme.dark ? 0.5 : 0.2})`);
  root.setProperty("--grain-opacity", String(e.grain ?? 0));

  /* --- charts --- */
  root.setProperty("--chart-1", c.accent);
  root.setProperty("--chart-2", c.accent2);
  root.setProperty("--chart-3", c.positive);
  root.setProperty("--chart-4", c.warning);
  root.setProperty("--chart-5", mix(c.textMuted, c.text, 0.35));

  /* --- font --- */
  const fontKey = overrides.font || e.font || "sans";
  root.setProperty("--font-app", FONT_STACKS[fontKey] || FONT_STACKS.sans);

  /* --- color-scheme for form controls --- */
  root.setProperty("color-scheme", theme.dark ? "dark" : "light");

  /* --- animation meta (consumed by BackgroundCanvas) --- */
  const animEnabled = overrides.animationsEnabled !== false && !overrides.reducedMotion;
  const anim =
    overrides.animation === null || overrides.animation === undefined
      ? e.animation
      : (overrides.animation as string);
  const animId = animEnabled ? anim : "none";
  root.setProperty("--anim-id", animId);
  root.setProperty("--anim-intensity", String(round(clamp01(overrides.animationIntensity ?? e.animationIntensity))));
  root.setProperty("--anim-speed", String(round(overrides.animationSpeed ?? e.animationSpeed, 2)));

  /* --- class hooks --- */
  document.documentElement.classList.toggle("dark", theme.dark);
  document.body?.classList?.toggle("fd-motion-off", !!overrides.reducedMotion);
}

export function readAnimationVars(): { id: string; intensity: number; speed: number } {
  if (typeof document === "undefined") return { id: "none", intensity: 0.5, speed: 1 };
  const cs = getComputedStyle(document.documentElement);
  return {
    id: cs.getPropertyValue("--anim-id").trim() || "none",
    intensity: parseFloat(cs.getPropertyValue("--anim-intensity")) || 0.5,
    speed: parseFloat(cs.getPropertyValue("--anim-speed")) || 1,
  };
}
