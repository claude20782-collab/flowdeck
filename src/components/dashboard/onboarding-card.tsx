"use client";

import { useState } from "react";
import { useSettingsStore } from "@/lib/store/settings-store";
import { useTaskStore } from "@/lib/store/task-store";
import { useSessionStore } from "@/lib/store/session-store";
import { useUIStore } from "@/lib/store/ui-store";
import { useTimerStore } from "@/lib/store/timer-store";
import { isTouchDevice, modKeyLabel } from "@/lib/utils";
import { Sparkles, X, Check, Palette, Timer, UserRound, Keyboard, Command } from "lucide-react";

/** Platform detection with lazy init — safe: OnboardingCard only renders
 *  client-side after BootGate (all stores hydrated). */
function usePlatform() {
  const [platform] = useState<{ touch: boolean; mac: boolean }>(() => ({
    touch: isTouchDevice(),
    mac: modKeyLabel() === "⌘",
  }));
  return platform;
}

/**
 * First-run onboarding card. Shows only on genuinely fresh installs
 * (no name, no tasks, no sessions) until dismissed or completed.
 */
export function OnboardingCard() {
  const dismissed = useSettingsStore((s) => s.onboardingDismissed);
  const name = useSettingsStore((s) => s.name);
  const update = useSettingsStore((s) => s.update);
  const tasks = useTaskStore((s) => s.tasks);
  const sessions = useSessionStore((s) => s.sessions);
  const openPanel = useUIStore((s) => s.openPanel);
  const startTimer = useTimerStore((s) => s.start);

  const [nameDraft, setNameDraft] = useState("");
  const { touch: isTouch, mac: isMac } = usePlatform();

  const isFresh = tasks.length === 0 && sessions.length === 0;
  if (dismissed || !isFresh) return null;

  const hasName = name.trim().length > 0;
  const hasActivity = tasks.length > 0 || sessions.length > 0;
  const stepsDone = [hasName, hasActivity].filter(Boolean).length;

  const saveName = () => {
    const v = nameDraft.trim();
    if (v) update({ name: v.slice(0, 24) });
  };

  return (
    <section className="widget fd-rise relative overflow-hidden mb-4" aria-label="Getting started">
      {/* accent edge */}
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-2))" }}
        aria-hidden="true"
      />
      <button
        className="press absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-muted-c transition-colors hover:text-[var(--text)]"
        onClick={() => update({ onboardingDismissed: true })}
        aria-label="Dismiss getting started"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex flex-col gap-4 px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              boxShadow: "0 4px 18px color-mix(in srgb, var(--accent) 35%, transparent)",
            }}
            aria-hidden="true"
          >
            <Sparkles className="h-5 w-5" style={{ color: "var(--accent-fg)" }} />
          </span>
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight">Welcome to Flowdeck</h3>
            <p className="text-xs text-muted-c">
              Your local-first productivity OS — everything stays on this device. {stepsDone}/2 set up.
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {/* step 1: name */}
          <div
            className="rounded-xl p-3.5"
            style={{
              background: hasName
                ? "color-mix(in srgb, var(--positive) 10%, transparent)"
                : "color-mix(in srgb, var(--text) 5%, transparent)",
            }}
          >
            <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold">
              {hasName ? (
                <Check className="h-3.5 w-3.5" style={{ color: "var(--positive)" }} aria-hidden="true" />
              ) : (
                <UserRound className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              )}
              {hasName ? `Hi, ${name}` : "1 · What should we call you?"}
            </div>
            {!hasName && (
              <div className="flex gap-1.5">
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveName()}
                  placeholder="Your name"
                  aria-label="Your name"
                  maxLength={24}
                  className="h-8 min-w-0 flex-1 rounded-lg border hairline px-2.5 text-sm outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] placeholder:text-muted-c"
                  style={{ background: "color-mix(in srgb, var(--text) 4%, transparent)" }}
                />
                <button
                  className="press h-8 shrink-0 rounded-lg px-3 text-xs font-semibold text-[var(--accent-fg)] disabled:opacity-40"
                  style={{ background: "var(--accent)" }}
                  onClick={saveName}
                  disabled={!nameDraft.trim()}
                >
                  Save
                </button>
              </div>
            )}
          </div>

          {/* step 2: theme */}
          <button
            className="press rounded-xl p-3.5 text-left"
            style={{ background: "color-mix(in srgb, var(--text) 5%, transparent)" }}
            onClick={() => openPanel("themes")}
          >
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold">
              <Palette className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              Make it yours
            </div>
            <p className="text-[11px] leading-snug text-muted-c">
              28 themes, ambient animations, soundscape — open the theme studio.
            </p>
          </button>

          {/* step 3: first session */}
          <button
            className="press rounded-xl p-3.5 text-left"
            style={{ background: "color-mix(in srgb, var(--text) 5%, transparent)" }}
            onClick={() => startTimer("pomodoro")}
          >
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold">
              <Timer className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              Run your first focus
            </div>
            <p className="text-[11px] leading-snug text-muted-c">
              One 25-minute pomodoro is all it takes to start the streak.
            </p>
          </button>
        </div>

        {isTouch ? (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-c">
            <Command className="h-3 w-3 shrink-0" aria-hidden="true" />
            Everything lives in the bottom bar — panels, workspaces and the search.
          </p>
        ) : (
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-c">
            <Keyboard className="h-3 w-3 shrink-0" aria-hidden="true" />
            Press
            <kbd className="rounded border hairline px-1 py-0.5 text-[10px] font-medium">{isMac ? "⌘" : "Ctrl"}</kbd>+
            <kbd className="rounded border hairline px-1 py-0.5 text-[10px] font-medium">K</kbd> anytime for the
            command palette — or{" "}
            <kbd className="rounded border hairline px-1 py-0.5 text-[10px] font-medium">F</kbd> for focus mode.
          </p>
        )}
      </div>
    </section>
  );
}
