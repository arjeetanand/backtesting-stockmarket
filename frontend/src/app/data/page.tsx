"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Database, Download, RefreshCw } from "lucide-react";
import TopBar from "@/components/layout/TopBar";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

type CacheStatus = { symbols: number; bars: number; earliest: string | null; latest: string | null };
type ImportStatus = { job_id: string; status: string; message: string; symbols?: number; downloaded_days?: number; skipped_days?: number; stored_bars?: number };

export default function DataPage() {
  const [cache, setCache] = useState<CacheStatus | null>(null);
  const [start, setStart] = useState("2025-07-01");
  const [end, setEnd] = useState("2026-06-30");
  const [job, setJob] = useState<ImportStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshCache = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/data/cache`);
      if (!response.ok) throw new Error("Could not read local cache status.");
      setCache(await response.json());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not read cache status.");
    }
  };

  useEffect(() => {
    const initialFetch = window.setTimeout(() => { void refreshCache(); }, 0);
    return () => window.clearTimeout(initialFetch);
  }, []);

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`${API_BASE_URL}/data/nse-import/${job.job_id}`);
      if (response.ok) {
        const next = await response.json() as ImportStatus;
        setJob(next);
        if (["complete", "failed"].includes(next.status)) void refreshCache();
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [job]);

  const startImport = async () => {
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/data/nse-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start, end, preset: "sensex_banks_sector_etfs" }),
      });
      const payload = await response.json() as ImportStatus & { detail?: string };
      if (!response.ok) throw new Error(payload.detail ?? "Could not start the NSE import.");
      setJob({ ...payload, message: `Queued official NSE import for ${payload.symbols} instruments.` });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start the import.");
    }
  };

  const importing = job?.status === "queued" || job?.status === "running";

  return (
    <div className="backtrack-page">
      <TopBar />
      <div className="backtrack-content bt-stack">
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker"><span className="live-dot" /> 04 / LOCAL HISTORICAL DATA</div>
            <h1>Download once. Backtest locally.</h1>
            <p>Import official NSE daily Bhavcopy archives for the Sensex, leading banks, and sector ETFs into local cache.</p>
          </div>
          <div className="bt-heading-actions">
            <button className="bt-secondary" onClick={() => void refreshCache()}>
              <RefreshCw size={14} /> Refresh cache
            </button>
          </div>
        </section>

        {/* Hero Provider Panel */}
        <div className="bt-data-hero">
          <div>
            <span className="bt-eyebrow">OFFICIAL BULK SOURCE</span>
            <div className="bt-provider-select">
              <Database size={20} className="text-indigo-600" />
              <strong>NSE Common Bhavcopy Archive</strong>
            </div>
            <p className="text-slate-600 text-xs mt-1">
              One archive is downloaded per trading day and filtered locally, avoiding a separate remote request for each stock or backtest.
            </p>
          </div>
          <div className="bt-feed-status">
            <span className="feed-pulse" />
            <div>
              <strong>{cache?.bars.toLocaleString("en-IN") ?? "—"} cached candles</strong>
              <small>{cache?.symbols ?? 0} instruments stored in SQLite</small>
            </div>
          </div>
        </div>

        {/* Import Configuration Card */}
        <section className="bt-panel" style={{ padding: "24px" }}>
          <div className="bt-panel-head" style={{ marginBottom: "20px" }}>
            <div>
              <span className="bt-eyebrow">ONE-TIME IMPORT</span>
              <h2>Sensex, Banks &amp; Sector ETFs</h2>
            </div>
            <span className="bt-panel-note">Daily OHLCV Only</span>
          </div>

          <div className="bt-grid-2" style={{ maxWidth: "560px", marginBottom: "20px" }}>
            <div>
              <label className="bt-field-label">Start Date</label>
              <input
                type="date"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                className="bt-field-input"
              />
            </div>
            <div>
              <label className="bt-field-label">End Date</label>
              <input
                type="date"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                className="bt-field-input"
              />
            </div>
          </div>

          <button
            className="bt-primary"
            onClick={() => void startImport()}
            disabled={importing}
          >
            <Download size={15} />
            {importing ? "Importing official NSE files…" : "Download Selected Year"}
          </button>

          {job && (
            <p style={{ marginTop: "14px", fontSize: "13px" }} className={job.status === "failed" ? "text-rose-600 font-medium" : "text-slate-600 font-medium"}>
              {job.message}{typeof job.stored_bars === "number" ? ` ${job.stored_bars.toLocaleString("en-IN")} candles stored.` : ""}
            </p>
          )}
          {error && (
            <p role="alert" style={{ marginTop: "14px", fontSize: "13px" }} className="text-rose-600 font-medium">
              {error}
            </p>
          )}
        </section>

        {/* Scope Note */}
        <div className="bt-data-note">
          <CheckCircle2 size={18} className="text-indigo-600 flex-shrink-0" />
          <div>
            <strong>Scope and limits</strong>
            <p>
              NSE archives cover exchange-traded NSE equities and ETFs. Mutual-fund NAV history is a separate AMFI import because AMFI limits each official history download to 90 days. No broker connection or live order execution is involved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
