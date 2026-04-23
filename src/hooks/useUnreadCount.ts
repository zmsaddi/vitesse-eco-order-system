"use client";

import { create } from "zustand";
import { useEffect } from "react";

// Phase 5.1b — global unread-count store backed by the X-Unread-Count header.
//
// Contract (per 26_Notifications.md §"Polling strategy" + D-42):
//   - Badge must show a correct count on first render, not after first click.
//     → layout.tsx fetches countUnread(db, userId) server-side and passes it
//       down as the initial value. `useHydrateUnreadCount(initial)` seeds the
//       store exactly once per mount.
//   - Every subsequent API response carries X-Unread-Count. A one-time global
//     fetch wrapper reads the header and pushes fresh values into the store,
//     so there is no polling for the badge itself.
//   - The store is authoritative for the badge; components subscribe via
//     `useUnreadCount()`.
//
// The wrapper installs itself once on first mount and is a no-op afterwards.
// It merges with any existing window.fetch (e.g., tanstack-query uses fetch
// under the hood), so query responses also feed the store.

type UnreadState = {
  count: number;
  hydrated: boolean;
  setCount: (n: number) => void;
};

export const useUnreadStore = create<UnreadState>((set) => ({
  count: 0,
  hydrated: false,
  setCount: (n) => set({ count: Math.max(0, Math.trunc(n)), hydrated: true }),
}));

export function useUnreadCount(): number {
  return useUnreadStore((s) => s.count);
}

/** Seed the store once with the SSR-provided initial count. */
export function useHydrateUnreadCount(initial: number): void {
  useEffect(() => {
    const { hydrated, setCount } = useUnreadStore.getState();
    if (!hydrated) setCount(initial);
  }, [initial]);
}

let fetchInterceptorInstalled = false;

/** Install the global fetch wrapper once per client runtime. */
export function useInstallFetchInterceptor(): void {
  useEffect(() => {
    if (fetchInterceptorInstalled) return;
    if (typeof window === "undefined") return;
    fetchInterceptorInstalled = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      try {
        const header = res.headers.get("x-unread-count");
        if (header !== null) {
          const n = Number(header);
          if (Number.isFinite(n)) useUnreadStore.getState().setCount(n);
        }
      } catch {
        // Header parsing never breaks the request path.
      }
      return res;
    };
  }, []);
}
