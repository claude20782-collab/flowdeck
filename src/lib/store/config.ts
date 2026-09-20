import { createJSONStorage, type PersistOptions } from "zustand/middleware";
import { idbStorage } from "./persist";

/* Shared persist config builders with hydration tracking.
 * Functions are dropped by JSON serialization automatically;
 * `hydrated` round-trips harmlessly (true after rehydration). */

interface HydratableState {
  _setHydrated?: () => void;
}

function rehydrateHook<S>() {
  return (state?: S) => {
    (state as HydratableState | undefined)?._setHydrated?.();
  };
}

type ExtraPersistOptions<S> = Partial<Omit<PersistOptions<S>, "name" | "version" | "storage">>;

export function idbPersistConfig<S extends object>(
  name: string,
  extra?: ExtraPersistOptions<S>,
  version = 1
): PersistOptions<S> {
  return {
    name,
    version,
    storage: createJSONStorage<S>(() => idbStorage),
    onRehydrateStorage: () => rehydrateHook<S>(),
    ...extra,
  };
}

export function lsPersistConfig<S extends object>(
  name: string,
  extra?: ExtraPersistOptions<S>,
  version = 1
): PersistOptions<S> {
  return {
    name,
    version,
    storage: createJSONStorage<S>(() => localStorage),
    onRehydrateStorage: () => rehydrateHook<S>(),
    ...extra,
  };
}

/** Deep merge that unions persisted state onto defaults — nested objects
 *  (e.g. `timer` settings) keep new default keys added after the persisted
 *  snapshot was written, instead of being wholesale-replaced. */
export function deepMergePersisted<S extends object>(persisted: unknown, current: S): S {
  if (typeof persisted !== "object" || persisted === null) return current;
  const out: Record<string, unknown> = { ...(current as Record<string, unknown>) };
  for (const [k, v] of Object.entries(persisted as Record<string, unknown>)) {
    const cur = out[k];
    if (v !== null && typeof v === "object" && !Array.isArray(v) && cur !== null && typeof cur === "object" && !Array.isArray(cur)) {
      out[k] = deepMergePersisted(v, cur as Record<string, unknown>);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as S;
}
