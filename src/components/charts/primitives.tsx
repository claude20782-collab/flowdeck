/**
 * Flowdeck — chart primitives  (src/components/charts/primitives.tsx)
 *
 * Zero-dependency, theme-aware SVG charts for dashboard / analytics widgets.
 * Design constraints, enforced throughout:
 *
 *   - No chart library, no app imports — this file is fully standalone.
 *   - Every color is a CSS custom property (`var(--accent)`, …) so charts
 *     re-theme instantly with the app's theme engine.
 *   - All text uses `var(--text-muted)` (or `var(--text)` where specified),
 *     font-size ~9–11 and `font-family: inherit`.
 *   - Responsive via `viewBox` + `width="100%"`. The default uniform
 *     `preserveAspectRatio` is kept everywhere (no "none"), so labels and
 *     bars never distort when the container is wider or narrower.
 *   - Pure render: no hooks, no state, no "use client" directive needed.
 *   - No fake data — components render exactly what they are given and
 *     degrade into honest, muted empty states.
 *
 * Exports: BarChart · LineChart · Sparkline · ProgressRing ·
 *          HBarChart · Heatmap
 */

/* ══════════════════════════════ shared helpers ══════════════════════════ */

/** Attribute spread for muted chart text (ticks, axis labels, notes). */
const mutedText = (size = 10) => ({
  fill: "var(--text-muted)",
  fontSize: size,
  fontFamily: "inherit",
});

/** Guard against NaN / Infinity sneaking in from malformed store data. */
const num = (v: number): number => (Number.isFinite(v) ? v : 0);

/** Default value formatter — integers verbatim, floats to one decimal. */
const defaultFormatValue = (v: number): string =>
  Number.isInteger(v) ? String(v) : v.toFixed(1);

/** Round to 2 decimals — keeps generated geometry strings compact. */
const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Round to 6 decimals — kills 0.30000000000000004-style tick values. */
const r6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Smallest "nice" step from the 1 / 2 / 2.5 / 5 x 10^k ladder, >= raw. */
function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const base = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / base;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * base;
}

/** Tidy y-scale for bar/line charts: rounded top + at most 4 gridlines. */
function makeScale(maxVal: number, targetTicks = 3): { top: number; ticks: number[] } {
  if (!(maxVal > 0)) return { top: 1, ticks: [0, 1] };
  let step = niceStep(maxVal / targetTicks);
  let top = Math.ceil(maxVal / step - 1e-9) * step;
  for (;;) {
    const ticks: number[] = [];
    for (let v = 0; v <= top + 1e-9; v += step) ticks.push(r6(v));
    if (ticks.length <= 4) return { top, ticks };
    step *= 2; // too many gridlines -> coarsen
    top = Math.ceil(maxVal / step - 1e-9) * step;
  }
}

/**
 * Catmull-Rom -> cubic Bezier: a smooth curve through every point.
 * Control-point y values are clamped into [minY, maxY] so the curve never
 * visibly dips below the baseline or overshoots the top gridline.
 */
function smoothPath(pts: { x: number; y: number }[], minY: number, maxY: number): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${r2(pts[0].x)} ${r2(pts[0].y)}`;
  const clamp = (v: number) => Math.min(maxY, Math.max(minY, v));
  let d = `M ${r2(pts[0].x)} ${r2(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i + 2 < pts.length ? pts[i + 2] : pts[i + 1];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6);
    d += ` C ${r2(c1x)} ${r2(c1y)} ${r2(c2x)} ${r2(c2y)} ${r2(p2.x)} ${r2(p2.y)}`;
  }
  return d;
}

/** Evenly spaced indices (first & last always included), at most `max`. */
function sparseIndices(n: number, max: number): number[] {
  if (n <= 0) return [];
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const step = (n - 1) / (max - 1);
  const seen = new Set<number>();
  for (let k = 0; k < max; k++) seen.add(Math.round(k * step));
  return [...seen].sort((a, b) => a - b);
}

/**
 * Hover affordances (class-based — safe to duplicate across instances).
 * Dots grow on hover; bars gently dim. Embedded per-chart <style> keeps the
 * file standalone instead of depending on Tailwind for core behavior.
 */
const INTERACTIVE_CSS =
  ".fd-bar{transition:opacity .15s ease}" +
  ".fd-bar:hover{opacity:.82}" +
  ".fd-dot{transition:transform .15s ease;transform-box:fill-box;transform-origin:center}" +
  ".fd-dot:hover{transform:scale(1.7)}";

/* ════════════════════════════════ BarChart ══════════════════════════════ */

export interface BarDatum {
  label: string;
  value: number;
  /** Overrides the bar fill (defaults to `var(--accent)`). */
  color?: string;
}

export interface BarChartProps {
  data: BarDatum[];
  /** viewBox height in nominal units (default 150). */
  height?: number;
  formatValue?: (v: number) => string;
  emptyLabel?: string;
}

/** Vertical bars with rounded tops, hover tooltips and a baseline hairline. */
export function BarChart({ data, height = 150, formatValue, emptyLabel = "no data" }: BarChartProps) {
  const fmt = formatValue ?? defaultFormatValue;
  const W = 320; // nominal viewBox width — scales fluidly with the container
  const H = height;

  /* Empty input -> a single honest, centered label. */
  if (!data || data.length === 0) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="w-full" style={{ display: "block" }} role="img" aria-label={emptyLabel}>
        <text x={W / 2} y={H / 2} dy=".35em" textAnchor="middle" {...mutedText(11)}>
          {emptyLabel}
        </text>
      </svg>
    );
  }

  const bars = data.slice(-31); // defensive cap: keep the 31 most recent bars
  const n = bars.length;
  const rotate = n > 6; // crowded axis -> tilt the labels
  const padTop = 8;
  const padBottom = rotate ? 27 : 18;
  const plotH = Math.max(12, H - padTop - padBottom);
  const baseY = padTop + plotH;

  const allZero = bars.every((b) => num(b.value) <= 0);
  const maxVal = Math.max(0, ...bars.map((b) => num(b.value)));
  const top = allZero ? 1 : makeScale(maxVal).top;

  const slot = W / n;
  const barW = Math.min(slot * 0.72, 30); // breathe when there are few bars

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="w-full" style={{ display: "block" }} role="img">
      <style>{INTERACTIVE_CSS}</style>

      {/* bars — values are revealed through native <title> tooltips */}
      {bars.map((b, i) => {
        const x = i * slot + (slot - barW) / 2;
        const h = allZero ? 2 : Math.max(1, (Math.max(0, num(b.value)) / top) * plotH);
        return (
          <rect key={i} className="fd-bar" x={r2(x)} y={r2(baseY - h)} width={r2(barW)} height={r2(h)} rx={3} fill={b.color ?? "var(--accent)"}>
            <title>{`${b.label}: ${fmt(b.value)}`}</title>
          </rect>
        );
      })}

      {/* baseline hairline */}
      <line x1={0} y1={baseY} x2={W} y2={baseY} stroke="var(--border-c)" strokeWidth={1} />

      {/* x-axis labels — truncated to 4 chars, tilted when crowded */}
      {bars.map((b, i) => {
        const cx = i * slot + slot / 2;
        const label = b.label.length > 4 ? b.label.slice(0, 4) : b.label;
        if (rotate) {
          const ax = Math.max(cx, 12); // keep the first labels inside the box
          return (
            <text
              key={`l${i}`}
              x={r2(ax)}
              y={baseY + 6}
              textAnchor="end"
              transform={`rotate(-35 ${r2(ax)} ${baseY + 6})`}
              {...mutedText(9)}
            >
              {label}
            </text>
          );
        }
        return (
          <text key={`l${i}`} x={r2(cx)} y={baseY + 12} textAnchor="middle" {...mutedText(10)}>
            {label}
          </text>
        );
      })}

      {/* all-zero series -> dot-height bars + a muted note */}
      {allZero && (
        <text x={W / 2} y={padTop + plotH / 2} dy=".35em" textAnchor="middle" {...mutedText(10)}>
          no data yet
        </text>
      )}
    </svg>
  );
}

/* ═══════════════════════════════ LineChart ══════════════════════════════ */

export interface LineDatum {
  label: string;
  value: number;
}

export interface LineChartProps {
  data: LineDatum[];
  /** viewBox height in nominal units (default 140). */
  height?: number;
  /** Fill the area under the line with a fading accent gradient. */
  area?: boolean;
  formatValue?: (v: number) => string;
  /** Line + dot color (defaults to `var(--accent)`). */
  stroke?: string;
}

/** Smooth line with dots, nice gridlines, tick labels and optional area. */
export function LineChart({ data, height = 140, area = false, formatValue, stroke = "var(--accent)" }: LineChartProps) {
  const fmt = formatValue ?? defaultFormatValue;
  const W = 320;
  const H = height;

  if (!data || data.length === 0) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="w-full" style={{ display: "block" }} role="img" aria-label="no data">
        <text x={W / 2} y={H / 2} dy=".35em" textAnchor="middle" {...mutedText(11)}>
          no data
        </text>
      </svg>
    );
  }

  const n = data.length;
  const padL = 34; // room for y tick labels
  const padR = 8;
  const padT = 8;
  const padB = 18; // room for x labels
  const plotW = W - padL - padR;
  const plotH = Math.max(12, H - padT - padB);
  const baseY = padT + plotH;

  const maxVal = Math.max(0, ...data.map((d) => num(d.value)));
  const { top, ticks } = makeScale(maxVal);

  const xAt = (i: number) => (n === 1 ? padL + plotW / 2 : padL + (i * plotW) / (n - 1));
  const yAt = (v: number) => baseY - (Math.max(0, num(v)) / top) * plotH;

  const pts = data.map((d, i) => ({ x: xAt(i), y: yAt(d.value) }));
  const line = smoothPath(pts, padT, baseY);
  const areaPath = area && n > 1 ? `${line} L ${r2(pts[n - 1].x)} ${baseY} L ${r2(pts[0].x)} ${baseY} Z` : "";

  // Deterministic per-props gradient id: identical configs may share it
  // (identical gradient), different strokes/colors never collide.
  const gid = `fd-area-${stroke.replace(/[^a-zA-Z0-9]/g, "")}-${H}`;

  const labelIdx = sparseIndices(n, 6); // sparse x labels, max ~6
  const showDots = n <= 48; // hide dots when the series gets too dense

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="w-full" style={{ display: "block" }} role="img">
      <style>{INTERACTIVE_CSS}</style>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.12} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* gridlines + y tick labels (at most 4, dashed 4 4) */}
      {ticks.map((t, i) => {
        const y = r2(yAt(t));
        return (
          <g key={`g${i}`}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--border-c)" strokeWidth={1} strokeDasharray="4 4" />
            <text x={padL - 4} y={y} dy=".35em" textAnchor="end" {...mutedText(9)}>
              {fmt(t)}
            </text>
          </g>
        );
      })}

      {/* optional area fill, then the line itself */}
      {areaPath && <path d={areaPath} fill={`url(#${gid})`} />}
      {n > 1 && (
        <path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      )}

      {/* dots (r=2.5) that grow on hover; each carries a value tooltip */}
      {showDots &&
        pts.map((p, i) => (
          <circle key={`d${i}`} className="fd-dot" cx={r2(p.x)} cy={r2(p.y)} r={2.5} fill={stroke}>
            <title>{`${data[i].label}: ${fmt(data[i].value)}`}</title>
          </circle>
        ))}

      {/* sparse x labels */}
      {labelIdx.map((i) => {
        const raw = data[i].label;
        const label = raw.length > 6 ? `${raw.slice(0, 5)}…` : raw;
        return (
          <text key={`x${i}`} x={r2(xAt(i))} y={H - 4} textAnchor="middle" {...mutedText(9)}>
            {label}
          </text>
        );
      })}
    </svg>
  );
}

/* ═══════════════════════════════ Sparkline ══════════════════════════════ */

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** Use `var(--positive)` instead of `var(--accent)`. */
  positive?: boolean;
}

/** Tiny trend line — no axes, no labels, no tooltips. */
export function Sparkline({ values, width = 120, height = 28, positive = false }: SparklineProps) {
  const w = width;
  const h = height;
  const color = positive ? "var(--positive)" : "var(--accent)";
  const vals = values ?? [];
  const n = vals.length;
  const pad = 2;

  let path = "";
  if (n >= 2) {
    const min = Math.min(...vals.map(num));
    const max = Math.max(...vals.map(num));
    const span = max - min || 1;
    const pts = vals.map((v, i) => ({
      x: pad + (i * (w - 2 * pad)) / (n - 1),
      y: pad + (1 - (num(v) - min) / span) * (h - 2 * pad),
    }));
    path = smoothPath(pts, pad, h - pad);
  }

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-hidden="true">
      {n >= 2 ? (
        <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        // fewer than 2 points -> honest flat placeholder instead of a lie
        <line x1={pad} y1={h / 2} x2={w - pad} y2={h / 2} stroke="var(--border-c)" strokeWidth={1} strokeDasharray="3 3" />
      )}
    </svg>
  );
}

/* ═════════════════════════════ ProgressRing ═════════════════════════════ */

export interface ProgressRingProps {
  value: number;
  max: number;
  size?: number;
  thickness?: number;
  /** Centered label (defaults to the percentage). */
  label?: string;
  /** Smaller muted line under the label. */
  sublabel?: string;
  color?: string;
}

/** Circular progress: dasharray trick on a circle rotated to 12 o'clock. */
export function ProgressRing({ value, max, size = 72, thickness = 7, label, sublabel, color }: ProgressRingProps) {
  const pct = max > 0 ? Math.max(0, Math.min(1, num(value) / max)) : 0;
  const r = Math.max(1, (size - thickness) / 2);
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  const text = label ?? `${Math.round(pct * 100)}%`;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={text}>
      {/* track */}
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border-c)" strokeWidth={thickness} />
      {/* progress arc (starts at 12 o'clock via the -90deg rotation) */}
      {pct > 0 && (
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={color ?? "var(--accent)"}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${r2(dash)} ${r2(circ)}`}
          transform={`rotate(-90 ${c} ${c})`}
          style={{ transition: "stroke-dasharray .4s ease" }}
        />
      )}
      {/* centered label + optional muted sublabel */}
      <text
        x={c}
        y={sublabel ? c - size / 18 : c}
        dy=".35em"
        textAnchor="middle"
        fill="var(--text)"
        fontSize={size / 4.5}
        fontWeight={600}
        fontFamily="inherit"
      >
        {text}
      </text>
      {sublabel && (
        <text x={c} y={c + size / 7} dy=".35em" textAnchor="middle" fill="var(--text-muted)" fontSize={Math.max(7, size / 10)} fontFamily="inherit">
          {sublabel}
        </text>
      )}
    </svg>
  );
}

/* ═══════════════════════════════ HBarChart ══════════════════════════════ */

export interface HBarDatum {
  label: string;
  value: number;
  color?: string;
  /** Extra context shown in the row's hover tooltip. */
  hint?: string;
}

export interface HBarChartProps {
  data: HBarDatum[];
  formatValue?: (v: number) => string;
  emptyLabel?: string;
}

/**
 * Horizontal bars. Rendered WITHOUT a viewBox on purpose: rows are exact
 * pixels (28px high, 8px gap) while the bar geometry uses percentage
 * coordinates, so the chart is fluid horizontally without ever scaling
 * text.
 */
export function HBarChart({ data, formatValue, emptyLabel = "no data" }: HBarChartProps) {
  const fmt = formatValue ?? defaultFormatValue;

  if (!data || data.length === 0) {
    return (
      <svg width="100%" height={56} style={{ display: "block" }} role="img" aria-label={emptyLabel}>
        <text x="50%" y="28" dy=".35em" textAnchor="middle" {...mutedText(11)}>
          {emptyLabel}
        </text>
      </svg>
    );
  }

  const rowH = 28;
  const gap = 8;
  const totalH = data.length * rowH + (data.length - 1) * gap;

  const maxVal = Math.max(0, ...data.map((d) => num(d.value)));
  const denom = maxVal > 0 ? maxVal : 1;

  // Percentage-based columns of the fluid width.
  const BAR_X = 31; // % — where the track starts (after the label column)
  const BAR_W = 53; // % — full track width (ends at 84%)

  return (
    <svg width="100%" height={totalH} style={{ display: "block" }} role="img">
      {data.map((d, i) => {
        const rowY = i * (rowH + gap);
        const cy = rowY + rowH / 2;
        const pct = Math.max(0, num(d.value)) / denom;
        // tiny values still show a pill instead of disappearing
        const fillW = d.value > 0 ? Math.max(pct * BAR_W, 1.2) : 0;
        const label = d.label.length > 14 ? `${d.label.slice(0, 13)}…` : d.label;
        const title = `${d.label}: ${fmt(d.value)}${d.hint ? ` — ${d.hint}` : ""}`;
        return (
          <g key={i}>
            <title>{title}</title>
            {/* label column */}
            <text x={0} y={cy} dy=".35em" fill="var(--text)" fontSize={11} fontFamily="inherit">
              {label}
            </text>
            {/* full-width track at 40% border opacity */}
            <rect x={`${BAR_X}%`} y={rowY + rowH / 2 - 4} width={`${BAR_W}%`} height={8} rx={4} fill="var(--border-c)" opacity={0.4} />
            {/* rounded fill */}
            <rect x={`${BAR_X}%`} y={rowY + rowH / 2 - 4} width={`${r2(fillW)}%`} height={8} rx={4} fill={d.color ?? "var(--accent)"} />
            {/* right-aligned muted value */}
            <text x="100%" y={cy} dy=".35em" textAnchor="end" {...mutedText(10)}>
              {fmt(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ════════════════════════════════ Heatmap ═══════════════════════════════ */

export interface HeatmapDatum {
  /** ISO calendar date, "yyyy-MM-dd". */
  date: string;
  value: number;
}

export interface HeatmapProps {
  values: HeatmapDatum[];
  /** Number of week columns (default 26). Older values fall off the left. */
  weeks?: number;
  /** Cell color for active days (default `var(--accent)`). */
  color?: string;
  cellSize?: number;
  onCellClick?: (date: string) => void;
  formatValue?: (v: number) => string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Opacity for the 5 intensity steps of active cells. */
const INTENSITIES = [0.25, 0.45, 0.65, 0.85, 1];

const pad2 = (n: number): string => String(n).padStart(2, "0");
const isoOf = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n); // setDate() is DST-safe (unlike +n*86400000)
  return x;
}
/** Monday-based row index: 0 = Monday … 6 = Sunday. */
const mondayIndex = (d: Date): number => (d.getDay() + 6) % 7;

/** Default formatter — minutes rendered as "3h 20m" style durations. */
function formatDuration(v: number): string {
  const t = Math.max(0, Math.round(num(v)));
  if (t === 0) return "0m";
  let h = Math.floor(t / 60);
  let m = t % 60;
  if (m === 60) {
    h += 1;
    m = 0;
  }
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * GitHub-style calendar heatmap: columns = weeks, rows = Mon..Sun.
 * The grid is anchored on the week that contains today (or the newest data
 * date if it somehow lies in the future); days after that are left empty.
 */
export function Heatmap({ values, weeks = 26, color = "var(--accent)", cellSize = 11, onCellClick, formatValue }: HeatmapProps) {
  const fmt = formatValue ?? formatDuration;
  const wk = Math.max(1, Math.round(weeks));
  const cell = Math.max(4, cellSize);
  const gap = 2;
  const pitch = cell + gap;
  const gutterLeft = 15; // day-initials column
  const gutterTop = 14; // month-label row
  const gridW = wk * pitch - gap;
  const W = gutterLeft + gridW + 1;
  const H = gutterTop + 7 * pitch - gap + 1;

  /* date -> value map (defensive: ignore malformed date strings) */
  const map = new Map<string, number>();
  for (const v of values ?? []) {
    if (typeof v?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.date)) map.set(v.date, num(v.value));
  }

  /* anchor: today, or the newest data date when it lies in the future */
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = isoOf(today);

  let end = today;
  let lastIso = "";
  for (const iso of map.keys()) if (iso > lastIso) lastIso = iso;
  if (lastIso) {
    const [y, m, d] = lastIso.split("-").map(Number);
    const cand = new Date(y, m - 1, d);
    if (cand > today) end = cand;
  }
  const endIso = isoOf(end);

  /* one pass over the grid: cells + month labels + in-grid maximum */
  interface Cell {
    iso: string;
    value: number;
    col: number;
    row: number;
  }
  const cells: Cell[] = [];
  const monthLabels: { col: number; name: string }[] = [];
  let maxVal = 0;

  const gridStart = addDays(addDays(end, -mondayIndex(end)), -(wk - 1) * 7);
  for (let col = 0; col < wk; col++) {
    const colMonday = addDays(gridStart, col * 7);
    for (let row = 0; row < 7; row++) {
      const d = addDays(colMonday, row);
      const iso = isoOf(d);
      if (iso > endIso) continue; // future days stay empty (no fake data)
      const value = map.get(iso) ?? 0;
      if (value > maxVal) maxVal = value;
      cells.push({ iso, value, col, row });
      // month label on the first column that contains the 1st of a month
      if (d.getDate() === 1 && col > 0) monthLabels.push({ col, name: MONTHS[d.getMonth()] });
    }
  }

  const showEmptyNote = maxVal === 0;

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: "block", maxWidth: "100%", height: "auto" }}
      role="img"
      aria-label="activity heatmap"
    >
      {/* month labels (top) */}
      {monthLabels.map((m, i) => (
        <text key={`m${i}`} x={gutterLeft + m.col * pitch} y={9} {...mutedText(9)}>
          {m.name}
        </text>
      ))}

      {/* day initials on the left: Mon / Wed / Fri only */}
      {[0, 2, 4].map((row) => (
        <text key={`d${row}`} x={5} y={gutterTop + row * pitch + cell / 2} dy=".35em" textAnchor="middle" {...mutedText(9)}>
          {["M", "W", "F"][row / 2]}
        </text>
      ))}

      {/* day cells */}
      {cells.map((cl) => {
        const level = cl.value > 0 ? Math.min(5, Math.ceil((cl.value / maxVal) * 5)) : 0;
        const x = gutterLeft + cl.col * pitch;
        const y = gutterTop + cl.row * pitch;
        const isToday = cl.iso === todayIso;
        const dayNum = Number(cl.iso.slice(8, 10));
        const monthIdx = Number(cl.iso.slice(5, 7)) - 1;
        return (
          <rect
            key={cl.iso}
            x={x}
            y={y}
            width={cell}
            height={cell}
            rx={2}
            fill={level === 0 ? "var(--border-c)" : color}
            fillOpacity={level === 0 ? 0.5 : INTENSITIES[level - 1]}
            stroke={isToday ? "var(--text)" : undefined}
            strokeOpacity={isToday ? 0.4 : undefined}
            strokeWidth={isToday ? 1 : undefined}
            style={{ cursor: onCellClick ? "pointer" : undefined }}
            onClick={onCellClick ? () => onCellClick(cl.iso) : undefined}
          >
            <title>{`${fmt(cl.value)} — ${dayNum} ${MONTHS[monthIdx]}`}</title>
          </rect>
        );
      })}

      {/* honest empty state — the grid is still rendered above */}
      {showEmptyNote && (
        <text x={W} y={9} textAnchor="end" {...mutedText(9)}>
          no activity yet
        </text>
      )}
    </svg>
  );
}
