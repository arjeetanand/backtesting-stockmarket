"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

const pageTitles: Record<string, string> = {
  "/": "Research overview",
  "/research": "Test a strategy",
  "/time-machine": "Time machine",
  "/strategy": "Build rules",
  "/backtests": "My tests",
  "/comparison": "Compare tests",
  "/analytics": "Understand a test",
  "/ml-lab": "ML Lab",
  "/market-scanner": "Market Scanner",
  "/stock-research": "Stock research",
  "/insights": "Market Insights",
  "/watchlist": "Daily Watchlist",
  "/pattern-finder": "Pattern Finder",
  "/robustness": "Check reliability",
  "/bias-validity": "Risk check",
  "/strategy-import": "Strategy library",
  "/options": "Learning centre",
  "/data": "Manage stock data",
  "/settings": "Settings",
  "/replay": "Replay a chart",
  "/insights/fii-dii": "FII / DII Insights",
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
  const displayTitle = title ?? (matchedKey ? pageTitles[matchedKey] : "Quant Terminal");

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
        <div className="bt-topbar-status" aria-label="Official NSE daily archive data">
          <span className="bt-topbar-status-dot" aria-hidden="true" />
          <span>Historical NSE</span>
        </div>
        <Link href="/research" className="bt-topbar-new-test">
          Start a new test
        </Link>
      </div>
    </header>
  );
}
