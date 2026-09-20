import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO, startOfWeek, addDays, differenceInCalendarDays } from "date-fns";

/** shadcn class merge helper (required by all ui components). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ---------- IDs ---------- */

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ---------- Dates ---------- */

/** Local YYYY-MM-DD key for today. */
export function todayKey(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function dateKey(d: Date | number): string {
  return format(typeof d === "number" ? new Date(d) : d, "yyyy-MM-dd");
}

export function parseDateKey(key: string): Date {
  return parseISO(key);
}

export function isSameOrBeforeToday(key: string): boolean {
  return differenceInCalendarDays(parseISO(key), new Date()) <= 0;
}

export function daysAgoKey(n: number): string {
  return dateKey(addDays(new Date(), -n));
}

/** Start of week respecting weekStart (0=Sun, 1=Mon). */
export function weekStart(weekStartsOn: 0 | 1): Date {
  return startOfWeek(new Date(), { weekStartsOn });
}

export function humanDate(key: string): string {
  const d = parseISO(key);
  const diff = differenceInCalendarDays(d, new Date());
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return format(d, "EEE d MMM");
}

export function fmtDuration(ms: number, opts?: { compact?: boolean; hours?: boolean }): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const showHours = opts?.hours || h > 0;
  if (showHours) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export function fmtMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

/* ---------- Links ---------- */

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/* ---------- misc ---------- */

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function groupBy<T, K extends string | number>(arr: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of arr) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
