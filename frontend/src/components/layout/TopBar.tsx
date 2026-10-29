"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { syncTodayMarketData } from "@/lib/insights-api";

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
      const result = await syncTodayMarketData();
      alert(result.message ?? "Market data sync finished.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to sync market data.");
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
          title="Sync NSE daily bars, the latest official NSE FII/DII report, and missing Tapetide history"
        >
          <RefreshCw size={13} className={syncing ? "spin" : ""} />
          {syncing ? "Syncing Market Data…" : "Sync All Market Data"}
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
