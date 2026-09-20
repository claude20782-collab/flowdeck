"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { WidgetInstance, WidgetType } from "@/lib/types";
import {
  Clock3,
  Timer,
  ListTodo,
  Repeat,
  Target,
  NotebookPen,
  Quote,
  CalendarDays,
  ChartColumnBig,
  GraduationCap,
  Music4,
  Link2,
  Flame,
  History,
  ClipboardCheck,
  FileQuestion,
  ClipboardList,
  Sun,
} from "lucide-react";

export interface WidgetComponentProps {
  widget: WidgetInstance;
  config: Record<string, unknown>;
}

export interface WidgetDef {
  type: WidgetType;
  label: string;
  description: string;
  icon: LucideIcon;
  defaultSize: 1 | 2 | 3 | 4;
}

export const WIDGET_LIBRARY: WidgetDef[] = [
  { type: "greeting", label: "Greeting", description: "Personal hello with live date & time context", icon: Sun, defaultSize: 2 },
  { type: "clock", label: "Clock", description: "Large clock with date and week number", icon: Clock3, defaultSize: 4 },
  { type: "timer", label: "Focus Timer", description: "Pomodoro / deep work / stopwatch with session tagging", icon: Timer, defaultSize: 2 },
  { type: "tasks", label: "Tasks", description: "Task list with quick add and filters", icon: ListTodo, defaultSize: 2 },
  { type: "habits", label: "Habits", description: "Daily habit check-off with streaks", icon: Repeat, defaultSize: 2 },
  { type: "goals", label: "Goals", description: "Goal progress with milestones", icon: Target, defaultSize: 2 },
  { type: "notes", label: "Quick Notes", description: "Fast capture notes with markdown", icon: NotebookPen, defaultSize: 2 },
  { type: "quote", label: "Quote", description: "Daily focus quote", icon: Quote, defaultSize: 2 },
  { type: "calendar", label: "Calendar", description: "Month grid with tasks & sessions", icon: CalendarDays, defaultSize: 2 },
  { type: "focus-stats", label: "Focus Stats", description: "Today's focus time, streak & weekly bars", icon: Flame, defaultSize: 2 },
  { type: "study-progress", label: "Study Progress", description: "Syllabus completion by subject", icon: GraduationCap, defaultSize: 2 },
  { type: "jee", label: "JEE Dashboard", description: "Subjects, accuracy, weak topics, revision queue", icon: ChartColumnBig, defaultSize: 4 },
  { type: "sound", label: "Soundscape", description: "Ambient sound mixer & presets", icon: Music4, defaultSize: 2 },
  { type: "links", label: "Quick Links", description: "Your shortcuts and bookmarks", icon: Link2, defaultSize: 1 },
  { type: "heatmap", label: "Heatmap", description: "Productivity heatmap by metric", icon: Flame, defaultSize: 4 },
  { type: "session-history", label: "Session History", description: "Recent focus sessions log", icon: History, defaultSize: 2 },
  { type: "daily-review", label: "Daily Review", description: "Today at a glance — focus, tasks, habits", icon: ClipboardCheck, defaultSize: 2 },
  { type: "pyq", label: "PYQ Tracker", description: "Question practice log & accuracy", icon: FileQuestion, defaultSize: 2 },
  { type: "mock", label: "Mock Tests", description: "Mock test history & performance", icon: ClipboardList, defaultSize: 2 },
];

/* Lazy-loaded widget components (keeps initial bundle lean). */
export const WIDGET_COMPONENTS: Record<string, ComponentType<WidgetComponentProps>> = {
  greeting: dynamic(() => import("./widgets/greeting-widget").then((m) => m.GreetingWidget), { ssr: false }),
  clock: dynamic(() => import("./widgets/clock-widget").then((m) => m.ClockWidget), { ssr: false }),
  timer: dynamic(() => import("./widgets/timer-widget").then((m) => m.TimerWidget), { ssr: false }),
  tasks: dynamic(() => import("./widgets/tasks-widget").then((m) => m.TasksWidget), { ssr: false }),
  habits: dynamic(() => import("./widgets/habits-widget").then((m) => m.HabitsWidget), { ssr: false }),
  goals: dynamic(() => import("./widgets/goals-widget").then((m) => m.GoalsWidget), { ssr: false }),
  notes: dynamic(() => import("./widgets/notes-widget").then((m) => m.NotesWidget), { ssr: false }),
  quote: dynamic(() => import("./widgets/quote-widget").then((m) => m.QuoteWidget), { ssr: false }),
  calendar: dynamic(() => import("./widgets/calendar-widget").then((m) => m.CalendarWidget), { ssr: false }),
  "focus-stats": dynamic(() => import("./widgets/focus-stats-widget").then((m) => m.FocusStatsWidget), { ssr: false }),
  "study-progress": dynamic(() => import("./widgets/study-progress-widget").then((m) => m.StudyProgressWidget), { ssr: false }),
  jee: dynamic(() => import("./widgets/jee-widget").then((m) => m.JeeWidget), { ssr: false }),
  sound: dynamic(() => import("./widgets/sound-widget").then((m) => m.SoundWidget), { ssr: false }),
  links: dynamic(() => import("./widgets/links-widget").then((m) => m.LinksWidget), { ssr: false }),
  heatmap: dynamic(() => import("./widgets/heatmap-widget").then((m) => m.HeatmapWidget), { ssr: false }),
  "session-history": dynamic(() => import("./widgets/session-history-widget").then((m) => m.SessionHistoryWidget), { ssr: false }),
  "daily-review": dynamic(() => import("./widgets/daily-review-widget").then((m) => m.DailyReviewWidget), { ssr: false }),
  pyq: dynamic(() => import("./widgets/pyq-widget").then((m) => m.PyqWidget), { ssr: false }),
  mock: dynamic(() => import("./widgets/mock-widget").then((m) => m.MockWidget), { ssr: false }),
};

export function widgetDef(type: string): WidgetDef | undefined {
  return WIDGET_LIBRARY.find((w) => w.type === type);
}
