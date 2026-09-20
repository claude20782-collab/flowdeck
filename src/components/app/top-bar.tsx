"use client";

import { createElement, useMemo } from "react";
import { format } from "date-fns";
import { useTimerStore, remainingOf, elapsedOf } from "@/lib/store/timer-store";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useUIStore } from "@/lib/store/ui-store";
import { useSettingsStore } from "@/lib/store/settings-store";
import { useSoundStore } from "@/lib/store/sound-store";
import { useNow } from "@/hooks/use-app";
import { fmtDuration } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Waves,
  ChevronDown,
  Check,
  Plus,
  Command,
  Settings2,
  LayoutGrid,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Timer as TimerIcon,
} from "lucide-react";
import { iconByName } from "@/lib/icon-map";

const PHASE_LABEL: Record<string, string> = { focus: "Focus", short: "Break", long: "Long break" };

function WorkspaceIcon({ name, className }: { name?: string; className?: string }) {
  const Icon = iconByName(name);
  /* createElement avoids the static-components lint rule for dynamic icon lookup */
  return createElement(Icon, { className: className ?? "h-4 w-4 text-accent" });
}

export function TopBar() {
  const timerState = useTimerStore((s) => s.state);
  const setFocusLayout = useUIStore((s) => s.setFocusLayout);
  const openPanel = useUIStore((s) => s.openPanel);
  const editMode = useUIStore((s) => s.editMode);
  const setEditMode = useUIStore((s) => s.setEditMode);
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeId = useWorkspaceStore((s) => s.activeId);
  const setActive = useWorkspaceStore((s) => s.setActive);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);

  const soundPlaying = useSoundStore((s) => s.playing);
  const channels = useSoundStore((s) => s.channels);

  const running = timerState.status === "running";
  const now = useNow(500, running);

  const activeWorkspace = workspaces.find((w) => w.id === activeId) ?? workspaces[0];

  const remaining = useMemo(() => {
    if (timerState.status === "idle") return null;
    if (timerState.mode === "stopwatch") return elapsedOf(timerState);
    return Math.max(0, remainingOf(timerState));
  }, [timerState, now]);

  const activeSounds = Object.values(channels).filter((c) => c.volume > 0 && !c.muted).length;

  return (
    <TooltipProvider delayDuration={300}>
      <header
        className="sticky top-0 z-30 border-b hairline backdrop-blur-xl"
        style={{ background: "color-mix(in srgb, var(--app-bg) 72%, transparent)" }}
      >
        <div className="mx-auto flex h-13 max-w-[1440px] items-center gap-2 px-3 py-2 sm:gap-3 sm:px-5" style={{ height: 52 }}>
          {/* Brand */}
          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{
                background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                boxShadow: "0 2px 12px color-mix(in srgb, var(--accent) 35%, transparent)",
              }}
              aria-hidden="true"
            >
              <Waves className="h-4 w-4" style={{ color: "var(--accent-fg)" }} strokeWidth={2.2} />
            </div>
            <span className="hidden text-[15px] font-semibold tracking-tight sm:block">Flowdeck</span>
          </div>

          {/* Workspace switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="ml-1 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-[color-mix(in_srgb,var(--text)_7%,transparent)]"
                aria-label="Switch workspace"
              >
                <WorkspaceIcon name={activeWorkspace?.icon} />
                <span className="hidden max-w-[140px] truncate md:block">{activeWorkspace?.name}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-c" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[210px]">
              <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-c">Workspaces</DropdownMenuLabel>
              {workspaces.map((w) => {
                return (
                  <DropdownMenuItem key={w.id} onClick={() => setActive(w.id)} className="gap-2.5">
                    <WorkspaceIcon name={w.icon} className="h-4 w-4" />
                    <span className="flex-1">{w.name}</span>
                    {w.id === activeId && <Check className="h-4 w-4 text-accent" />}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => addWorkspace({ name: "New workspace", icon: "sparkles" })}
                className="gap-2.5"
              >
                <Plus className="h-4 w-4" /> New workspace
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex-1" />

          {/* Timer status chip */}
          {timerState.status !== "idle" && remaining != null && (
            <button
              onClick={() => setFocusLayout("standard")}
              className="press flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium tabular-nums"
              style={{
                background: "color-mix(in srgb, var(--accent) 14%, transparent)",
                color: "var(--text)",
                border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
              }}
              aria-label={`Open focus mode — ${PHASE_LABEL[timerState.phase]} ${fmtDuration(remaining)}`}
            >
              <span
                className={cn("h-2 w-2 rounded-full", running && "fd-pulse")}
                style={{ background: "var(--accent)" }}
                aria-hidden="true"
              />
              <span className="hidden text-[11px] uppercase tracking-wider text-muted-c sm:block">
                {PHASE_LABEL[timerState.phase]}
              </span>
              <span>{fmtDuration(remaining)}</span>
              {timerState.status === "running" ? (
                <Play className="hidden h-3.5 w-3.5 sm:block" style={{ color: "var(--accent)" }} />
              ) : (
                <Pause className="hidden h-3.5 w-3.5 sm:block text-muted-c" />
              )}
            </button>
          )}

          {/* Sound chip */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => openPanel("sound")}
                className="press flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]"
                aria-label={`Ambient sounds — ${activeSounds} active`}
              >
                {soundPlaying && activeSounds > 0 ? (
                  <Volume2 className="h-4 w-4 text-accent" />
                ) : (
                  <VolumeX className="h-4 w-4 text-muted-c" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>Ambient sounds</TooltipContent>
          </Tooltip>

          {/* Command palette */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setPaletteOpen(true)}
                className="press flex h-8 items-center gap-2 rounded-lg px-2 text-muted-c transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-[var(--text)]"
                aria-label="Open command palette"
              >
                <Command className="h-4 w-4" />
                <span className="hidden rounded border hairline px-1.5 py-0.5 text-[10px] font-medium lg:block">
                  K
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent>Command palette</TooltipContent>
          </Tooltip>

          {/* Edit layout */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setEditMode(!editMode)}
                className={cn(
                  "press flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                  editMode ? "text-[var(--accent)]" : "text-muted-c hover:text-[var(--text)]"
                )}
                style={
                  editMode
                    ? { background: "color-mix(in srgb, var(--accent) 14%, transparent)" }
                    : undefined
                }
                aria-label={editMode ? "Done customizing dashboard" : "Customize dashboard"}
                aria-pressed={editMode}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{editMode ? "Done editing" : "Customize"}</TooltipContent>
          </Tooltip>

          {/* Settings */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => openPanel("settings")}
                className="press flex h-8 w-8 items-center justify-center rounded-lg text-muted-c transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-[var(--text)]"
                aria-label="Open settings"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
        </div>
      </header>
    </TooltipProvider>
  );
}
