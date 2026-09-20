"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Flag,
  History,
  Pencil,
  Plus,
  Target,
  Trash2,
  X,
  Zap,
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
import { useGoalStore } from "@/lib/store/goal-store";
import { useSessionStore } from "@/lib/store/session-store";
import { useStudyStore } from "@/lib/store/study-store";
import { cn, humanDate, uid } from "@/lib/utils";
import type { FocusSession, Goal, GoalType, Milestone, PyqEntry } from "@/lib/types";

/* ============================================================
 * Goals panel — progress cards, milestones, contributions,
 * create/edit dialog, archive & delete. Real store data only.
 * ============================================================ */

const GOAL_COLORS = [
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

const TYPE_OPTIONS: { value: GoalType; label: string; auto: boolean; hint: string }[] = [
  { value: "numeric", label: "Numeric", auto: false, hint: "" },
  { value: "completion", label: "Completion", auto: false, hint: "" },
  { value: "time", label: "Time (minutes)", auto: true, hint: "Auto-tracked from all your focus sessions." },
  { value: "study-hours", label: "Study hours", auto: true, hint: "Auto-tracked from subject-tagged sessions." },
  { value: "questions", label: "Questions", auto: true, hint: "Auto-tracked from your PYQ attempts." },
  { value: "streak", label: "Streak", auto: false, hint: "" },
  { value: "custom", label: "Custom", auto: false, hint: "" },
];

const UNIT_PLACEHOLDER: Record<GoalType, string> = {
  numeric: "e.g. pages",
  completion: "",
  time: "min",
  "study-hours": "h",
  questions: "questions",
  streak: "days",
  custom: "",
};

interface GoalCtx {
  sessions: FocusSession[];
  pyq: PyqEntry[];
  since: number;
}

interface GoalDraftInput {
  title: string;
  description?: string;
  type: GoalType;
  target: number;
  unit?: string;
  deadline?: string;
  color: string;
  manualValue: number;
  milestones: Milestone[];
}

/** Progress computed from real data depending on goal type (same semantics as the goals widget). */
function goalProgress(goal: Goal, ctx: GoalCtx): number {
  switch (goal.type) {
    case "numeric":
    case "completion":
    case "custom":
    case "streak":
      return goal.manualValue ?? 0;
    case "time":
      return Math.round(ctx.sessions.reduce((m, s) => m + s.durationMs, 0) / 60000);
    case "study-hours":
      return Math.round(
        ctx.sessions
          .filter((s) => s.subjectId && s.startedAt >= ctx.since)
          .reduce((m, s) => m + s.durationMs, 0) / 3600_000
      );
    case "questions":
      return ctx.pyq.reduce((m, p) => m + p.attempted, 0);
  }
}

function isAutoType(type: GoalType): boolean {
  return type === "time" || type === "study-hours" || type === "questions";
}

function defaultUnit(type: GoalType): string {
  switch (type) {
    case "time":
      return "m";
    case "study-hours":
      return "h";
    case "streak":
      return "d";
    default:
      return "";
  }
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

/* ---------- goal card ---------- */

function GoalCard({
  goal,
  onEdit,
  onArchive,
  onDelete,
}: {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  onArchive: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
}) {
  const sessions = useSessionStore((s) => s.sessions);
  const pyq = useStudyStore((s) => s.pyq);
  const contribute = useGoalStore((s) => s.contribute);
  const addMilestone = useGoalStore((s) => s.addMilestone);
  const toggleMilestone = useGoalStore((s) => s.toggleMilestone);
  const deleteMilestone = useGoalStore((s) => s.deleteMilestone);

  const [msInput, setMsInput] = useState("");
  const [amount, setAmount] = useState("");
  const [expanded, setExpanded] = useState(false);

  const ctx: GoalCtx = { sessions, pyq, since: 0 };
  const typeInfo = TYPE_OPTIONS.find((t) => t.value === goal.type) ?? TYPE_OPTIONS[0];
  const current = goalProgress(goal, ctx);
  const capped = Math.min(current, goal.target);
  const pctVal = goal.target > 0 ? Math.round((capped / goal.target) * 100) : 0;
  const completed = goal.target > 0 && current >= goal.target;
  const unit = goal.unit ?? defaultUnit(goal.type);
  const doneMilestones = goal.milestones.filter((m) => m.done).length;
  const daysLeft = goal.deadline ? differenceInCalendarDays(parseISO(goal.deadline), new Date()) : null;
  const deadlineColor =
    daysLeft == null ? undefined : daysLeft < 0 ? "var(--negative)" : daysLeft < 7 ? "var(--warning)" : undefined;
  const lastContribs = goal.contributions.slice(-8).reverse();
  const amountNum = Number.parseFloat(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;

  const submitMilestone = (e: FormEvent) => {
    e.preventDefault();
    const t = msInput.trim();
    if (!t) return;
    addMilestone(goal.id, t);
    setMsInput("");
  };

  const submitContribution = (e: FormEvent) => {
    e.preventDefault();
    if (!amountValid) {
      toast.error("Enter a positive amount");
      return;
    }
    contribute(goal.id, amountNum);
    toast.success(`+${amountNum}${unit ? ` ${unit}` : ""} added to “${goal.title}”`);
    setAmount("");
  };

  return (
    <article className="widget flex flex-col gap-3 p-3.5 sm:p-4">
      {/* header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{goal.title}</h3>
            {completed && (
              <CheckCircle2
                className="h-4 w-4 shrink-0"
                style={{ color: "var(--positive)" }}
                aria-label="Goal completed"
              />
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-c"
              style={{ background: "color-mix(in srgb, var(--text) 8%, transparent)" }}
            >
              {typeInfo.label}
            </span>
            {goal.milestones.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-muted-c">
                <Flag className="h-2.5 w-2.5" aria-hidden="true" />
                <span className="tabular-nums">
                  {doneMilestones}/{goal.milestones.length}
                </span>
              </span>
            )}
            {goal.deadline && (
              <span
                className="flex items-center gap-1 text-[10px]"
                style={deadlineColor ? { color: deadlineColor } : undefined}
                title={goal.deadline}
              >
                <CalendarDays className="h-2.5 w-2.5" aria-hidden="true" />
                {humanDate(goal.deadline)}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconBtn label={`Edit ${goal.title}`} onClick={() => onEdit(goal)}>
            <Pencil className="h-4 w-4" />
          </IconBtn>
          <IconBtn label={`Archive ${goal.title}`} onClick={() => onArchive(goal)}>
            <Archive className="h-4 w-4" />
          </IconBtn>
          <IconBtn label={`Delete ${goal.title}`} onClick={() => onDelete(goal)}>
            <Trash2 className="h-4 w-4" />
          </IconBtn>
        </div>
      </div>

      {goal.description && <p className="line-clamp-2 text-xs leading-relaxed text-muted-c">{goal.description}</p>}

      {/* progress */}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-xs tabular-nums text-muted-c">
            {current}/{goal.target}
            {unit && ` ${unit}`}
          </span>
          <span className="text-xs font-semibold tabular-nums" style={{ color: goal.color ?? "var(--accent)" }}>
            {pctVal}%
          </span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "color-mix(in srgb, var(--text) 10%, transparent)" }}
          role="progressbar"
          aria-valuenow={pctVal}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${goal.title} progress`}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pctVal}%`, background: goal.color ?? "var(--accent)" }}
          />
        </div>
      </div>

      {/* milestones */}
      <div className="space-y-1.5">
        {goal.milestones.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-c">
              {doneMilestones}/{goal.milestones.length} milestones
            </p>
            <ul
              className={cn(
                "space-y-0.5",
                goal.milestones.length > 4 && "max-h-40 fd-scroll pr-1"
              )}
            >
              {goal.milestones.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                >
                  <button
                    type="button"
                    onClick={() => toggleMilestone(goal.id, m.id)}
                    aria-pressed={m.done}
                    aria-label={`${m.done ? "Reopen" : "Complete"} milestone: ${m.title}`}
                    className="press flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                    style={
                      m.done
                        ? { background: goal.color ?? "var(--accent)", borderColor: "transparent" }
                        : { borderColor: "color-mix(in srgb, var(--text) 28%, transparent)" }
                    }
                  >
                    {m.done && <Check className="h-3 w-3 text-white" strokeWidth={3.5} aria-hidden="true" />}
                  </button>
                  <span className={cn("min-w-0 flex-1 truncate text-xs", m.done && "text-muted-c line-through")}>
                    {m.title}
                  </span>
                  <IconBtn label={`Delete milestone: ${m.title}`} onClick={() => deleteMilestone(goal.id, m.id)}>
                    <X className="h-3.5 w-3.5" />
                  </IconBtn>
                </li>
              ))}
            </ul>
          </div>
        )}
        <form onSubmit={submitMilestone} className="flex items-center gap-1.5">
          <input
            value={msInput}
            onChange={(e) => setMsInput(e.target.value)}
            placeholder="Add milestone…"
            aria-label={`Add milestone to ${goal.title}`}
            className="h-9 min-w-0 flex-1 rounded-lg border hairline bg-transparent px-2.5 text-xs outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] placeholder:text-[var(--text-muted)]"
          />
          <button
            type="submit"
            disabled={!msInput.trim()}
            aria-label="Add milestone"
            className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-c transition-colors hover:text-[var(--text)] bg-[color-mix(in_srgb,var(--text)_8%,transparent)] disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>

      {/* quick add progress / auto-tracked note */}
      {isAutoType(goal.type) ? (
        <p className="flex items-center gap-1.5 text-[10px] text-muted-c">
          <Zap className="h-3 w-3 shrink-0" style={{ color: "var(--accent)" }} aria-hidden="true" />
          {typeInfo.hint}
        </p>
      ) : (
        <form onSubmit={submitContribution} className="flex items-center gap-1.5">
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Add progress"
            aria-label={`Add progress to ${goal.title}`}
            className="h-9 min-w-0 flex-1 rounded-lg border hairline bg-transparent px-2.5 text-xs tabular-nums outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] placeholder:text-[var(--text-muted)]"
          />
          {unit && <span className="shrink-0 text-[10px] text-muted-c">{unit}</span>}
          <button
            type="submit"
            disabled={!amountValid}
            className="press flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-xs font-semibold transition-opacity disabled:opacity-40"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </form>
      )}

      {/* contributions history */}
      {goal.contributions.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="press flex w-full items-center gap-1.5 text-[10px] text-muted-c transition-colors hover:text-[var(--text)]"
          >
            <History className="h-3 w-3" aria-hidden="true" />
            <span className="tabular-nums">
              {goal.contributions.length} {goal.contributions.length === 1 ? "contribution" : "contributions"}
            </span>
            <ChevronDown
              className={cn("ml-auto h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
              aria-hidden="true"
            />
          </button>
          {expanded && (
            <ul className="mt-1.5 max-h-40 space-y-1 fd-scroll pr-1">
              {lastContribs.map((c, i) => (
                <li key={`${c.date}-${i}`} className="flex items-baseline gap-2 text-[11px]">
                  <span className="shrink-0 text-muted-c">{humanDate(c.date)}</span>
                  <span
                    className="shrink-0 font-semibold tabular-nums"
                    style={{ color: goal.color ?? "var(--accent)" }}
                  >
                    {`+${c.amount}${unit ? ` ${unit}` : ""}`}
                  </span>
                  {c.note && <span className="min-w-0 flex-1 truncate text-muted-c">{c.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

/* ---------- create / edit dialog ---------- */

function GoalDialog({
  open,
  onOpenChange,
  goal,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: Goal | null;
  onSave: (draft: GoalDraftInput) => void;
}) {
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [type, setType] = useState<GoalType>(goal?.type ?? "numeric");
  const [target, setTarget] = useState(goal ? String(goal.target) : "100");
  const [unit, setUnit] = useState(goal?.unit ?? "");
  const [deadline, setDeadline] = useState(goal?.deadline ?? "");
  const [color, setColor] = useState<string>(goal?.color ?? GOAL_COLORS[0]);
  const [startValue, setStartValue] = useState(String(goal?.manualValue ?? 0));
  const [milestones, setMilestones] = useState<Milestone[]>(goal?.milestones ? [...goal.milestones] : []);
  const [msInput, setMsInput] = useState("");

  const typeInfo = TYPE_OPTIONS.find((t) => t.value === type) ?? TYPE_OPTIONS[0];
  const targetNum = Number.parseFloat(target);
  const valid = title.trim().length > 0 && Number.isFinite(targetNum) && targetNum > 0;

  const save = () => {
    if (!valid) return;
    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      target: targetNum,
      unit: unit.trim() || undefined,
      deadline: deadline || undefined,
      color,
      manualValue: typeInfo.auto
        ? (goal?.manualValue ?? 0)
        : Math.max(0, Number.parseFloat(startValue) || 0),
      milestones,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] fd-scroll sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{goal ? "Edit goal" : "New goal"}</DialogTitle>
          <DialogDescription>
            {goal ? "Update the details of this goal." : "Set a measurable target and let Flowdeck track your progress."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="goal-title">Title</FieldLabel>
            <input
              id="goal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Finish Physics syllabus"
              className="h-9 w-full rounded-lg border hairline bg-transparent px-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          <div>
            <FieldLabel htmlFor="goal-desc">Description</FieldLabel>
            <textarea
              id="goal-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional — what does success look like?"
              className="min-h-[60px] w-full resize-none rounded-lg border hairline bg-transparent px-3 py-2 text-sm outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          <div>
            <FieldLabel htmlFor="goal-type">Type</FieldLabel>
            <div className="relative">
              <select
                id="goal-type"
                value={type}
                onChange={(e) => setType(e.target.value as GoalType)}
                className="h-9 w-full appearance-none rounded-lg border hairline bg-[var(--card-solid)] px-3 pr-8 text-sm outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-c" />
            </div>
            {typeInfo.auto && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-c">
                <Zap className="h-3 w-3 shrink-0" style={{ color: "var(--accent)" }} aria-hidden="true" />
                {typeInfo.hint}
              </p>
            )}
          </div>

          <div>
            <FieldLabel htmlFor="goal-target">Target</FieldLabel>
            <div className="flex items-center gap-1.5">
              <input
                id="goal-target"
                type="number"
                min="1"
                step="any"
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="100"
                className="h-9 min-w-0 flex-1 rounded-lg border hairline bg-transparent px-3 text-sm tabular-nums outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] placeholder:text-[var(--text-muted)]"
              />
              <input
                id="goal-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder={UNIT_PLACEHOLDER[type] || "unit"}
                aria-label="Unit"
                className="h-9 w-24 rounded-lg border hairline bg-transparent px-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] placeholder:text-[var(--text-muted)]"
              />
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="goal-deadline">Deadline</FieldLabel>
            <div className="flex items-center gap-1.5">
              <input
                id="goal-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="h-9 min-w-0 flex-1 rounded-lg border hairline bg-transparent px-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
              />
              {deadline && (
                <IconBtn label="Clear deadline" onClick={() => setDeadline("")}>
                  <X className="h-4 w-4" />
                </IconBtn>
              )}
            </div>
          </div>

          <div>
            <FieldLabel>Color</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              {GOAL_COLORS.map((c) => {
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

          {!typeInfo.auto && (
            <div>
              <FieldLabel htmlFor="goal-start">Starting value</FieldLabel>
              <input
                id="goal-start"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={startValue}
                onChange={(e) => setStartValue(e.target.value)}
                className="h-9 w-full rounded-lg border hairline bg-transparent px-3 text-sm tabular-nums outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
              />
              <p className="mt-1.5 text-[11px] text-muted-c">Progress you’ve already made toward this goal.</p>
            </div>
          )}

          <div>
            <FieldLabel>Milestones</FieldLabel>
            {milestones.length > 0 && (
              <ul className="mb-1.5 space-y-0.5">
                {milestones.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-2 rounded-lg px-1 py-0.5 transition-colors hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setMilestones((ms) => ms.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)))
                      }
                      aria-pressed={m.done}
                      aria-label={`${m.done ? "Reopen" : "Complete"} milestone: ${m.title}`}
                      className="press flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                      style={
                        m.done
                          ? { background: color, borderColor: "transparent" }
                          : { borderColor: "color-mix(in srgb, var(--text) 28%, transparent)" }
                      }
                    >
                      {m.done && <Check className="h-3 w-3 text-white" strokeWidth={3.5} aria-hidden="true" />}
                    </button>
                    <span className={cn("min-w-0 flex-1 truncate text-xs", m.done && "text-muted-c line-through")}>
                      {m.title}
                    </span>
                    <IconBtn
                      label={`Remove milestone: ${m.title}`}
                      onClick={() => setMilestones((ms) => ms.filter((x) => x.id !== m.id))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </IconBtn>
                  </li>
                ))}
              </ul>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const t = msInput.trim();
                if (!t) return;
                setMilestones((ms) => [...ms, { id: uid(), title: t, done: false }]);
                setMsInput("");
              }}
              className="flex items-center gap-1.5"
            >
              <input
                value={msInput}
                onChange={(e) => setMsInput(e.target.value)}
                placeholder="Add a milestone…"
                aria-label="Add milestone"
                className="h-9 min-w-0 flex-1 rounded-lg border hairline bg-transparent px-2.5 text-xs outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] placeholder:text-[var(--text-muted)]"
              />
              <button
                type="submit"
                disabled={!msInput.trim()}
                aria-label="Add milestone"
                className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-c transition-colors hover:text-[var(--text)] bg-[color-mix(in_srgb,var(--text)_8%,transparent)] disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </div>

        <DialogFooter>
          <PanelActionButton variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </PanelActionButton>
          <PanelActionButton onClick={save} disabled={!valid}>
            {goal ? "Save changes" : "Create goal"}
          </PanelActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- archived ---------- */

function ArchivedGoals({ goals, onRestore }: { goals: Goal[]; onRestore: (goal: Goal) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="press mb-2 flex w-full items-center gap-2 text-left"
      >
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-c">Archived · {goals.length}</h3>
        <span className="flex-1" />
        <ChevronDown
          className={cn("h-4 w-4 text-muted-c transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open && (
        <ul className="widget max-h-56 fd-scroll p-1.5">
          {goals.map((g) => (
            <li
              key={g.id}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-muted-c">{g.title}</span>
              <span className="shrink-0 text-[10px] text-muted-c">
                {TYPE_OPTIONS.find((t) => t.value === g.type)?.label ?? g.type}
              </span>
              <IconBtn label={`Restore ${g.title}`} onClick={() => onRestore(g)}>
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

export function GoalsPanel() {
  const goals = useGoalStore((s) => s.goals);
  const addGoal = useGoalStore((s) => s.addGoal);
  const updateGoal = useGoalStore((s) => s.updateGoal);
  const deleteGoal = useGoalStore((s) => s.deleteGoal);
  const archiveGoal = useGoalStore((s) => s.archiveGoal);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState<Goal | null>(null);

  const active = goals.filter((g) => !g.archived);
  const archived = goals.filter((g) => g.archived);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleSave = (draft: GoalDraftInput) => {
    if (editing) {
      updateGoal(editing.id, draft);
      toast.success("Goal updated");
    } else {
      addGoal(draft);
      toast.success("Goal created");
    }
    setDialogOpen(false);
    setEditing(null);
  };

  const handleArchive = (goal: Goal) => {
    archiveGoal(goal.id, true);
    toast.success(`“${goal.title}” archived`);
  };

  const handleRestore = (goal: Goal) => {
    archiveGoal(goal.id, false);
    toast.success(`“${goal.title}” restored`);
  };

  return (
    <PanelShell
      title="Goals"
      subtitle={`${active.length} active`}
      icon={<Target className="h-4 w-4" />}
      actions={
        <PanelActionButton onClick={openNew}>
          <Plus className="h-4 w-4" />
          New goal
        </PanelActionButton>
      }
    >
      {active.length === 0 ? (
        <PanelEmptyState
          icon={<Target className="h-5 w-5 text-muted-c" />}
          title="No goals yet"
          hint="Set a target worth chasing — study hours, questions solved, streaks or anything you’re working toward."
          action={
            <PanelActionButton onClick={openNew}>
              <Plus className="h-4 w-4" />
              New goal
            </PanelActionButton>
          }
        />
      ) : (
        <div>
          <PanelSection>Active goals</PanelSection>
          <div className="grid gap-3 sm:grid-cols-2">
            {active.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                onEdit={(goal) => {
                  setEditing(goal);
                  setDialogOpen(true);
                }}
                onArchive={handleArchive}
                onDelete={(goal) => setDeleting(goal)}
              />
            ))}
          </div>
        </div>
      )}

      {archived.length > 0 && (
        <div className={active.length === 0 ? "" : "mt-5"}>
          <ArchivedGoals goals={archived} onRestore={handleRestore} />
        </div>
      )}

      <GoalDialog
        key={dialogOpen ? editing?.id ?? "new" : "closed"}
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditing(null);
        }}
        goal={editing}
        onSave={handleSave}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete goal?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.title}”, its milestones and contribution history will be permanently removed. This can’t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="press rounded-lg font-semibold"
              style={{ background: "color-mix(in srgb, var(--negative) 15%, transparent)", color: "var(--negative)" }}
              onClick={() => {
                if (!deleting) return;
                deleteGoal(deleting.id);
                toast.success(`“${deleting.title}” deleted`);
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
