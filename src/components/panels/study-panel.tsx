"use client";

import { useMemo, useState, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileQuestion,
  GraduationCap,
  Pencil,
  Plus,
  RefreshCcw,
  Timer,
  Trash2,
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
import {
  chapterStats,
  revisionQueue,
  subjectStats,
  useStudyStore,
  weakTopics,
} from "@/lib/store/study-store";
import { useSessionStore } from "@/lib/store/session-store";
import { useSettingsStore } from "@/lib/store/settings-store";
import { cn, dateKey, daysAgoKey, fmtMinutes, todayKey } from "@/lib/utils";
import { HBarChart, LineChart, ProgressRing } from "@/components/charts/primitives";
import { GoalRing } from "@/components/charts/goal-ring";
import { studyMinutesToday } from "@/lib/analytics";
import type {
  Chapter,
  ChapterStatus,
  MockTest,
  PyqEntry,
  Subject,
} from "@/lib/types";

/* ============================================================
 * Study panel — the JEE preparation system.
 * Four tabs: Syllabus · PYQ Practice · Mock Tests · Study Log.
 * Everything derives from useStudyStore (fully user-configured
 * syllabus — starter subjects ship with zero chapters).
 * ============================================================ */

type TabId = "syllabus" | "pyq" | "mocks" | "log";

const TABS: { id: TabId; label: string }[] = [
  { id: "syllabus", label: "Syllabus" },
  { id: "pyq", label: "PYQ Practice" },
  { id: "mocks", label: "Mock Tests" },
  { id: "log", label: "Study Log" },
];

const SUBJECT_COLORS = [
  "#e879f9",
  "#34d399",
  "#fbbf24",
  "#38bdf8",
  "#f87171",
  "#a78bfa",
  "#f472b6",
  "#84cc16",
  "#fb923c",
  "#2dd4bf",
];

type PyqDifficulty = PyqEntry["difficulty"];
type RevisionState = PyqEntry["revision"];

const STATUS_META: Record<ChapterStatus, { label: string; color: string; bg: string }> = {
  "not-started": {
    label: "Not started",
    color: "var(--text-muted)",
    bg: "color-mix(in srgb, var(--text) 8%, transparent)",
  },
  learning: {
    label: "Learning",
    color: "var(--warning)",
    bg: "color-mix(in srgb, var(--warning) 14%, transparent)",
  },
  revised: {
    label: "Revised",
    color: "var(--accent)",
    bg: "color-mix(in srgb, var(--accent) 14%, transparent)",
  },
  mastered: {
    label: "Mastered",
    color: "var(--positive)",
    bg: "color-mix(in srgb, var(--positive) 14%, transparent)",
  },
};

const STATUS_ORDER: ChapterStatus[] = ["not-started", "learning", "revised", "mastered"];

const DIFFICULTY_META: Record<PyqDifficulty, { color: string; bg: string }> = {
  easy: { color: "var(--positive)", bg: "color-mix(in srgb, var(--positive) 14%, transparent)" },
  medium: { color: "var(--warning)", bg: "color-mix(in srgb, var(--warning) 14%, transparent)" },
  hard: { color: "var(--negative)", bg: "color-mix(in srgb, var(--negative) 14%, transparent)" },
};

const REVISION_META: Record<RevisionState, { label: string; color: string; bg: string }> = {
  none: { label: "—", color: "var(--text-muted)", bg: "color-mix(in srgb, var(--text) 8%, transparent)" },
  flagged: { label: "flagged", color: "var(--warning)", bg: "color-mix(in srgb, var(--warning) 14%, transparent)" },
  revised: { label: "revised", color: "var(--positive)", bg: "color-mix(in srgb, var(--positive) 14%, transparent)" },
};

const CONF_HEIGHTS = [6, 8, 10, 12, 14];

/* ---------- small pure helpers ---------- */

/** "3d ago" / "today" / "never" for a lastRevisedAt timestamp. */
function daysAgoLabel(ts?: number): string {
  if (!ts) return "never";
  const d = Math.floor((Date.now() - ts) / 86400_000);
  return d <= 0 ? "today" : `${d}d ago`;
}

function accuracyTone(pct: number): string {
  if (pct >= 70) return "var(--positive)";
  if (pct >= 50) return "var(--warning)";
  return "var(--negative)";
}

function parseInt0(v: string): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Parse an optional number input → undefined when empty/invalid. */
function parseOptNum(v: string): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Optional integer clamped to [min, max]; empty string → undefined. */
function optInt(v: string, min: number, max: number): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const n = parseInt(t, 10);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(min, Math.min(max, n));
}

const nextRevision = (r: RevisionState): RevisionState =>
  r === "none" ? "flagged" : r === "flagged" ? "revised" : "none";

/* ---------- shared form atoms ---------- */

const inputCls =
  "h-9 w-full rounded-lg border hairline bg-transparent px-3 text-sm outline-none transition-colors focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]";
const selectCls =
  "h-9 w-full appearance-none rounded-lg border hairline bg-[var(--card-solid)] px-3 pr-8 text-sm outline-none transition-colors focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]";

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-c">
      {children}
    </span>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "date" | "number";
  inputMode?: "numeric" | "decimal" | "text";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={cn(inputCls, inputMode === "numeric" || inputMode === "decimal" ? "tabular-nums" : "")}
      />
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label={label}
          className={cn(selectCls, disabled && "opacity-50")}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-c"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function FieldTextarea({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        placeholder={placeholder}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="w-full resize-y rounded-lg border hairline bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
      />
    </div>
  );
}

/* ---------- shared display atoms ---------- */

function Stat({
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

function StatusChip({ status }: { status: ChapterStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ color: m.color, background: m.bg }}
    >
      {m.label}
    </span>
  );
}

function DifficultyChip({ difficulty }: { difficulty: PyqDifficulty }) {
  const m = DIFFICULTY_META[difficulty];
  return (
    <span
      className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold capitalize"
      style={{ color: m.color, background: m.bg }}
    >
      {difficulty}
    </span>
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="press rounded-lg font-semibold"
            style={{
              background: "color-mix(in srgb, var(--negative) 15%, transparent)",
              color: "var(--negative)",
            }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ColorSwatch({
  color,
  selected,
  onClick,
  label,
}: {
  color: string;
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-transform"
      style={{
        background: color,
        boxShadow: selected
          ? `0 0 0 2px var(--card-solid), 0 0 0 4px ${color}`
          : "0 0 0 1px color-mix(in srgb, var(--text) 12%, transparent)",
      }}
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
    >
      {selected && <Check className="h-3.5 w-3.5" style={{ color: "rgba(0,0,0,0.7)" }} aria-hidden="true" />}
    </button>
  );
}

function IconButton({
  onClick,
  label,
  danger,
  children,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-c transition-colors hover:text-[var(--text)]",
        danger && "hover:text-[var(--negative)]"
      )}
      onClick={onClick}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function MarkRevisedButton({ chapter }: { chapter: Chapter }) {
  const markRevised = useStudyStore((s) => s.markRevised);
  return (
    <button
      type="button"
      className="press flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[10px] font-semibold text-muted-c transition-colors hover:text-[var(--text)]"
      style={{ background: "color-mix(in srgb, var(--text) 6%, transparent)" }}
      onClick={() => {
        markRevised(chapter.id);
        toast.success(`“${chapter.name}” marked revised`);
      }}
      aria-label={`Mark ${chapter.name} revised`}
    >
      <RefreshCcw className="h-3 w-3" aria-hidden="true" />
      revise
    </button>
  );
}

/* ============================================================
 * TAB 1 — SYLLABUS
 * ============================================================ */

function ConfidenceBars({
  value,
  color,
  onChange,
}: {
  value: number;
  color: string;
  onChange: (v: number) => void;
}) {
  return (
    <span className="flex shrink-0 items-end gap-[3px]" role="group" aria-label={`Confidence ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          className="press flex h-4 w-3 items-end justify-center"
          onClick={() => onChange(i === value ? 0 : i)}
          aria-label={i === value ? `Clear confidence (currently ${value})` : `Set confidence to ${i}`}
        >
          <span
            className="block w-1 rounded-[2px]"
            style={{
              height: CONF_HEIGHTS[i - 1],
              background: i <= value ? color : "color-mix(in srgb, var(--text) 14%, transparent)",
            }}
            aria-hidden="true"
          />
        </button>
      ))}
    </span>
  );
}

function ChapterRow({ chapter, subject, pyq }: { chapter: Chapter; subject: Subject; pyq: PyqEntry[] }) {
  const updateChapter = useStudyStore((s) => s.updateChapter);
  const deleteChapter = useStudyStore((s) => s.deleteChapter);
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /* draft is initialized once — the parent remounts this row via a composite
     key whenever the chapter changes elsewhere (mark revised, edits…),
     which resets the inline editor without effects */
  const [draft, setDraft] = useState({
    name: chapter.name,
    status: chapter.status,
    weightage: chapter.weightage != null ? String(chapter.weightage) : "",
    totalQuestions: chapter.totalQuestions != null ? String(chapter.totalQuestions) : "",
  });

  const stats = chapterStats(chapter.id, pyq);

  const save = () => {
    const name = draft.name.trim();
    if (!name) {
      toast.error("Chapter name can’t be empty");
      return;
    }
    updateChapter(chapter.id, {
      name,
      status: draft.status,
      weightage: optInt(draft.weightage, 1, 5),
      totalQuestions: optInt(draft.totalQuestions, 0, 100000),
    });
    setExpanded(false);
    toast.success(`“${name}” updated`);
  };

  return (
    <li className="rounded-lg px-1.5 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)]">
      <div className="flex items-center gap-2">
        <StatusChip status={chapter.status} />
        <button
          type="button"
          className="press min-w-0 flex-1 truncate text-left text-sm font-medium"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Close" : "Open"} editor for ${chapter.name}`}
        >
          {chapter.name}
        </button>
        <ConfidenceBars
          value={chapter.confidence}
          color={subject.color}
          onChange={(v) => updateChapter(chapter.id, { confidence: v })}
        />
        <button
          type="button"
          className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-c transition-colors hover:text-[var(--text)]"
          onClick={() => setExpanded((e) => !e)}
          aria-label={`Edit ${chapter.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-c transition-colors hover:text-[var(--negative)]"
          onClick={() => setConfirmDelete(true)}
          aria-label={`Delete ${chapter.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-1">
        <span className="text-[10px] tabular-nums text-muted-c">
          {stats.attempted > 0 ? `${stats.attempted}q · ${stats.accuracy}% acc` : "no PYQs yet"}
        </span>
        <span className="text-[10px] tabular-nums text-muted-c">revised {daysAgoLabel(chapter.lastRevisedAt)}</span>
        <MarkRevisedButton chapter={chapter} />
        {chapter.weightage != null && (
          <span className="text-[10px] tabular-nums text-muted-c">weight {chapter.weightage}/5</span>
        )}
        {chapter.totalQuestions != null && chapter.totalQuestions > 0 && (
          <span className="text-[10px] tabular-nums text-muted-c">{chapter.totalQuestions} planned</span>
        )}
      </div>

      {expanded && (
        <div
          className="mt-2 grid grid-cols-2 gap-2 rounded-lg p-2.5 sm:grid-cols-4"
          style={{ background: "color-mix(in srgb, var(--text) 5%, transparent)" }}
        >
          <FieldInput
            label="Name"
            value={draft.name}
            onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
            placeholder="Chapter name"
            className="col-span-2"
          />
          <FieldSelect
            label="Status"
            value={draft.status}
            onChange={(v) => setDraft((d) => ({ ...d, status: v as ChapterStatus }))}
            options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label }))}
          />
          <FieldInput
            label="Weightage 1–5"
            value={draft.weightage}
            onChange={(v) => setDraft((d) => ({ ...d, weightage: v }))}
            placeholder="3"
            inputMode="numeric"
          />
          <FieldInput
            label="Planned questions"
            value={draft.totalQuestions}
            onChange={(v) => setDraft((d) => ({ ...d, totalQuestions: v }))}
            placeholder="40"
            inputMode="numeric"
          />
          <div className="col-span-2 flex items-center gap-2 sm:col-span-3">
            <PanelActionButton onClick={save} label="Save chapter">
              Save
            </PanelActionButton>
            <button
              type="button"
              className="press h-9 rounded-lg px-3.5 text-sm font-semibold transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]"
              onClick={() => setExpanded(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete chapter?"
        description={`“${chapter.name}” will be removed from ${subject.name}. PYQ entries stay in your history but lose their chapter link. This can’t be undone.`}
        onConfirm={() => {
          deleteChapter(chapter.id);
          setConfirmDelete(false);
          toast.success(`“${chapter.name}” deleted`);
        }}
      />
    </li>
  );
}

function SubjectSection({
  subject,
  chapters,
  pyq,
  onEdit,
  onDelete,
}: {
  subject: Subject;
  chapters: Chapter[];
  pyq: PyqEntry[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [newChapter, setNewChapter] = useState("");
  const addChapter = useStudyStore((s) => s.addChapter);

  const own = useMemo(
    () => chapters.filter((c) => c.subjectId === subject.id).sort((a, b) => a.order - b.order),
    [chapters, subject.id]
  );
  const stats = subjectStats(subject.id, chapters, pyq);
  const pct = stats.total > 0 ? (stats.mastered / stats.total) * 100 : 0;

  const submit = () => {
    const name = newChapter.trim();
    if (!name) {
      toast.error("Type a chapter name first");
      return;
    }
    addChapter(subject.id, name);
    setNewChapter("");
    toast.success(`“${name}” added to ${subject.name}`);
  };

  return (
    <div className="widget p-3 sm:p-4">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="press flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-1.5 text-left"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${subject.name} — ${stats.mastered} of ${stats.total} chapters mastered. ${open ? "Collapse" : "Expand"}`}
        >
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-muted-c transition-transform duration-200", !open && "-rotate-90")}
            aria-hidden="true"
          />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: subject.color }} aria-hidden="true" />
          <span className="shrink-0 truncate text-sm font-semibold">{subject.name}</span>
          <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-c">
            {stats.mastered}/{stats.total}
          </span>
          <span
            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"
            aria-hidden="true"
            style={{ background: "color-mix(in srgb, var(--text) 10%, transparent)" }}
          >
            <span
              className="block h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: subject.color }}
            />
          </span>
        </button>
        <IconButton onClick={onEdit} label={`Edit ${subject.name}`}>
          <Pencil className="h-4 w-4" />
        </IconButton>
        <IconButton onClick={onDelete} label={`Delete ${subject.name}`} danger>
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>

      {open && (
        <div className="mt-2 border-t hairline pt-2">
          {own.length === 0 ? (
            <p className="px-1 pb-1 pt-0.5 text-xs text-muted-c">
              No chapters yet — add the chapters you&rsquo;re studying.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {own.map((c) => (
                <ChapterRow
                  key={`${c.id}:${c.name}:${c.status}:${c.weightage ?? ""}:${c.totalQuestions ?? ""}`}
                  chapter={c}
                  subject={subject}
                  pyq={pyq}
                />
              ))}
            </ul>
          )}
          <div className="mt-2 flex items-center gap-1.5">
            <input
              value={newChapter}
              onChange={(e) => setNewChapter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="Add a chapter…"
              aria-label={`New chapter in ${subject.name}`}
              className={inputCls}
            />
            <PanelActionButton onClick={submit} disabled={!newChapter.trim()} label={`Add chapter to ${subject.name}`}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add</span>
            </PanelActionButton>
          </div>
        </div>
      )}
    </div>
  );
}

function SyllabusTab() {
  const subjects = useStudyStore((s) => s.subjects);
  const chapters = useStudyStore((s) => s.chapters);
  const pyq = useStudyStore((s) => s.pyq);
  const addSubject = useStudyStore((s) => s.addSubject);
  const updateSubject = useStudyStore((s) => s.updateSubject);
  const deleteSubject = useStudyStore((s) => s.deleteSubject);
  const markRevised = useStudyStore((s) => s.markRevised);

  const activeSubjects = useMemo(() => subjects.filter((s) => !s.archived), [subjects]);

  const total = chapters.length;
  const mastered = chapters.filter((c) => c.status === "mastered").length;
  const learning = chapters.filter((c) => c.status === "learning").length;
  const overall = total > 0 ? Math.round((mastered / total) * 100) : 0;

  const queue = useMemo(() => revisionQueue(chapters, 14), [chapters]);
  const weak = useMemo(() => weakTopics(chapters, pyq), [chapters, pyq]);

  /* add subject */
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(SUBJECT_COLORS[0]);

  /* edit subject dialog */
  const [editing, setEditing] = useState<Subject | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(SUBJECT_COLORS[0]);

  /* delete subject confirm */
  const [deleting, setDeleting] = useState<Subject | null>(null);

  const openEdit = (s: Subject) => {
    setEditing(s);
    setEditName(s.name);
    setEditColor(s.color);
  };

  const submitSubject = () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Give the subject a name");
      return;
    }
    addSubject(name, newColor);
    setNewName("");
    toast.success(`“${name}” added — now add its chapters`);
  };

  const saveSubject = () => {
    if (!editing) return;
    const name = editName.trim();
    if (!name) {
      toast.error("Subject name can’t be empty");
      return;
    }
    updateSubject(editing.id, { name, color: editColor });
    toast.success(`“${name}” updated`);
    setEditing(null);
  };

  return (
    <div>
      {/* overview strip */}
      <div className="widget mb-4 flex items-center gap-4 p-4">
        <ProgressRing
          value={mastered}
          max={total}
          size={72}
          thickness={7}
          label={`${overall}%`}
          sublabel="mastered"
        />
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
          <Stat label="Chapters" value={String(total)} />
          <Stat label="Mastered" value={String(mastered)} />
          <Stat label="Learning" value={String(learning)} />
        </div>
      </div>

      {/* per-subject sections */}
      <PanelSection>Subjects</PanelSection>
      <div className="space-y-3">
        {activeSubjects.map((subject) => (
          <SubjectSection
            key={subject.id}
            subject={subject}
            chapters={chapters}
            pyq={pyq}
            onEdit={() => openEdit(subject)}
            onDelete={() => setDeleting(subject)}
          />
        ))}
        {activeSubjects.length === 0 && (
          <div className="widget p-4">
            <PanelEmptyState
              icon={<GraduationCap className="h-5 w-5 text-muted-c" />}
              title="No subjects yet"
              hint="Add your first subject below — chapters, revision and PYQ accuracy all flow from your syllabus."
            />
          </div>
        )}
      </div>

      {/* add subject */}
      <div className="widget mt-4 p-4">
        <PanelSection>Add subject</PanelSection>
        <div className="flex items-center gap-1.5">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitSubject();
            }}
            placeholder="Subject name (e.g. Biology)"
            aria-label="New subject name"
            className={inputCls}
          />
          <PanelActionButton onClick={submitSubject} disabled={!newName.trim()} label="Add subject">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add</span>
          </PanelActionButton>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {SUBJECT_COLORS.map((c) => (
            <ColorSwatch
              key={c}
              color={c}
              selected={newColor === c}
              onClick={() => setNewColor(c)}
              label={`Subject color ${c}`}
            />
          ))}
        </div>
      </div>

      {/* revision queue */}
      <div className="mt-6">
        <PanelSection>
          <span className="flex items-center gap-1.5">
            <RefreshCcw className="h-3 w-3" aria-hidden="true" /> Revision queue · 14 days
          </span>
        </PanelSection>
        <div className="widget p-4">
          {queue.length > 0 ? (
            <ul className="space-y-1">
              {queue.map((c) => {
                const subject = subjects.find((s) => s.id === c.subjectId);
                return (
                  <li
                    key={c.id}
                    className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)]"
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: subject?.color }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{c.name}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-c">
                      {subject ? `${subject.name} · ` : ""}
                      {c.lastRevisedAt ? daysAgoLabel(c.lastRevisedAt) : "never revised"}
                    </span>
                    <MarkRevisedButton chapter={c} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-muted-c">
              {total === 0
                ? "Add chapters to build the revision queue."
                : "Nothing due — everything was revised recently. 🎯"}
            </p>
          )}
        </div>
      </div>

      {/* weak topics */}
      <div className="mb-2 mt-6">
        <PanelSection>
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Weak topics
          </span>
        </PanelSection>
        <div className="widget p-4">
          {weak.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {weak.map((c) => {
                const subject = subjects.find((s) => s.id === c.subjectId);
                const stats = chapterStats(c.id, pyq);
                return (
                  <span
                    key={c.id}
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
                    style={{ background: "color-mix(in srgb, var(--text) 6%, transparent)" }}
                    title={`${subject?.name ?? ""} · confidence ${c.confidence}/5 · ${stats.attempted} questions attempted`}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: subject?.color }}
                      aria-hidden="true"
                    />
                    <span className="max-w-[140px] truncate font-medium">{c.name}</span>
                    <span className="shrink-0 text-[10px] tabular-nums" style={{ color: "var(--negative)" }}>
                      {stats.attempted > 0 ? `${stats.accuracy}% acc` : `${c.confidence}/5 conf`}
                    </span>
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-c">
              {total === 0 ? "No chapters yet." : "No weak topics detected — confidence is healthy."}
            </p>
          )}
        </div>
      </div>

      {/* edit subject dialog */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit subject</DialogTitle>
            <DialogDescription>Rename it or pick a new color — chapters and logs stay attached.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <FieldInput label="Name" value={editName} onChange={setEditName} placeholder="Subject name" />
            <div>
              <FieldLabel>Color</FieldLabel>
              <div className="flex flex-wrap items-center gap-1.5">
                {SUBJECT_COLORS.map((c) => (
                  <ColorSwatch
                    key={c}
                    color={c}
                    selected={editColor === c}
                    onClick={() => setEditColor(c)}
                    label={`Subject color ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              className="press h-9 rounded-lg px-3.5 text-sm font-semibold transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
            <PanelActionButton onClick={saveSubject} disabled={!editName.trim()} label="Save subject">
              Save
            </PanelActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete subject confirm */}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete subject?"
        description={`“${deleting?.name ?? ""}” deletes its chapters and logs — every chapter, PYQ entry and study log for this subject is removed permanently. This can’t be undone.`}
        onConfirm={() => {
          if (!deleting) return;
          deleteSubject(deleting.id);
          toast.success(`“${deleting.name}” deleted`);
          setDeleting(null);
        }}
      />
    </div>
  );
}

/* ============================================================
 * TAB 2 — PYQ PRACTICE
 * ============================================================ */

function PyqTab() {
  const subjects = useStudyStore((s) => s.subjects);
  const chapters = useStudyStore((s) => s.chapters);
  const pyq = useStudyStore((s) => s.pyq);
  const addPyq = useStudyStore((s) => s.addPyq);
  const updatePyq = useStudyStore((s) => s.updatePyq);
  const deletePyq = useStudyStore((s) => s.deletePyq);

  const activeSubjects = useMemo(() => subjects.filter((s) => !s.archived), [subjects]);

  /* form state */
  const [date, setDate] = useState(todayKey());
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [exam, setExam] = useState("");
  const [year, setYear] = useState("");
  const [difficulty, setDifficulty] = useState<PyqDifficulty>("medium");
  const [attempted, setAttempted] = useState("");
  const [correct, setCorrect] = useState("");
  const [skipped, setSkipped] = useState("");
  const [timeMinutes, setTimeMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [filter, setFilter] = useState("");

  const subjectChapters = useMemo(
    () => chapters.filter((c) => c.subjectId === subjectId).sort((a, b) => a.order - b.order),
    [chapters, subjectId]
  );

  /* real sums from the pyq entries */
  const stats = useMemo(() => {
    const today = todayKey();
    const from = daysAgoKey(6);
    const todayRows = pyq.filter((p) => p.date === today);
    const weekRows = pyq.filter((p) => p.date >= from);
    const allAtt = pyq.reduce((m, p) => m + p.attempted, 0);
    const allCor = pyq.reduce((m, p) => m + p.correct, 0);
    return {
      todayAtt: todayRows.reduce((m, p) => m + p.attempted, 0),
      todayCor: todayRows.reduce((m, p) => m + p.correct, 0),
      weekAtt: weekRows.reduce((m, p) => m + p.attempted, 0),
      allAtt,
      allCor,
      acc: allAtt > 0 ? Math.round((allCor / allAtt) * 100) : 0,
    };
  }, [pyq]);

  const history = useMemo(() => {
    const rows = filter ? pyq.filter((p) => p.subjectId === filter) : pyq;
    return [...rows].sort((a, b) => b.date.localeCompare(a.date));
  }, [pyq, filter]);

  const chapterAcc = useMemo(
    () =>
      chapters
        .map((c) => ({ c, stats: chapterStats(c.id, pyq) }))
        .filter(({ stats }) => stats.attempted > 0)
        .sort((a, b) => b.stats.attempted - a.stats.attempted)
        .slice(0, 8),
    [chapters, pyq]
  );

  const diffRows = useMemo(
    () =>
      (["easy", "medium", "hard"] as const).map((d) => {
        const rows = pyq.filter((p) => p.difficulty === d);
        const att = rows.reduce((m, p) => m + p.attempted, 0);
        const cor = rows.reduce((m, p) => m + p.correct, 0);
        return { d, att, cor, acc: att > 0 ? Math.round((cor / att) * 100) : 0 };
      }),
    [pyq]
  );

  const submit = () => {
    if (!subjectId) {
      toast.error("Pick a subject first");
      return;
    }
    const att = Math.max(0, parseInt0(attempted));
    if (att < 1) {
      toast.error("Enter at least 1 attempted question");
      return;
    }
    const cor = Math.max(0, parseInt0(correct));
    if (cor > att) {
      toast.error("Correct can’t be higher than attempted");
      return;
    }
    addPyq({
      date: date || todayKey(),
      subjectId,
      chapterId: chapterId || undefined,
      exam: exam.trim() || undefined,
      year: year.trim() || undefined,
      difficulty,
      attempted: att,
      correct: cor,
      skipped: Math.max(0, parseInt0(skipped)),
      timeMinutes: parseOptNum(timeMinutes),
      notes: notes.trim() || undefined,
      revision: "none",
    });
    toast.success(`Logged ${att} questions · ${Math.round((cor / att) * 100)}% accuracy`);
    setAttempted("");
    setCorrect("");
    setSkipped("");
    setTimeMinutes("");
    setNotes("");
    setExam("");
  };

  return (
    <div>
      {/* stats strip */}
      <div className="widget mb-4 p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Today" value={String(stats.todayAtt)} sub={`${stats.todayCor} correct`} />
          <Stat label="This week" value={String(stats.weekAtt)} sub="questions" />
          <Stat label="All-time" value={String(stats.allAtt)} sub={`${stats.allCor} correct`} />
          <Stat
            label="Accuracy"
            value={stats.allAtt > 0 ? `${stats.acc}%` : "—"}
            sub="all-time"
            tone={stats.allAtt > 0 ? accuracyTone(stats.acc) : undefined}
          />
        </div>
      </div>

      {/* log practice form */}
      {activeSubjects.length === 0 ? (
        <div className="widget mb-4 p-4">
          <PanelEmptyState
            icon={<FileQuestion className="h-5 w-5 text-muted-c" />}
            title="No subjects to log against"
            hint="Create a subject in the Syllabus tab first — PYQ accuracy builds per chapter automatically."
          />
        </div>
      ) : (
        <div className="widget mb-4 p-4">
          <PanelSection>Log practice</PanelSection>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <FieldInput label="Date" value={date} onChange={setDate} type="date" />
            <FieldSelect
              label="Subject"
              value={subjectId}
              onChange={(v) => {
                setSubjectId(v);
                setChapterId("");
              }}
              options={[
                { value: "", label: "Subject…" },
                ...activeSubjects.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
            <FieldSelect
              label="Chapter"
              value={chapterId}
              onChange={setChapterId}
              disabled={!subjectId}
              options={[
                { value: "", label: subjectId ? "Chapter…" : "Pick a subject" },
                ...subjectChapters.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <FieldInput label="Exam" value={exam} onChange={setExam} placeholder="JEE Main 2023" />
            <FieldInput label="Year" value={year} onChange={setYear} placeholder="2023" />
            <div className="col-span-2">
              <FieldLabel>Difficulty</FieldLabel>
              <div
                className="flex w-fit items-center gap-0.5 rounded-lg p-0.5"
                style={{ background: "color-mix(in srgb, var(--text) 6%, transparent)" }}
                role="group"
                aria-label="Difficulty"
              >
                {(["easy", "medium", "hard"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={cn(
                      "press rounded-md px-2.5 py-1.5 text-xs font-semibold capitalize transition-colors",
                      difficulty === d ? "text-[var(--accent-fg)]" : "text-muted-c hover:text-[var(--text)]"
                    )}
                    style={difficulty === d ? { background: "var(--accent)" } : undefined}
                    onClick={() => setDifficulty(d)}
                    aria-pressed={difficulty === d}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <FieldInput
              label="Attempted"
              value={attempted}
              onChange={setAttempted}
              placeholder="25"
              inputMode="numeric"
            />
            <FieldInput
              label="Correct"
              value={correct}
              onChange={setCorrect}
              placeholder="18"
              inputMode="numeric"
            />
            <FieldInput
              label="Skipped"
              value={skipped}
              onChange={setSkipped}
              placeholder="0"
              inputMode="numeric"
            />
            <FieldInput
              label="Time (min)"
              value={timeMinutes}
              onChange={setTimeMinutes}
              placeholder="30"
              inputMode="numeric"
            />
            <FieldTextarea
              label="Notes"
              value={notes}
              onChange={setNotes}
              placeholder="Silly mistakes in rotation…"
              className="col-span-2 sm:col-span-4"
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <PanelActionButton onClick={submit} label="Save practice log">
              <Plus className="h-4 w-4" />
              Save practice
            </PanelActionButton>
            <p className="text-[10px] text-muted-c">Correct can’t exceed attempted — accuracy is computed for you.</p>
          </div>
        </div>
      )}

      {/* accuracy by chapter */}
      {chapterAcc.length > 0 && (
        <div className="mb-4">
          <PanelSection>Accuracy by chapter</PanelSection>
          <div className="widget p-4">
            <HBarChart
              data={chapterAcc.map(({ c, stats }) => {
                const subject = subjects.find((s) => s.id === c.subjectId);
                return {
                  label: c.name,
                  value: stats.accuracy,
                  color: subject?.color,
                  hint: `${stats.attempted} questions · ${stats.correct} correct`,
                };
              })}
              formatValue={(v) => `${v}%`}
            />
          </div>
        </div>
      )}

      {/* accuracy by difficulty */}
      {stats.allAtt > 0 && (
        <div className="mb-4">
          <PanelSection>Accuracy by difficulty</PanelSection>
          <div className="widget grid grid-cols-3 gap-2 p-4">
            {diffRows.map(({ d, att, acc }) => (
              <div
                key={d}
                className="rounded-xl px-3 py-2.5"
                style={{ background: "color-mix(in srgb, var(--text) 5%, transparent)" }}
              >
                <div className="text-[10px] font-medium capitalize text-muted-c">{d}</div>
                <div
                  className="text-lg font-semibold leading-tight tabular-nums"
                  style={{ color: att > 0 ? accuracyTone(acc) : "var(--text-muted)" }}
                >
                  {att > 0 ? `${acc}%` : "—"}
                </div>
                <div className="text-[10px] tabular-nums text-muted-c">{att} attempted</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* history */}
      <PanelSection>
        <span className="flex items-center gap-1.5">
          <FileQuestion className="h-3 w-3" aria-hidden="true" /> Practice history
        </span>
      </PanelSection>
      <div className="widget p-4">
        <div className="fd-scroll -mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by subject">
          <button
            type="button"
            className={cn(
              "press flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors",
              filter === "" ? "text-[var(--accent-fg)]" : "text-muted-c hover:text-[var(--text)]"
            )}
            style={filter === "" ? { background: "var(--accent)" } : { background: "color-mix(in srgb, var(--text) 6%, transparent)" }}
            onClick={() => setFilter("")}
            aria-pressed={filter === ""}
          >
            All
          </button>
          {activeSubjects.map((s) => (
            <button
              key={s.id}
              type="button"
              className={cn(
                "press flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors",
                filter === s.id ? "text-[var(--accent-fg)]" : "text-muted-c hover:text-[var(--text)]"
              )}
              style={
                filter === s.id
                  ? { background: "var(--accent)" }
                  : { background: "color-mix(in srgb, var(--text) 6%, transparent)" }
              }
              onClick={() => setFilter(s.id)}
              aria-pressed={filter === s.id}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} aria-hidden="true" />
              {s.name}
            </button>
          ))}
        </div>

        {history.length === 0 ? (
          <p className="py-2 text-xs text-muted-c">
            {pyq.length === 0
              ? "No practice logged yet — your PYQ entries appear here with accuracy per chapter."
              : "No entries for this subject."}
          </p>
        ) : (
          <ul className="fd-scroll max-h-80 space-y-0.5">
            {history.map((p) => {
              const subject = subjects.find((s) => s.id === p.subjectId);
              const chapter = p.chapterId ? chapters.find((c) => c.id === p.chapterId) : undefined;
              const acc = p.attempted > 0 ? Math.round((p.correct / p.attempted) * 100) : 0;
              const rm = REVISION_META[p.revision];
              return (
                <li
                  key={p.id}
                  className="flex items-start gap-2 rounded-lg px-1.5 py-2 transition-colors hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)]"
                >
                  <span className="w-11 shrink-0 pt-0.5 text-[10px] font-medium tabular-nums text-muted-c">
                    {format(parseISO(p.date + "T12:00"), "d MMM")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: subject?.color }}
                        aria-hidden="true"
                      />
                      <span className="truncate text-xs font-semibold">
                        {chapter?.name ?? subject?.name ?? "General"}
                      </span>
                      <DifficultyChip difficulty={p.difficulty} />
                      {(p.exam || p.year) && (
                        <span className="truncate text-[10px] text-muted-c">
                          {[p.exam, p.year].filter(Boolean).join(" ")}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] tabular-nums text-muted-c">
                      <span>
                        {p.attempted} att · {p.correct} cor
                        {p.skipped ? ` · ${p.skipped} skip` : ""}
                        {p.timeMinutes ? ` · ${fmtMinutes(p.timeMinutes)}` : ""}
                      </span>
                      <span className="font-semibold" style={{ color: accuracyTone(acc) }}>
                        {p.attempted > 0 ? `${acc}%` : "—"}
                      </span>
                      {p.notes && <span className="truncate">· {p.notes}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 pt-0.5">
                    <button
                      type="button"
                      className="press flex h-6 items-center rounded-full px-2 text-[10px] font-semibold transition-colors"
                      style={{ color: rm.color, background: rm.bg }}
                      onClick={() => updatePyq(p.id, { revision: nextRevision(p.revision) })}
                      aria-label={`Revision status: ${p.revision === "none" ? "not flagged" : p.revision} — click to cycle`}
                      title={`Revision: ${p.revision} (click to cycle)`}
                    >
                      {rm.label}
                    </button>
                    <button
                      type="button"
                      className="press flex h-7 w-7 items-center justify-center rounded-lg text-muted-c transition-colors hover:text-[var(--negative)]"
                      onClick={() => {
                        deletePyq(p.id);
                        toast.success("Practice entry deleted");
                      }}
                      aria-label="Delete practice entry"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * TAB 3 — MOCK TESTS
 * ============================================================ */

function MocksTab() {
  const mocks = useStudyStore((s) => s.mocks);
  const addMock = useStudyStore((s) => s.addMock);
  const deleteMock = useStudyStore((s) => s.deleteMock);

  /* form state */
  const [date, setDate] = useState(todayKey());
  const [examName, setExamName] = useState("");
  const [durationMin, setDurationMin] = useState("");
  const [physics, setPhysics] = useState("");
  const [chemistry, setChemistry] = useState("");
  const [maths, setMaths] = useState("");
  const [total, setTotal] = useState("");
  const [maxTotal, setMaxTotal] = useState("");
  const [attempted, setAttempted] = useState("");
  const [correct, setCorrect] = useState("");
  const [incorrect, setIncorrect] = useState("");
  const [percentile, setPercentile] = useState("");
  const [weakChapters, setWeakChapters] = useState("");
  const [notes, setNotes] = useState("");

  /* auto-fill the total from P+C+M while all three marks are present
     (the field stays editable — manual edits win until a mark changes) */
  const markChange = (set: (v: string) => void, value: string, others: string[]) => {
    set(value);
    const vals = [value, ...others];
    if (vals.every((x) => x.trim())) {
      const sum = vals.reduce((m, x) => m + (parseFloat(x) || 0), 0);
      setTotal(Number.isInteger(sum) ? String(sum) : sum.toFixed(1));
    }
  };

  const sorted = useMemo(() => [...mocks].sort((a, b) => a.date.localeCompare(b.date)), [mocks]);
  const recent = useMemo(() => [...sorted].reverse(), [sorted]);
  const withTotal = useMemo(() => sorted.filter((m) => m.total != null), [sorted]);
  const best = withTotal.reduce((m, x) => Math.max(m, x.total ?? 0), 0);
  const latest = sorted[sorted.length - 1];

  const submit = () => {
    const name = examName.trim();
    if (!name) {
      toast.error("Give the mock a name (e.g. “JEE Main 2025 CBT”)");
      return;
    }
    const att = Math.max(0, parseInt0(attempted));
    const cor = Math.max(0, parseInt0(correct));
    if (cor > att) {
      toast.error("Correct can’t be higher than attempted");
      return;
    }
    addMock({
      date: date || todayKey(),
      examName: name,
      durationMin: Math.max(0, parseInt0(durationMin)),
      physics: parseOptNum(physics),
      chemistry: parseOptNum(chemistry),
      maths: parseOptNum(maths),
      total: parseOptNum(total),
      maxTotal: parseOptNum(maxTotal),
      attempted: att,
      correct: cor,
      incorrect: Math.max(0, parseInt0(incorrect)),
      percentile: parseOptNum(percentile),
      weakChapters: weakChapters
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      notes: notes.trim() || undefined,
    });
    toast.success(
      `“${name}” logged${parseOptNum(total) != null ? ` · ${total} pts` : ""}`
    );
    setExamName("");
    setPhysics("");
    setChemistry("");
    setMaths("");
    setTotal("");
    setMaxTotal("");
    setAttempted("");
    setCorrect("");
    setIncorrect("");
    setPercentile("");
    setWeakChapters("");
    setNotes("");
  };

  const subjectMarks = (m: MockTest): string => {
    const parts: string[] = [];
    if (m.physics != null) parts.push(`P ${m.physics}`);
    if (m.chemistry != null) parts.push(`C ${m.chemistry}`);
    if (m.maths != null) parts.push(`M ${m.maths}`);
    return parts.join(" · ");
  };

  return (
    <div>
      {/* log mock form */}
      <div className="widget mb-4 p-4">
        <PanelSection>Log mock test</PanelSection>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <FieldInput label="Date" value={date} onChange={setDate} type="date" />
          <FieldInput
            label="Exam name"
            value={examName}
            onChange={setExamName}
            placeholder="JEE Main 2025 CBT"
            className="col-span-2"
          />
          <FieldInput
            label="Duration (min)"
            value={durationMin}
            onChange={setDurationMin}
            placeholder="180"
            inputMode="numeric"
          />
          <FieldInput
            label="Physics"
            value={physics}
            onChange={(v) => markChange(setPhysics, v, [chemistry, maths])}
            placeholder="90"
            inputMode="decimal"
          />
          <FieldInput
            label="Chemistry"
            value={chemistry}
            onChange={(v) => markChange(setChemistry, v, [physics, maths])}
            placeholder="85"
            inputMode="decimal"
          />
          <FieldInput
            label="Maths"
            value={maths}
            onChange={(v) => markChange(setMaths, v, [physics, chemistry])}
            placeholder="78"
            inputMode="decimal"
          />
          <FieldInput
            label="Total (auto P+C+M)"
            value={total}
            onChange={setTotal}
            placeholder="253"
            inputMode="decimal"
          />
          <FieldInput
            label="Max total"
            value={maxTotal}
            onChange={setMaxTotal}
            placeholder="300"
            inputMode="decimal"
          />
          <FieldInput
            label="Attempted"
            value={attempted}
            onChange={setAttempted}
            placeholder="60"
            inputMode="numeric"
          />
          <FieldInput
            label="Correct"
            value={correct}
            onChange={setCorrect}
            placeholder="48"
            inputMode="numeric"
          />
          <FieldInput
            label="Incorrect"
            value={incorrect}
            onChange={setIncorrect}
            placeholder="12"
            inputMode="numeric"
          />
          <FieldInput
            label="Percentile"
            value={percentile}
            onChange={setPercentile}
            placeholder="98.7"
            inputMode="decimal"
          />
          <FieldInput
            label="Weak chapters"
            value={weakChapters}
            onChange={setWeakChapters}
            placeholder="Rotation, Thermodynamics, P&C"
            className="col-span-2 sm:col-span-3"
          />
          <FieldTextarea
            label="Notes"
            value={notes}
            onChange={setNotes}
            placeholder="Ran out of time in section 2…"
            className="col-span-2 sm:col-span-4"
          />
        </div>
        <div className="mt-3">
          <PanelActionButton onClick={submit} label="Save mock test">
            <Plus className="h-4 w-4" />
            Save mock
          </PanelActionButton>
        </div>
      </div>

      {mocks.length === 0 ? (
        <div className="widget p-4">
          <PanelEmptyState
            icon={<ClipboardList className="h-5 w-5 text-muted-c" />}
            title="No mock tests logged"
            hint="Log full-length mocks with subject-wise marks — score trends, best/latest chips and accuracy appear here."
          />
        </div>
      ) : (
        <>
          {/* trend + summary chips */}
          {sorted.length >= 2 && (
            <div className="mb-4">
              <PanelSection>
                <span className="flex items-center gap-1.5">
                  <ClipboardList className="h-3 w-3" aria-hidden="true" /> Score trend
                </span>
              </PanelSection>
              <div className="widget p-4">
                <LineChart
                  height={100}
                  formatValue={(v) => `${Math.round(v)} pts`}
                  data={sorted.map((m) => ({
                    label: format(parseISO(m.date + "T12:00"), "d MMM"),
                    value: m.total ?? 0,
                  }))}
                />
              </div>
            </div>
          )}

          {withTotal.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              <span
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums"
                style={{ color: "var(--positive)", background: "color-mix(in srgb, var(--positive) 12%, transparent)" }}
              >
                Best {best}
                {latest?.maxTotal != null ? `/${latest.maxTotal}` : ""}
              </span>
              {latest && latest.total != null && (
                <span
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums"
                  style={{ color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}
                >
                  Latest {latest.total}
                  {latest.maxTotal != null ? `/${latest.maxTotal}` : ""}
                </span>
              )}
            </div>
          )}

          {/* history */}
          <PanelSection>Mock history</PanelSection>
          <div className="space-y-3">
            {recent.map((m) => (
              <div key={m.id} className="widget p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{m.examName}</p>
                    <p className="text-[10px] tabular-nums text-muted-c">
                      {format(parseISO(m.date + "T12:00"), "d MMM yyyy")}
                      {m.durationMin > 0 ? ` · ${fmtMinutes(m.durationMin)}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-c transition-colors hover:text-[var(--negative)]"
                    onClick={() => {
                      deleteMock(m.id);
                      toast.success(`“${m.examName}” deleted`);
                    }}
                    aria-label={`Delete ${m.examName}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-2.5 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-2xl font-bold leading-none tabular-nums text-accent">
                      {m.total ?? "—"}
                    </span>
                    {m.maxTotal != null && (
                      <span className="text-sm font-semibold tabular-nums text-muted-c">/{m.maxTotal}</span>
                    )}
                    <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-c">total score</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {subjectMarks(m) && (
                      <p className="text-xs font-medium tabular-nums">{subjectMarks(m)}</p>
                    )}
                    <p className="mt-0.5 text-[10px] tabular-nums text-muted-c">
                      {m.attempted > 0
                        ? `${Math.round((m.correct / m.attempted) * 100)}% accuracy · ${m.correct}/${m.attempted}`
                        : "no accuracy data"}
                    </p>
                    {m.percentile != null && (
                      <span
                        className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
                        style={{
                          color: "var(--accent)",
                          background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                        }}
                      >
                        {m.percentile}%ile
                      </span>
                    )}
                  </div>
                </div>

                {m.weakChapters && m.weakChapters.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {m.weakChapters.map((w, i) => (
                      <span
                        key={`${m.id}-${i}`}
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          color: "var(--warning)",
                          background: "color-mix(in srgb, var(--warning) 12%, transparent)",
                        }}
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                )}

                {m.notes && <p className="mt-2 text-xs leading-relaxed text-muted-c">{m.notes}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
 * TAB 4 — STUDY LOG
 * ============================================================ */

function LogTab() {
  const subjects = useStudyStore((s) => s.subjects);
  const chapters = useStudyStore((s) => s.chapters);
  const studyLogs = useStudyStore((s) => s.studyLogs);
  const addStudyLog = useStudyStore((s) => s.addStudyLog);
  const deleteStudyLog = useStudyStore((s) => s.deleteStudyLog);
  const sessions = useSessionStore((s) => s.sessions);
  const studyGoalMin = useSettingsStore((s) => s.studyGoalMin);
  const updateSettings = useSettingsStore((s) => s.update);

  const activeSubjects = useMemo(() => subjects.filter((s) => !s.archived), [subjects]);

  const [date, setDate] = useState(todayKey());
  const [minutes, setMinutes] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [note, setNote] = useState("");

  const subjectChapters = useMemo(
    () => chapters.filter((c) => c.subjectId === subjectId).sort((a, b) => a.order - b.order),
    [chapters, subjectId]
  );

  const recent = useMemo(
    () => [...studyLogs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40),
    [studyLogs]
  );

  /* weekly subject distribution, computed honestly:
     subject-tagged focus sessions + study logs over the last 7 days */
  const weekBySubject = useMemo(() => {
    const cutoffMs = Date.now() - 7 * 86400_000;
    const cutoffKey = daysAgoKey(6);
    const map = new Map<string, number>();
    for (const s of sessions) {
      if (s.subjectId && s.startedAt > cutoffMs) {
        map.set(s.subjectId, (map.get(s.subjectId) ?? 0) + s.durationMs / 60000);
      }
    }
    for (const l of studyLogs) {
      if (l.subjectId && l.date >= cutoffKey) {
        map.set(l.subjectId, (map.get(l.subjectId) ?? 0) + l.minutes);
      }
    }
    return map;
  }, [sessions, studyLogs]);

  const distData = useMemo(
    () =>
      activeSubjects
        .map((s) => ({
          label: s.name,
          value: Math.round((weekBySubject.get(s.id) ?? 0) * 10) / 10,
          color: s.color,
          hint: "last 7 days",
        }))
        .filter((d) => d.value > 0)
        .sort((a, b) => b.value - a.value),
    [activeSubjects, weekBySubject]
  );

  const submit = () => {
    const m = Math.max(0, parseInt0(minutes));
    if (m < 1) {
      toast.error("Enter the minutes studied");
      return;
    }
    addStudyLog({
      date: date || todayKey(),
      minutes: m,
      subjectId: subjectId || undefined,
      chapterId: chapterId || undefined,
      source: "manual",
      note: note.trim() || undefined,
    });
    toast.success(`Logged ${fmtMinutes(m)} of study`);
    setMinutes("");
    setNote("");
  };

  const hasWeekData = distData.length > 0;

  /* monthly calendar: per-day study minutes (logs + subject-tagged sessions) */
  const [calOffset, setCalOffset] = useState(0);
  const minutesByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of studyLogs) m.set(l.date, (m.get(l.date) ?? 0) + l.minutes);
    for (const s of sessions) {
      if (s.subjectId) {
        const k = dateKey(s.startedAt);
        m.set(k, (m.get(k) ?? 0) + s.durationMs / 60000);
      }
    }
    return m;
  }, [studyLogs, sessions]);

  const calMonth = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + calOffset);
    return d;
  }, [calOffset]);

  const calCells = useMemo(() => {
    const y = calMonth.getFullYear();
    const mo = calMonth.getMonth();
    const first = new Date(y, mo, 1);
    const last = new Date(y, mo + 1, 0);
    const weekStart = useSettingsStore.getState().weekStart;
    const leading = (first.getDay() - weekStart + 7) % 7;
    const cells: { key: string; day: number; inMonth: boolean }[] = [];
    for (let i = 0; i < leading; i++) cells.push({ key: `pad-${i}`, day: 0, inMonth: false });
    for (let d = 1; d <= last.getDate(); d++) {
      cells.push({ key: dateKey(new Date(y, mo, d)), day: d, inMonth: true });
    }
    while (cells.length % 7 !== 0) cells.push({ key: `tail-${cells.length}`, day: 0, inMonth: false });
    return cells;
  }, [calMonth]);

  const monthMinutes = useMemo(() => {
    const prefix = format(calMonth, "yyyy-MM");
    let total = 0;
    let days = 0;
    for (const [k, v] of minutesByDate) {
      if (k.startsWith(prefix)) {
        total += v;
        if (v > 0) days++;
      }
    }
    return { total, days };
  }, [minutesByDate, calMonth]);

  const todayK = todayKey();
  const weekStart = useSettingsStore((s) => s.weekStart);
  const CAL_DAYS = weekStart === 1 ? ["M", "T", "W", "T", "F", "S", "S"] : ["S", "M", "T", "W", "T", "F", "S"];
  const maxDayMin = useMemo(
    () => Math.max(60, ...calCells.filter((c) => c.inMonth).map((c) => minutesByDate.get(c.key) ?? 0)),
    [calCells, minutesByDate]
  );

  /* daily study goal: manual logs + subject-tagged sessions today (real data only) */
  const todayStudyMin = useMemo(
    () => studyMinutesToday(sessions, studyLogs),
    [sessions, studyLogs]
  );
  const adjustGoal = (delta: number) => {
    const next = Math.min(780, Math.max(0, studyGoalMin + delta));
    updateSettings({ studyGoalMin: next });
  };

  return (
    <div>
      {/* daily study goal strip */}
      {studyGoalMin > 0 && (
        <div className="widget mb-4 flex items-center gap-4 p-4">
          <GoalRing minutes={todayStudyMin} goalMin={studyGoalMin} size={64} stroke={6} label="Daily study goal" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Today's study goal</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-c">
              {todayStudyMin >= studyGoalMin
                ? `Goal met — ${fmtMinutes(todayStudyMin)} logged today. Every extra minute compounds.`
                : `${fmtMinutes(studyGoalMin - todayStudyMin)} to go. Manual logs and subject-tagged focus sessions both count.`}
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => adjustGoal(-30)}
                disabled={studyGoalMin <= 30}
                aria-label="Decrease daily study goal by 30 minutes"
                className="press flex h-7 w-7 items-center justify-center rounded-lg text-muted-c transition-colors hover:text-[var(--text)] disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-14 text-center text-xs font-semibold tabular-nums">{fmtMinutes(studyGoalMin)}</span>
              <button
                type="button"
                onClick={() => adjustGoal(30)}
                disabled={studyGoalMin >= 780}
                aria-label="Increase daily study goal by 30 minutes"
                className="press flex h-7 w-7 items-center justify-center rounded-lg text-muted-c transition-colors hover:text-[var(--text)] disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* add manual study time */}
      <div className="widget mb-4 p-4">
        <PanelSection>Add manual study time</PanelSection>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <FieldInput label="Date" value={date} onChange={setDate} type="date" />
          <FieldInput
            label="Minutes"
            value={minutes}
            onChange={setMinutes}
            placeholder="45"
            inputMode="numeric"
          />
          <FieldSelect
            label="Subject"
            value={subjectId}
            onChange={(v) => {
              setSubjectId(v);
              setChapterId("");
            }}
            options={[
              { value: "", label: "Untagged" },
              ...activeSubjects.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <FieldSelect
            label="Chapter"
            value={chapterId}
            onChange={setChapterId}
            disabled={!subjectId}
            options={[
              { value: "", label: subjectId ? "None" : "Pick a subject" },
              ...subjectChapters.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <FieldInput
            label="Note"
            value={note}
            onChange={setNote}
            placeholder="Formula revision…"
            className="col-span-2 sm:col-span-4"
          />
        </div>
        <div className="mt-3">
          <PanelActionButton onClick={submit} label="Add study log">
            <Plus className="h-4 w-4" />
            Add study time
          </PanelActionButton>
        </div>
      </div>

      {/* monthly study calendar */}
      <PanelSection
        action={
          <span className="text-[10px] tabular-nums text-muted-c">
            {fmtMinutes(monthMinutes.total)} · {monthMinutes.days} active days
          </span>
        }
      >
        Study calendar
      </PanelSection>
      <div className="widget mb-4 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold tabular-nums">{format(calMonth, "MMMM yyyy")}</span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              className="press flex h-7 w-7 items-center justify-center rounded-lg text-muted-c transition-colors hover:text-[var(--text)]"
              onClick={() => setCalOffset((m) => m - 1)}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="press flex h-7 items-center rounded-lg px-2 text-[10px] font-semibold text-muted-c transition-colors hover:text-[var(--text)]"
              onClick={() => setCalOffset(0)}
              disabled={calOffset === 0}
            >
              Today
            </button>
            <button
              type="button"
              className="press flex h-7 w-7 items-center justify-center rounded-lg text-muted-c transition-colors hover:text-[var(--text)]"
              onClick={() => setCalOffset((m) => m + 1)}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label={`${format(calMonth, "MMMM yyyy")} study time`}>
          {CAL_DAYS.map((d, i) => (
            <span key={i} className="pb-1 text-center text-[9px] font-semibold text-muted-c" aria-hidden="true">
              {d}
            </span>
          ))}
          {calCells.map((c, i) => {
            if (!c.inMonth) return <span key={c.key + i} aria-hidden="true" />;
            const min = minutesByDate.get(c.key) ?? 0;
            const t = min > 0 ? 0.2 + 0.8 * Math.min(1, min / maxDayMin) : 0;
            const isToday = c.key === todayK;
            const isFuture = c.key > todayK;
            return (
              <div
                key={c.key}
                className="relative flex aspect-square items-center justify-center rounded-lg text-[11px] font-medium tabular-nums transition-transform hover:scale-105"
                style={{
                  background: t > 0 ? `color-mix(in srgb, var(--accent) ${Math.round(t * 30)}%, transparent)` : undefined,
                  color: isToday ? "var(--accent)" : min > 0 ? "var(--text)" : "var(--text-muted)",
                  opacity: isFuture ? 0.35 : 1,
                  boxShadow: isToday ? "inset 0 0 0 1.5px var(--accent)" : undefined,
                }}
                title={`${c.key} — ${min > 0 ? fmtMinutes(min) + " of study" : "no study logged"}`}
                role="gridcell"
                aria-label={`${c.key}: ${min > 0 ? fmtMinutes(min) + " of study" : "no study logged"}`}
              >
                {c.day}
              </div>
            );
          })}
        </div>
        <p className="mt-2.5 text-center text-[10px] text-muted-c">shade = minutes studied that day</p>
      </div>

      {/* recent logs */}
      <PanelSection>
        <span className="flex items-center gap-1.5">
          <BookOpen className="h-3 w-3" aria-hidden="true" /> Recent study logs
        </span>
      </PanelSection>
      <div className="widget mb-4 p-4">
        {recent.length === 0 ? (
          <p className="py-2 text-xs text-muted-c">
            No study logs yet — add manual time above or tag focus sessions with a subject.
          </p>
        ) : (
          <ul className="fd-scroll max-h-80 space-y-0.5">
            {recent.map((l) => {
              const subject = subjects.find((s) => s.id === l.subjectId);
              const chapter = l.chapterId ? chapters.find((c) => c.id === l.chapterId) : undefined;
              return (
                <li
                  key={l.id}
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)]"
                >
                  <span className="w-11 shrink-0 text-[10px] font-medium tabular-nums text-muted-c">
                    {format(parseISO(l.date + "T12:00"), "d MMM")}
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums">{fmtMinutes(l.minutes)}</span>
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: subject?.color }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {subject?.name ?? "Untagged"}
                    {chapter ? ` · ${chapter.name}` : ""}
                    {l.note ? ` · ${l.note}` : ""}
                  </span>
                  <span
                    className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={
                      l.source === "timer"
                        ? {
                            color: "var(--accent)",
                            background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                          }
                        : { color: "var(--text-muted)", background: "color-mix(in srgb, var(--text) 8%, transparent)" }
                    }
                  >
                    {l.source === "timer" ? (
                      <Timer className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <Pencil className="h-3 w-3" aria-hidden="true" />
                    )}
                    {l.source}
                  </span>
                  <button
                    type="button"
                    className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-c transition-colors hover:text-[var(--negative)]"
                    onClick={() => {
                      deleteStudyLog(l.id);
                      toast.success("Study log deleted");
                    }}
                    aria-label="Delete study log"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* weekly subject distribution */}
      <PanelSection>This week by subject</PanelSection>
      <div className="widget mb-2 p-4">
        {hasWeekData ? (
          <HBarChart data={distData} formatValue={(v) => fmtMinutes(v)} />
        ) : (
          <p className="py-2 text-xs text-muted-c">
            No subject-tagged study time in the last 7 days — manual logs and subject-tagged focus sessions count here.
          </p>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * Panel root
 * ============================================================ */

export function StudyPanel() {
  const [tab, setTab] = useState<TabId>("syllabus");

  return (
    <PanelShell
      title="Study"
      subtitle="Your JEE prep system — syllabus, PYQs, mocks & logs"
      icon={<GraduationCap className="h-4 w-4" />}
    >
      <div className="fd-scroll -mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Study sections">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                "press flex h-8 shrink-0 items-center rounded-full px-3.5 text-xs font-semibold transition-colors",
                active ? "text-[var(--accent-fg)]" : "text-muted-c hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-[var(--text)]"
              )}
              style={active ? { background: "var(--accent)" } : undefined}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "syllabus" && <SyllabusTab />}
      {tab === "pyq" && <PyqTab />}
      {tab === "mocks" && <MocksTab />}
      {tab === "log" && <LogTab />}
    </PanelShell>
  );
}
