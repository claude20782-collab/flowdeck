"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { idbPersistConfig } from "./config";
import type { Chapter, ChapterStatus, MockTest, PyqEntry, StudyLogEntry, Subject } from "@/lib/types";
import { uid, todayKey } from "@/lib/utils";

/* ============================================================
 * JEE study system — fully configurable syllabus.
 * Nothing about the user's syllabus is hardcoded: three starter
 * subjects are seeded (editable/deletable) with zero chapters.
 * ============================================================ */

const STARTER_SUBJECTS: Subject[] = [
  { id: "subj-physics", name: "Physics", color: "#e879f9", createdAt: Date.now(), archived: false },
  { id: "subj-chemistry", name: "Chemistry", color: "#34d399", createdAt: Date.now() + 1, archived: false },
  { id: "subj-maths", name: "Mathematics", color: "#fbbf24", createdAt: Date.now() + 2, archived: false },
];

interface StudyStore {
  subjects: Subject[];
  chapters: Chapter[];
  pyq: PyqEntry[];
  mocks: MockTest[];
  studyLogs: StudyLogEntry[];
  hydrated: boolean;
  _setHydrated: () => void;
  /* subjects */
  addSubject: (name: string, color: string) => Subject;
  updateSubject: (id: string, patch: Partial<Subject>) => void;
  deleteSubject: (id: string) => void;
  /* chapters */
  addChapter: (subjectId: string, name: string, extra?: Partial<Chapter>) => Chapter;
  updateChapter: (id: string, patch: Partial<Chapter>) => void;
  deleteChapter: (id: string) => void;
  reorderChapter: (subjectId: string, orderedIds: string[]) => void;
  markRevised: (id: string) => void;
  /* PYQ */
  addPyq: (entry: Omit<PyqEntry, "id">) => void;
  updatePyq: (id: string, patch: Partial<PyqEntry>) => void;
  deletePyq: (id: string) => void;
  /* mocks */
  addMock: (entry: Omit<MockTest, "id">) => void;
  updateMock: (id: string, patch: Partial<MockTest>) => void;
  deleteMock: (id: string) => void;
  /* study logs */
  addStudyLog: (entry: Omit<StudyLogEntry, "id">) => void;
  deleteStudyLog: (id: string) => void;
}

export const useStudyStore = create<StudyStore>()(
  persist(
    (set, get) => ({
      subjects: STARTER_SUBJECTS,
      chapters: [],
      pyq: [],
      mocks: [],
      studyLogs: [],
      hydrated: false,
      _setHydrated: () => set({ hydrated: true }),

      addSubject: (name, color) => {
        const subject: Subject = { id: uid(), name, color, createdAt: Date.now(), archived: false };
        set((s) => ({ subjects: [...s.subjects, subject] }));
        return subject;
      },
      updateSubject: (id, patch) =>
        set((s) => ({ subjects: s.subjects.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      deleteSubject: (id) =>
        set((s) => ({
          subjects: s.subjects.filter((x) => x.id !== id),
          chapters: s.chapters.filter((c) => c.subjectId !== id),
          pyq: s.pyq.filter((p) => p.subjectId !== id),
          studyLogs: s.studyLogs.filter((l) => l.subjectId !== id),
        })),

      addChapter: (subjectId, name, extra) => {
        const maxOrder = get().chapters.filter((c) => c.subjectId === subjectId).reduce((m, c) => Math.max(m, c.order), 0);
        const chapter: Chapter = {
          id: uid(),
          subjectId,
          name,
          status: (extra?.status ?? "not-started") as ChapterStatus,
          confidence: extra?.confidence ?? 0,
          weightage: extra?.weightage,
          totalQuestions: extra?.totalQuestions,
          createdAt: Date.now(),
          order: maxOrder + 1,
        };
        set((s) => ({ chapters: [...s.chapters, chapter] }));
        return chapter;
      },
      updateChapter: (id, patch) =>
        set((s) => ({ chapters: s.chapters.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      deleteChapter: (id) =>
        set((s) => ({
          chapters: s.chapters.filter((c) => c.id !== id),
          pyq: s.pyq.map((p) => (p.chapterId === id ? { ...p, chapterId: undefined } : p)),
        })),
      reorderChapter: (subjectId, orderedIds) =>
        set((s) => {
          const orderMap = new Map(orderedIds.map((id, i) => [id, i + 1]));
          return {
            chapters: s.chapters.map((c) =>
              c.subjectId === subjectId && orderMap.has(c.id) ? { ...c, order: orderMap.get(c.id)! } : c
            ),
          };
        }),
      markRevised: (id) =>
        set((s) => ({
          chapters: s.chapters.map((c) =>
            c.id === id
              ? {
                  ...c,
                  lastRevisedAt: Date.now(),
                  status: c.status === "mastered" ? "mastered" : "revised",
                }
              : c
          ),
        })),

      addPyq: (entry) => set((s) => ({ pyq: [{ ...entry, id: uid() }, ...s.pyq] })),
      updatePyq: (id, patch) => set((s) => ({ pyq: s.pyq.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      deletePyq: (id) => set((s) => ({ pyq: s.pyq.filter((p) => p.id !== id) })),

      addMock: (entry) => set((s) => ({ mocks: [{ ...entry, id: uid() }, ...s.mocks] })),
      updateMock: (id, patch) => set((s) => ({ mocks: s.mocks.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
      deleteMock: (id) => set((s) => ({ mocks: s.mocks.filter((m) => m.id !== id) })),

      addStudyLog: (entry) => set((s) => ({ studyLogs: [{ ...entry, id: uid() }, ...s.studyLogs] })),
      deleteStudyLog: (id) => set((s) => ({ studyLogs: s.studyLogs.filter((l) => l.id !== id) })),
    }),
    idbPersistConfig<StudyStore>("flowdeck-study", {
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<StudyStore>;
        /* seed starter subjects only for genuinely fresh installs */
        return {
          ...current,
          ...p,
          subjects: p.subjects ?? STARTER_SUBJECTS,
          hydrated: current.hydrated,
        } as StudyStore;
      },
    })
  )
);

/* ---------- pure analytics helpers ---------- */

export function chapterStats(
  chapterId: string,
  pyq: PyqEntry[]
): { attempted: number; correct: number; accuracy: number } {
  let attempted = 0;
  let correct = 0;
  for (const p of pyq) {
    if (p.chapterId === chapterId) {
      attempted += p.attempted;
      correct += p.correct;
    }
  }
  return { attempted, correct, accuracy: attempted ? Math.round((correct / attempted) * 100) : 0 };
}

export function subjectStats(
  subjectId: string,
  chapters: Chapter[],
  pyq: PyqEntry[]
): { attempted: number; correct: number; accuracy: number; mastered: number; total: number } {
  let attempted = 0;
  let correct = 0;
  for (const p of pyq) {
    if (p.subjectId === subjectId) {
      attempted += p.attempted;
      correct += p.correct;
    }
  }
  const subjectChapters = chapters.filter((c) => c.subjectId === subjectId);
  const mastered = subjectChapters.filter((c) => c.status === "mastered").length;
  return {
    attempted,
    correct,
    accuracy: attempted ? Math.round((correct / attempted) * 100) : 0,
    mastered,
    total: subjectChapters.length,
  };
}

/** Chapters due for revision: learned but not revised recently (14d). */
export function revisionQueue(chapters: Chapter[], days = 14): Chapter[] {
  const cutoff = Date.now() - days * 86400_000;
  return chapters
    .filter((c) => c.status === "learning" || (c.status === "revised" && (c.lastRevisedAt ?? 0) < cutoff))
    .sort((a, b) => (a.lastRevisedAt ?? 0) - (b.lastRevisedAt ?? 0));
}

/** Weak topics: low confidence or low accuracy with attempts. */
export function weakTopics(chapters: Chapter[], pyq: PyqEntry[]): Chapter[] {
  return chapters
    .map((c) => ({ c, stats: chapterStats(c.id, pyq) }))
    .filter(({ c, stats }) => (c.confidence > 0 && c.confidence <= 2) || (stats.attempted >= 10 && stats.accuracy < 50))
    .map(({ c }) => c);
}

export function studyMinutesOn(logs: StudyLogEntry[], date: string): number {
  return logs.filter((l) => l.date === date).reduce((m, l) => m + l.minutes, 0);
}
