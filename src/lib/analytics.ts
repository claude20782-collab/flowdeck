import type { FocusSession, Habit, PyqEntry, StudyLogEntry, Task } from "@/lib/types";
import { dateKey, daysAgoKey, todayKey } from "@/lib/utils";

/* ============================================================
 * Pure analytics helpers — shared by widgets, panels, heatmap.
 * All values derive from REAL stored data only.
 * ============================================================ */

export interface DayStat {
  date: string; // YYYY-MM-DD
  minutes: number;
  sessions: number;
}

/** Focus minutes per day for the last N days (oldest → newest). */
export function focusByDay(sessions: FocusSession[], days: number): DayStat[] {
  const map = new Map<string, DayStat>();
  for (let i = days - 1; i >= 0; i--) {
    const key = daysAgoKey(i);
    map.set(key, { date: key, minutes: 0, sessions: 0 });
  }
  for (const s of sessions) {
    const key = dateKey(s.startedAt);
    const entry = map.get(key);
    if (entry) {
      entry.minutes += s.durationMs / 60000;
      entry.sessions += 1;
    }
  }
  return [...map.values()];
}

/** Consecutive days (ending today or yesterday) with ≥1 focus session. */
export function focusStreak(sessions: FocusSession[]): number {
  const days = new Set(sessions.map((s) => dateKey(s.startedAt)));
  let streak = 0;
  const cursor = new Date();
  if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1); // today not required yet
  while (days.has(dateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function totalFocusMinutes(sessions: FocusSession[]): number {
  return sessions.reduce((m, s) => m + s.durationMs, 0) / 60000;
}

export function sessionsToday(sessions: FocusSession[]): FocusSession[] {
  const today = todayKey();
  return sessions.filter((s) => dateKey(s.startedAt) === today);
}

/** Focus minutes today: completed sessions plus live in-progress session time (if focus phase). */
export function focusMinutesToday(sessions: FocusSession[], liveFocusMs = 0): number {
  const done = sessionsToday(sessions).reduce((m, s) => m + s.durationMs, 0) / 60000;
  return done + liveFocusMs / 60000;
}

/** Average completed-session length in minutes. */
export function avgSessionMinutes(sessions: FocusSession[]): number {
  if (sessions.length === 0) return 0;
  return totalFocusMinutes(sessions) / sessions.length;
}

/** PYQ attempted/correct per day for the last N days. */
export function pyqByDay(pyq: PyqEntry[], days: number): { date: string; attempted: number; correct: number }[] {
  const map = new Map<string, { date: string; attempted: number; correct: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const key = daysAgoKey(i);
    map.set(key, { date: key, attempted: 0, correct: 0 });
  }
  for (const p of pyq) {
    const entry = map.get(p.date);
    if (entry) {
      entry.attempted += p.attempted;
      entry.correct += p.correct;
    }
  }
  return [...map.values()];
}

/** Tasks completed per day for the last N days. */
export function tasksCompletedByDay(tasks: Task[], days: number): { date: string; count: number }[] {
  const map = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) map.set(daysAgoKey(i), 0);
  for (const t of tasks) {
    if (t.done && t.completedAt) {
      const key = dateKey(t.completedAt);
      if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return [...map.entries()].map(([date, count]) => ({ date, count }));
}

/** Habits completed per day for the last N days (any habit log). */
export function habitCompletionByDay(
  logs: { habitId: string; date: string; count: number }[],
  days: number
): { date: string; count: number }[] {
  const map = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) map.set(daysAgoKey(i), 0);
  for (const l of logs) {
    if (l.count > 0 && map.has(l.date)) map.set(l.date, (map.get(l.date) ?? 0) + 1);
  }
  return [...map.entries()].map(([date, count]) => ({ date, count }));
}

/** Study minutes per day (manual logs + tagged sessions) for last N days. */
export function studyByDay(
  sessions: FocusSession[],
  studyLogs: StudyLogEntry[],
  days: number
): { date: string; minutes: number }[] {
  const map = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) map.set(daysAgoKey(i), 0);
  for (const s of sessions) {
    if (s.subjectId) {
      const key = dateKey(s.startedAt);
      if (map.has(key)) map.set(key, (map.get(key) ?? 0) + s.durationMs / 60000);
    }
  }
  for (const l of studyLogs) {
    if (map.has(l.date)) map.set(l.date, (map.get(l.date) ?? 0) + l.minutes);
  }
  return [...map.entries()].map(([date, minutes]) => ({ date, minutes }));
}

export type HeatMetric = "focus" | "study" | "questions" | "tasks" | "habits";

/** Unified heatmap series over the last N days. */
export function heatmapSeries(
  metric: HeatMetric,
  days: number,
  ctx: {
    sessions: FocusSession[];
    studyLogs: StudyLogEntry[];
    pyq: PyqEntry[];
    tasks: Task[];
    habitLogs: { habitId: string; date: string; count: number }[];
    habits: Habit[];
  }
): { date: string; value: number }[] {
  switch (metric) {
    case "focus":
      return focusByDay(ctx.sessions, days).map((d) => ({ date: d.date, value: d.minutes }));
    case "study":
      return studyByDay(ctx.sessions, ctx.studyLogs, days).map((d) => ({ date: d.date, value: d.minutes }));
    case "questions":
      return pyqByDay(ctx.pyq, days).map((d) => ({ date: d.date, value: d.attempted }));
    case "tasks":
      return tasksCompletedByDay(ctx.tasks, days).map((d) => ({ date: d.date, value: d.count }));
    case "habits":
      return habitCompletionByDay(ctx.habitLogs, days).map((d) => ({ date: d.date, value: d.count }));
  }
}

/** Overall daily review score inputs. */
export function dayReview(
  dateKeyStr: string,
  ctx: {
    sessions: FocusSession[];
    studyLogs: StudyLogEntry[];
    pyq: PyqEntry[];
    tasks: Task[];
    habits: Habit[];
    habitLogs: { habitId: string; date: string; count: number }[];
  }
) {
  const focusMin = ctx.sessions
    .filter((s) => dateKey(s.startedAt) === dateKeyStr)
    .reduce((m, s) => m + s.durationMs / 60000, 0);
  const studyMin =
    focusMin * 0 +
    ctx.studyLogs.filter((l) => l.date === dateKeyStr).reduce((m, l) => m + l.minutes, 0) +
    ctx.sessions
      .filter((s) => dateKey(s.startedAt) === dateKeyStr && s.subjectId)
      .reduce((m, s) => m + s.durationMs / 60000, 0);
  const questions = ctx.pyq
    .filter((p) => p.date === dateKeyStr)
    .reduce((m, p) => m + p.attempted, 0);
  const correct = ctx.pyq.filter((p) => p.date === dateKeyStr).reduce((m, p) => m + p.correct, 0);
  const tasksDone = ctx.tasks.filter((t) => t.done && t.completedAt && dateKey(t.completedAt) === dateKeyStr).length;
  const scheduledHabits = ctx.habits.filter(
    (h) => !h.archived && (h.freq.kind === "daily" || h.freq.kind === "times-per-week")
  );
  const habitsDone = ctx.habitLogs.filter((l) => l.date === dateKeyStr && l.count > 0).length;
  return { focusMin, studyMin, questions, correct, tasksDone, habitsDone, habitsTotal: scheduledHabits.length };
}
