"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useUIStore, type FocusLayout } from "@/lib/store/ui-store";
import { useTimerStore, elapsedOf, remainingOf } from "@/lib/store/timer-store";
import { useStudyStore } from "@/lib/store/study-store";
import { useTaskStore } from "@/lib/store/task-store";
import { useSessionStore } from "@/lib/store/session-store";
import { useSettingsStore } from "@/lib/store/settings-store";
import { useNow, useCursorIdle } from "@/hooks/use-app";
import { fmtDuration, fmtMinutes, todayKey } from "@/lib/utils";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Play,
  Pause,
  Square,
  SkipForward,
  X,
  Minimize2,
  GraduationCap,
  Sparkles,
  Layers,
  Eye,
  EyeOff,
} from "lucide-react";

const LAYOUTS: { id: FocusLayout; label: string; icon: typeof Eye }[] = [
  { id: "minimal", label: "Minimal", icon: Minimize2 },
  { id: "standard", label: "Standard", icon: Layers },
  { id: "study", label: "Study", icon: GraduationCap },
  { id: "immersive", label: "Immersive", icon: Sparkles },
];

const PHASE_LABEL = { focus: "Focus", short: "Short break", long: "Long break" } as const;

export function FocusOverlay() {
  const layout = useUIStore((s) => s.focusLayout);
  const setFocusLayout = useUIStore((s) => s.setFocusLayout);

  const state = useTimerStore((s) => s.state);
  const start = useTimerStore((s) => s.start);
  const pause = useTimerStore((s) => s.pause);
  const resume = useTimerStore((s) => s.resume);
  const stop = useTimerStore((s) => s.stop);
  const skip = useTimerStore((s) => s.skip);
  const setMode = useTimerStore((s) => s.setMode);

  const settings = useSettingsStore((s) => s.timer);
  const subjects = useStudyStore((s) => s.subjects);
  const chapters = useStudyStore((s) => s.chapters);
  const tasks = useTaskStore((s) => s.tasks);
  const sessions = useSessionStore((s) => s.sessions);

  const [chromeVisible, setChromeVisible] = useState(true);
  const cursorHidden = useCursorIdle(3500);

  const running = state.status === "running";
  const now = useNow(250, running);
  void now;

  const elapsed = elapsedOf(state);
  const remaining = state.mode === "stopwatch" ? Infinity : Math.max(0, remainingOf(state));
  const display = state.mode === "stopwatch" ? elapsed : remaining;
  const progress = state.durationMs > 0 ? Math.min(1, elapsed / state.durationMs) : 0;

  /* esc exits, space toggles */
  useEffect(() => {
    if (!layout) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusLayout(null);
      if (e.key === " ") {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.tagName === "BUTTON") return;
        e.preventDefault();
        if (state.status === "running") pause();
        else if (state.status === "paused") resume();
        else start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout, state.status, setFocusLayout, pause, resume, start]);

  const subject = subjects.find((s) => s.id === state.session?.subjectId);
  const chapter = chapters.find((c) => c.id === state.session?.chapterId);
  const activeTask = tasks.find((t) => t.id === state.session?.taskId && !t.done);

  const todayStats = useMemo(() => {
    const today = todayKey();
    const minutes = sessions
      .filter((s) => format(new Date(s.startedAt), "yyyy-MM-dd") === today)
      .reduce((m, s) => m + s.durationMs / 60000, 0);
    return { minutes, count: sessions.filter((s) => format(new Date(s.startedAt), "yyyy-MM-dd") === today).length };
  }, [sessions]);

  const immersive = layout === "immersive";
  const showChrome = chromeVisible || !cursorHidden || !immersive;

  return (
    <AnimatePresence>
      {layout && (
        <motion.div
          className="fixed inset-0 z-[60] flex flex-col"
          style={{
            background: immersive
              ? "color-mix(in srgb, var(--app-bg) 62%, transparent)"
              : "color-mix(in srgb, var(--app-bg) 88%, transparent)",
            backdropFilter: immersive ? "blur(4px)" : "blur(18px)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          role="dialog"
          aria-modal="true"
          aria-label="Focus mode"
        >
          {/* top chrome */}
          <motion.div
            className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4 sm:p-5"
            animate={{ opacity: showChrome ? 1 : 0, pointerEvents: showChrome ? "auto" : "none" }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center gap-1.5 rounded-full p-1" style={{ background: "color-mix(in srgb, var(--text) 7%, transparent)" }}>
              {LAYOUTS.map((l) => {
                const Icon = l.icon;
                const active = layout === l.id;
                return (
                  <button
                    key={l.id}
                    onClick={() => setFocusLayout(l.id)}
                    className={cn(
                      "press flex h-8 w-8 items-center justify-center rounded-full",
                      active ? "text-[var(--accent-fg)]" : "text-muted-c hover:text-[var(--text)]"
                    )}
                    style={active ? { background: "var(--accent)" } : undefined}
                    aria-label={`${l.label} focus layout`}
                    aria-pressed={active}
                    title={l.label}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
            <button
              className="press flex h-9 w-9 items-center justify-center rounded-full text-muted-c transition-colors hover:text-[var(--text)]"
              style={{ background: "color-mix(in srgb, var(--text) 7%, transparent)" }}
              onClick={() => setFocusLayout(null)}
              aria-label="Exit focus mode (Esc)"
            >
              <X className="h-4.5 w-4.5 h-[18px] w-[18px]" />
            </button>
          </motion.div>

          {/* center content */}
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
            {/* context line */}
            {(layout === "standard" || layout === "study") && state.status !== "idle" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-c"
              >
                <span
                  className={cn("flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium", running && "fd-pulse")}
                  style={{
                    background: state.phase === "focus" ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "color-mix(in srgb, var(--positive) 15%, transparent)",
                    color: state.phase === "focus" ? "var(--accent)" : "var(--positive)",
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} aria-hidden="true" />
                  {PHASE_LABEL[state.phase]}
                  {(state.mode === "pomodoro" || state.mode === "deepwork") && ` · cycle ${state.cycle + 1}`}
                </span>
                {state.session?.label && (
                  <span className="rounded-full px-3 py-1 text-xs" style={{ background: "color-mix(in srgb, var(--text) 7%, transparent)" }}>
                    {state.session.label}
                  </span>
                )}
                {activeTask && (
                  <span className="rounded-full px-3 py-1 text-xs" style={{ background: "color-mix(in srgb, var(--text) 7%, transparent)" }}>
                    Task: {activeTask.title}
                  </span>
                )}
              </motion.div>
            )}

            {/* study context */}
            {layout === "study" && (subject || chapter) && (
              <div className="flex items-center gap-2 text-sm">
                {subject && (
                  <span className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: `color-mix(in srgb, ${subject.color} 20%, transparent)`, color: subject.color }}>
                    {subject.name}
                  </span>
                )}
                {chapter && (
                  <span className="rounded-full px-3 py-1 text-xs" style={{ background: "color-mix(in srgb, var(--text) 7%, transparent)" }}>
                    {chapter.name}
                  </span>
                )}
              </div>
            )}

            {/* the time */}
            <div className="display-time text-center" style={{ fontSize: "clamp(4.5rem, 17vw, 13rem)", textShadow: immersive ? "0 0 80px color-mix(in srgb, var(--accent) 25%, transparent)" : undefined }}>
              {fmtDuration(display, { hours: true })}
            </div>

            {/* progress ring for timed modes */}
            {state.durationMs > 0 && state.status !== "idle" && (
              <div className="w-full max-w-md">
                <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--text) 10%, transparent)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: state.phase === "focus" ? "var(--accent)" : "var(--positive)" }}
                    animate={{ width: `${progress * 100}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              </div>
            )}

            {/* mode picker when idle */}
            {state.status === "idle" && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {(["pomodoro", "deepwork", "stopwatch"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={cn(
                      "press rounded-full px-4 py-2 text-sm font-medium transition-colors",
                      state.mode === m ? "text-[var(--accent-fg)]" : "text-muted-c hover:text-[var(--text)]"
                    )}
                    style={state.mode === m ? { background: "var(--accent)" } : { background: "color-mix(in srgb, var(--text) 8%, transparent)" }}
                  >
                    {m === "pomodoro" ? `Pomodoro · ${settings.focusMin}m` : m === "deepwork" ? "Deep work" : "Stopwatch"}
                  </button>
                ))}
              </div>
            )}

            {/* study stats footer (study layout) */}
            {layout === "study" && (
              <div className="flex items-center gap-6 text-xs text-muted-c">
                <span>
                  <span className="text-base font-semibold text-accent tabular-nums">{fmtMinutes(todayStats.minutes)}</span> today
                </span>
                <span>
                  <span className="text-base font-semibold tabular-nums">{todayStats.count}</span> sessions
                </span>
              </div>
            )}

            {/* controls */}
            <motion.div
              className="flex items-center gap-3"
              animate={{ opacity: showChrome || layout !== "immersive" ? 1 : 0.15 }}
              transition={{ duration: 0.4 }}
            >
              <FocusBtn
                primary
                onClick={() => (state.status === "running" ? pause() : state.status === "paused" ? resume() : start())}
                aria={state.status === "running" ? "Pause" : state.status === "paused" ? "Resume" : "Start session"}
              >
                {state.status === "running" ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-[1px]" />}
                <span className="ml-2 text-sm font-semibold">
                  {state.status === "running" ? "Pause" : state.status === "paused" ? "Resume" : "Start"}
                </span>
              </FocusBtn>
              {state.status !== "idle" && (
                <>
                  <FocusBtn onClick={skip} aria="Skip phase">
                    <SkipForward className="h-4 w-4" />
                  </FocusBtn>
                  <FocusBtn onClick={() => stop()} aria="Stop session">
                    <Square className="h-4 w-4" />
                  </FocusBtn>
                </>
              )}
              {immersive && (
                <FocusBtn onClick={() => setChromeVisible((v) => !v)} aria={chromeVisible ? "Hide controls" : "Show controls"}>
                  {chromeVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </FocusBtn>
              )}
            </motion.div>
          </div>

          {/* bottom hint */}
          <motion.div
            className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 p-4 text-[11px] text-muted-c"
            animate={{ opacity: showChrome ? 1 : 0 }}
            transition={{ duration: 0.4 }}
          >
            <span className={cn(immersive && cursorHidden && "cursor-hidden")}>
              Space pause/resume · Esc exit{immersive ? " · controls fade after inactivity" : ""}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FocusBtn({
  children,
  onClick,
  primary,
  aria,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  aria: string;
}) {
  return (
    <button
      className={cn("press flex items-center justify-center rounded-full", primary ? "h-14 px-7" : "h-11 w-11")}
      style={
        primary
          ? {
              background: "var(--accent)",
              color: "var(--accent-fg)",
              boxShadow: "0 8px 32px color-mix(in srgb, var(--accent) 40%, transparent)",
            }
          : { background: "color-mix(in srgb, var(--text) 9%, transparent)", color: "var(--text)" }
      }
      onClick={onClick}
      aria-label={aria}
    >
      {children}
    </button>
  );
}
