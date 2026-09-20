"use client";

import { useMemo } from "react";
import { WidgetCard } from "../widget-card";
import { useGoalStore } from "@/lib/store/goal-store";
import { useSessionStore } from "@/lib/store/session-store";
import { useStudyStore } from "@/lib/store/study-store";
import { useUIStore } from "@/lib/store/ui-store";
import { format, differenceInCalendarDays, parseISO } from "date-fns";
import { Target, ChevronRight, Flag, CalendarDays } from "lucide-react";

/** Progress computed from real data depending on goal type. */
function goalProgress(goal: ReturnType<typeof useGoalStore.getState>["goals"][number], ctx: GoalCtx): number {
  switch (goal.type) {
    case "numeric":
    case "custom":
    case "completion":
      return goal.manualValue ?? 0;
    case "time": {
      const ms = ctx.sessions.reduce((m, s) => m + s.durationMs, 0);
      return Math.round(ms / 60000);
    }
    case "study-hours": {
      const ms = ctx.sessions
        .filter((s) => s.subjectId && s.startedAt >= ctx.since)
        .reduce((m, s) => m + s.durationMs, 0);
      return Math.round(ms / 3600_000);
    }
    case "questions": {
      return ctx.pyq.reduce((m, p) => m + p.attempted, 0);
    }
    case "streak":
      return goal.manualValue ?? 0;
  }
}

interface GoalCtx {
  sessions: { durationMs: number; subjectId?: string; startedAt: number }[];
  pyq: { attempted: number }[];
  since: number;
}

export function GoalsWidget() {
  const goals = useGoalStore((s) => s.goals);
  const sessions = useSessionStore((s) => s.sessions);
  const pyq = useStudyStore((s) => s.pyq);
  const openPanel = useUIStore((s) => s.openPanel);

  const active = useMemo(() => goals.filter((g) => !g.archived).slice(0, 4), [goals]);

  const ctx: GoalCtx = {
    sessions,
    pyq,
    since: 0,
  };

  return (
    <WidgetCard
      title="Goals"
      icon={<Target className="h-4 w-4" />}
      actions={
        <button
          className="press flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-c transition-colors hover:text-[var(--text)]"
          onClick={() => openPanel("goals")}
          aria-label="Open goals"
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
            <Target className="h-4 w-4 text-muted-c" />
          </div>
          <p className="text-sm font-medium">No goals in progress</p>
          <p className="max-w-[240px] text-xs text-muted-c">
            Set measurable targets — study hours, questions solved, streaks or anything you’re chasing.
          </p>
          <button
            className="press mt-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            onClick={() => openPanel("goals")}
          >
            Set a goal
          </button>
        </div>
      ) : (
        <ul className="space-y-3.5">
          {active.map((g) => {
            const current = Math.min(goalProgress(g, ctx), g.target);
            const pctVal = g.target > 0 ? Math.round((current / g.target) * 100) : 0;
            const doneMilestones = g.milestones.filter((m) => m.done).length;
            const daysLeft = g.deadline ? differenceInCalendarDays(parseISO(g.deadline), new Date()) : null;
            return (
              <li key={g.id}>
                <button
                  className="group w-full text-left"
                  onClick={() => openPanel("goals")}
                  aria-label={`Open goal ${g.title}, ${pctVal}% complete`}
                >
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium">{g.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-c">
                      {g.type === "time" ? `${current}/${g.target}m` : `${current}/${g.target}${g.unit ?? ""}`}
                    </span>
                  </div>
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full"
                    style={{ background: "color-mix(in srgb, var(--text) 10%, transparent)" }}
                    role="progressbar"
                    aria-valuenow={pctVal}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pctVal}%`,
                        background: g.color ?? "var(--accent)",
                      }}
                    />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-c">
                    <span className="tabular-nums font-semibold" style={{ color: g.color ?? "var(--accent)" }}>
                      {pctVal}%
                    </span>
                    {g.milestones.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Flag className="h-2.5 w-2.5" aria-hidden="true" />
                        {doneMilestones}/{g.milestones.length}
                      </span>
                    )}
                    {daysLeft != null && (
                      <span className={daysLeft < 0 ? "text-[var(--negative)]" : daysLeft < 7 ? "text-[var(--warning)]" : ""}>
                        <CalendarDays className="mr-0.5 inline h-2.5 w-2.5" aria-hidden="true" />
                        {daysLeft < 0 ? `${-daysLeft}d overdue` : daysLeft === 0 ? "due today" : `${daysLeft}d left`}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}
