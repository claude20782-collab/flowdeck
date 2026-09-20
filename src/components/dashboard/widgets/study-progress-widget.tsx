"use client";

import { useMemo } from "react";
import { WidgetCard } from "../widget-card";
import { useStudyStore, subjectStats } from "@/lib/store/study-store";
import { useSessionStore } from "@/lib/store/session-store";
import { useUIStore } from "@/lib/store/ui-store";
import { ProgressRing } from "@/components/charts/primitives";
import { GraduationCap, ChevronRight } from "lucide-react";

export function StudyProgressWidget() {
  const subjects = useStudyStore((s) => s.subjects);
  const chapters = useStudyStore((s) => s.chapters);
  const pyq = useStudyStore((s) => s.pyq);
  const sessions = useSessionStore((s) => s.sessions);
  const openPanel = useUIStore((s) => s.openPanel);

  const perSubject = useMemo(
    () =>
      subjects
        .filter((s) => !s.archived)
        .map((s) => {
          const stats = subjectStats(s.id, chapters, pyq);
          const minutes = sessions
            .filter((se) => se.subjectId === s.id)
            .reduce((m, se) => m + se.durationMs, 0) / 60000;
          return { subject: s, ...stats, minutes };
        }),
    [subjects, chapters, pyq, sessions]
  );

  const totalChapters = perSubject.reduce((m, s) => m + s.total, 0);
  const totalMastered = perSubject.reduce((m, s) => m + s.mastered, 0);
  const overall = totalChapters > 0 ? Math.round((totalMastered / totalChapters) * 100) : 0;
  const weekMinutes = Math.round(
    sessions
      .filter((s) => s.subjectId && s.startedAt > Date.now() - 7 * 86400_000)
      .reduce((m, s) => m + s.durationMs, 0) / 60000
  );

  return (
    <WidgetCard
      title="Study progress"
      icon={<GraduationCap className="h-4 w-4" />}
      actions={
        <button
          className="press flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-c transition-colors hover:text-[var(--text)]"
          onClick={() => openPanel("study")}
          aria-label="Open study dashboard"
        >
          Syllabus <ChevronRight className="h-3.5 w-3.5" />
        </button>
      }
    >
      {totalChapters === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-4 text-center">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: "color-mix(in srgb, var(--text) 6%, transparent)" }}
            aria-hidden="true"
          >
            <GraduationCap className="h-5 w-5 text-muted-c" />
          </div>
          <p className="text-sm font-medium">Syllabus not set up yet</p>
          <p className="max-w-[240px] text-xs text-muted-c">
            Add your chapters per subject in the study dashboard — progress, revision queue and weak topics
            flow from there.
          </p>
          <button
            className="press mt-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            onClick={() => openPanel("study")}
          >
            Set up syllabus
          </button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-4">
            <ProgressRing
              value={totalMastered}
              max={totalChapters}
              size={84}
              thickness={8}
              label={`${overall}%`}
              sublabel="mastered"
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              {perSubject.map(({ subject, total, mastered, minutes }) => (
                <div key={subject.id} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: subject.color }} aria-hidden="true" />
                  <span className="w-20 shrink-0 truncate text-xs font-medium">{subject.name}</span>
                  <div
                    className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"
                    style={{ background: "color-mix(in srgb, var(--text) 10%, transparent)" }}
                    role="progressbar"
                    aria-valuenow={total ? Math.round((mastered / total) * 100) : 0}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${subject.name} progress`}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${total ? (mastered / total) * 100 : 0}%`, background: subject.color }}
                    />
                  </div>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-c">
                    {mastered}/{total}
                  </span>
                </div>
              ))}
              <div className="pt-1 text-[11px] text-muted-c">
                {weekMinutes > 0 ? (
                  <>
                    <span className="font-semibold text-accent">{weekMinutes >= 60 ? `${Math.round(weekMinutes / 60)}h` : `${weekMinutes}m`}</span> studied this week
                  </>
                ) : (
                  "No tagged study time this week"
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </WidgetCard>
  );
}
