"use client";

import { useEffect } from "react";
import { useAppearanceStore, resolveTheme } from "@/lib/store/appearance-store";
import { useSettingsStore } from "@/lib/store/settings-store";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useUIStore } from "@/lib/store/ui-store";
import { applyTheme } from "@/lib/themes/apply";

/**
 * Applies the active theme (+ overrides + wallpaper) to <html> whenever
 * any appearance-related state changes. Also propagates the current
 * workspace's animation override.
 */
export function ThemeEffect() {
  const themeId = useAppearanceStore((s) => s.activeThemeId);
  const customThemes = useAppearanceStore((s) => s.customThemes);
  const wallpaper = useAppearanceStore((s) => s.wallpaper);
  const appearanceHydrated = useAppearanceStore((s) => s.hydrated);

  const settings = useSettingsStore();
  const settingsHydrated = useSettingsStore((s) => s.hydrated);

  const activeWorkspaceId = useWorkspaceStore((s) => s.activeId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const wsHydrated = useWorkspaceStore((s) => s.hydrated);
  const focusLayout = useUIStore((s) => s.focusLayout);

  const wsAnimation =
    workspaces.find((w) => w.id === activeWorkspaceId)?.animationOverride ?? null;

  useEffect(() => {
    if (!appearanceHydrated || !settingsHydrated) return;
    const theme = resolveTheme(themeId, customThemes);
    const systemReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    applyTheme(theme, {
      animationsEnabled: settings.animationsEnabled,
      animationIntensity: settings.animationIntensity,
      animationSpeed: settings.animationSpeed,
      animation: wsAnimation,
      font: settings.font,
      reducedMotion: settings.reducedMotion || !!systemReduced,
      widgetAlpha: settings.widgetAlphaOverride,
    }, wallpaper);
  }, [
    themeId,
    customThemes,
    wallpaper,
    appearanceHydrated,
    settingsHydrated,
    settings.animationsEnabled,
    settings.animationIntensity,
    settings.animationSpeed,
    settings.font,
    settings.reducedMotion,
    settings.widgetAlphaOverride,
    wsAnimation,
    wsHydrated,
    focusLayout,
  ]);

  return null;
}
