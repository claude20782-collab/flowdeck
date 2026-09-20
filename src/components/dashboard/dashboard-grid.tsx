"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useUIStore } from "@/lib/store/ui-store";
import { WIDGET_COMPONENTS, WIDGET_LIBRARY, widgetDef } from "./widget-registry";
import { SIZE_CLASS } from "./widget-card";
import { OnboardingCard } from "./onboarding-card";
import { cn } from "@/lib/utils";
import { Plus, RotateCcw, Check, X, Expand } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export function DashboardGrid() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeId = useWorkspaceStore((s) => s.activeId);
  const reorderWidgets = useWorkspaceStore((s) => s.reorderWidgets);
  const editMode = useUIStore((s) => s.editMode);

  const [libraryOpen, setLibraryOpen] = useState(false);

  const workspace = workspaces.find((w) => w.id === activeId) ?? workspaces[0];
  const visibleWidgets = useMemo(
    () => (workspace?.widgets ?? []).filter((w) => w.visible),
    [workspace]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } })
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !workspace) return;
    const ids = visibleWidgets.map((w) => w.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    reorderWidgets(workspace.id, arrayMove(ids, from, to));
  };

  if (!workspace) return null;

  return (
    <div className="fd-rise">
      {/* first-run onboarding */}
      <OnboardingCard />

      {/* edit toolbar */}
      {editMode && (
        <div className="widget fd-pop mb-4 flex flex-wrap items-center gap-2 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span className="h-2 w-2 rounded-full fd-pulse" style={{ background: "var(--accent)" }} />
            Customizing “{workspace.name}”
          </span>
          <span className="hidden text-xs text-muted-c sm:block">
            Drag cards to reorder · expand icon changes size
          </span>
          <span className="flex-1" />
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setLibraryOpen(true)}>
            <Plus className="h-4 w-4" /> Add widget
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => useWorkspaceStore.getState().resetWorkspace(workspace.id)}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
          <Button size="sm" className="h-8 gap-1.5" onClick={() => useUIStore.getState().setEditMode(false)}>
            <Check className="h-4 w-4" /> Done
          </Button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visibleWidgets.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-12">
            {visibleWidgets.map((w) => (
              <SortableWidget key={w.id} widgetId={w.id} workspaceId={workspace.id} size={w.size}>
                <WidgetRenderer widget={w} />
              </SortableWidget>
            ))}

            {/* add tile (edit mode or empty dashboard) */}
            {(editMode || visibleWidgets.length === 0) && (
              <button
                onClick={() => setLibraryOpen(true)}
                className={cn(
                  "flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-[var(--app-radius)] border border-dashed text-muted-c transition-colors hover:text-[var(--text)]",
                  SIZE_CLASS[2]
                )}
                style={{ borderColor: "color-mix(in srgb, var(--text) 18%, transparent)" }}
              >
                <Plus className="h-6 w-6" />
                <span className="text-sm font-medium">Add widget</span>
                {visibleWidgets.length === 0 && (
                  <span className="max-w-[280px] px-4 text-center text-xs">
                    Build your dashboard — clock, timer, tasks, habits, study tracking and more
                  </span>
                )}
              </button>
            )}
          </div>
        </SortableContext>
      </DndContext>

      <WidgetLibraryDialog open={libraryOpen} onOpenChange={setLibraryOpen} workspaceId={workspace.id} />
    </div>
  );
}

/* ---------- one sortable grid cell ---------- */

function SortableWidget({
  widgetId,
  workspaceId,
  size,
  children,
}: {
  widgetId: string;
  workspaceId: string;
  size: number;
  children: React.ReactNode;
}) {
  const editMode = useUIStore((s) => s.editMode);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widgetId,
    disabled: !editMode,
  });

  const removeWidget = useWorkspaceStore((s) => s.removeWidget);
  const cycleWidgetSize = useWorkspaceStore((s) => s.cycleWidgetSize);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", SIZE_CLASS[size] ?? SIZE_CLASS[2], isDragging && "z-30")}
    >
      {editMode && (
        <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between p-2">
          <button
            className="flex h-7 w-7 cursor-grab items-center justify-center rounded-lg text-muted-c active:cursor-grabbing"
            style={{ background: "color-mix(in srgb, var(--card-solid) 80%, transparent)" }}
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder widget"
            onPointerDown={(e) => listeners?.onPointerDown?.(e)}
          >
            <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
              <circle cx="2" cy="2" r="1.4" /><circle cx="8" cy="2" r="1.4" />
              <circle cx="2" cy="8" r="1.4" /><circle cx="8" cy="8" r="1.4" />
              <circle cx="2" cy="14" r="1.4" /><circle cx="8" cy="14" r="1.4" />
            </svg>
          </button>
          <div className="flex gap-1">
            <button
              className="press flex h-7 w-7 items-center justify-center rounded-lg text-muted-c hover:text-[var(--text)]"
              style={{ background: "color-mix(in srgb, var(--card-solid) 80%, transparent)" }}
              onClick={() => cycleWidgetSize(workspaceId, widgetId)}
              aria-label="Cycle widget size"
              title="Cycle size"
            >
              <Expand className="h-3.5 w-3.5" />
            </button>
            <button
              className="press flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ background: "color-mix(in srgb, var(--negative) 20%, transparent)", color: "var(--negative)" }}
              onClick={() => removeWidget(workspaceId, widgetId)}
              aria-label="Remove widget"
              title="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      <div className={cn("h-full", editMode && "pointer-events-none opacity-90")}>{children}</div>
    </div>
  );
}

/* ---------- widget renderer with lazy fallback ---------- */

function WidgetRenderer({ widget }: { widget: { id: string; type: string; config: Record<string, unknown> } }) {
  const Component = WIDGET_COMPONENTS[widget.type];
  if (!Component) {
    return (
      <div className="widget flex min-h-[120px] items-center justify-center p-4 text-sm text-muted-c">
        Unknown widget
      </div>
    );
  }
  return <Component widget={widget as never} config={widget.config} />;
}

/* ---------- add-widget library ---------- */

function WidgetLibraryDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
}) {
  const addWidget = useWorkspaceStore((s) => s.addWidget);
  const [query, setQuery] = useState("");

  const filtered = WIDGET_LIBRARY.filter(
    (w) =>
      !query ||
      w.label.toLowerCase().includes(query.toLowerCase()) ||
      w.description.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Widget library</DialogTitle>
          <DialogDescription>Add widgets to this workspace’s dashboard</DialogDescription>
        </DialogHeader>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search widgets…"
          className="mb-3 h-10 w-full rounded-lg border hairline bg-transparent px-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
        />
        <ScrollArea className="max-h-[52vh] pr-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {filtered.map((def) => {
              const Icon = def.icon;
              return (
                <button
                  key={def.type}
                  onClick={() => {
                    addWidget(workspaceId, def.type, def.defaultSize);
                    onOpenChange(false);
                  }}
                  className="press widget flex items-start gap-3 rounded-xl p-3.5 text-left"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }}
                  >
                    <Icon className="h-4.5 w-4.5 text-accent" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{def.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted-c">{def.description}</span>
                  </span>
                  <Plus className="ml-auto h-4 w-4 shrink-0 text-muted-c" />
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="col-span-2 py-8 text-center text-sm text-muted-c">No widgets match “{query}”.</p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
