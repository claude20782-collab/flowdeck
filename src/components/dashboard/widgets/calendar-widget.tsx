"use client";

import { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, parseISO } from "date-fns";
import { WidgetCard } from "../widget-card";
import { useTaskStore } from "@/lib/store/task-store";
import { useSessionStore } from "@/lib/store/session-store";
import { useUIStore } from "@/lib/store/ui-store";
import { useSettingsStore } from "@/lib/store/settings-store";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { dateKey } from "@/lib/utils";

export function CalendarWidget() {
  const [monthOffset, setMonthOffset] = useState(0);
  const tasks = useTaskStore((s) => s.tasks);
  const sessions = useSessionStore((s) => s.sessions);
  const openPanel = useUIStore((s) => s.openPanel);
  const weekStart = useSettingsStore((s) => s.weekStart);

  const monthDate = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const days = useMemo(() => {
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);
    const leading = (start.getDay() - weekStart + 7) % 7;
    const cells: (Date | null)[] = Array.from({ length: leading }, () => null);
    for (const d of eachDayOfInterval({ start, end })) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthDate, weekStart]);

  const dayData = useMemo(() => {
    const map = new Map<string, { tasks: number; done: number; focusMin: number }>();
    for (const t of tasks) {
      const key = t.scheduledDate ?? t.dueDate;
      if (!key) continue;
      const e = map.get(key) ?? { tasks: 0, done: 0, focusMin: 0 };
      e.tasks++;
      if (t.done) e.done++;
      map.set(key, e);
    }
    for (const s of sessions) {
      const key = dateKey(s.startedAt);
      const e = map.get(key) ?? { tasks: 0, done: 0, focusMin: 0 };
      e.focusMin += s.durationMs / 60000;
      map.set(key, e);
    }
    return map;
  }, [tasks, sessions]);

  const todayK = dateKey(new Date());
  const weekdayLabels = weekStart === 1 ? ["M", "T", "W", "T", "F", "S", "S"] : ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <WidgetCard
      title={format(monthDate, "MMMM yyyy")}
      icon={<CalendarDays className="h-4 w-4" />}
      actions={
        <div className="flex items-center gap-0.5">
          <button
            className="press flex h-7 w-7 items-center justify-center rounded-lg text-muted-c hover:text-[var(--text)]"
            onClick={() => setMonthOffset((m) => m - 1)}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            className="press flex h-7 w-7 items-center justify-center rounded-lg text-muted-c hover:text-[var(--text)]"
            onClick={() => setMonthOffset((m) => m + 1)}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-7 gap-y-0.5 text-center" role="grid" aria-label={`${format(monthDate, "MMMM yyyy")} calendar`}>
        {weekdayLabels.map((d, i) => (
          <span key={i} className="pb-1 text-[10px] font-semibold text-muted-c" aria-hidden="true">
            {d}
          </span>
        ))}
        {days.map((d, i) => {
          if (!d) return <span key={`empty-${i}`} aria-hidden="true" />;
          const key = dateKey(d);
          const data = dayData.get(key);
          const hasTasks = (data?.tasks ?? 0) > 0;
          const allDone = hasTasks && data!.done === data!.tasks;
          const focusIntensity = Math.min(1, (data?.focusMin ?? 0) / 120);
          const isToday = key === todayK;
          return (
            <button
              key={key}
              onClick={() => openPanel("tasks")}
              className={cn(
                "relative mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-xs tabular-nums transition-colors",
                isSameMonth(d, monthDate) ? "hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" : "opacity-30"
              )}
              style={
                isToday
                  ? {
                      background: "var(--accent)",
                      color: "var(--accent-fg)",
                      fontWeight: 700,
                    }
                  : focusIntensity > 0
                    ? {
                        background: `color-mix(in srgb, var(--accent) ${Math.round(focusIntensity * 22)}%, transparent)`,
                      }
                    : undefined
              }
              aria-label={`${format(d, "d MMMM")}${hasTasks ? `, ${data!.tasks} tasks` : ""}${(data?.focusMin ?? 0) > 0 ? `, ${Math.round(data!.focusMin)} minutes focus` : ""}`}
            >
              {format(d, "d")}
              {hasTasks && !isToday && (
                <span
                  className="absolute bottom-1 h-1 w-1 rounded-full"
                  style={{ background: allDone ? "var(--positive)" : "var(--accent)" }}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-center gap-3 text-[10px] text-muted-c">
        <span className="flex items-center gap-1">
          <span className="h-1 w-1 rounded-full" style={{ background: "var(--accent)" }} aria-hidden="true" /> tasks due
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1 w-1 rounded-full" style={{ background: "var(--positive)" }} aria-hidden="true" /> all done
        </span>
        <span>shade = focus time</span>
      </div>
    </WidgetCard>
  );
}
