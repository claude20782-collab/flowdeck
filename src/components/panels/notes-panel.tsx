"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistance } from "date-fns";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronLeft,
  Eye,
  NotebookPen,
  PenLine,
  Pin,
  Plus,
  Search,
  Trash2,
  X,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PanelActionButton, PanelEmptyState, PanelShell } from "./panel-shell";
import { useNoteStore } from "@/lib/store/note-store";
import type { Note } from "@/lib/types";
import { renderMarkdown, stripMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

/* ═══════════════════════════ helpers ═══════════════════════════ */

/** "2 hours ago" → "2h ago" — compact relative time on top of date-fns. */
function timeAgo(ts: number): string {
  let out = formatDistance(new Date(ts), new Date(), { addSuffix: true });
  const rules: Array<[RegExp, string]> = [
    [/^less than a minute ago$/, "just now"],
    [/ seconds? ago$/, "s ago"],
    [/ minutes? ago$/, "m ago"],
    [/ hours? ago$/, "h ago"],
    [/ days? ago$/, "d ago"],
    [/ weeks? ago$/, "w ago"],
    [/ months? ago$/, "mo ago"],
    [/ years? ago$/, "y ago"],
    [/^about /, "~"],
  ];
  for (const [re, rep] of rules) out = out.replace(re, rep);
  return out;
}

function noteTitle(n: Note): string {
  return n.title.trim() || stripMarkdown(n.content).slice(0, 48) || "Untitled";
}

/** Desktop (md+) layout switch — the panel itself is client-only. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(query).matches
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/* ═══════════════════════════ list pieces ═══════════════════════════ */

function NoteListItem({
  note,
  selected,
  onSelect,
}: {
  note: Note;
  selected: boolean;
  onSelect: () => void;
}) {
  const title = noteTitle(note);
  const preview = stripMarkdown(note.content).slice(0, 64);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      aria-label={`Open note: ${title}`}
      className={cn(
        "press w-full rounded-lg px-3 py-2.5 text-left transition-colors",
        !selected && "hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
      )}
      style={
        selected
          ? {
              background: "color-mix(in srgb, var(--text) 6%, transparent)",
              boxShadow: "inset 2px 0 0 var(--accent)",
            }
          : undefined
      }
    >
      <span className="flex items-center gap-1.5">
        {note.pinned && <Pin className="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />}
        {note.archived && <Archive className="h-3 w-3 shrink-0 text-muted-c" aria-hidden="true" />}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-c">{timeAgo(note.updatedAt)}</span>
      </span>
      {preview && <span className="mt-0.5 block truncate text-xs text-muted-c">{preview}</span>}
      {note.tags.length > 0 && (
        <span className="mt-1.5 flex flex-wrap items-center gap-1">
          {note.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="rounded-full px-1.5 py-0.5 text-[10px] text-muted-c"
              style={{ background: "color-mix(in srgb, var(--text) 6%, transparent)" }}
            >
              #{t}
            </span>
          ))}
          {note.tags.length > 3 && (
            <span className="text-[10px] text-muted-c">+{note.tags.length - 3}</span>
          )}
        </span>
      )}
    </button>
  );
}

function FilterBar({
  tags,
  activeTag,
  onToggleTag,
  showArchived,
  onToggleArchived,
}: {
  tags: string[];
  activeTag: string | null;
  onToggleTag: (t: string) => void;
  showArchived: boolean;
  onToggleArchived: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => {
        const active = activeTag === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onToggleTag(t)}
            aria-pressed={active}
            aria-label={`Filter by tag ${t}`}
            className={cn(
              "press rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              active ? "" : "text-muted-c hover:text-[var(--text)]"
            )}
            style={
              active
                ? { background: "var(--accent)", color: "var(--accent-fg)" }
                : { background: "color-mix(in srgb, var(--text) 6%, transparent)" }
            }
          >
            #{t}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onToggleArchived}
        aria-pressed={showArchived}
        aria-label="Include archived notes"
        className={cn(
          "press flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
          showArchived ? "" : "text-muted-c hover:text-[var(--text)]"
        )}
        style={
          showArchived
            ? {
                background: "color-mix(in srgb, var(--warning) 18%, transparent)",
                color: "var(--warning)",
              }
            : { background: "color-mix(in srgb, var(--text) 6%, transparent)" }
        }
      >
        <Archive className="h-3 w-3" aria-hidden="true" />
        Archived
      </button>
    </div>
  );
}

/* ═══════════════════════════ editor ═══════════════════════════ */

/**
 * Note editor with 400 ms debounced autosave. Lives for exactly one note
 * (the parent keys it by note id), so switching notes / closing the editor
 * flushes unsaved edits synchronously on unmount.
 */
function NoteEditor({
  note,
  showBack = false,
  onExit,
}: {
  note: Note;
  showBack?: boolean;
  onExit: () => void;
}) {
  const updateNote = useNoteStore((s) => s.updateNote);
  const togglePin = useNoteStore((s) => s.togglePin);
  const archiveNote = useNoteStore((s) => s.archiveNote);
  const deleteNote = useNoteStore((s) => s.deleteNote);

  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [tagInput, setTagInput] = useState("");
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [savedTick, setSavedTick] = useState(0);

  const dirty = useRef(false);
  const latest = useRef({ title, content });

  useEffect(() => {
    latest.current = { title, content };
  });

  /* Debounced autosave — persists 400 ms after the last keystroke. */
  useEffect(() => {
    if (title === note.title && content === note.content) return;
    dirty.current = true;
    const t = setTimeout(() => {
      updateNote(note.id, { title, content });
      dirty.current = false;
      setSavedTick((n) => n + 1);
    }, 400);
    return () => clearTimeout(t);
  }, [title, content, note, updateNote]);

  /* Flush unsaved edits the moment this editor goes away (switch/unmount). */
  useEffect(
    () => () => {
      if (!dirty.current) return;
      const { title: t, content: c } = latest.current;
      updateNote(note.id, { title: t, content: c });
    },
    [note.id, note.title, note.content, updateNote]
  );

  /* Auto-hide the "Saved" flash. */
  useEffect(() => {
    if (savedTick === 0) return;
    const t = setTimeout(() => setSavedTick(0), 1800);
    return () => clearTimeout(t);
  }, [savedTick]);

  const saveNow = useCallback(() => {
    const { title: t, content: c } = latest.current;
    if (t !== note.title || c !== note.content) {
      updateNote(note.id, { title: t, content: c });
      dirty.current = false;
      setSavedTick((n) => n + 1);
    }
    toast.success("Note saved");
  }, [note.id, note.title, note.content, updateNote]);

  const onEditorKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      saveNow();
    }
  };

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, "").slice(0, 24);
    if (!t) return;
    if (note.tags.length >= 8) {
      toast.error("A note can have at most 8 tags");
      return;
    }
    if (note.tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setTagInput("");
      return;
    }
    updateNote(note.id, { tags: [...note.tags, t] });
    setTagInput("");
  };

  const removeTag = (t: string) => updateNote(note.id, { tags: note.tags.filter((x) => x !== t) });

  const handleDelete = () => {
    deleteNote(note.id);
    toast.success("Note deleted");
    onExit();
  };

  const html = useMemo(() => renderMarkdown(content), [content]);
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* toolbar */}
      <div className="mb-2 flex items-center gap-1.5">
        {showBack && (
          <button
            type="button"
            onClick={onExit}
            aria-label="Back to notes"
            className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-c transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-[var(--text)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {/* Write / Preview toggle */}
        <div
          className="flex items-center rounded-lg p-0.5"
          style={{ background: "color-mix(in srgb, var(--text) 7%, transparent)" }}
          role="tablist"
          aria-label="Note editor mode"
        >
          {(["write", "preview"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "press flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                mode === m ? "" : "text-muted-c"
              )}
              style={mode === m ? { background: "var(--card-solid)" } : undefined}
            >
              {m === "write" ? (
                <PenLine className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Eye className="h-3 w-3" aria-hidden="true" />
              )}
              {m === "write" ? "Write" : "Preview"}
            </button>
          ))}
        </div>

        <span className="min-w-0 flex-1" />

        {savedTick > 0 && (
          <span
            key={savedTick}
            aria-live="polite"
            className="fd-fade flex shrink-0 items-center gap-1 text-[11px] text-muted-c"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Saved
          </span>
        )}

        <button
          type="button"
          onClick={() => togglePin(note.id)}
          aria-pressed={note.pinned}
          aria-label={note.pinned ? "Unpin note" : "Pin note"}
          className={cn(
            "press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]",
            note.pinned ? "text-accent" : "text-muted-c hover:text-[var(--text)]"
          )}
        >
          <Pin className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => {
            archiveNote(note.id, !note.archived);
            toast.success(note.archived ? "Note restored from archive" : "Note moved to archive");
          }}
          aria-pressed={note.archived}
          aria-label={note.archived ? "Restore note from archive" : "Archive note"}
          className={cn(
            "press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]",
            note.archived ? "" : "text-muted-c hover:text-[var(--text)]"
          )}
          style={note.archived ? { color: "var(--warning)" } : undefined}
        >
          {note.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
        </button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              aria-label="Delete note"
              className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-c transition-colors hover:bg-[color-mix(in_srgb,var(--negative)_12%,transparent)] hover:text-[var(--negative)]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this note?</AlertDialogTitle>
              <AlertDialogDescription>
                “{title.trim() || "Untitled"}” will be removed from this device. This can’t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                style={{
                  background: "color-mix(in srgb, var(--negative) 15%, transparent)",
                  color: "var(--negative)",
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* title */}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onEditorKeyDown}
        placeholder="Untitled"
        aria-label="Note title"
        className="w-full bg-transparent text-lg font-semibold outline-none placeholder:text-muted-c"
      />

      {/* tags */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {note.tags.map((t) => (
          <span
            key={t}
            className="flex items-center gap-0.5 rounded-full py-0.5 pl-2 pr-1 text-[11px]"
            style={{
              background: "color-mix(in srgb, var(--accent) 12%, transparent)",
              color: "var(--accent)",
            }}
          >
            #{t}
            <button
              type="button"
              onClick={() => removeTag(t)}
              aria-label={`Remove tag ${t}`}
              className="press flex h-4 w-4 items-center justify-center rounded-full text-muted-c transition-colors hover:text-[var(--negative)]"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder="+ tag"
          aria-label="Add tag"
          className="h-7 w-24 min-w-0 rounded-full border hairline bg-transparent px-2.5 text-[11px] outline-none transition-colors placeholder:text-muted-c focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
        />
      </div>

      {/* meta */}
      <p className="mt-1.5 text-[10px] tabular-nums text-muted-c">
        Edited {timeAgo(note.updatedAt)} · {words} {words === 1 ? "word" : "words"}
      </p>

      {/* body */}
      {mode === "write" ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={onEditorKeyDown}
          placeholder="Start writing… markdown supported (⌘↵ to save)"
          aria-label="Note content"
          className="mt-2 min-h-[50vh] w-full flex-1 resize-none rounded-lg border hairline bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-c focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] md:min-h-0"
        />
      ) : (
        <div
          className="fd-scroll mt-2 min-h-[50vh] flex-1 overflow-y-auto rounded-lg border hairline px-3 py-2.5 text-sm leading-relaxed md:min-h-0"
          aria-label="Rendered note preview"
        >
          {html ? (
            <div dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="text-muted-c">Nothing to preview yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════ panel ═══════════════════════════ */

export function NotesPanel() {
  const notes = useNoteStore((s) => s.notes);
  const createNote = useNoteStore((s) => s.createNote);

  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isDesktop = useMediaQuery("(min-width: 768px)");

  const activeCount = notes.filter((n) => !n.archived).length;

  const scopedTags = useMemo(() => {
    const s = new Set<string>();
    for (const n of notes) {
      if (showArchived || !n.archived) for (const t of n.tags) s.add(t);
    }
    return [...s].sort();
  }, [notes, showArchived]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const terms = q ? q.split(/\s+/).filter(Boolean) : [];
    return notes
      .filter((n) => showArchived || !n.archived)
      .filter((n) => !activeTag || n.tags.includes(activeTag))
      .filter(
        (n) =>
          terms.length === 0 ||
          terms.every((t) =>
            `${n.title} ${n.content} ${n.tags.join(" ")}`.toLowerCase().includes(t)
          )
      )
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  }, [notes, query, activeTag, showArchived]);

  const selected = selectedId ? (notes.find((n) => n.id === selectedId) ?? null) : null;

  const handleCreate = () => {
    const n = createNote({});
    setSelectedId(n.id);
  };

  const clearFilters = () => {
    setQuery("");
    setActiveTag(null);
    setShowArchived(false);
  };

  const hasFilters = query.trim() !== "" || activeTag !== null || showArchived;

  const headerActions = (
    <>
      <span className="relative block min-w-[92px] grow sm:grow-0 sm:w-56">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-c"
          aria-hidden="true"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes"
          aria-label="Search notes"
          className="h-9 w-full min-w-0 rounded-lg border hairline bg-transparent pl-7 pr-7 text-sm outline-none transition-colors placeholder:text-muted-c focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="press absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-c transition-colors hover:text-[var(--text)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
      <PanelActionButton onClick={handleCreate} label="New note">
        <Plus className="h-4 w-4" />
        <span className="hidden min-[420px]:inline">New note</span>
      </PanelActionButton>
    </>
  );

  const emptyBlock =
    notes.length === 0 ? (
      <PanelEmptyState
        icon={<NotebookPen className="h-5 w-5 text-muted-c" />}
        title="No notes yet"
        hint="Fast capture with markdown — your notes stay on this device."
        action={
          <PanelActionButton onClick={handleCreate}>
            <Plus className="h-4 w-4" />
            Create first note
          </PanelActionButton>
        }
      />
    ) : filtered.length === 0 ? (
      <PanelEmptyState
        icon={<Search className="h-5 w-5 text-muted-c" />}
        title={
          query.trim()
            ? `No notes match “${query.trim()}”`
            : activeTag
              ? `No notes tagged “${activeTag}”`
              : showArchived
                ? "No archived notes"
                : "No notes here"
        }
        hint={hasFilters ? "Try clearing the search or filters." : undefined}
        action={
          hasFilters ? (
            <PanelActionButton variant="ghost" onClick={clearFilters}>
              Clear filters
            </PanelActionButton>
          ) : undefined
        }
      />
    ) : null;

  const listItems = filtered.map((n) => (
    <li key={n.id}>
      <NoteListItem note={n} selected={n.id === selectedId} onSelect={() => setSelectedId(n.id)} />
    </li>
  ));

  const filterBar = (
    <FilterBar
      tags={scopedTags}
      activeTag={activeTag}
      onToggleTag={(t) => setActiveTag((cur) => (cur === t ? null : t))}
      showArchived={showArchived}
      onToggleArchived={() => setShowArchived((v) => !v)}
    />
  );

  return (
    <PanelShell
      title="Notes"
      subtitle={`${activeCount} ${activeCount === 1 ? "note" : "notes"}`}
      icon={<NotebookPen className="h-4 w-4" />}
      actions={headerActions}
    >
      {isDesktop ? (
        /* ── desktop: master–detail ── */
        <div className="flex h-[calc(100dvh-208px)] min-h-[420px]">
          <aside className="flex min-w-0 max-w-xs flex-1 flex-col pr-4">
            {filterBar}
            <div className="fd-scroll mt-3 min-h-0 flex-1">
              {emptyBlock ?? <ul className="space-y-1" aria-label="Notes list">{listItems}</ul>}
            </div>
          </aside>
          <section className="flex min-w-0 flex-1 flex-col border-l hairline pl-4">
            {selected ? (
              <NoteEditor key={selected.id} note={selected} onExit={() => setSelectedId(null)} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center">
                <PanelEmptyState
                  icon={<NotebookPen className="h-5 w-5 text-muted-c" />}
                  title="No note selected"
                  hint="Pick a note from the list, or create a new one."
                  action={
                    <PanelActionButton onClick={handleCreate}>
                      <Plus className="h-4 w-4" />
                      New note
                    </PanelActionButton>
                  }
                />
              </div>
            )}
          </section>
        </div>
      ) : (
        /* ── mobile: list view, editor slides in over it ── */
        <AnimatePresence initial={false} mode="wait">
          {selected ? (
            <motion.div
              key="note-editor"
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 32 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <NoteEditor key={selected.id} note={selected} showBack onExit={() => setSelectedId(null)} />
            </motion.div>
          ) : (
            <motion.div
              key="note-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              {filterBar}
              {emptyBlock ?? (
                <ul className="fd-scroll mt-3 max-h-[60vh] space-y-1" aria-label="Notes list">
                  {listItems}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </PanelShell>
  );
}
