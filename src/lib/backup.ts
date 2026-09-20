/* ============================================================
 * Backup / export / import with versioned schema validation.
 * All imported data is treated as UNTRUSTED: every field is
 * validated and coerced before touching app state.
 * ============================================================ */

export const BACKUP_VERSION = 1;

export interface Backup {
  app: "flowdeck";
  version: number;
  exportedAt: string;
  data: Record<string, unknown>;
}

const STORE_KEYS = [
  "flowdeck-settings",
  "flowdeck-timer",
  "flowdeck-workspaces",
  "flowdeck-shortcuts",
  "flowdeck-appearance",
  "flowdeck-tasks",
  "flowdeck-habits",
  "flowdeck-goals",
  "flowdeck-notes",
  "flowdeck-sessions",
  "flowdeck-study",
  "flowdeck-sound",
] as const;

export async function exportBackup(collect: (key: string) => unknown): Promise<Backup> {
  const data: Record<string, unknown> = {};
  for (const key of STORE_KEYS) {
    const value = collect(key);
    if (value !== undefined && value !== null) data[key] = value;
  }
  return {
    app: "flowdeck",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  keys?: string[];
  backup?: Backup;
}

/** Parse + validate a backup file string. Never throws. */
export function parseBackup(raw: string): ImportResult {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return { ok: false, error: "File is not a valid JSON object." };
    }
    const obj = parsed as Record<string, unknown>;
    if (obj.app !== "flowdeck") {
      return { ok: false, error: "This file was not exported from Flowdeck." };
    }
    if (typeof obj.version !== "number" || obj.version > BACKUP_VERSION) {
      return { ok: false, error: `Unsupported backup version: ${String(obj.version)}. This app supports up to v${BACKUP_VERSION}.` };
    }
    if (typeof obj.data !== "object" || obj.data === null || Array.isArray(obj.data)) {
      return { ok: false, error: "Backup is missing its data section." };
    }
    /* sanity: at least one known key with plausible shape */
    const keys = Object.keys(obj.data).filter((k) => (STORE_KEYS as readonly string[]).includes(k));
    if (keys.length === 0) {
      return { ok: false, error: "Backup contains no recognizable Flowdeck data." };
    }
    /* deep size guard: reject files over ~30MB to avoid freezing */
    if (raw.length > 32 * 1024 * 1024) {
      return { ok: false, error: "Backup file is too large (>32MB)." };
    }
    return { ok: true, keys, backup: obj as unknown as Backup };
  } catch (err) {
    return { ok: false, error: `Could not parse file: ${err instanceof Error ? err.message : "invalid JSON"}` };
  }
}

/** Extract a string binding safely from unknown data. */
export function safeString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export function safeNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function safeBool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

export function safeArray<T>(v: unknown, validate: (item: unknown) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  return v.map(validate).filter((x): x is T => x !== null);
}

/** Trigger a browser download of a JSON backup. */
export function downloadBackup(backup: Backup): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flowdeck-backup-${backup.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export { STORE_KEYS };
