"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { WidgetCard } from "../widget-card";
import { useStudyStore, chapterStats } from "@/lib/store/study-store";
import { useUIStore } from "@/lib/store/ui-store";
import { todayKey } from "@/lib/utils";
import { FileQuestion, Plus, ChevronRight } from "lucide-react";

export function PyqWidget() {
  const pyq = useStudyStore((s) => s.pyq);
  const subjects = useStudyStore((s) => s.subjects);
  const chapters = useStudyStore((s) => s.chapters);
  const addPyq = useStudyStore((s) => s.addPyq);
  const openPanel = useUIStore((s) => s.openPanel);

  const [subjectId, setSubjectId] = useState<string>("");
  const [count, setCount] = useState("10");
  const [correct, setCorrect] = useState("7");

  const stats = useMemo(() => {
    const today = todayKey();
    const todayRows = pyq.filter((p) => p.date === today);
    const attempted = pyq.reduce((m, p) => m + p.attempted, 0);
    const correctTotal = pyq.reduce((m, p) => m + p.correct, 0);
    const week = pyq.filter((p) => p.date >= format(new Date(Date.now() - 6 * 86400_000), "yyyy-MM-dd"));
    return {
      todayAttempted: todayRows.reduce((m, p) => m + p.attempted, 0),
      todayCorrect: todayRows.reduce((m, p) => m + p.correct, 0),
      attempted,
      accuracy: attempted ? Math.round((correctTotal / attempted) * 100) : 0,
      weekAttempted: week.reduce((m, p) => m + p.attempted, 0),
    };
  }, [pyq]);

  const quickLog = () => {
    const att = Math.max(0, parseInt(count, 10) || 0);
    const cor = Math.min(att, Math.max(0, parseInt(correct, 10) || 0));
    if (att <= 0 || !subjectId) return;
    addPyq({
      date: todayKey(),
      subjectId,
      difficulty: "medium",
      attempted: att,
      correct: cor,
      skipped: 0,
      revision: "none",
    });
    setCount("10");
    setCorrect("7");
  };

  const activeSubjects = subjects.filter((s) => !s.archived);

  return (
    <WidgetCard
      title="PYQ practice"
      icon={<FileQuestion className="h-4 w-4" />}
      actions={
        <button
          className="press flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-c transition-colors hover:text-[var(--text)]"
          onClick={() => openPanel("study")}
          aria-label="Open PYQ tracker"
        >
          Tracker <ChevronRight className="h-3.5 w-3.5" />
        </button>
      }
    >
      {activeSubjects.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          <Stat label="Today" value={`${stats.todayAttempted}`} sub={`${stats.todayCorrect} correct`} />
          <Stat label="This week" value={`${stats.weekAttempted}`} sub="questions" />
          <Stat label="All-time" value={`${stats.attempted}`} sub={stats.attempted ? `${stats.accuracy}% acc` : "—"} />
        </div>
      )}

      {/* quick log */}
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          aria-label="Subject"
          className="h-9 min-w-0 flex-1 appearance-none rounded-lg border hairline bg-[var(--card-solid)] px-2.5 text-sm outline-none"
        >
          <option value="">Subject…</option>
          {activeSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          value={count}
          onChange={(e) => setCount(e.target.value)}
          inputMode="numeric"
          aria-label="Questions attempted"
          className="h-9 w-16 shrink-0 rounded-lg border hairline bg-transparent px-2 text-center text-sm tabular-nums outline-none"
          placeholder="att"
        />
        <span className="text-xs text-muted-c">/</span>
        <input
          value={correct}
          onChange={(e) => setCorrect(e.target.value)}
          inputMode="numeric"
          aria-label="Correct answers"
          className="h-9 w-16 shrink-0 rounded-lg border hairline bg-transparent px-2 text-center text-sm tabular-nums outline-none"
          placeholder="cor"
        />
        <button
          className="press flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-[var(--accent-fg)] disabled:opacity-40"
          style={{ background: "var(--accent)" }}
          onClick={quickLog}
          disabled={!subjectId || parseInt(count, 10) <= 0}
        >
          <Plus className="h-3.5 w-3.5" /> Log
        </button>
      </div>

      {pyq.length === 0 && (
        <p className="mt-2.5 text-center text-xs text-muted-c">
          Log questions as you practice — accuracy builds per chapter automatically.
        </p>
      )}

      {/* recent chapter accuracies */}
      {pyq.length > 0 && (
        <div className="mt-3 space-y-1">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-c">Chapter accuracy</h4>
          {chapters
            .map((c) => ({ c, stats: chapterStats(c.id, pyq) }))
            .filter(({ stats }) => stats.attempted > 0)
            .sort((a, b) => b.stats.attempted - a.stats.attempted)
            .slice(0, 4)
            .map(({ c, stats }) => {
              const subject = subjects.find((s) => s.id === c.subjectId);
              return (
                <div key={c.id} className="flex items-center gap-2 text-xs">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: subject?.color }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-c">{stats.attempted}q</span>
                  <span
                    className="w-9 shrink-0 text-right font-semibold tabular-nums"
                    style={{ color: stats.accuracy >= 70 ? "var(--positive)" : stats.accuracy >= 50 ? "var(--warning)" : "var(--negative)" }}
                  >
                    {stats.accuracy}%
                  </span>
                </div>
              );
            })}
        </div>
      )}
    </WidgetCard>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "color-mix(in srgb, var(--text) 5%, transparent)" }}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-c">{label}</div>
      <div className="text-lg font-semibold tabular-nums leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-muted-c">{sub}</div>}
    </div>
  );
}
