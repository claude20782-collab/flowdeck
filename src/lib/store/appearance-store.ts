"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { idbPersistConfig } from "./config";
import type { ThemeDefinition, WallpaperSettings } from "@/lib/themes/types";
import { DEFAULT_THEME_ID, getBuiltInTheme, BUILT_IN_THEMES } from "@/lib/themes/presets";

/* Appearance: active theme, custom themes, wallpaper.
 * Stored in IndexedDB (custom themes + wallpaper data-urls can grow). */

interface AppearanceStore {
  activeThemeId: string;
  customThemes: ThemeDefinition[];
  wallpaper: WallpaperSettings | null;
  hydrated: boolean;
  _setHydrated: () => void;
  setTheme: (id: string) => void;
  saveCustomTheme: (def: ThemeDefinition) => void;
  deleteCustomTheme: (id: string) => void;
  duplicateTheme: (sourceId: string, newName: string) => ThemeDefinition | null;
  setWallpaper: (wp: WallpaperSettings | null) => void;
  resetAll: () => void;
}

export const useAppearanceStore = create<AppearanceStore>()(
  persist(
    (set, get) => ({
      activeThemeId: DEFAULT_THEME_ID,
      customThemes: [],
      wallpaper: null,
      hydrated: false,
      _setHydrated: () => set({ hydrated: true }),
      setTheme: (id) => set({ activeThemeId: id }),
      saveCustomTheme: (def) =>
        set((s) => {
          const existing = s.customThemes.findIndex((t) => t.id === def.id);
          if (existing >= 0) {
            const next = [...s.customThemes];
            next[existing] = def;
            return { customThemes: next };
          }
          return { customThemes: [...s.customThemes, def] };
        }),
      deleteCustomTheme: (id) =>
        set((s) => ({
          customThemes: s.customThemes.filter((t) => t.id !== id),
          activeThemeId: s.activeThemeId === id ? DEFAULT_THEME_ID : s.activeThemeId,
        })),
      duplicateTheme: (sourceId, newName) => {
        const src = getBuiltInTheme(sourceId) ?? get().customThemes.find((t) => t.id === sourceId);
        if (!src) return null;
        const copy: ThemeDefinition = {
          ...structuredClone(src),
          id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          name: newName,
          custom: true,
          createdAt: Date.now(),
        };
        set((s) => ({ customThemes: [...s.customThemes, copy] }));
        return copy;
      },
      setWallpaper: (wp) => set({ wallpaper: wp }),
      resetAll: () => set({ activeThemeId: DEFAULT_THEME_ID, customThemes: [], wallpaper: null }),
    }),
    idbPersistConfig<AppearanceStore>("flowdeck-appearance")
  )
);

/** Resolve the active theme definition (built-in or custom), with fallback. */
export function resolveTheme(id: string, custom: ThemeDefinition[]): ThemeDefinition {
  return getBuiltInTheme(id) ?? custom.find((t) => t.id === id) ?? BUILT_IN_THEMES[0];
}
