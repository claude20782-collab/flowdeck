"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronDown,
  Flame,
  Minus,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  Trophy,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PanelActionButton, PanelEmptyState, PanelSection, PanelShell } from "./panel-shell";
import { habitScheduledOn, habitStreak, habitWeekCount, useHabitStore } from "@/lib/store/habit-store";
import { useSettingsStore } from "@/lib/store/settings-store";
import { cn, dateKey, humanDate, parseDateKey, todayKey } from "@/lib/utils";
import type { Habit, HabitFreq } from "@/lib/types";

/* ============================================================
 * Habits panel — week completion grid, per-habit cards,
 * create/edit dialog, archive & delete. Real store data only.
 * ============================================================ */

const HABIT_COLORS = [
  "#34d399",
  "#fbbf24",
  "#e879f9",
  "#38bdf8",
  "#f87171",
  "#a78bfa",
  "#f472b6",
  "#84cc16",
  "#fb923c",
  "#2dd4bf",
];

const HABIT_EMOJIS = [
  "🔥",
  "💧",
  "📚",
  "🏃",
  "🧘",
  "💪",
  "😴",
  "🥗",
  "☀️",
  "🌙",
  "✍️",
  "🎯",
  "🧠",
  "💊",
  "🦷",
  "🎸",
  "💰",
  "🧹",
  "📵",
  "☕",
  "🚶",
  "🛏️",
  "📖",
  "🌱",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
/** Mon..Sun display order for the day-of-week picker. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface HabitLog {
  habitId: string;
  date: string;
  count: number;
}

interface HabitDraftInput {
  name: string;
  emoji?: string;
  color?: string;
  freq: HabitFreq;
  notes?: string;
}

function freqLabel(freq: HabitFreq): string {
  if (freq.kind === "daily") return "Daily";
  if (freq.kind === "times-per-week") return `${freq.times}× per week`;
  if (freq.days.length === 7) return "Every day";
  return [...freq.days].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(", ");
}

function weekTarget(freq: HabitFreq): number {
  if (freq.kind === "daily") return 7;
  if (freq.kind === "times-per-week") return freq.times;
  return freq.days.length;
}

/** Longest run of consecutive scheduled-day completions, computed from real logs. */
function bestHabitStreak(habit: Habit, logs: HabitLog[]): number {
  const dates = logs.filter((l) => l.habitId === habit.id && l.count > 0).map((l) => l.date).sort();
  if (dates.length === 0) return 0;
  const done = new Set(dates);
  const cursor = parseDateKey(dates[0]);
  const end = parseDateKey(dates[dates.length - 1]);
  let best = 0;
  let run = 0;
  for (let i = 0; i < 800 && cursor <= end; i++) {
    const scheduled = habit.freq.kind !== "weekly" || habit.freq.days.includes(cursor.getDay());
    if (scheduled) {
      if (done.has(dateKey(cursor))) {
        run += 1;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return best;
}

/* ---------- tiny shared bits ---------- */

function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-muted-c">
      {children}
    </label>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-c transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-[var(--text)]"
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-c">{label}</span>
      <span className="text-lg font-semibold leading-tight tabular-nums">{value}</span>
    </div>
  );
}

/* ---------- week grid ---------- */

function WeekRow({
  habit,
  days,
  today,
  logs,
  countOn,
  onToggle,
}: {
  habit: Habit;
  days: Date[];
  today: string;
  logs: HabitLog[];
  countOn: (habitId: string, date: string) => number;
  onToggle: (habit: Habit, date: string, done: boolean) => void;
}) {
  const streak = habitStreak(habit, logs);
  const [burst, setBurst] = useState<string | null>(null);

  const handleCell = (key: string, done: boolean) => {
    if (!done) {
      setBurst(key);
      window.setTimeout(() => setBurst(null), 600);
    }
    onToggle(habit, key, done);
  };

  return (
    <div className="rounded-xl px-1 py-2 transition-colors hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] sm:px-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium">
          {habit.emoji ? `${habit.emoji} ` : ""}
          {habit.name}
        </span>
        {streak > 0 && (
          <span
            className="flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
            style={{ background: "color-mix(in srgb, var(--warning) 15%, transparent)", color: "var(--warning)" }}
            aria-label={`${streak} day streak`}
          >
            <Flame className="h-3 w-3" aria-hidden="true" />
            {streak}
          </span>
        )}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {days.map((d) => {
          const key = dateKey(d);
          const done = countOn(habit.id, key) > 0;
          const isToday = key === today;
          const future = key > today;
          const scheduled = habitScheduledOn(habit, d);
          return (
            <button
              key={key}
              type="button"
              disabled={future}
              onClick={() => handleCell(key, done)}
              aria-pressed={done}
              aria-label={`${habit.name} — ${DAY_NAMES[d.getDay()]} ${key}${done ? ", completed — tap to undo" : future ? ", upcoming" : ", tap to complete"}`}
              className={cn(
                "press relative flex aspect-square w-full max-w-[64px] items-center justify-center justify-self-center rounded-full transition-all duration-200",
                future ? "cursor-default opacity-30" : "hover:scale-[1.08]"
              )}
              style={done ? { background: habit.color ?? "var(--positive)" } : undefined}
            >
              {burst === key && (
                <span
                  className="fd-burst absolute inset-0 rounded-full"
                  style={{ background: habit.color ?? "var(--positive)" }}
                  aria-hidden="true"
                />
              )}
              {done ? (
                <Check className="relative h-4 w-4 text-white" strokeWidth={3.5} aria-hidden="true" />
              ) : !scheduled ? (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "color-mix(in srgb, var(--text) 22%, transparent)" }}
                  aria-hidden="true"
                />
              ) : isToday ? (
                <span
                  className="absolute inset-[3px] rounded-full border-2"
                  style={{ borderColor: `color-mix(in srgb, ${habit.color ?? "var(--accent)"} 60%, transparent)` }}
                  aria-hidden="true"
                />
              ) : !future ? (
                <span
                  className="absolute inset-[3px] rounded-full border"
                  style={{ borderColor: "color-mix(in srgb, var(--text) 13%, transparent)" }}
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- per-habit card ---------- */

function HabitCard({
  habit,
  logs,
  weekStartsOn,
  countOn,
  onEdit,
  onArchive,
  onDelete,
}: {
  habit: Habit;
  logs: HabitLog[];
  weekStartsOn: 0 | 1;
  countOn: (habitId: string, date: string) => number;
  onEdit: (habit: Habit) => void;
  onArchive: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
}) {
  const streak = habitStreak(habit, logs);
  const best = bestHabitStreak(habit, logs);
  const weekCount = habitWeekCount(habit, logs, weekStartsOn);
  const target = weekTarget(habit.freq);

  const last30: { key: string; done: boolean }[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = dateKey(d);
    last30.push({ key, done: countOn(habit.id, key) > 0 });
  }

  return (
    <article className="widget flex flex-col gap-3 p-3.5 sm:p-4">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg"
          style={{ background: `color-mix(in srgb, ${habit.color ?? "var(--text)"} 14%, transparent)` }}
          aria-hidden="true"
        >
          {habit.emoji ?? "◆"}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{habit.name}</h3>
          <p className="truncate text-[11px] text-muted-c">{freqLabel(habit.freq)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconBtn label={`Edit ${habit.name}`} onClick={() => onEdit(habit)}>
            <Pencil className="h-4 w-4" />
          </IconBtn>
          <IconBtn label={`Archive ${habit.name}`} onClick={() => onArchive(habit)}>
            <Archive className="h-4 w-4" />
          </IconBtn>
          <IconBtn label={`Delete ${habit.name}`} onClick={() => onDelete(habit)}>
            <Trash2 className="h-4 w-4" />
          </IconBtn>
        </div>
      </div>

      {habit.notes && <p className="line-clamp-2 text-xs leading-relaxed text-muted-c">{habit.notes}</p>}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-c">
        <span className="flex items-center gap-1" title="Current streak">
          <Flame className="h-3 w-3" style={streak > 0 ? { color: "var(--warning)" } : undefined} aria-hidden="true" />
          <span className="font-semibold tabular-nums">{streak}</span> streak
        </span>
        <span className="flex items-center gap-1" title="Best streak">
          <Trophy className="h-3 w-3" aria-hidden="true" />
          <span className="font-semibold tabular-nums">{best}</span> best
        </span>
        <span className="flex items-center gap-1" title="Completions this week">
          <span className="font-semibold tabular-nums">
            {weekCount}/{target}
          </span>
          this week
        </span>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-c">Last 30 days</p>
        <div className="flex flex-wrap items-center gap-[3px]">
          {last30.map((d) => (
            <span
              key={d.key}
              title={`${humanDate(d.key)} — ${d.done ? "done" : "missed"}`}
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                background: d.done
                  ? habit.color ?? "var(--positive)"
                  : "color-mix(in srgb, var(--text) 12%, transparent)",
              }}
            />
          ))}
        </div>
      </div>
    </article>
  );
}

/* ---------- create / edit dialog ---------- */

function HabitDialog({
  open,
  onOpenChange,
  habit,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  habit: Habit | null;
  onSave: (draft: HabitDraftInput) => void;
}) {
  const [name, setName] = useState(habit?.name ?? "");
  const [emoji, setEmoji] = useState(habit?.emoji ?? "");
  const [color, setColor] = useState<string>(habit?.color ?? HABIT_COLORS[0]);
  const f = habit?.freq;
  const [mode, setMode] = useState<"daily" | "days" | "times">(
    f?.kind === "weekly" ? "days" : f?.kind === "times-per-week" ? "times" : "daily"
  );
  const [days, setDays] = useState<number[]>(f?.kind === "weekly" ? [...f.days] : [1, 2, 3, 4, 5]);
  const [times, setTimes] = useState(f?.kind === "times-per-week" ? f.times : 3);
  const [notes, setNotes] = useState(habit?.notes ?? "");

  const valid = name.trim().length > 0 && (mode !== "days" || days.length > 0);

  const save = () => {
    if (!valid) return;
    const freq: HabitFreq =
      mode === "daily"
        ? { kind: "daily" }
        : mode === "days"
          ? { kind: "weekly", days: [...days].sort((a, b) => a - b) }
          : { kind: "times-per-week", times };
    onSave({ name: name.trim(), emoji: emoji || undefined, color, freq, notes: notes.trim() || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] fd-scroll sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{habit ? "Edit habit" : "New habit"}</DialogTitle>
          <DialogDescription>
            {habit ? "Update the details of this habit." : "Small consistent actions compound — pick something worth repeating."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="habit-name">Name</FieldLabel>
            <input
              id="habit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Read 20 pages"
              className="h-9 w-full rounded-lg border hairline bg-transparent px-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          <div>
            <FieldLabel>Icon</FieldLabel>
            <div className="grid grid-cols-8 gap-1.5">
              {HABIT_EMOJIS.map((e) => {
                const selected = emoji === e;
                return (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(selected ? "" : e)}
                    aria-label={`Icon ${e}`}
                    aria-pressed={selected}
                    className={cn(
                      "press flex h-9 items-center justify-center rounded-lg text-lg transition-colors",
                      !selected && "hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]"
                    )}
                    style={selected ? { background: "color-mix(in srgb, var(--accent) 18%, transparent)" } : undefined}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <FieldLabel>Color</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              {HABIT_COLORS.map((c) => {
                const selected = color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Color ${c}`}
                    aria-pressed={selected}
                    className="press flex h-7 w-7 items-center justify-center rounded-full"
                    style={{
                      background: c,
                      boxShadow: selected ? `0 0 0 2px var(--card-solid), 0 0 0 4px ${c}` : undefined,
                    }}
                  >
                    {selected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <FieldLabel>Frequency</FieldLabel>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ["daily", "Daily"],
                  ["days", "Specific days"],
                  ["times", "Times / week"],
                ] as const
              ).map(([m, label]) => {
                const selected = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={selected}
                    className={cn(
                      "press flex h-9 items-center justify-center rounded-lg text-sm transition-colors",
                      selected ? "font-semibold" : "hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]"
                    )}
                    style={
                      selected
                        ? { background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" }
                        : { background: "color-mix(in srgb, var(--text) 6%, transparent)", color: "var(--text-muted)" }
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {mode === "days" && (
              <div className="mt-2 grid grid-cols-7 gap-1.5">
                {WEEK_ORDER.map((d) => {
                  const on = days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                      aria-pressed={on}
                      aria-label={DAY_NAMES[d]}
                      className={cn(
                        "press flex h-9 items-center justify-center rounded-lg text-[11px] transition-colors",
                        on ? "font-semibold" : "hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]"
                      )}
                      style={
                        on
                          ? { background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }
                          : { background: "color-mix(in srgb, var(--text) 7%, transparent)", color: "var(--text-muted)" }
                      }
                    >
                      {DAY_NAMES[d].slice(0, 2)}
                    </button>
                  );
                })}
              </div>
            )}

            {mode === "times" && (
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTimes((t) => Math.max(1, t - 1))}
                  disabled={times <= 1}
                  aria-label="Decrease times per week"
                  className="press flex h-9 w-9 items-center justify-center rounded-lg text-muted-c transition-colors hover:bg-[color-mix(in_srgb,var(--text)_12%,transparent)] disabled:opacity-40 bg-[color-mix(in_srgb,var(--text)_8%,transparent)]"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <p className="min-w-[110px] text-center text-sm tabular-nums">{times}× per week</p>
                <button
                  type="button"
                  onClick={() => setTimes((t) => Math.min(7, t + 1))}
                  disabled={times >= 7}
                  aria-label="Increase times per week"
                  className="press flex h-9 w-9 items-center justify-center rounded-lg text-muted-c transition-colors hover:bg-[color-mix(in_srgb,var(--text)_12%,transparent)] disabled:opacity-40 bg-[color-mix(in_srgb,var(--text)_8%,transparent)]"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <div>
            <FieldLabel htmlFor="habit-notes">Notes</FieldLabel>
            <textarea
              id="habit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional — why this habit matters, cues, reminders…"
              className="min-h-[64px] w-full resize-none rounded-lg border hairline bg-transparent px-3 py-2 text-sm outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] placeholder:text-[var(--text-muted)]"
            />
          </div>
        </div>

        <DialogFooter>
          <PanelActionButton variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </PanelActionButton>
          <PanelActionButton onClick={save} disabled={!valid}>
            {habit ? "Save changes" : "Create habit"}
          </PanelActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- archived ---------- */

function ArchivedHabits({ habits, onRestore }: { habits: Habit[]; onRestore: (habit: Habit) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="press mb-2 flex w-full items-center gap-2 text-left"
      >
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-c">Archived · {habits.length}</h3>
        <span className="flex-1" />
        <ChevronDown
          className={cn("h-4 w-4 text-muted-c transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open && (
        <ul className="widget max-h-56 fd-scroll p-1.5">
          {habits.map((h) => (
            <li
              key={h.id}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-muted-c">
                {h.emoji ? `${h.emoji} ` : ""}
                {h.name}
              </span>
              <span className="shrink-0 text-[10px] text-muted-c">{freqLabel(h.freq)}</span>
              <IconBtn label={`Restore ${h.name}`} onClick={() => onRestore(h)}>
                <ArchiveRestore className="h-4 w-4" />
              </IconBtn>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- main panel ---------- */

export function HabitsPanel() {
  const habits = useHabitStore((s) => s.habits);
  const logs = useHabitStore((s) => s.logs);
  const addHabit = useHabitStore((s) => s.addHabit);
  const updateHabit = useHabitStore((s) => s.updateHabit);
  const deleteHabit = useHabitStore((s) => s.deleteHabit);
  const archiveHabit = useHabitStore((s) => s.archiveHabit);
  const incrementHabit = useHabitStore((s) => s.incrementHabit);
  const weekStartsOn = useSettingsStore((s) => s.weekStart);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [deleting, setDeleting] = useState<Habit | null>(null);

  const today = todayKey();

  const active = habits.filter((h) => !h.archived);
  const archived = habits.filter((h) => h.archived);

  /** Mon..Sun (or Sun..Sat) of the current week, respecting the weekStart setting. */
  const days = useMemo(() => {
    const now = new Date();
    const diff = (now.getDay() - weekStartsOn + 7) % 7;
    const start = new Date(now);
    start.setDate(now.getDate() - diff);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [weekStartsOn]);

  const doneMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) m.set(`${l.habitId}|${l.date}`, l.count);
    return m;
  }, [logs]);
  const countOn = (habitId: string, date: string) => doneMap.get(`${habitId}|${date}`) ?? 0;

  const doneTodayCount = active.filter((h) => countOn(h.id, today) > 0).length;
  const scheduledToday = active.filter((h) => habitScheduledOn(h, new Date())).length;
  const doneScheduledToday = active.filter((h) => habitScheduledOn(h, new Date()) && countOn(h.id, today) > 0).length;
  const totalCompletions = logs.filter((l) => l.count > 0).length;
  const longestStreak = active.reduce((m, h) => Math.max(m, habitStreak(h, logs)), 0);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const toggleDay = (habit: Habit, key: string, done: boolean) => {
    incrementHabit(habit.id, key, done ? -1 : 1);
  };

  const handleSave = (draft: HabitDraftInput) => {
    if (editing) {
      updateHabit(editing.id, draft);
      toast.success("Habit updated");
    } else {
      addHabit(draft);
      toast.success("Habit created");
    }
    setDialogOpen(false);
    setEditing(null);
  };

  const handleArchive = (habit: Habit) => {
    archiveHabit(habit.id, true);
    toast.success(`“${habit.name}” archived`);
  };

  const handleRestore = (habit: Habit) => {
    archiveHabit(habit.id, false);
    toast.success(`“${habit.name}” restored`);
  };

  return (
    <PanelShell
      title="Habits"
      subtitle={`${active.length} tracked · ${doneTodayCount} done today`}
      icon={<Repeat className="h-4 w-4" />}
      actions={
        <PanelActionButton onClick={openNew}>
          <Plus className="h-4 w-4" />
          New habit
        </PanelActionButton>
      }
    >
      {active.length === 0 ? (
        <PanelEmptyState
          icon={<Repeat className="h-5 w-5 text-muted-c" />}
          title="No habits yet"
          hint="Build consistency — track daily rituals, study streaks, sleep and more."
          action={
            <PanelActionButton onClick={openNew}>
              <Plus className="h-4 w-4" />
              New habit
            </PanelActionButton>
          }
        />
      ) : (
        <div className="space-y-5">
          {/* stats strip */}
          <section className="widget grid grid-cols-2 gap-3 p-3.5 sm:grid-cols-4 sm:p-4" aria-label="Habit stats">
            <Stat label="Tracked" value={String(active.length)} />
            <Stat label="Done today" value={`${doneScheduledToday}/${scheduledToday}`} />
            <Stat label="Completions" value={String(totalCompletions)} />
            <Stat label="Top streak" value={`${longestStreak}d`} />
          </section>

          {/* week grid */}
          <div>
            <PanelSection
              action={
                <span className="text-[10px] tabular-nums text-muted-c">
                  {format(days[0], "d MMM")} – {format(days[6], "d MMM")}
                </span>
              }
            >
              This week
            </PanelSection>
            <section className="widget p-3 sm:p-4" aria-label="This week's completions">
              <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-1.5" aria-hidden="true">
                {days.map((d) => {
                  const key = dateKey(d);
                  const isToday = key === today;
                  return (
                    <div key={key} className="flex flex-col items-center gap-0.5">
                      <span
                        className={cn("text-[10px] font-medium", !isToday && "text-muted-c")}
                        style={isToday ? { color: "var(--accent)" } : undefined}
                      >
                        {DAY_INITIALS[d.getDay()]}
                      </span>
                      <span
                        className={cn("text-[9px] tabular-nums", isToday ? "font-semibold" : "text-muted-c")}
                        style={isToday ? { color: "var(--accent)" } : undefined}
                      >
                        {d.getDate()}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="space-y-0.5">
                {active.map((h) => (
                  <WeekRow
                    key={h.id}
                    habit={h}
                    days={days}
                    today={today}
                    logs={logs}
                    countOn={countOn}
                    onToggle={toggleDay}
                  />
                ))}
              </div>
            </section>
          </div>

          {/* habit list */}
          <div>
            <PanelSection>All habits</PanelSection>
            <div className="grid gap-3 sm:grid-cols-2">
              {active.map((h) => (
                <HabitCard
                  key={h.id}
                  habit={h}
                  logs={logs}
                  weekStartsOn={weekStartsOn}
                  countOn={countOn}
                  onEdit={(habit) => {
                    setEditing(habit);
                    setDialogOpen(true);
                  }}
                  onArchive={handleArchive}
                  onDelete={(habit) => setDeleting(habit)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {archived.length > 0 && (
        <div className={active.length === 0 ? "" : "mt-5"}>
          <ArchivedHabits habits={archived} onRestore={handleRestore} />
        </div>
      )}

      <HabitDialog
        key={dialogOpen ? editing?.id ?? "new" : "closed"}
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditing(null);
        }}
        habit={editing}
        onSave={handleSave}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete habit?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.name}” and all of its completion history will be permanently removed. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="press rounded-lg font-semibold"
              style={{ background: "color-mix(in srgb, var(--negative) 15%, transparent)", color: "var(--negative)" }}
              onClick={() => {
                if (!deleting) return;
                deleteHabit(deleting.id);
                toast.success(`“${deleting.name}” deleted`);
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PanelShell>
  );
}
