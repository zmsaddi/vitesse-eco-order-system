import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// UX hotfix pack — Tranche 1 shell contract guard.
//
// All assertions are pure filesystem reads + regex/substring checks. NO
// browser, NO DB, NO route invocation. Goal: catch any future PR that
// re-introduces the left-rail trick, the dead breadcrumb placeholder, the
// missing PageShell container, or breaks the canonical Topbar action
// order. This file rides Gate 10 (test:regression).

function read(rel: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("UX hotfix pack — Tranche 1 shell contract", () => {
  it("T-UX-SHELL-01: AppLayout does not use the flex-row-reverse left-rail trick", () => {
    const c = read("src/components/layout/AppLayout.tsx");
    // Match the class only inside a className="...". Comments referencing
    // the historical name (e.g. "dropped the prior flex-row-reverse trick")
    // are intentionally permitted — the regression target is the JSX.
    const classNameMatches = [...c.matchAll(/className="([^"]*)"/g)].flatMap((m) =>
      m[1].split(/\s+/),
    );
    expect(
      classNameMatches,
      "AppLayout JSX must not apply `flex-row-reverse` — under <html dir=rtl> it double-reverses and pushes the sidebar to the visual LEFT",
    ).not.toContain("flex-row-reverse");
  });

  it("T-UX-SHELL-02: AppLayout retains the canonical h-screen + flex shell", () => {
    const c = read("src/components/layout/AppLayout.tsx");
    expect(c).toMatch(/h-screen/);
    // Allow either bare `flex` or any other Tailwind flex utility, but the
    // shell wrapper MUST establish a flex container.
    expect(c).toMatch(/className="[^"]*\bflex\b[^"]*"/);
  });

  it("T-UX-SHELL-03: Topbar removed the dead breadcrumb placeholder div", () => {
    const c = read("src/components/layout/Topbar.tsx");
    // Match the legacy placeholder pattern in JSX form (a comment-only div
    // with the breadcrumbs marker). Header-comments mentioning history are
    // permitted; the regression target is the live JSX placeholder.
    expect(
      c,
      "Topbar must not contain a comment-only breadcrumbs div placeholder",
    ).not.toMatch(/<div[^>]*>\s*\{?\s*\/\*\s*breadcrumbs/i);
  });

  it("T-UX-SHELL-04: Topbar carries the four canonical actions in source order inside JSX", () => {
    const c = read("src/components/layout/Topbar.tsx");
    // Anchor the search to the JSX body — start at <header so imports +
    // header comments cannot poison the index ordering.
    const headerStart = c.indexOf("<header");
    expect(headerStart, "Topbar must contain a <header> JSX root").toBeGreaterThan(-1);
    const jsx = c.substring(headerStart);
    const idxWelcome = jsx.indexOf("أهلاً");
    const idxBell = jsx.indexOf("BellDropdown");
    const idxTheme = jsx.indexOf("ThemeToggle");
    const idxSignOut = jsx.indexOf("تسجيل الخروج");
    expect(idxWelcome, "welcome (أهلاً) must be present in JSX").toBeGreaterThan(-1);
    expect(idxBell, "BellDropdown must be present in JSX").toBeGreaterThan(-1);
    expect(idxTheme, "ThemeToggle must be present in JSX").toBeGreaterThan(-1);
    expect(idxSignOut, "sign-out (تسجيل الخروج) must be present in JSX").toBeGreaterThan(-1);
    // Source order in JSX: welcome → bell → theme → sign-out. Under RTL
    // flex this renders right-to-left, putting the welcome at the visual
    // right edge (Arabic reading start) and sign-out at the visual far-end.
    expect(idxWelcome).toBeLessThan(idxBell);
    expect(idxBell).toBeLessThan(idxTheme);
    expect(idxTheme).toBeLessThan(idxSignOut);
  });

  it("T-UX-SHELL-05: Sidebar retains border-l (RTL inner-edge separator) + canonical w-64 width", () => {
    const c = read("src/components/layout/Sidebar.tsx");
    expect(c).toMatch(/border-l/);
    expect(c).toMatch(/\bw-64\b/);
  });

  it("T-UX-SHELL-06: PageShell carries the data-page-shell structural marker", () => {
    const c = read("src/components/ui/PageShell.tsx");
    expect(
      c,
      "data-page-shell is the contract anchor that downstream guards key off",
    ).toMatch(/data-page-shell/);
  });

  it("T-UX-SHELL-07: PageShell enforces a centered max-width container", () => {
    const c = read("src/components/ui/PageShell.tsx");
    expect(c, "PageShell must constrain content to a max-width 7xl container").toMatch(/max-w-7xl/);
    expect(c, "PageShell must center the container with mx-auto").toMatch(/mx-auto/);
  });

  it("T-UX-SHELL-08: globals.css enforces html { direction: rtl }", () => {
    const c = read("src/app/globals.css");
    expect(c).toMatch(/html\s*\{[\s\S]*?direction:\s*rtl/);
  });
});
