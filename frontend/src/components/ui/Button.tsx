/**
 * Unified Button Component — Google-style Light Theme
 *
 * Variants:
 *   primary   – Indigo filled  (main CTA)
 *   secondary – White outlined  (secondary action)
 *   ghost     – Transparent     (tertiary / icon-only)
 *   danger    – Rose filled     (destructive)
 *   success   – Emerald filled  (confirm / run)
 *
 * Sizes:  xs | sm | md (default) | lg
 */

import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  full?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-indigo-600 text-white border border-indigo-600 hover:bg-indigo-700 hover:border-indigo-700 active:bg-indigo-800 shadow-sm",
  secondary:
    "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 shadow-sm",
  ghost:
    "bg-transparent text-slate-600 border border-transparent hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200",
  danger:
    "bg-rose-600 text-white border border-rose-600 hover:bg-rose-700 hover:border-rose-700 active:bg-rose-800 shadow-sm",
  success:
    "bg-emerald-600 text-white border border-emerald-600 hover:bg-emerald-700 hover:border-emerald-700 active:bg-emerald-800 shadow-sm",
};

const sizeClasses: Record<Size, string> = {
  xs: "h-7 px-3 text-xs gap-1.5 rounded-md",
  sm: "h-8 px-3.5 text-xs gap-2 rounded-lg",
  md: "h-9 px-4 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-sm gap-2.5 rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  loading = false,
  full = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        // Base
        "inline-flex items-center justify-center font-semibold tracking-tight select-none",
        "transition-all duration-150 cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
        "disabled:opacity-50 disabled:pointer-events-none",
        // Variant + size
        variantClasses[variant],
        sizeClasses[size],
        full && "w-full",
        className
      )}
    >
      {loading ? (
        <svg
          className="animate-spin h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children && <span>{children}</span>}
      {iconRight && !loading && (
        <span className="shrink-0">{iconRight}</span>
      )}
    </button>
  );
}
