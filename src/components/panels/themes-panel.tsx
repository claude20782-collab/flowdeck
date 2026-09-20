"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  Paintbrush,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { PanelActionButton, PanelEmptyState, PanelSection, PanelShell } from "./panel-shell";
import { Switch } from "@/components/ui/switch";
import { resolveTheme, useAppearanceStore } from "@/lib/store/appearance-store";
import { useSettingsStore } from "@/lib/store/settings-store";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { BUILT_IN_THEMES } from "@/lib/themes/presets";
import { FONT_STACKS, withAlpha } from "@/lib/themes/color";
import { RENDERERS, RENDERER_IDS, RENDERER_LABELS } from "@/lib/backgrounds/renderers";
import type {
  AnimationId,
  FontChoice,
  ThemeColors,
  ThemeDefinition,
  ThemeEffects,
  WallpaperSettings,
} from "@/lib/themes/types";
import { cn } from "@/lib/utils";

/* ============================================================
 * Theme studio — gallery · wallpaper · motion · builder
 * ============================================================ */

type TabId = "themes" | "wallpaper" | "motion" | "builder";

const TABS: { id: TabId; label: string }[] = [
  { id: "themes", label: "Themes" },
  { id: "wallpaper", label: "Wallpaper" },
  { id: "motion", label: "Motion" },
  { id: "builder", label: "Builder" },
];

const FONTS: { id: FontChoice; label: string }[] = [
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Mono" },
  { id: "rounded", label: "Rounded" },
];

const WALLPAPER_TYPES: { id: WallpaperSettings["type"]; label: string }[] = [
  { id: "none", label: "None" },
  { id: "solid", label: "Solid" },
  { id: "gradient", label: "Gradient" },
  { id: "image", label: "Image" },
];

const SOLID_SWATCHES = [
  "#000000",
  "#111318",
  "#1a1a1a",
  "#2b2d33",
  "#3a2f25",
  "#503a2a",
  "#0d1f1a",
  "#12213a",
  "#261a2e",
  "#e9e5de",
  "#d9dde3",
  "#f4ede4",
];

const GRADIENTS: { name: string; css: string }[] = [
  { name: "Ocean Deep", css: "linear-gradient(135deg,#0f2027,#203a43,#2c5364)" },
  { name: "Nightfall", css: "linear-gradient(160deg,#1e3c72,#2a5298)" },
  { name: "Plum Smoke", css: "linear-gradient(135deg,#42275a,#734b6d)" },
  { name: "Charcoal", css: "linear-gradient(135deg,#232526,#414345)" },
  { name: "Sage & Sand", css: "linear-gradient(135deg,#3e5151,#decba4)" },
  { name: "Twilight", css: "linear-gradient(135deg,#2b5876,#4e4376)" },
];

/** Builder animation select: "none" + every renderer. */
const ANIM_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "None" },
  ...RENDERER_IDS.map((id) => ({ value: id, label: RENDERER_LABELS[id] ?? id })),
];

/** All color keys except the optional bgImage overlay. */
type RequiredColorKey = Exclude<keyof ThemeColors, "bgImage">;

const COLOR_FIELDS: { key: RequiredColorKey; label: string }[] = [
  { key: "bg", label: "Background" },
  { key: "surface", label: "Surface" },
  { key: "text", label: "Text" },
  { key: "textMuted", label: "Muted text" },
  { key: "accent", label: "Accent" },
  { key: "accentFg", label: "On accent" },
  { key: "accent2", label: "Accent 2" },
  { key: "border", label: "Border" },
  { key: "positive", label: "Positive" },
  { key: "negative", label: "Negative" },
  { key: "warning", label: "Warning" },
];

/* ---------- helpers ---------- */

const pct = (v: number) => `${Math.round(v * 100)}%`;
const px = (v: number) => `${Math.round(v)} px`;
const times = (v: number) => `${v.toFixed(2)}×`;

const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : fallback;
}

/** 6-digit hex for <input type="color"> (accepts 3/6/8-digit hex, else null). */
function hex6(v: string): string | null {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(v.trim());
  if (!m) return null;
  const h = m[1];
  if (h.length === 3) {
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  return `#${h.slice(0, 6)}`.toLowerCase();
}

/**
 * Import validation (per spec): JSON parses, colors.bg & colors.accent are strings,
 * effects.widgetAlpha !== undefined. Everything else gets sane fallbacks so the
 * saved theme is always a complete ThemeDefinition.
 */
function parseImportedTheme(raw: string): ThemeDefinition | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(obj)) return null;
  const colors = obj.colors;
  const effects = obj.effects;
  if (!isRecord(colors) || !isRecord(effects)) return null;
  if (typeof colors.bg !== "string" || typeof colors.accent !== "string") return null;
  if (effects.widgetAlpha === undefined) return null;

  const animRaw = typeof effects.animation === "string" ? effects.animation : "none";
  const animation: AnimationId =
    animRaw === "none" || RENDERER_IDS.includes(animRaw) ? (animRaw as AnimationId) : "none";
  const fontRaw = typeof effects.font === "string" ? effects.font : undefined;
  const font: FontChoice | undefined =
    fontRaw && FONTS.some((f) => f.id === fontRaw) ? (fontRaw as FontChoice) : undefined;

  return {
    id: `custom-${Date.now()}`,
    name: typeof obj.name === "string" && obj.name.trim() !== "" ? obj.name.trim().slice(0, 48) : "Imported",
    tagline:
      typeof obj.tagline === "string" && obj.tagline.trim() !== "" ? obj.tagline.trim().slice(0, 80) : "Imported from JSON",
    dark: obj.dark === true,
    colors: {
      bg: str(colors.bg, "#0b0d12"),
      surface: str(colors.surface, "#151823"),
      text: str(colors.text, "#e7e9ee"),
      textMuted: str(colors.textMuted, "#8b90a0"),
      accent: str(colors.accent, "#e8a849"),
      accentFg: str(colors.accentFg, "#17130a"),
      accent2: str(colors.accent2, "#c46a4e"),
      border: str(colors.border, "#ffffff12"),
      positive: str(colors.positive, "#4caf7d"),
      negative: str(colors.negative, "#e0566b"),
      warning: str(colors.warning, "#e8a849"),
      ...(typeof colors.bgImage === "string" && colors.bgImage.trim() !== "" ? { bgImage: colors.bgImage.trim() } : {}),
    },
    effects: {
      widgetAlpha: num(effects.widgetAlpha, 0.7, 0.3, 1),
      blur: num(effects.blur, 12, 0, 30),
      radius: num(effects.radius, 16, 4, 24),
      grain: num(effects.grain, 0, 0, 0.12),
      animation,
      animationIntensity: num(effects.animationIntensity, 0.5, 0, 1),
      animationSpeed: num(effects.animationSpeed, 1, 0.25, 2),
      ...(font ? { font } : {}),
    },
    custom: true,
    createdAt: Date.now(),
  };
}

/** Blob JSON download of a ThemeDefinition. */
function exportThemeFile(theme: ThemeDefinition): void {
  try {
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = theme.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    a.href = url;
    a.download = `flowdeck-theme-${slug || "custom"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast.success(`“${theme.name}” exported`);
  } catch {
    toast.error("Export failed");
  }
}

/* ---------- shared rows ---------- */

function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs leading-snug text-muted-c">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="py-1.5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="tnum text-xs text-muted-c">{format(value)}</span>
      </div>
      <input
        type="range"
        className="fd-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
  ariaLabel,
  fontFamily,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  ariaLabel?: string;
  fontFamily?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cn(
        "press shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
        active ? "text-[var(--accent-fg)]" : "text-muted-c hover:text-[var(--text)]"
      )}
      style={
        active
          ? { background: "var(--accent)", fontFamily }
          : { background: "color-mix(in srgb, var(--text) 7%, transparent)", fontFamily }
      }
    >
      {children}
    </button>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-9 w-full appearance-none rounded-lg border hairline bg-[var(--card-solid)] px-3 pr-8 text-sm outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-c"
        aria-hidden="true"
      />
    </div>
  );
}

/** Compact icon button for theme cards ("small icon button row"). */
function IconBtn({
  children,
  onClick,
  label,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "press flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
        danger ? "text-muted-c hover:text-[var(--negative)]" : "text-muted-c hover:text-[var(--text)]"
      )}
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════ TAB 1 — THEMES ═══════════════════════════ */

/* ═══════════════════════════ LIVE PREVIEW CANVAS ═══════════════════════════ */

/**
 * Live ambient-animation preview for one theme card. Mounts a tiny canvas that
 * runs the theme's real renderer (same code as the dashboard background) with the
 * theme's own colors/intensity/speed. Only animates while hovered/focused and
 * pauses everything when the user disabled animations or prefers reduced motion.
 */
function ThemePreviewCanvas({ theme }: { theme: ThemeDefinition }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const renderer = RENDERERS[theme.effects.animation];
    if (!renderer) return;

    const opts = {
      intensity: theme.effects.animationIntensity,
      speed: theme.effects.animationSpeed,
      colors: {
        accent: theme.colors.accent,
        accent2: theme.colors.accent2,
        text: theme.colors.text,
        bg: theme.colors.bg,
      },
    };

    /* DPR-aware backbuffer at preview size */
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    renderer.init(ctx, w, h, opts);
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(64, t - last);
      last = t;
      renderer.frame(ctx, dt, w, h, opts);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [theme]);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}

/* ═══════════════════════════ THEME CARD ═══════════════════════════ */

function ThemeCard({
  theme,
  active,
  onActivate,
  onEdit,
  onDuplicate,
  onDelete,
  onExport,
}: {
  theme: ThemeDefinition;
  active: boolean;
  onActivate: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
}) {
  const c = theme.colors;
  const surface = withAlpha(c.surface, 0.82);
  const barBorder = `1px solid ${withAlpha(c.text, 0.08)}`;
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const [previewing, setPreviewing] = useState(false);
  const livePreview =
    previewing && animationsEnabled && !reducedMotion && !!RENDERERS[theme.effects.animation];
  const actions =
    onEdit || onDuplicate || onDelete || onExport ? (
      <div className="mt-1 flex items-center gap-0.5 px-0.5">
        {onEdit && (
          <IconBtn onClick={onEdit} label={`Edit ${theme.name}`}>
            <Pencil className="h-3.5 w-3.5" />
          </IconBtn>
        )}
        {onDuplicate && (
          <IconBtn onClick={onDuplicate} label={`Duplicate ${theme.name}`}>
            <Copy className="h-3.5 w-3.5" />
          </IconBtn>
        )}
        <span className="flex-1" />
        {onDelete && (
          <IconBtn onClick={onDelete} label={`Delete ${theme.name}`} danger>
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        )}
        {onExport && (
          <IconBtn onClick={onExport} label={`Export ${theme.name} as JSON`}>
            <Download className="h-3.5 w-3.5" />
          </IconBtn>
        )}
      </div>
    ) : null;

  return (
    <div
      className="widget widget-hover p-2.5"
      onMouseEnter={() => setPreviewing(true)}
      onMouseLeave={() => setPreviewing(false)}
    >
      <button
        type="button"
        onClick={onActivate}
        aria-pressed={active}
        aria-label={`Activate theme ${theme.name}`}
        className="press block w-full text-left"
        onFocus={() => setPreviewing(true)}
        onBlur={() => setPreviewing(false)}
      >
        <span
          className="relative block aspect-[4/3] overflow-hidden rounded-xl border hairline"
          style={{
            background: c.bg,
            backgroundImage: c.bgImage ?? "none",
            boxShadow: active ? "0 0 0 2px var(--accent)" : undefined,
          }}
        >
          {/* live ambient animation on hover/focus (mounts only while previewing) */}
          {livePreview && (
            <span className="absolute inset-0 block transition-opacity duration-300">
              <ThemePreviewCanvas theme={theme} />
            </span>
          )}
          <span className="absolute inset-x-2.5 top-2.5 block">
            <span className="block h-5 rounded-md" style={{ background: surface, border: barBorder }} />
            <span className="mt-1.5 block h-3 rounded-md" style={{ background: surface, border: barBorder }} />
          </span>
          <span className="absolute bottom-2 left-2.5 flex items-center gap-1.5">
            <span className="block h-2.5 w-2.5 rounded-full" style={{ background: c.accent }} />
            <span className="block h-2.5 w-2.5 rounded-full" style={{ background: c.accent2 }} />
            <span className="block h-1.5 w-1.5 rounded-full opacity-80" style={{ background: c.text }} />
            <span className="block h-1.5 w-1.5 rounded-full opacity-50" style={{ background: c.text }} />
          </span>
          {/* hover hint chip: “live” */}
          <span
            className="pointer-events-none absolute right-2 bottom-2 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider transition-opacity duration-200"
            style={{
              background: livePreview ? c.accent : "transparent",
              color: c.accentFg,
              opacity: livePreview ? 0.95 : 0,
            }}
            aria-hidden="true"
          >
            live
          </span>
          {active && (
            <span
              className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full"
              style={{ background: c.accent, color: c.accentFg }}
              aria-hidden="true"
            >
              <Check className="h-3 w-3" />
            </span>
          )}
        </span>
      </button>
      <div className="mt-2 px-0.5">
        <p className="flex items-baseline gap-1.5">
          <span className="truncate text-sm font-medium">{theme.name}</span>
          {theme.custom && (
            <span
              className="shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-c"
              style={{ background: "color-mix(in srgb, var(--text) 8%, transparent)" }}
            >
              custom
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-muted-c">{theme.tagline}</p>
      </div>
      {actions}
    </div>
  );
}

function ThemesGallery({
  onEdit,
  onDelete,
}: {
  onEdit: (theme: ThemeDefinition) => void;
  onDelete: (theme: ThemeDefinition) => void;
}) {
  const activeThemeId = useAppearanceStore((s) => s.activeThemeId);
  const customThemes = useAppearanceStore((s) => s.customThemes);
  const setTheme = useAppearanceStore((s) => s.setTheme);
  const saveCustomTheme = useAppearanceStore((s) => s.saveCustomTheme);
  const duplicateTheme = useAppearanceStore((s) => s.duplicateTheme);
  const fileRef = useRef<HTMLInputElement>(null);

  const themes = [...BUILT_IN_THEMES, ...customThemes];

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      const parsed = parseImportedTheme(raw);
      if (!parsed) {
        toast.error("Not a valid Flowdeck theme");
        return;
      }
      saveCustomTheme(parsed);
      toast.success(`“${parsed.name}” imported`);
    };
    reader.onerror = () => toast.error("Could not read that file");
    reader.readAsText(file);
  };

  return (
    <>
      <PanelSection
        action={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportFile(f);
                e.target.value = "";
              }}
              aria-label="Import theme file"
            />
            <PanelActionButton variant="ghost" onClick={() => fileRef.current?.click()} label="Import a theme from a JSON file">
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Import theme</span>
              <span className="sm:hidden">Import</span>
            </PanelActionButton>
          </>
        }
      >
        All themes
      </PanelSection>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {themes.map((t) => (
          <ThemeCard
            key={t.id}
            theme={t}
            active={t.id === activeThemeId}
            onActivate={() => {
              setTheme(t.id);
              toast.success(`Theme: ${t.name}`);
            }}
            onEdit={t.custom ? () => onEdit(t) : undefined}
            onDuplicate={t.custom ? () => {
              const copy = duplicateTheme(t.id, `${t.name} copy`);
              if (copy) toast.success(`“${copy.name}” created`);
              else toast.error("Could not duplicate that theme");
            } : undefined}
            onDelete={t.custom ? () => onDelete(t) : undefined}
            onExport={t.custom ? () => exportThemeFile(t) : undefined}
          />
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-c">
        Tap a card to apply it instantly. Custom themes live on this device — edit, duplicate, delete or export them from
        their card actions.
      </p>
    </>
  );
}

/* ═══════════════════════════ TAB 2 — WALLPAPER ═══════════════════════════ */

function WallpaperTab() {
  const activeThemeId = useAppearanceStore((s) => s.activeThemeId);
  const customThemes = useAppearanceStore((s) => s.customThemes);
  const wallpaper = useAppearanceStore((s) => s.wallpaper);
  const setWallpaper = useAppearanceStore((s) => s.setWallpaper);
  const theme = resolveTheme(activeThemeId, customThemes);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Local overrides so the picker/hex stay responsive before (and independent of) store writes. */
  const [segmentChoice, setSegmentChoice] = useState<WallpaperSettings["type"] | null>(null);
  const [hexChoice, setHexChoice] = useState<string | null>(null);

  const type: WallpaperSettings["type"] = segmentChoice ?? wallpaper?.type ?? "none";
  const hexValue = hexChoice ?? (wallpaper?.type === "solid" ? (wallpaper.value ?? "") : "");
  const hasImage = wallpaper?.type === "image" && typeof wallpaper.value === "string";
  const imageBlur = wallpaper?.type === "image" ? (wallpaper.blur ?? 0) : 0;
  const imageDim = wallpaper?.type === "image" ? (wallpaper.dim ?? 0.5) : 0;

  const stripStyle: CSSProperties = (() => {
    if (wallpaper?.type === "solid" && wallpaper.value) return { background: wallpaper.value };
    if (wallpaper?.type === "gradient" && wallpaper.value)
      return { background: "var(--card-solid)", backgroundImage: wallpaper.value };
    if (wallpaper?.type === "image") return { background: "var(--card-solid)" };
    return { background: theme.colors.bg, backgroundImage: theme.colors.bgImage ?? "none" };
  })();

  const currentLabel =
    wallpaper?.type === "solid" && wallpaper.value
      ? `Solid · ${wallpaper.value}`
      : wallpaper?.type === "gradient" && wallpaper.value
        ? `Gradient · ${GRADIENTS.find((g) => g.css === wallpaper.value)?.name ?? "Custom"}`
        : wallpaper?.type === "image"
          ? `Custom image${imageBlur ? ` · ${Math.round(imageBlur)} px blur` : ""}`
          : wallpaper?.type === "animated"
            ? "Animated"
            : `Theme background — ${theme.name}`;

  const patchImage = (patch: { dim?: number; blur?: number }) => {
    if (wallpaper?.type !== "image" || !wallpaper.value) return;
    setWallpaper({
      type: "image",
      value: wallpaper.value,
      dim: patch.dim ?? wallpaper.dim ?? 0.5,
      blur: patch.blur ?? wallpaper.blur ?? 0,
    });
  };

  const handleImageFile = (file: File) => {
    if (file.size >= 4 * 1024 * 1024) {
      toast.error("Image must be under 4 MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("That file is not an image");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setWallpaper({ type: "image", value: reader.result, dim: 0.5, blur: 0 });
      toast.success("Wallpaper image set");
    };
    reader.onerror = () => toast.error("Could not read that image");
    reader.readAsDataURL(file);
  };

  const applyHex = () => {
    const v = hexValue.trim().toLowerCase();
    if (!isHex(v)) {
      toast.error("Enter a 6-digit hex color, like #10141c");
      return;
    }
    setHexChoice(v);
    setWallpaper({ type: "solid", value: v });
    toast.success(`Solid ${v} applied`);
  };

  const chooseType = (t: WallpaperSettings["type"]) => {
    setSegmentChoice(t);
    if (t === "none") {
      if (wallpaper) {
        setWallpaper(null);
        toast.success("Wallpaper removed — using the theme background");
      }
      return;
    }
    if (t === "solid") {
      if (wallpaper?.type === "solid") return;
      const value = isHex(hexValue.trim()) ? hexValue.trim().toLowerCase() : SOLID_SWATCHES[0];
      setHexChoice(value);
      setWallpaper({ type: "solid", value });
      return;
    }
    if (t === "gradient") {
      if (wallpaper?.type === "gradient" && wallpaper.value) return;
      setWallpaper({ type: "gradient", value: GRADIENTS[0].css });
      return;
    }
    fileRef.current?.click();
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImageFile(f);
          e.target.value = "";
        }}
        aria-label="Choose wallpaper image"
      />

      <PanelSection>Current</PanelSection>
      <div className="widget overflow-hidden">
        <div className="relative h-44" style={stripStyle}>
          {hasImage && wallpaper?.value && (
            <>
              <img
                src={wallpaper.value}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover"
                style={{
                  filter: imageBlur > 0 ? `blur(${imageBlur}px) saturate(1.05)` : undefined,
                  transform: imageBlur > 0 ? "scale(1.08)" : undefined,
                }}
              />
              {imageDim > 0 && (
                <span className="absolute inset-0" style={{ background: `rgba(0,0,0,${imageDim})` }} aria-hidden="true" />
              )}
            </>
          )}
          <span
            className="absolute left-3 top-3 flex h-14 w-36 flex-col justify-center gap-1.5 rounded-xl px-3"
            style={{ background: "color-mix(in srgb, var(--card-solid) 82%, transparent)", border: "1px solid var(--border-c)" }}
            aria-hidden="true"
          >
            <span className="tnum display-time text-lg" style={{ color: "var(--text)" }}>
              21:47
            </span>
            <span className="block h-1.5 w-9 rounded-full" style={{ background: "var(--text-muted)" }} />
            <span className="mt-0.5 block h-4 w-12 rounded-md" style={{ background: "var(--accent)" }} />
          </span>
          <span
            className="absolute right-3 top-3 h-14 w-20 rounded-xl"
            style={{ background: "color-mix(in srgb, var(--card-solid) 82%, transparent)", border: "1px solid var(--border-c)" }}
            aria-hidden="true"
          />
          <span
            className="absolute bottom-3 left-3 h-10 w-44 rounded-xl"
            style={{ background: "color-mix(in srgb, var(--card-solid) 82%, transparent)", border: "1px solid var(--border-c)" }}
            aria-hidden="true"
          />
        </div>
        <div className="flex items-center justify-between gap-2 border-t hairline px-3 py-2.5">
          <p className="truncate text-xs text-muted-c">{currentLabel}</p>
          {wallpaper && (
            <button
              type="button"
              onClick={() => {
                setWallpaper(null);
                setSegmentChoice("none");
                toast.success("Wallpaper removed");
              }}
              className="press shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-c transition-colors hover:text-[var(--text)]"
              style={{ background: "color-mix(in srgb, var(--text) 7%, transparent)" }}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="mt-4" />
      <PanelSection>Wallpaper type</PanelSection>
      <div className="widget p-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Wallpaper type">
          {WALLPAPER_TYPES.map((t) => (
            <Pill key={t.id} active={type === t.id} onClick={() => chooseType(t.id)}>
              {t.label}
            </Pill>
          ))}
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-muted-c">
          None keeps the theme’s own background. Everything else paints over it — all changes apply live.
        </p>
      </div>

      {type === "solid" && (
        <>
          <div className="mt-4" />
          <PanelSection>Solid color</PanelSection>
          <div className="widget p-4">
            <div className="flex flex-wrap gap-2">
              {SOLID_SWATCHES.map((s) => {
                const active = wallpaper?.type === "solid" && wallpaper.value === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setHexChoice(s);
                      setWallpaper({ type: "solid", value: s });
                    }}
                    aria-label={`Solid color ${s}`}
                    aria-pressed={active}
                    className="press h-8 w-8 rounded-full border hairline"
                    style={{
                      background: s,
                      boxShadow: active ? "0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent)" : undefined,
                    }}
                  />
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <input
                value={hexValue}
                onChange={(e) => setHexChoice(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyHex();
                }}
                placeholder="#10141c"
                spellCheck={false}
                maxLength={7}
                aria-label="Custom solid color hex"
                className="h-9 w-28 rounded-lg border hairline bg-transparent px-3 font-mono text-sm outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
              />
              <PanelActionButton onClick={applyHex} label="Apply solid color">
                <Check className="h-4 w-4" />
                Apply
              </PanelActionButton>
              <span className="text-xs text-muted-c">{isHex(hexValue.trim()) ? "6-digit hex" : "e.g. #10141c"}</span>
            </div>
          </div>
        </>
      )}

      {type === "gradient" && (
        <>
          <div className="mt-4" />
          <PanelSection>Gradients</PanelSection>
          <div className="widget p-4">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {GRADIENTS.map((g) => {
                const active = wallpaper?.type === "gradient" && wallpaper.value === g.css;
                return (
                  <button
                    key={g.name}
                    type="button"
                    onClick={() => setWallpaper({ type: "gradient", value: g.css })}
                    aria-label={`Gradient ${g.name}`}
                    aria-pressed={active}
                    className="press overflow-hidden rounded-xl border text-left hairline"
                    style={{
                      boxShadow: active ? "0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent)" : undefined,
                    }}
                  >
                    <span className="block h-16 w-full" style={{ background: g.css }} aria-hidden="true" />
                    <span className="block px-2 py-1.5 text-[11px] font-medium">{g.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {type === "image" && (
        <>
          <div className="mt-4" />
          <PanelSection>Image</PanelSection>
          <div className="widget p-4">
            {hasImage && wallpaper?.value ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <img
                    src={wallpaper.value}
                    alt="Wallpaper thumbnail"
                    className="h-16 w-24 rounded-lg border hairline object-cover"
                    style={{
                      filter: imageBlur > 0 ? `blur(${Math.min(imageBlur, 6)}px)` : undefined,
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <PanelActionButton variant="ghost" onClick={() => fileRef.current?.click()} label="Replace wallpaper image">
                      <Upload className="h-4 w-4" />
                      Replace
                    </PanelActionButton>
                    <PanelActionButton
                      variant="ghost"
                      onClick={() => {
                        setWallpaper(null);
                        setSegmentChoice("none");
                        toast.success("Wallpaper removed");
                      }}
                      label="Remove wallpaper image"
                    >
                      <X className="h-4 w-4" />
                      Remove
                    </PanelActionButton>
                  </div>
                </div>
                <div className="mt-2" />
                <SliderRow
                  label="Dim"
                  value={imageDim}
                  min={0}
                  max={0.8}
                  step={0.05}
                  format={pct}
                  onChange={(v) => patchImage({ dim: v })}
                />
                <SliderRow
                  label="Blur"
                  value={imageBlur}
                  min={0}
                  max={24}
                  step={1}
                  format={px}
                  onChange={(v) => patchImage({ blur: v })}
                />
              </>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="press flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed text-muted-c transition-colors hover:text-[var(--text)]"
                style={{ borderColor: "color-mix(in srgb, var(--text) 25%, transparent)" }}
              >
                <Upload className="h-4 w-4" />
                <span className="text-xs font-semibold">Choose an image — under 4 MB</span>
                <span className="text-[10px]">JPG, PNG or WebP · stored locally, never uploaded</span>
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}

/* ═══════════════════════════ TAB 3 — MOTION ═══════════════════════════ */

function MotionTab() {
  const settings = useSettingsStore();
  const update = useSettingsStore((s) => s.update);
  const activeThemeId = useAppearanceStore((s) => s.activeThemeId);
  const customThemes = useAppearanceStore((s) => s.customThemes);
  const theme = resolveTheme(activeThemeId, customThemes);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeId = useWorkspaceStore((s) => s.activeId);
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);

  const target = workspaces.find((w) => w.id === activeId) ?? workspaces[0] ?? null;
  const currentOverride = target?.animationOverride ?? null;
  const setOverride = (id: string | null) => {
    if (target) updateWorkspace(target.id, { animationOverride: id });
  };

  const alphaValue = settings.widgetAlphaOverride ?? theme.effects.widgetAlpha;
  const defaultAnimLabel =
    theme.effects.animation === "none" ? "None" : RENDERER_LABELS[theme.effects.animation] ?? theme.effects.animation;
  const motionOff = !settings.animationsEnabled || settings.reducedMotion;

  return (
    <>
      <PanelSection>Motion</PanelSection>
      <div className="widget p-4">
        <SwitchRow
          label="Background animations"
          hint="Ambient canvas backgrounds behind your dashboard"
          checked={settings.animationsEnabled}
          onCheckedChange={(v) => update({ animationsEnabled: v })}
        />
        <div className="my-1.5 border-t hairline" />
        <SwitchRow
          label="Reduced motion"
          hint="Pauses background movement for a calmer, accessibility-friendly experience"
          checked={settings.reducedMotion}
          onCheckedChange={(v) => update({ reducedMotion: v })}
        />
      </div>

      <div className="mt-4" />
      <PanelSection action={target ? <span className="text-xs text-muted-c">{target.name}</span> : undefined}>
        Animation for this workspace
      </PanelSection>
      <div className="widget p-4">
        {target ? (
          <>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Workspace animation">
              <Pill active={currentOverride === null} onClick={() => setOverride(null)}>
                Theme default
              </Pill>
              {RENDERER_IDS.map((id) => (
                <Pill key={id} active={currentOverride === id} onClick={() => setOverride(id)}>
                  {RENDERER_LABELS[id] ?? id}
                </Pill>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-c">
              {currentOverride === null
                ? `Following the theme default (${defaultAnimLabel} from “${theme.name}”). Pick a renderer to override it for this workspace only.`
                : "Overriding the theme default for this workspace only — switch back anytime with “Theme default”."}
            </p>
            {motionOff && (
              <p
                className="mt-2 rounded-lg px-3 py-2 text-xs"
                style={{ background: "color-mix(in srgb, var(--warning) 12%, transparent)", color: "var(--warning)" }}
              >
                {!settings.animationsEnabled
                  ? "Background animations are switched off above."
                  : "Reduced motion is on — backgrounds stay paused."}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-c">No workspace available yet.</p>
        )}
      </div>

      <div className="mt-4" />
      <PanelSection>Motion tuning</PanelSection>
      <div className="widget p-4">
        <SliderRow
          label="Animation intensity"
          value={settings.animationIntensity}
          min={0}
          max={1}
          step={0.05}
          format={pct}
          onChange={(v) => update({ animationIntensity: v })}
        />
        <SliderRow
          label="Animation speed"
          value={settings.animationSpeed}
          min={0.25}
          max={2}
          step={0.05}
          format={times}
          onChange={(v) => update({ animationSpeed: v })}
        />
      </div>

      <div className="mt-4" />
      <PanelSection>Typeface</PanelSection>
      <div className="widget p-4">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Typeface">
          {FONTS.map((f) => (
            <Pill key={f.id} active={settings.font === f.id} onClick={() => update({ font: f.id })} fontFamily={FONT_STACKS[f.id]}>
              {f.label}
            </Pill>
          ))}
        </div>
      </div>

      <div className="mt-4" />
      <PanelSection>Widget transparency</PanelSection>
      <div className="widget p-4">
        <SliderRow
          label={settings.widgetAlphaOverride === null ? "Widget transparency · theme default" : "Widget transparency"}
          value={alphaValue}
          min={0.3}
          max={1}
          step={0.05}
          format={pct}
          onChange={(v) => update({ widgetAlphaOverride: v })}
        />
        {settings.widgetAlphaOverride !== null ? (
          <button
            type="button"
            onClick={() => update({ widgetAlphaOverride: null })}
            className="press mt-1 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-c transition-colors hover:text-[var(--text)]"
            style={{ background: "color-mix(in srgb, var(--text) 7%, transparent)" }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Theme default
          </button>
        ) : (
          <p className="mt-1 text-xs text-muted-c">Currently following the theme default ({pct(alphaValue)}).</p>
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════ TAB 4 — BUILDER ═══════════════════════════ */

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const pickerValue = hex6(value);
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[84px] shrink-0 truncate text-xs text-muted-c">{label}</span>
      <input
        type="color"
        value={pickerValue ?? "#000000"}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} color picker`}
        className="h-8 w-10 shrink-0 cursor-pointer rounded border hairline bg-transparent p-0.5"
      />
      <input
        type="text"
        value={value}
        spellCheck={false}
        maxLength={18}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} hex value`}
        className="h-8 min-w-0 flex-1 rounded-lg border hairline bg-transparent px-2.5 font-mono text-xs outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
      />
    </div>
  );
}

function ThemeLivePreview({ theme }: { theme: ThemeDefinition }) {
  const c = theme.colors;
  const e = theme.effects;
  const surface = withAlpha(c.surface, Math.min(1, e.widgetAlpha));
  const barRadius = Math.max(6, Math.round(e.radius * 0.75));
  const bar: CSSProperties = { background: surface, border: `1px solid ${c.border}`, borderRadius: barRadius };
  return (
    <div className="overflow-hidden rounded-xl border hairline p-4" style={{ background: c.bg, backgroundImage: c.bgImage ?? "none" }}>
      <div className="h-9" style={bar} />
      <div className="mt-2 h-4" style={bar} />
      <div className="mt-3 flex items-center gap-2">
        <span
          className="rounded-lg px-2.5 py-1 text-[10px] font-semibold"
          style={{ background: c.accent, color: c.accentFg }}
        >
          Start focus
        </span>
        <span className="h-2 w-8 rounded-full" style={{ background: c.accent2 }} />
      </div>
      <p className="mt-3 text-sm font-medium" style={{ color: c.text }}>
        Aa — The quick brown fox
      </p>
      <p className="mt-1 text-[10px]" style={{ color: c.textMuted }}>
        Muted text · tabular 21:47
      </p>
    </div>
  );
}

function ThemeBuilder({
  draft,
  setDraft,
  onDelete,
  onClose,
}: {
  draft: ThemeDefinition;
  setDraft: Dispatch<SetStateAction<ThemeDefinition | null>>;
  onDelete: (theme: ThemeDefinition) => void;
  onClose: () => void;
}) {
  const customThemes = useAppearanceStore((s) => s.customThemes);
  const saveCustomTheme = useAppearanceStore((s) => s.saveCustomTheme);
  const duplicateTheme = useAppearanceStore((s) => s.duplicateTheme);
  const setTheme = useAppearanceStore((s) => s.setTheme);

  const patchColors = (patch: Partial<ThemeColors>) =>
    setDraft((d) => (d ? { ...d, colors: { ...d.colors, ...patch } } : d));
  const patchEffects = (patch: Partial<ThemeEffects>) =>
    setDraft((d) => (d ? { ...d, effects: { ...d.effects, ...patch } } : d));

  const name = draft.name.trim() || "Untitled theme";

  const handleSave = () => {
    const def: ThemeDefinition = {
      ...draft,
      name,
      custom: true,
      createdAt: draft.createdAt ?? Date.now(),
    };
    saveCustomTheme(def);
    setDraft({ ...def });
    setTheme(def.id);
    toast.success(`“${name}” saved & applied`);
  };

  const handleDuplicate = () => {
    const copy = duplicateTheme(draft.id, `${name} copy`);
    if (!copy) {
      toast.error("Could not duplicate this theme");
      return;
    }
    setDraft(structuredClone(copy));
    toast.success(`“${copy.name}” created`);
  };

  const handleReset = () => {
    const saved = customThemes.find((t) => t.id === draft.id);
    if (!saved) {
      toast.error("Nothing to reset to yet — hit Save first");
      return;
    }
    setDraft(structuredClone(saved));
    toast("Draft reset to the last saved version");
  };

  return (
    <div className="widget p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <input
          value={draft.name}
          onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
          maxLength={48}
          placeholder="Theme name"
          aria-label="Theme name"
          className="h-9 min-w-0 flex-1 rounded-lg border hairline bg-transparent px-3 text-sm font-semibold outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close theme editor"
          className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-c transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-[var(--text)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(190px,240px)_1fr]">
        <div>
          <PanelSection>Live preview</PanelSection>
          <ThemeLivePreview theme={draft} />
          <div className="mt-4" />
          <PanelSection>Mode</PanelSection>
          <SwitchRow
            label="Dark theme"
            hint="Base color scheme for controls"
            checked={draft.dark}
            onCheckedChange={(v) => setDraft((d) => (d ? { ...d, dark: v } : d))}
          />
        </div>

        <div className="min-w-0">
          <PanelSection>Colors</PanelSection>
          <div className="grid gap-2 sm:grid-cols-2">
            {COLOR_FIELDS.map((f) => (
              <ColorRow
                key={f.key}
                label={f.label}
                value={draft.colors[f.key]}
                onChange={(v) => patchColors({ [f.key]: v })}
              />
            ))}
          </div>

          <div className="mt-4" />
          <PanelSection>Effects</PanelSection>
          <div className="grid gap-x-6 sm:grid-cols-2">
            <SliderRow
              label="Widget transparency"
              value={draft.effects.widgetAlpha}
              min={0.3}
              max={1}
              step={0.05}
              format={pct}
              onChange={(v) => patchEffects({ widgetAlpha: v })}
            />
            <SliderRow
              label="Backdrop blur"
              value={draft.effects.blur}
              min={0}
              max={30}
              step={1}
              format={px}
              onChange={(v) => patchEffects({ blur: v })}
            />
            <SliderRow
              label="Corner radius"
              value={draft.effects.radius}
              min={4}
              max={24}
              step={1}
              format={px}
              onChange={(v) => patchEffects({ radius: v })}
            />
            <SliderRow
              label="Film grain"
              value={draft.effects.grain}
              min={0}
              max={0.12}
              step={0.005}
              format={(v) => `${(v * 100).toFixed(1)}%`}
              onChange={(v) => patchEffects({ grain: v })}
            />
            <SliderRow
              label="Animation intensity"
              value={draft.effects.animationIntensity}
              min={0}
              max={1}
              step={0.05}
              format={pct}
              onChange={(v) => patchEffects({ animationIntensity: v })}
            />
            <SliderRow
              label="Animation speed"
              value={draft.effects.animationSpeed}
              min={0.25}
              max={2}
              step={0.05}
              format={times}
              onChange={(v) => patchEffects({ animationSpeed: v })}
            />
            <div className="py-1.5 sm:col-span-2">
              <p className="mb-1.5 text-sm font-medium">Default animation</p>
              <SelectField
                label="Theme default animation"
                value={draft.effects.animation}
                options={ANIM_OPTIONS}
                onChange={(v) => patchEffects({ animation: v as AnimationId })}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t hairline pt-4">
        <PanelActionButton onClick={handleSave} label="Save custom theme">
          <Save className="h-4 w-4" />
          Save
        </PanelActionButton>
        <PanelActionButton variant="ghost" onClick={handleDuplicate} label="Duplicate this theme">
          <Copy className="h-4 w-4" />
          Duplicate
        </PanelActionButton>
        <PanelActionButton variant="ghost" onClick={handleReset} label="Reset draft to the saved version">
          <RotateCcw className="h-4 w-4" />
          Reset draft
        </PanelActionButton>
        <PanelActionButton variant="ghost" onClick={() => exportThemeFile(draft)} label="Export theme as JSON">
          <Download className="h-4 w-4" />
          Export
        </PanelActionButton>
        {draft.custom && (
          <PanelActionButton variant="danger" onClick={() => onDelete(draft)} label="Delete this custom theme">
            <Trash2 className="h-4 w-4" />
            Delete
          </PanelActionButton>
        )}
      </div>
    </div>
  );
}

function BuilderTab({
  draft,
  setDraft,
  onCreate,
  onDelete,
}: {
  draft: ThemeDefinition | null;
  setDraft: Dispatch<SetStateAction<ThemeDefinition | null>>;
  onCreate: () => void;
  onDelete: (theme: ThemeDefinition) => void;
}) {
  if (draft) {
    return (
      <ThemeBuilder
        draft={draft}
        setDraft={setDraft}
        onDelete={onDelete}
        onClose={() => setDraft(null)}
      />
    );
  }

  return (
    <>
      <PanelSection>Theme builder</PanelSection>
      <div className="widget p-2">
        <PanelEmptyState
          icon={<Paintbrush className="h-5 w-5" style={{ color: "var(--accent)" }} />}
          title="Build your own theme"
          hint="Start from the theme you’re using right now — every color, surface, effect and animation is editable. Custom themes are saved on this device and can be exported as JSON to share or back up."
          action={
            <PanelActionButton onClick={onCreate} label="Create a custom theme from the active one">
              <Plus className="h-4 w-4" />
              Create custom theme
            </PanelActionButton>
          }
        />
      </div>
    </>
  );
}

/* ═══════════════════════════ PANEL ═══════════════════════════ */

export function ThemesPanel() {
  const [tab, setTab] = useState<TabId>("themes");
  const [draft, setDraft] = useState<ThemeDefinition | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ThemeDefinition | null>(null);

  const activeThemeId = useAppearanceStore((s) => s.activeThemeId);
  const customThemes = useAppearanceStore((s) => s.customThemes);
  const setTheme = useAppearanceStore((s) => s.setTheme);
  const duplicateTheme = useAppearanceStore((s) => s.duplicateTheme);
  const deleteCustomTheme = useAppearanceStore((s) => s.deleteCustomTheme);
  const activeTheme = resolveTheme(activeThemeId, customThemes);
  const totalThemes = BUILT_IN_THEMES.length + customThemes.length;

  const openEditor = (theme: ThemeDefinition) => {
    setDraft(structuredClone(theme));
    setTab("builder");
  };

  /** "Create custom theme" — duplicate the active theme, apply it, open the copy in the editor. */
  const handleCreate = () => {
    const copy = duplicateTheme(activeThemeId, "My theme");
    if (!copy) {
      toast.error("Could not create a new theme");
      return;
    }
    setDraft(structuredClone(copy));
    setTheme(copy.id);
    setTab("builder");
    toast.success(`“My theme” started from “${activeTheme.name}”`);
  };

  const confirmDelete = () => {
    const t = pendingDelete;
    if (!t) return;
    deleteCustomTheme(t.id);
    if (draft?.id === t.id) setDraft(null);
    setPendingDelete(null);
    toast.success(`“${t.name}” deleted`);
  };

  return (
    <PanelShell
      title="Theme studio"
      subtitle={`${totalThemes} themes · ${customThemes.length} custom`}
      icon={<Palette className="h-4 w-4" />}
    >
      <div className="fd-scroll -mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Theme studio sections">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                "press flex h-8 shrink-0 items-center rounded-full px-3.5 text-xs font-semibold transition-colors",
                active ? "text-[var(--accent-fg)]" : "text-muted-c hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-[var(--text)]"
              )}
              style={active ? { background: "var(--accent)" } : undefined}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "themes" && <ThemesGallery onEdit={openEditor} onDelete={setPendingDelete} />}
      {tab === "wallpaper" && <WallpaperTab />}
      {tab === "motion" && <MotionTab />}
      {tab === "builder" && (
        <BuilderTab draft={draft} setDraft={setDraft} onCreate={handleCreate} onDelete={setPendingDelete} />
      )}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the custom theme from your library. If it’s active, Flowdeck falls back to
              Midnight. Built-in themes are never affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg"
              style={{ background: "color-mix(in srgb, var(--negative) 15%, transparent)", color: "var(--negative)" }}
              onClick={confirmDelete}
            >
              Delete theme
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PanelShell>
  );
}
