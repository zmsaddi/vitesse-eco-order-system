// Phase 5.5 — inline script injected in <head> before hydration.
// Reads the stored theme preference (or system media query) and toggles
// `<html class="dark">` so the first paint matches the resolved theme.
// Must be a plain string (no imports): Next.js serializes it into the
// HTML document as a `<script dangerouslySetInnerHTML>`.
//
// Self-contained; references only `window`, `document`, `localStorage`,
// `matchMedia`. Wrapped in try/catch so a storage access failure can't
// break first paint.

export const NO_FLASH_SCRIPT = `
(function () {
  try {
    var key = "vitesse-theme";
    var stored = null;
    try { stored = window.localStorage.getItem(key); } catch (e) {}
    var effective;
    if (stored === "dark" || stored === "light") {
      effective = stored;
    } else {
      var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      effective = prefersDark ? "dark" : "light";
    }
    if (effective === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  } catch (e) { /* noop */ }
})();
`;
