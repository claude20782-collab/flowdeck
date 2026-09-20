"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { WidgetCard } from "../widget-card";
import {
  useStudyStore,
  subjectStats,
  chapterStats,
  revisionQueue,
  weakTopics,
} from "@/lib/store/study-store";
import { useSessionStore } from "@/lib/store/session-store";
import { useUIStore } from "@/lib/store/ui-store";
import { todayKey, fmtMinutes } from "@/lib/utils";
import { HBarChart } from "@/components/charts/primitives";
import { ChartColumnBig, ChevronRight, RefreshCcw, AlertTriangle, BrainCircuit } from "lucide-react";

export function JeeWidget() {
  const subjects = useStudyStore((s) => s.subjects);
  const chapters = useStudyStore((s) => s.chapters);
  const pyq = useStudyStore((s) => s.pyq);
  const mocks = useStudyStore((s) => s.mocks);
  const studyLogs = useStudyStore((s) => s.studyLogs);
  const sessions = useSessionStore((s) => s.sessions);
  const openPanel = useUIStore((s) => s.openPanel);

  const today = todayKey();

  const data = useMemo(() => {
    const todayStudyMin =
      studyLogs.filter((l) => l.date === today).reduce((m, l) => m + l.minutes, 0) +
      sessions
        .filter((s) => s.subjectId && format(new Date(s.startedAt), "yyyy-MM-dd") === today)
        .reduce((m, s) => m + s.durationMs / 60000, 0);
    const weekStudyMin =
      studyLogs
        .filter((l) => l.date >= format(new Date(Date.now() - 6 * 86400_000), "yyyy-MM-dd"))
        .reduce((m, l) => m + l.minutes, 0) +
      sessions
        .filter((s) => s.subjectId && s.startedAt > Date.now() - 7 * 86400_000)
        .reduce((m, s) => m + s.durationMs / 60000, 0);

    const perSubject = subjects
      .filter((s) => !s.archived)
      .map((s) => ({ subject: s, ...subjectStats(s.id, chapters, pyq) }));

    const totalQuestions = pyq.reduce((m, p) => m + p.attempted, 0);
    const totalCorrect = pyq.reduce((m, p) => m + p.correct, 0);
    const accuracy = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    const revision = revisionQueue(chapters, 14).slice(0, 5);
    const weak = weakTopics(chapters, pyq).slice(0, 5);
    const lastMock = [...mocks].sort((a, b) => b.date.localeCompare(a.date))[0];

    return { todayStudyMin, weekStudyMin, perSubject, totalQuestions, accuracy, revision, weak, lastMock };
  }, [subjects, chapters, pyq, mocks, studyLogs, sessions, today]);

  const hasAnyData = chapters.length > 0 || pyq.length > 0 || mocks.length > 0;

  return (
    <WidgetCard
      title="JEE dashboard"
      icon={<ChartColumnBig className="h-4 w-4" />}
      actions={
        <button
          className="press flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-c transition-colors hover:text-[var(--text)]"
          onClick={() => openPanel("study")}
          aria-label="Open full study system"
        >
          Full study system <ChevronRight className="h-3.5 w-3.5" />
        </button>
      }
    >
      {!hasAnyData ? (
        <EmptyJee onOpen={() => openPanel("study")} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* top row: study time + questions + accuracy */}
          <div className="grid grid-cols-3 gap-2 lg:col-span-3">
            <Metric label="Study today" value={fmtMinutes(data.todayStudyMin)} />
            <Metric label="This week" value={fmtMinutes(data.weekStudyMin)} />
            <Metric
              label="Questions"
              value={String(data.totalQuestions)}
              sub={data.totalQuestions > 0 ? `${data.accuracy}% accuracy` : "log PYQs to track"}
            />
          </div>

          {/* subject bars */}
          <div className="lg:col-span-2">
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-c">
              Subject mastery
            </h4>
            {data.perSubject.length > 0 ? (
              <HBarChart
                data={data.perSubject.map(({ subject, total, mastered, accuracy }) => ({
                  label: subject.name,
                  value: total ? Math.round((mastered / total) * 100) : 0,
                  color: subject.color,
                  hint: `${mastered}/${total} chapters mastered · ${accuracy}% PYQ accuracy`,
                }))}
                formatValue={(v) => `${v}%`}
              />
            ) : (
              <p className="py-3 text-xs text-muted-c">No subjects configured.</p>
            )}

            {/* PYQ accuracy by difficulty */}
            {data.totalQuestions > 0 && (
              <div className="mt-3">
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-c">
                  Accuracy by difficulty
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  {(["easy", "medium", "hard"] as const).map((diff) => {
                    const rows = pyq.filter((p) => p.difficulty === diff);
                    const att = rows.reduce((m, p) => m + p.attempted, 0);
                    const cor = rows.reduce((m, p) => m + p.correct, 0);
                    const acc = att ? Math.round((cor / att) * 100) : 0;
                    return (
                      <div
                        key={diff}
                        className="rounded-xl px-3 py-2"
                        style={{ background: "color-mix(in srgb, var(--text) 5%, transparent)" }}
                      >
                        <div className="text-[10px] font-medium capitalize text-muted-c">{diff}</div>
                        <div className="text-base font-semibold tabular-nums">
                          {att > 0 ? `${acc}%` : "—"}
                        </div>
                        <div className="text-[10px] tabular-nums text-muted-c">{att} attempted</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* right column: revision queue + weak topics + last mock */}
          <div className="space-y-3">
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-c">
                <RefreshCcw className="h-3 w-3" aria-hidden="true" /> Revision queue
              </h4>
              {data.revision.length > 0 ? (
                <ul className="space-y-1">
                  {data.revision.map((c) => {
                    const subject = subjects.find((s) => s.id === c.subjectId);
                    const stats = chapterStats(c.id, pyq);
                    return (
                      <li key={c.id} className="flex items-center gap-2 text-xs">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: subject?.color }} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{c.name}</span>
                        <span className="shrink-0 text-[10px] text-muted-c">
                          {c.lastRevisedAt
                            ? `${Math.round((Date.now() - c.lastRevisedAt) / 86400_000)}d ago`
                            : "never"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="py-1.5 text-xs text-muted-c">
                  {chapters.length === 0 ? "Add chapters to build the queue." : "Nothing due — all fresh. 🎯"}
                </p>
              )}
            </div>

            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-c">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Weak topics
              </h4>
              {data.weak.length > 0 ? (
                <ul className="space-y-1">
                  {data.weak.map((c) => {
                    const stats = chapterStats(c.id, pyq);
                    const subject = subjects.find((s) => s.id === c.subjectId);
                    return (
                      <li key={c.id} className="flex items-center gap-2 text-xs">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: subject?.color }} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{c.name}</span>
                        <span className="shrink-0 text-[10px]" style={{ color: "var(--negative)" }}>
                          {stats.attempted > 0 ? `${stats.accuracy}%` : `${c.confidence}/5 conf`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="py-1.5 text-xs text-muted-c">
                  {chapters.length === 0 ? "No chapters yet." : "No weak topics detected."}
                </p>
              )}
            </div>

            {data.lastMock && (
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-c">
                  <BrainCircuit className="h-3 w-3" aria-hidden="true" /> Last mock
                </h4>
                <button
                  className="press w-full rounded-xl px-3 py-2.5 text-left"
                  style={{ background: "color-mix(in srgb, var(--text) 5%, transparent)" }}
                  onClick={() => openPanel("study")}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-medium">{data.lastMock.examName}</span>
                    <span className="text-sm font-bold tabular-nums text-accent">
                      {data.lastMock.total ?? "—"}
                      {data.lastMock.maxTotal ? `/${data.lastMock.maxTotal}` : ""}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-c">
                    {format(new Date(data.lastMock.date + "T12:00"), "d MMM")} ·{" "}
                    {data.lastMock.attempted > 0
                      ? `${Math.round((data.lastMock.correct / data.lastMock.attempted) * 100)}% accuracy`
                      : "no accuracy data"}
                    {data.lastMock.percentile != null && ` · ${data.lastMock.percentile}%ile`}
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{ background: "color-mix(in srgb, var(--text) 5%, transparent)" }}
    >
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-c">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-muted-c">{sub}</div>}
    </div>
  );
}

function EmptyJee({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }}
        aria-hidden="true"
      >
        <ChartColumnBig className="h-6 w-6 text-accent" />
      </div>
      <p className="text-base font-semibold">Your JEE command center</p>
      <p className="max-w-[420px] text-sm text-muted-c">
        Track chapters, PYQ practice, accuracy, revision and mocks — built around <em>your</em> syllabus, not a
        hardcoded one.
      </p>
      <button
        className="press mt-1.5 rounded-full px-4 py-2 text-sm font-semibold"
        style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        onClick={onOpen}
      >
        Set up your syllabus
      </button>
    </div>
  );
}
