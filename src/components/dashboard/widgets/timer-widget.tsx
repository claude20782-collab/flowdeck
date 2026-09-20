"use client";

import { useMemo, useState } from "react";
import { WidgetCard } from "../widget-card";
import { useTimerStore, elapsedOf, remainingOf, durationFor } from "@/lib/store/timer-store";
import { useSettingsStore } from "@/lib/store/settings-store";
import { useStudyStore } from "@/lib/store/study-store";
import { useUIStore } from "@/lib/store/ui-store";
import { useNow } from "@/hooks/use-app";
import { fmtDuration, clamp } from "@/lib/utils";
import type { TimerMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Play, Pause, Square, SkipForward, RotateCcw, Tag, Maximize2, ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const MODES: { id: TimerMode; label: string }[] = [
  { id: "pomodoro", label: "Pomodoro" },
  { id: "deepwork", label: "Deep work" },
  { id: "stopwatch", label: "Stopwatch" },
  { id: "countdown", label: "Countdown" },
];

const PHASE_LABEL = { focus: "Focus", short: "Short break", long: "Long break" } as const;

export function TimerWidget({ config }: { config: Record<string, unknown> }) {
  const state = useTimerStore((s) => s.state);
  const start = useTimerStore((s) => s.start);
  const pause = useTimerStore((s) => s.pause);
  const resume = useTimerStore((s) => s.resume);
  const stop = useTimerStore((s) => s.stop);
  const skip = useTimerStore((s) => s.skip);
  const restart = useTimerStore((s) => s.restart);
  const setMode = useTimerStore((s) => s.setMode);
  const setSessionMeta = useTimerStore((s) => s.setSessionMeta);
  const timerConfig = useSettingsStore((s) => s.timer);

  const setFocusLayout = useUIStore((s) => s.setFocusLayout);
  const subjects = useStudyStore((s) => s.subjects);
  const chapters = useStudyStore((s) => s.chapters);

  const running = state.status === "running";
  const now = useNow(250, running);
  void now; // triggers re-render; values computed from timestamps

  const elapsed = elapsedOf(state);
  const remaining = state.mode === "stopwatch" ? Infinity : Math.max(0, remainingOf(state));
  const display = state.mode === "stopwatch" ? elapsed : remaining;

  const progress = useMemo(() => {
    if (state.mode === "stopwatch" || state.durationMs === 0) return 0;
    return clamp(elapsed / state.durationMs, 0, 1);
  }, [elapsed, state.durationMs, state.mode]);

  const isIdle = state.status === "idle";
  const phaseLabel = PHASE_LABEL[state.phase];

  return (
    <WidgetCard bodyClassName="relative">
      {/* mode selector (idle only) */}
      {isIdle && (
        <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Timer mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={state.mode === m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                "press rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                state.mode === m.id ? "text-[var(--accent-fg)]" : "text-muted-c hover:text-[var(--text)]"
              )}
              style={
                state.mode === m.id
                  ? { background: "var(--accent)" }
                  : { background: "color-mix(in srgb, var(--text) 7%, transparent)" }
              }
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* countdown duration picker */}
      {isIdle && state.mode === "countdown" && (
        <div className="mb-3 flex items-center justify-center gap-2 text-sm">
          <button
            className="press h-8 w-8 rounded-lg text-muted-c"
            style={{ background: "color-mix(in srgb, var(--text) 7%, transparent)" }}
            onClick={() => adjustCountdown(-5)}
            aria-label="Five fewer minutes"
          >
            −5
          </button>
          <span className="tabular-nums">
            {Math.round((state.durationMs || durationFor("countdown", "focus")) / 60000)} min
          </span>
          <button
            className="press h-8 w-8 rounded-lg text-muted-c"
            style={{ background: "color-mix(in srgb, var(--text) 7%, transparent)" }}
            onClick={() => adjustCountdown(5)}
            aria-label="Five more minutes"
          >
            +5
          </button>
        </div>
      )}

      {/* time display */}
      <div className="flex flex-col items-center py-3 sm:py-4">
        <button
          onClick={() => setFocusLayout("standard")}
          className="display-time text-[var(--text)] transition-transform hover:scale-[1.02]"
          style={{ fontSize: "clamp(2.6rem, 8vw, 4.2rem)" }}
          aria-label={`Open focus mode, ${phaseLabel} ${fmtDuration(display)} ${running ? "remaining" : state.status === "paused" ? "paused" : "ready"}`}
        >
          {fmtDuration(display)}
        </button>
        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-c">
          {state.status === "idle" ? (
            <span>
              {state.mode === "pomodoro"
                ? `${timerConfig.focusMin}·${timerConfig.shortMin}·${timerConfig.longMin} min · ${timerConfig.cycles} cycles`
                : state.mode === "deepwork"
                  ? "Single deep block"
                  : state.mode === "stopwatch"
                    ? "Free run"
                    : "Custom duration"}
            </span>
          ) : (
            <>
              <span
                className={cn("h-1.5 w-1.5 rounded-full", running && "fd-pulse")}
                style={{ background: state.phase === "focus" ? "var(--accent)" : "var(--positive)" }}
                aria-hidden="true"
              />
              <span className="font-medium">{phaseLabel}</span>
              {(state.mode === "pomodoro" || state.mode === "deepwork") && (
                <span aria-hidden="true">·</span>
              )}
              {(state.mode === "pomodoro" || state.mode === "deepwork") && (
                <span className="flex items-center gap-1" aria-label={`Cycle ${state.cycle + 1} of ${timerConfig.cycles}`}>
                  {Array.from({ length: timerConfig.cycles }).map((_, i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        background: i < state.cycle % timerConfig.cycles || (state.cycle > 0 && i < state.cycle && state.phase !== "focus")
                          ? "var(--accent)"
                          : i === state.cycle && state.phase === "focus"
                            ? "color-mix(in srgb, var(--accent) 45%, transparent)"
                            : "color-mix(in srgb, var(--text) 15%, transparent)",
                      }}
                    />
                  ))}
                </span>
              )}
              {state.session?.label && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="max-w-[120px] truncate text-[var(--text)]">{state.session.label}</span>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* controls */}
      <div className="flex items-center justify-center gap-2">
        <button
          className="press flex h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold"
          style={
            running || state.status === "paused"
              ? { background: "color-mix(in srgb, var(--text) 10%, transparent)", color: "var(--text)" }
              : { background: "var(--accent)", color: "var(--accent-fg)", boxShadow: "0 4px 20px color-mix(in srgb, var(--accent) 35%, transparent)" }
          }
          onClick={() => {
            if (state.status === "running") pause();
            else if (state.status === "paused") resume();
            else start();
          }}
          aria-label={running ? "Pause timer" : state.status === "paused" ? "Resume timer" : "Start timer"}
        >
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {running ? "Pause" : state.status === "paused" ? "Resume" : "Start"}
        </button>

        {state.status !== "idle" && (
          <>
            <IconBtn label="Restart" onClick={restart}>
              <RotateCcw className="h-4 w-4" />
            </IconBtn>
            <IconBtn label="Skip phase" onClick={() => skip()}>
              <SkipForward className="h-4 w-4" />
            </IconBtn>
            <IconBtn label="Stop" onClick={() => stop()}>
              <Square className="h-4 w-4" />
            </IconBtn>
          </>
        )}

        <SessionTagPopover
          label={state.session?.label}
          subjectId={state.session?.subjectId}
          chapterId={state.session?.chapterId}
          subjects={subjects}
          chapters={chapters}
          onChange={(meta) => setSessionMeta(meta)}
        />

        <IconBtn label="Focus mode" onClick={() => setFocusLayout("standard")}>
          <Maximize2 className="h-4 w-4" />
        </IconBtn>
      </div>

      {/* progress line */}
      {state.durationMs > 0 && state.status !== "idle" && (
        <div
          className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden rounded-b-[var(--app-radius)]"
          style={{ background: "color-mix(in srgb, var(--text) 8%, transparent)" }}
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Session progress"
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${progress * 100}%`,
              background: state.phase === "focus" ? "var(--accent)" : "var(--positive)",
              transition: "width 0.3s linear",
            }}
          />
        </div>
      )}
      {state.mode === "stopwatch" && state.status !== "idle" && (
        <div className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: "var(--accent)", opacity: 0.35 }} />
      )}
    </WidgetCard>
  );
}

function IconBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      className="press flex h-10 w-10 items-center justify-center rounded-full text-muted-c transition-colors hover:text-[var(--text)]"
      style={{ background: "color-mix(in srgb, var(--text) 7%, transparent)" }}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function SessionTagPopover({
  label,
  subjectId,
  chapterId,
  subjects,
  chapters,
  onChange,
}: {
  label?: string;
  subjectId?: string;
  chapterId?: string;
  subjects: { id: string; name: string }[];
  chapters: { id: string; name: string; subjectId: string }[];
  onChange: (meta: { label?: string; subjectId?: string; chapterId?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = label || subjectId || chapterId;

  const chapterOptions = subjectId ? chapters.filter((c) => c.subjectId === subjectId) : chapters;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="press flex h-10 w-10 items-center justify-center rounded-full transition-colors"
          style={{
            background: active
              ? "color-mix(in srgb, var(--accent) 16%, transparent)"
              : "color-mix(in srgb, var(--text) 7%, transparent)",
            color: active ? "var(--accent)" : "var(--text-muted)",
          }}
          aria-label="Tag this session"
          title="Tag session"
        >
          <Tag className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72">
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-c" htmlFor="session-label">
              Session label
            </label>
            <input
              id="session-label"
              defaultValue={label ?? ""}
              placeholder="e.g. Rotational motion drills"
              className="h-9 w-full rounded-lg border hairline bg-transparent px-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
              onBlur={(e) => onChange({ label: e.target.value || undefined, subjectId, chapterId })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-c" htmlFor="session-subject">
              Subject
            </label>
            <div className="relative">
              <select
                id="session-subject"
                value={subjectId ?? ""}
                onChange={(e) => onChange({ label, subjectId: e.target.value || undefined, chapterId: undefined })}
                className="h-9 w-full appearance-none rounded-lg border hairline bg-[var(--card-solid)] px-3 pr-8 text-sm outline-none"
              >
                <option value="">None</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-c" />
            </div>
          </div>
          {chapterOptions.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-c" htmlFor="session-chapter">
                Chapter
              </label>
              <div className="relative">
                <select
                  id="session-chapter"
                  value={chapterId ?? ""}
                  onChange={(e) => onChange({ label, subjectId, chapterId: e.target.value || undefined })}
                  className="h-9 w-full appearance-none rounded-lg border hairline bg-[var(--card-solid)] px-3 pr-8 text-sm outline-none"
                >
                  <option value="">None</option>
                  {chapterOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-c" />
              </div>
            </div>
          )}
          <p className="text-[11px] leading-snug text-muted-c">
            Tagged sessions feed your study analytics and chapter time-tracking.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function adjustCountdown(deltaMinutes: number) {
  const s = useTimerStore.getState().state;
  const current = s.durationMs || 25 * 60_000;
  const next = Math.max(5 * 60_000, Math.min(4 * 3600_000, current + deltaMinutes * 60_000));
  useTimerStore.setState({ state: { ...s, durationMs: next } });
}
