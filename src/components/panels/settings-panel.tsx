"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  Accessibility,
  AudioLines,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  Database,
  Download,
  EyeOff,
  Info,
  Keyboard,
  LayoutGrid,
  Minus,
  MonitorSmartphone,
  Palette,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash2,
  Upload,
  Volume2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { PanelActionButton, PanelSection, PanelShell } from "./panel-shell";
import { Switch } from "@/components/ui/switch";
import { resolveTheme, useAppearanceStore } from "@/lib/store/appearance-store";
import { useSettingsStore } from "@/lib/store/settings-store";
import type { TimerSettings } from "@/lib/store/settings-store";
import { useShortcutStore, SHORTCUT_ACTIONS, eventToBinding, prettyBinding } from "@/lib/store/shortcut-store";
import { useSoundStore } from "@/lib/store/sound-store";
import { useUIStore } from "@/lib/store/ui-store";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { soundscape } from "@/lib/audio/engine";
import { ICON_NAMES, iconByName } from "@/lib/icon-map";
import { downloadBackup, exportBackup, parseBackup, STORE_KEYS } from "@/lib/backup";
import type { ImportResult } from "@/lib/backup";
import { idbStorage, storageReport, wipeAllStorage } from "@/lib/store/persist";
import type { FontChoice } from "@/lib/themes/types";
import type { TimerMode } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ============================================================
 * Settings — everything persists instantly on this device
 * ============================================================ */

type SectionId =
  | "appearance"
  | "dashboard"
  | "timer"
  | "notifications"
  | "sounds"
  | "shortcuts"
  | "data"
  | "privacy"
  | "pwa"
  | "accessibility"
  | "about";

const SECTIONS: { id: SectionId; label: string; icon: LucideIcon }[] = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "timer", label: "Timer", icon: Timer },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "sounds", label: "Sounds", icon: Volume2 },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "data", label: "Data", icon: Database },
  { id: "privacy", label: "Privacy", icon: ShieldCheck },
  { id: "pwa", label: "Install & offline", icon: MonitorSmartphone },
  { id: "accessibility", label: "Accessibility", icon: Accessibility },
  { id: "about", label: "About", icon: Info },
];

/** Store keys persisted in localStorage (everything else lives in IndexedDB). */
const LS_KEYS: readonly string[] = [
  "flowdeck-settings",
  "flowdeck-timer",
  "flowdeck-workspaces",
  "flowdeck-shortcuts",
];

const STORE_LABELS: Record<string, string> = {
  "flowdeck-settings": "Settings",
  "flowdeck-timer": "Timer",
  "flowdeck-workspaces": "Workspaces",
  "flowdeck-shortcuts": "Shortcuts",
  "flowdeck-appearance": "Themes & wallpaper",
  "flowdeck-tasks": "Tasks",
  "flowdeck-habits": "Habits",
  "flowdeck-goals": "Goals",
  "flowdeck-notes": "Notes",
  "flowdeck-sessions": "Sessions",
  "flowdeck-study": "Study data",
  "flowdeck-sound": "Sound settings",
};

const FONT_OPTIONS: { value: FontChoice; label: string }[] = [
  { value: "sans", label: "Sans" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Mono" },
  { value: "rounded", label: "Rounded" },
];

const TIMER_MODES: { value: TimerMode; label: string }[] = [
  { value: "pomodoro", label: "Pomodoro" },
  { value: "deepwork", label: "Deep work" },
  { value: "stopwatch", label: "Stopwatch" },
  { value: "countdown", label: "Countdown" },
];

const COMPLETION_SOUNDS: { value: TimerSettings["completionSound"]; label: string }[] = [
  { value: "chime", label: "Chime" },
  { value: "bell", label: "Bell" },
  { value: "pulse", label: "Pulse" },
  { value: "none", label: "None" },
];

const ICON_OPTIONS = ICON_NAMES.map((n) => ({
  value: n,
  label: n.replace(/-/g, " ").replace(/^./, (ch) => ch.toUpperCase()),
}));

/* ---------- helpers ---------- */

const pct = (v: number) => `${Math.round(v * 100)}%`;

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function safeJsonParse(raw: string | null): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/* ---------- shared rows ---------- */

function SettingCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("widget p-4", className)}>{children}</div>;
}

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

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
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

function SelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0 text-sm font-medium">{label}</span>
      <SelectField label={label} value={value} options={options} onChange={onChange} className="w-40 shrink-0" />
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0 text-sm font-medium">{label}</span>
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(clamp(value - step))}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          className="press flex h-9 w-9 items-center justify-center rounded-lg text-muted-c transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-[var(--text)] disabled:opacity-40"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="tnum w-14 text-center text-sm font-semibold">{format ? format(value) : value}</span>
        <button
          type="button"
          onClick={() => onChange(clamp(value + step))}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
          className="press flex h-9 w-9 items-center justify-center rounded-lg text-muted-c transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-[var(--text)] disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
      </span>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className="rounded-md border hairline px-2 py-0.5 text-[11px] font-medium"
      style={{ background: "color-mix(in srgb, var(--text) 4%, transparent)" }}
    >
      {children}
    </kbd>
  );
}

/* ═══════════════════════════ APPEARANCE ═══════════════════════════ */

function AppearanceSection() {
  const settings = useSettingsStore();
  const update = useSettingsStore((s) => s.update);
  const activeThemeId = useAppearanceStore((s) => s.activeThemeId);
  const customThemes = useAppearanceStore((s) => s.customThemes);
  const theme = resolveTheme(activeThemeId, customThemes);
  const alpha = settings.widgetAlphaOverride ?? theme.effects.widgetAlpha;

  return (
    <>
      <PanelSection>Motion</PanelSection>
      <SettingCard>
        <SwitchRow
          label="Background animations"
          hint="Ambient canvas backgrounds behind your dashboard"
          checked={settings.animationsEnabled}
          onCheckedChange={(v) => update({ animationsEnabled: v })}
        />
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
          format={(v) => `${v.toFixed(2)}×`}
          onChange={(v) => update({ animationSpeed: v })}
        />
        <div className="my-1.5 border-t hairline" />
        <SwitchRow
          label="Respect reduced motion"
          hint="Also respects your OS setting automatically"
          checked={settings.reducedMotion}
          onCheckedChange={(v) => update({ reducedMotion: v })}
        />
      </SettingCard>

      <div className="mt-4" />
      <PanelSection>Typeface</PanelSection>
      <SettingCard>
        <SelectRow
          label="Typeface"
          value={settings.font}
          options={FONT_OPTIONS}
          onChange={(v) => update({ font: v })}
        />
        <p className="mt-2 text-xs text-muted-c">Applies to headings, labels and body text across the app.</p>
      </SettingCard>

      <div className="mt-4" />
      <PanelSection>Widget transparency</PanelSection>
      <SettingCard>
        <SliderRow
          label={settings.widgetAlphaOverride === null ? "Widget transparency · theme default" : "Widget transparency"}
          value={alpha}
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
          <p className="mt-1 text-xs text-muted-c">Currently following the theme default ({pct(alpha)}).</p>
        )}
      </SettingCard>

      <div className="mt-4" />
      <PanelSection>Clock</PanelSection>
      <SettingCard>
        <SwitchRow
          label="24-hour clock"
          checked={settings.clock24h}
          onCheckedChange={(v) => update({ clock24h: v })}
        />
        <SwitchRow
          label="Show seconds"
          checked={settings.showSeconds}
          onCheckedChange={(v) => update({ showSeconds: v })}
        />
        <SwitchRow label="Show date" checked={settings.showDate} onCheckedChange={(v) => update({ showDate: v })} />
        <SelectRow
          label="Week starts on"
          value={settings.weekStart === 0 ? "sunday" : "monday"}
          options={[
            { value: "sunday", label: "Sunday" },
            { value: "monday", label: "Monday" },
          ]}
          onChange={(v) => update({ weekStart: v === "sunday" ? 0 : 1 })}
        />
      </SettingCard>
    </>
  );
}

/* ═══════════════════════════ DASHBOARD ═══════════════════════════ */

function DashboardSection() {
  const settings = useSettingsStore();
  const update = useSettingsStore((s) => s.update);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const resetToDefaults = useWorkspaceStore((s) => s.resetToDefaults);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("sparkles");
  const [resetOpen, setResetOpen] = useState(false);

  /* "Your name" — debounced commit so the greeting store isn't hit on every keystroke */
  const [nameDraft, setNameDraft] = useState(settings.name);
  const [syncedName, setSyncedName] = useState(settings.name);
  const nameRef = useRef(settings.name);
  const nameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* mirror out-of-band name changes (e.g. a settings reset) into the draft while rendering */
  if (settings.name !== syncedName) {
    setSyncedName(settings.name);
    setNameDraft(settings.name);
  }

  const handleNameChange = (v: string) => {
    setNameDraft(v);
    nameRef.current = v;
    if (nameTimer.current) clearTimeout(nameTimer.current);
    nameTimer.current = setTimeout(() => {
      nameTimer.current = null;
      update({ name: nameRef.current });
    }, 400);
  };

  /* flush pending keystrokes when this section unmounts */
  useEffect(
    () => () => {
      if (nameTimer.current) {
        clearTimeout(nameTimer.current);
        update({ name: nameRef.current });
      }
    },
    [update]
  );

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    addWorkspace({ name, icon: newIcon });
    setNewName("");
    toast.success(`Workspace “${name}” added`);
  };

  const handleDelete = (id: string, name: string) => {
    if (workspaces.length <= 1) {
      toast.error("At least one workspace is required");
      return;
    }
    deleteWorkspace(id);
    toast.success(`“${name}” removed`);
  };

  return (
    <>
      <PanelSection>Layout</PanelSection>
      <SettingCard>
        <SwitchRow
          label="Compact widgets"
          hint="Tighter padding for denser dashboards"
          checked={settings.compactWidgets}
          onCheckedChange={(v) => update({ compactWidgets: v })}
        />
      </SettingCard>

      <div className="mt-4" />
      <PanelSection>Greeting</PanelSection>
      <SettingCard>
        <label htmlFor="fd-your-name" className="mb-1.5 block text-sm font-medium">
          Your name
        </label>
        <input
          id="fd-your-name"
          value={nameDraft}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Shown in the greeting widget"
          maxLength={40}
          className="h-9 w-full max-w-xs rounded-lg border hairline bg-transparent px-3 text-sm outline-none placeholder:text-muted-c focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
        />
      </SettingCard>

      <div className="mt-4" />
      <PanelSection action={<span className="text-xs text-muted-c">{workspaces.length} total</span>}>
        Workspaces
      </PanelSection>
      <SettingCard>
        <div className="divide-y hairline">
          {workspaces.map((w) => {
            const Icon = iconByName(w.icon);
            return (
              <div key={w.id} className="flex flex-wrap items-center gap-2 py-2.5 first:pt-0 last:pb-0">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)" }}
                  aria-hidden="true"
                >
                  <Icon className="h-4 w-4" />
                </span>
                <input
                  value={w.name}
                  onChange={(e) => updateWorkspace(w.id, { name: e.target.value })}
                  aria-label={`Rename workspace ${w.name}`}
                  maxLength={24}
                  className="h-9 min-w-0 flex-1 basis-32 rounded-lg border hairline bg-transparent px-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
                />
                <SelectField
                  label={`Icon for workspace ${w.name}`}
                  value={w.icon}
                  options={ICON_OPTIONS}
                  onChange={(v) => updateWorkspace(w.id, { icon: v })}
                  className="w-36 shrink-0"
                />
                <button
                  type="button"
                  onClick={() => handleDelete(w.id, w.name)}
                  aria-label={`Delete workspace ${w.name}`}
                  disabled={workspaces.length <= 1}
                  title={
                    workspaces.length <= 1
                      ? "The last workspace can’t be deleted"
                      : `Delete workspace ${w.name}`
                  }
                  className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-c transition-colors hover:text-[var(--negative)] disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-3 border-t hairline pt-3">
          <p className="mb-2 text-xs font-medium text-muted-c">Add workspace</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              placeholder="Name"
              maxLength={24}
              aria-label="New workspace name"
              className="h-9 min-w-0 flex-1 basis-32 rounded-lg border hairline bg-transparent px-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
            />
            <SelectField
              label="Icon for the new workspace"
              value={newIcon}
              options={ICON_OPTIONS}
              onChange={setNewIcon}
              className="w-36 shrink-0"
            />
            <PanelActionButton onClick={handleAdd} disabled={!newName.trim()} label="Add workspace">
              <Plus className="h-4 w-4" />
              Add
            </PanelActionButton>
          </div>
        </div>
      </SettingCard>

      <div className="mt-4" />
      <PanelSection>Defaults</PanelSection>
      <SettingCard>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">Reset all workspaces to defaults</p>
            <p className="mt-0.5 text-xs text-muted-c">
              Restores the four default dashboards — Focus, Study, Planning and Analytics.
            </p>
          </div>
          <PanelActionButton variant="danger" onClick={() => setResetOpen(true)} label="Reset all workspaces to defaults">
            Reset
          </PanelActionButton>
        </div>
      </SettingCard>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all workspaces?</AlertDialogTitle>
            <AlertDialogDescription>
              Every workspace and its widget layout will be replaced with the four defaults. Your tasks, notes and other
              data are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="press rounded-lg font-semibold"
              style={{ background: "color-mix(in srgb, var(--negative) 15%, transparent)", color: "var(--negative)" }}
              onClick={() => {
                resetToDefaults();
                setResetOpen(false);
                toast.success("Workspaces reset to defaults");
              }}
            >
              Reset workspaces
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ═══════════════════════════ TIMER ═══════════════════════════ */

function TimerSection() {
  const settings = useSettingsStore();
  const update = useSettingsStore((s) => s.update);
  const updateTimer = useSettingsStore((s) => s.updateTimer);
  const t = settings.timer;

  return (
    <>
      <PanelSection>Sessions</PanelSection>
      <SettingCard>
        <Stepper
          label="Focus length"
          value={t.focusMin}
          min={5}
          max={120}
          step={5}
          format={(v) => `${v} min`}
          onChange={(v) => updateTimer({ focusMin: v })}
        />
        <Stepper
          label="Short break"
          value={t.shortMin}
          min={1}
          max={60}
          step={1}
          format={(v) => `${v} min`}
          onChange={(v) => updateTimer({ shortMin: v })}
        />
        <Stepper
          label="Long break"
          value={t.longMin}
          min={5}
          max={60}
          step={5}
          format={(v) => `${v} min`}
          onChange={(v) => updateTimer({ longMin: v })}
        />
        <Stepper
          label="Cycles before long break"
          value={t.cycles}
          min={2}
          max={8}
          step={1}
          onChange={(v) => updateTimer({ cycles: v })}
        />
        <Stepper
          label="Daily focus goal"
          value={t.dailyGoalMin}
          min={0}
          max={600}
          step={15}
          format={(v) =>
            v === 0
              ? "Off"
              : v % 60 === 0
                ? `${v / 60}h`
                : v >= 60
                  ? `${Math.floor(v / 60)}h ${v % 60}m`
                  : `${v} min`
          }
          onChange={(v) => updateTimer({ dailyGoalMin: v })}
        />
      </SettingCard>

      <div className="mt-4" />
      <PanelSection>Flow</PanelSection>
      <SettingCard>
        <SwitchRow
          label="Auto-start breaks"
          checked={t.autoStartBreaks}
          onCheckedChange={(v) => updateTimer({ autoStartBreaks: v })}
        />
        <SwitchRow
          label="Auto-start focus"
          checked={t.autoStartFocus}
          onCheckedChange={(v) => updateTimer({ autoStartFocus: v })}
        />
        <SwitchRow
          label="Confirm before skipping"
          hint="Asks before skipping a running session"
          checked={t.confirmSkip}
          onCheckedChange={(v) => updateTimer({ confirmSkip: v })}
        />
      </SettingCard>

      <div className="mt-4" />
      <PanelSection>Defaults</PanelSection>
      <SettingCard>
        <SelectRow
          label="Timer mode"
          value={settings.defaultTimerMode}
          options={TIMER_MODES}
          onChange={(v) => update({ defaultTimerMode: v })}
        />
        <SelectRow
          label="Completion sound"
          value={t.completionSound}
          options={COMPLETION_SOUNDS}
          onChange={(v) => updateTimer({ completionSound: v })}
        />
      </SettingCard>
    </>
  );
}

/* ═══════════════════════════ NOTIFICATIONS ═══════════════════════════ */

function NotificationsSection() {
  const settings = useSettingsStore();
  const updateTimer = useSettingsStore((s) => s.updateTimer);
  const t = settings.timer;
  const [notifySupported] = useState(() => typeof window !== "undefined" && "Notification" in window);

  const testNotification = async () => {
    if (typeof Notification === "undefined") return;
    try {
      let perm: NotificationPermission = Notification.permission;
      if (perm !== "granted") perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error("Permission denied");
        return;
      }
      new Notification("Flowdeck", { body: "Notifications are working ✓" });
    } catch {
      toast.error("Permission denied");
    }
  };

  const testVibration = () => {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(120);
      toast.success("Vibration triggered");
    } else {
      toast.error("Vibration not supported on this device");
    }
  };

  return (
    <>
      <PanelSection>Notifications</PanelSection>
      <SettingCard>
        {notifySupported ? (
          <>
            <SwitchRow
              label="Session notifications"
              hint="Alerts when a focus or break session ends"
              checked={t.notify}
              onCheckedChange={(v) => updateTimer({ notify: v })}
            />
            <div className="mt-2">
              <PanelActionButton variant="ghost" onClick={() => void testNotification()} label="Send a test notification">
                <Bell className="h-4 w-4" />
                Test notification
              </PanelActionButton>
            </div>
          </>
        ) : (
          <p
            className="rounded-lg px-3 py-2.5 text-xs text-muted-c"
            style={{ background: "color-mix(in srgb, var(--text) 5%, transparent)" }}
          >
            Not supported in this browser.
          </p>
        )}
      </SettingCard>

      <div className="mt-4" />
      <PanelSection>Haptics</PanelSection>
      <SettingCard>
        <SwitchRow
          label="Vibrate on session end"
          hint="Where the device supports it"
          checked={t.vibrate}
          onCheckedChange={(v) => updateTimer({ vibrate: v })}
        />
        <div className="mt-2">
          <PanelActionButton variant="ghost" onClick={testVibration} label="Trigger a test vibration">
            <MonitorSmartphone className="h-4 w-4" />
            Test vibration
          </PanelActionButton>
        </div>
      </SettingCard>

      <div className="mt-4" />
      <PanelSection>Screen</PanelSection>
      <SettingCard>
        <SwitchRow
          label="Keep screen awake"
          hint="Screen stays on while the timer runs"
          checked={t.keepAwake}
          onCheckedChange={(v) => updateTimer({ keepAwake: v })}
        />
      </SettingCard>
    </>
  );
}

/* ═══════════════════════════ SOUNDS ═══════════════════════════ */

function SoundsSection() {
  const master = useSoundStore((s) => s.master);
  const setMaster = useSoundStore((s) => s.setMaster);
  const openPanel = useUIStore((s) => s.openPanel);

  return (
    <>
      <PanelSection>Volume</PanelSection>
      <SettingCard>
        <SliderRow
          label="Master volume"
          value={master}
          min={0}
          max={1}
          step={0.05}
          format={pct}
          onChange={(v) => {
            soundscape.ensureContext();
            setMaster(v);
          }}
        />
        <p className="mt-1 text-xs text-muted-c">Applies to every soundscape channel.</p>
      </SettingCard>

      <div className="mt-4" />
      <PanelSection>Mixer</PanelSection>
      <SettingCard>
        <p className="mb-3 text-sm leading-relaxed">
          Blend rain, thunder, forest, café, fireplace and noise colors — all synthesized live in your browser, nothing
          streamed.
        </p>
        <PanelActionButton onClick={() => openPanel("sound")} label="Open the soundscape mixer panel">
          <Volume2 className="h-4 w-4" />
          Open soundscape mixer
        </PanelActionButton>
      </SettingCard>
    </>
  );
}

/* ═══════════════════════════ SHORTCUTS ═══════════════════════════ */

function ShortcutsSection() {
  const bindings = useShortcutStore((s) => s.bindings);
  const rebind = useShortcutStore((s) => s.rebind);
  const resetAll = useShortcutStore((s) => s.resetAll);
  const [listening, setListening] = useState<string | null>(null);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setListening(null);
        return;
      }
      const binding = eventToBinding(e);
      if (!binding) return; // lone modifier / unmapped key — keep listening, don't swallow
      e.preventDefault();
      e.stopPropagation();
      const conflict = SHORTCUT_ACTIONS.find(
        (a) => a.id !== listening && (bindings[a.id] ?? a.def) === binding
      );
      if (conflict) {
        toast.error(`“${prettyBinding(binding)}” is already used by ${conflict.label}`);
        return;
      }
      const label = SHORTCUT_ACTIONS.find((a) => a.id === listening)?.label ?? "Shortcut";
      rebind(listening, binding);
      setListening(null);
      toast.success(`${label} → ${prettyBinding(binding)}`);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, bindings, rebind]);

  return (
    <>
      <PanelSection
        action={
          <PanelActionButton
            variant="ghost"
            onClick={() => {
              resetAll();
              setListening(null);
              toast.success("Shortcuts reset to defaults");
            }}
            label="Reset all keyboard shortcuts"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Reset all</span>
            <span className="sm:hidden">Reset</span>
          </PanelActionButton>
        }
      >
        Keyboard shortcuts
      </PanelSection>
      <SettingCard>
        <div className="space-y-1">
          {SHORTCUT_ACTIONS.map((a) => {
            const binding = bindings[a.id] ?? a.def;
            const isListening = listening === a.id;
            return (
              <div
                key={a.id}
                className="rounded-lg px-2.5 py-2.5"
                style={
                  isListening
                    ? {
                        background: "color-mix(in srgb, var(--accent) 7%, transparent)",
                        borderLeft: "3px solid var(--accent)",
                      }
                    : undefined
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="text-sm font-medium">{a.label}</p>
                    <p className="mt-0.5 text-xs text-muted-c">{a.description}</p>
                  </div>
                  {isListening ? (
                    <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--accent)" }}>
                      <span
                        className="fd-pulse h-1.5 w-1.5 rounded-full"
                        style={{ background: "var(--accent)" }}
                        aria-hidden="true"
                      />
                      Press keys… <span className="font-normal text-muted-c">(Esc cancels)</span>
                    </span>
                  ) : (
                    <Kbd>{prettyBinding(binding)}</Kbd>
                  )}
                  <button
                    type="button"
                    onClick={() => setListening(isListening ? null : a.id)}
                    aria-pressed={isListening}
                    className="press h-8 shrink-0 rounded-lg px-3 text-xs font-semibold transition-colors"
                    style={{
                      background: isListening
                        ? "color-mix(in srgb, var(--text) 8%, transparent)"
                        : "color-mix(in srgb, var(--text) 8%, transparent)",
                      color: isListening ? "var(--text)" : undefined,
                    }}
                  >
                    {isListening ? "Cancel" : "Rebind"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-c">
          Single keys and combos (Ctrl/Alt/Shift + key) work anywhere outside text inputs. On Mac, ⌘ replaces Ctrl.
        </p>
      </SettingCard>
    </>
  );
}

/* ═══════════════════════════ DATA ═══════════════════════════ */

function DataSection() {
  const [report, setReport] = useState<{ key: string; bytes: number }[] | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [eraseText, setEraseText] = useState("");
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    storageReport([...STORE_KEYS])
      .then((r) => {
        if (alive) setReport(r);
      })
      .catch(() => {
        if (alive) setReport([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleExport = async () => {
    setBusy(true);
    try {
      const values = new Map<string, unknown>();
      for (const key of STORE_KEYS) {
        const raw = LS_KEYS.includes(key)
          ? localStorage.getItem(key)
          : await idbStorage.getItem(key);
        const parsed = safeJsonParse(raw);
        if (parsed !== undefined) values.set(key, parsed);
      }
      const backup = await exportBackup((key) => values.get(key));
      downloadBackup(backup);
      toast.success("Backup downloaded");
    } catch {
      toast.error("Could not create the backup");
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      const result = parseBackup(raw);
      if (!result.ok) {
        toast.error(result.error ?? "Invalid backup file");
        return;
      }
      setImportResult(result);
    };
    reader.onerror = () => toast.error("Could not read that file");
    reader.readAsText(file);
  };

  const applyImport = async () => {
    const backup = importResult?.backup;
    if (!backup) return;
    try {
      for (const [key, value] of Object.entries(backup.data)) {
        if (!(STORE_KEYS as readonly string[]).includes(key)) continue;
        const raw = JSON.stringify(value);
        if (LS_KEYS.includes(key)) localStorage.setItem(key, raw);
        else await idbStorage.setItem(key, raw);
      }
      toast.success("Restoring — reloading…");
      setTimeout(() => window.location.reload(), 800);
    } catch {
      toast.error("Restoring the backup failed — storage may be full");
    }
  };

  const handleErase = async () => {
    try {
      await wipeAllStorage([...STORE_KEYS]);
    } catch {
      /* ignore — reload anyway */
    }
    window.location.reload();
  };

  const rows = (report ?? []).filter((r) => r.bytes > 0);
  const total = (report ?? []).reduce((sum, r) => sum + r.bytes, 0);

  return (
    <>
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImportFile(f);
          e.target.value = "";
        }}
        aria-label="Import backup file"
      />

      <PanelSection>Storage</PanelSection>
      <SettingCard>
        {report === null ? (
          <p className="text-xs text-muted-c">Measuring…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-c">Nothing stored yet — your data will appear here as you use Flowdeck.</p>
        ) : (
          <div className="divide-y hairline">
            {rows.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-3 py-1.5 first:pt-0">
                <span className="min-w-0 truncate text-xs">{STORE_LABELS[r.key] ?? r.key}</span>
                <span className="tnum shrink-0 text-xs text-muted-c">{fmtBytes(r.bytes)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 pt-2.5">
              <span className="text-xs font-semibold">Total</span>
              <span className="tnum text-xs font-semibold">{fmtBytes(total)}</span>
            </div>
          </div>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted-c">
          Small hot state lives in localStorage; structured data lives in IndexedDB — both on this device only.
        </p>
      </SettingCard>

      <div className="mt-4" />
      <PanelSection>Backup</PanelSection>
      <SettingCard>
        <p className="mb-3 text-sm leading-relaxed">
          Export everything as a single JSON file, or restore from one. Perfect for moving between browsers or devices.
        </p>
        <div className="flex flex-wrap gap-2">
          <PanelActionButton onClick={() => void handleExport()} disabled={busy} label="Export a full backup">
            <Download className="h-4 w-4" />
            {busy ? "Exporting…" : "Export backup"}
          </PanelActionButton>
          <PanelActionButton variant="ghost" onClick={() => importRef.current?.click()} label="Import a backup file">
            <Upload className="h-4 w-4" />
            Import backup
          </PanelActionButton>
        </div>
      </SettingCard>

      <div className="mt-4" />
      <PanelSection>Danger zone</PanelSection>
      <SettingCard>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">Erase everything</p>
            <p className="mt-0.5 text-xs text-muted-c">
              Deletes every task, note, habit, goal, session, workspace, theme and setting on this device.
            </p>
          </div>
          <PanelActionButton variant="danger" onClick={() => setEraseOpen(true)} label="Erase all Flowdeck data">
            <Trash2 className="h-4 w-4" />
            Erase
          </PanelActionButton>
        </div>
      </SettingCard>

      {/* Import summary / confirm */}
      <AlertDialog open={importResult !== null} onOpenChange={(o) => !o && setImportResult(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Restore backup?</AlertDialogTitle>
            <AlertDialogDescription>
              {importResult?.backup?.exportedAt
                ? `Exported ${new Date(importResult.backup.exportedAt).toLocaleString()} · ${importResult.keys?.length ?? 0} data stores found.`
                : `${importResult?.keys?.length ?? 0} data stores found.`}{" "}
              Replacing data will overwrite everything currently in Flowdeck on this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {(importResult?.keys ?? []).map((k) => (
              <span
                key={k}
                className="rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-c"
                style={{ background: "color-mix(in srgb, var(--text) 7%, transparent)" }}
              >
                {STORE_LABELS[k] ?? k}
              </span>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="press rounded-lg font-semibold"
              style={{ background: "color-mix(in srgb, var(--negative) 15%, transparent)", color: "var(--negative)" }}
              onClick={() => void applyImport()}
            >
              Restore data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Erase confirm — requires typing ERASE */}
      <AlertDialog
        open={eraseOpen}
        onOpenChange={(o) => {
          setEraseOpen(o);
          if (!o) setEraseText("");
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Erase everything?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently wipes all Flowdeck data from this browser — including tasks, notes, habits, goals,
              sessions, workspaces, custom themes and settings. There is no undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            value={eraseText}
            onChange={(e) => setEraseText(e.target.value)}
            placeholder="Type ERASE to confirm"
            autoComplete="off"
            spellCheck={false}
            aria-label="Type ERASE to confirm"
            className="h-9 w-full rounded-lg border hairline bg-transparent px-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="press rounded-lg font-semibold"
              style={{ background: "color-mix(in srgb, var(--negative) 15%, transparent)", color: "var(--negative)" }}
              disabled={eraseText !== "ERASE"}
              onClick={() => void handleErase()}
            >
              Erase everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ═══════════════════════════ PRIVACY ═══════════════════════════ */

function PrivacySection() {
  const CARDS: { icon: LucideIcon; title: string; body: string }[] = [
    {
      icon: ShieldCheck,
      title: "Local-first by design",
      body: "Tasks, notes, sessions and settings live in your browser’s localStorage/IndexedDB. Nothing is sent to any server.",
    },
    {
      icon: EyeOff,
      title: "No accounts, no telemetry",
      body: "Flowdeck has no analytics, tracking or sign-in. Ever.",
    },
    {
      icon: AudioLines,
      title: "Sounds are synthesized",
      body: "Every ambient sound is generated live in your browser; no downloads or streams.",
    },
  ];
  return (
    <>
      <PanelSection>Privacy</PanelSection>
      <div className="space-y-3">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <SettingCard key={c.title}>
              <div className="flex items-start gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)" }}
                  aria-hidden="true"
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{c.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-c">{c.body}</p>
                </div>
              </div>
            </SettingCard>
          );
        })}
      </div>
    </>
  );
}

/* ═══════════════════════════ PWA ═══════════════════════════ */

function PwaSection() {
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(display-mode: standalone)");
    const update = () => setStandalone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const install = () => {
    /* the app shell listens for this and shows its own install prompt */
    window.dispatchEvent(new CustomEvent("flowdeck:install"));
  };

  return (
    <>
      <PanelSection>Install status</PanelSection>
      <SettingCard>
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{
              background: standalone
                ? "color-mix(in srgb, var(--positive) 14%, transparent)"
                : "color-mix(in srgb, var(--text) 6%, transparent)",
              color: standalone ? "var(--positive)" : "var(--text-muted)",
            }}
            aria-hidden="true"
          >
            {standalone ? <CheckCircle2 className="h-4 w-4" /> : <MonitorSmartphone className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">{standalone ? "Installed ✓ running as an app" : "Running in the browser"}</p>
            <p className="mt-0.5 text-xs text-muted-c">
              {standalone
                ? "Flowdeck is running standalone — fullscreen and offline-capable."
                : "Install Flowdeck for a fullscreen, app-like experience."}
            </p>
          </div>
        </div>
        {!standalone && (
          <div className="mt-3">
            <PanelActionButton onClick={install} label="Install Flowdeck">
              <Download className="h-4 w-4" />
              Install Flowdeck
            </PanelActionButton>
            <p className="mt-2 text-xs leading-relaxed text-muted-c">
              If nothing happens, use your browser menu → Install app / Add to Home screen.
            </p>
          </div>
        )}
      </SettingCard>
    </>
  );
}

/* ═══════════════════════════ ACCESSIBILITY ═══════════════════════════ */

function AccessibilitySection() {
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const update = useSettingsStore((s) => s.update);

  const NOTES = [
    "Keyboard shortcuts everywhere",
    "Visible focus rings",
    "Screen-reader labels on all controls",
    "Respects prefers-reduced-motion",
  ];

  return (
    <>
      <PanelSection>Motion</PanelSection>
      <SettingCard>
        <SwitchRow
          label="Reduced motion"
          hint="Also respects your OS setting automatically"
          checked={reducedMotion}
          onCheckedChange={(v) => update({ reducedMotion: v })}
        />
      </SettingCard>

      <div className="mt-4" />
      <PanelSection>Built in</PanelSection>
      <SettingCard>
        <ul className="space-y-2">
          {NOTES.map((n) => (
            <li key={n} className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 shrink-0" style={{ color: "var(--positive)" }} aria-hidden="true" />
              {n}
            </li>
          ))}
        </ul>
      </SettingCard>

      <div className="mt-4" />
      <PanelSection>Focus rings</PanelSection>
      <SettingCard>
        <p className="text-sm leading-relaxed">
          Every interactive control shows a visible accent ring when reached with the keyboard.
        </p>
        <button
          type="button"
          className="press mt-3 rounded-lg px-3.5 py-2 text-sm font-semibold"
          style={{ background: "color-mix(in srgb, var(--text) 8%, transparent)" }}
        >
          Tab to this button to see the ring
        </button>
        <p className="mt-2 text-xs text-muted-c">Pointer taps stay clean — only keyboard focus shows the ring.</p>
      </SettingCard>
    </>
  );
}

/* ═══════════════════════════ ABOUT ═══════════════════════════ */

function AboutSection() {
  return (
    <>
      <PanelSection>About</PanelSection>
      <SettingCard>
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }}
            aria-hidden="true"
          >
            <Sparkles className="h-5 w-5" style={{ color: "var(--accent)" }} />
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold">
              Flowdeck <span className="font-normal text-muted-c">v1.0</span>
            </p>
            <p className="text-xs text-muted-c">A local-first personal productivity OS.</p>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed">
          Focus timer · tasks · habits · goals · notes · JEE study tracking · analytics · themes · ambient sound.
        </p>
        <p className="mt-1.5 text-xs text-muted-c">Built with Next.js, runs entirely on your device.</p>
      </SettingCard>
    </>
  );
}

/* ═══════════════════════════ PANEL ═══════════════════════════ */

export function SettingsPanel() {
  const [section, setSection] = useState<SectionId>("appearance");

  return (
    <PanelShell
      title="Settings"
      subtitle="Changes save instantly — on this device only"
      icon={<Settings2 className="h-4 w-4" />}
    >
      {/* mobile: horizontal section pills */}
      <div className="fade-r no-scrollbar mb-4 flex gap-1 overflow-x-auto pb-1 md:hidden" role="tablist" aria-label="Settings sections">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = section === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSection(s.id)}
              className={cn(
                "press flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                active ? "text-[var(--accent-fg)]" : "text-muted-c hover:text-[var(--text)]"
              )}
              style={active ? { background: "var(--accent)" } : { background: "color-mix(in srgb, var(--text) 7%, transparent)" }}
            >
              <Icon className="h-3.5 w-3.5" />
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-5">
        {/* desktop: sticky sidebar */}
        <nav className="widget sticky top-0 hidden h-fit w-44 shrink-0 space-y-0.5 p-2 md:block" aria-label="Settings sections">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "press flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                  active ? "font-semibold" : "text-muted-c hover:text-[var(--text)]"
                )}
                style={
                  active
                    ? { background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)" }
                    : undefined
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{s.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1">
          {section === "appearance" && <AppearanceSection />}
          {section === "dashboard" && <DashboardSection />}
          {section === "timer" && <TimerSection />}
          {section === "notifications" && <NotificationsSection />}
          {section === "sounds" && <SoundsSection />}
          {section === "shortcuts" && <ShortcutsSection />}
          {section === "data" && <DataSection />}
          {section === "privacy" && <PrivacySection />}
          {section === "pwa" && <PwaSection />}
          {section === "accessibility" && <AccessibilitySection />}
          {section === "about" && <AboutSection />}
        </div>
      </div>
    </PanelShell>
  );
}
