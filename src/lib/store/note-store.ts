"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { idbPersistConfig } from "./config";
import type { Note } from "@/lib/types";
import { uid } from "@/lib/utils";

interface NoteStore {
  notes: Note[];
  hydrated: boolean;
  _setHydrated: () => void;
  createNote: (input?: { title?: string; content?: string; tags?: string[] }) => Note;
  updateNote: (id: string, patch: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  togglePin: (id: string) => void;
  archiveNote: (id: string, archived: boolean) => void;
}

export const useNoteStore = create<NoteStore>()(
  persist(
    (set, get) => ({
      notes: [],
      hydrated: false,
      _setHydrated: () => set({ hydrated: true }),

      createNote: (input) => {
        const now = Date.now();
        const note: Note = {
          id: uid(),
          title: input?.title ?? "",
          content: input?.content ?? "",
          tags: input?.tags ?? [],
          pinned: false,
          archived: false,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ notes: [note, ...s.notes] }));
        return note;
      },

      updateNote: (id, patch) =>
        set((s) => ({
          notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)),
        })),

      deleteNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),

      togglePin: (id) =>
        set((s) => ({ notes: s.notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)) })),

      archiveNote: (id, archived) =>
        set((s) => ({ notes: s.notes.map((n) => (n.id === id ? { ...n, archived } : n)) })),
    }),
    idbPersistConfig<NoteStore>("flowdeck-notes")
  )
);
