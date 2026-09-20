"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { lsPersistConfig } from "./config";
import { emitTimerEvent } from "./timer-events";
import { useSessionStore } from "./session-store";
import type { TimerMode, TimerPhase, TimerState, TimerSessionMeta } from "@/lib/types";
import { uid } from "@/lib/utils";
import { useSettingsStore } from "./settings-store";

/* ============================================================
 * Timestamp-based timer engine.
 *
 * Accuracy: elapsed is derived from wall-clock timestamps:
 *   elapsed = accumulatedMs + (running ? now - startEpoch : 0)
 * setInterval only triggers re-render — never accumulates time,
 * so tab throttling / sleep cannot cause drift.
 * ============================================================ */

export function elapsedOf(s: TimerState): number {
  if (s.status !== "running" || s.startEpoch == null) return s.accumulatedMs;
  return s.accumulatedMs + (Date.now() - s.startEpoch);
}

export function remainingOf(s: TimerState): number {
  if (s.mode === "stopwatch" || s.durationMs === 0) return Infinity;
  return Math.max(0, s.durationMs - elapsedOf(s));
}

function phaseDuration(mode: TimerMode, phase: TimerPhase, cfg: ReturnType<typeof getTimerConfig>): number {
  switch (phase) {
    case "focus":
      return mode === "deepwork" ? Math.max(1, cfg.deepMin ?? 50) * 60_000 : cfg.focusMin * 60_000;
    case "short":
      return cfg.shortMin * 60_000;
    case "long":
      return cfg.longMin * 60_000;
  }
}

function getTimerConfig() {
  // Read-through to settings store (avoid circular imports at module scope)
  const s = useSettingsStore.getState();
  return { ...s.timer, deepMin: Math.max(s.timer.focusMin * 2, 50) };
}

const IDLE_STATE: TimerState = {
  mode: "pomodoro",
  phase: "focus",
  status: "idle",
  durationMs: 25 * 60_000,
  startEpoch: null,
  accumulatedMs: 0,
  cycle: 0,
  session: null,
};

interface TimerStore {
  state: TimerState;
  /** session-start timestamp for the whole run (for history) */
  runStartedAt: number | null;
  hydrated: boolean;
  _setHydrated: () => void;
  start: (mode?: TimerMode, meta?: TimerSessionMeta, durationMs?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: (opts?: { record?: boolean }) => void;
  skip: () => void;
  restart: () => void;
  setMode: (mode: TimerMode) => void;
  setSessionMeta: (meta: TimerSessionMeta | null) => void;
  completePhase: () => void;
  reset: () => void;
}

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      state: IDLE_STATE,
      runStartedAt: null,
      hydrated: false,
      _setHydrated: () => set({ hydrated: true }),

      start: (mode, meta, durationMs) => {
        const s = get().state;
        const cfg = getTimerConfig();
        const nextMode = mode ?? s.mode;
        let next: TimerState;
        if (s.status === "paused" && mode === undefined) {
          // resume-as-start from paused
          next = { ...s, status: "running", startEpoch: Date.now() };
        } else if (s.status === "idle" || s.status === "completed" || mode !== undefined) {
          const phase: TimerPhase = nextMode === "stopwatch" || nextMode === "countdown" ? "focus" : "focus";
          const dur =
            nextMode === "stopwatch"
              ? 0
              : nextMode === "countdown"
                ? durationMs ?? (s.durationMs || 25 * 60_000)
                : phaseDuration(nextMode, phase, cfg);
          next = {
            mode: nextMode,
            phase,
            status: "running",
            durationMs: dur,
            startEpoch: Date.now(),
            accumulatedMs: 0,
            cycle: 0,
            session: meta ?? null,
          };
        } else {
          next = { ...s, status: "running", startEpoch: Date.now() };
        }
        set({ state: next, runStartedAt: get().runStartedAt ?? Date.now() });
        emitTimerEvent({ type: "started", mode: next.mode, phase: next.phase });
      },

      pause: () => {
        const s = get().state;
        if (s.status !== "running") return;
        const elapsed = elapsedOf(s);
        set({
          state: { ...s, status: "paused", startEpoch: null, accumulatedMs: elapsed },
        });
        emitTimerEvent({ type: "paused" });
      },

      resume: () => {
        const s = get().state;
        if (s.status !== "paused") return;
        set({ state: { ...s, status: "running", startEpoch: Date.now() } });
        emitTimerEvent({ type: "resumed" });
      },

      stop: (opts) => {
        const s = get().state;
        if (s.status === "idle") return;
        const elapsed = elapsedOf(s);
        let recorded = false;
        if (opts?.record !== false && s.phase === "focus" && elapsed >= 60_000) {
          const startedAt = get().runStartedAt ?? Date.now() - elapsed;
          useSessionStore.getState().addSession({
            id: uid(),
            startedAt,
            endedAt: Date.now(),
            durationMs: elapsed,
            mode: s.mode,
            phase: s.phase,
            completed: false,
            label: s.session?.label,
            subjectId: s.session?.subjectId,
            chapterId: s.session?.chapterId,
            taskId: s.session?.taskId,
            notes: s.session?.notes,
          });
          recorded = true;
        }
        const cfg = getTimerConfig();
        set({
          state: { ...IDLE_STATE, mode: s.mode, durationMs: phaseDuration(s.mode, "focus", cfg) },
          runStartedAt: null,
        });
        emitTimerEvent({ type: "stopped", recordedSession: recorded });
      },

      skip: () => {
        const s = get().state;
        if (s.status === "idle") return;
        get().completePhase();
        emitTimerEvent({ type: "skip" });
      },

      restart: () => {
        const s = get().state;
        set({
          state: { ...s, status: "running", startEpoch: Date.now(), accumulatedMs: 0, cycle: 0 },
          runStartedAt: Date.now(),
        });
      },

      setMode: (mode) => {
        const s = get().state;
        if (s.status === "running" || s.status === "paused") {
          // switching modes mid-run: stop silently first
          const cfg = getTimerConfig();
          set({
            state: { ...IDLE_STATE, mode, durationMs: mode === "stopwatch" ? 0 : phaseDuration(mode, "focus", cfg) },
            runStartedAt: null,
          });
          return;
        }
        const cfg = getTimerConfig();
        set({
          state: {
            ...IDLE_STATE,
            mode,
            durationMs: mode === "stopwatch" ? 0 : phaseDuration(mode, "focus", cfg),
          },
        });
      },

      setSessionMeta: (meta) => {
        set((st) => ({ state: { ...st.state, session: meta } }));
      },

      completePhase: () => {
        const s = get().state;
        const cfg = getTimerConfig();
        const elapsed = elapsedOf(s);

        /* record completed focus session */
        if (s.phase === "focus" && s.mode !== "stopwatch") {
          const startedAt = get().runStartedAt ?? Date.now() - elapsed;
          useSessionStore.getState().addSession({
            id: uid(),
            startedAt,
            endedAt: Date.now(),
            durationMs: s.mode === "countdown" ? elapsed : s.durationMs,
            mode: s.mode,
            phase: s.phase,
            completed: true,
            label: s.session?.label,
            subjectId: s.session?.subjectId,
            chapterId: s.session?.chapterId,
            taskId: s.session?.taskId,
            notes: s.session?.notes,
          });
        }

        /* advance */
        let nextPhase: TimerPhase;
        let nextCycle = s.cycle;
        if (s.mode === "stopwatch" || s.mode === "countdown") {
          // terminal modes: finish
          set({
            state: {
              ...s,
              status: "completed",
              startEpoch: null,
              accumulatedMs: elapsed,
              durationMs: s.mode === "stopwatch" ? 0 : s.durationMs,
            },
          });
          emitTimerEvent({
            type: "phase-complete",
            phase: s.phase,
            cycle: s.cycle,
            nextPhase: "focus",
            autoStarted: false,
          });
          return;
        }
        if (s.phase === "focus") {
          nextCycle = s.cycle + 1;
          nextPhase = nextCycle % cfg.cycles === 0 ? "long" : "short";
        } else {
          nextPhase = "focus";
        }

        const autoStart =
          nextPhase === "focus" ? cfg.autoStartFocus : cfg.autoStartBreaks;

        const durationMs = phaseDuration(s.mode, nextPhase, cfg);
        set({
          state: {
            ...s,
            phase: nextPhase,
            cycle: nextCycle,
            durationMs,
            status: autoStart ? "running" : "idle",
            startEpoch: autoStart ? Date.now() : null,
            accumulatedMs: 0,
          },
          runStartedAt: nextPhase === "focus" ? (autoStart ? Date.now() : null) : get().runStartedAt,
        });
        emitTimerEvent({
          type: "phase-complete",
          phase: s.phase,
          cycle: s.cycle,
          nextPhase,
          autoStarted: autoStart,
        });
      },

      reset: () => {
        const cfg = getTimerConfig();
        set({
          state: { ...IDLE_STATE, durationMs: phaseDuration(get().state.mode, "focus", cfg) },
          runStartedAt: null,
        });
      },
    }),
    lsPersistConfig<TimerStore>("flowdeck-timer", {
      partialize: (s) => ({ state: s.state, runStartedAt: s.runStartedAt }) as unknown as TimerStore,
    })
  )
);

/** Duration for a mode/phase given current settings (pure helper for UI). */
export function durationFor(mode: TimerMode, phase: TimerPhase): number {
  return phaseDuration(mode, phase, getTimerConfig());
}
