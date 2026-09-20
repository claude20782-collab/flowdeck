"use client";

import { WidgetCard } from "../widget-card";
import { FadeRail } from "@/components/fade-rail";
import { useSoundStore, SOUND_IDS, BUILTIN_PRESETS, type SoundId } from "@/lib/store/sound-store";
import { useUIStore } from "@/lib/store/ui-store";
import { soundscape } from "@/lib/audio/engine";
import { Music4, Play, Pause, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

const SOUND_META: Record<string, { label: string; icon: string }> = {
  rain: { label: "Rain", icon: "🌧" },
  "heavy-rain": { label: "Heavy rain", icon: "⛈" },
  thunder: { label: "Thunder", icon: "🌩" },
  forest: { label: "Forest", icon: "🌲" },
  wind: { label: "Wind", icon: "🌬" },
  ocean: { label: "Ocean", icon: "🌊" },
  cafe: { label: "Café", icon: "☕" },
  fireplace: { label: "Fireplace", icon: "🔥" },
  "white-noise": { label: "White noise", icon: "◻" },
  "brown-noise": { label: "Brown noise", icon: "🟤" },
  "pink-noise": { label: "Pink noise", icon: "🩷" },
};

export function SoundWidget() {
  const playing = useSoundStore((s) => s.playing);
  const master = useSoundStore((s) => s.master);
  const channels = useSoundStore((s) => s.channels);
  const setPlaying = useSoundStore((s) => s.setPlaying);
  const setMaster = useSoundStore((s) => s.setMaster);
  const setChannel = useSoundStore((s) => s.setChannel);
  const clearAll = useSoundStore((s) => s.clearAll);
  const applyPreset = useSoundStore((s) => s.applyPreset);
  const activePresetId = useSoundStore((s) => s.activePresetId);
  const openPanel = useUIStore((s) => s.openPanel);

  const activeIds = SOUND_IDS.filter((id) => (channels[id]?.volume ?? 0) > 0 && !channels[id]?.muted);

  const togglePlay = () => {
    if (!playing && activeIds.length === 0) {
      applyPreset("preset-rainy-study");
      return;
    }
    soundscape.ensureContext();
    setPlaying(!playing);
  };

  return (
    <WidgetCard
      title="Soundscape"
      icon={<Music4 className="h-4 w-4" />}
      actions={
        <button
          className="press flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-c transition-colors hover:text-[var(--text)]"
          onClick={() => openPanel("sound")}
          aria-label="Open sound mixer"
        >
          Mixer <ChevronRight className="h-3.5 w-3.5" />
        </button>
      }
    >
      {/* transport */}
      <div className="mb-3 flex items-center gap-3">
        <button
          className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--accent-fg)]"
          style={{
            background: "var(--accent)",
            boxShadow: `0 4px 18px color-mix(in srgb, var(--accent) 35%, transparent)`,
          }}
          onClick={togglePlay}
          aria-label={playing ? "Pause ambient sounds" : "Play ambient sounds"}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-[1px]" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-c" aria-hidden="true" />
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(master * 100)}
              onChange={(e) => setMaster(Number(e.target.value) / 100)}
              className="fd-range flex-1"
              aria-label="Master volume"
            />
          </div>
          <p className="mt-1 truncate text-[11px] text-muted-c">
            {playing
              ? activeIds.length > 0
                ? activeIds.map((id) => SOUND_META[id].label).join(" · ")
                : "No channels — pick a preset"
              : "Paused"}
          </p>
        </div>
        {activeIds.length > 0 && (
          <button
            className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-c hover:text-[var(--text)]"
            onClick={clearAll}
            aria-label="Clear all sounds"
            title="Clear"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* presets */}
      <FadeRail className="-mx-1 flex gap-1.5 px-1 pb-0.5" role="group" aria-label="Sound presets">
        {BUILTIN_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              soundscape.ensureContext();
              applyPreset(p.id);
            }}
            className={cn(
              "press shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              activePresetId === p.id ? "text-[var(--accent-fg)]" : "text-muted-c hover:text-[var(--text)]"
            )}
            style={
              activePresetId === p.id
                ? { background: "var(--accent)" }
                : { background: "color-mix(in srgb, var(--text) 7%, transparent)" }
            }
            aria-pressed={activePresetId === p.id}
          >
            {p.name}
          </button>
        ))}
      </FadeRail>

      {/* compact channel quick-toggles */}
      <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
        {SOUND_IDS.slice(0, 6).map((id) => {
          const ch = channels[id];
          const on = (ch?.volume ?? 0) > 0 && !ch?.muted;
          return (
            <button
              key={id}
              onClick={() => {
                soundscape.ensureContext();
                setChannel(id as SoundId, on ? 0 : 0.5);
              }}
              className={cn(
                "press flex flex-col items-center gap-0.5 rounded-lg py-2 text-[10px] font-medium transition-colors",
                on ? "text-[var(--text)]" : "text-muted-c"
              )}
              style={{
                background: on
                  ? "color-mix(in srgb, var(--accent) 16%, transparent)"
                  : "color-mix(in srgb, var(--text) 6%, transparent)",
                border: on ? "1px solid color-mix(in srgb, var(--accent) 30%, transparent)" : "1px solid transparent",
              }}
              aria-pressed={on}
              aria-label={`${SOUND_META[id].label} ${on ? "on" : "off"}`}
            >
              <span className="text-sm leading-none" aria-hidden="true">
                {SOUND_META[id].icon}
              </span>
              <span className="truncate">{SOUND_META[id].label}</span>
            </button>
          );
        })}
      </div>
    </WidgetCard>
  );
}
