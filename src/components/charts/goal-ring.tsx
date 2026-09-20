"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

/**
 * Daily focus goal ring — SVG progress arc showing today's focus minutes
 * against the user's daily goal. Pure presentational; data comes from props.
 */
export function GoalRing({
  minutes,
  goalMin,
  size = 84,
  stroke = 7,
  showLabel = true,
  label = "Daily focus goal",
  className,
}: {
  minutes: number;
  goalMin: number;
  size?: number;
  stroke?: number;
  showLabel?: boolean;
  label?: string;
  className?: string;
}) {
  const pct = goalMin > 0 ? Math.min(1.999, minutes / goalMin) : 0;
  const done = goalMin > 0 && minutes >= goalMin;

  const { arc, overArc } = useMemo(() => {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const clamped = Math.min(1, pct);
    const over = pct > 1 ? Math.min(1, pct - 1) : 0;
    return { arc: c * clamped, overArc: c * over, r };
  }, [pct, size, stroke]);

  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;

  const fmt = (m: number) => {
    const rounded = Math.round(m);
    if (rounded >= 90) {
      const h = Math.floor(rounded / 60);
      const min = rounded % 60;
      return min === 0 ? `${h}h` : `${h}h ${min}m`;
    }
    return `${rounded}m`;
  };

  return (
    <div
      className={`relative flex flex-col items-center justify-center ${className ?? ""}`}
      role="progressbar"
      aria-valuenow={Math.round(minutes)}
      aria-valuemin={0}
      aria-valuemax={goalMin}
      aria-label={`${label}: ${fmt(minutes)} of ${fmt(goalMin)}`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="color-mix(in srgb, var(--text) 10%, transparent)"
          strokeWidth={stroke}
        />
        {pct > 0 && (
          <motion.circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={done ? "var(--positive)" : "var(--accent)"}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${arc} ${2 * Math.PI * r - arc}`}
            initial={false}
            animate={{ strokeDasharray: `${arc} ${2 * Math.PI * r - arc}` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{
              filter: `drop-shadow(0 0 6px color-mix(in srgb, ${done ? "var(--positive)" : "var(--accent)"} 45%, transparent))`,
            }}
          />
        )}
        {overArc > 0 && (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--positive)"
            strokeWidth={stroke / 2.2}
            strokeLinecap="round"
            strokeDasharray={`${overArc} ${2 * Math.PI * r - overArc}`}
            opacity={0.85}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {done ? (
          <Check className="h-5 w-5" style={{ color: "var(--positive)" }} strokeWidth={3} aria-hidden="true" />
        ) : showLabel ? (
          <>
            <span className="text-sm font-bold leading-none tabular-nums">{fmt(minutes)}</span>
            <span className="mt-0.5 text-[9px] font-medium text-muted-c">of {fmt(goalMin)}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Compact horizontal goal bar for widget footers. */
export function GoalBar({
  minutes,
  goalMin,
  label = "Daily focus goal",
  className,
}: {
  minutes: number;
  goalMin: number;
  label?: string;
  className?: string;
}) {
  const pct = goalMin > 0 ? Math.min(100, (minutes / goalMin) * 100) : 0;
  const done = goalMin > 0 && minutes >= goalMin;
  const fmt = (m: number) => {
    const rounded = Math.round(m);
    if (rounded >= 90) {
      const h = Math.floor(rounded / 60);
      const min = rounded % 60;
      return min === 0 ? `${h}h` : `${h}h ${min}m`;
    }
    return `${rounded}m`;
  };
  if (goalMin <= 0) return null;
  return (
    <div
      className={`flex items-center gap-2 ${className ?? ""}`}
      title={`${label} — ${fmt(minutes)} of ${fmt(goalMin)}`}
      role="progressbar"
      aria-valuenow={Math.round(minutes)}
      aria-valuemin={0}
      aria-valuemax={goalMin}
      aria-label={`${label}: ${fmt(minutes)} of ${fmt(goalMin)}`}
    >
      <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--text) 10%, transparent)" }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: done ? "var(--positive)" : "var(--accent)" }}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <span
        className="shrink-0 text-[10px] font-semibold tabular-nums"
        style={{ color: done ? "var(--positive)" : "var(--text-muted)" }}
      >
        {done ? "goal ✓" : `${fmt(minutes)} / ${fmt(goalMin)}`}
      </span>
    </div>
  );
}
