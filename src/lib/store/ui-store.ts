"use client";

import { create } from "zustand";

export type PanelId =
  | "tasks"
  | "habits"
  | "goals"
  | "notes"
  | "study"
  | "analytics"
  | "themes"
  | "sound"
  | "settings"
  | "search"
  | "shortcuts";

export type FocusLayout = "minimal" | "standard" | "study" | "immersive";

interface UIStore {
  activePanel: PanelId | null;
  focusLayout: FocusLayout | null;
  paletteOpen: boolean;
  editMode: boolean;
  installPromptVisible: boolean;
  /** active workspace id */
  activeWorkspaceId: string | null;
  openPanel: (p: PanelId) => void;
  closePanel: () => void;
  setFocusLayout: (f: FocusLayout | null) => void;
  setPaletteOpen: (open: boolean) => void;
  setEditMode: (v: boolean) => void;
  setInstallPromptVisible: (v: boolean) => void;
  setActiveWorkspace: (id: string) => void;
}

export const useUIStore = create<UIStore>()((set) => ({
  activePanel: null,
  focusLayout: null,
  paletteOpen: false,
  editMode: false,
  installPromptVisible: false,
  activeWorkspaceId: null,
  openPanel: (p) => set({ activePanel: p, paletteOpen: false }),
  closePanel: () => set({ activePanel: null }),
  setFocusLayout: (f) => set({ focusLayout: f }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setEditMode: (v) => set({ editMode: v }),
  setInstallPromptVisible: (v) => set({ installPromptVisible: v }),
  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),
}));
