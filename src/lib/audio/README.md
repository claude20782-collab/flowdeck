# `src/lib/audio` — procedural soundscape engine

`engine.ts` synthesizes all 11 ambient sounds (rain, heavy-rain, thunder, forest, wind, ocean, cafe, fireplace, white/pink/brown noise) from noise buffers, biquad filters, LFOs and randomized event schedulers — no audio files, no dependencies, fully offline.

- `soundscape.ensureContext(): boolean` — lazily create/resume the AudioContext; call it from a user gesture (click) first.
- `soundscape.setMaster(v)` — master volume 0..1.
- `soundscape.setChannel(id, volume)` — per-sound volume 0..1; volume 0 fully stops that sound's nodes (also clears its mute flag).
- `soundscape.setChannelMuted(id, muted)` — mute/unmute without losing the stored volume.
- `soundscape.stopAll()` — stop every channel; the app keeps configured volumes in its own state.

Import: `import { soundscape, type SoundId } from "@/lib/audio/engine"` — the exported `SoundId` union matches `SOUND_IDS` in the sound store.
