"use client";

import { useState } from "react";
import type { KeyboardEvent } from "react";
import { AudioLines, Music4, Pause, Play, Plus, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PanelActionButton, PanelSection, PanelShell } from "./panel-shell";
import {
  useSoundStore,
  SOUND_IDS,
  BUILTIN_PRESETS,
  type SoundId,
  type SoundPreset,
} from "@/lib/store/sound-store";
import { soundscape } from "@/lib/audio/engine";
import { cn } from "@/lib/utils";

const SOUND_META: Record<SoundId, { label: string; icon: string }> = {
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

/* ═══════════════════════════ subcomponents ═══════════════════════════ */

/** Decorative 3-bar "live" indicator for active channels. */
function EqBars() {
  return (
    <span className="flex shrink-0 items-end gap-[2px]" aria-hidden="true">
      {[5, 9, 7].map((h, i) => (
        <span
          key={i}
          className="fd-pulse w-[3px] rounded-full"
          style={{
            height: h,
            background: "var(--accent)",
            animationDelay: `${i * 350}ms`,
            animationDuration: `${1200 + i * 250}ms`,
          }}
        />
      ))}
    </span>
  );
}

function PresetPill({
  preset,
  active,
  onApply,
  onDelete,
}: {
  preset: SoundPreset;
  active: boolean;
  onApply: () => void;
  onDelete?: () => void;
}) {
  return (
    <span className="relative shrink-0">
      <button
        type="button"
        onClick={onApply}
        aria-pressed={active}
        className={cn(
          "press rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
          active ? "text-[var(--accent-fg)]" : "text-muted-c hover:text-[var(--text)]"
        )}
        style={
          active
            ? { background: "var(--accent)" }
            : { background: "color-mix(in srgb, var(--text) 7%, transparent)" }
        }
      >
        {preset.name}
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete preset “${preset.name}”`}
          className="press absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-muted-c transition-colors hover:text-[var(--negative)]"
          style={{ background: "var(--card-solid)", border: "1px solid var(--border-c)" }}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

function ChannelRow({
  id,
  volume,
  muted,
  onToggle,
  onVolume,
  onMute,
}: {
  id: SoundId;
  volume: number;
  muted: boolean;
  onToggle: () => void;
  onVolume: (v: number) => void;
  onMute: () => void;
}) {
  const meta = SOUND_META[id];
  const on = volume > 0;
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors sm:gap-3 sm:px-2"
      style={{ background: on ? "color-mix(in srgb, var(--accent) 6%, transparent)" : "transparent" }}
    >
      {/* power toggle — the icon area switches the channel on/off */}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        aria-label={`${meta.label} ${on ? "on" : "off"}`}
        title={on ? `Turn ${meta.label} off` : `Turn ${meta.label} on`}
        className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
        style={{
          background: on
            ? "color-mix(in srgb, var(--accent) 16%, transparent)"
            : "color-mix(in srgb, var(--text) 6%, transparent)",
          border: on
            ? "1px solid color-mix(in srgb, var(--accent) 30%, transparent)"
            : "1px solid transparent",
        }}
      >
        <span className="text-base leading-none" aria-hidden="true">
          {meta.icon}
        </span>
      </button>

      <span
        className={cn(
          "flex w-20 shrink-0 items-center gap-1.5 text-sm sm:w-24",
          on ? "" : "text-muted-c"
        )}
      >
        <span className="truncate">{meta.label}</span>
        {on && <EqBars />}
      </span>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(volume * 100)}
        disabled={!on}
        onChange={(e) => onVolume(Number(e.target.value) / 100)}
        className="fd-range min-w-0 flex-1 disabled:opacity-40"
        aria-label={`${meta.label} volume`}
      />

      <button
        type="button"
        onClick={onMute}
        aria-pressed={muted}
        aria-label={muted ? `Unmute ${meta.label}` : `Mute ${meta.label}`}
        className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-c transition-colors hover:text-[var(--text)]"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
    </div>
  );
}

/* ═══════════════════════════ panel ═══════════════════════════ */

export function SoundPanel() {
  const playing = useSoundStore((s) => s.playing);
  const master = useSoundStore((s) => s.master);
  const channels = useSoundStore((s) => s.channels);
  const userPresets = useSoundStore((s) => s.presets);
  const activePresetId = useSoundStore((s) => s.activePresetId);
  const setPlaying = useSoundStore((s) => s.setPlaying);
  const setMaster = useSoundStore((s) => s.setMaster);
  const setChannel = useSoundStore((s) => s.setChannel);
  const toggleMute = useSoundStore((s) => s.toggleMute);
  const clearAll = useSoundStore((s) => s.clearAll);
  const applyPreset = useSoundStore((s) => s.applyPreset);
  const savePreset = useSoundStore((s) => s.savePreset);
  const deletePreset = useSoundStore((s) => s.deletePreset);

  /** per-channel memory for the power toggle (volume to restore), default 0.5 */
  const [lastVolumes, setLastVolumes] = useState<Partial<Record<SoundId, number>>>({});
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState("");

  const activeCount = SOUND_IDS.filter(
    (id) => (channels[id]?.volume ?? 0) > 0 && !(channels[id]?.muted ?? false)
  ).length;

  /* Every handler primes the AudioContext from the user gesture BEFORE
     touching state — AudioSync then mirrors the store into the engine. */

  const toggleMaster = () => {
    soundscape.ensureContext();
    if (!playing && activeCount === 0) {
      applyPreset("preset-rainy-study"); // nothing queued — start with a default scene
      return;
    }
    setPlaying(!playing);
  };

  const handleMasterVolume = (v: number) => {
    soundscape.ensureContext();
    setMaster(v);
  };

  const handlePreset = (id: string) => {
    soundscape.ensureContext();
    applyPreset(id);
  };

  const toggleChannel = (id: SoundId) => {
    soundscape.ensureContext();
    const volume = channels[id]?.volume ?? 0;
    if (volume > 0) {
      setLastVolumes((prev) => ({ ...prev, [id]: volume }));
      setChannel(id, 0);
    } else {
      if (!playing) setPlaying(true);
      const restore = lastVolumes[id] ?? 0.5;
      setChannel(id, restore > 0 ? restore : 0.5);
    }
  };

  const handleVolume = (id: SoundId, v: number) => {
    soundscape.ensureContext();
    if (!playing && v > 0) setPlaying(true);
    setChannel(id, v);
  };

  const handleMute = (id: SoundId) => {
    soundscape.ensureContext();
    toggleMute(id);
  };

  const handleClearAll = () => {
    soundscape.ensureContext();
    clearAll();
    toast.success("All channels muted");
  };

  const openSaveDialog = () => {
    if (activeCount === 0) {
      toast.error("Nothing to save — slide a channel up first");
      return;
    }
    setPresetName("");
    setSaveOpen(true);
  };

  const confirmSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    savePreset(name);
    setSaveOpen(false);
    setPresetName("");
    toast.success(`Preset “${name}” saved`);
  };

  const onNameKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmSavePreset();
    }
  };

  return (
    <PanelShell
      title="Soundscape"
      subtitle={`${activeCount} channel${activeCount === 1 ? "" : "s"} active · synthesized live — no downloads`}
      icon={<Music4 className="h-4 w-4" />}
      actions={
        <>
          <button
            type="button"
            onClick={toggleMaster}
            aria-label={playing ? "Pause soundscape" : "Play soundscape"}
            className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--accent-fg)]"
            style={{
              background: "var(--accent)",
              boxShadow: "0 4px 18px color-mix(in srgb, var(--accent) 35%, transparent)",
            }}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(master * 100)}
            onChange={(e) => handleMasterVolume(Number(e.target.value) / 100)}
            className="fd-range w-24 sm:w-28"
            aria-label="Master volume"
          />
        </>
      }
    >
      {/* presets */}
      <PanelSection>Presets</PanelSection>
      <div
        className="fade-r no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
        role="group"
        aria-label="Sound presets"
      >
        {BUILTIN_PRESETS.map((p) => (
          <PresetPill
            key={p.id}
            preset={p}
            active={activePresetId === p.id}
            onApply={() => handlePreset(p.id)}
          />
        ))}
        {userPresets.map((p) => (
          <PresetPill
            key={p.id}
            preset={p}
            active={activePresetId === p.id}
            onApply={() => handlePreset(p.id)}
            onDelete={() => {
              deletePreset(p.id);
              toast.success(`Preset “${p.name}” deleted`);
            }}
          />
        ))}
        <button
          type="button"
          onClick={openSaveDialog}
          aria-label="Save current mix as preset"
          className="press flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-muted-c transition-colors hover:text-[var(--text)]"
          style={{ border: "1px dashed var(--border-c)" }}
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          Save mix as preset
        </button>
      </div>

      {/* empty-ish hint */}
      {activeCount === 0 && (
        <p
          className="mt-3 rounded-lg px-3 py-2.5 text-center text-xs text-muted-c"
          style={{ background: "color-mix(in srgb, var(--text) 5%, transparent)" }}
        >
          Pick a preset or slide a channel up.
        </p>
      )}

      {/* channels */}
      <div className="mt-5">
        <PanelSection
          action={
            <PanelActionButton variant="ghost" onClick={handleClearAll} label="Mute everything">
              Mute everything
            </PanelActionButton>
          }
        >
          Channels
        </PanelSection>
        <div className="widget fd-scroll max-h-[60vh] p-1.5 sm:p-2">
          {SOUND_IDS.map((id) => (
            <ChannelRow
              key={id}
              id={id}
              volume={channels[id]?.volume ?? 0}
              muted={channels[id]?.muted ?? false}
              onToggle={() => toggleChannel(id)}
              onVolume={(v) => handleVolume(id, v)}
              onMute={() => handleMute(id)}
            />
          ))}
        </div>
      </div>

      {/* footnote */}
      <p className="mt-4 flex items-start justify-center gap-1.5 px-2 text-center text-[11px] leading-relaxed text-muted-c">
        <AudioLines className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>All sounds are procedurally synthesized in your browser — nothing is downloaded or streamed.</span>
      </p>

      {/* save-preset dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save mix as preset</DialogTitle>
            <DialogDescription>
              Name the current channel mix — it joins the built-in presets on this device.
            </DialogDescription>
          </DialogHeader>
          <input
            autoFocus
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={onNameKeyDown}
            placeholder="e.g. Thunder focus"
            aria-label="Preset name"
            maxLength={40}
            className="h-9 w-full rounded-lg border hairline bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-c focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
          />
          <DialogFooter>
            <PanelActionButton variant="ghost" onClick={() => setSaveOpen(false)}>
              Cancel
            </PanelActionButton>
            <PanelActionButton onClick={confirmSavePreset} disabled={!presetName.trim()}>
              Save preset
            </PanelActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PanelShell>
  );
}
