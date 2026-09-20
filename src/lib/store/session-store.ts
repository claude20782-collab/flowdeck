"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { idbPersistConfig } from "./config";
import type { FocusSession } from "@/lib/types";

interface SessionStore {
  sessions: FocusSession[];
  hydrated: boolean;
  _setHydrated: () => void;
  addSession: (session: FocusSession) => void;
  deleteSession: (id: string) => void;
  updateSession: (id: string, patch: Partial<FocusSession>) => void;
  clearAll: () => void;
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      sessions: [],
      hydrated: false,
      _setHydrated: () => set({ hydrated: true }),
      addSession: (session) => set((s) => ({ sessions: [session, ...s.sessions] })),
      deleteSession: (id) => set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) })),
      updateSession: (id, patch) =>
        set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      clearAll: () => set({ sessions: [] }),
    }),
    idbPersistConfig<SessionStore>("flowdeck-sessions")
  )
);
