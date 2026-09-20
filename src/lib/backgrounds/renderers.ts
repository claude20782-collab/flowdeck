/**
 * Flowdeck — ambient animated background renderers (plain Canvas 2D API).
 *
 * Fully standalone: zero imports, no React, no dependencies. The app's
 * BackgroundCanvas component drives these through the `Renderer` interface:
 * it owns the canvas (DPR scaling, clearing), calls `init` on start and on
 * resize, and calls `frame` once per animation frame — renderers only draw.
 *
 * Performance contract:
 * - Particle counts scale with `intensity` AND canvas area (1920x1080 = 1x).
 * - All motion is delta-time based — nothing assumes 60fps.
 * - shadowBlur is used sparingly (grid glow only); glow otherwise comes from
 *   radial gradients, pre-rendered sprites and layered strokes.
 * - No per-frame object/array allocations: buffers are allocated in
 *   create/layout/derive and reused; colors go through memoized rgba strings.
 *
 * TRAIL_RENDERERS ("starfield", "matrix") rely on persistence: instead of
 * clearing, the caller fades the canvas every frame with rgba(bg, 0.2) and
 * the renderer draws on top, assuming the previous frame is still visible
 * (that fade is what turns moving heads into streaks).
 */

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface RendererOpts {
  /** 0..1 density/energy multiplier */
  intensity: number;
  /** speed multiplier, ~0.25..2 */
  speed: number;
  /** theme colors (hex strings like "#e8a849") */
  colors: { accent: string; accent2: string; text: string; bg: string };
}

export interface Renderer {
  /** Called once when renderer starts AND whenever canvas size changes. */
  init(ctx: CanvasRenderingContext2D, w: number, h: number, opts: RendererOpts): void;
  /** Called every animation frame. dt = milliseconds since last frame. Draw ONE frame. */
  frame(ctx: CanvasRenderingContext2D, dt: number, w: number, h: number, opts: RendererOpts): void;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;
const REF_AREA = 1920 * 1080; // reference canvas area (full HD)
const MS_PER_FRAME = 1000 / 60;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function randInt(a: number, b: number): number {
  return a + Math.floor(Math.random() * (b - a + 1));
}

function frac(v: number): number {
  return v - Math.floor(v);
}

/** Density factor from intensity — keeps a little life even at 0. */
function densityOf(intensity: number): number {
  return 0.18 + 0.82 * clamp(intensity, 0, 1);
}

/** Canvas area relative to a 1920x1080 reference, clamped to sane bounds. */
function areaFactor(w: number, h: number): number {
  return clamp((w * h) / REF_AREA, 0.08, 2.2);
}

/** Particle count = base * intensity-density * area, clamped. */
function scaledCount(base: number, intensity: number, w: number, h: number, min: number, max: number): number {
  return Math.round(clamp(base * densityOf(intensity) * areaFactor(w, h), min, max));
}

/** Global alpha multiplier that respects intensity. */
function alphaScale(intensity: number): number {
  return 0.35 + 0.65 * clamp(intensity, 0, 1);
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

type RGB = readonly [number, number, number];

const rgbCache = new Map<string, RGB>();

/** Parse "#rgb", "#rrggbb" (also tolerates "#rgba" / "#rrggbbaa") to an RGB tuple. */
function parseHex(hex: string): RGB {
  const hit = rgbCache.get(hex);
  if (hit) return hit;
  let s = hex.replace(/^\s+|\s+$/g, "");
  if (s.charAt(0) === "#") s = s.slice(1);
  if (s.length === 3 || s.length === 4) {
    s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
  }
  if (s.length === 8) s = s.slice(0, 6);
  let r = 128;
  let g = 128;
  let b = 128;
  if (/^[0-9a-fA-F]{6}$/.test(s)) {
    r = parseInt(s.slice(0, 2), 16);
    g = parseInt(s.slice(2, 4), 16);
    b = parseInt(s.slice(4, 6), 16);
  }
  const rgb: RGB = [r, g, b];
  rgbCache.set(hex, rgb);
  return rgb;
}

const rgbaCache = new Map<string, string>();

/**
 * hexToRgba("#e8a849", 0.5) -> "rgba(232,168,73,0.5)".
 * Memoized (alpha quantized to 1/200 steps) so per-frame color strings are
 * cache hits, not allocations.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const a = Math.round(clamp(alpha, 0, 1) * 200) / 200;
  const key = hex + "|" + a;
  const hit = rgbaCache.get(key);
  if (hit !== undefined) return hit;
  const c = parseHex(hex);
  const out = "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  rgbaCache.set(key, out);
  return out;
}

/** Non-cached rgba string from an RGB tuple (used for fixed gradient stops at derive time). */
function rgbaStr(rgb: RGB, a: number): string {
  const q = Math.round(clamp(a, 0, 1) * 1000) / 1000;
  return "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + q + ")";
}

function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

function luminance(rgb: RGB): number {
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
}

/** Palette of parsed theme colors, rebuilt only when the theme changes. */
interface Palette {
  accentHex: string;
  accent2Hex: string;
  textHex: string;
  bgHex: string;
  accent: RGB;
  accent2: RGB;
  text: RGB;
  bg: RGB;
}

function buildPalette(c: RendererOpts["colors"]): Palette {
  return {
    accentHex: c.accent,
    accent2Hex: c.accent2,
    textHex: c.text,
    bgHex: c.bg,
    accent: parseHex(c.accent),
    accent2: parseHex(c.accent2),
    text: parseHex(c.text),
    bg: parseHex(c.bg),
  };
}

// ---------------------------------------------------------------------------
// Renderer state plumbing
// ---------------------------------------------------------------------------

interface BaseState {
  /** Accumulated speed-scaled time in seconds (drives phases). */
  t: number;
  /** Last clamped frame delta in ms (drives cooldowns / lifetimes). */
  ms: number;
  pal: Palette;
  /** True when the palette changed and derived colors/sprites must rebuild. */
  palDirty: boolean;
  /** Last seen canvas size (-1 before first layout). */
  lw: number;
  lh: number;
}

/**
 * Advances a state's clock. Returns the motion factor `k`
 * (frames-equivalent since last draw, speed-scaled) for `x += vx * k`.
 */
function advance(s: BaseState, dt: number, speed: number): number {
  const ms = dt > 0 && isFinite(dt) ? Math.min(dt, 64) : 0;
  const sp = clamp(speed, 0, 3);
  s.ms = ms;
  s.t += (ms / 1000) * sp;
  return (ms / MS_PER_FRAME) * sp;
}

/** Proportionally moves particles when the canvas is resized. */
function rescaleXY(items: Array<{ x: number; y: number }>, w: number, h: number, lw: number, lh: number): void {
  if (lw <= 0 || lh <= 0 || items.length === 0) return;
  const rx = w / lw;
  const ry = h / lh;
  if (rx === 1 && ry === 1) return;
  for (let i = 0; i < items.length; i++) {
    items[i].x *= rx;
    items[i].y *= ry;
  }
}

interface RendererSpec<S extends BaseState> {
  /** Create the state (called once per canvas context). */
  create: (opts: RendererOpts) => S;
  /** Rebuild color-derived assets (strings, sprites). Called when the palette changes. */
  derive?: (s: S) => void;
  /** Recompute geometry/counts. Called on init and whenever the size changes. */
  layout?: (s: S, w: number, h: number, opts: RendererOpts) => void;
  /** Draw one frame. */
  draw: (s: S, ctx: CanvasRenderingContext2D, dt: number, w: number, h: number, opts: RendererOpts) => void;
}

/**
 * Binds a spec into a `Renderer`. State is kept per canvas context (a single
 * renderer object can safely drive several canvases, e.g. main + preview).
 */
function bindRenderer<S extends BaseState>(spec: RendererSpec<S>): Renderer {
  const entries: Array<{ ctx: CanvasRenderingContext2D; s: S }> = [];
  const obtain = (ctx: CanvasRenderingContext2D, opts: RendererOpts): S => {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].ctx === ctx) return entries[i].s;
    }
    const s = spec.create(opts);
    entries.push({ ctx: ctx, s: s });
    return s;
  };
  const prepare = (s: S, opts: RendererOpts): void => {
    const c = opts.colors;
    if (
      s.pal.accentHex !== c.accent ||
      s.pal.accent2Hex !== c.accent2 ||
      s.pal.textHex !== c.text ||
      s.pal.bgHex !== c.bg
    ) {
      s.pal = buildPalette(c);
      s.palDirty = true;
    }
    if (s.palDirty && spec.derive) spec.derive(s);
    s.palDirty = false;
  };
  return {
    init(ctx, w, h, opts) {
      if (w <= 0 || h <= 0) return;
      const s = obtain(ctx, opts);
      prepare(s, opts);
      if (spec.layout) spec.layout(s, w, h, opts);
      s.lw = w;
      s.lh = h;
    },
    frame(ctx, dt, w, h, opts) {
      if (w <= 0 || h <= 0) return;
      const s = obtain(ctx, opts);
      prepare(s, opts);
      if (s.lw !== w || s.lh !== h) {
        if (spec.layout) spec.layout(s, w, h, opts);
        s.lw = w;
        s.lh = h;
      }
      spec.draw(s, ctx, dt, w, h, opts);
      // leave the context neutral for the caller's clear / fade fill
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.shadowBlur = 0;
      ctx.shadowColor = "rgba(0,0,0,0)";
    },
  };
}

// ---------------------------------------------------------------------------
// Glow sprites (pre-rendered radial gradients, drawn via drawImage)
// ---------------------------------------------------------------------------

function buildGlowSprite(rgb: RGB, size: number, core: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null; // SSR guard — fallback path below
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const g = cv.getContext("2d");
  if (!g) return null;
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, rgbaStr(rgb, core));
  grad.addColorStop(0.22, rgbaStr(rgb, core * 0.6));
  grad.addColorStop(0.55, rgbaStr(rgb, core * 0.2));
  grad.addColorStop(1, rgbaStr(rgb, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return cv;
}

/** Draws a soft glow dot — sprite when available, live gradient as fallback. */
function drawGlow(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement | null,
  rgb: RGB,
  x: number,
  y: number,
  radius: number,
  alpha: number,
): void {
  if (alpha <= 0.003 || radius <= 0) return;
  ctx.globalAlpha = clamp(alpha, 0, 1);
  if (sprite !== null) {
    ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
    return;
  }
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, rgbaStr(rgb, 1));
  grad.addColorStop(0.5, rgbaStr(rgb, 0.3));
  grad.addColorStop(1, rgbaStr(rgb, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// 1. starfield — 3 parallax layers drifting sideways, twinkle + shooting
//    stars. TRAIL renderer: the caller's rgba(bg, 0.2) fade turns drift into
//    subtle streaks and stretches shooting stars.
// ---------------------------------------------------------------------------

interface Star {
  x: number; y: number; r: number;
  vx: number; vy: number;
  tw: number; twS: number; a: number; accent: boolean;
}

interface ShootingStar {
  x: number; y: number; vx: number; vy: number; life: number;
}

interface StarfieldState extends BaseState {
  stars: Star[];
  shoots: ShootingStar[];
  shootCd: number;
  textStr: string;
  accentStr: string;
}

interface StarLayerDef { spd: number; rMin: number; rMax: number; a: number; }

const STAR_LAYERS: StarLayerDef[] = [
  { spd: 0.12, rMin: 0.4, rMax: 0.9, a: 0.35 }, // far
  { spd: 0.34, rMin: 0.6, rMax: 1.3, a: 0.55 }, // mid
  { spd: 0.8, rMin: 0.9, rMax: 1.9, a: 0.85 }, // near
];

function newStar(w: number, h: number): Star {
  const roll = Math.random();
  const L = roll < 0.45 ? STAR_LAYERS[0] : roll < 0.78 ? STAR_LAYERS[1] : STAR_LAYERS[2];
  return {
    x: rand(0, w),
    y: rand(0, h),
    r: rand(L.rMin, L.rMax),
    vx: -L.spd,
    vy: L.spd * 0.06,
    tw: rand(0, TAU),
    twS: rand(0.4, 2.2),
    a: L.a,
    accent: Math.random() < 0.12,
  };
}

const starfield = bindRenderer<StarfieldState>({
  create(opts) {
    return {
      t: 0, ms: 0, pal: buildPalette(opts.colors), palDirty: true, lw: -1, lh: -1,
      stars: [], shoots: [], shootCd: 1200, textStr: "", accentStr: "",
    };
  },
  derive(s) {
    s.textStr = hexToRgba(s.pal.textHex, 1);
    s.accentStr = hexToRgba(s.pal.accentHex, 1);
  },
  layout(s, w, h) {
    rescaleXY(s.stars, w, h, s.lw, s.lh);
    rescaleXY(s.shoots, w, h, s.lw, s.lh);
  },
  draw(s, ctx, dt, w, h, opts) {
    const k = advance(s, dt, opts.speed);
    const am = alphaScale(opts.intensity);
    const t = s.t;
    const target = scaledCount(170, opts.intensity, w, h, 24, 340);
    while (s.stars.length < target) s.stars.push(newStar(w, h));
    if (s.stars.length > target) s.stars.length = target;

    for (let i = 0; i < s.stars.length; i++) {
      const st = s.stars[i];
      st.x += st.vx * k;
      st.y += st.vy * k;
      if (st.x < -4) st.x += w + 8;
      else if (st.x > w + 4) st.x -= w + 8;
      if (st.y < -4) st.y += h + 8;
      else if (st.y > h + 4) st.y -= h + 8;
    }

    // occasional shooting stars, gated on intensity
    if (opts.intensity > 0.6 && s.shoots.length < 2) {
      s.shootCd -= s.ms;
      if (s.shootCd <= 0) {
        s.shootCd = rand(2200, 8000) / (0.3 + opts.intensity);
        const dir = Math.random() < 0.5 ? -1 : 1;
        s.shoots.push({
          x: rand(w * 0.15, w * 0.85),
          y: rand(0, h * 0.35),
          vx: dir * rand(5, 8),
          vy: rand(2.2, 3.6),
          life: rand(450, 850),
        });
      }
    }

    // stars — text color at low alpha, a few accent colored
    ctx.fillStyle = s.textStr;
    for (let i = 0; i < s.stars.length; i++) {
      const st = s.stars[i];
      if (st.accent) continue;
      const twk = 0.55 + 0.45 * Math.sin(t * st.twS + st.tw);
      ctx.globalAlpha = st.a * twk * am;
      ctx.beginPath();
      ctx.moveTo(st.x + st.r, st.y);
      ctx.arc(st.x, st.y, st.r, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = s.accentStr;
    for (let i = 0; i < s.stars.length; i++) {
      const st = s.stars[i];
      if (!st.accent) continue;
      const twk = 0.55 + 0.45 * Math.sin(t * st.twS + st.tw);
      ctx.globalAlpha = st.a * twk * am;
      ctx.beginPath();
      ctx.moveTo(st.x + st.r, st.y);
      ctx.arc(st.x, st.y, st.r, 0, TAU);
      ctx.fill();
    }

    // shooting stars — bright short heads; the persistence fade does the tail
    ctx.lineCap = "round";
    ctx.strokeStyle = s.accentStr;
    for (let i = s.shoots.length - 1; i >= 0; i--) {
      const sh = s.shoots[i];
      sh.x += sh.vx * k;
      sh.y += sh.vy * k;
      sh.life -= s.ms;
      if (sh.life <= 0 || sh.x < -80 || sh.x > w + 80 || sh.y < -80 || sh.y > h + 80) {
        s.shoots.splice(i, 1);
        continue;
      }
      const fade = clamp(sh.life / 260, 0, 1);
      const sp = Math.sqrt(sh.vx * sh.vx + sh.vy * sh.vy);
      const ux = sh.vx / sp;
      const uy = sh.vy / sp;
      ctx.globalAlpha = 0.2 * fade * am;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(sh.x - ux * 48, sh.y - uy * 48);
      ctx.lineTo(sh.x, sh.y);
      ctx.stroke();
      ctx.globalAlpha = 0.9 * fade * am;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(sh.x - ux * 12, sh.y - uy * 12);
      ctx.lineTo(sh.x, sh.y);
      ctx.stroke();
      ctx.globalAlpha = 0.95 * fade * am;
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, 1.6, 0, TAU);
      ctx.fill();
    }
  },
});

// ---------------------------------------------------------------------------
// 2. galaxy — slowly rotating disc of stars + 3 soft nebula blobs orbiting
//    the center + sparse larger glowing stars.
// ---------------------------------------------------------------------------

interface GalaxyStar {
  ang: number; distF: number; angSpd: number;
  r: number; tw: number; twS: number; a: number; accent: boolean;
}

interface GlowStar {
  ang: number; orbitF: number; angSpd: number;
  r: number; pulse: number; pulseS: number; si: number;
}

interface GalaxyBlob {
  ang: number; angSpd: number; orbitF: number; rF: number; a: number; ci: number;
  c0: string; c1: string; c2: string;
}

interface GalaxyState extends BaseState {
  stars: GalaxyStar[];
  glowStars: GlowStar[];
  blobs: GalaxyBlob[];
  spriteA: HTMLCanvasElement | null;
  spriteB: HTMLCanvasElement | null;
  textStr: string;
  accentStr: string;
}

function newGalaxyStar(): GalaxyStar {
  return {
    ang: rand(0, TAU),
    distF: rand(0.04, 1.0),
    angSpd: rand(0.0005, 0.0022) * (Math.random() < 0.15 ? -1 : 1),
    r: rand(0.4, 1.3),
    tw: rand(0, TAU),
    twS: rand(0.4, 2.2),
    a: rand(0.3, 0.8),
    accent: Math.random() < 0.12,
  };
}

function newGlowStar(): GlowStar {
  return {
    ang: rand(0, TAU),
    orbitF: rand(0.1, 0.9),
    angSpd: rand(0.0008, 0.003),
    r: rand(1.1, 2.2),
    pulse: rand(0, TAU),
    pulseS: rand(0.3, 1.1),
    si: Math.random() < 0.6 ? 0 : 1,
  };
}

const galaxy = bindRenderer<GalaxyState>({
  create(opts) {
    const blobs: GalaxyBlob[] = [];
    for (let i = 0; i < 3; i++) {
      blobs.push({
        ang: rand(0, TAU),
        angSpd: rand(0.0006, 0.002) * (Math.random() < 0.4 ? -1 : 1),
        orbitF: rand(0.05, 0.13),
        rF: rand(0.3, 0.45),
        a: rand(0.04, 0.06),
        ci: i % 3,
        c0: "", c1: "", c2: "",
      });
    }
    return {
      t: 0, ms: 0, pal: buildPalette(opts.colors), palDirty: true, lw: -1, lh: -1,
      stars: [], glowStars: [], blobs: blobs,
      spriteA: null, spriteB: null, textStr: "", accentStr: "",
    };
  },
  derive(s) {
    s.textStr = hexToRgba(s.pal.textHex, 1);
    s.accentStr = hexToRgba(s.pal.accentHex, 1);
    s.spriteA = buildGlowSprite(s.pal.accent, 64, 1);
    s.spriteB = buildGlowSprite(s.pal.accent2, 64, 1);
    for (let i = 0; i < s.blobs.length; i++) {
      const b = s.blobs[i];
      const rgb = b.ci === 0 ? s.pal.accent : b.ci === 1 ? s.pal.accent2 : mixRGB(s.pal.accent, s.pal.accent2, 0.5);
      b.c0 = rgbaStr(rgb, b.a);
      b.c1 = rgbaStr(rgb, b.a * 0.45);
      b.c2 = rgbaStr(rgb, 0);
    }
  },
  draw(s, ctx, dt, w, h, opts) {
    const k = advance(s, dt, opts.speed);
    const am = alphaScale(opts.intensity);
    const t = s.t;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const minDim = Math.min(w, h);
    const target = scaledCount(150, opts.intensity, w, h, 20, 320);
    while (s.stars.length < target) s.stars.push(newGalaxyStar());
    if (s.stars.length > target) s.stars.length = target;
    const glowTarget = scaledCount(12, opts.intensity, w, h, 4, 18);
    while (s.glowStars.length < glowTarget) s.glowStars.push(newGlowStar());
    if (s.glowStars.length > glowTarget) s.glowStars.length = glowTarget;

    // nebula blobs (additive, very low alpha)
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < s.blobs.length; i++) {
      const b = s.blobs[i];
      b.ang += b.angSpd * k;
      const bx = cx + Math.cos(b.ang) * b.orbitF * minDim;
      const by = cy + Math.sin(b.ang) * b.orbitF * minDim * 0.7;
      const r = b.rF * minDim;
      const grad = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      grad.addColorStop(0, b.c0);
      grad.addColorStop(0.5, b.c1);
      grad.addColorStop(1, b.c2);
      ctx.globalAlpha = am;
      ctx.fillStyle = grad;
      ctx.fillRect(bx - r, by - r, r * 2, r * 2);
    }

    // disc of stars (slightly elliptical orbits around the center)
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = s.textStr;
    for (let i = 0; i < s.stars.length; i++) {
      const st = s.stars[i];
      if (st.accent) continue;
      st.ang += st.angSpd * k;
      const x = cx + Math.cos(st.ang) * st.distF * minDim;
      const y = cy + Math.sin(st.ang) * st.distF * minDim * 0.72;
      const twk = 0.55 + 0.45 * Math.sin(t * st.twS + st.tw);
      ctx.globalAlpha = st.a * twk * am;
      ctx.beginPath();
      ctx.moveTo(x + st.r, y);
      ctx.arc(x, y, st.r, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = s.accentStr;
    for (let i = 0; i < s.stars.length; i++) {
      const st = s.stars[i];
      if (!st.accent) continue;
      st.ang += st.angSpd * k;
      const x = cx + Math.cos(st.ang) * st.distF * minDim;
      const y = cy + Math.sin(st.ang) * st.distF * minDim * 0.72;
      const twk = 0.55 + 0.45 * Math.sin(t * st.twS + st.tw);
      ctx.globalAlpha = st.a * twk * am;
      ctx.beginPath();
      ctx.moveTo(x + st.r, y);
      ctx.arc(x, y, st.r, 0, TAU);
      ctx.fill();
    }

    // sparse larger glowing stars
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < s.glowStars.length; i++) {
      const g = s.glowStars[i];
      g.ang += g.angSpd * k;
      const x = cx + Math.cos(g.ang) * g.orbitF * minDim;
      const y = cy + Math.sin(g.ang) * g.orbitF * minDim * 0.72;
      const b = 0.5 + 0.5 * Math.sin(t * g.pulseS + g.pulse);
      const alpha = (0.12 + 0.88 * b * b) * am;
      drawGlow(ctx, g.si === 0 ? s.spriteA : s.spriteB, g.si === 0 ? s.pal.accent : s.pal.accent2, x, y, g.r * 7, alpha);
    }
  },
});

// ---------------------------------------------------------------------------
// 3. nebula — 5 huge soft blobs drifting on slow sine paths. The blur look is
//    faked by stacking two low-alpha radial gradients per blob. No stars.
// ---------------------------------------------------------------------------

interface NebulaBlob {
  bx: number; by: number; ax: number; ay: number;
  f1: number; f2: number; p1: number; p2: number; p3: number;
  rF: number; pulseA: number; pulseF: number;
  a: number; ci: number;
  o0: string; o1: string; o2: string; // halo layer stops
  c0: string; c1: string; c2: string; // core layer stops
}

interface NebulaState extends BaseState {
  blobs: NebulaBlob[];
}

const nebula = bindRenderer<NebulaState>({
  create(opts) {
    const blobs: NebulaBlob[] = [];
    for (let i = 0; i < 5; i++) {
      blobs.push({
        bx: rand(0.18, 0.82),
        by: rand(0.18, 0.82),
        ax: rand(0.05, 0.13),
        ay: rand(0.05, 0.13),
        f1: rand(0.02, 0.07),
        f2: rand(0.02, 0.07),
        p1: rand(0, TAU),
        p2: rand(0, TAU),
        p3: rand(0, TAU),
        rF: rand(0.34, 0.6),
        pulseA: rand(0.06, 0.12),
        pulseF: rand(0.03, 0.06),
        a: rand(0.05, 0.09),
        ci: randInt(0, 3),
        o0: "", o1: "", o2: "",
        c0: "", c1: "", c2: "",
      });
    }
    return { t: 0, ms: 0, pal: buildPalette(opts.colors), palDirty: true, lw: -1, lh: -1, blobs: blobs };
  },
  derive(s) {
    for (let i = 0; i < s.blobs.length; i++) {
      const b = s.blobs[i];
      const rgb =
        b.ci === 0 ? s.pal.accent
        : b.ci === 1 ? s.pal.accent2
        : b.ci === 2 ? mixRGB(s.pal.accent, s.pal.accent2, 0.5)
        : mixRGB(s.pal.accent, s.pal.accent2, 0.25);
      b.o0 = rgbaStr(rgb, b.a * 0.55);
      b.o1 = rgbaStr(rgb, b.a * 0.22);
      b.o2 = rgbaStr(rgb, 0);
      b.c0 = rgbaStr(rgb, b.a);
      b.c1 = rgbaStr(rgb, b.a * 0.4);
      b.c2 = b.o2;
    }
  },
  draw(s, ctx, dt, w, h, opts) {
    advance(s, dt, opts.speed);
    const am = alphaScale(opts.intensity);
    const t = s.t;
    const minDim = Math.min(w, h);
    ctx.globalAlpha = am;
    for (let i = 0; i < s.blobs.length; i++) {
      const b = s.blobs[i];
      const bx = (b.bx + Math.sin(t * b.f1 + b.p1) * b.ax) * w;
      const by = (b.by + Math.sin(t * b.f2 + b.p2) * b.ay) * h;
      const r = b.rF * minDim * (1 + Math.sin(t * b.pulseF + b.p3) * b.pulseA);
      // wide halo
      let grad = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      grad.addColorStop(0, b.o0);
      grad.addColorStop(0.6, b.o1);
      grad.addColorStop(1, b.o2);
      ctx.fillStyle = grad;
      ctx.fillRect(bx - r, by - r, r * 2, r * 2);
      // brighter core — layered gradients fake a heavy blur
      const cr = r * 0.55;
      grad = ctx.createRadialGradient(bx, by, 0, bx, by, cr);
      grad.addColorStop(0, b.c0);
      grad.addColorStop(0.7, b.c1);
      grad.addColorStop(1, b.c2);
      ctx.fillStyle = grad;
      ctx.fillRect(bx - cr, by - cr, cr * 2, cr * 2);
    }
  },
});

// ---------------------------------------------------------------------------
// 4. aurora — 4 tall translucent curtains whose x positions and top edges
//    wobble with layered sines, plus drifting horizontal shimmer bands.
//    Additive ('lighter') compositing at low alpha.
// ---------------------------------------------------------------------------

interface Curtain {
  xf: number; wF: number; mix: number;
  s1: number; s2: number;
  p1: number; p2: number; p3: number;
  c0: string; c1: string; c2: string;
  edge: string;
}

interface AuroraBand {
  yf: number; spd: number; p: number;
  cMid: string; cT: string;
}

interface AuroraState extends BaseState {
  curtains: Curtain[];
  bands: AuroraBand[];
}

const AURORA_SAMPLES = 26;

const aurora = bindRenderer<AuroraState>({
  create(opts) {
    const curtains: Curtain[] = [];
    const mixes = [0, 1, 0.5, 0.28];
    for (let i = 0; i < 4; i++) {
      curtains.push({
        xf: 0.16 + i * 0.22 + rand(-0.03, 0.03),
        wF: rand(0.16, 0.3),
        mix: mixes[i],
        s1: rand(0.6, 1.4),
        s2: rand(0.6, 1.4),
        p1: rand(0, TAU),
        p2: rand(0, TAU),
        p3: rand(0, TAU),
        c0: "", c1: "", c2: "", edge: "",
      });
    }
    const bands: AuroraBand[] = [];
    for (let i = 0; i < 3; i++) {
      bands.push({ yf: rand(0.15, 0.75), spd: rand(0.02, 0.05), p: rand(0, TAU), cMid: "", cT: "" });
    }
    return { t: 0, ms: 0, pal: buildPalette(opts.colors), palDirty: true, lw: -1, lh: -1, curtains: curtains, bands: bands };
  },
  derive(s) {
    for (let i = 0; i < s.curtains.length; i++) {
      const cu = s.curtains[i];
      const a = mixRGB(s.pal.accent, s.pal.accent2, cu.mix);
      const b = mixRGB(s.pal.accent, s.pal.accent2, 1 - cu.mix);
      cu.c0 = rgbaStr(a, 0.16);
      cu.c1 = rgbaStr(b, 0.09);
      cu.c2 = rgbaStr(b, 0);
      cu.edge = rgbaStr(a, 0.22);
    }
    for (let i = 0; i < s.bands.length; i++) {
      const bd = s.bands[i];
      const rgb = mixRGB(s.pal.accent, s.pal.accent2, 0.3 + i * 0.2);
      bd.cMid = rgbaStr(rgb, 0.05);
      bd.cT = rgbaStr(rgb, 0);
    }
  },
  draw(s, ctx, dt, w, h, opts) {
    advance(s, dt, opts.speed);
    const am = alphaScale(opts.intensity);
    const t = s.t;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = am;

    for (let c = 0; c < s.curtains.length; c++) {
      const cu = s.curtains[c];
      const xC = (cu.xf + Math.sin(t * 0.1 + cu.p3) * 0.03) * w;
      const halfW = cu.wF * w * 0.5;
      // wavy top edge polyline
      ctx.beginPath();
      for (let j = 0; j < AURORA_SAMPLES; j++) {
        const u = j / (AURORA_SAMPLES - 1);
        const xe = xC - halfW + u * 2 * halfW;
        const y = h * (
          0.02
          + 0.05 * Math.sin(u * TAU * 2.6 * cu.s1 + t * 0.28 + cu.p1)
          + 0.035 * Math.sin(u * TAU * 1.3 - t * 0.19 * cu.s2 + cu.p2)
        );
        if (j === 0) ctx.moveTo(xe, y);
        else ctx.lineTo(xe, y);
      }
      // crisp glowing top edge
      ctx.strokeStyle = cu.edge;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // close down to the bottom and fill with the vertical wash
      ctx.lineTo(xC + halfW, h);
      ctx.lineTo(xC - halfW, h);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, cu.c0);
      grad.addColorStop(0.4, cu.c1);
      grad.addColorStop(1, cu.c2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // slow horizontal shimmer bands (the "banding")
    for (let b = 0; b < s.bands.length; b++) {
      const bd = s.bands[b];
      const yb = (bd.yf + Math.sin(t * bd.spd + bd.p) * 0.08) * h;
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, bd.cT);
      grad.addColorStop(0.5, bd.cMid);
      grad.addColorStop(1, bd.cT);
      ctx.fillStyle = grad;
      ctx.fillRect(0, yb, w, h * 0.09);
    }
  },
});

// ---------------------------------------------------------------------------
// 5. rain — slightly angled 1px streaks in text color; optional splashes at
//    high intensity. Batched into 3 alpha buckets, one stroke each.
// ---------------------------------------------------------------------------

interface Drop { x: number; y: number; len: number; spd: number; ab: number; }
interface Splash { x: number; y: number; vx: number; vy: number; life: number; }
interface RainState extends BaseState { drops: Drop[]; splashes: Splash[]; }

const RAIN_WIND = -0.18; // horizontal drift per unit of fall
const RAIN_ALPHAS = [0.09, 0.13, 0.18];

function newDrop(w: number, h: number): Drop {
  return {
    x: rand(-w * 0.08, w * 1.08),
    y: rand(-h, h),
    len: rand(9, 20),
    spd: rand(9, 16),
    ab: randInt(0, 2),
  };
}

const rain = bindRenderer<RainState>({
  create(opts) {
    return { t: 0, ms: 0, pal: buildPalette(opts.colors), palDirty: true, lw: -1, lh: -1, drops: [], splashes: [] };
  },
  layout(s, w, h) {
    rescaleXY(s.drops, w, h, s.lw, s.lh);
    rescaleXY(s.splashes, w, h, s.lw, s.lh);
  },
  draw(s, ctx, dt, w, h, opts) {
    const k = advance(s, dt, opts.speed);
    const am = alphaScale(opts.intensity);
    const target = scaledCount(180, opts.intensity, w, h, 30, 460);
    while (s.drops.length < target) s.drops.push(newDrop(w, h));
    if (s.drops.length > target) s.drops.length = target;
    const splashOn = opts.intensity > 0.6;

    for (let i = 0; i < s.drops.length; i++) {
      const d = s.drops[i];
      d.y += d.spd * k;
      d.x += d.spd * RAIN_WIND * k;
      if (d.x < -w * 0.1) d.x += w * 1.2;
      else if (d.x > w * 1.1) d.x -= w * 1.2;
      if (d.y > h + d.len) {
        if (splashOn && s.splashes.length < 24 && Math.random() < 0.35) {
          for (let j = 0; j < 2; j++) {
            s.splashes.push({
              x: d.x,
              y: h - 2,
              vx: rand(0.4, 1.3) * (Math.random() < 0.5 ? -1 : 1),
              vy: -rand(0.9, 2.0),
              life: rand(240, 420),
            });
          }
        }
        d.y = -d.len - rand(0, h * 0.25);
        d.x = rand(-w * 0.08, w * 1.08);
      }
    }

    ctx.lineWidth = 1;
    for (let b = 0; b < 3; b++) {
      ctx.strokeStyle = hexToRgba(s.pal.textHex, RAIN_ALPHAS[b] * am);
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < s.drops.length; i++) {
        const d = s.drops[i];
        if (d.ab !== b) continue;
        any = true;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - RAIN_WIND * d.len, d.y - d.len);
      }
      if (any) ctx.stroke();
    }

    if (s.splashes.length > 0) {
      ctx.fillStyle = hexToRgba(s.pal.textHex, 0.35 * am);
      for (let i = s.splashes.length - 1; i >= 0; i--) {
        const sp = s.splashes[i];
        sp.vy += 0.09 * k;
        sp.x += sp.vx * k;
        sp.y += sp.vy * k;
        sp.life -= s.ms;
        if (sp.life <= 0 || sp.y > h + 4) {
          s.splashes.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = clamp(sp.life / 320, 0, 1);
        ctx.fillRect(sp.x, sp.y, 1.4, 1.4);
      }
      ctx.globalAlpha = 1;
    }
  },
});

// ---------------------------------------------------------------------------
// 6. snow — soft circles with per-flake radius, sine sway and fall speed.
//    Near-white on dark themes; mid-gray on light themes (dark text color).
// ---------------------------------------------------------------------------

interface Flake {
  x: number; y: number; r: number;
  swayA: number; swayF: number; p: number;
  fall: number; drift: number; ab: number;
}

interface SnowState extends BaseState { flakes: Flake[]; snowStr: string; }

const SNOW_ALPHAS = [0.3, 0.45, 0.6];

function newFlake(w: number, h: number): Flake {
  return {
    x: rand(0, w),
    y: rand(-h, h),
    r: rand(0.8, 2.6),
    swayA: rand(8, 30),
    swayF: rand(0.2, 0.7),
    p: rand(0, TAU),
    fall: rand(0.35, 1.1),
    drift: rand(-0.08, 0.08),
    ab: randInt(0, 2),
  };
}

const snow = bindRenderer<SnowState>({
  create(opts) {
    return { t: 0, ms: 0, pal: buildPalette(opts.colors), palDirty: true, lw: -1, lh: -1, flakes: [], snowStr: "" };
  },
  derive(s) {
    const snowRGB = luminance(s.pal.text) < 0.5 ? ([148, 152, 162] as RGB) : s.pal.text;
    s.snowStr = rgbaStr(snowRGB, 1);
  },
  layout(s, w, h) {
    rescaleXY(s.flakes, w, h, s.lw, s.lh);
  },
  draw(s, ctx, dt, w, h, opts) {
    const k = advance(s, dt, opts.speed);
    const am = alphaScale(opts.intensity);
    const t = s.t;
    const target = scaledCount(140, opts.intensity, w, h, 20, 380);
    while (s.flakes.length < target) s.flakes.push(newFlake(w, h));
    if (s.flakes.length > target) s.flakes.length = target;

    for (let i = 0; i < s.flakes.length; i++) {
      const f = s.flakes[i];
      f.y += f.fall * k;
      f.x += f.drift * k;
      if (f.y > h + f.r + 2) {
        f.y = -f.r - rand(0, h * 0.08);
        f.x = rand(0, w);
      }
      if (f.x < -6) f.x += w + 12;
      else if (f.x > w + 6) f.x -= w + 12;
    }

    ctx.fillStyle = s.snowStr;
    for (let b = 0; b < 3; b++) {
      ctx.globalAlpha = SNOW_ALPHAS[b] * am;
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < s.flakes.length; i++) {
        const f = s.flakes[i];
        if (f.ab !== b) continue;
        any = true;
        const dx = f.x + Math.sin(t * f.swayF + f.p) * f.swayA;
        ctx.moveTo(dx + f.r, f.y);
        ctx.arc(dx, f.y, f.r, 0, TAU);
      }
      if (any) ctx.fill();
    }
  },
});

// ---------------------------------------------------------------------------
// 7. petals — small rotated ellipses in accent colors, fluttering (rotation
//    oscillation + sine sway) while falling gently.
// ---------------------------------------------------------------------------

interface Petal {
  x: number; y: number; rx: number; ry: number;
  rot: number; rotS: number;
  swayA: number; swayF: number; p: number;
  fall: number; ab: number; ci: number;
}

interface PetalsState extends BaseState { petals: Petal[]; colors: string[]; }

const PETAL_ALPHAS = [0.25, 0.35, 0.45];

function newPetal(w: number, h: number): Petal {
  const rx = rand(5, 10);
  return {
    x: rand(0, w),
    y: rand(-h, h),
    rx: rx,
    ry: rx * rand(0.4, 0.6),
    rot: rand(0, TAU),
    rotS: rand(0.2, 0.8) * (Math.random() < 0.5 ? -1 : 1),
    swayA: rand(10, 40),
    swayF: rand(0.3, 0.9),
    p: rand(0, TAU),
    fall: rand(0.5, 1.2),
    ab: randInt(0, 2),
    ci: Math.random() < 0.6 ? 0 : randInt(1, 2),
  };
}

const petals = bindRenderer<PetalsState>({
  create(opts) {
    return {
      t: 0, ms: 0, pal: buildPalette(opts.colors), palDirty: true, lw: -1, lh: -1,
      petals: [], colors: ["", "", ""],
    };
  },
  derive(s) {
    s.colors[0] = hexToRgba(s.pal.accentHex, 1);
    s.colors[1] = hexToRgba(s.pal.accent2Hex, 1);
    s.colors[2] = rgbaStr(mixRGB(s.pal.accent, s.pal.accent2, 0.5), 1);
  },
  layout(s, w, h) {
    rescaleXY(s.petals, w, h, s.lw, s.lh);
  },
  draw(s, ctx, dt, w, h, opts) {
    const k = advance(s, dt, opts.speed);
    const am = alphaScale(opts.intensity);
    const t = s.t;
    const target = scaledCount(46, opts.intensity, w, h, 8, 120);
    while (s.petals.length < target) s.petals.push(newPetal(w, h));
    if (s.petals.length > target) s.petals.length = target;

    for (let i = 0; i < s.petals.length; i++) {
      const pt = s.petals[i];
      pt.y += pt.fall * k;
      pt.rot += pt.rotS * k;
      if (pt.y > h + pt.ry + 4) {
        pt.y = -pt.ry * 2 - rand(0, h * 0.1);
        pt.x = rand(0, w);
      }
    }

    for (let ci = 0; ci < 3; ci++) {
      ctx.fillStyle = s.colors[ci];
      for (let b = 0; b < 3; b++) {
        ctx.globalAlpha = PETAL_ALPHAS[b] * am;
        ctx.beginPath();
        let any = false;
        for (let i = 0; i < s.petals.length; i++) {
          const pt = s.petals[i];
          if (pt.ci !== ci || pt.ab !== b) continue;
          any = true;
          const dx = pt.x + Math.sin(t * pt.swayF + pt.p) * pt.swayA;
          const rr = pt.rot + Math.sin(t * pt.swayF * 1.7 + pt.p) * 0.75; // flutter
          ctx.moveTo(dx + pt.rx * Math.cos(rr), pt.y + pt.rx * Math.sin(rr));
          ctx.ellipse(dx, pt.y, pt.rx, pt.ry, rr, 0, TAU);
        }
        if (any) ctx.fill();
      }
    }
  },
});

// ---------------------------------------------------------------------------
// 8. fireflies — 20..60 glowing dots meandering on a random walk, each
//    pulsing brightness on its own phase. Additive glow sprites.
// ---------------------------------------------------------------------------

interface Fly {
  x: number; y: number; vx: number; vy: number;
  p: number; pulseS: number; r: number; si: number; turn: number;
}

interface FirefliesState extends BaseState {
  flies: Fly[];
  spriteA: HTMLCanvasElement | null;
  spriteB: HTMLCanvasElement | null;
}

function newFly(w: number, h: number): Fly {
  return {
    x: rand(0, w),
    y: rand(0, h),
    vx: rand(-0.2, 0.2),
    vy: rand(-0.2, 0.2),
    p: rand(0, TAU),
    pulseS: rand(0.4, 1.3),
    r: rand(0.9, 1.8),
    si: Math.random() < 0.7 ? 0 : 1,
    turn: rand(0.012, 0.05),
  };
}

const fireflies = bindRenderer<FirefliesState>({
  create(opts) {
    return {
      t: 0, ms: 0, pal: buildPalette(opts.colors), palDirty: true, lw: -1, lh: -1,
      flies: [], spriteA: null, spriteB: null,
    };
  },
  derive(s) {
    s.spriteA = buildGlowSprite(s.pal.accent, 64, 1);
    s.spriteB = buildGlowSprite(s.pal.accent2, 64, 1);
  },
  layout(s, w, h) {
    rescaleXY(s.flies, w, h, s.lw, s.lh);
  },
  draw(s, ctx, dt, w, h, opts) {
    const k = advance(s, dt, opts.speed);
    const am = alphaScale(opts.intensity);
    const t = s.t;
    const target = scaledCount(46, opts.intensity, w, h, 20, 60);
    while (s.flies.length < target) s.flies.push(newFly(w, h));
    if (s.flies.length > target) s.flies.length = target;

    ctx.globalCompositeOperation = "lighter";
    const margin = 36;
    for (let i = 0; i < s.flies.length; i++) {
      const f = s.flies[i];
      // noise-ish random walk with soft steering back from the edges
      f.vx += rand(-1, 1) * f.turn * k;
      f.vy += rand(-1, 1) * f.turn * k;
      if (f.x < margin) f.vx += 0.05 * k;
      else if (f.x > w - margin) f.vx -= 0.05 * k;
      if (f.y < margin) f.vy += 0.05 * k;
      else if (f.y > h - margin) f.vy -= 0.05 * k;
      f.vx = clamp(f.vx, -0.65, 0.65);
      f.vy = clamp(f.vy, -0.65, 0.65);
      f.x += f.vx * k;
      f.y += f.vy * k;
      if (f.x < 0) { f.x = 0; f.vx = Math.abs(f.vx); }
      else if (f.x > w) { f.x = w; f.vx = -Math.abs(f.vx); }
      if (f.y < 0) { f.y = 0; f.vy = Math.abs(f.vy); }
      else if (f.y > h) { f.y = h; f.vy = -Math.abs(f.vy); }

      const b = 0.5 + 0.5 * Math.sin(t * f.pulseS + f.p);
      const alpha = (0.1 + 0.9 * b * b) * am;
      drawGlow(ctx, f.si === 0 ? s.spriteA : s.spriteB, f.si === 0 ? s.pal.accent : s.pal.accent2, f.x, f.y, f.r * 7, alpha);
    }
  },
});

// ---------------------------------------------------------------------------
// 9. embers — particles rising from the bottom with flicker, horizontal
//    wobble and shrink; fading out near the top, respawning at the bottom.
// ---------------------------------------------------------------------------

interface Ember {
  x: number; y: number; vy: number; drift: number;
  wobA: number; wobF: number; p: number; flickS: number;
  r: number; si: number;
}

interface EmbersState extends BaseState {
  embers: Ember[];
  spriteA: HTMLCanvasElement | null;
  spriteWarm: HTMLCanvasElement | null;
  warm: RGB;
}

function newEmber(w: number, h: number): Ember {
  return {
    x: rand(w * 0.08, w * 0.92),
    y: rand(h * 0.55, h + 24),
    vy: -rand(0.28, 0.75),
    drift: rand(-0.06, 0.06),
    wobA: rand(6, 22),
    wobF: rand(0.25, 0.9),
    p: rand(0, TAU),
    flickS: rand(4, 9),
    r: rand(0.9, 2.1),
    si: Math.random() < 0.55 ? 0 : 1,
  };
}

const embers = bindRenderer<EmbersState>({
  create(opts) {
    return {
      t: 0, ms: 0, pal: buildPalette(opts.colors), palDirty: true, lw: -1, lh: -1,
      embers: [], spriteA: null, spriteWarm: null, warm: [255, 150, 70],
    };
  },
  derive(s) {
    s.warm = mixRGB(s.pal.accent, [255, 150, 70], 0.6);
    s.spriteA = buildGlowSprite(s.pal.accent, 64, 1);
    s.spriteWarm = buildGlowSprite(s.warm, 64, 1);
  },
  layout(s, w, h) {
    rescaleXY(s.embers, w, h, s.lw, s.lh);
  },
  draw(s, ctx, dt, w, h, opts) {
    const k = advance(s, dt, opts.speed);
    const am = alphaScale(opts.intensity);
    const t = s.t;
    const target = scaledCount(64, opts.intensity, w, h, 14, 160);
    while (s.embers.length < target) s.embers.push(newEmber(w, h));
    if (s.embers.length > target) s.embers.length = target;

    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < s.embers.length; i++) {
      let e = s.embers[i];
      e.y += e.vy * k;
      e.x += e.drift * k;
      if (e.y < -14) {
        // respawn at the bottom with fresh parameters
        e = newEmber(w, h);
        e.y = h + rand(0, 30);
        s.embers[i] = e;
        continue;
      }
      const dx = e.x + Math.sin(t * e.wobF + e.p) * e.wobA;
      const prog = 1 - e.y / h; // 0 at the bottom, ~1 at the top
      const fade = clamp(1 - prog * 1.15, 0, 1);
      if (fade <= 0.02) continue;
      const flick = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * e.flickS + e.p * 3.1));
      const jitter = 0.9 + 0.1 * Math.random();
      const alpha = fade * flick * jitter * am;
      const radius = e.r * 8 * (0.55 + 0.45 * fade); // shrinks as it rises
      drawGlow(ctx, e.si === 0 ? s.spriteA : s.spriteWarm, e.si === 0 ? s.pal.accent : s.warm, dx, e.y, radius, alpha);
    }
  },
});

// ---------------------------------------------------------------------------
// 10. dust — very sparse tiny dots (text color ~14% alpha) drifting slowly in
//     fixed random directions with a gentle global breathing. Extremely calm.
// ---------------------------------------------------------------------------

interface Mote { x: number; y: number; vx: number; vy: number; r: number; p: number; s: number; }
interface DustState extends BaseState { motes: Mote[]; textStr: string; }

function newMote(w: number, h: number): Mote {
  return {
    x: rand(0, w),
    y: rand(0, h),
    vx: rand(-0.05, 0.05),
    vy: rand(-0.05, 0.05),
    r: rand(0.6, 1.4),
    p: rand(0, TAU),
    s: rand(0.1, 0.5),
  };
}

const dust = bindRenderer<DustState>({
  create(opts) {
    return { t: 0, ms: 0, pal: buildPalette(opts.colors), palDirty: true, lw: -1, lh: -1, motes: [], textStr: "" };
  },
  derive(s) {
    s.textStr = hexToRgba(s.pal.textHex, 1);
  },
  layout(s, w, h) {
    rescaleXY(s.motes, w, h, s.lw, s.lh);
  },
  draw(s, ctx, dt, w, h, opts) {
    const k = advance(s, dt, opts.speed);
    const am = alphaScale(opts.intensity);
    const t = s.t;
    const target = scaledCount(115, opts.intensity, w, h, 40, 140);
    while (s.motes.length < target) s.motes.push(newMote(w, h));
    if (s.motes.length > target) s.motes.length = target;

    ctx.fillStyle = s.textStr;
    for (let i = 0; i < s.motes.length; i++) {
      const m = s.motes[i];
      m.x += m.vx * k;
      m.y += m.vy * k;
      if (m.x < -2) m.x += w + 4;
      else if (m.x > w + 2) m.x -= w + 4;
      if (m.y < -2) m.y += h + 4;
      else if (m.y > h + 2) m.y -= h + 4;
      const breathe = 0.6 + 0.4 * Math.sin(t * m.s + m.p);
      ctx.globalAlpha = 0.14 * breathe * am;
      ctx.beginPath();
      ctx.moveTo(m.x + m.r, m.y);
      ctx.arc(m.x, m.y, m.r, 0, TAU);
      ctx.fill();
    }
  },
});

// ---------------------------------------------------------------------------
// 11. waves — 3..5 sine polylines in the lower third, stroked at 10-25% alpha
//     with a soft 3-6% gradient fill underneath. Phases drift with time.
// ---------------------------------------------------------------------------

interface Wave {
  yf: number; ampF: number; wlF: number;
  p: number; spd: number; ab: number; ci: number; fillA: number;
}

interface WavesState extends BaseState { waves: Wave[]; }

const WAVE_ALPHAS = [0.10, 0.17, 0.25];
const WAVE_SAMPLES = 72;

const waves = bindRenderer<WavesState>({
  create(opts) {
    const ws: Wave[] = [];
    for (let i = 0; i < 5; i++) {
      ws.push({
        yf: 0.6 + i * 0.065 + rand(-0.02, 0.02),
        ampF: rand(0.018, 0.045),
        wlF: rand(0.12, 0.3),
        p: rand(0, TAU),
        spd: rand(0.25, 0.7) * (i % 2 === 0 ? 1 : -1),
        ab: i % 3,
        ci: i % 2,
        fillA: rand(0.03, 0.06),
      });
    }
    return { t: 0, ms: 0, pal: buildPalette(opts.colors), palDirty: true, lw: -1, lh: -1, waves: ws };
  },
  draw(s, ctx, dt, w, h, opts) {
    advance(s, dt, opts.speed);
    const am = alphaScale(opts.intensity);
    const t = s.t;
    const n = 3 + Math.round(clamp(opts.intensity, 0, 1) * 2); // 3..5 waves
    ctx.globalAlpha = am;

    for (let i = 0; i < n && i < s.waves.length; i++) {
      const wv = s.waves[i];
      const baseY = wv.yf * h;
      const amp = wv.ampF * h;
      const wl = wv.wlF * w;
      const rgb = wv.ci === 0 ? s.pal.accent : s.pal.accent2;

      ctx.beginPath();
      for (let j = 0; j < WAVE_SAMPLES; j++) {
        const xe = (j / (WAVE_SAMPLES - 1)) * w;
        const ph = (xe * TAU) / wl;
        const y = baseY
          + Math.sin(ph + t * wv.spd + wv.p) * amp
          + Math.sin(ph / 2.6 - t * wv.spd * 0.6 + wv.p * 1.7) * amp * 0.45;
        if (j === 0) ctx.moveTo(xe, y);
        else ctx.lineTo(xe, y);
      }
      ctx.strokeStyle = hexToRgba(wv.ci === 0 ? s.pal.accentHex : s.pal.accent2Hex, WAVE_ALPHAS[wv.ab]);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // fill under the crest with a fading gradient
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, baseY - amp, 0, h);
      grad.addColorStop(0, rgbaStr(rgb, wv.fillA));
      grad.addColorStop(1, rgbaStr(rgb, 0));
      ctx.fillStyle = grad;
      ctx.fill();
    }
  },
});

// ---------------------------------------------------------------------------
// 12. grid — perspective synthwave floor in the lower half: horizontal lines
//     scrolling toward the viewer, vertical lines converging on a vanishing
//     point. Density & scroll scale with speed + intensity. The only renderer
//     allowed a (small) shadowBlur, applied to at most two strokes.
// ---------------------------------------------------------------------------

interface GridState extends BaseState {
  farStr: string;
  nearStr: string;
  glowC0: string;
  glowC1: string;
  horizonStr: string;
  shadowStr: string;
}

const grid = bindRenderer<GridState>({
  create(opts) {
    return {
      t: 0, ms: 0, pal: buildPalette(opts.colors), palDirty: true, lw: -1, lh: -1,
      farStr: "", nearStr: "", glowC0: "", glowC1: "", horizonStr: "", shadowStr: "",
    };
  },
  derive(s) {
    s.farStr = rgbaStr(s.pal.accent, 0.02);
    s.nearStr = rgbaStr(s.pal.accent, 0.3);
    s.glowC0 = rgbaStr(s.pal.accent, 0.12);
    s.glowC1 = rgbaStr(s.pal.accent, 0);
    s.horizonStr = hexToRgba(s.pal.accentHex, 0.34);
    s.shadowStr = hexToRgba(s.pal.accentHex, 0.75);
  },
  draw(s, ctx, dt, w, h, opts) {
    advance(s, dt, opts.speed);
    const am = alphaScale(opts.intensity);
    const t = s.t;
    const inten = clamp(opts.intensity, 0, 1);
    const horizonY = h * 0.44;
    const cx = w * 0.5;
    const floorH = h - horizonY;
    const rate = 0.18 + 0.32 * inten; // scroll cycles per second
    const N = 12 + Math.round(8 * inten); // horizontal line count
    const M = 9 + Math.round(6 * inten); // vertical line count
    ctx.globalAlpha = am;

    // soft glow at the vanishing point
    const glowR = w * 0.16;
    const vg = ctx.createRadialGradient(cx, horizonY, 0, cx, horizonY, glowR);
    vg.addColorStop(0, s.glowC0);
    vg.addColorStop(1, s.glowC1);
    ctx.fillStyle = vg;
    ctx.fillRect(cx - glowR, horizonY - glowR, glowR * 2, glowR * 2);

    // one vertical gradient handles both line families' fade toward the horizon
    const fade = ctx.createLinearGradient(0, horizonY, 0, h);
    fade.addColorStop(0, s.farStr);
    fade.addColorStop(1, s.nearStr);
    ctx.strokeStyle = fade;

    // vertical lines converging on the vanishing point
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let j = 0; j < M; j++) {
      const f = M > 1 ? j / (M - 1) - 0.5 : 0;
      const xb = cx + f * w * 1.9;
      ctx.moveTo(cx, horizonY + 1);
      ctx.lineTo(xb, h);
    }
    ctx.stroke();

    // horizontal lines scrolling toward the viewer (perspective spacing)
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (let j = 0; j < N; j++) {
      const u = frac(j / N + t * rate);
      const y = horizonY + floorH * u * u;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.shadowColor = s.shadowStr;
    ctx.shadowBlur = 5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // glowing horizon line
    ctx.strokeStyle = s.horizonStr;
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w, horizonY);
    ctx.stroke();
    ctx.shadowBlur = 0;
  },
});

// ---------------------------------------------------------------------------
// 13. matrix — falling katakana/digit columns. TRAIL renderer: the caller's
//     rgba(bg, 0.2) fade produces the classic glyph trail, so we only draw a
//     bright head plus one dim flicker glyph per column per frame.
// ---------------------------------------------------------------------------

interface Column { x: number; y: number; spd: number; len: number; }
interface MatrixState extends BaseState {
  cols: Column[];
  fontStr: string;
  fontSize: number;
  headStr: string;
  trailStr: string;
}

const GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789:・.=*+-";
const GLYPH_COUNT = GLYPHS.length;

const matrix = bindRenderer<MatrixState>({
  create(opts) {
    return {
      t: 0, ms: 0, pal: buildPalette(opts.colors), palDirty: true, lw: -1, lh: -1,
      cols: [], fontStr: "", fontSize: 15, headStr: "", trailStr: "",
    };
  },
  derive(s) {
    s.headStr = rgbaStr(mixRGB(s.pal.accent, [255, 255, 255], 0.55), 0.95);
    s.trailStr = rgbaStr(s.pal.accent, 0.55);
  },
  layout(s, w, h) {
    // re-init at the same size must not restart the columns
    if (s.lw === w && s.lh === h && s.cols.length > 0) return;
    s.fontSize = clamp(Math.round(w / 90), 13, 19);
    s.fontStr = s.fontSize + "px ui-monospace, Menlo, Consolas, monospace";
    const colW = Math.round(s.fontSize * 1.15);
    const count = Math.ceil(w / colW) + 1;
    s.cols.length = 0;
    for (let i = 0; i < count; i++) {
      s.cols.push({ x: i * colW, y: rand(-h, h), spd: rand(1.4, 4.6), len: rand(90, 320) });
    }
  },
  draw(s, ctx, dt, w, h, opts) {
    const k = advance(s, dt, opts.speed);
    const am = alphaScale(opts.intensity);
    const sf = 0.5 + 0.8 * clamp(opts.intensity, 0, 1);
    const fs = s.fontSize;
    if (s.cols.length === 0) return;
    ctx.font = s.fontStr;
    ctx.textBaseline = "top";
    // bright heads
    ctx.fillStyle = s.headStr;
    ctx.globalAlpha = am;
    for (let i = 0; i < s.cols.length; i++) {
      const c = s.cols[i];
      c.y += c.spd * k * sf;
      if (c.y - c.len > h) {
        // respawn above the top — the negative gap acts as the column's pause
        c.y = rand(-h * 0.7, -fs * 2);
        c.spd = rand(1.4, 4.6);
        c.len = rand(90, 320);
      }
      if (c.x < w && c.y > -fs && c.y < h + fs) {
        ctx.fillText(GLYPHS[randInt(0, GLYPH_COUNT - 1)], c.x, c.y);
      }
    }

    // dim flicker glyph one cell above the head (texture on top of the fade)
    ctx.fillStyle = s.trailStr;
    ctx.globalAlpha = am * 0.9;
    for (let i = 0; i < s.cols.length; i++) {
      const c = s.cols[i];
      const y = c.y - fs;
      if (c.x < w && y > -fs && y < h + fs) {
        ctx.fillText(GLYPHS[randInt(0, GLYPH_COUNT - 1)], c.x, y);
      }
    }
  },
});

// ---------------------------------------------------------------------------
// 14. blobs — 4 huge organic blobs: radial gradients whose centers and radii
//     breathe on layered sines. Additive compositing for luminous overlap.
// ---------------------------------------------------------------------------

interface FluidBlob {
  xf: number; yf: number; ax: number; ay: number;
  f1: number; f2: number; p1: number; p2: number; p3: number;
  rF: number; pulseA: number; pulseF: number;
  a: number; ci: number;
  c0: string; c1: string; c2: string;
}

interface BlobsState extends BaseState { blobs: FluidBlob[]; }

const blobs = bindRenderer<BlobsState>({
  create(opts) {
    const bs: FluidBlob[] = [];
    const xs = [0.24, 0.5, 0.76, 0.38];
    const ys = [0.3, 0.62, 0.4, 0.78];
    for (let i = 0; i < 4; i++) {
      bs.push({
        xf: xs[i] + rand(-0.05, 0.05),
        yf: ys[i] + rand(-0.05, 0.05),
        ax: rand(0.06, 0.15),
        ay: rand(0.06, 0.15),
        f1: rand(0.04, 0.1),
        f2: rand(0.04, 0.1),
        p1: rand(0, TAU),
        p2: rand(0, TAU),
        p3: rand(0, TAU),
        rF: rand(0.3, 0.5),
        pulseA: rand(0.08, 0.18),
        pulseF: rand(0.05, 0.15),
        a: rand(0.05, 0.09),
        ci: i % 4,
        c0: "", c1: "", c2: "",
      });
    }
    return { t: 0, ms: 0, pal: buildPalette(opts.colors), palDirty: true, lw: -1, lh: -1, blobs: bs };
  },
  derive(s) {
    for (let i = 0; i < s.blobs.length; i++) {
      const b = s.blobs[i];
      const rgb =
        b.ci === 0 ? s.pal.accent
        : b.ci === 1 ? s.pal.accent2
        : b.ci === 2 ? mixRGB(s.pal.accent, s.pal.accent2, 0.5)
        : mixRGB(s.pal.accent, s.pal.accent2, 0.25);
      b.c0 = rgbaStr(rgb, b.a);
      b.c1 = rgbaStr(rgb, b.a * 0.4);
      b.c2 = rgbaStr(rgb, 0);
    }
  },
  draw(s, ctx, dt, w, h, opts) {
    advance(s, dt, opts.speed);
    const am = alphaScale(opts.intensity);
    const t = s.t;
    const minDim = Math.min(w, h);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = am;
    for (let i = 0; i < s.blobs.length; i++) {
      const b = s.blobs[i];
      const bx = (b.xf + Math.sin(t * b.f1 + b.p1) * b.ax) * w;
      const by = (b.yf + Math.sin(t * b.f2 + b.p2) * b.ay) * h;
      const r = b.rF * minDim * (1 + Math.sin(t * b.pulseF + b.p3) * b.pulseA);
      const grad = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      grad.addColorStop(0, b.c0);
      grad.addColorStop(0.55, b.c1);
      grad.addColorStop(1, b.c2);
      ctx.fillStyle = grad;
      ctx.fillRect(bx - r, by - r, r * 2, r * 2);
    }
  },
});

// ---------------------------------------------------------------------------
// 15. gradient — animated diagonal wash: a linear gradient and a radial
//     gradient whose endpoints drift on slow Lissajous paths, repainted
//     fully every frame.
// ---------------------------------------------------------------------------

interface GradientState extends BaseState {
  a0: string; a1: string; a2: string;
  b0: string; b1: string;
}

const gradient = bindRenderer<GradientState>({
  create(opts) {
    return {
      t: 0, ms: 0, pal: buildPalette(opts.colors), palDirty: true, lw: -1, lh: -1,
      a0: "", a1: "", a2: "", b0: "", b1: "",
    };
  },
  derive(s) {
    s.a0 = rgbaStr(s.pal.accent, 0.09);
    s.a1 = rgbaStr(s.pal.accent, 0.05);
    s.a2 = rgbaStr(s.pal.accent, 0);
    s.b0 = rgbaStr(s.pal.accent2, 0.08);
    s.b1 = rgbaStr(s.pal.accent2, 0);
  },
  draw(s, ctx, dt, w, h, opts) {
    advance(s, dt, opts.speed);
    const am = alphaScale(opts.intensity);
    const t = s.t;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = am;

    // diagonal linear wash — endpoints on Lissajous paths
    const x1 = w * (0.22 + 0.2 * Math.sin(t * 0.07));
    const y1 = h * (0.18 + 0.16 * Math.sin(t * 0.09 + 1.3));
    const x2 = w * (0.8 + 0.18 * Math.cos(t * 0.06 + 0.7));
    const y2 = h * (0.86 + 0.12 * Math.sin(t * 0.08 + 2.1));
    const lg = ctx.createLinearGradient(x1, y1, x2, y2);
    lg.addColorStop(0, s.a0);
    lg.addColorStop(0.55, s.a1);
    lg.addColorStop(1, s.a2);
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, w, h);

    // radial wash — center on its own Lissajous path
    const cx = w * (0.5 + 0.3 * Math.sin(t * 0.045 + 0.5));
    const cy = h * (0.5 + 0.3 * Math.sin(t * 0.065 + 2.4));
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.72);
    rg.addColorStop(0, s.b0);
    rg.addColorStop(1, s.b1);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  },
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const RENDERER_MAP = {
  starfield: starfield,
  galaxy: galaxy,
  nebula: nebula,
  aurora: aurora,
  rain: rain,
  snow: snow,
  petals: petals,
  fireflies: fireflies,
  embers: embers,
  dust: dust,
  waves: waves,
  grid: grid,
  matrix: matrix,
  blobs: blobs,
  gradient: gradient,
} satisfies Record<string, Renderer>;

/** All renderers keyed by id (see RENDERER_IDS for the canonical order). */
export const RENDERERS: Record<string, Renderer> = RENDERER_MAP;

/** Ordered renderer ids, for UI lists. */
export const RENDERER_IDS: string[] = Object.keys(RENDERER_MAP);

/** Human-friendly labels keyed by renderer id. */
export const RENDERER_LABELS: Record<string, string> = {
  starfield: "Starfield",
  galaxy: "Galaxy",
  nebula: "Nebula",
  aurora: "Aurora",
  rain: "Rain",
  snow: "Snow",
  petals: "Petals",
  fireflies: "Fireflies",
  embers: "Embers",
  dust: "Dust",
  waves: "Waves",
  grid: "Neon grid",
  matrix: "Matrix rain",
  blobs: "Fluid blobs",
  gradient: "Drifting gradient",
};

/**
 * Renderers that manage their own persistence: instead of clearing the canvas
 * each frame, the caller fills it with rgba(bg, 0.2) so previous frames fade
 * out gradually and moving elements leave trails.
 */
export const TRAIL_RENDERERS: ReadonlySet<string> = new Set<string>(["starfield", "matrix"]);
