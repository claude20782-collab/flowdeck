"use client";

import { format, getISOWeek } from "date-fns";
import { WidgetCard } from "../widget-card";
import { useNow } from "@/hooks/use-app";
import { useSettingsStore } from "@/lib/store/settings-store";
import type { WidgetComponentProps } from "../widget-registry";

export function ClockWidget({ config }: WidgetComponentProps) {
  const now = useNow(1000);
  const clock24h = useSettingsStore((s) => s.clock24h);
  const showSeconds = useSettingsStore((s) => s.showSeconds);
  const showDate = useSettingsStore((s) => s.showDate);
  const compact = useSettingsStore((s) => s.compactWidgets);

  const variant = (config.variant as string) ?? "default";
  const hero = variant === "hero";

  const date = new Date(now);
  const timeStr = format(date, clock24h ? "HH:mm" : "h:mm");
  const ampm = clock24h ? "" : format(date, "a");
  const seconds = showSeconds ? format(date, clock24h ? ":ss" : ":ss") : "";
  const week = getISOWeek(date);

  return (
    <WidgetCard>
      <div className={`flex flex-col items-center justify-center ${hero ? "py-10 sm:py-14" : "py-6 sm:py-8"}`}>
        <div
          className="display-time flex items-baseline justify-center text-[var(--text)]"
          style={{ fontSize: hero ? "clamp(3.4rem, 11vw, 7.5rem)" : "clamp(2.2rem, 7vw, 3.8rem)" }}
          role="timer"
          aria-label={`Current time ${timeStr}${seconds} ${ampm}`}
        >
          <span>{timeStr}</span>
          {showSeconds && (
            <span className="text-muted-c" style={{ fontSize: "0.45em" }}>
              {seconds}
            </span>
          )}
          {!clock24h && (
            <span className="ml-2 text-muted-c" style={{ fontSize: "0.3em", fontWeight: 500 }}>
              {ampm}
            </span>
          )}
        </div>
        {showDate && (
          <div className="mt-2 flex items-center gap-2 text-muted-c" style={{ fontSize: hero ? 15 : 13 }}>
            <span className="font-medium text-[var(--text)]">{format(date, "EEEE")}</span>
            <span aria-hidden="true">·</span>
            <span>{format(date, "d MMMM yyyy")}</span>
            {!compact && (
              <>
                <span aria-hidden="true">·</span>
                <span className="rounded-full border hairline px-2 py-0.5 text-[11px]">Week {week}</span>
              </>
            )}
          </div>
        )}
      </div>
    </WidgetCard>
  );
}
