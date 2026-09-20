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
