"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { WidgetCard } from "../widget-card";
import { useStudyStore } from "@/lib/store/study-store";
import { useUIStore } from "@/lib/store/ui-store";
import { ClipboardList, ChevronRight, TrendingUp } from "lucide-react";
import { LineChart } from "@/components/charts/primitives";

export function MockWidget() {
  const mocks = useStudyStore((s) => s.mocks);
  const openPanel = useUIStore((s) => s.openPanel);

  const sorted = useMemo(() => [...mocks].sort((a, b) => a.date.localeCompare(b.date)), [mocks]);
  const recent = [...sorted].reverse().slice(0, 3);
  const trend = sorted.slice(-12).map((m) => ({
    label: format(parseISO(m.date + "T12:00"), "d MMM"),
    value: m.total ?? 0,
  }));

  const best = sorted.reduce((m, x) => Math.max(m, x.total ?? 0), 0);

  return (
    <WidgetCard
      title="Mock tests"
      icon={<ClipboardList className="h-4 w-4" />}
      actions={
        <button
          className="press flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-c transition-colors hover:text-[var(--text)]"
          onClick={() => openPanel("study")}
          aria-label="Open mock test tracker"
        >
          Log <ChevronRight className="h-3.5 w-3.5" />
        </button>
      }
    >
      {mocks.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-5 text-center">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: "color-mix(in srgb, var(--text) 6%, transparent)" }}
            aria-hidden="true"
          >
            <ClipboardList className="h-4 w-4 text-muted-c" />
          </div>
          <p className="text-sm font-medium">No mock tests logged</p>
          <p className="max-w-[230px] text-xs text-muted-c">
            Log full-length mocks with subject-wise marks to track score trends over time.
          </p>
        </div>
      ) : (
        <>
          {trend.length >= 2 && (
            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between">
                <h4 className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-c">
                  <TrendingUp className="h-3 w-3" aria-hidden="true" /> Score trend
                </h4>
                <span className="text-[10px] text-muted-c">best {best}{sorted[sorted.length - 1]?.maxTotal ? `/${sorted[sorted.length - 1].maxTotal}` : ""}</span>
              </div>
              <LineChart data={trend} height={80} />
            </div>
          )}
          <ul className="space-y-1">
            {recent.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.examName}</div>
                  <div className="text-[10px] text-muted-c">
                    {format(parseISO(m.date + "T12:00"), "d MMM yyyy")}
                    {m.physics != null && ` · P ${m.physics}`}
                    {m.chemistry != null && ` · C ${m.chemistry}`}
                    {m.maths != null && ` · M ${m.maths}`}
                    {m.percentile != null && ` · ${m.percentile}%ile`}
                  </div>
                </div>
                <span className="shrink-0 text-base font-bold tabular-nums text-accent">
                  {m.total ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </WidgetCard>
  );
}
