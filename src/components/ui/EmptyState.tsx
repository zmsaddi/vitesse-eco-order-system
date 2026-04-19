import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Tailwind color class for the icon dot (default: gray). */
  tone?: "neutral" | "warning" | "info";
};

/**
 * Per 38_Accessibility_UX_Conventions.md §Empty States Matrix.
 * Honest, role-appropriate empty state with single optional CTA.
 */
export function EmptyState({ title, description, action, tone = "neutral" }: EmptyStateProps) {
  const toneClass = {
    neutral: "bg-gray-100 dark:bg-gray-800",
    warning: "bg-amber-100 dark:bg-amber-900/40",
    info: "bg-sky-100 dark:bg-sky-900/40",
  }[tone];

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center dark:border-gray-700"
    >
      <div className={`h-10 w-10 rounded-full ${toneClass}`} aria-hidden />
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
