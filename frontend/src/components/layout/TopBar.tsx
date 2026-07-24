"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

const pageTitles: Record<string, { title: string; category: string }> = {
  "/": { title: "Backtesting Workspace", category: "" },
  "/research": { title: "Test a strategy", category: "" },
  "/strategy": { title: "Build rules", category: "" },
  "/backtests": { title: "My tests", category: "" },
  "/comparison": { title: "Compare tests", category: "" },
  "/analytics": { title: "Understand a test", category: "" },
  "/ml-lab": { title: "ML Lab", category: "" },
  "/market-scanner": { title: "Market Scanner", category: "" },
  "/watchlist": { title: "Daily Watchlist", category: "" },
  "/pattern-finder": { title: "Pattern Finder", category: "" },
  "/robustness": { title: "Check reliability", category: "" },
  "/bias-validity": { title: "Risk check", category: "" },
  "/strategy-import": { title: "Strategy library", category: "" },
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
  const [syncing, setSyncing] = useState(false);

  const matchedKey = Object.keys(pageTitles).sort((left, right) => right.length - left.length).find((key) =>
    key === "/" ? pathname === "/" : pathname.startsWith(key)
  );
  const fallback = matchedKey
    ? pageTitles[matchedKey]
    : { title: "Quant Terminal", category: "Backtrack" };
  const displayTitle = title ?? fallback.title;

  const syncToday = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/data/sync-today`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Sync failed.");
      alert(data.message);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to sync today's market data.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <header className="bt-topbar">
      <div className="bt-topbar-breadcrumb">
        <h2 className="bt-topbar-title">{displayTitle}</h2>
      </div>
      <div className="bt-topbar-actions">
        <button
          type="button"
          className="topbar-sync-btn"
          onClick={() => void syncToday()}
          disabled={syncing}
          title="One-click sync missing trading day archives up to today"
        >
          <RefreshCw size={13} className={syncing ? "spin" : ""} />
          {syncing ? "Syncing NSE Data…" : "Sync Today's Data"}
        </button>
        <div className="bt-topbar-status" aria-label="NSE data connection status">
          <span className="bt-topbar-status-dot" aria-hidden="true" />
          <span>NSE Live</span>
        </div>
        <Link href="/research" className="bt-topbar-new-test">
          Start a new test
        </Link>
      </div>
    </header>
  );
}
