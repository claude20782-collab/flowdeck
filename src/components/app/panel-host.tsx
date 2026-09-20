"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useUIStore, type PanelId } from "@/lib/store/ui-store";

const TasksPanel = dynamic(() => import("../panels/tasks-panel").then((m) => m.TasksPanel), { ssr: false });
const HabitsPanel = dynamic(() => import("../panels/habits-panel").then((m) => m.HabitsPanel), { ssr: false });
const GoalsPanel = dynamic(() => import("../panels/goals-panel").then((m) => m.GoalsPanel), { ssr: false });
const NotesPanel = dynamic(() => import("../panels/notes-panel").then((m) => m.NotesPanel), { ssr: false });
const StudyPanel = dynamic(() => import("../panels/study-panel").then((m) => m.StudyPanel), { ssr: false });
const AnalyticsPanel = dynamic(() => import("../panels/analytics-panel").then((m) => m.AnalyticsPanel), { ssr: false });
const ThemesPanel = dynamic(() => import("../panels/themes-panel").then((m) => m.ThemesPanel), { ssr: false });
const SoundPanel = dynamic(() => import("../panels/sound-panel").then((m) => m.SoundPanel), { ssr: false });
const SettingsPanel = dynamic(() => import("../panels/settings-panel").then((m) => m.SettingsPanel), { ssr: false });

const PANEL_COMPONENTS: Record<string, React.ComponentType> = {
  tasks: TasksPanel,
  habits: HabitsPanel,
  goals: GoalsPanel,
  notes: NotesPanel,
  study: StudyPanel,
  analytics: AnalyticsPanel,
  themes: ThemesPanel,
  sound: SoundPanel,
  settings: SettingsPanel,
};

export function PanelHost() {
  const activePanel = useUIStore((s) => s.activePanel);
  const closePanel = useUIStore((s) => s.closePanel);

  useEffect(() => {
    if (!activePanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activePanel, closePanel]);

  useEffect(() => {
    document.body.style.overflow = activePanel ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [activePanel]);

  const Panel = activePanel ? PANEL_COMPONENTS[activePanel] : null;

  return (
    <AnimatePresence>
      {activePanel && Panel && (
        <motion.div
          key="backdrop"
          className="fixed inset-0 z-40"
          style={{ background: "color-mix(in srgb, #000 55%, transparent)", backdropFilter: "blur(8px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={closePanel}
          aria-hidden="true"
        >
          <motion.div
            key="window"
            role="dialog"
            aria-modal="true"
            aria-label={`${activePanel} panel`}
            className="
              absolute inset-x-0 bottom-0 top-auto flex max-h-[92dvh] flex-col overflow-hidden
              sm:inset-x-4 sm:top-14 sm:bottom-14 sm:mx-auto sm:max-h-none sm:max-w-3xl
              lg:max-w-4xl
            "
            style={{
              background: "color-mix(in srgb, var(--card-solid) 96%, transparent)",
              borderTopLeftRadius: "calc(var(--app-radius) + 6px)",
              borderTopRightRadius: "calc(var(--app-radius) + 6px)",
              border: "1px solid var(--border-c)",
              boxShadow: "var(--shadow-3)",
              backdropFilter: "blur(24px)",
            }}
            initial={{ opacity: 0, y: 44, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Panel />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
