"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { WidgetCard } from "../widget-card";
import { useSessionStore } from "@/lib/store/session-store";
import { useStudyStore } from "@/lib/store/study-store";
import { useUIStore } from "@/lib/store/ui-store";
import { fmtDuration, fmtMinutes } from "@/lib/utils";
import { History, ChevronRight } from "lucide-react";

const MODE_LABEL: Record<string, string> = {
  pomodoro: "Pomodoro",
  deepwork: "Deep work",
  custom: "Focus",
  stopwatch: "Stopwatch",
  countdown: "Countdown",
};

export function SessionHistoryWidget() {
  const sessions = useSessionStore((s) => s.sessions);
  const subjects = useStudyStore((s) => s.subjects);
  const chapters = useStudyStore((s) => s.chapters);
  const openPanel = useUIStore((s) => s.openPanel);

  const recent = useMemo(() => sessions.slice(0, 6), [sessions]);

  return (
    <WidgetCard
      title="Session history"
      icon={<History className="h-4 w-4" />}
      actions={
        <button
          className="press flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-c transition-colors hover:text-[var(--text)]"
          onClick={() => openPanel("analytics")}
          aria-label="Open analytics"
        >
          All <ChevronRight className="h-3.5 w-3.5" />
        </button>
      }
    >
      {recent.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-5 text-center">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: "color-mix(in srgb, var(--text) 6%, transparent)" }}
            aria-hidden="true"
          >
            <History className="h-4 w-4 text-muted-c" />
          </div>
          <p className="text-sm font-medium">No sessions yet</p>
          <p className="max-w-[230px] text-xs text-muted-c">
            Run your first focus session — it lands here with duration, subject and completion.
          </p>
        </div>
      ) : (
        <ul className="space-y-0.5">
          {recent.map((s) => {
            const subject = subjects.find((x) => x.id === s.subjectId);
            const chapter = chapters.find((x) => x.id === s.chapterId);
            return (
              <li
                key={s.id}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)]"
              >
                <span
                  className="h-6 w-1 shrink-0 rounded-full"
                  style={{ background: s.completed ? "var(--positive)" : "color-mix(in srgb, var(--warning) 70%, transparent)" }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {s.label || chapter?.name || MODE_LABEL[s.mode] || "Focus session"}
                  </div>
                  <div className="truncate text-[10px] text-muted-c">
                    {format(new Date(s.startedAt), "d MMM · HH:mm")}
                    {subject && ` · ${subject.name}`}
                    {chapter && ` · ${chapter.name}`}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {fmtDuration(s.durationMs, { hours: true })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}
