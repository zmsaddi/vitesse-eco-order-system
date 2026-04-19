import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-gray-900 text-white hover:bg-gray-800 focus-visible:ring-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 dark:focus-visible:ring-gray-300",
  secondary:
    "border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 focus-visible:ring-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800",
  danger:
    "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600 dark:bg-red-700 dark:hover:bg-red-800",
  ghost:
    "text-gray-700 hover:bg-gray-100 focus-visible:ring-gray-500 dark:text-gray-300 dark:hover:bg-gray-800",
};

/**
 * Reusable button with 4 variants. Forwards all HTML button props.
 * Tailwind-only; no JS; keyboard + a11y ready (focus-visible ring).
 */
export function Button({ variant = "primary", className = "", children, ...rest }: ButtonProps) {
  return (
    <button
      className={
        "inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-semibold transition " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 " +
        VARIANT_CLASSES[variant] +
        (className ? " " + className : "")
      }
      {...rest}
    >
      {children}
    </button>
  );
}
