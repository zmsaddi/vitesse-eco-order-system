import type { ReactNode } from "react";

type FormCardProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
};

/**
 * Card wrapper for forms — matches the 25_Dashboard_Requirements/19_Forms_Fields style.
 * Used for create/edit dialogs + embedded settings forms.
 */
export function FormCard({ title, description, children, footer }: FormCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      {(title || description) && (
        <header className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
          )}
        </header>
      )}
      <div className="space-y-4 px-5 py-5">{children}</div>
      {footer && (
        <footer className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-800">
          {footer}
        </footer>
      )}
    </div>
  );
}

// Field wrapper — pairs label + control + inline error + hint.
type FieldProps = {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
};

export function Field({ label, htmlFor, error, hint, required, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
        {label}
        {required && (
          <span className="ms-1 text-red-600" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
