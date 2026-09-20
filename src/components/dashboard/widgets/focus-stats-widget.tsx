"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { WidgetCard } from "../widget-card";
import { useSessionStore } from "@/lib/store/session-store";
import { useTaskStore } from "@/lib/store/task-store";
import { focusByDay, focusStreak, sessionsToday, totalFocusMinutes } from "@/lib/analytics";
import { fmtMinutes } from "@/lib/utils";
import { Flame, ChevronRight } from "lucide-react";
import { useUIStore } from "@/lib/store/ui-store";
import { BarChart } from "@/components/charts/primitives";

export function FocusStatsWidget() {
  const sessions = useSessionStore((s) => s.sessions);
  const tasks = useTaskStore((s) => s.tasks);
  const openPanel = useUIStore((s) => s.openPanel);

  const stats = useMemo(() => {
    const today = sessionsToday(sessions);
    const week = focusByDay(sessions, 7);
    return {
      todayMinutes: today.reduce((m, s) => m + s.durationMs / 60000, 0),
      todayCount: today.length,
      week,
      streak: focusStreak(sessions),
      allTime: totalFocusMinutes(sessions),
    };
  }, [sessions]);

  const tasksDoneToday = useMemo(
    () => tasks.filter((t) => t.done && t.completedAt && format(new Date(t.completedAt), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")).length,
    [tasks]
  );

  const weekData = stats.week.map((d) => ({
    label: format(parseISO(d.date), "EEE").slice(0, 1),
    value: Math.round(d.minutes),
  }));

  return (
    <WidgetCard
      title="Focus stats"
      icon={<Flame className="h-4 w-4" />}
      actions={
        <button
          className="press flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-c transition-colors hover:text-[var(--text)]"
          onClick={() => openPanel("analytics")}
          aria-label="Open analytics"
        >
          Full <ChevronRight className="h-3.5 w-3.5" />
        </button>
      }
    >
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat label="Today" value={fmtMinutes(stats.todayMinutes)} sub={`${stats.todayCount} sessions`} />
        <Stat
          label="Streak"
          value={`${stats.streak}${stats.streak > 0 ? "d" : ""}`}
          sub={stats.streak > 0 ? "keep it alive" : "start today"}
          accent={stats.streak >= 3}
        />
        <Stat label="Tasks done" value={String(tasksDoneToday)} sub="today" />
      </div>

      <BarChart data={weekData} height={92} formatValue={(v) => `${v} min`} emptyLabel="No sessions yet" />
    </WidgetCard>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{
        background: accent
          ? "color-mix(in srgb, var(--accent) 12%, transparent)"
          : "color-mix(in srgb, var(--text) 5%, transparent)",
      }}
    >
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-c">{label}</div>
      <div
        className="mt-0.5 text-lg font-semibold tabular-nums leading-tight"
        style={{ color: accent ? "var(--accent)" : undefined }}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-c">{sub}</div>}
    </div>
  );
}
