"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";

const pageTitles: Record<string, { title: string; category: string }> = {
  "/": { title: "Home", category: "" },
  "/research": { title: "Test a strategy", category: "" },
  "/strategy": { title: "Build rules", category: "" },
  "/backtests": { title: "My tests", category: "" },
  "/comparison": { title: "Compare tests", category: "" },
  "/robustness": { title: "Check reliability", category: "" },
  "/bias-validity": { title: "Risk check", category: "" },
  "/strategy-import": { title: "Use a YouTube strategy", category: "" },
  "/options": { title: "Learning centre", category: "" },
  "/data": { title: "Manage stock data", category: "" },
  "/settings": { title: "Settings", category: "" },
  "/replay": { title: "Replay a chart", category: "" },
};

interface TopBarProps {
  title?: string;
  subtitle?: string;
}

export default function TopBar({ title }: TopBarProps = {}) {
  const pathname = usePathname();

  const matchedKey = Object.keys(pageTitles).find((key) =>
    key === "/" ? pathname === "/" : pathname.startsWith(key)
  );
  const fallback = matchedKey
    ? pageTitles[matchedKey]
    : { title: "Quant Terminal", category: "Backtrack" };
  const displayTitle = title ?? fallback.title;

  return (
    <header className="bt-topbar">
      <div className="bt-topbar-breadcrumb">
        <h2 className="bt-topbar-title">{displayTitle}</h2>
      </div>
      <div className="bt-topbar-actions">
        <Link href="/research" className="bt-topbar-cta">
          <span>Start a test</span>
          <ArrowRight size={13} />
        </Link>
      </div>
    </header>
  );
}
