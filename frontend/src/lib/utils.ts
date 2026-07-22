import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: (string | undefined | null | boolean | Record<string, boolean>)[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number | null, decimals = 1): string {
  if (value === null) return "—";
  const formatted = Math.abs(value).toFixed(decimals) + "%";
  return value >= 0 ? "+" + formatted : "-" + formatted;
}

export function formatNumber(value: number | null, decimals = 2): string {
  if (value === null) return "—";
  return value.toFixed(decimals);
}
