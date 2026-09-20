"use client";

import { useMemo, useState } from "react";
import { WidgetCard } from "../widget-card";
import { useTaskStore } from "@/lib/store/task-store";
import { useUIStore } from "@/lib/store/ui-store";
import { useSettingsStore } from "@/lib/store/settings-store";
import { todayKey, humanDate, uid } from "@/lib/utils";
import type { Priority } from "@/lib/types";
import { ListTodo, Plus, ChevronRight, CalendarClock, Hash } from "lucide-react";
import { cn } from "@/lib/utils";

const PRIORITY_DOT: Record<Priority, string> = {
  none: "transparent",
  low: "color-mix(in srgb, var(--text) 30%, transparent)",
  medium: "var(--warning)",
  high: "color-mix(in srgb, var(--negative) 80%, var(--warning))",
  urgent: "var(--negative)",
};

export function TasksWidget({ config }: { config: Record<string, unknown> }) {
  const tasks = useTaskStore((s) => s.tasks);
  const addTask = useTaskStore((s) => s.addTask);
  const toggleTask = useTaskStore((s) => s.toggleTask);
  const openPanel = useUIStore((s) => s.openPanel);
  const tasksSort = useSettingsStore((s) => s.tasksSort);
  const [quick, setQuick] = useState("");
  const [burst, setBurst] = useState<string | null>(null);

  const filter = (config.filter as string) ?? "today";
  const today = todayKey();

  const filtered = useMemo(() => {
    let list = tasks.filter((t) => !t.archived && !t.done);
    if (filter === "today") {
      list = list.filter((t) => t.scheduledDate === today || t.dueDate === today);
    } else if (filter === "upcoming") {
      list = list.filter((t) => t.dueDate && t.dueDate > today);
    }
    const prio = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
    return [...list].sort((a, b) => {
      if (tasksSort === "priority") return prio[a.priority] - prio[b.priority];
      if (tasksSort === "due") return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
      return a.order - b.order;
    });
  }, [tasks, filter, today, tasksSort]);

  const visible = filtered.slice(0, 6);
  const overflow = filtered.length - visible.length;

  const quickAdd = () => {
    const title = quick.trim();
    if (!title) return;
    addTask({ title, scheduledDate: filter === "today" ? today : undefined });
    setQuick("");
  };

  return (
    <WidgetCard
      title={`Tasks${filter === "today" ? " · today" : filter === "upcoming" ? " · upcoming" : ""}`}
      icon={<ListTodo className="h-4 w-4" />}
      actions={
        <button
          className="press flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-c transition-colors hover:text-[var(--text)]"
          onClick={() => openPanel("tasks")}
          aria-label="Open task manager"
        >
          All <ChevronRight className="h-3.5 w-3.5" />
        </button>
      }
    >
      {/* quick add */}
      <div className="mb-2.5 flex items-center gap-2">
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && quickAdd()}
          placeholder="Add a task…"
          aria-label="Quick add task"
          className="h-9 min-w-0 flex-1 rounded-lg border hairline bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-c focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
        />
        <button
          className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--accent-fg)] disabled:opacity-40"
          style={{ background: "var(--accent)" }}
          onClick={quickAdd}
          disabled={!quick.trim()}
          aria-label="Add task"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* list */}
      {visible.length === 0 ? (
        <EmptyTasks filter={filter} />
      ) : (
        <ul className="space-y-1">
          {visible.map((t) => {
            const subDone = t.subtasks.filter((s) => s.done).length;
            return (
              <li key={t.id} className="group relative">
                <button
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                  onClick={() => {
                    const nowDone = toggleTask(t.id);
                    if (nowDone) {
                      setBurst(t.id);
                      setTimeout(() => setBurst(null), 600);
                    }
                  }}
                  aria-label={`Mark "${t.title}" ${t.done ? "incomplete" : "complete"}`}
                >
                  <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                    <span
                      className={cn(
                        "h-[16px] w-[16px] rounded-[6px] border-2 transition-all duration-200",
                        "border-[color-mix(in_srgb,var(--text)_28%,transparent)]"
                      )}
                      style={t.done ? { background: "var(--accent)", borderColor: "var(--accent)" } : undefined}
                    >
                      {t.done && (
                        <svg viewBox="0 0 12 12" className="h-full w-full p-[2px]" fill="none" aria-hidden="true">
                          <path d="M2 6.5 4.5 9 10 3" stroke="var(--accent-fg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    {burst === t.id && (
                      <span
                        className="fd-burst absolute inset-0 rounded-full"
                        style={{ background: "color-mix(in srgb, var(--accent) 50%, transparent)" }}
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm",
                      t.done && "text-muted-c line-through"
                    )}
                  >
                    {t.title}
                  </span>
                  {t.subtasks.length > 0 && (
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-c">
                      {subDone}/{t.subtasks.length}
                    </span>
                  )}
                  {t.priority !== "none" && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: PRIORITY_DOT[t.priority] }}
                      aria-label={`${t.priority} priority`}
                    />
                  )}
                  {t.dueDate && (
                    <span
                      className={cn(
                        "flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        t.dueDate < today ? "text-[var(--negative)]" : "text-muted-c"
                      )}
                      title={`Due ${humanDate(t.dueDate)}`}
                    >
                      <CalendarClock className="h-3 w-3" aria-hidden="true" />
                      {humanDate(t.dueDate)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {overflow > 0 && (
        <button
          className="mt-2 w-full rounded-lg py-1.5 text-center text-xs font-medium text-muted-c transition-colors hover:text-[var(--text)]"
          onClick={() => openPanel("tasks")}
        >
          +{overflow} more — open manager
        </button>
      )}
    </WidgetCard>
  );
}

function EmptyTasks({ filter }: { filter: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-5 text-center">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-xl"
        style={{ background: "color-mix(in srgb, var(--text) 6%, transparent)" }}
        aria-hidden="true"
      >
        <Hash className="h-4 w-4 text-muted-c" />
      </div>
      <p className="text-sm font-medium">
        {filter === "today" ? "Nothing scheduled for today" : filter === "upcoming" ? "No upcoming tasks" : "No open tasks"}
      </p>
      <p className="max-w-[240px] text-xs text-muted-c">
        {filter === "today"
          ? "Add a task above, or schedule one for today from the task manager."
          : "Everything is clear. Add a task above to get going."}
      </p>
    </div>
  );
}
