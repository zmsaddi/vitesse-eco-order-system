// Phase 5.5 — pure theme resolution helpers. No React, no DOM types
// except the narrow `matchMedia` + `localStorage` fingerprints. Unit-testable.

export type Theme = "system" | "light" | "dark";
export type EffectiveTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "vitesse-theme";
const VALID: readonly Theme[] = ["system", "light", "dark"];

/** Read the stored user preference; invalid values fall through to "system". */
export function readStoredTheme(
  storage: Pick<Storage, "getItem"> | null | undefined,
): Theme {
  if (!storage) return "system";
  try {
    const raw = storage.getItem(THEME_STORAGE_KEY);
    if (raw && (VALID as readonly string[]).includes(raw)) {
      return raw as Theme;
    }
  } catch {
    // Access may throw in privacy/sandbox modes; fall through.
  }
  return "system";
}

/** Resolve to either "light" or "dark" using the chosen theme + media match. */
export function resolveTheme(
  chosen: Theme,
  systemDark: boolean,
): EffectiveTheme {
  if (chosen === "dark") return "dark";
  if (chosen === "light") return "light";
  return systemDark ? "dark" : "light";
}

/** Cycle: system → light → dark → system. */
export function nextTheme(current: Theme): Theme {
  if (current === "system") return "light";
  if (current === "light") return "dark";
  return "system";
}
