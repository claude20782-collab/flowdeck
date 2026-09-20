"use client";

/* ============================================================
 * TasksPanel — Flowdeck's full task manager.
 * Views: Today / Upcoming / Inbox / Scheduled / Completed / Archived.
 * Search + priority/tag filters + sort (synced with settings store),
 * inline expanded editor, top composer, bulk selection (long-press or
 * header toggle), manual reorder, confirm-guarded destructive ops.
 * ============================================================ */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Archive, ArchiveRestore, CalendarClock, CalendarDays, CheckCheck, CheckCircle2, CheckSquare,
  ChevronDown, ChevronUp, Clock3, Copy, Hash, Inbox, ListTodo, Plus, Repeat, Search, Sun, Trash2, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PanelActionButton, PanelEmptyState, PanelSection, PanelShell } from "./panel-shell";
import { useSettingsStore } from "@/lib/store/settings-store";
import { useTaskStore } from "@/lib/store/task-store";
import type { Priority, RecurKind, Task } from "@/lib/types";
import { cn, fmtMinutes, humanDate, todayKey, uid } from "@/lib/utils";

/* ---------------- types & constants ---------------- */

type ViewId = "today" | "upcoming" | "inbox" | "scheduled" | "completed" | "archived";
type SortKind = "manual" | "due" | "priority" | "created";
type PrioFilter = Priority | "all";
type PendingAction = { kind: "task"; task: Task } | { kind: "bulk" } | { kind: "clear" } | null;

const VIEW_IDS: ViewId[] = ["today", "upcoming", "inbox", "scheduled", "completed", "archived"];
const VIEW_LABELS: Record<ViewId, string> = {
  today: "Today", upcoming: "Upcoming", inbox: "Inbox",
  scheduled: "Scheduled", completed: "Completed", archived: "Archived",
};

/** Same priority dot palette as the dashboard tasks widget. */
const PRIORITY_DOT: Record<Priority, string> = {
  none: "transparent",
  low: "color-mix(in srgb, var(--text) 30%, transparent)",
  medium: "var(--warning)",
  high: "color-mix(in srgb, var(--negative) 80%, var(--warning))",
  urgent: "var(--negative)",
};
const PRIORITY_LABEL: Record<Priority, string> = {
  none: "None", low: "Low", medium: "Medium", high: "High", urgent: "Urgent",
};
const PRIO_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
const RECUR_LABEL: Record<RecurKind, string> = {
  daily: "daily", weekdays: "on weekdays", weekly: "weekly", monthly: "monthly",
};
const SORT_OPTIONS: { value: SortKind; label: string }[] = [
  { value: "manual", label: "Manual" }, { value: "due", label: "Due date" },
  { value: "priority", label: "Priority" }, { value: "created", label: "Created" },
];
const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "None" }, { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
  { value: "high", label: "High" }, { value: "urgent", label: "Urgent" },
];
const RECUR_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "None" }, { value: "daily", label: "Daily" }, { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" },
];
const FILTER_PRIORITIES: PrioFilter[] = ["all", "urgent", "high", "medium", "low", "none"];

/** Progressive rendering: rows painted per chunk (auto-extended on scroll). */
const RENDER_CHUNK = 40;

const INPUT_CLS =
  "h-9 w-full rounded-lg border hairline bg-transparent px-3 text-sm outline-none transition-colors focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] placeholder:text-muted-c";
const SELECT_CLS = "h-9 w-full appearance-none rounded-lg border hairline bg-[var(--card-solid)] px-3 pr-8 text-sm outline-none";
const FIELD_LABEL = "mb-1.5 block text-xs font-medium text-muted-c";

const EMPTY_STATE: Record<ViewId, { icon: LucideIcon; title: string; hint: string }> = {
  today: { icon: Sun, title: "Nothing due today", hint: "Nothing due today — enjoy the calm or plan ahead by scheduling tomorrow's work." },
  upcoming: { icon: CalendarClock, title: "No upcoming tasks", hint: "Give a task a future due date and it will appear here." },
  inbox: { icon: Inbox, title: "Inbox is empty", hint: "Capture anything without a date — it lands here until you schedule it." },
  scheduled: { icon: CalendarDays, title: "Nothing scheduled", hint: "Schedule tasks on specific days and they'll group here by date." },
  completed: { icon: CheckCircle2, title: "No completed tasks yet", hint: "Finished tasks collect here so you can look back — and clear them out." },
  archived: { icon: Archive, title: "Nothing archived", hint: "Archived tasks stay out of the way but are never lost — unarchive any time." },
};

/* ---------------- pure helpers ---------------- */

/** "work, revision , work" → ["work", "revision"] (trimmed + deduped). */
function parseTags(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(",")) {
    const tag = raw.trim();
    if (tag) seen.add(tag);
  }
  return [...seen];
}

/** View membership per spec (Today keeps tasks dated today even when done). */
function inView(t: Task, view: ViewId, today: string): boolean {
  switch (view) {
    case "today":
      if (t.archived) return false;
      if (t.scheduledDate === today || t.dueDate === today) return true;
      return !!t.dueDate && t.dueDate < today && !t.done; // overdue
    case "upcoming":
      return !t.done && !t.archived && !!t.dueDate && t.dueDate > today;
    case "inbox":
      return !t.done && !t.archived && !t.scheduledDate && !t.dueDate;
    case "scheduled":
      return !t.done && !t.archived && !!t.scheduledDate;
    case "completed":
      return t.done && !t.archived;
    case "archived":
      return t.archived === true;
  }
}

function matchesSearch(t: Task, q: string): boolean {
  if (!q) return true;
  if (t.title.toLowerCase().includes(q)) return true;
  if (t.notes && t.notes.toLowerCase().includes(q)) return true;
  return t.tags.some((tag) => tag.toLowerCase().includes(q));
}

function comparator(sort: SortKind): (a: Task, b: Task) => number {
  switch (sort) {
    case "due":
      return (a, b) =>
        (a.dueDate ?? a.scheduledDate ?? "9999").localeCompare(b.dueDate ?? b.scheduledDate ?? "9999") ||
        a.order - b.order;
    case "priority":
      return (a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || a.order - b.order;
    case "created":
      return (a, b) => b.createdAt - a.createdAt;
    default:
      return (a, b) => a.order - b.order;
  }
}

/* ---------------- small leaf components ---------------- */

/** Animated checkbox (rounded-[6px], fills accent, fd-burst on completion). */
function AnimatedCheckbox({ checked, variant, burst, onToggle, label }: {
  checked: boolean; variant: "done" | "select"; burst?: boolean; onToggle: () => void; label: string;
}) {
  return (
    <button type="button" onClick={onToggle} aria-label={label} aria-pressed={checked}
      className="press relative mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center">
      <span className={cn("h-[16px] w-[16px] rounded-[6px] border-2 transition-all duration-200",
        "border-[color-mix(in_srgb,var(--text)_28%,transparent)]")}
        style={checked
          ? variant === "done"
            ? { background: "var(--accent)", borderColor: "var(--accent)" }
            : { background: "color-mix(in srgb, var(--accent) 30%, transparent)", borderColor: "var(--accent)" }
          : undefined}>
        {checked && (
          <svg viewBox="0 0 12 12" className="h-full w-full p-[2px]" fill="none" aria-hidden="true">
            <path d="M2 6.5 4.5 9 10 3" stroke={variant === "done" ? "var(--accent-fg)" : "var(--accent)"}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {burst && (
        <span className="fd-burst absolute inset-0 rounded-full"
          style={{ background: "color-mix(in srgb, var(--accent) 50%, transparent)" }} aria-hidden="true" />
      )}
    </button>
  );
}

/** Labelled native select with ChevronDown overlay (timer-widget pattern). */
function SelectField({ id, label, value, onChange, options }: {
  id: string; label: string; value: string;
  onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label htmlFor={id} className={FIELD_LABEL}>{label}</label>
      <div className="relative">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={SELECT_CLS}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-c" aria-hidden="true" />
      </div>
    </div>
  );
}

function DateField({ id, label, value, onChange }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={FIELD_LABEL}>{label}</label>
      <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLS} />
    </div>
  );
}

/* ---------------- composer (opens from "New task") ---------------- */

function Composer({ onClose }: { onClose: () => void }) {
  const addTask = useTaskStore((s) => s.addTask);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("none");
  const [dueDate, setDueDate] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [tags, setTags] = useState("");
  const [recur, setRecur] = useState("");

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    addTask({
      title: trimmed, priority,
      dueDate: dueDate || undefined,
      scheduledDate: scheduledDate || undefined,
      tags: parseTags(tags),
      recur: recur ? (recur as RecurKind) : undefined,
    });
    toast.success("Task added");
    onClose();
  };

  return (
    <div className="widget fd-pop mb-3 space-y-3 p-3.5">
      <PanelSection action={
        <button type="button" onClick={onClose} aria-label="Close composer"
          className="press flex h-7 w-7 items-center justify-center rounded-lg text-muted-c transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-[var(--text)]">
          <X className="h-4 w-4" />
        </button>
      }>
        New task
      </PanelSection>
      <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
        autoFocus placeholder="What needs doing?" aria-label="Task title" className={cn(INPUT_CLS, "h-10 font-medium")} />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <SelectField id="new-task-priority" label="Priority" value={priority}
          onChange={(v) => setPriority(v as Priority)} options={PRIORITY_OPTIONS} />
        <SelectField id="new-task-recur" label="Recurrence" value={recur} onChange={setRecur} options={RECUR_OPTIONS} />
        <DateField id="new-task-due" label="Due date" value={dueDate} onChange={setDueDate} />
        <DateField id="new-task-scheduled" label="Scheduled" value={scheduledDate} onChange={setScheduledDate} />
      </div>
      <input value={tags} onChange={(e) => setTags(e.target.value)}
        placeholder="Tags, comma separated" aria-label="Task tags" className={INPUT_CLS} />
      <div className="flex items-center justify-end gap-2">
        <PanelActionButton variant="ghost" onClick={onClose}>Cancel</PanelActionButton>
        <PanelActionButton onClick={submit} disabled={!title.trim()} label="Add task">
          <Plus className="h-4 w-4" /> Add task
        </PanelActionButton>
      </div>
    </div>
  );
}

/* ---------------- inline task editor (expanded row) ---------------- */

function TaskEditor({ task, onDelete }: { task: Task; onDelete: () => void }) {
  const updateTask = useTaskStore((s) => s.updateTask);
  const addTask = useTaskStore((s) => s.addTask);
  const addSubtask = useTaskStore((s) => s.addSubtask);
  const toggleSubtask = useTaskStore((s) => s.toggleSubtask);
  const deleteSubtask = useTaskStore((s) => s.deleteSubtask);
  const archiveTask = useTaskStore((s) => s.archiveTask);

  const [draft, setDraft] = useState({
    title: task.title, notes: task.notes ?? "",
    tags: task.tags.join(", "), est: task.estMinutes != null ? String(task.estMinutes) : "",
  });
  const [subInput, setSubInput] = useState("");

  const commitTitle = () => {
    const v = draft.title.trim();
    if (v && v !== task.title) updateTask(task.id, { title: v });
    else setDraft((d) => ({ ...d, title: task.title }));
  };
  const commitNotes = () => {
    const v = draft.notes.trim();
    if (v !== (task.notes ?? "")) updateTask(task.id, { notes: v || undefined });
  };
  const commitTags = () => updateTask(task.id, { tags: parseTags(draft.tags) });
  const commitEst = () => {
    const n = Number(draft.est);
    updateTask(task.id, {
      estMinutes: draft.est.trim() !== "" && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined,
    });
  };

  const duplicate = () => {
    addTask({
      title: task.title, notes: task.notes, dueDate: task.dueDate, scheduledDate: task.scheduledDate,
      priority: task.priority, tags: [...task.tags], recur: task.recur, estMinutes: task.estMinutes,
      subtasks: task.subtasks.map((st) => ({ id: uid(), title: st.title, done: st.done })),
    });
    toast.success("Task duplicated");
  };
  const toggleArchive = () => {
    archiveTask(task.id, !task.archived);
    toast.success(task.archived ? "Task unarchived" : "Task archived");
  };
  const addSub = () => {
    const v = subInput.trim();
    if (!v) return;
    addSubtask(task.id, v);
    setSubInput("");
  };
  const subDone = task.subtasks.filter((st) => st.done).length;

  return (
    <div className="mx-2 mb-2 space-y-3 rounded-xl border hairline p-3"
      style={{ background: "color-mix(in srgb, var(--text) 4%, transparent)" }}>
      <div>
        <label htmlFor={`t-${task.id}-title`} className={FIELD_LABEL}>Title</label>
        <input id={`t-${task.id}-title`} value={draft.title} className={cn(INPUT_CLS, "font-medium")}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          onBlur={commitTitle} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      </div>
      <div>
        <label htmlFor={`t-${task.id}-notes`} className={FIELD_LABEL}>Notes</label>
        <textarea id={`t-${task.id}-notes`} rows={2} value={draft.notes} onBlur={commitNotes} placeholder="Add notes…"
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          className="w-full resize-none rounded-lg border hairline bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] placeholder:text-muted-c" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <SelectField id={`t-${task.id}-prio`} label="Priority" value={task.priority}
          onChange={(v) => updateTask(task.id, { priority: v as Priority })} options={PRIORITY_OPTIONS} />
        <SelectField id={`t-${task.id}-recur`} label="Recurrence" value={task.recur ?? ""}
          onChange={(v) => updateTask(task.id, { recur: v ? (v as RecurKind) : undefined })} options={RECUR_OPTIONS} />
        <DateField id={`t-${task.id}-due`} label="Due date" value={task.dueDate ?? ""}
          onChange={(v) => updateTask(task.id, { dueDate: v || undefined })} />
        <DateField id={`t-${task.id}-sched`} label="Scheduled date" value={task.scheduledDate ?? ""}
          onChange={(v) => updateTask(task.id, { scheduledDate: v || undefined })} />
        <div>
          <label htmlFor={`t-${task.id}-est`} className={FIELD_LABEL}>Est. minutes</label>
          <input id={`t-${task.id}-est`} type="number" min={0} step={5} inputMode="numeric" placeholder="—"
            value={draft.est} onChange={(e) => setDraft((d) => ({ ...d, est: e.target.value }))}
            onBlur={commitEst} className={cn(INPUT_CLS, "tabular-nums")} />
        </div>
        <div>
          <label htmlFor={`t-${task.id}-tags`} className={FIELD_LABEL}>Tags</label>
          <input id={`t-${task.id}-tags`} value={draft.tags} placeholder="work, revision" className={INPUT_CLS}
            onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))} onBlur={commitTags} />
        </div>
      </div>

      {/* subtasks */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-c">Subtasks</span>
          {task.subtasks.length > 0 && (
            <span className="text-[10px] tabular-nums text-muted-c">{subDone}/{task.subtasks.length}</span>
          )}
        </div>
        {task.subtasks.length > 0 && (
          <ul className="fd-scroll mb-2 max-h-44 space-y-0.5 overflow-y-auto pr-0.5">
            {task.subtasks.map((st) => (
              <li key={st.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                <button type="button" onClick={() => toggleSubtask(task.id, st.id)}
                  aria-label={`Toggle subtask "${st.title}"`}
                  className="press flex h-4 w-4 shrink-0 items-center justify-center">
                  <span className={cn("flex h-[14px] w-[14px] items-center justify-center rounded-[4px] border-2 transition-all duration-150",
                    st.done ? "border-transparent" : "border-[color-mix(in_srgb,var(--text)_28%,transparent)]")}
                    style={st.done ? { background: "var(--accent)", borderColor: "var(--accent)" } : undefined}>
                    {st.done && (
                      <svg viewBox="0 0 12 12" className="h-full w-full p-[2.5px]" fill="none" aria-hidden="true">
                        <path d="M2 6.5 4.5 9 10 3" stroke="var(--accent-fg)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                </button>
                <span className={cn("min-w-0 flex-1 truncate text-xs", st.done && "text-muted-c line-through")}>{st.title}</span>
                <button type="button" onClick={() => deleteSubtask(task.id, st.id)}
                  aria-label={`Delete subtask "${st.title}"`}
                  className="press flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-c transition-colors hover:text-[var(--negative)]">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <input value={subInput} onChange={(e) => setSubInput(e.target.value)} placeholder="Add a subtask…"
            aria-label="Add a subtask"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSub(); } }}
            className="h-8 min-w-0 flex-1 rounded-lg border hairline bg-transparent px-2.5 text-xs outline-none transition-colors focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] placeholder:text-muted-c" />
          <button type="button" onClick={addSub} disabled={!subInput.trim()} aria-label="Add subtask"
            className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-c transition-colors hover:text-[var(--text)] disabled:opacity-40"
            style={{ background: "color-mix(in srgb, var(--text) 8%, transparent)" }}>
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* row actions */}
      <div className="flex flex-wrap items-center gap-2 border-t hairline pt-3">
        <PanelActionButton variant="ghost" onClick={duplicate}>
          <Copy className="h-4 w-4" /> Duplicate
        </PanelActionButton>
        <PanelActionButton variant="ghost" onClick={toggleArchive}>
          {task.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          {task.archived ? "Unarchive" : "Archive"}
        </PanelActionButton>
        <span className="flex-1" />
        <PanelActionButton variant="danger" onClick={onDelete}>
          <Trash2 className="h-4 w-4" /> Delete
        </PanelActionButton>
      </div>
    </div>
  );
}

/* ---------------- task row ---------------- */

function TaskRow(p: {
  task: Task; today: string; expanded: boolean; selectMode: boolean; selected: boolean; burst: boolean;
  showMove: boolean; canMoveUp: boolean; canMoveDown: boolean;
  onExpand: () => void; onToggleDone: () => void; onSelect: () => void;
  onLongPress: (id: string) => void; onMove: (dir: -1 | 1) => void; onDelete: () => void;
}) {
  const { task, today } = p;
  const subDone = task.subtasks.filter((s) => s.done).length;
  const overdue = !!task.dueDate && task.dueDate < today && !task.done;
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  const cancelLP = () => {
    if (lpTimer.current) {
      clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
  };
  useEffect(() => cancelLP, []);

  /* long-press (500ms) enters selection mode and pre-selects this task */
  const startLP = () => {
    if (p.selectMode) return;
    lpTimer.current = setTimeout(() => {
      suppressClick.current = true;
      p.onLongPress(task.id);
      setTimeout(() => (suppressClick.current = false), 800);
    }, 500);
  };
  const rowClick = () => {
    cancelLP();
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (p.selectMode) {
      p.onSelect();
      return;
    }
    p.onExpand();
  };

  const moveBtn =
    "press flex h-7 w-7 items-center justify-center rounded-md text-muted-c transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-[var(--text)] disabled:opacity-30";

  return (
    <li className="select-none rounded-xl transition-colors hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
      <div className="flex items-start gap-2.5 px-2 py-2.5">
        {p.selectMode ? (
          <AnimatedCheckbox checked={p.selected} variant="select" onToggle={p.onSelect}
            label={`Select "${task.title}"`} />
        ) : (
          <AnimatedCheckbox checked={task.done} variant="done" burst={p.burst} onToggle={p.onToggleDone}
            label={`Mark "${task.title}" ${task.done ? "incomplete" : "complete"}`} />
        )}
        <button type="button" className="press min-w-0 flex-1 text-left" onClick={rowClick} aria-expanded={p.expanded}
          onPointerDown={startLP} onPointerUp={cancelLP} onPointerLeave={cancelLP}
          onPointerCancel={cancelLP} onContextMenu={(e) => e.preventDefault()}>
          <span className="flex items-center gap-1.5">
            <span className={cn("min-w-0 truncate text-sm font-medium", task.done && "text-muted-c line-through")}>
              {task.title}
            </span>
            {task.priority !== "none" && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PRIORITY_DOT[task.priority] }}
                aria-label={`${task.priority} priority`} />
            )}
          </span>
          {task.notes && <span className="mt-0.5 block truncate text-xs text-muted-c">{task.notes}</span>}
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {task.dueDate && (
              <span className={cn("flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                overdue ? "text-[var(--negative)]" : "text-muted-c")} title={`Due ${humanDate(task.dueDate)}`}
                style={overdue ? { background: "color-mix(in srgb, var(--negative) 10%, transparent)" } : undefined}>
                <CalendarClock className="h-3 w-3" aria-hidden="true" />
                {humanDate(task.dueDate)}
              </span>
            )}
            {task.recur && (
              <span className="flex items-center text-[10px] font-medium text-muted-c"
                title={`Repeats ${RECUR_LABEL[task.recur]}`}>
                <Repeat className="h-3 w-3" aria-hidden="true" />
              </span>
            )}
            {task.tags.map((tag) => (
              <span key={tag} className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-muted-c"
                style={{ background: "color-mix(in srgb, var(--text) 6%, transparent)" }}>#{tag}</span>
            ))}
            {task.subtasks.length > 0 && (
              <span className="text-[10px] tabular-nums text-muted-c">{subDone}/{task.subtasks.length}</span>
            )}
            {task.estMinutes != null && task.estMinutes > 0 && (
              <span className="flex items-center gap-1 text-[10px] tabular-nums text-muted-c">
                <Clock3 className="h-3 w-3" aria-hidden="true" />
                {fmtMinutes(task.estMinutes)}
              </span>
            )}
          </span>
        </button>
        {p.showMove && !p.selectMode && (
          <span className="flex shrink-0 flex-col gap-0.5 pt-0.5">
            <button type="button" className={moveBtn} onClick={() => p.onMove(-1)} disabled={!p.canMoveUp}
              aria-label={`Move "${task.title}" up`} title="Move up">
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" className={moveBtn} onClick={() => p.onMove(1)} disabled={!p.canMoveDown}
              aria-label={`Move "${task.title}" down`} title="Move down">
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {p.expanded && (
          <motion.div key="editor" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18, ease: "easeOut" }} className="overflow-hidden">
            <TaskEditor key={task.id} task={task} onDelete={p.onDelete} />
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/* ---------------- tabs / filter bar / bulk bar / confirm dialog ---------------- */

function ViewTabs({ view, counts, onChange }: {
  view: ViewId; counts: Record<ViewId, number>; onChange: (v: ViewId) => void;
}) {
  return (
    <div className="fd-scroll mb-3 flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Task views">
      {VIEW_IDS.map((v) => {
        const active = view === v;
        return (
          <button key={v} type="button" role="tab" aria-selected={active} onClick={() => onChange(v)}
            className={cn("press flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors",
              active ? "text-[var(--accent-fg)]" : "text-muted-c hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-[var(--text)]")}
            style={active ? { background: "var(--accent)" } : undefined}>
            {VIEW_LABELS[v]}
            {counts[v] > 0 && (
              <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums",
                active ? "text-[var(--accent-fg)]" : "text-muted-c")}
                style={{ background: active ? "color-mix(in srgb, var(--accent-fg) 25%, transparent)"
                  : "color-mix(in srgb, var(--text) 8%, transparent)" }}>
                {counts[v]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function FilterBar({ query, onQuery, prio, onPrio, tags, tag, onTag, sort, onSort }: {
  query: string; onQuery: (v: string) => void;
  prio: PrioFilter; onPrio: (p: PrioFilter) => void;
  tags: string[]; tag: string | null; onTag: (t: string | null) => void;
  sort: SortKind; onSort: (s: SortKind) => void;
}) {
  return (
    <div className="widget mb-3 space-y-2.5 p-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-c" aria-hidden="true" />
          <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search title, notes, tags…"
            aria-label="Search tasks"
            className="h-9 w-full rounded-lg border hairline bg-transparent pl-8 pr-3 text-sm outline-none transition-colors focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] placeholder:text-muted-c" />
        </div>
        <div className="relative shrink-0" style={{ width: 128 }}>
          <select value={sort} onChange={(e) => onSort(e.target.value as SortKind)} aria-label="Sort tasks" className={SELECT_CLS}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-c" aria-hidden="true" />
        </div>
      </div>
      <div className="fd-scroll flex items-center gap-1 overflow-x-auto pb-0.5">
        {FILTER_PRIORITIES.map((p) => {
          const active = prio === p;
          return (
            <button key={p} type="button" onClick={() => onPrio(p)} aria-pressed={active}
              className={cn("press flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition-colors",
                active ? "text-[var(--text)]" : "text-muted-c hover:text-[var(--text)]")}
              style={{ background: active ? "color-mix(in srgb, var(--text) 10%, transparent)"
                : "color-mix(in srgb, var(--text) 4%, transparent)" }}>
              {p === "all" ? null : p === "none" ? (
                <span className="h-1.5 w-1.5 rounded-full border"
                  style={{ borderColor: "color-mix(in srgb, var(--text) 35%, transparent)" }} />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: PRIORITY_DOT[p] }} />
              )}
              {p === "all" ? "All" : PRIORITY_LABEL[p]}
            </button>
          );
        })}
      </div>
      {tags.length > 0 && (
        <div className="fd-scroll flex items-center gap-1 overflow-x-auto pb-0.5">
          {tags.map((t) => {
            const active = tag === t;
            return (
              <button key={t} type="button" onClick={() => onTag(active ? null : t)} aria-pressed={active}
                className={cn("press flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-[var(--accent)]" : "text-muted-c hover:text-[var(--text)]")}
                style={{ background: active ? "color-mix(in srgb, var(--accent) 14%, transparent)"
                  : "color-mix(in srgb, var(--text) 4%, transparent)" }}>
                <Hash className="h-3 w-3" aria-hidden="true" />
                {t}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BulkBar({ count, onComplete, onArchive, onDelete, onClear }: {
  count: number; onComplete: () => void; onArchive: () => void; onDelete: () => void; onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-2 text-xs font-semibold text-muted-c">
        <CheckSquare className="h-4 w-4" style={{ color: "var(--accent)" }} aria-hidden="true" />
        <span className="tabular-nums">{count}</span> selected
      </span>
      <span className="flex-1" />
      <PanelActionButton variant="ghost" onClick={onComplete} disabled={count === 0} label="Complete selected tasks">
        <CheckCheck className="h-4 w-4" /> <span className="hidden sm:inline">Complete</span>
      </PanelActionButton>
      <PanelActionButton variant="ghost" onClick={onArchive} disabled={count === 0} label="Archive selected tasks">
        <Archive className="h-4 w-4" /> <span className="hidden sm:inline">Archive</span>
      </PanelActionButton>
      <PanelActionButton variant="danger" onClick={onDelete} disabled={count === 0} label="Delete selected tasks">
        <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">Delete</span>
      </PanelActionButton>
      <PanelActionButton variant="ghost" onClick={onClear} label="Clear selection">
        <X className="h-4 w-4" /> <span className="hidden sm:inline">Clear</span>
      </PanelActionButton>
    </div>
  );
}

function ConfirmDialog({ pending, selectedCount, onCancel, onConfirm }: {
  pending: PendingAction; selectedCount: number; onCancel: () => void; onConfirm: () => void;
}) {
  const plural = selectedCount === 1 ? "" : "s";
  const meta =
    pending?.kind === "task"
      ? { title: "Delete task?", body: `"${pending.task.title}" will be permanently removed. This cannot be undone.`, action: "Delete" }
      : pending?.kind === "bulk"
        ? { title: `Delete ${selectedCount} task${plural}?`, body: "The selected tasks will be permanently removed. This cannot be undone.", action: "Delete" }
        : pending?.kind === "clear"
          ? { title: "Clear completed tasks?", body: "All completed tasks will be permanently removed. This cannot be undone.", action: "Clear" }
          : { title: "", body: "", action: "" };
  return (
    <AlertDialog open={pending !== null} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{meta.title}</AlertDialogTitle>
          <AlertDialogDescription>{meta.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}
            style={{ background: "color-mix(in srgb, var(--negative) 16%, transparent)", color: "var(--negative)" }}>
            {meta.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ---------------- main panel ---------------- */

export function TasksPanel() {
  const tasks = useTaskStore((s) => s.tasks);
  const toggleTask = useTaskStore((s) => s.toggleTask);
  const moveTask = useTaskStore((s) => s.moveTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const bulkComplete = useTaskStore((s) => s.bulkComplete);
  const bulkArchive = useTaskStore((s) => s.bulkArchive);
  const bulkDelete = useTaskStore((s) => s.bulkDelete);
  const clearCompleted = useTaskStore((s) => s.clearCompleted);
  const tasksSort = useSettingsStore((s) => s.tasksSort);
  const updateSettings = useSettingsStore((s) => s.update);

  const [view, setView] = useState<ViewId>("today");
  const [query, setQuery] = useState("");
  const [prioFilter, setPrioFilter] = useState<PrioFilter>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /* Progressive window: keep typing/filter-switching snappy with 500+ tasks. */
  const deferredQuery = useDeferredValue(query);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [burstId, setBurstId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);

  /*
   * Progressive render window (render-adjust pattern, no set-state-in-effect):
   * `epoch` captures every input that re-orders the list; when it changes the
   * stale limit is ignored on the next render and the window resets lazily.
   */
  const listEpoch = `${view}|${deferredQuery}|${prioFilter}|${tagFilter ?? ""}|${tasksSort}`;
  const [windowState, setWindowState] = useState({ epoch: listEpoch, limit: RENDER_CHUNK });
  const limit = windowState.epoch === listEpoch ? windowState.limit : RENDER_CHUNK;
  const growWindow = useCallback(() => {
    setWindowState((cur) =>
      cur.epoch === listEpoch
        ? { epoch: cur.epoch, limit: cur.limit + RENDER_CHUNK }
        : { epoch: listEpoch, limit: RENDER_CHUNK * 2 });
  }, [listEpoch]);
  const showAll = useCallback(() => {
    setWindowState({ epoch: listEpoch, limit: Number.MAX_SAFE_INTEGER });
  }, [listEpoch]);

  const today = todayKey();
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (burstTimer.current) clearTimeout(burstTimer.current); }, []);

  const celebrate = (id: string) => {
    setBurstId(id);
    if (burstTimer.current) clearTimeout(burstTimer.current);
    burstTimer.current = setTimeout(() => setBurstId(null), 600);
  };

  /* ----- derived data ----- */
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) if (!t.archived) for (const tag of t.tags) set.add(tag);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  const counts = useMemo(() => {
    const c: Record<ViewId, number> = { today: 0, upcoming: 0, inbox: 0, scheduled: 0, completed: 0, archived: 0 };
    for (const v of VIEW_IDS) c[v] = tasks.reduce((n, t) => n + (inView(t, v, today) ? 1 : 0), 0);
    return c;
  }, [tasks, today]);

  const openCount = useMemo(() => tasks.filter((t) => !t.done && !t.archived).length, [tasks]);
  const doneCount = useMemo(() => tasks.filter((t) => t.done && !t.archived).length, [tasks]);
  const viewTasks = useMemo(() => tasks.filter((t) => inView(t, view, today)), [tasks, view, today]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const list = viewTasks.filter(
      (t) =>
        matchesSearch(t, q) &&
        (prioFilter === "all" || t.priority === prioFilter) &&
        (!tagFilter || t.tags.includes(tagFilter))
    );
    if (view === "completed") return [...list].sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    const cmp = comparator(tasksSort);
    if (view === "scheduled") {
      return [...list].sort((a, b) => (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? "") || cmp(a, b));
    }
    return [...list].sort(cmp);
  }, [viewTasks, deferredQuery, prioFilter, tagFilter, view, tasksSort]);

  const scheduledGroups = useMemo(() => {
    if (view !== "scheduled") return [] as [string, Task[]][];
    const map = new Map<string, Task[]>();
    for (const t of filtered) {
      const key = t.scheduledDate ?? "";
      const arr = map.get(key);
      if (arr) arr.push(t);
      else map.set(key, [t]);
    }
    return [...map.entries()];
  }, [view, filtered]);

  /* Windowed slices: the first `limit` rows across the flat list / groups. */
  const visibleFlat = useMemo(() => filtered.slice(0, limit), [filtered, limit]);
  const visibleGroups = useMemo(() => {
    if (view !== "scheduled") return [] as [string, Task[]][];
    let remaining = limit;
    const out: [string, Task[]][] = [];
    for (const [date, items] of scheduledGroups) {
      if (remaining <= 0) break;
      out.push([date, remaining < items.length ? items.slice(0, remaining) : items]);
      remaining -= items.length;
    }
    return out;
  }, [view, scheduledGroups, limit]);
  const visibleCount = view === "scheduled"
    ? visibleGroups.reduce((n, [, items]) => n + items.length, 0)
    : visibleFlat.length;
  const truncated = filtered.length > visibleCount;

  /* Auto-extend the window as the sentinel nears the viewport. */
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !truncated) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) growWindow(); },
      { rootMargin: "600px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [growWindow, truncated, limit, view]);

  const showMove = (view === "inbox" || view === "today") && tasksSort === "manual";

  /* ----- handlers ----- */
  const handleToggle = (t: Task) => {
    const nowDone = toggleTask(t.id);
    if (nowDone) {
      celebrate(t.id);
      if (t.recur) toast.success(`Repeats ${RECUR_LABEL[t.recur]} — next occurrence scheduled`);
    }
  };

  /**
   * Manual reorder via repeated moveTask calls so the task visually swaps
   * with its neighbour *within the current view*, skipping tasks filtered
   * out of the view (a single press always produces a visible move).
   */
  const handleMove = (id: string, dir: -1 | 1) => {
    const visible = new Set(filtered.map((t) => t.id));
    const full = [...tasks].sort((a, b) => a.order - b.order);
    const i = full.findIndex((t) => t.id === id);
    if (i < 0) return;
    let j = i + dir;
    while (j >= 0 && j < full.length && !visible.has(full[j].id)) j += dir;
    if (j < 0 || j >= full.length) return;
    const steps = Math.abs(j - i);
    for (let s = 0; s < steps; s++) moveTask(id, dir);
  };

  const toggleSelect = (id: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const handleLongPress = (id: string) => {
    setSelectMode(true);
    setSelected(new Set([id]));
  };
  const exitSelect = () => {
    setSelected(new Set());
    setSelectMode(false);
  };

  const handleBulkComplete = () => {
    if (selected.size === 0) return;
    bulkComplete([...selected], true);
    toast.success(`Completed ${selected.size} task${selected.size === 1 ? "" : "s"}`);
    exitSelect();
  };
  const handleBulkArchive = () => {
    if (selected.size === 0) return;
    bulkArchive([...selected], true);
    toast.success(`Archived ${selected.size} task${selected.size === 1 ? "" : "s"}`);
    exitSelect();
  };

  const runConfirm = () => {
    if (!pending) return;
    if (pending.kind === "task") {
      deleteTask(pending.task.id);
      if (expandedId === pending.task.id) setExpandedId(null);
      toast.success("Task deleted");
    } else if (pending.kind === "bulk") {
      const n = selected.size;
      bulkDelete([...selected]);
      toast.success(`Deleted ${n} task${n === 1 ? "" : "s"}`);
      exitSelect();
    } else {
      clearCompleted();
      toast.success("Completed tasks cleared");
    }
    setPending(null);
  };

  const clearFilters = () => {
    setQuery("");
    setPrioFilter("all");
    setTagFilter(null);
  };

  const renderRow = (t: Task, i: number, list: Task[]) => (
    <TaskRow key={t.id} task={t} today={today} expanded={expandedId === t.id}
      selectMode={selectMode} selected={selected.has(t.id)} burst={burstId === t.id}
      showMove={showMove} canMoveUp={i > 0} canMoveDown={i < list.length - 1}
      onExpand={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
      onToggleDone={() => handleToggle(t)}
      onSelect={() => toggleSelect(t.id)}
      onLongPress={handleLongPress}
      onMove={(dir) => handleMove(t.id, dir)}
      onDelete={() => setPending({ kind: "task", task: t })} />
  );

  const isEmpty = filtered.length === 0;
  const empty = EMPTY_STATE[view];
  const EmptyIcon = empty.icon;

  /* ----- render ----- */
  return (
    <PanelShell
      title="Tasks"
      subtitle={`${openCount} open · ${doneCount} completed`}
      icon={<ListTodo className="h-4.5 w-4.5" style={{ color: "var(--accent)" }} />}
      actions={
        <>
          <button type="button" onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); }}
            aria-pressed={selectMode} aria-label="Toggle selection mode"
            className="press flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors"
            style={selectMode
              ? { background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }
              : { background: "color-mix(in srgb, var(--text) 8%, transparent)" }}>
            <CheckSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Select</span>
          </button>
          <PanelActionButton onClick={() => setComposerOpen((v) => !v)} label="New task">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New task</span>
          </PanelActionButton>
        </>
      }
      footer={selectMode ? (
        <BulkBar count={selected.size} onComplete={handleBulkComplete} onArchive={handleBulkArchive}
          onDelete={() => setPending({ kind: "bulk" })} onClear={exitSelect} />
      ) : undefined}
    >
      <ViewTabs view={view} counts={counts} onChange={setView} />
      {composerOpen && <Composer onClose={() => setComposerOpen(false)} />}
      <FilterBar query={query} onQuery={setQuery} prio={prioFilter} onPrio={setPrioFilter}
        tags={allTags} tag={tagFilter} onTag={setTagFilter} sort={tasksSort}
        onSort={(s) => updateSettings({ tasksSort: s })} />

      {view === "completed" && filtered.length > 0 && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-c">{filtered.length} completed</p>
          <PanelActionButton variant="danger" onClick={() => setPending({ kind: "clear" })}>
            <Trash2 className="h-4 w-4" /> Clear completed
          </PanelActionButton>
        </div>
      )}

      {isEmpty ? (
        viewTasks.length > 0 ? (
          <PanelEmptyState icon={<Search className="h-5 w-5 text-muted-c" />}
            title="No tasks match your filters" hint="Try a different search term, priority or tag."
            action={<PanelActionButton variant="ghost" onClick={clearFilters}>Clear filters</PanelActionButton>} />
        ) : (
          <PanelEmptyState icon={<EmptyIcon className="h-5 w-5 text-muted-c" />} title={empty.title} hint={empty.hint}
            action={view === "today" || view === "inbox" ? (
              <PanelActionButton onClick={() => setComposerOpen(true)}>
                <Plus className="h-4 w-4" /> Add a task
              </PanelActionButton>
            ) : undefined} />
        )
      ) : view === "scheduled" ? (
        <div className="space-y-5">
          {visibleGroups.map(([date, items]) => (
            <section key={date}>
              <PanelSection action={<span className="text-[10px] font-semibold tabular-nums text-muted-c">{items.length}</span>}>
                {date < today ? <span style={{ color: "var(--negative)" }}>{humanDate(date)}</span> : humanDate(date)}
              </PanelSection>
              <ul className="space-y-1">{items.map((t, i) => renderRow(t, i, items))}</ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="space-y-1">{visibleFlat.map((t, i) => renderRow(t, i, filtered))}</ul>
      )}

      {/* Progressive-render sentinel + explicit controls for very large lists. */}
      {truncated && !isEmpty && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
          <p className="text-[11px] font-medium tabular-nums text-muted-c">
            Showing {visibleCount} of {filtered.length} — keep scrolling to load more
          </p>
          <PanelActionButton variant="ghost" onClick={showAll} label="Render every task in this view">
            Show all {filtered.length}
          </PanelActionButton>
        </div>
      )}

      <ConfirmDialog pending={pending} selectedCount={selected.size}
        onCancel={() => setPending(null)} onConfirm={runConfirm} />
    </PanelShell>
  );
}
