"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FlaskConical,
  Wrench,
  GitCompare,
  BarChart3,
  Database,
  Video,
  BookOpenCheck,
  Settings,
  Play,
  TrendingUp,
  ShieldAlert,
} from "lucide-react";

const mainNav = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/research", label: "Test a strategy", icon: FlaskConical },
  { href: "/backtests", label: "My tests", icon: GitCompare },
  { href: "/comparison", label: "Compare tests", icon: BarChart3 },
  { href: "/options", label: "Learn", icon: BookOpenCheck },
];

const secondaryNav = [
  { href: "/strategy", label: "Build rules", icon: Wrench },
  { href: "/strategy-import", label: "Use a YouTube strategy", icon: Video },
  { href: "/replay", label: "Replay a chart", icon: Play },
  { href: "/data", label: "Manage stock data", icon: Database },
  { href: "/robustness", label: "Check reliability", icon: ShieldAlert },
  { href: "/settings", label: "Settings", icon: Settings },
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
            </div>
            <p className="bt-sidebar-subtitle">Test ideas with history</p>
          </div>
        </div>
      </div>

      <div className="bt-sidebar-cta"><Link href="/research"><span>Start a new test</span></Link></div>

      {/* Main Navigation Area */}
      <nav className="bt-sidebar-nav">
        <div>
          <p className="bt-nav-section-label">Your workspace</p>
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

        <div>
          <p className="bt-nav-section-label">More ways to test</p>
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
          <span>Data connection</span>
        </div>
        <span className="bt-sidebar-online">READY</span>
      </div>
    </aside>
  );
}
