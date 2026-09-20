"use client";

import { useMemo, useState } from "react";
import { WidgetCard } from "../widget-card";
import { useNoteStore } from "@/lib/store/note-store";
import { useUIStore } from "@/lib/store/ui-store";
import { NotebookPen, Plus, ChevronRight, Pin } from "lucide-react";
import { cn, modKeyLabel } from "@/lib/utils";
import { stripMarkdown } from "@/lib/markdown";

export function NotesWidget() {
  const notes = useNoteStore((s) => s.notes);
  const createNote = useNoteStore((s) => s.createNote);
  const updateNote = useNoteStore((s) => s.updateNote);
  const openPanel = useUIStore((s) => s.openPanel);

  const [draft, setDraft] = useState("");

  const visible = useMemo(
    () =>
      notes
        .filter((n) => !n.archived)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
        .slice(0, 4),
    [notes]
  );

  const quickSave = () => {
    const content = draft.trim();
    if (!content) return;
    createNote({ content });
    setDraft("");
  };

  return (
    <WidgetCard
      title="Quick notes"
      icon={<NotebookPen className="h-4 w-4" />}
      actions={
        <button
          className="press flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-c transition-colors hover:text-[var(--text)]"
          onClick={() => openPanel("notes")}
          aria-label="Open notes"
        >
          All <ChevronRight className="h-3.5 w-3.5" />
        </button>
      }
    >
      <div className="mb-2.5 flex items-start gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) quickSave();
          }}
          placeholder={`Capture a thought… (${modKeyLabel()}↵ to save)`}
          aria-label="Quick note input"
          rows={2}
          className="min-h-[52px] flex-1 resize-none rounded-lg border hairline bg-transparent px-3 py-2 text-sm outline-none transition-all placeholder:text-muted-c hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] focus:bg-[color-mix(in_srgb,var(--text)_3%,transparent)]"
        />
        <button
          className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--accent-fg)] disabled:opacity-40"
          style={{ background: "var(--accent)" }}
          onClick={quickSave}
          disabled={!draft.trim()}
          aria-label="Save note"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-c">
          Notes land here the moment you write them. Markdown supported.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((n) => (
            <li key={n.id}>
              <button
                className="w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                onClick={() => openPanel("notes")}
                aria-label={`Open note: ${n.title || stripMarkdown(n.content).slice(0, 40)}`}
              >
                <span className="flex items-center gap-1.5">
                  {n.pinned && <Pin className="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {n.title || stripMarkdown(n.content).slice(0, 48) || "Untitled"}
                  </span>
                </span>
                {n.content && (
                  <span className="mt-0.5 block truncate text-xs text-muted-c">
                    {stripMarkdown(n.content).slice(0, 60)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
