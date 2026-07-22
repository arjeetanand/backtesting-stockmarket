import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  cyanBorder?: boolean;
  purpleBorder?: boolean;
  onClick?: () => void;
}

export function GlassCard({
  children,
  className,
  hover = false,
  cyanBorder = false,
  purpleBorder = false,
  onClick,
}: GlassCardProps) {
  return (
    <div
      className={cn(
        "bg-white border border-slate-200 shadow-xs rounded-xl p-5 transition-all duration-150",
        hover && "hover:border-indigo-300 hover:shadow-md cursor-pointer",
        cyanBorder && "border-indigo-300 shadow-2xs",
        purpleBorder && "border-indigo-300 shadow-2xs",
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  color?: "cyan" | "gain" | "loss" | "warn" | "white" | "purple";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  badge?: ReactNode;
}

const colorClassMap = {
  cyan: "text-indigo-600",
  gain: "text-emerald-700",
  loss: "text-rose-600",
  warn: "text-amber-700",
  white: "text-slate-900",
  purple: "text-indigo-600",
};

export function MetricCard({
  label,
  value,
  subValue,
  color = "white",
  size = "md",
  icon,
  badge,
}: MetricCardProps) {
  const valueSizeClass = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-3xl",
  }[size];

  return (
    <div className="bg-white border border-slate-200 shadow-xs rounded-xl p-5 flex flex-col gap-1.5 hover:border-indigo-300 transition-all group">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
          {label}
        </span>
        <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
          {icon}
          {badge}
        </div>
      </div>
      <div className={cn("font-mono font-extrabold", valueSizeClass, colorClassMap[color])}>
        {value}
      </div>
      {subValue && (
        <div className="text-xs text-slate-500 font-medium">
          {subValue}
        </div>
      )}
    </div>
  );
}
