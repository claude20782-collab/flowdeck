"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUIStore, type PanelId } from "@/lib/store/ui-store";
import { useTimerStore } from "@/lib/store/timer-store";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useAppearanceStore } from "@/lib/store/appearance-store";
import { useSoundStore, BUILTIN_PRESETS } from "@/lib/store/sound-store";
import { useTaskStore } from "@/lib/store/task-store";
import { useNoteStore } from "@/lib/store/note-store";
import { useHabitStore } from "@/lib/store/habit-store";
import { useGoalStore } from "@/lib/store/goal-store";
import { useStudyStore } from "@/lib/store/study-store";
import { useSettingsStore } from "@/lib/store/settings-store";
import { BUILT_IN_THEMES } from "@/lib/themes/presets";
import { soundscape } from "@/lib/audio/engine";
import { stripMarkdown } from "@/lib/markdown";
import { todayKey } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Search,
  Timer,
  ListTodo,
  NotebookPen,
  GraduationCap,
  Repeat,
  Target,
  ChartColumnBig,
  Palette,
  Music4,
  Settings2,
  Play,
  Pause,
  Square,
  SkipForward,
  Maximize2,
  LayoutGrid,
  ArrowRight,
  FileQuestion,
  Moon,
  Volume2,
  VolumeX,
  Sparkles,
  Plus,
  Command as CommandIcon,
} from "lucide-react";

interface CommandItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  keywords?: string;
  /** run without closing the palette (inline flows like quick-create) */
  keepOpen?: boolean;
  action: () => void;
}

export function CommandPalette() {
  const open = useUIStore((s) => s.paletteOpen);
  const setOpen = useUIStore((s) => s.setPaletteOpen);
  const openPanel = useUIStore((s) => s.openPanel);
  const setFocusLayout = useUIStore((s) => s.setFocusLayout);
  const setEditMode = useUIStore((s) => s.setEditMode);

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [createMode, setCreateMode] = useState<null | "task" | "note">(null);
  const [createText, setCreateText] = useState("");
  const createInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const timer = useTimerStore((s) => s.state);
  const timerStart = useTimerStore((s) => s.start);
  const timerPause = useTimerStore((s) => s.pause);
  const timerResume = useTimerStore((s) => s.resume);
  const timerStop = useTimerStore((s) => s.stop);
  const timerSkip = useTimerStore((s) => s.skip);
  const timerActions = { start: timerStart, pause: timerPause, resume: timerResume, stop: timerStop, skip: timerSkip };
  const userName = useSettingsStore((s) => s.name);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActive);
  const setTheme = useAppearanceStore((s) => s.setTheme);
  const themeId = useAppearanceStore((s) => s.activeThemeId);
  const customThemes = useAppearanceStore((s) => s.customThemes);
  const soundPlaying = useSoundStore((s) => s.playing);
  const setSoundPlaying = useSoundStore((s) => s.setPlaying);
  const applyPreset = useSoundStore((s) => s.applyPreset);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setCreateMode(null);
      setCreateText("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  /* focus the create-mode input when it appears */
  useEffect(() => {
    if (createMode) {
      requestAnimationFrame(() => createInputRef.current?.focus());
    }
  }, [createMode]);

  const submitCreate = () => {
    const text = createText.trim();
    if (!text || !createMode) return;
    if (createMode === "task") {
      useTaskStore.getState().addTask({ title: text, scheduledDate: todayKey() });
      toast.success("Task added to today");
    } else {
      useNoteStore.getState().createNote({ content: text });
      toast.success("Note created");
    }
    close();
  };

  const close = () => setOpen(false);

  const run = (fn: () => void, keepOpen = false) => {
    fn();
    if (!keepOpen) close();
  };

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];
    const running = timer.status === "running";
    const paused = timer.status === "paused";

    /* Quick create */
    items.push(
      { id: "create-task", group: "Create", label: "Add task to today…", hint: "type a title, press Enter", icon: <Plus className="h-4 w-4" />, keepOpen: true, action: () => setCreateMode("task") },
      { id: "create-note", group: "Create", label: "Capture a note…", hint: "type content, press Enter", icon: <NotebookPen className="h-4 w-4" />, keepOpen: true, action: () => setCreateMode("note") }
    );

    /* Timer */
    if (timer.status === "idle") {
      items.push(
        { id: "timer-pomodoro", group: "Timer", label: "Start Pomodoro session", icon: <Timer className="h-4 w-4" />, action: () => timerActions.start("pomodoro") },
        { id: "timer-deep", group: "Timer", label: "Start deep work block", icon: <Timer className="h-4 w-4" />, action: () => timerActions.start("deepwork") },
        { id: "timer-stopwatch", group: "Timer", label: "Start stopwatch", icon: <Timer className="h-4 w-4" />, action: () => timerActions.start("stopwatch") }
      );
    } else {
      items.push(
        running
          ? { id: "timer-pause", group: "Timer", label: "Pause timer", icon: <Pause className="h-4 w-4" />, action: () => timerActions.pause() }
          : paused
            ? { id: "timer-resume", group: "Timer", label: "Resume timer", icon: <Play className="h-4 w-4" />, action: () => timerActions.resume() }
            : { id: "timer-start", group: "Timer", label: "Start timer", icon: <Play className="h-4 w-4" />, action: () => timerActions.start() },
        { id: "timer-skip", group: "Timer", label: "Skip to next phase", icon: <SkipForward className="h-4 w-4" />, action: () => timerActions.skip() },
        { id: "timer-stop", group: "Timer", label: "Stop & reset timer", icon: <Square className="h-4 w-4" />, action: () => timerActions.stop() }
      );
    }
    items.push({ id: "focus-minimal", group: "Focus mode", label: "Enter focus mode — minimal", icon: <Maximize2 className="h-4 w-4" />, action: () => setFocusLayout("minimal") });
    items.push({ id: "focus-standard", group: "Focus mode", label: "Enter focus mode — standard", icon: <Maximize2 className="h-4 w-4" />, action: () => setFocusLayout("standard") });
    items.push({ id: "focus-study", group: "Focus mode", label: "Enter focus mode — study", icon: <GraduationCap className="h-4 w-4" />, action: () => setFocusLayout("study") });
    items.push({ id: "focus-immersive", group: "Focus mode", label: "Enter focus mode — immersive", icon: <Sparkles className="h-4 w-4" />, action: () => setFocusLayout("immersive") });

    /* Navigation */
    const nav: [PanelId, string, React.ReactNode][] = [
      ["tasks", "Open tasks", <ListTodo className="h-4 w-4" key="t" />],
      ["notes", "Open notes", <NotebookPen className="h-4 w-4" key="n" />],
      ["study", "Open study / JEE system", <GraduationCap className="h-4 w-4" key="s" />],
      ["habits", "Open habits", <Repeat className="h-4 w-4" key="h" />],
      ["goals", "Open goals", <Target className="h-4 w-4" key="g" />],
      ["analytics", "Open analytics", <ChartColumnBig className="h-4 w-4" key="a" />],
      ["themes", "Open theme studio", <Palette className="h-4 w-4" key="th" />],
      ["sound", "Open soundscape mixer", <Music4 className="h-4 w-4" key="so" />],
      ["settings", "Open settings", <Settings2 className="h-4 w-4" key="se" />],
    ];
    for (const [panel, label, icon] of nav) {
      items.push({ id: `nav-${panel}`, group: "Go to", label, icon, action: () => openPanel(panel) });
    }

    /* Workspaces */
    for (const w of workspaces) {
      items.push({
        id: `ws-${w.id}`,
        group: "Switch workspace",
        label: w.name,
        icon: <LayoutGrid className="h-4 w-4" />,
        action: () => setActiveWorkspace(w.id),
      });
    }

    /* Sound */
    items.push(
      soundPlaying
        ? { id: "sound-off", group: "Sound", label: "Pause ambient sounds", icon: <VolumeX className="h-4 w-4" />, action: () => setSoundPlaying(false) }
        : { id: "sound-on", group: "Sound", label: "Play ambient sounds", icon: <Volume2 className="h-4 w-4" />, action: () => { soundscape.ensureContext(); setSoundPlaying(true); } }
    );
    for (const p of BUILTIN_PRESETS) {
      items.push({ id: `preset-${p.id}`, group: "Sound presets", label: `Play “${p.name}” preset`, icon: <Music4 className="h-4 w-4" />, action: () => { soundscape.ensureContext(); applyPreset(p.id); } });
    }

    /* View */
    items.push({ id: "edit-mode", group: "View", label: "Customize dashboard", icon: <LayoutGrid className="h-4 w-4" />, action: () => setEditMode(true) });

    /* Themes */
    for (const t of [...BUILT_IN_THEMES, ...customThemes]) {
      items.push({
        id: `theme-${t.id}`,
        group: "Themes",
        label: `Theme: ${t.name}`,
        hint: t.tagline,
        icon: <Palette className="h-4 w-4" />,
        keywords: t.tagline,
        action: () => setTheme(t.id),
      });
    }

    return items;
  }, [timer.status, timerActions, workspaces, soundPlaying, customThemes, themeId]);

  /* Global search across user data */
  const searchResults = useMemo<CommandItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const items: CommandItem[] = [];

    for (const t of useTaskStore.getState().tasks.filter((t) => !t.archived).slice(0, 200)) {
      if (t.title.toLowerCase().includes(q) || (t.notes ?? "").toLowerCase().includes(q)) {
        items.push({
          id: `task-${t.id}`,
          group: "Tasks",
          label: t.title,
          hint: t.done ? "completed" : "open task",
          icon: <ListTodo className="h-4 w-4" />,
          action: () => openPanel("tasks"),
        });
      }
    }
    for (const n of useNoteStore.getState().notes.filter((n) => !n.archived).slice(0, 200)) {
      if (
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some((tag) => tag.toLowerCase().includes(q))
      ) {
        items.push({
          id: `note-${n.id}`,
          group: "Notes",
          label: n.title || stripMarkdown(n.content).slice(0, 48) || "Untitled",
          hint: "note",
          icon: <NotebookPen className="h-4 w-4" />,
          action: () => openPanel("notes"),
        });
      }
    }
    for (const h of useHabitStore.getState().habits.filter((h) => !h.archived)) {
      if (h.name.toLowerCase().includes(q)) {
        items.push({ id: `habit-${h.id}`, group: "Habits", label: h.name, icon: <Repeat className="h-4 w-4" />, action: () => openPanel("habits") });
      }
    }
    for (const g of useGoalStore.getState().goals.filter((g) => !g.archived)) {
      if (g.title.toLowerCase().includes(q)) {
        items.push({ id: `goal-${g.id}`, group: "Goals", label: g.title, icon: <Target className="h-4 w-4" />, action: () => openPanel("goals") });
      }
    }
    const study = useStudyStore.getState();
    for (const c of study.chapters) {
      if (c.name.toLowerCase().includes(q)) {
        items.push({ id: `chapter-${c.id}`, group: "Study", label: c.name, hint: "chapter", icon: <FileQuestion className="h-4 w-4" />, action: () => openPanel("study") });
      }
    }
    return items.slice(0, 12);
  }, [query, openPanel]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 40);
    const scored = commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q) ||
        (c.keywords ?? "").toLowerCase().includes(q) ||
        (c.hint ?? "").toLowerCase().includes(q)
    );
    return [...scored, ...searchResults].slice(0, 40);
  }, [commands, searchResults, query]);

  const grouped = useMemo(() => {
    const groups: { group: string; items: CommandItem[] }[] = [];
    for (const item of filtered) {
      const g = groups.find((x) => x.group === item.group);
      if (g) g.items.push(item);
      else groups.push({ group: item.group, items: [item] });
    }
    return groups;
  }, [filtered]);

  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  useEffect(() => setActiveIndex(0), [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flat[activeIndex];
      if (item) run(item.action, item.keepOpen);
    }
  };

  let index = -1;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]"
      style={{ background: "color-mix(in srgb, #000 50%, transparent)", backdropFilter: "blur(8px)" }}
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="fd-pop w-full max-w-[560px] overflow-hidden rounded-2xl"
        style={{
          background: "color-mix(in srgb, var(--card-solid) 97%, transparent)",
          border: "1px solid var(--border-c)",
          boxShadow: "var(--shadow-3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* input */}
        {!createMode && (
          <div className="flex items-center gap-3 border-b hairline px-4 py-3.5">
            <Search className="h-[18px] w-[18px] text-muted-c" aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search commands, tasks, notes, study…"
              aria-label="Command palette search"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-c"
            />
            <span
              className="flex items-center gap-1 rounded-md border hairline px-1.5 py-0.5 text-[10px] font-medium text-muted-c"
              aria-hidden="true"
            >
              <CommandIcon className="h-3 w-3" /> K
            </span>
          </div>
        )}

        {/* create-mode composer */}
        {createMode && (
          <div className="border-b hairline px-4 py-3.5">
            <div className="flex items-center gap-3">
              {createMode === "task" ? (
                <ListTodo className="h-[18px] w-[18px] text-accent" aria-hidden="true" />
              ) : (
                <NotebookPen className="h-[18px] w-[18px] text-accent" aria-hidden="true" />
              )}
              <input
                ref={createInputRef}
                value={createText}
                onChange={(e) => setCreateText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitCreate();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setCreateMode(null);
                    setCreateText("");
                  }
                }}
                placeholder={createMode === "task" ? "Task title — lands in Today…" : "Note content — markdown supported…"}
                aria-label={createMode === "task" ? "New task title" : "New note content"}
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-c"
              />
              <button
                className="press flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[var(--accent-fg)] disabled:opacity-40"
                style={{ background: "var(--accent)" }}
                onClick={submitCreate}
                disabled={!createText.trim()}
                aria-label={createMode === "task" ? "Create task" : "Create note"}
              >
                <Plus className="h-3.5 w-3.5" />
                {createMode === "task" ? "Add task" : "Save note"}
              </button>
            </div>
            <p className="mt-2 pl-8 text-[11px] text-muted-c">
              {createMode === "task" ? "Scheduled for today · Esc to cancel" : "Autosaves to Notes · Esc to cancel"}
            </p>
          </div>
        )}

        {/* results */}
        {!createMode && (
          <div ref={listRef} className="fd-scroll max-h-[46vh] p-2" role="listbox">
          {flat.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-c">
              No results for “{query}”
            </p>
          ) : (
            grouped.map((g) => (
              <div key={g.group} className="mb-1.5">
                <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-c">
                  {g.group}
                </div>
                {g.items.map((item) => {
                  index++;
                  const idx = index;
                  const active = idx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      role="option"
                      aria-selected={active}
                      data-index={idx}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => run(item.action, item.keepOpen)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                        active ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]" : ""
                      )}
                      style={active ? { boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent)" } : undefined}
                    >
                      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", active ? "text-accent" : "text-muted-c")}>
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.label}</span>
                        {item.hint && <span className="block truncate text-[11px] text-muted-c">{item.hint}</span>}
                      </span>
                      {active && <ArrowRight className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
          </div>
        )}

        {/* footer */}
        <div className="flex items-center gap-3 border-t hairline px-4 py-2 text-[10px] text-muted-c">
          {createMode ? (
            <span className="flex items-center gap-1">
              <kbd className="rounded border hairline px-1 py-0.5">↵</kbd> create
              <kbd className="ml-2 rounded border hairline px-1 py-0.5">esc</kbd> back to search
            </span>
          ) : (
            <>
              <span className="flex items-center gap-1"><kbd className="rounded border hairline px-1 py-0.5">↑↓</kbd> navigate</span>
              <span className="flex items-center gap-1"><kbd className="rounded border hairline px-1 py-0.5">↵</kbd> run</span>
              <span className="flex items-center gap-1"><kbd className="rounded border hairline px-1 py-0.5">esc</kbd> close</span>
              {query.trim() === "" && (
                <span className="ml-auto flex items-center gap-1.5">
                  <Moon className="h-3 w-3" aria-hidden="true" />
                  {userName ? `${userName} · ` : ""}local-first
                </span>
              )}
              {query.trim() !== "" && (
                <span className="ml-auto tabular-nums">
                  {flat.length} result{flat.length === 1 ? "" : "s"}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
