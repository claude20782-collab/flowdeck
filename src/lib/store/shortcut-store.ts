"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { lsPersistConfig } from "./config";

/* ============================================================
 * Configurable keyboard shortcuts.
 * Keys are action ids; values are single-key or combo strings
 * like "f", "shift+f", "ctrl+k", "space".
 * ============================================================ */

export interface ShortcutAction {
  id: string;
  label: string;
  /** default binding */
  def: string;
  description: string;
}

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: "toggle-timer", label: "Pause / resume timer", def: "space", description: "Space anywhere (not in inputs)" },
  { id: "focus-mode", label: "Enter focus mode", def: "f", description: "Open the immersive focus overlay" },
  { id: "open-tasks", label: "Open tasks", def: "t", description: "Open the task manager panel" },
  { id: "open-notes", label: "Open notes", def: "n", description: "Open the notes panel" },
  { id: "open-study", label: "Open study", def: "s", description: "Open the JEE study system" },
  { id: "command-palette", label: "Command palette", def: "k", description: "Ctrl/Cmd + K" },
  { id: "edit-dashboard", label: "Customize dashboard", def: "e", description: "Toggle dashboard edit mode" },
  { id: "next-workspace", label: "Next workspace", def: "]", description: "Cycle workspaces" },
  { id: "toggle-sound", label: "Toggle soundscape", def: "m", description: "Play / pause ambient sound" },
];

interface ShortcutStore {
  bindings: Record<string, string>;
  hydrated: boolean;
  _setHydrated: () => void;
  rebind: (actionId: string, binding: string) => void;
  resetAll: () => void;
}

export const useShortcutStore = create<ShortcutStore>()(
  persist(
    (set) => ({
      bindings: Object.fromEntries(SHORTCUT_ACTIONS.map((a) => [a.id, a.def])),
      hydrated: false,
      _setHydrated: () => set({ hydrated: true }),
      rebind: (actionId, binding) => set((s) => ({ bindings: { ...s.bindings, [actionId]: binding } })),
      resetAll: () => set({ bindings: Object.fromEntries(SHORTCUT_ACTIONS.map((a) => [a.id, a.def])) }),
    }),
    lsPersistConfig<ShortcutStore>("flowdeck-shortcuts")
  )
);

export function getBinding(actionId: string): string {
  return useShortcutStore.getState().bindings[actionId] ?? SHORTCUT_ACTIONS.find((a) => a.id === actionId)?.def ?? "";
}

/** Normalize a KeyboardEvent into a binding string comparable with stored ones. */
export function eventToBinding(e: KeyboardEvent): string {
  const key = e.key.toLowerCase();
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey && key.length > 1) parts.push("shift");
  if (key === " ") parts.push("space");
  else if (key.length === 1) parts.push(key);
  else if (["arrowup", "arrowdown", "arrowleft", "arrowright", "enter", "escape", "backspace", "tab"].includes(key))
    parts.push(key);
  else return "";
  return parts.join("+");
}

export function prettyBinding(binding: string): string {
  return binding
    .split("+")
    .map((p) => {
      if (p === "ctrl") return "Ctrl";
      if (p === "alt") return "Alt";
      if (p === "shift") return "Shift";
      if (p === "space") return "Space";
      if (p === "arrowup") return "↑";
      if (p === "arrowdown") return "↓";
      if (p === "arrowleft") return "←";
      if (p === "arrowright") return "→";
      if (p === "enter") return "↵";
      if (p === "escape") return "Esc";
      return p.toUpperCase();
    })
    .join(" + ");
}
