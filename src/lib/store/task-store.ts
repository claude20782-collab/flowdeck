"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { idbPersistConfig } from "./config";
import type { Priority, Subtask, Task, RecurKind } from "@/lib/types";
import { uid, todayKey, dateKey } from "@/lib/utils";

interface TaskStore {
  tasks: Task[];
  hydrated: boolean;
  _setHydrated: () => void;
  addTask: (input: Partial<Task> & { title: string }) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  toggleTask: (id: string) => boolean;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  addSubtask: (taskId: string, title: string) => void;
  updateSubtask: (taskId: string, subtaskId: string, patch: Partial<Subtask>) => void;
  deleteSubtask: (taskId: string, subtaskId: string) => void;
  deleteTask: (id: string) => void;
  archiveTask: (id: string, archived: boolean) => void;
  reorder: (orderedIds: string[]) => void;
  moveTask: (id: string, direction: -1 | 1) => void;
  bulkArchive: (ids: string[], archived: boolean) => void;
  bulkDelete: (ids: string[]) => void;
  bulkComplete: (ids: string[], done: boolean) => void;
  clearCompleted: () => void;
}

function nextRecurDate(recur: RecurKind, from: string): string {
  const d = new Date(`${from}T12:00:00`);
  switch (recur) {
    case "daily":
      d.setDate(d.getDate() + 1);
      break;
    case "weekdays": {
      do {
        d.setDate(d.getDate() + 1);
      } while (d.getDay() === 0 || d.getDay() === 6);
      break;
    }
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
  }
  return dateKey(d);
}

export const useTaskStore = create<TaskStore>()(
  persist(
    (set, get) => ({
      tasks: [],
      hydrated: false,
      _setHydrated: () => set({ hydrated: true }),

      addTask: (input) => {
        const maxOrder = get().tasks.reduce((m, t) => Math.max(m, t.order), 0);
        const task: Task = {
          id: uid(),
          title: input.title,
          notes: input.notes,
          done: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          dueDate: input.dueDate,
          scheduledDate: input.scheduledDate,
          priority: (input.priority ?? "none") as Priority,
          tags: input.tags ?? [],
          subtasks: input.subtasks ?? [],
          order: maxOrder + 1,
          recur: input.recur,
          archived: false,
          estMinutes: input.estMinutes,
          subjectId: input.subjectId,
          chapterId: input.chapterId,
        };
        set((s) => ({ tasks: [task, ...s.tasks] }));
        return task;
      },

      updateTask: (id, patch) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t)),
        })),

      toggleTask: (id) => {
        const task = get().tasks.find((t) => t.id === id);
        if (!task) return false;
        const nowDone = !task.done;
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? { ...t, done: nowDone, completedAt: nowDone ? Date.now() : undefined, updatedAt: Date.now() }
              : t
          ),
        }));
        /* recurring tasks spawn their next occurrence when completed */
        if (nowDone && task.recur && !task.archived) {
          const base = task.scheduledDate ?? task.dueDate ?? todayKey();
          const nextDate = nextRecurDate(task.recur, base);
          const maxOrder = get().tasks.reduce((m, t) => Math.max(m, t.order), 0);
          const spawned: Task = {
            ...task,
            id: uid(),
            done: false,
            completedAt: undefined,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            scheduledDate: task.scheduledDate ? nextDate : undefined,
            dueDate: task.dueDate ? nextDate : undefined,
            subtasks: task.subtasks.map((st) => ({ ...st, done: false })),
            order: maxOrder + 1,
          };
          set((s) => ({ tasks: [spawned, ...s.tasks] }));
        }
        return nowDone;
      },

      toggleSubtask: (taskId, subtaskId) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  updatedAt: Date.now(),
                  subtasks: t.subtasks.map((st) => (st.id === subtaskId ? { ...st, done: !st.done } : st)),
                }
              : t
          ),
        })),

      addSubtask: (taskId, title) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  updatedAt: Date.now(),
                  subtasks: [...t.subtasks, { id: uid(), title, done: false }],
                }
              : t
          ),
        })),

      updateSubtask: (taskId, subtaskId, patch) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? { ...t, subtasks: t.subtasks.map((st) => (st.id === subtaskId ? { ...st, ...patch } : st)) }
              : t
          ),
        })),

      deleteSubtask: (taskId, subtaskId) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId ? { ...t, subtasks: t.subtasks.filter((st) => st.id !== subtaskId) } : t
          ),
        })),

      deleteTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

      archiveTask: (id, archived) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, archived } : t)) })),

      reorder: (orderedIds) =>
        set((s) => {
          const orderMap = new Map(orderedIds.map((id, i) => [id, i + 1]));
          return {
            tasks: s.tasks.map((t) => (orderMap.has(t.id) ? { ...t, order: orderMap.get(t.id)! } : t)),
          };
        }),

      moveTask: (id, direction) =>
        set((s) => {
          const sorted = [...s.tasks].sort((a, b) => a.order - b.order);
          const idx = sorted.findIndex((t) => t.id === id);
          const swapIdx = idx + direction;
          if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return s;
          const a = sorted[idx];
          const b = sorted[swapIdx];
          const orderA = a.order;
          a.order = b.order;
          b.order = orderA;
          return { tasks: [...s.tasks] };
        }),

      bulkArchive: (ids, archived) =>
        set((s) => ({ tasks: s.tasks.map((t) => (ids.includes(t.id) ? { ...t, archived } : t)) })),

      bulkDelete: (ids) => set((s) => ({ tasks: s.tasks.filter((t) => !ids.includes(t.id)) })),

      bulkComplete: (ids, done) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            ids.includes(t.id) ? { ...t, done, completedAt: done ? Date.now() : undefined } : t
          ),
        })),

      clearCompleted: () => set((s) => ({ tasks: s.tasks.filter((t) => !t.done) })),
    }),
    idbPersistConfig<TaskStore>("flowdeck-tasks")
  )
);
