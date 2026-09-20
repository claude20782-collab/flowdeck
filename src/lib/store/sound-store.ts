"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { idbPersistConfig } from "./config";
import { uid } from "@/lib/utils";

/* ============================================================
 * Soundscape mixer state (audio synthesis lives in
 * lib/audio/engine.ts — this is only persisted state).
 * ============================================================ */

export const SOUND_IDS = [
  "rain",
  "heavy-rain",
  "thunder",
  "forest",
  "wind",
  "ocean",
  "cafe",
  "fireplace",
  "white-noise",
  "brown-noise",
  "pink-noise",
] as const;

export type SoundId = (typeof SOUND_IDS)[number];

export interface SoundChannelState {
  volume: number; // 0..1
  muted: boolean;
}

export interface SoundPreset {
  id: string;
  name: string;
  channels: Partial<Record<SoundId, number>>; // volume per sound
  master: number;
  builtin?: boolean;
}

export const BUILTIN_PRESETS: SoundPreset[] = [
  {
    id: "preset-rainy-study",
    name: "Rainy Study",
    builtin: true,
    master: 0.8,
    channels: { rain: 0.55, thunder: 0.25 },
  },
  {
    id: "preset-deep-work",
    name: "Deep Work",
    builtin: true,
    master: 0.8,
    channels: { "brown-noise": 0.5 },
  },
  {
    id: "preset-night-study",
    name: "Night Study",
    builtin: true,
    master: 0.75,
    channels: { rain: 0.35, fireplace: 0.3, wind: 0.2 },
  },
  {
    id: "preset-calm",
    name: "Calm",
    builtin: true,
    master: 0.7,
    channels: { ocean: 0.45, wind: 0.2 },
  },
  {
    id: "preset-cafe",
    name: "Café",
    builtin: true,
    master: 0.8,
    channels: { cafe: 0.5, rain: 0.2 },
  },
];

interface SoundStore {
  master: number;
  playing: boolean;
  channels: Record<string, SoundChannelState>;
  presets: SoundPreset[];
  activePresetId: string | null;
  hydrated: boolean;
  _setHydrated: () => void;
  setMaster: (v: number) => void;
  setPlaying: (v: boolean) => void;
  setChannel: (id: SoundId, volume: number) => void;
  toggleMute: (id: SoundId) => void;
  clearAll: () => void;
  applyPreset: (presetId: string) => void;
  savePreset: (name: string) => void;
  deletePreset: (id: string) => void;
}

function defaultChannels(): Record<string, SoundChannelState> {
  const rec: Record<string, SoundChannelState> = {};
  for (const id of SOUND_IDS) rec[id] = { volume: 0, muted: false };
  return rec;
}

export const useSoundStore = create<SoundStore>()(
  persist(
    (set, get) => ({
      master: 0.8,
      playing: false,
      channels: defaultChannels(),
      presets: [],
      activePresetId: null,
      hydrated: false,
      _setHydrated: () => set({ hydrated: true }),

      setMaster: (v) => set({ master: Math.max(0, Math.min(1, v)) }),
      setPlaying: (v) => set({ playing: v }),
      setChannel: (id, volume) =>
        set((s) => ({
          channels: { ...s.channels, [id]: { volume: Math.max(0, Math.min(1, volume)), muted: false } },
          activePresetId: null,
        })),
      toggleMute: (id) =>
        set((s) => ({
          channels: {
            ...s.channels,
            [id]: { ...(s.channels[id] ?? { volume: 0.5 }), muted: !(s.channels[id]?.muted ?? false) },
          },
        })),
      clearAll: () =>
        set((s) => ({
          channels: Object.fromEntries(Object.entries(s.channels).map(([k, v]) => [k, { ...v, volume: 0, muted: false }])),
          activePresetId: null,
        })),

      applyPreset: (presetId) => {
        const preset =
          BUILTIN_PRESETS.find((p) => p.id === presetId) ?? get().presets.find((p) => p.id === presetId);
        if (!preset) return;
        const channels = defaultChannels();
        for (const [id, vol] of Object.entries(preset.channels)) {
          channels[id] = { volume: vol ?? 0, muted: false };
        }
        set({ channels, master: preset.master, activePresetId: presetId, playing: true });
      },

      savePreset: (name) => {
        const { channels, master } = get();
        const active: Partial<Record<SoundId, number>> = {};
        for (const [id, st] of Object.entries(channels)) {
          if (st.volume > 0 && !st.muted) active[id as SoundId] = st.volume;
        }
        const preset: SoundPreset = { id: uid(), name, channels: active, master };
        set((s) => ({ presets: [...s.presets, preset], activePresetId: preset.id }));
      },

      deletePreset: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),
    }),
    idbPersistConfig<SoundStore>("flowdeck-sound")
  )
);
