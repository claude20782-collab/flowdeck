"use client";

import { useEffect, useRef } from "react";
import { useSoundStore } from "@/lib/store/sound-store";
import { soundscape } from "@/lib/audio/engine";
import type { SoundId } from "@/lib/store/sound-store";

/**
 * Bridges the persisted sound-mixer state to the audio engine.
 * All engine calls are user-gesture-primed: the engine only creates its
 * AudioContext after the user has interacted (we track a "primed" flag).
 */
export function AudioSync() {
  const channels = useSoundStore((s) => s.channels);
  const master = useSoundStore((s) => s.master);
  const playing = useSoundStore((s) => s.playing);
  const primed = useRef(false);

  const pushAll = () => {
    const { channels: ch, master: m, playing: p } = useSoundStore.getState();
    soundscape.setMaster(m);
    if (!p) {
      soundscape.stopAll();
      return;
    }
    for (const [id, st] of Object.entries(ch)) {
      soundscape.setChannelMuted(id as SoundId, st.muted);
      soundscape.setChannel(id as SoundId, st.muted ? 0 : st.volume);
    }
  };

  useEffect(() => {
    const prime = () => {
      if (!primed.current) {
        primed.current = true;
        /* create context on first gesture, then push current state */
        if (useSoundStore.getState().playing) {
          soundscape.ensureContext();
          pushAll();
        }
      } else {
        soundscape.ensureContext();
      }
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart"];
    events.forEach((ev) => window.addEventListener(ev, prime, { once: false, passive: true }));
    return () => events.forEach((ev) => window.removeEventListener(ev, prime));
  }, []);

  useEffect(() => {
    if (!primed.current) return;
    if (!playing) {
      soundscape.stopAll();
      return;
    }
    soundscape.ensureContext();
    soundscape.setMaster(master);
    for (const [id, st] of Object.entries(channels)) {
      soundscape.setChannelMuted(id as SoundId, st.muted);
      soundscape.setChannel(id as SoundId, st.muted ? 0 : st.volume);
    }
  }, [channels, master, playing]);

  return null;
}
