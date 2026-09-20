/**
 * Flowdeck — procedural ambient soundscape engine.
 *
 * Every sound is synthesized live from noise buffers, biquad filters,
 * LFOs and randomized event schedulers. No audio files, no external
 * dependencies, works fully offline (Web Audio API only).
 *
 * Public API:
 *   soundscape.ensureContext()        -> boolean  (call from a user gesture)
 *   soundscape.setMaster(v)                       (0..1)
 *   soundscape.setChannel(id, volume)             (0..1; 0 fully stops nodes)
 *   soundscape.setChannelMuted(id, muted)         (mute without losing volume)
 *   soundscape.stopAll()                          (stop everything)
 *
 * Safety contract: a failing channel can never throw into the app —
 * every public method is fail-safe. If Web Audio is unavailable,
 * `ensureContext()` returns false and all other methods are no-ops.
 */

/// <reference lib="es2018" />

export type SoundId =
  | "rain"
  | "heavy-rain"
  | "thunder"
  | "forest"
  | "wind"
  | "ocean"
  | "cafe"
  | "fireplace"
  | "white-noise"
  | "brown-noise"
  | "pink-noise";

/** Any schedulable source node we create and may need to stop. */
type SourceNode = AudioBufferSourceNode | OscillatorNode;

/** Timer handle that is valid under DOM and Node typings alike. */
type Timer = ReturnType<typeof setTimeout>;

/** Biquad filter description for one-shot "hit" sounds. */
interface FilterSpec {
  type: BiquadFilterType;
  frequency: number;
  q?: number;
  /** Optional exponential sweep target while the hit plays (must stay > 0). */
  endFrequency?: number;
  sweepDuration?: number;
}

/** Envelope and placement options shared by noise and tone one-shots. */
interface HitOptions {
  /** Seconds until the envelope reaches `peak`. */
  attack: number;
  /** Envelope peak (into the channel input, before channel volume). */
  peak: number;
  /** Exponential decay time constant applied after the peak. */
  decayTau: number;
  /** Minimum total length; stop time is max(duration, attack + 6·tau). */
  duration: number;
  /** Delay before the hit starts (scheduled in audio time). */
  delay?: number;
  /** Stereo placement, -1..1 (ignored when panning is unsupported). */
  pan?: number;
  filter?: FilterSpec;
}

interface NoiseHitOptions extends HitOptions {
  kind: "noise";
  buffer: AudioBuffer;
  /** Loop the buffer (for bursts longer than the 2 s buffer). */
  loop?: boolean;
}

interface ToneHitOptions extends HitOptions {
  kind: "tone";
  type: OscillatorType;
  frequency: number;
  /** Optional exponential frequency sweep target (descending chirps). */
  endFrequency?: number;
  sweepDuration?: number;
}

type Hit = NoiseHitOptions | ToneHitOptions;

/**
 * Per-channel node bag. `input` is the channel volume gain: every layer
 * and every event of that sound feeds into it, and it feeds the master
 * gain (which feeds the destination). Torn down completely on stop.
 */
interface ChannelNodes {
  readonly id: SoundId;
  readonly input: GainNode;
  readonly sources: Set<SourceNode>;
  readonly nodes: Set<AudioNode>;
  readonly timers: Set<Timer>;
  /** True once torn down; pending scheduler callbacks bail out on this. */
  dead: boolean;
  /** True while fading out ahead of teardown (cancelled by a revive). */
  dying: boolean;
}

const BUFFER_SECONDS = 2;
const LOOP_FADE_SAMPLES = 4096;
const CHANNEL_FADE_IN_TAU = 0.25;
const CHANNEL_FADE_OUT_TAU = 0.06;
const TEARDOWN_DELAY_MS = 400;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class SoundscapeEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterVolume = 0.8;
  private canPan = false;
  private warned = false;

  private readonly channels = new Map<SoundId, ChannelNodes>();
  /** Last configured volume per channel (kept across stop/mute). */
  private readonly volumes: Partial<Record<SoundId, number>> = {};
  private readonly mutedFlags: Partial<Record<SoundId, boolean>> = {};

  private whiteBuf: AudioBuffer | null = null;
  private pinkBuf: AudioBuffer | null = null;
  private brownBuf: AudioBuffer | null = null;

  /* ------------------------------------------------------------ public */

  /** Exposed for UI effects (e.g. timer chimes). Null when unavailable. */
  getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  /** Lazily create/resume the AudioContext. Safe to call many times. */
  ensureContext(): boolean {
    try {
      if (typeof window === "undefined") return false;
      if (this.ctx && this.ctx.state !== "closed") {
        if (this.ctx.state === "suspended") {
          void this.ctx.resume().catch(() => undefined);
        }
        return true;
      }
      const w = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const Ctor = w.AudioContext ?? w.webkitAudioContext;
      if (typeof Ctor !== "function") {
        this.warnUnavailable();
        return false;
      }
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.masterVolume;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.masterGain = master;
      this.canPan = typeof ctx.createStereoPanner === "function";
      if (ctx.state === "suspended") {
        void ctx.resume().catch(() => undefined);
      }
      return true;
    } catch {
      this.ctx = null;
      this.masterGain = null;
      this.warnUnavailable();
      return false;
    }
  }

  /** Set master volume 0..1. */
  setMaster(v: number): void {
    try {
      this.masterVolume = clamp01(v);
      const ctx = this.ctx;
      if (ctx && this.masterGain) {
        this.masterGain.gain.setTargetAtTime(this.masterVolume, ctx.currentTime, 0.05);
      }
    } catch {
      /* never throw into the app */
    }
  }

  /**
   * Set a channel's volume 0..1. Volume 0 (or a muted channel) fully
   * stops that sound's nodes; volume > 0 with a live context starts (or
   * re-levels) playback. Mirrors the app store: setting a volume
   * implicitly clears the channel's mute flag.
   */
  setChannel(id: SoundId, volume: number): void {
    try {
      const v = clamp01(volume);
      this.volumes[id] = v;
      this.mutedFlags[id] = false;
      const ch = this.channels.get(id);
      if (v > 0) {
        if (ch) {
          this.revive(ch, v);
          return;
        }
        this.startChannel(id, v);
        return;
      }
      if (ch) this.fadeOutAndDestroy(ch);
    } catch {
      /* never throw into the app */
    }
  }

  /** Mute/unmute a channel without losing its stored volume setting. */
  setChannelMuted(id: SoundId, muted: boolean): void {
    try {
      this.mutedFlags[id] = muted === true;
      const ch = this.channels.get(id);
      if (muted) {
        if (ch) this.fadeOutAndDestroy(ch);
        return;
      }
      const v = this.volumes[id] ?? 0;
      if (v <= 0) return;
      if (ch) this.revive(ch, v);
      else this.startChannel(id, v);
    } catch {
      /* never throw into the app */
    }
  }

  /** Stop all sounds. Configured volumes are the app's state; engine just stops. */
  stopAll(): void {
    try {
      this.channels.forEach((ch) => this.fadeOutAndDestroy(ch));
    } catch {
      /* never throw into the app */
    }
  }

  /* ---------------------------------------------------------- lifecycle */

  private warnUnavailable(): void {
    if (this.warned) return;
    this.warned = true;
    console.warn("Flowdeck audio: Web Audio API unavailable — soundscape disabled.");
  }

  /** Bring a fading/dying channel back and ramp it to `v`. */
  private revive(ch: ChannelNodes, v: number): void {
    const ctx = this.ctx;
    if (!ctx || ch.dead) return;
    ch.dying = false;
    try {
      ch.input.gain.setTargetAtTime(v, ctx.currentTime, 0.15);
    } catch {
      /* ignore */
    }
  }

  /**
   * Click-free stop: ramp the channel input to 0, then tear everything
   * down a moment later. Reviving before the timer fires cancels it.
   */
  private fadeOutAndDestroy(ch: ChannelNodes): void {
    if (ch.dead || ch.dying) return;
    ch.dying = true;
    const ctx = this.ctx;
    if (ctx) {
      try {
        ch.input.gain.setTargetAtTime(0, ctx.currentTime, CHANNEL_FADE_OUT_TAU);
      } catch {
        /* ignore */
      }
    }
    const timer: Timer = setTimeout(() => {
      try {
        ch.timers.delete(timer);
        if (ch.dying && !ch.dead) this.destroyChannel(ch);
      } catch {
        /* never throw into the app */
      }
    }, TEARDOWN_DELAY_MS);
    ch.timers.add(timer);
  }

  /** Full teardown: stop sources, clear timers, disconnect everything. */
  private destroyChannel(ch: ChannelNodes): void {
    if (ch.dead) return;
    ch.dead = true;
    ch.dying = true;
    ch.timers.forEach((t) => clearTimeout(t));
    ch.timers.clear();
    ch.sources.forEach((s) => {
      try {
        s.onended = null;
      } catch {
        /* ignore */
      }
      try {
        s.stop();
      } catch {
        /* already stopped or never started */
      }
    });
    ch.sources.clear();
    ch.nodes.forEach((n) => {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    });
    ch.nodes.clear();
    if (this.channels.get(ch.id) === ch) this.channels.delete(ch.id);
  }

  private startChannel(id: SoundId, v: number): void {
    const ctx = this.ctx;
    const master = this.masterGain;
    if (!ctx || !master) return;
    if (this.channels.has(id)) return;
    const ch: ChannelNodes = {
      id,
      input: ctx.createGain(),
      sources: new Set<SourceNode>(),
      nodes: new Set<AudioNode>(),
      timers: new Set<Timer>(),
      dead: false,
      dying: false,
    };
    ch.input.gain.value = 0;
    ch.nodes.add(ch.input);
    try {
      ch.input.connect(master);
    } catch {
      return;
    }
    this.channels.set(id, ch);
    try {
      this.build(id, ch);
    } catch {
      this.destroyChannel(ch);
      return;
    }
    try {
      ch.input.gain.setTargetAtTime(v, ctx.currentTime, CHANNEL_FADE_IN_TAU);
    } catch {
      /* ignore */
    }
  }

  /* -------------------------------------------------------- noise buffers */

  /** Full-spectrum white noise; independent randoms per channel avoid metallic loops. */
  private getWhiteBuffer(): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (this.whiteBuf) return this.whiteBuf;
    try {
      const len = Math.floor(ctx.sampleRate * BUFFER_SECONDS);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      this.whiteBuf = buf;
      return buf;
    } catch {
      return null;
    }
  }

  /** Random-walk (brown) noise, normalized, with a seamless loop crossfade. */
  private getBrownBuffer(): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (this.brownBuf) return this.brownBuf;
    try {
      const len = Math.floor(ctx.sampleRate * BUFFER_SECONDS);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      const fade = Math.min(LOOP_FADE_SAMPLES, Math.floor(len / 4));
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        const raw = new Float32Array(len + fade);
        let last = 0;
        for (let i = 0; i < raw.length; i++) {
          const w = Math.random() * 2 - 1;
          last = (last + 0.02 * w) / 1.02; // leaky random walk
          raw[i] = last * 3.5;
        }
        this.blendLoop(d, raw, len, fade);
        this.normalize(d, 0.9);
      }
      this.brownBuf = buf;
      return buf;
    } catch {
      return null;
    }
  }

  /** Pink noise via Paul Kellet's refined pink filter (filtered white), gentle. */
  private getPinkBuffer(): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (this.pinkBuf) return this.pinkBuf;
    try {
      const len = Math.floor(ctx.sampleRate * BUFFER_SECONDS);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      const fade = Math.min(LOOP_FADE_SAMPLES, Math.floor(len / 4));
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        const raw = new Float32Array(len + fade);
        let b0 = 0;
        let b1 = 0;
        let b2 = 0;
        let b3 = 0;
        let b4 = 0;
        let b5 = 0;
        let b6 = 0;
        for (let i = 0; i < raw.length; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.016898;
          raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
          b6 = w * 0.115926;
        }
        this.blendLoop(d, raw, len, fade);
        this.normalize(d, 0.7);
      }
      this.pinkBuf = buf;
      return buf;
    } catch {
      return null;
    }
  }

  /**
   * Equal-power crossfade of the raw tail into the loop head so the
   * wrap-around is continuous (no clicks, no level dip every 2 s).
   */
  private blendLoop(d: Float32Array, raw: Float32Array, len: number, fade: number): void {
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      const wHead = Math.sin((t * Math.PI) / 2);
      const wTail = Math.cos((t * Math.PI) / 2);
      d[i] = raw[i] * wHead + raw[len + i] * wTail;
    }
    for (let i = fade; i < len; i++) d[i] = raw[i];
  }

  private normalize(d: Float32Array, targetPeak: number): void {
    let peak = 0;
    for (let i = 0; i < d.length; i++) {
      const a = d[i] < 0 ? -d[i] : d[i];
      if (a > peak) peak = a;
    }
    if (peak > 1e-4) {
      const g = targetPeak / peak;
      for (let i = 0; i < d.length; i++) d[i] *= g;
    }
  }

  /* ------------------------------------------------------------ plumbing */

  /** Looping noise source into `dest` with a random start offset. */
  private loopNoise(
    ctx: AudioContext,
    ch: ChannelNodes,
    buffer: AudioBuffer,
    dest: AudioNode,
    rate = 1
  ): void {
    try {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      if (rate !== 1) src.playbackRate.value = rate;
      src.connect(dest);
      src.start(ctx.currentTime, Math.random() * buffer.duration);
      ch.sources.add(src);
      ch.nodes.add(src);
    } catch {
      /* ignore */
    }
  }

  /** Sine LFO modulating an AudioParam around its base value. */
  private lfo(
    ctx: AudioContext,
    ch: ChannelNodes,
    freqHz: number,
    param: AudioParam,
    depth: number,
    startDelaySec = 0
  ): void {
    try {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freqHz;
      const depthGain = ctx.createGain();
      depthGain.gain.value = depth;
      osc.connect(depthGain);
      depthGain.connect(param);
      osc.start(ctx.currentTime + startDelaySec);
      ch.sources.add(osc);
      ch.nodes.add(osc);
      ch.nodes.add(depthGain);
    } catch {
      /* ignore */
    }
  }

  /**
   * Sine^2-shaped swell: LFO -> WaveShaper -> depth -> param.
   * Output is always in [0, depth] (a wave rising and falling, never negative).
   */
  private swellMod(
    ctx: AudioContext,
    ch: ChannelNodes,
    periodSec: number,
    param: AudioParam,
    depth: number,
    startDelaySec = 0
  ): void {
    try {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 1 / periodSec;
      const shaper = ctx.createWaveShaper();
      const n = 256;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        const t = (x + 1) / 2;
        curve[i] = t * t;
      }
      shaper.curve = curve;
      const depthGain = ctx.createGain();
      depthGain.gain.value = depth;
      osc.connect(shaper);
      shaper.connect(depthGain);
      depthGain.connect(param);
      osc.start(ctx.currentTime + startDelaySec);
      ch.sources.add(osc);
      ch.nodes.add(osc);
      ch.nodes.add(shaper);
      ch.nodes.add(depthGain);
    } catch {
      /* ignore */
    }
  }

  /** Connect a layer into the channel input, optionally through a panner. */
  private output(ctx: AudioContext, ch: ChannelNodes, node: AudioNode, pan?: number): void {
    try {
      if (pan !== undefined && this.canPan) {
        const p = ctx.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, pan));
        ch.nodes.add(p);
        node.connect(p);
        p.connect(ch.input);
      } else {
        node.connect(ch.input);
      }
    } catch {
      /* ignore */
    }
  }

  private makeGain(ctx: AudioContext, ch: ChannelNodes, value: number): GainNode {
    const g = ctx.createGain();
    g.gain.value = value;
    ch.nodes.add(g);
    return g;
  }

  private makeFilter(
    ctx: AudioContext,
    ch: ChannelNodes,
    type: BiquadFilterType,
    frequency: number,
    q = 1,
    gainDb = 0
  ): BiquadFilterNode {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    if (gainDb !== 0) f.gain.value = gainDb;
    ch.nodes.add(f);
    return f;
  }

  /**
   * Recursive random scheduler (no setInterval): waits `min..max`
   * seconds, fires, reschedules. Timers live on the channel and are
   * cleared on teardown; the first interval can differ from the rest.
   */
  private scheduleRandom(
    ch: ChannelNodes,
    minSec: number,
    maxSec: number,
    fire: () => void,
    firstMinSec: number = minSec,
    firstMaxSec: number = maxSec
  ): void {
    const step = (min: number, max: number): void => {
      if (ch.dead || !this.ctx) return;
      const timer: Timer = setTimeout(() => {
        try {
          ch.timers.delete(timer);
          if (ch.dead || !this.ctx) return;
          // Stay silent while suspended (audio time is frozen), keep ticking.
          if (this.ctx.state === "running") {
            try {
              fire();
            } catch {
              /* ignore failing event */
            }
          }
          step(minSec, maxSec);
        } catch {
          /* never throw into the app */
        }
      }, rand(min, max) * 1000);
      ch.timers.add(timer);
    };
    step(firstMinSec, firstMaxSec);
  }

  /**
   * One-shot hit (enveloped noise burst or oscillator blip) into the
   * channel input. Self-cleaning: nodes disconnect themselves on ended.
   */
  private playHit(ch: ChannelNodes, hit: Hit): void {
    const ctx = this.ctx;
    if (!ctx || ch.dead || ctx.state !== "running") return;
    try {
      const t0 = ctx.currentTime + (hit.delay ?? 0);
      const attack = Math.max(0.0005, hit.attack);
      const stopAt = t0 + Math.max(hit.duration, attack + hit.decayTau * 6);

      let src: SourceNode;
      let noiseSrc: AudioBufferSourceNode | null = null;
      let startOffset = 0;
      if (hit.kind === "noise") {
        const s = ctx.createBufferSource();
        s.buffer = hit.buffer;
        if (hit.loop) s.loop = true;
        const span = stopAt - t0;
        startOffset = hit.loop
          ? Math.random() * hit.buffer.duration
          : Math.random() * Math.max(0.01, hit.buffer.duration - span - 0.05);
        noiseSrc = s;
        src = s;
      } else {
        const o = ctx.createOscillator();
        o.type = hit.type;
        o.frequency.setValueAtTime(hit.frequency, t0);
        if (hit.endFrequency !== undefined && hit.sweepDuration !== undefined) {
          o.frequency.exponentialRampToValueAtTime(
            Math.max(20, hit.endFrequency),
            t0 + hit.sweepDuration
          );
        }
        src = o;
      }

      const midNodes: AudioNode[] = [];
      let head: AudioNode = src;
      if (hit.filter) {
        const f = ctx.createBiquadFilter();
        f.type = hit.filter.type;
        f.frequency.setValueAtTime(hit.filter.frequency, t0);
        if (hit.filter.endFrequency !== undefined && hit.filter.sweepDuration !== undefined) {
          f.frequency.exponentialRampToValueAtTime(
            Math.max(20, hit.filter.endFrequency),
            t0 + hit.filter.sweepDuration
          );
        }
        if (hit.filter.q !== undefined) f.Q.value = hit.filter.q;
        head.connect(f);
        head = f;
        midNodes.push(f);
      }
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(hit.peak, t0 + attack);
      env.gain.setTargetAtTime(0, t0 + attack, hit.decayTau);
      head.connect(env);
      midNodes.push(env);
      let tail: AudioNode = env;
      if (hit.pan !== undefined && this.canPan) {
        const p = ctx.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, hit.pan));
        env.connect(p);
        tail = p;
        midNodes.push(p);
      }
      tail.connect(ch.input);

      ch.sources.add(src);
      ch.nodes.add(src);
      for (const n of midNodes) ch.nodes.add(n);

      if (noiseSrc) noiseSrc.start(t0, startOffset);
      else src.start(t0);
      src.stop(stopAt);

      src.onended = () => {
        src.onended = null;
        try {
          src.disconnect();
        } catch {
          /* ignore */
        }
        for (const n of midNodes) {
          try {
            n.disconnect();
          } catch {
            /* ignore */
          }
          ch.nodes.delete(n);
        }
        ch.sources.delete(src);
        ch.nodes.delete(src);
      };
    } catch {
      /* ignore */
    }
  }

  /* ------------------------------------------------------------- sounds */

  private build(id: SoundId, ch: ChannelNodes): void {
    switch (id) {
      case "white-noise":
        this.buildWhiteNoise(ch);
        break;
      case "pink-noise":
        this.buildPinkNoise(ch);
        break;
      case "brown-noise":
        this.buildBrownNoise(ch);
        break;
      case "rain":
        this.buildRain(ch);
        break;
      case "heavy-rain":
        this.buildHeavyRain(ch);
        break;
      case "thunder":
        this.buildThunder(ch);
        break;
      case "forest":
        this.buildForest(ch);
        break;
      case "wind":
        this.buildWind(ch);
        break;
      case "ocean":
        this.buildOcean(ch);
        break;
      case "cafe":
        this.buildCafe(ch);
        break;
      case "fireplace":
        this.buildFireplace(ch);
        break;
    }
  }

  /** white-noise: full-spectrum noise, tamed by a 10 kHz lowpass. */
  private buildWhiteNoise(ch: ChannelNodes): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const white = this.getWhiteBuffer();
    if (!white) return;
    const lp = this.makeFilter(ctx, ch, "lowpass", 10000, 0.7);
    const g = this.makeGain(ctx, ch, 0.35);
    this.loopNoise(ctx, ch, white, lp);
    lp.connect(g);
    this.output(ctx, ch, g);
  }

  /** pink-noise: gentle pink bed. */
  private buildPinkNoise(ch: ChannelNodes): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const pink = this.getPinkBuffer();
    if (!pink) return;
    const g = this.makeGain(ctx, ch, 0.5);
    this.loopNoise(ctx, ch, pink, g);
    this.output(ctx, ch, g);
  }

  /** brown-noise: deep random-walk noise with extra 500 Hz warmth. */
  private buildBrownNoise(ch: ChannelNodes): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const brown = this.getBrownBuffer();
    if (!brown) return;
    const lp = this.makeFilter(ctx, ch, "lowpass", 500, 0.7);
    const g = this.makeGain(ctx, ch, 0.65);
    this.loopNoise(ctx, ch, brown, lp);
    lp.connect(g);
    this.output(ctx, ch, g);
  }

  /** rain: light steady rain — shaped hiss bed + sparse droplet plips. */
  private buildRain(ch: ChannelNodes): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const white = this.getWhiteBuffer();
    if (!white) return;
    const hp = this.makeFilter(ctx, ch, "highpass", 400, 0.6);
    const bp = this.makeFilter(ctx, ch, "bandpass", 2600, 0.5);
    const bed = this.makeGain(ctx, ch, 0.4);
    this.loopNoise(ctx, ch, white, hp);
    hp.connect(bp);
    bp.connect(bed);
    this.output(ctx, ch, bed);
    this.scheduleRandom(ch, 1.2, 4.5, () => this.rainDrop(ch, 0.4, false), 0.8, 2.5);
  }

  /** heavy-rain: denser dual-layer rain with low rumble and stereo width. */
  private buildHeavyRain(ch: ChannelNodes): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const white = this.getWhiteBuffer();
    const brown = this.getBrownBuffer();
    if (!white || !brown) return;
    // Hiss layer, slightly left, lightly detuned to decorrelate from other beds.
    const hp = this.makeFilter(ctx, ch, "highpass", 300, 0.5);
    const bp = this.makeFilter(ctx, ch, "bandpass", 1800, 0.4);
    const hiss = this.makeGain(ctx, ch, 0.65);
    this.loopNoise(ctx, ch, white, hp, 1.06);
    hp.connect(bp);
    bp.connect(hiss);
    this.output(ctx, ch, hiss, -0.3);
    // Low rumble layer, slightly right.
    const lp = this.makeFilter(ctx, ch, "lowpass", 150, 0.8);
    const rumble = this.makeGain(ctx, ch, 0.85);
    this.loopNoise(ctx, ch, brown, lp);
    lp.connect(rumble);
    this.output(ctx, ch, rumble, 0.3);
    // Dense droplets.
    this.scheduleRandom(ch, 0.25, 1.1, () => this.rainDrop(ch, 0.6, true), 0.2, 0.8);
  }

  /** Short bandpass-filtered noise plip; occasionally a quick double. */
  private rainDrop(ch: ChannelNodes, panSpread: number, heavy: boolean): void {
    const white = this.getWhiteBuffer();
    if (!white) return;
    const drop = (delay?: number, scale = 1): void => {
      this.playHit(ch, {
        kind: "noise",
        buffer: white,
        attack: 0.002,
        peak: (heavy ? rand(0.05, 0.16) : rand(0.035, 0.09)) * scale,
        decayTau: heavy ? rand(0.02, 0.04) : 0.03,
        duration: heavy ? rand(0.06, 0.12) : rand(0.08, 0.15),
        filter: {
          type: "bandpass",
          frequency: rand(heavy ? 1200 : 900, heavy ? 3200 : 2600),
          q: rand(6, 14),
        },
        pan: rand(-panSpread, panSpread),
        delay,
      });
    };
    drop();
    if (Math.random() < (heavy ? 0.4 : 0.3)) drop(rand(0.05, 0.14), 0.7);
  }

  /** thunder: quiet brown bed + scheduled rumbles (8–25 s, doubles sometimes). */
  private buildThunder(ch: ChannelNodes): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const brown = this.getBrownBuffer();
    if (!brown) return;
    const lp = this.makeFilter(ctx, ch, "lowpass", 220, 0.7);
    const bed = this.makeGain(ctx, ch, 0.09);
    this.loopNoise(ctx, ch, brown, lp);
    lp.connect(bed);
    this.output(ctx, ch, bed);
    this.scheduleRandom(ch, 8, 25, () => this.thunderRumble(ch), 3, 9);
  }

  /** One thunder rumble: enveloped brown burst with a downward LP sweep. */
  private thunderRumble(ch: ChannelNodes): void {
    const brown = this.getBrownBuffer();
    if (!brown) return;
    const peak = rand(0.6, 0.85);
    const decay = rand(2, 5);
    this.playHit(ch, {
      kind: "noise",
      buffer: brown,
      loop: true,
      attack: 0.05,
      peak,
      decayTau: decay / 3.5,
      duration: 0.05 + decay,
      filter: { type: "lowpass", frequency: 200, endFrequency: 80, sweepDuration: decay, q: 0.7 },
      pan: rand(-0.4, 0.4),
    });
    if (Math.random() < 0.35) {
      // Occasional trailing double-rumble.
      const decay2 = rand(1.5, 3);
      this.playHit(ch, {
        kind: "noise",
        buffer: brown,
        loop: true,
        attack: 0.06,
        peak: peak * rand(0.45, 0.65),
        decayTau: decay2 / 3.5,
        duration: 0.06 + decay2,
        delay: rand(0.9, 2.2),
        filter: { type: "lowpass", frequency: 180, endFrequency: 70, sweepDuration: decay2, q: 0.7 },
        pan: rand(-0.3, 0.3),
      });
    }
  }

  /** forest: breathing wind bed + very subtle birdsong. */
  private buildForest(ch: ChannelNodes): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const white = this.getWhiteBuffer();
    if (!white) return;
    const bp = this.makeFilter(ctx, ch, "bandpass", 500, 1);
    const bed = this.makeGain(ctx, ch, 0.55);
    this.loopNoise(ctx, ch, white, bp);
    bp.connect(bed);
    this.output(ctx, ch, bed);
    // Slow gust LFO (0.05 Hz) on both level and band center.
    this.lfo(ctx, ch, 0.05, bed.gain, 0.28);
    this.lfo(ctx, ch, 0.05, bp.frequency, 140);
    this.scheduleRandom(ch, 4, 12, () => this.birdChirp(ch), 1.5, 5);
  }

  /** 2–4 quick descending sine sweeps, kept intentionally faint. */
  private birdChirp(ch: ChannelNodes): void {
    const count = 2 + Math.floor(Math.random() * 3);
    let t = 0;
    const pitch = rand(0.9, 1.15);
    for (let k = 0; k < count; k++) {
      const f0 = Math.min(4200, rand(2400, 3900) * pitch);
      const dur = rand(0.06, 0.14);
      this.playHit(ch, {
        kind: "tone",
        type: "sine",
        frequency: f0,
        endFrequency: f0 * rand(0.5, 0.68),
        sweepDuration: dur,
        attack: 0.006,
        peak: rand(0.016, 0.042),
        decayTau: 0.03,
        duration: dur + 0.07,
        delay: t,
        pan: rand(-0.5, 0.5),
      });
      t += dur + rand(0.05, 0.16);
    }
  }

  /** wind: bandpassed noise howling 300–900 Hz + faint whisper shelf. */
  private buildWind(ch: ChannelNodes): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const white = this.getWhiteBuffer();
    if (!white) return;
    const bp = this.makeFilter(ctx, ch, "bandpass", 600, 1.2);
    const main = this.makeGain(ctx, ch, 0.55);
    this.loopNoise(ctx, ch, white, bp);
    bp.connect(main);
    this.output(ctx, ch, main);
    // Center frequency drifts 300–900 Hz over ~8 s; level swells slower.
    this.lfo(ctx, ch, 0.125, bp.frequency, 300);
    this.lfo(ctx, ch, 0.09, main.gain, 0.33);
    // Faint whispering high-shelf layer with its own (phase-drifting) LFO.
    const shelf = this.makeFilter(ctx, ch, "highshelf", 6000, 1, 6);
    const whisper = this.makeGain(ctx, ch, 0.028);
    this.loopNoise(ctx, ch, white, shelf);
    shelf.connect(whisper);
    this.output(ctx, ch, whisper);
    this.lfo(ctx, ch, 0.105, whisper.gain, 0.018);
  }

  /** ocean: slow sine^2 wave swell + trailing wash layer. */
  private buildOcean(ch: ChannelNodes): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const brown = this.getBrownBuffer();
    const white = this.getWhiteBuffer();
    if (!brown || !white) return;
    // Main wave swell (brown noise, ~9 s period).
    const lp = this.makeFilter(ctx, ch, "lowpass", 600, 0.7);
    const swell = this.makeGain(ctx, ch, 0.12);
    this.loopNoise(ctx, ch, brown, lp);
    lp.connect(swell);
    this.output(ctx, ch, swell);
    this.swellMod(ctx, ch, 9, swell.gain, 0.3);
    // Wash layer: slightly faster, delayed so its peaks trail the swell.
    const bp = this.makeFilter(ctx, ch, "bandpass", 1000, 0.8);
    const wash = this.makeGain(ctx, ch, 0.1);
    this.loopNoise(ctx, ch, white, bp);
    bp.connect(wash);
    this.output(ctx, ch, wash);
    this.swellMod(ctx, ch, 6.8, wash.gain, 0.12, 1.4);
  }

  /** cafe: murmur bed with gain wiggles + ceramic clinks + chair scrapes. */
  private buildCafe(ch: ChannelNodes): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const brown = this.getBrownBuffer();
    const white = this.getWhiteBuffer();
    if (!brown || !white) return;
    const bp = this.makeFilter(ctx, ch, "bandpass", 300, 1.3);
    const murmur = this.makeGain(ctx, ch, 0.45);
    this.loopNoise(ctx, ch, brown, bp);
    bp.connect(murmur);
    this.output(ctx, ch, murmur);
    // Random small gain wiggles: the crowd-murmur illusion.
    this.scheduleRandom(
      ch,
      0.35,
      0.9,
      () => {
        const c = this.ctx;
        if (!c) return;
        try {
          murmur.gain.setTargetAtTime(rand(0.3, 0.62), c.currentTime, 0.3);
        } catch {
          /* ignore */
        }
      },
      0.2,
      0.6
    );
    this.scheduleRandom(ch, 6, 18, () => this.cafeClink(ch), 3, 9);
    this.scheduleRandom(ch, 14, 38, () => this.cafeScrape(ch), 10, 30);
  }

  /** Ceramic clink: resonant sine ping + tiny noise transient. */
  private cafeClink(ch: ChannelNodes): void {
    const white = this.getWhiteBuffer();
    if (!white) return;
    const pan = rand(-0.55, 0.55);
    const f = rand(1800, 2600);
    this.playHit(ch, {
      kind: "tone",
      type: "sine",
      frequency: f,
      endFrequency: f * 0.985,
      sweepDuration: 0.3,
      attack: 0.002,
      peak: rand(0.04, 0.085),
      decayTau: 0.05,
      duration: 0.45,
      pan,
    });
    this.playHit(ch, {
      kind: "noise",
      buffer: white,
      attack: 0.001,
      peak: 0.025,
      decayTau: 0.004,
      duration: 0.03,
      filter: { type: "highpass", frequency: 4500, q: 0.7 },
      pan,
    });
  }

  /** Chair scrape: short lowpassed noise burst, very sparse. */
  private cafeScrape(ch: ChannelNodes): void {
    const white = this.getWhiteBuffer();
    if (!white) return;
    this.playHit(ch, {
      kind: "noise",
      buffer: white,
      attack: rand(0.02, 0.05),
      peak: rand(0.03, 0.055),
      decayTau: 0.09,
      duration: 0.3,
      filter: { type: "lowpass", frequency: rand(600, 900), q: 1 },
      pan: rand(-0.5, 0.5),
    });
  }

  /** fireplace: warm low bed + random bright crackle pops. */
  private buildFireplace(ch: ChannelNodes): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const brown = this.getBrownBuffer();
    const white = this.getWhiteBuffer();
    if (!brown || !white) return;
    const lp = this.makeFilter(ctx, ch, "lowpass", 400, 0.7);
    const bed = this.makeGain(ctx, ch, 0.35);
    this.loopNoise(ctx, ch, brown, lp);
    lp.connect(bed);
    this.output(ctx, ch, bed);
    this.scheduleRandom(ch, 0.2, 2, () => this.crackle(ch), 0.05, 0.6);
  }

  /** Very short bright noise pop through a 2 kHz highpass, random intensity. */
  private crackle(ch: ChannelNodes): void {
    const white = this.getWhiteBuffer();
    if (!white) return;
    const big = Math.random() < 0.12;
    this.playHit(ch, {
      kind: "noise",
      buffer: white,
      attack: 0.001,
      peak: big ? rand(0.2, 0.42) : rand(0.04, 0.16),
      decayTau: rand(0.006, 0.012),
      duration: big ? rand(0.07, 0.1) : rand(0.04, 0.07),
      filter: { type: "highpass", frequency: 2000, q: 0.7 },
      pan: rand(-0.35, 0.35),
    });
  }
}

export const soundscape: SoundscapeEngine = new SoundscapeEngine();
