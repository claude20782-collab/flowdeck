"use client";

import { useEffect } from "react";
import { useUIStore } from "@/lib/store/ui-store";
import { useShortcutStore, eventToBinding } from "@/lib/store/shortcut-store";
import { useTimerStore } from "@/lib/store/timer-store";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useSoundStore } from "@/lib/store/sound-store";
import { soundscape } from "@/lib/audio/engine";

/**
 * Global keyboard shortcuts (user-configurable via settings).
 * Skips events originating in form fields and while overlays
 * that own their own keys are open.
 */
export function ShortcutLayer() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /* let command palette handle its own toggle */
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") return;

      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (inField) return;

      const ui = useUIStore.getState();
      if (ui.paletteOpen || ui.focusLayout) return; // overlays own their keys

      const binding = eventToBinding(e);
      if (!binding || binding.includes("ctrl")) return;
      const bindings = useShortcutStore.getState().bindings;

      const timer = useTimerStore.getState();
      const match = (id: string) => bindings[id] === binding;

      if (e.key !== "Escape" && match("toggle-timer")) {
        if (timer.state.status === "running") timer.pause();
        else if (timer.state.status === "paused") timer.resume();
        else timer.start();
        return;
      }
      if (match("focus-mode")) {
        ui.setFocusLayout("standard");
        return;
      }
      if (match("open-tasks")) {
        ui.openPanel("tasks");
        return;
      }
      if (match("open-notes")) {
        ui.openPanel("notes");
        return;
      }
      if (match("open-study")) {
        ui.openPanel("study");
        return;
      }
      if (match("edit-dashboard")) {
        ui.setEditMode(!ui.editMode);
        return;
      }
      if (match("next-workspace")) {
        const { workspaces, activeId, setActive } = useWorkspaceStore.getState();
        if (workspaces.length > 1) {
          const idx = workspaces.findIndex((w) => w.id === activeId);
          setActive(workspaces[(idx + 1) % workspaces.length].id);
        }
        return;
      }
      if (match("toggle-sound")) {
        const sound = useSoundStore.getState();
        if (!sound.playing) soundscape.ensureContext();
        sound.setPlaying(!sound.playing);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
