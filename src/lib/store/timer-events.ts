/* Decoupled timer events — UI/audio/notification layers subscribe. */

export type TimerEvent =
  | { type: "phase-complete"; phase: "focus" | "short" | "long"; cycle: number; nextPhase: "focus" | "short" | "long"; autoStarted: boolean }
  | { type: "started"; mode: string; phase: "focus" | "short" | "long" }
  | { type: "paused" }
  | { type: "resumed" }
  | { type: "stopped"; recordedSession: boolean }
  | { type: "skip" };

type Handler = (e: TimerEvent) => void;

const handlers = new Set<Handler>();

export function onTimerEvent(h: Handler): () => void {
  handlers.add(h);
  return () => handlers.delete(h);
}

export function emitTimerEvent(e: TimerEvent): void {
  handlers.forEach((h) => {
    try {
      h(e);
    } catch {
      /* one bad listener must not break the loop */
    }
  });
}
