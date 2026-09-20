"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { idbPersistConfig } from "./config";
import type { Habit, HabitFreq } from "@/lib/types";
import { uid } from "@/lib/utils";

/* Habit logs are stored as an array of {habitId, date, count}. */

interface HabitStore {
  habits: Habit[];
  logs: { habitId: string; date: string; count: number }[];
  hydrated: boolean;
  _setHydrated: () => void;
  addHabit: (input: { name: string; emoji?: string; color?: string; freq: HabitFreq; notes?: string; targetPerDay?: number }) => void;
  updateHabit: (id: string, patch: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  archiveHabit: (id: string, archived: boolean) => void;
  incrementHabit: (id: string, date: string, delta?: number) => number;
  setHabitCount: (id: string, date: string, count: number) => void;
}

export const useHabitStore = create<HabitStore>()(
  persist(
    (set, get) => ({
      habits: [],
      logs: [],
      hydrated: false,
      _setHydrated: () => set({ hydrated: true }),

      addHabit: (input) =>
        set((s) => ({
          habits: [
            ...s.habits,
            {
              id: uid(),
              name: input.name,
              emoji: input.emoji,
              color: input.color,
              freq: input.freq,
              notes: input.notes,
              targetPerDay: input.targetPerDay ?? 1,
              createdAt: Date.now(),
              archived: false,
            },
          ],
        })),

      updateHabit: (id, patch) =>
        set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)) })),

      deleteHabit: (id) =>
        set((s) => ({
          habits: s.habits.filter((h) => h.id !== id),
          logs: s.logs.filter((l) => l.habitId !== id),
        })),

      archiveHabit: (id, archived) =>
        set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, archived } : h)) })),

      incrementHabit: (id, date, delta = 1) => {
        const existing = get().logs.find((l) => l.habitId === id && l.date === date);
        const next = Math.max(0, (existing?.count ?? 0) + delta);
        set((s) => ({
          logs: existing
            ? s.logs.map((l) => (l.habitId === id && l.date === date ? { ...l, count: next } : l))
            : [...s.logs, { habitId: id, date, count: next }],
        }));
        return next;
      },

      setHabitCount: (id, date, count) =>
        set((s) => {
          const existing = s.logs.find((l) => l.habitId === id && l.date === date);
          if (existing) {
            return { logs: s.logs.map((l) => (l.habitId === id && l.date === date ? { ...l, count } : l)) };
          }
          return { logs: [...s.logs, { habitId: id, date, count }] };
        }),
    }),
    idbPersistConfig<HabitStore>("flowdeck-habits")
  )
);

/* ---------- pure helpers (streaks, frequencies) ---------- */

export function habitScheduledOn(habit: Habit, date: Date): boolean {
  switch (habit.freq.kind) {
    case "daily":
      return true;
    case "weekly":
      return habit.freq.days.includes(date.getDay());
    case "times-per-week":
      return true; // flexible schedule — any day counts toward weekly target
  }
}

/** Current consecutive-day streak (for daily habits) or consecutive scheduled days. */
export function habitStreak(habit: Habit, logs: { habitId: string; date: string; count: number }[]): number {
  const done = new Set(logs.filter((l) => l.habitId === habit.id && l.count > 0).map((l) => l.date));
  let streak = 0;
  const cursor = new Date();
  // allow today to be incomplete without breaking streak
  if (!done.has(dateKeyISO(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  for (let i = 0; i < 400; i++) {
    if (habit.freq.kind === "weekly" && !habit.freq.days.includes(cursor.getDay())) {
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    if (done.has(dateKeyISO(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function dateKeyISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Completion count within current week (Mon-based by default). */
export function habitWeekCount(
  habit: Habit,
  logs: { habitId: string; date: string; count: number }[],
  weekStartsOn: 0 | 1
): number {
  const now = new Date();
  const start = new Date(now);
  const diff = (now.getDay() - weekStartsOn + 7) % 7;
  start.setDate(now.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  const startKey = dateKeyISO(start);
  return logs.filter((l) => l.habitId === habit.id && l.count > 0 && l.date >= startKey).length;
}
