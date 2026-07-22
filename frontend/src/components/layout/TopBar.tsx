"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Search, GitBranch, ArrowUpRight } from "lucide-react";

const pageTitles: Record<string, { title: string; category: string }> = {
  "/": { title: "Dashboard", category: "Overview" },
  "/research": { title: "Research Workspace", category: "Research" },
  "/strategy": { title: "Strategy Lab", category: "Builder" },
  "/backtests": { title: "Backtest Runs", category: "History" },
  "/comparison": { title: "Experiment Matrix", category: "Analysis" },
  "/robustness": { title: "Robustness Suite", category: "Diagnostics" },
  "/bias-validity": { title: "Risk & Validity Engine", category: "Audit" },
  "/strategy-import": { title: "YouTube Strategy Import", category: "Tools" },
  "/options": { title: "Options Lab", category: "Education" },
  "/data": { title: "Data & Providers", category: "Infrastructure" },
  "/settings": { title: "Settings", category: "Configuration" },
  "/replay": { title: "Chart Replay", category: "Replay" },
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
  const displayCategory = fallback.category;

  return (
    <header className="bt-topbar">
      {/* Left: Breadcrumb / Page Title */}
      <div className="bt-topbar-breadcrumb">
        <span className="bt-topbar-category">{displayCategory}</span>
        <span className="bt-topbar-sep">/</span>
        <h2 className="bt-topbar-title">{displayTitle}</h2>
      </div>

      {/* Right: Search, Actions, Profile */}
      <div className="bt-topbar-actions">
        {/* Search */}
        <div className="bt-topbar-search">
          <Search size={14} />
          <input
            placeholder="Search strategies, runs..."
            type="text"
          />
        </div>

        {/* Branch / Topology */}
        <button className="bt-icon-btn" title="Branch Topology">
          <GitBranch size={16} />
        </button>

        {/* Notifications */}
        <button className="bt-icon-btn" title="Notifications">
          <Bell size={16} />
          <span
            style={{
              position: "absolute",
              top: "8px",
              right: "8px",
              width: "6px",
              height: "6px",
              background: "#4f46e5",
              borderRadius: "50%",
            }}
          />
        </button>

        <div className="bt-topbar-divider" />

        {/* Quick Action Button */}
        <Link href="/backtests" className="bt-topbar-cta">
          <span>Export Run</span>
          <ArrowUpRight size={13} />
        </Link>

        {/* Profile Avatar */}
        <div className="bt-topbar-avatar">QA</div>
      </div>
    </header>
  );
}
