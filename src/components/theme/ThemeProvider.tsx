"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  THEME_STORAGE_KEY,
  nextTheme,
  readStoredTheme,
  resolveTheme,
  type EffectiveTheme,
  type Theme,
} from "./resolve-theme";

// Phase 5.5 — Theme state + effect wiring. The no-flash script in <head>
// runs before React hydrates, so first paint is already correct; this
// provider just owns state + listens for system-preference changes +
// persists the user's explicit choice.

type ThemeContextValue = {
  theme: Theme;
  effective: EffectiveTheme;
  setTheme: (t: Theme) => void;
  cycle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function subscribeSystemDark(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSystemDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Lazy init — runs once on first render. On the client, reads stored
  // preference; on the server, returns "system" (no-flash script already
  // applied the correct class to <html> before hydration).
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof window === "undefined"
      ? "system"
      : readStoredTheme(window.localStorage),
  );

  // Subscribe to system prefers-color-scheme via the React-native primitive
  // for external event sources — avoids the setState-in-effect anti-pattern.
  const systemDark = useSyncExternalStore(
    subscribeSystemDark,
    getSystemDark,
    () => false, // SSR fallback; no-flash script patches first paint anyway
  );

  const effective: EffectiveTheme = resolveTheme(theme, systemDark);

  // Apply class to <html> whenever the effective theme changes.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (effective === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [effective]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, t);
      } catch {
        /* ignore storage denial */
      }
    }
  }, []);

  const cycle = useCallback(() => {
    setTheme(nextTheme(theme));
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme, effective, setTheme, cycle }),
    [theme, effective, setTheme, cycle],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const v = useContext(ThemeContext);
  if (!v) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return v;
}
