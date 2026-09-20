/* ============================================================
 * Flowdeck domain types — the shared contract for all stores,
 * widgets, panels and background engines.
 * ============================================================ */

/* ---------- Timer ---------- */

export type TimerMode = "pomodoro" | "deepwork" | "custom" | "stopwatch" | "countdown";
export type TimerPhase = "focus" | "short" | "long";
export type TimerStatus = "idle" | "running" | "paused" | "completed";

export interface TimerSessionMeta {
  label?: string;
  subjectId?: string;
  chapterId?: string;
  taskId?: string;
  notes?: string;
}

export interface TimerState {
  mode: TimerMode;
  phase: TimerPhase;
  status: TimerStatus;
  /** planned duration of current phase in ms (0 for stopwatch) */
  durationMs: number;
  /** epoch ms when the current running segment started */
  startEpoch: number | null;
  /** ms accumulated before the current segment (across pauses) */
  accumulatedMs: number;
  /** completed pomodoro focus cycles in this run */
  cycle: number;
  session: TimerSessionMeta | null;
}

export interface FocusSession {
  id: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  mode: TimerMode;
  phase: TimerPhase;
  completed: boolean;
  label?: string;
  subjectId?: string;
  chapterId?: string;
  taskId?: string;
  notes?: string;
}

/* ---------- Tasks ---------- */

export type Priority = "none" | "low" | "medium" | "high" | "urgent";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export type RecurKind = "daily" | "weekdays" | "weekly" | "monthly";

export interface Task {
  id: string;
  title: string;
  notes?: string;
  done: boolean;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  /** 'YYYY-MM-DD' */
  dueDate?: string;
  /** 'YYYY-MM-DD' */
  scheduledDate?: string;
  priority: Priority;
  tags: string[];
  subtasks: Subtask[];
  order: number;
  recur?: RecurKind;
  archived: boolean;
  estMinutes?: number;
  subjectId?: string;
  chapterId?: string;
}

/* ---------- Habits ---------- */

export type HabitFreq =
  | { kind: "daily" }
  | { kind: "weekly"; days: number[] } // 0=Sun … 6=Sat
  | { kind: "times-per-week"; times: number };

export interface Habit {
  id: string;
  name: string;
  emoji?: string;
  color?: string;
  freq: HabitFreq;
  createdAt: number;
  archived: boolean;
  notes?: string;
  targetPerDay?: number;
}

/** key format: `${habitId}|${YYYY-MM-DD}` → count */
export interface HabitLogEntry {
  habitId: string;
  date: string;
  count: number;
}

/* ---------- Goals ---------- */

export type GoalType = "numeric" | "completion" | "time" | "streak" | "study-hours" | "questions" | "custom";

export interface Milestone {
  id: string;
  title: string;
  done: boolean;
}

export interface GoalContribution {
  date: string; // YYYY-MM-DD
  amount: number;
  note?: string;
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  type: GoalType;
  target: number;
  unit?: string;
  /** manual value for numeric/completion tracking */
  manualValue?: number;
  deadline?: string;
  createdAt: number;
  archived: boolean;
  color?: string;
  milestones: Milestone[];
  contributions: GoalContribution[];
}

/* ---------- Notes ---------- */

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

/* ---------- Study / JEE ---------- */

export type ChapterStatus = "not-started" | "learning" | "revised" | "mastered";

export interface Subject {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  archived: boolean;
}

export interface Chapter {
  id: string;
  subjectId: string;
  name: string;
  status: ChapterStatus;
  /** 0..5 self-rated confidence */
  confidence: number;
  /** relative exam weightage 1..5 (informational) */
  weightage?: number;
  /** planned PYQ count for this chapter */
  totalQuestions?: number;
  lastRevisedAt?: number;
  createdAt: number;
  order: number;
}

export interface PyqEntry {
  id: string;
  date: string; // YYYY-MM-DD
  subjectId: string;
  chapterId?: string;
  year?: string;
  exam?: string;
  difficulty: "easy" | "medium" | "hard";
  attempted: number;
  correct: number;
  skipped?: number;
  timeMinutes?: number;
  notes?: string;
  revision: "none" | "flagged" | "revised";
}

export interface MockTest {
  id: string;
  date: string; // YYYY-MM-DD
  examName: string;
  durationMin: number;
  physics?: number;
  chemistry?: number;
  maths?: number;
  total?: number;
  maxTotal?: number;
  attempted: number;
  correct: number;
  incorrect: number;
  unanswered?: number;
  percentile?: number;
  notes?: string;
  weakChapters?: string[];
}

export interface StudyLogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  minutes: number;
  subjectId?: string;
  chapterId?: string;
  source: "timer" | "manual";
  note?: string;
}

/* ---------- Widgets / Workspaces ---------- */

export type WidgetType =
  | "greeting"
  | "clock"
  | "timer"
  | "tasks"
  | "habits"
  | "goals"
  | "notes"
  | "quote"
  | "calendar"
  | "focus-stats"
  | "study-progress"
  | "jee"
  | "sound"
  | "links"
  | "heatmap"
  | "session-history"
  | "daily-review"
  | "pyq"
  | "mock"
  | "music";

/** 1 = quarter, 2 = half, 3 = wide, 4 = full-width hero */
export type WidgetSize = 1 | 2 | 3 | 4;

export interface WidgetInstance {
  id: string;
  type: WidgetType;
  size: WidgetSize;
  config: Record<string, unknown>;
  visible: boolean;
}

export type WorkspaceKind = "focus" | "study" | "planning" | "analytics" | "custom";

export interface Workspace {
  id: string;
  name: string;
  icon: string; // lucide icon name
  kind: WorkspaceKind;
  widgets: WidgetInstance[];
  /** null = theme default animation */
  animationOverride?: string | null;
  createdAt: number;
}

/* ---------- Quick links ---------- */

export interface QuickLink {
  id: string;
  label: string;
  url: string;
  icon?: string;
}
