"use client";

import { useEffect, useRef } from "react";
import { onTimerEvent } from "@/lib/store/timer-events";
import { useTimerStore, elapsedOf, remainingOf } from "@/lib/store/timer-store";
import { useSettingsStore } from "@/lib/store/settings-store";
import { soundscape } from "@/lib/audio/engine";

/* ============================================================
 * Timer completion chimes — synthesized with Web Audio.
 * ============================================================ */

function playChime(kind: "chime" | "bell" | "pulse") {
  if (!soundscape.ensureContext()) return;
  try {
    const ctx = soundscape.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    if (kind === "chime") {
      /* soft two-tone wind chime */
      [880, 1174.66].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t0 = now + i * 0.18;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.35, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
        osc.connect(gain).connect(master);
        osc.start(t0);
        osc.stop(t0 + 1.8);
      });
    } else if (kind === "bell") {
      /* warm bell with harmonics */
      [220, 440, 660].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t0 = now + i * 0.05;
        const peak = 0.4 / (i + 1);
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(peak, t0 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2);
        osc.connect(gain).connect(master);
        osc.start(t0);
        osc.stop(t0 + 2.5);
      });
    } else {
      /* pulsing triple tick */
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = 520;
        const t0 = now + i * 0.22;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.12, t0 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
        osc.connect(gain).connect(master);
        osc.start(t0);
        osc.stop(t0 + 0.2);
      }
    }
  } catch {
    /* audio failures must never break the app */
  }
}

/* ============================================================
 * Timer side effects:
 *  - completion detection (timestamp based, no drift)
 *  - completion sound / notification / vibration
 *  - screen wake lock while running
 *  - document title with live remaining time
 * ============================================================ */

export function TimerEffects() {
  const status = useTimerStore((s) => s.state.status);
  const completePhase = useTimerStore((s) => s.completePhase);
  const settings = useSettingsStore((s) => s.timer);
  const notifiedRef = useRef("");

  /* --- completion watchdog: check every 500ms while running --- */
  useEffect(() => {
    if (status !== "running") return;
    const state = useTimerStore.getState().state;
    if (state.mode === "stopwatch" || state.durationMs === 0) return; // stopwatch never completes

    const interval = setInterval(() => {
      const s = useTimerStore.getState().state;
      if (s.status !== "running") return;
      if (remainingOf(s) <= 0) {
        const key = `${s.phase}-${s.cycle}-${s.accumulatedMs}`;
        if (notifiedRef.current === key) return;
        notifiedRef.current = key;
        completePhase();
      }
    }, 400);
    return () => clearInterval(interval);
  }, [status, completePhase]);

  /* --- phase complete reactions --- */
  useEffect(() => {
    return onTimerEvent((e) => {
      if (e.type !== "phase-complete") return;
      const cfg = useSettingsStore.getState().timer;

      if (cfg.completionSound !== "none") playChime(cfg.completionSound);

      if (cfg.vibrate && typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(e.phase === "focus" ? [120, 60, 120] : 80);
        } catch { /* ignore */ }
      }

      if (cfg.notify && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          const label = e.phase === "focus" ? "Focus session complete" : "Break over";
          const body =
            e.nextPhase === "focus"
              ? "Time to get back in focus."
              : e.nextPhase === "long"
                ? "Long break — step away for a bit."
                : "Take a short break.";
          new Notification(label, { body, icon: "/icons/icon-192.png", tag: "flowdeck-timer" });
        } catch { /* ignore */ }
      }
    });
  }, []);

  /* --- notification permission request on first start --- */
  useEffect(() => {
    return onTimerEvent((e) => {
      if (e.type === "started" && typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    });
  }, []);

  /* --- wake lock while running --- */
  useEffect(() => {
    let sentinel: { release: () => Promise<void>; addEventListener: (t: string, h: () => void) => void } | null = null;
    let released = false;

    async function acquire() {
      try {
        if (!("wakeLock" in navigator)) return;
        const wl = (navigator as Navigator & { wakeLock: { request: (t: string) => Promise<typeof sentinel> } }).wakeLock;
        sentinel = await wl.request("screen");
        sentinel.addEventListener("release", () => {
          if (!released && useTimerStore.getState().state.status === "running") acquire();
        });
      } catch { /* wake lock denied — ignore */ }
    }

    if (status === "running" && settings.keepAwake) acquire();

    return () => {
      released = true;
      sentinel?.release().catch(() => {});
    };
  }, [status, settings.keepAwake]);

  /* --- live document title --- */
  useEffect(() => {
    const original = "Flowdeck";
    if (status !== "running") {
      document.title = original;
      return;
    }
    const update = () => {
      const s = useTimerStore.getState().state;
      if (s.status !== "running") return;
      if (s.mode === "stopwatch") {
        const el = elapsedOf(s);
        const m = Math.floor(el / 60000);
        const sec = Math.floor((el % 60000) / 1000);
        document.title = `${m}:${String(sec).padStart(2, "0")} — ${original}`;
      } else {
        const rem = Math.max(0, remainingOf(s));
        const m = Math.floor(rem / 60000);
        const sec = Math.floor((rem % 60000) / 1000);
        document.title = `${m}:${String(sec).padStart(2, "0")} left — ${original}`;
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => {
      clearInterval(interval);
      document.title = original;
    };
  }, [status]);

  return null;
}
