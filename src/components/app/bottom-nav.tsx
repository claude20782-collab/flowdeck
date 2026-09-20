"use client";

import { useEffect, useState } from "react";
import { useUIStore, type PanelId } from "@/lib/store/ui-store";
import { useTaskStore } from "@/lib/store/task-store";
import { cn } from "@/lib/utils";
import {
  ListTodo,
  GraduationCap,
  ChartColumnBig,
  Ellipsis,
  House,
  Music4,
  NotebookPen,
  Repeat,
  Target,
  Palette,
  Settings2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const NAV_ITEMS: { id: PanelId | "home" | "more"; label: string; icon: typeof ListTodo }[] = [
  { id: "home", label: "Home", icon: House },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "study", label: "Study", icon: GraduationCap },
  { id: "analytics", label: "Stats", icon: ChartColumnBig },
  { id: "more", label: "More", icon: Ellipsis },
];

const MORE_ITEMS: { id: PanelId; label: string; icon: typeof ListTodo }[] = [
  { id: "notes", label: "Notes", icon: NotebookPen },
  { id: "habits", label: "Habits", icon: Repeat },
  { id: "goals", label: "Goals", icon: Target },
  { id: "sound", label: "Sounds", icon: Music4 },
  { id: "themes", label: "Themes", icon: Palette },
  { id: "settings", label: "Settings", icon: Settings2 },
];

export function BottomNav() {
  const activePanel = useUIStore((s) => s.activePanel);
  const openPanel = useUIStore((s) => s.openPanel);
  const closePanel = useUIStore((s) => s.closePanel);
  const [moreOpen, setMoreOpen] = useState(false);

  const openTasks = useTaskStore((s) => s.tasks.filter((t) => !t.done && !t.archived).length);

  const handleNav = (id: PanelId | "home" | "more") => {
    if (id === "home") {
      closePanel();
      return;
    }
    if (id === "more") {
      setMoreOpen(true);
      return;
    }
    openPanel(id as PanelId);
  };

  return (
    <>
      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t hairline backdrop-blur-xl md:hidden"
        style={{ background: "color-mix(in srgb, var(--app-bg) 82%, transparent)" }}
        aria-label="Primary navigation"
      >
        <div className="grid grid-cols-5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              item.id === "home" ? activePanel === null : activePanel === (item.id as PanelId);
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className="press relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium"
                style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
                aria-current={active ? "page" : undefined}
              >
                <span className="relative">
                  <Icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.4 : 2} />
                  {item.id === "tasks" && openTasks > 0 && (
                    <span
                      className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none"
                      style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                      aria-label={`${openTasks} open tasks`}
                    >
                      {openTasks > 99 ? "99+" : openTasks}
                    </span>
                  )}
                </span>
                {item.label}
                <span
                  className={cn(
                    "absolute top-0 h-[2px] rounded-full transition-all duration-300",
                    active ? "w-8" : "w-0"
                  )}
                  style={{ background: "var(--accent)" }}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-8">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-base">More</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-3 pt-1">
            {MORE_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setMoreOpen(false);
                    openPanel(item.id);
                  }}
                  className="press widget flex flex-col items-center gap-2 rounded-2xl px-2 py-4"
                >
                  <Icon className="h-5 w-5 text-accent" />
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
