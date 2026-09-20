"use client";

import { useMemo, useState } from "react";
import { WidgetCard } from "../widget-card";
import { useHabitStore, habitStreak, habitWeekCount, habitScheduledOn } from "@/lib/store/habit-store";
import { useUIStore } from "@/lib/store/ui-store";
import { useSettingsStore } from "@/lib/store/settings-store";
import { todayKey, dateKey } from "@/lib/utils";
import { Repeat, ChevronRight, Flame, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function HabitsWidget() {
  const habits = useHabitStore((s) => s.habits);
  const logs = useHabitStore((s) => s.logs);
  const incrementHabit = useHabitStore((s) => s.incrementHabit);
  const openPanel = useUIStore((s) => s.openPanel);
  const weekStart = useSettingsStore((s) => s.weekStart);
  const [burst, setBurst] = useState<string | null>(null);

  const today = todayKey();
  const todayDate = new Date();

  const active = useMemo(() => habits.filter((h) => !h.archived).slice(0, 6), [habits]);

  const doneToday = (habitId: string) => {
    const entry = logs.find((l) => l.habitId === habitId && l.date === today);
    return (entry?.count ?? 0) > 0;
  };

  const completedCount = active.filter((h) => doneToday(h.id)).length;

  return (
    <WidgetCard
      title={`Habits · ${completedCount}/${active.length}`}
      icon={<Repeat className="h-4 w-4" />}
      actions={
        <button
          className="press flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-c transition-colors hover:text-[var(--text)]"
          onClick={() => openPanel("habits")}
          aria-label="Open habit tracker"
        >
          All <ChevronRight className="h-3.5 w-3.5" />
        </button>
      }
    >
      {active.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-5 text-center">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: "color-mix(in srgb, var(--text) 6%, transparent)" }}
            aria-hidden="true"
          >
            <Repeat className="h-4 w-4 text-muted-c" />
          </div>
          <p className="text-sm font-medium">No habits yet</p>
          <p className="max-w-[240px] text-xs text-muted-c">
            Build consistency — track daily rituals, study streaks, sleep and more.
          </p>
          <button
            className="press mt-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            onClick={() => openPanel("habits")}
          >
            Create first habit
          </button>
        </div>
      ) : (
        <ul className="space-y-1">
          {active.map((h) => {
            const streak = habitStreak(h, logs);
            const weekCount = habitWeekCount(h, logs, weekStart as 0 | 1);
            const scheduled = habitScheduledOn(h, todayDate);
            const done = doneToday(h.id);
            const freqLabel =
              h.freq.kind === "daily"
                ? "daily"
                : h.freq.kind === "weekly"
                  ? `${h.freq.days.length}×/week`
                  : `${h.freq.times}×/week`;
            return (
              <li key={h.id}>
                <button
                  className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                  onClick={() => {
                    const next = incrementHabit(h.id, today, done ? -1 : 1);
                    if (next > 0) {
                      setBurst(h.id);
                      setTimeout(() => setBurst(null), 600);
                    }
                  }}
                  aria-label={`${h.name} — ${done ? "completed today, tap to undo" : "mark completed today"}`}
                  aria-pressed={done}
                >
                  <span className="relative flex h-[20px] w-[20px] shrink-0 items-center justify-center">
                    <span
                      className={cn(
                        "h-[18px] w-[18px] rounded-full border-2 transition-all duration-200",
                        done ? "border-transparent" : "border-[color-mix(in_srgb,var(--text)_28%,transparent)]"
                      )}
                      style={done ? { background: h.color ?? "var(--positive)" } : undefined}
                    >
                      {done && <Check className="h-3 w-3 text-white" strokeWidth={3.5} aria-hidden="true" />}
                    </span>
                    {burst === h.id && (
                      <span
                        className="fd-burst absolute inset-0 rounded-full"
                        style={{ background: h.color ?? "var(--positive)" }}
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", done && "text-muted-c")}>
                      {h.emoji ? `${h.emoji} ` : ""}
                      {h.name}
                    </span>
                    <span className="text-[10px] text-muted-c">
                      {scheduled ? freqLabel : `not today · ${freqLabel}`}
                      {weekCount > 0 && ` · ${weekCount} this week`}
                    </span>
                  </span>
                  {streak > 0 && (
                    <span
                      className="flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: "color-mix(in srgb, var(--warning) 15%, transparent)",
                        color: "var(--warning)",
                      }}
                      aria-label={`${streak} day streak`}
                    >
                      <Flame className="h-3 w-3" aria-hidden="true" />
                      {streak}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}
