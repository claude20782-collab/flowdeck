"use client";

import { format } from "date-fns";
import { WidgetCard } from "../widget-card";
import { useNow } from "@/hooks/use-app";
import { useSettingsStore } from "@/lib/store/settings-store";
import { useSessionStore } from "@/lib/store/session-store";
import { todayKey, fmtMinutes } from "@/lib/utils";

function greetingForHour(h: number): string {
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

export function GreetingWidget() {
  const now = useNow(30_000);
  const name = useSettingsStore((s) => s.name);
  const sessions = useSessionStore((s) => s.sessions);

  const date = new Date(now);
  const today = todayKey();
  const todayMinutes = Math.round(
    sessions
      .filter((s) => format(new Date(s.startedAt), "yyyy-MM-dd") === today)
      .reduce((m, s) => m + s.durationMs, 0) / 60000
  );

  return (
    <WidgetCard>
      <div className="flex flex-wrap items-end justify-between gap-3 py-1">
        <div>
          <div className="text-xl font-semibold tracking-tight sm:text-2xl">
            {greetingForHour(date.getHours())}
            {name ? `, ${name}` : ""}
          </div>
          <div className="mt-1 text-sm text-muted-c">
            {format(date, "EEEE, d MMMM")}
            {todayMinutes > 0 && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="text-accent">{fmtMinutes(todayMinutes)}</span> focused today
              </>
            )}
          </div>
        </div>
        <div
          className="rounded-full border hairline px-3 py-1.5 text-xs font-medium text-muted-c"
          aria-hidden="true"
        >
          {format(date, "HH:mm")}
        </div>
      </div>
    </WidgetCard>
  );
}
