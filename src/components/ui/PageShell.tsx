import type { ReactNode } from "react";

type PageShellProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

/**
 * Standard page wrapper — title + optional subtitle + right-aligned actions (e.g. "+ New").
 * Respects RTL: title on visual right, actions on visual left (flex row default with dir=rtl).
 */
export function PageShell({ title, subtitle, actions, children }: PageShellProps) {
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div>{children}</div>
    </div>
  );
}
