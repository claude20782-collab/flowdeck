"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { lsPersistConfig } from "./config";
import type { TimerMode } from "@/lib/types";

export interface TimerSettings {
  focusMin: number;
  shortMin: number;
  longMin: number;
  cycles: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  completionSound: "chime" | "bell" | "pulse" | "none";
  notify: boolean;
  vibrate: boolean;
  keepAwake: boolean;
  confirmSkip: boolean;
}

export interface AppSettings {
  /* appearance */
  animationsEnabled: boolean;
  animationIntensity: number; // 0..1
  animationSpeed: number; // 0.25..2
  reducedMotion: boolean;
  font: "sans" | "serif" | "mono" | "rounded";
  widgetAlphaOverride: number | null; // null = theme default
  /* clock */
  clock24h: boolean;
  showSeconds: boolean;
  showDate: boolean;
  /* dashboard */
  compactWidgets: boolean;
  /* tasks */
  tasksSort: "manual" | "due" | "priority" | "created";
  tasksShowCompleted: boolean;
  /* general */
  weekStart: 0 | 1;
  name: string;
  /* timer */
  timer: TimerSettings;
  defaultTimerMode: TimerMode;
  /* PWA hints */
  installHintDismissed: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  animationsEnabled: true,
  animationIntensity: 0.6,
  animationSpeed: 0.6,
  reducedMotion: false,
  font: "sans",
  widgetAlphaOverride: null,
  clock24h: true,
  showSeconds: true,
  showDate: true,
  compactWidgets: false,
  tasksSort: "manual",
  tasksShowCompleted: false,
  weekStart: 1,
  name: "",
  timer: {
    focusMin: 25,
    shortMin: 5,
    longMin: 15,
    cycles: 4,
    autoStartBreaks: true,
    autoStartFocus: false,
    completionSound: "chime",
    notify: true,
    vibrate: true,
    keepAwake: false,
    confirmSkip: false,
  },
  defaultTimerMode: "pomodoro",
  installHintDismissed: false,
};

interface SettingsStore extends AppSettings {
  hydrated: boolean;
  _setHydrated: () => void;
  update: (patch: Partial<AppSettings>) => void;
  updateTimer: (patch: Partial<TimerSettings>) => void;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      hydrated: false,
      _setHydrated: () => set({ hydrated: true }),
      update: (patch) => set(patch),
      updateTimer: (patch) => set((s) => ({ timer: { ...s.timer, ...patch } })),
      resetSettings: () => set({ ...DEFAULT_SETTINGS }),
    }),
    lsPersistConfig<SettingsStore>("flowdeck-settings")
  )
);
