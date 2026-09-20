"use client";

import { useEffect, useState } from "react";
import { useTaskStore } from "@/lib/store/task-store";
import { useNoteStore } from "@/lib/store/note-store";
import { useSessionStore } from "@/lib/store/session-store";
import { useStudyStore } from "@/lib/store/study-store";
import { useHabitStore } from "@/lib/store/habit-store";
import { useGoalStore } from "@/lib/store/goal-store";
import { useAppearanceStore } from "@/lib/store/appearance-store";
import { useSoundStore } from "@/lib/store/sound-store";
import { useSettingsStore } from "@/lib/store/settings-store";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useTimerStore } from "@/lib/store/timer-store";

/**
 * Gates the app until all persisted stores have rehydrated.
 * Shows a branded boot splash meanwhile (no storage reads — SSR safe).
 */
export function BootGate({ children }: { children: React.ReactNode }) {
  const [booted, setBooted] = useState(false);
  const [minDelayDone, setMinDelayDone] = useState(false);

  const taskHydrated = useTaskStore((s) => s.hydrated);
  const noteHydrated = useNoteStore((s) => s.hydrated);
  const sessionHydrated = useSessionStore((s) => s.hydrated);
  const studyHydrated = useStudyStore((s) => s.hydrated);
  const habitHydrated = useHabitStore((s) => s.hydrated);
  const goalHydrated = useGoalStore((s) => s.hydrated);
  const appearanceHydrated = useAppearanceStore((s) => s.hydrated);
  const soundHydrated = useSoundStore((s) => s.hydrated);
  const settingsHydrated = useSettingsStore((s) => s.hydrated);
  const workspaceHydrated = useWorkspaceStore((s) => s.hydrated);
  const timerHydrated = useTimerStore((s) => s.hydrated);

  const hydrated =
    taskHydrated &&
    noteHydrated &&
    sessionHydrated &&
    studyHydrated &&
    habitHydrated &&
    goalHydrated &&
    appearanceHydrated &&
    soundHydrated &&
    settingsHydrated &&
    workspaceHydrated &&
    timerHydrated;

  useEffect(() => {
    const t = setTimeout(() => setMinDelayDone(true), 350);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (hydrated && minDelayDone) {
      const raf = requestAnimationFrame(() => setBooted(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [hydrated, minDelayDone]);

  if (booted) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-background">
      <div className="relative" aria-hidden="true">
        <div className="absolute inset-0 animate-ping rounded-full opacity-20" style={{ background: "var(--accent)" }} />
        <div
          className="h-12 w-12 rounded-2xl"
          style={{
            background: "var(--accent)",
            boxShadow: "0 0 40px color-mix(in srgb, var(--accent) 45%, transparent)",
          }}
        />
      </div>
      <div className="text-sm tracking-[0.35em] uppercase text-muted-c">Flowdeck</div>
      <div className="h-1 w-28 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--text) 10%, transparent)" }}>
        <div
          className="h-full w-1/2 animate-[fd-boot_1.1s_ease-in-out_infinite] rounded-full"
          style={{ background: "var(--accent)" }}
        />
      </div>
      <style>{`@keyframes fd-boot { 0% { transform: translateX(-120%);} 100% { transform: translateX(320%);} }`}</style>
    </div>
  );
}
