import { cn } from "@/lib/utils";

export type RunStatus = "COMPLETED" | "RUNNING" | "FAILED" | "PENDING";

interface BadgeProps {
  status: RunStatus;
  pulse?: boolean;
}

const statusConfig: Record<RunStatus, { label: string; wrapperClass: string; dotClass: string }> = {
  COMPLETED: {
    label: "Completed",
    wrapperClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dotClass: "bg-emerald-500",
  },
  RUNNING: {
    label: "Running",
    wrapperClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
    dotClass: "bg-indigo-600",
  },
  FAILED: {
    label: "Failed",
    wrapperClass: "bg-rose-50 text-rose-700 border-rose-200",
    dotClass: "bg-rose-600",
  },
  PENDING: {
    label: "Pending",
    wrapperClass: "bg-amber-50 text-amber-800 border-amber-200",
    dotClass: "bg-amber-600",
  },
};

export function StatusBadge({ status, pulse = false }: BadgeProps) {
  const cfg = statusConfig[status];
  const isRunning = status === "RUNNING";

  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase font-mono border", cfg.wrapperClass)}>
      <span className="relative flex h-1.5 w-1.5">
        {(isRunning || pulse) && (
          <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", cfg.dotClass)} />
        )}
        <span className={cn("relative inline-flex rounded-full h-1.5 w-1.5", cfg.dotClass)} />
      </span>
      {cfg.label}
    </span>
  );
}

interface BiasCheckBadgeProps {
  name: string;
  status: "PASS" | "WARN" | "FAIL";
}

export function BiasCheckBadge({ name, status }: BiasCheckBadgeProps) {
  const cfg = {
    PASS: { wrapperClass: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "PASS" },
    WARN: { wrapperClass: "bg-amber-50 text-amber-800 border-amber-200", label: "WARN" },
    FAIL: { wrapperClass: "bg-rose-50 text-rose-700 border-rose-200", label: "FAIL" },
  }[status];

  return (
    <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors">
      <span className="text-xs text-slate-700 font-semibold font-mono">
        {name}
      </span>
      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded font-mono border uppercase", cfg.wrapperClass)}>
        {cfg.label}
      </span>
    </div>
  );
}
