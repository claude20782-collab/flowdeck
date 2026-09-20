"use client";

import { useEffect, useRef, useState } from "react";
import { WidgetCard } from "../widget-card";
import { cn, fmtDuration } from "@/lib/utils";
import { Music4, Play, Pause, SkipBack, SkipForward, Volume2, Plus, X, Trash2 } from "lucide-react";

/* ============================================================
 * Local music player — plays audio files the USER picks from
 * their device via the File API. Nothing is downloaded, streamed
 * or uploaded; playlist lives in memory for the session.
 * ============================================================ */

interface Track {
  id: string;
  name: string;
  url: string;
  duration?: number;
}

export function MusicWidget() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const activeTrack = tracks[current];

  /* keep audio element in sync */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeTrack) return;
    audio.src = activeTrack.url;
    /* element state resets; React progress syncs via onTimeUpdate */
    audio.currentTime = 0;
    if (playing) {
      audio.play().catch(() => setPlaying(false));
    }
  }, [current]);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const newTracks: Track[] = [];
    for (const file of Array.from(files)) {
      if (file.type.startsWith("audio/") || /\.(mp3|ogg|wav|m4a|flac|aac)$/i.test(file.name)) {
        newTracks.push({ id: `${file.name}-${file.size}-${file.lastModified}`, name: file.name.replace(/\.[^.]+$/, ""), url: URL.createObjectURL(file) });
      }
    }
    if (newTracks.length) setTracks((t) => [...t, ...newTracks]);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !activeTrack) {
      fileRef.current?.click();
      return;
    }
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const skip = (dir: -1 | 1) => {
    if (tracks.length === 0) return;
    setCurrent((c) => (c + dir + tracks.length) % tracks.length);
  };

  const removeTrack = (id: string) => {
    const idx = tracks.findIndex((t) => t.id === id);
    const removed = tracks[idx];
    const next = tracks.filter((t) => t.id !== id);
    setTracks(next);
    if (idx <= current) {
      setCurrent((c) => Math.max(0, Math.min(c - (idx < current ? 1 : 0), next.length - 1)));
    }
    if (removed) URL.revokeObjectURL(removed.url);
    if (next.length === 0) {
      audioRef.current?.pause();
      setPlaying(false);
      setCurrent(0);
    }
  };

  const onEnded = () => {
    if (tracks.length <= 1) {
      setPlaying(false);
      return;
    }
    setCurrent((c) => (c + 1) % tracks.length);
  };

  return (
    <WidgetCard title="Music" icon={<Music4 className="h-4 w-4" />}>
      <audio
        ref={audioRef}
        onEnded={onEnded}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          setProgress(a.currentTime);
          if (a.duration && Number.isFinite(a.duration)) setDuration(a.duration);
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuration(d);
        }}
        preload="metadata"
      />
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,.mp3,.ogg,.wav,.m4a,.flac"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
        aria-label="Add audio files"
      />

      {tracks.length === 0 ? (
        <button
          onClick={() => fileRef.current?.click()}
          className="press flex w-full flex-col items-center gap-2 rounded-xl border border-dashed py-6 text-muted-c transition-colors hover:text-[var(--text)]"
          style={{ borderColor: "color-mix(in srgb, var(--text) 18%, transparent)" }}
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
          <span className="text-sm font-medium">Add music from your device</span>
          <span className="max-w-[260px] text-center text-[11px] leading-snug">
            MP3, OGG, WAV, M4A — files play locally and never leave your device.
          </span>
        </button>
      ) : (
        <>
          {/* now playing + controls */}
          <div className="mb-3 flex items-center gap-3">
            <button
              className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--accent-fg)]"
              style={{
                background: "var(--accent)",
                boxShadow: "0 4px 18px color-mix(in srgb, var(--accent) 35%, transparent)",
              }}
              onClick={togglePlay}
              aria-label={playing ? "Pause music" : "Play music"}
            >
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-[1px]" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{activeTrack?.name ?? "—"}</div>
              {/* progress */}
              <div className="mt-1 flex items-center gap-2 text-[10px] tabular-nums text-muted-c">
                <span>{fmtDuration(progress * 1000)}</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0.1, duration)}
                  step={0.1}
                  value={progress}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setProgress(v);
                    if (audioRef.current) audioRef.current.currentTime = v;
                  }}
                  className="fd-range min-w-0 flex-1"
                  aria-label="Seek position"
                />
                <span>{fmtDuration(duration * 1000)}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <IconSm label="Previous track" onClick={() => skip(-1)}>
                <SkipBack className="h-4 w-4" />
              </IconSm>
              <IconSm label="Next track" onClick={() => skip(1)}>
                <SkipForward className="h-4 w-4" />
              </IconSm>
            </div>
          </div>

          {/* volume */}
          <div className="mb-3 flex items-center gap-2">
            <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-c" aria-hidden="true" />
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              className="fd-range flex-1"
              aria-label="Music volume"
            />
            <button
              className="press flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-muted-c hover:text-[var(--text)]"
              style={{ background: "color-mix(in srgb, var(--text) 7%, transparent)" }}
              onClick={() => fileRef.current?.click()}
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>

          {/* playlist */}
          <ul className="fd-scroll max-h-40 space-y-0.5">
            {tracks.map((t, i) => (
              <li key={t.id} className="group/track flex items-center gap-2">
                <button
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]",
                    i === current && "text-accent"
                  )}
                  onClick={() => {
                    setCurrent(i);
                    setPlaying(true);
                    requestAnimationFrame(() => audioRef.current?.play().catch(() => setPlaying(false)));
                  }}
                  aria-label={`Play ${t.name}`}
                >
                  <span className="w-4 shrink-0 text-center text-[10px] tabular-nums text-muted-c">
                    {i === current && playing ? "♪" : i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
                </button>
                <button
                  className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-c opacity-0 transition-opacity hover:text-[var(--negative)] focus-visible:opacity-100 group-hover/track:opacity-100"
                  onClick={() => removeTrack(t.id)}
                  aria-label={`Remove ${t.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-c">
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            Local files only — playlist clears when you close the app.
          </p>
        </>
      )}
    </WidgetCard>
  );
}

function IconSm({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      className="press flex h-8 w-8 items-center justify-center rounded-lg text-muted-c transition-colors hover:text-[var(--text)]"
      style={{ background: "color-mix(in srgb, var(--text) 7%, transparent)" }}
      onClick={onClick}
      aria-label={label}
    >
      {children}
    </button>
  );
}
