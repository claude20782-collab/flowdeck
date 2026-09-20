"use client";

import { useMemo, useState } from "react";
import { WidgetCard } from "../widget-card";
import { useSessionStore } from "@/lib/store/session-store";
import { useTaskStore } from "@/lib/store/task-store";
import { useHabitStore } from "@/lib/store/habit-store";
import { useStudyStore } from "@/lib/store/study-store";
import { heatmapSeries, type HeatMetric } from "@/lib/analytics";
import { Heatmap } from "@/components/charts/primitives";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

const METRICS: { id: HeatMetric; label: string }[] = [
  { id: "focus", label: "Focus" },
  { id: "study", label: "Study" },
  { id: "questions", label: "Questions" },
  { id: "tasks", label: "Tasks" },
  { id: "habits", label: "Habits" },
];

export function HeatmapWidget() {
  const [metric, setMetric] = useState<HeatMetric>("focus");

  const sessions = useSessionStore((s) => s.sessions);
  const tasks = useTaskStore((s) => s.tasks);
  const habits = useHabitStore((s) => s.habits);
  const habitLogs = useHabitStore((s) => s.logs);
  const pyq = useStudyStore((s) => s.pyq);
  const studyLogs = useStudyStore((s) => s.studyLogs);

  const series = useMemo(
    () =>
      heatmapSeries(metric, 182, { sessions, tasks, habits, habitLogs, pyq, studyLogs }),
    [metric, sessions, tasks, habits, habitLogs, pyq, studyLogs]
  );

  const fmt = (v: number) => {
    if (metric === "focus" || metric === "study") {
      return v >= 60 ? `${Math.round(v / 60)}h ${Math.round(v % 60)}m` : `${Math.round(v)}m`;
    }
    return `${Math.round(v)}`;
  };

  return (
    <WidgetCard
      title="Productivity heatmap"
      icon={<Flame className="h-4 w-4" />}
      actions={
        <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: "color-mix(in srgb, var(--text) 6%, transparent)" }} role="group" aria-label="Heatmap metric">
          {METRICS.map((m) => (
            <button
              key={m.id}
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
      }
    >
      <div className="fd-scroll overflow-x-auto pb-1">
        <Heatmap values={series} weeks={26} formatValue={fmt} />
      </div>
    </WidgetCard>
  );
}
