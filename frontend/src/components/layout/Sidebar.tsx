"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FlaskConical,
  Wrench,
  GitCompare,
  ShieldAlert,
  BarChart3,
  Database,
  Video,
  BookOpenCheck,
  Settings,
  Plus,
  TrendingUp,
  Sparkles,
  Play,
} from "lucide-react";

const mainNav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/replay", label: "Chart Replay", icon: Play },
  { href: "/research", label: "Research", icon: FlaskConical },
  { href: "/strategy", label: "Strategy Lab", icon: Wrench },
  { href: "/backtests", label: "Backtest Runs", icon: GitCompare },
  { href: "/comparison", label: "Experiment Matrix", icon: BarChart3 },
  { href: "/robustness", label: "Robustness Suite", icon: Sparkles },
  { href: "/bias-validity", label: "Risk Engine", icon: ShieldAlert },
];

const secondaryNav = [
  { href: "/strategy-import", label: "YouTube Import", icon: Video },
  { href: "/options", label: "Options Lab", icon: BookOpenCheck },
  { href: "/data", label: "Data & Providers", icon: Database },
  { href: "/settings", label: "Settings", icon: Settings },
];

const recentSessions = [
  { id: "rsi_ema", label: "RSI EMA Trend Confirmation", active: true },
  { id: "nifty_mean", label: "NIFTY Mean Reversion", active: false },
  { id: "mom_vs_bh", label: "Momentum vs Buy & Hold", active: false },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="bt-sidebar">
      {/* Brand Header */}
      <div className="bt-sidebar-brand">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="bt-sidebar-logo">
            <TrendingUp size={18} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="bt-sidebar-title">backtrack</span>
              <span className="bt-sidebar-badge">PRO</span>
            </div>
            <p className="bt-sidebar-subtitle">Quant Platform</p>
          </div>
        </div>
      </div>

      {/* Primary CTA Button */}
      <div className="bt-sidebar-cta">
        <Link href="/research">
          <Plus size={14} />
          <span>New Research Session</span>
        </Link>
      </div>

      {/* Main Navigation Area */}
      <nav className="bt-sidebar-nav">
        {/* Core Modules */}
        <div>
          <p className="bt-nav-section-label">Core Modules</p>
          <div className="bt-nav-items">
            {mainNav.map(({ href, label, icon: Icon }) => {
              const isActive =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`bt-nav-link${isActive ? " active" : ""}`}
                >
                  <Icon size={16} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Tools & Data */}
        <div>
          <p className="bt-nav-section-label">Tools &amp; Data</p>
          <div className="bt-nav-items">
            {secondaryNav.map(({ href, label, icon: Icon }) => {
              const isActive = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`bt-nav-link${isActive ? " active" : ""}`}
                >
                  <Icon size={16} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent Experiments */}
        <div>
          <p className="bt-nav-section-label">Recent Experiments</p>
          <div className="bt-nav-items">
            {recentSessions.map((session) => (
              <Link
                key={session.id}
                href="/backtests"
                className={`bt-nav-recent-link${session.active ? " active" : ""}`}
              >
                <span className={`bt-nav-dot${session.active ? " active" : ""}`} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {session.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Footer Status Bar */}
      <div className="bt-sidebar-footer">
        <div className="bt-sidebar-status">
          <span style={{ position: "relative", display: "flex", height: "8px", width: "8px" }}>
            <span
              style={{
                position: "absolute",
                display: "inline-flex",
                height: "100%",
                width: "100%",
                borderRadius: "50%",
                background: "#10b981",
                opacity: 0.75,
                animation: "ping 1s cubic-bezier(0,0,0.2,1) infinite",
              }}
            />
            <span
              style={{
                position: "relative",
                display: "inline-flex",
                borderRadius: "50%",
                height: "8px",
                width: "8px",
                background: "#10b981",
              }}
            />
          </span>
          <span>FastAPI Engine</span>
        </div>
        <span className="bt-sidebar-online">ONLINE</span>
      </div>
    </aside>
  );
}
