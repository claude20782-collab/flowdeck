"use client";

import { useMemo } from "react";
import { WidgetCard } from "../widget-card";
import { useSessionStore } from "@/lib/store/session-store";
import { useTaskStore } from "@/lib/store/task-store";
import { useHabitStore } from "@/lib/store/habit-store";
import { useStudyStore } from "@/lib/store/study-store";
import { useUIStore } from "@/lib/store/ui-store";
import { dayReview } from "@/lib/analytics";
import { todayKey, fmtMinutes } from "@/lib/utils";
import { ClipboardCheck, ChevronRight, Check } from "lucide-react";

export function DailyReviewWidget() {
  const sessions = useSessionStore((s) => s.sessions);
  const tasks = useTaskStore((s) => s.tasks);
  const habits = useHabitStore((s) => s.habits);
  const logs = useHabitStore((s) => s.logs);
  const pyq = useStudyStore((s) => s.pyq);
  const studyLogs = useStudyStore((s) => s.studyLogs);
  const openPanel = useUIStore((s) => s.openPanel);

  const review = useMemo(
    () => dayReview(todayKey(), { sessions, tasks, habits, habitLogs: logs, pyq, studyLogs }),
    [sessions, tasks, habits, logs, pyq, studyLogs]
  );

  const rows = [
    { label: "Focus time", value: fmtMinutes(review.focusMin), done: review.focusMin >= 60 },
    {
      label: "Study time",
      value: fmtMinutes(review.studyMin),
      done: review.studyMin >= 90,
    },
    { label: "Questions", value: String(review.questions), done: review.questions >= 30 },
    {
      label: "Tasks completed",
      value: String(review.tasksDone),
      done: review.tasksDone >= 3,
    },
    {
      label: "Habits",
      value: review.habitsTotal > 0 ? `${review.habitsDone}/${review.habitsTotal}` : "—",
      done: review.habitsTotal > 0 && review.habitsDone === review.habitsTotal,
    },
  ];

  const score = rows.filter((r) => r.done).length;

  return (
    <WidgetCard
      title="Daily review"
      icon={<ClipboardCheck className="h-4 w-4" />}
      actions={
        <button
          className="press flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-c transition-colors hover:text-[var(--text)]"
          onClick={() => openPanel("analytics")}
          aria-label="Open analytics"
        >
          Stats <ChevronRight className="h-3.5 w-3.5" />
        </button>
      }
    >
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex gap-1" aria-label={`${score} of 5 targets met`}>
          {rows.map((r, i) => (
            <span
              key={i}
              className="h-1.5 w-6 rounded-full transition-colors"
              style={{ background: r.done ? "var(--positive)" : "color-mix(in srgb, var(--text) 12%, transparent)" }}
              aria-hidden="true"
            />
          ))}
        </div>
        <span className="text-xs font-semibold tabular-nums text-muted-c">{score}/5 targets</span>
      </div>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)]"
          >
            <span
              className="flex h-4.5 w-4.5 h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
              style={{
                background: r.done ? "var(--positive)" : "color-mix(in srgb, var(--text) 8%, transparent)",
              }}
              aria-hidden="true"
            >
              {r.done && <Check className="h-2.5 w-2.5 text-white" strokeWidth={4} />}
            </span>
            <span className="flex-1 text-sm">{r.label}</span>
            <span className="text-sm font-semibold tabular-nums">{r.value}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] leading-snug text-muted-c">
        Daily targets: 1h focus · 1.5h study · 30 questions · 3 tasks · all habits.
      </p>
    </WidgetCard>
  );
}
