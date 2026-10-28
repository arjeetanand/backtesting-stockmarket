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
  ShieldAlert,
  BrainCircuit,
  Sparkles,
  Search,
  BookmarkCheck,
  Landmark,
  Activity,
  ChevronDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const mainNav = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/research", label: "New research", icon: FlaskConical },
  { href: "/backtests", label: "Saved tests", icon: GitCompare },
  { href: "/comparison", label: "Compare tests", icon: BarChart3 },
];

const marketNav = [
  { href: "/market-scanner", label: "Market scanner", icon: Search },
  { href: "/insights", label: "Market insights", icon: Activity },
  { href: "/watchlist", label: "Daily watchlist", icon: BookmarkCheck },
  { href: "/pattern-finder", label: "Pattern finder", icon: Sparkles },
  { href: "/insights/fii-dii", label: "FII / DII insights", icon: Landmark },
];

const toolsNav = [
  { href: "/strategy", label: "Build rules", icon: Wrench },
  { href: "/strategy-import", label: "Import a video strategy", icon: Video },
  { href: "/replay", label: "Replay a chart", icon: Play },
  { href: "/robustness", label: "Check reliability", icon: ShieldAlert },
  { href: "/ml-lab", label: "ML Lab", icon: BrainCircuit },
  { href: "/options", label: "Learn & indicators", icon: BookOpenCheck },
  { href: "/data", label: "Manage stock data", icon: Database },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);
  const renderLinks = (items: Array<{ href: string; label: string; icon: LucideIcon }>) => items.map(({ href, label, icon: Icon }) => (
    <Link key={href} href={href} className={`bt-nav-link${isActive(href) ? " active" : ""}`} aria-current={isActive(href) ? "page" : undefined}>
      <Icon size={16} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  ));

  return (
    <aside className="bt-sidebar">
      <div className="bt-sidebar-brand">
        <Link href="/" className="bt-sidebar-brand-link" aria-label="Backtrack overview">
          <span className="bt-sidebar-mark"><Activity size={16} aria-hidden="true" /></span>
          <span><span className="bt-sidebar-title">backtrack</span><span className="bt-sidebar-subtitle">Local NSE research</span></span>
        </Link>
      </div>

      <nav className="bt-sidebar-nav">
        <div>
          <p className="bt-nav-section-label">Workspace</p>
          <div className="bt-nav-items">{renderLinks(mainNav)}</div>
        </div>
        <details className="bt-nav-group" open={marketNav.some(({ href }) => isActive(href))}>
          <summary>Explore markets <ChevronDown size={14} aria-hidden="true" /></summary>
          <div className="bt-nav-items">{renderLinks(marketNav)}</div>
        </details>
        <details className="bt-nav-group" open={toolsNav.some(({ href }) => isActive(href))}>
          <summary>More tools <ChevronDown size={14} aria-hidden="true" /></summary>
          <div className="bt-nav-items">{renderLinks(toolsNav)}</div>
        </details>
      </nav>

      <div className="bt-sidebar-footer">
        <div className="bt-sidebar-status" title="Backtests and replay orders are simulations">
          <span className="bt-sidebar-status-dot" aria-hidden="true" />
          <span>Historical only</span>
        </div>
        <span className="bt-sidebar-online">LOCAL</span>
      </div>
    </aside>
  );
}
