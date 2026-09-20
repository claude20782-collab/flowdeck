"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { lsPersistConfig } from "./config";
import type { WidgetInstance, WidgetType, Workspace, WorkspaceKind, QuickLink } from "@/lib/types";
import { uid } from "@/lib/utils";

/* ============================================================
 * Workspaces — each workspace is a saved dashboard layout.
 * ============================================================ */

const W = (
  name: string,
  icon: string,
  kind: WorkspaceKind,
  widgets: [WidgetType, number, Record<string, unknown>?][]
): Workspace => ({
  id: `ws-${kind}-${uid().slice(0, 6)}`,
  name,
  icon,
  kind,
  animationOverride: null,
  createdAt: Date.now(),
  widgets: widgets.map(([type, size, config]) => ({
    id: `w-${type}-${uid().slice(0, 6)}`,
    type,
    size: size as WidgetInstance["size"],
    config: config ?? {},
    visible: true,
  })),
});

export function defaultWorkspaces(): Workspace[] {
  return [
    W("Focus", "crosshair", "focus", [
      ["clock", 4, { variant: "hero" }],
      ["timer", 4],
      ["quote", 2],
      ["sound", 2],
    ]),
    W("Study", "graduation-cap", "study", [
      ["clock", 2],
      ["timer", 2, { showMeta: true }],
      ["jee", 4],
      ["study-progress", 2],
      ["pyq", 2],
      ["tasks", 2, { filter: "today" }],
    ]),
    W("Planning", "calendar-days", "planning", [
      ["greeting", 4],
      ["tasks", 2, { filter: "today" }],
      ["calendar", 2],
      ["habits", 2],
      ["goals", 2],
      ["notes", 2],
    ]),
    W("Analytics", "chart-line", "analytics", [
      ["focus-stats", 2],
      ["study-progress", 2],
      ["heatmap", 4],
      ["session-history", 2],
      ["daily-review", 2],
    ]),
  ];
}

interface WorkspaceStore {
  workspaces: Workspace[];
  activeId: string | null;
  quickLinks: QuickLink[];
  hydrated: boolean;
  _setHydrated: () => void;
  setActive: (id: string) => void;
  addWorkspace: (input: { name: string; icon: string; kind?: WorkspaceKind; cloneFrom?: string }) => Workspace;
  updateWorkspace: (id: string, patch: Partial<Workspace>) => void;
  deleteWorkspace: (id: string) => void;
  resetToDefaults: () => void;
  /* widget ops on the active workspace */
  addWidget: (workspaceId: string, type: WidgetType, size?: WidgetInstance["size"]) => void;
  removeWidget: (workspaceId: string, widgetId: string) => void;
  updateWidget: (workspaceId: string, widgetId: string, patch: Partial<WidgetInstance>) => void;
  cycleWidgetSize: (workspaceId: string, widgetId: string) => void;
  reorderWidgets: (workspaceId: string, orderedWidgetIds: string[]) => void;
  resetWorkspace: (workspaceId: string) => void;
  /* quick links */
  addQuickLink: (link: Omit<QuickLink, "id">) => void;
  updateQuickLink: (id: string, patch: Partial<QuickLink>) => void;
  deleteQuickLink: (id: string) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      workspaces: defaultWorkspaces(),
      activeId: null,
      quickLinks: [
        { id: uid(), label: "PW Live", url: "https://www.pw.live" },
        { id: uid(), label: "NTA JEE", url: "https://jeemain.nta.nic.in" },
      ],
      hydrated: false,
      _setHydrated: () => set({ hydrated: true }),

      setActive: (id) => set({ activeId: id }),

      addWorkspace: ({ name, icon, kind = "custom", cloneFrom }) => {
        const ws: Workspace = cloneFrom
          ? {
              ...structuredClone(get().workspaces.find((w) => w.id === cloneFrom)!),
              id: `ws-${uid().slice(0, 8)}`,
              name,
              icon,
              kind,
              createdAt: Date.now(),
            }
          : {
              id: `ws-${uid().slice(0, 8)}`,
              name,
              icon,
              kind,
              animationOverride: null,
              createdAt: Date.now(),
              widgets: [],
            };
        set((s) => ({ workspaces: [...s.workspaces, ws] }));
        return ws;
      },

      updateWorkspace: (id, patch) =>
        set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, ...patch } : w)) })),

      deleteWorkspace: (id) => {
        const rest = get().workspaces.filter((w) => w.id !== id);
        if (rest.length === 0) return; // never delete the last workspace
        set({
          workspaces: rest,
          activeId: get().activeId === id ? rest[0].id : get().activeId,
        });
      },

      resetToDefaults: () => {
        const defaults = defaultWorkspaces();
        set({ workspaces: defaults, activeId: defaults[0].id });
      },

      addWidget: (workspaceId, type, size = 2) => {
        const widget: WidgetInstance = {
          id: `w-${type}-${uid().slice(0, 6)}`,
          type,
          size,
          config: {},
          visible: true,
        };
        set((s) => ({
          workspaces: s.workspaces.map((w) => (w.id === workspaceId ? { ...w, widgets: [...w.widgets, widget] } : w)),
        }));
      },

      removeWidget: (workspaceId, widgetId) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === workspaceId ? { ...w, widgets: w.widgets.filter((x) => x.id !== widgetId) } : w
          ),
        })),

      updateWidget: (workspaceId, widgetId, patch) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === workspaceId
              ? { ...w, widgets: w.widgets.map((x) => (x.id === widgetId ? { ...x, ...patch } : x)) }
              : w
          ),
        })),

      cycleWidgetSize: (workspaceId, widgetId) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === workspaceId
              ? {
                  ...w,
                  widgets: w.widgets.map((x) =>
                    x.id === widgetId ? { ...x, size: ((x.size % 4) + 1) as WidgetInstance["size"] } : x
                  ),
                }
              : w
          ),
        })),

      reorderWidgets: (workspaceId, orderedWidgetIds) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) => {
            if (w.id !== workspaceId) return w;
            const map = new Map(w.widgets.map((x) => [x.id, x]));
            const next = orderedWidgetIds.map((id) => map.get(id)!).filter(Boolean);
            for (const x of w.widgets) {
              if (!orderedWidgetIds.includes(x.id)) next.push(x);
            }
            return { ...w, widgets: next };
          }),
        })),

      resetWorkspace: (workspaceId) => {
        const defaults = defaultWorkspaces();
        const target = get().workspaces.find((w) => w.id === workspaceId);
        if (!target) return;
        const match =
          defaults.find((w) => w.kind === target.kind) ?? defaults[0];
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === workspaceId ? { ...match, id: workspaceId, name: w.name, icon: w.icon, kind: w.kind } : w
          ),
        }));
      },

      addQuickLink: (link) => set((s) => ({ quickLinks: [...s.quickLinks, { ...link, id: uid() }] })),
      updateQuickLink: (id, patch) =>
        set((s) => ({ quickLinks: s.quickLinks.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
      deleteQuickLink: (id) => set((s) => ({ quickLinks: s.quickLinks.filter((l) => l.id !== id) })),
    }),
    lsPersistConfig<WorkspaceStore>("flowdeck-workspaces", {
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<WorkspaceStore>;
        const workspaces = p.workspaces?.length ? p.workspaces : defaultWorkspaces();
        return {
          ...current,
          ...p,
          workspaces,
          activeId: p.activeId && workspaces.some((w) => w.id === p.activeId) ? p.activeId : workspaces[0].id,
        } as WorkspaceStore;
      },
    })
  )
);
