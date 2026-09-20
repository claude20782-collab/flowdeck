"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { idbPersistConfig } from "./config";
import type { Goal, Milestone } from "@/lib/types";
import { uid, todayKey } from "@/lib/utils";

interface GoalStore {
  goals: Goal[];
  hydrated: boolean;
  _setHydrated: () => void;
  addGoal: (input: Partial<Goal> & { title: string }) => void;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  archiveGoal: (id: string, archived: boolean) => void;
  addMilestone: (goalId: string, title: string) => void;
  toggleMilestone: (goalId: string, milestoneId: string) => void;
  deleteMilestone: (goalId: string, milestoneId: string) => void;
  contribute: (goalId: string, amount: number, date?: string, note?: string) => void;
}

export const useGoalStore = create<GoalStore>()(
  persist(
    (set) => ({
      goals: [],
      hydrated: false,
      _setHydrated: () => set({ hydrated: true }),

      addGoal: (input) =>
        set((s) => ({
          goals: [
            {
              id: uid(),
              title: input.title,
              description: input.description,
              type: input.type ?? "numeric",
              target: input.target ?? 100,
              unit: input.unit,
              manualValue: input.manualValue ?? 0,
              deadline: input.deadline,
              createdAt: Date.now(),
              archived: false,
              color: input.color,
              milestones: input.milestones ?? [],
              contributions: [],
            },
            ...s.goals,
          ],
        })),

      updateGoal: (id, patch) =>
        set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),

      deleteGoal: (id) => set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),

      archiveGoal: (id, archived) =>
        set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, archived } : g)) })),

      addMilestone: (goalId, title) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === goalId ? { ...g, milestones: [...g.milestones, { id: uid(), title, done: false }] } : g
          ),
        })),

      toggleMilestone: (goalId, milestoneId) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === goalId
              ? {
                  ...g,
                  milestones: g.milestones.map((m: Milestone) =>
                    m.id === milestoneId ? { ...m, done: !m.done } : m
                  ),
                }
              : g
          ),
        })),

      deleteMilestone: (goalId, milestoneId) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === goalId ? { ...g, milestones: g.milestones.filter((m) => m.id !== milestoneId) } : g
          ),
        })),

      contribute: (goalId, amount, date, note) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === goalId
              ? {
                  ...g,
                  contributions: [...g.contributions, { date: date ?? todayKey(), amount, note }],
                  manualValue: (g.manualValue ?? 0) + amount,
                }
              : g
          ),
        })),
    }),
    idbPersistConfig<GoalStore>("flowdeck-goals")
  )
);
