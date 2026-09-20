"use client";

import { useMemo, useState } from "react";
import { format, parseISO, startOfWeek } from "date-fns";
import { ChartColumnBig, Flame } from "lucide-react";
import { PanelEmptyState, PanelSection, PanelShell } from "./panel-shell";
import { useSessionStore } from "@/lib/store/session-store";
import { useTaskStore } from "@/lib/store/task-store";
import { useHabitStore } from "@/lib/store/habit-store";
import { useStudyStore } from "@/lib/store/study-store";
import { useSettingsStore } from "@/lib/store/settings-store";
import {
  avgSessionMinutes,
  dayReview,
  focusByDay,
  focusStreak,
  habitCompletionByDay,
  heatmapSeries,
  pyqByDay,
  sessionsToday,
  tasksCompletedByDay,
  totalFocusMinutes,
  type HeatMetric,
} from "@/lib/analytics";
import { BarChart, Heatmap, LineChart } from "@/components/charts/primitives";
import { cn, daysAgoKey, fmtMinutes, todayKey } from "@/lib/utils";

/* ============================================================
 * Analytics panel — every number derives from real stored data
 * (sessions, tasks, habits+logs, PYQ + study logs). No fake data:
 * empty sections show honest muted notes instead of charts.
 * ============================================================ */

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

const METRICS: { id: HeatMetric; label: string }[] = [
  { id: "focus", label: "Focus" },
  { id: "study", label: "Study" },
  { id: "questions", label: "Questions" },
  { id: "tasks", label: "Tasks" },
  { id: "habits", label: "Habits" },
];

interface SeriesPoint {
  date: string;
  value: number;
}

/**
 * Daily points → BarChart data.
 * 7 days → weekday initial · ≤31 days → day-of-month ·
 * longer ranges → weekly buckets (respecting the user's week start)
 * so the bar axis stays readable instead of being silently capped.
 */
function barData(
  points: SeriesPoint[],
  range: Range,
  weekStartsOn: 0 | 1
): { label: string; value: number }[] {
  if (range <= 31) {
    return points.map((p) => ({
      label:
        range <= 7
          ? format(parseISO(p.date + "T12:00"), "EEE").slice(0, 1)
          : format(parseISO(p.date + "T12:00"), "d"),
      value: Math.round(p.value * 10) / 10,
    }));
  }
  const buckets = new Map<string, number>();
  const order: string[] = [];
  for (const p of points) {
    const key = format(startOfWeek(parseISO(p.date + "T00:00"), { weekStartsOn }), "yyyy-MM-dd");
    if (!buckets.has(key)) {
      buckets.set(key, 0);
      order.push(key);
    }
    buckets.set(key, (buckets.get(key) ?? 0) + p.value);
  }
  return order.map((k) => ({
    label: format(parseISO(k + "T12:00"), "d/M"),
    value: Math.round((buckets.get(k) ?? 0) * 10) / 10,
  }));
}

function accuracyTone(pct: number): string {
  if (pct >= 70) return "var(--positive)";
  if (pct >= 50) return "var(--warning)";
  return "var(--negative)";
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{ background: "color-mix(in srgb, var(--text) 5%, transparent)" }}
    >
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-c">{label}</div>
      <div
        className="mt-0.5 text-lg font-semibold leading-tight tabular-nums"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] tabular-nums text-muted-c">{sub}</div>}
    </div>
  );
}

/** Small honest note used where a section has no data at all. */
function NoDataYet({ what }: { what: string }) {
  return <p className="py-2 text-xs text-muted-c">no {what} data yet</p>;
}

export function AnalyticsPanel() {
  const [range, setRange] = useState<Range>(7);
  const [metric, setMetric] = useState<HeatMetric>("focus");

  const sessions = useSessionStore((s) => s.sessions);
  const tasks = useTaskStore((s) => s.tasks);
  const habits = useHabitStore((s) => s.habits);
  const habitLogs = useHabitStore((s) => s.logs);
  const pyq = useStudyStore((s) => s.pyq);
  const studyLogs = useStudyStore((s) => s.studyLogs);
  const weekStartsOn = useSettingsStore((s) => s.weekStart);

  const nothing =
    sessions.length === 0 &&
    tasks.length === 0 &&
    pyq.length === 0 &&
    habitLogs.length === 0 &&
    studyLogs.length === 0;

  /* ---------- today strip ---------- */
  const today = useMemo(
    () => dayReview(todayKey(), { sessions, studyLogs, pyq, tasks, habits, habitLogs }),
    [sessions, studyLogs, pyq, tasks, habits, habitLogs]
  );
  const todaySessionCount = useMemo(() => sessionsToday(sessions).length, [sessions]);

  /* ---------- focus ---------- */
  const focusDaily = useMemo(() => focusByDay(sessions, range), [sessions, range]);
  const focusBars = useMemo(
    () =>
      barData(
        focusDaily.map((d) => ({ date: d.date, value: d.minutes })),
        range,
        weekStartsOn
      ),
    [focusDaily, range, weekStartsOn]
  );
  const rangeFocusMinutes = useMemo(() => focusDaily.reduce((m, d) => m + d.minutes, 0), [focusDaily]);
  const cumulative = useMemo(
    () =>
      focusDaily.reduce<{ label: string; value: number }[]>((acc, d) => {
        const prev = acc.length > 0 ? acc[acc.length - 1].value : 0;
        return [
          ...acc,
          { label: format(parseISO(d.date + "T12:00"), "d MMM"), value: Math.round(prev + d.minutes) },
        ];
      }, []),
    [focusDaily]
  );

  /* ---------- streak & totals ---------- */
  const streak = useMemo(() => focusStreak(sessions), [sessions]);
  const allTimeMinutes = useMemo(() => totalFocusMinutes(sessions), [sessions]);
  const avgMinutes = useMemo(() => avgSessionMinutes(sessions), [sessions]);

  /* ---------- tasks ---------- */
  const taskBars = useMemo(
    () =>
      barData(
        tasksCompletedByDay(tasks, range).map((d) => ({ date: d.date, value: d.count })),
        range,
        weekStartsOn
      ),
    [tasks, range, weekStartsOn]
  );
  const tasksDoneEver = tasks.filter((t) => t.done).length;
  const completionRate =
    tasks.length > 0 ? Math.round((tasksDoneEver / tasks.length) * 100) : 0;

  /* ---------- questions ---------- */
  const pyqDaily = useMemo(() => pyqByDay(pyq, range), [pyq, range]);
  const pyqBars = useMemo(
    () =>
      barData(
        pyqDaily.map((d) => ({ date: d.date, value: d.attempted })),
        range,
        weekStartsOn
      ),
    [pyqDaily, range, weekStartsOn]
  );
  const pyqInRange = useMemo(() => pyq.filter((p) => p.date >= daysAgoKey(range - 1)), [pyq, range]);
  const rangeAtt = pyqInRange.reduce((m, p) => m + p.attempted, 0);
  const rangeCor = pyqInRange.reduce((m, p) => m + p.correct, 0);
  const rangeAcc = rangeAtt > 0 ? Math.round((rangeCor / rangeAtt) * 100) : 0;
  const diffStats = useMemo(
    () =>
      (["easy", "medium", "hard"] as const).map((d) => {
        const rows = pyqInRange.filter((p) => p.difficulty === d);
        const att = rows.reduce((m, p) => m + p.attempted, 0);
        const cor = rows.reduce((m, p) => m + p.correct, 0);
        return { d, att, cor, acc: att > 0 ? Math.round((cor / att) * 100) : 0 };
      }),
    [pyqInRange]
  );

  /* ---------- habits ---------- */
  const habitBars = useMemo(
    () =>
      barData(
        habitCompletionByDay(habitLogs, range).map((d) => ({ date: d.date, value: d.count })),
        range,
        weekStartsOn
      ),
    [habitLogs, range, weekStartsOn]
  );

  /* ---------- heatmap ---------- */
  const series = useMemo(
    () => heatmapSeries(metric, 182, { sessions, studyLogs, pyq, tasks, habits, habitLogs }),
    [metric, sessions, studyLogs, pyq, tasks, habits, habitLogs]
  );
  const heatFmt = (v: number) => {
    if (metric === "focus" || metric === "study") {
      return v >= 60 ? `${Math.round(v / 60)}h ${Math.round(v % 60)}m` : `${Math.round(v)}m`;
    }
    return `${Math.round(v)}`;
  };

  return (
    <PanelShell
      title="Analytics"
      subtitle="Your real numbers — nothing invented"
      icon={<ChartColumnBig className="h-4 w-4" />}
    >
      {nothing ? (
        <PanelEmptyState
          icon={<ChartColumnBig className="h-5 w-5 text-muted-c" />}
          title="No analytics yet"
          hint="Data appears as you use Flowdeck. Run a focus session or complete a task."
        />
      ) : (
        <>
          {/* range selector */}
          <div
            className="mb-4 flex w-fit items-center gap-0.5 rounded-lg p-0.5"
            style={{ background: "color-mix(in srgb, var(--text) 6%, transparent)" }}
            role="group"
            aria-label="Date range"
          >
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                className={cn(
                  "press rounded-md px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors",
                  range === r ? "text-[var(--accent-fg)]" : "text-muted-c hover:text-[var(--text)]"
                )}
                style={range === r ? { background: "var(--accent)" } : undefined}
                onClick={() => setRange(r)}
                aria-pressed={range === r}
              >
                {r}d
              </button>
            ))}
          </div>

          {/* today strip */}
          <PanelSection>Today</PanelSection>
          <div className="widget mb-6 grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
            <StatCard
              label="Focus time"
              value={fmtMinutes(today.focusMin)}
              sub={`${todaySessionCount} session${todaySessionCount === 1 ? "" : "s"}`}
            />
            <StatCard label="Tasks done" value={String(today.tasksDone)} sub="today" />
            <StatCard
              label="Questions"
              value={String(today.questions)}
              sub={today.questions > 0 ? `${today.correct} correct` : "attempted today"}
            />
            <StatCard
              label="Habits done"
              value={today.habitsTotal > 0 ? `${today.habitsDone}/${today.habitsTotal}` : String(today.habitsDone)}
              sub="scheduled today"
            />
          </div>

          {/* focus time */}
          <PanelSection>Focus time</PanelSection>
          <div className="widget mb-6 p-4">
            {sessions.length === 0 ? (
              <NoDataYet what="focus" />
            ) : (
              <>
                <BarChart
                  data={focusBars}
                  height={130}
                  formatValue={(v) => fmtMinutes(v)}
                  emptyLabel="No sessions yet"
                />
                {rangeFocusMinutes > 0 && (
                  <div className="mt-4 border-t hairline pt-4">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-c">
                      Cumulative focus · last {range} days
                    </p>
                    <LineChart data={cumulative} area height={100} formatValue={(v) => fmtMinutes(v)} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* streak & totals */}
          <PanelSection>Streak &amp; totals</PanelSection>
          <div className="widget mb-6 grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
            <div
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
              style={{
                background:
                  streak >= 3
                    ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                    : "color-mix(in srgb, var(--text) 5%, transparent)",
              }}
            >
              <Flame
                className="h-4 w-4 shrink-0"
                style={{ color: streak >= 3 ? "var(--accent)" : "var(--text-muted)" }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-c">Focus streak</div>
                <div className="text-lg font-semibold leading-tight tabular-nums">{streak}d</div>
                <div className="text-[10px] text-muted-c">{streak > 0 ? "keep it alive" : "start today"}</div>
              </div>
            </div>
            <StatCard label="All-time focus" value={fmtMinutes(allTimeMinutes)} sub="total" />
            <StatCard label="Avg session" value={fmtMinutes(avgMinutes)} sub="length" />
            <StatCard label="Sessions" value={String(sessions.length)} sub="all-time" />
          </div>

          {/* tasks */}
          <PanelSection>Tasks</PanelSection>
          <div className="widget mb-6 p-4">
            {tasks.length === 0 ? (
              <NoDataYet what="task" />
            ) : (
              <div className="sm:flex sm:items-start sm:gap-4">
                <div className="min-w-0 flex-1">
                  <BarChart data={taskBars} height={110} emptyLabel="No tasks yet" />
                </div>
                <div className="mt-3 shrink-0 sm:mt-0 sm:w-36">
                  <StatCard
                    label="Completion rate"
                    value={`${completionRate}%`}
                    sub={`${tasksDoneEver}/${tasks.length} ever created`}
                  />
                </div>
              </div>
            )}
          </div>

          {/* questions */}
          <PanelSection>Questions</PanelSection>
          <div className="widget mb-6 p-4">
            {pyq.length === 0 ? (
              <NoDataYet what="question" />
            ) : (
              <>
                <BarChart data={pyqBars} height={110} emptyLabel="No questions yet" />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatCard
                    label="Accuracy"
                    value={rangeAtt > 0 ? `${rangeAcc}%` : "—"}
                    sub={`${rangeCor}/${rangeAtt} in range`}
                    tone={rangeAtt > 0 ? accuracyTone(rangeAcc) : undefined}
                  />
                  {diffStats.map(({ d, att, acc }) => (
                    <StatCard
                      key={d}
                      label={d}
                      value={att > 0 ? `${acc}%` : "—"}
                      sub={`${att} attempted`}
                      tone={att > 0 ? accuracyTone(acc) : undefined}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* habits */}
          <PanelSection>Habits</PanelSection>
          <div className="widget mb-6 p-4">
            {habits.length === 0 && habitLogs.length === 0 ? (
              <NoDataYet what="habit" />
            ) : (
              <div className="sm:flex sm:items-start sm:gap-4">
                <div className="min-w-0 flex-1">
                  <BarChart data={habitBars} height={110} emptyLabel="No habits yet" />
                </div>
                <div className="mt-3 shrink-0 sm:mt-0 sm:w-36">
                  <StatCard
                    label="Today"
                    value={
                      today.habitsTotal > 0 ? `${today.habitsDone}/${today.habitsTotal}` : String(today.habitsDone)
                    }
                    sub="habits done"
                  />
                </div>
              </div>
            )}
          </div>

          {/* heatmap */}
          <PanelSection>Activity heatmap · 26 weeks</PanelSection>
          <div className="widget mb-2 p-4">
            <div
              className="mb-3 flex w-fit items-center gap-0.5 rounded-lg p-0.5"
              style={{ background: "color-mix(in srgb, var(--text) 6%, transparent)" }}
              role="group"
              aria-label="Heatmap metric"
            >
              {METRICS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMetric(m.id)}
                  className={cn(
                    "press rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                    metric === m.id ? "text-[var(--accent-fg)]" : "text-muted-c hover:text-[var(--text)]"
                  )}
                  style={metric === m.id ? { background: "var(--accent)" } : undefined}
                  aria-pressed={metric === m.id}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="fd-scroll overflow-x-auto pb-1">
              <Heatmap values={series} weeks={26} formatValue={heatFmt} />
            </div>
          </div>
        </>
      )}
    </PanelShell>
  );
}
