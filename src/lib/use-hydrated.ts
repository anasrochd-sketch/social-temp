import { useSyncExternalStore } from "react";

/**
 * True once the component has mounted on the client. False during SSR and the
 * first client render, so render-dependent browser values (localStorage, dates,
 * random ids) can be deferred until after hydration without a mismatch.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
