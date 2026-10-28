"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  BookmarkCheck,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

type WatchlistItem = {
  id: string;
  symbol: string;
  company_name: string;
  setup_type: string;
  entry_date: string;
  entry_price: number;
  target_price: number;
  stop_loss_price: number;
  current_price: number;
  pnl_pct: number;
  status: "waiting_for_trigger" | "active" | "target_hit" | "stop_loss_hit";
  created_at: string;
};

function fmt(val: number | undefined, digits = 2): string {
  return Number.isFinite(val) ? Number(val).toFixed(digits) : "—";
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWatchlist = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/watchlist`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Failed to load watchlist.");
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error fetching watchlist.");
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/watchlist/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete watchlist item.");
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete item.");
    }
  };

  useEffect(() => {
    queueMicrotask(() => void fetchWatchlist());
  }, []);

  const totalCount = items.length;
  const waitingCount = items.filter((x) => x.status === "waiting_for_trigger").length;
  const activeCount = items.filter((x) => x.status === "active").length;
  const targetHitCount = items.filter((x) => x.status === "target_hit").length;
  const stopHitCount = items.filter((x) => x.status === "stop_loss_hit").length;
  const trackedItems = items.filter((x) => x.status !== "waiting_for_trigger");
  const avgPnl = trackedItems.length > 0 ? trackedItems.reduce((acc, curr) => acc + curr.pnl_pct, 0) / trackedItems.length : 0;

  return (
    <div className="backtrack-page">
      <TopBar />
      <div className="backtrack-content bt-stack watchlist-page">
        {/* Page Header */}
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker">
              <span className="live-dot" /> FORWARD SETUP TRACKER
            </div>
            <h1>Daily Watchlist &amp; Setup Tracker</h1>
            <p>
              Review saved conditional plans against imported daily NSE bars. A plan waits until its trigger is reached; daily candles cannot confirm an intraday fill or which level traded first.
            </p>
          </div>
          <div className="bt-heading-actions">
            <button
              type="button"
              className="bt-secondary-btn"
              onClick={() => void fetchWatchlist()}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh Tracker
            </button>
          </div>
        </section>

        {/* Summary Stats Grid */}
        <div className="watchlist-stats-grid">
          <div className="watchlist-stat-card">
            <span>Saved Plans</span>
            <strong>{totalCount}</strong>
            <small>Local paper tracking</small>
          </div>
          <div className="watchlist-stat-card">
            <span>Waiting for Trigger</span>
            <strong style={{ color: "#4f46e5" }}>{waitingCount}</strong>
            <small>Price has not crossed the reference level</small>
          </div>
          <div className="watchlist-stat-card">
            <span>Triggered · Paper</span>
            <strong style={{ color: "#4f46e5" }}>{activeCount}</strong>
            <small>Monitoring later daily bars</small>
          </div>
          <div className="watchlist-stat-card">
            <span>Target Reached</span>
            <strong style={{ color: "#047857" }}>{targetHitCount}</strong>
            <small>Paper target level reached</small>
          </div>
          <div className="watchlist-stat-card">
            <span>Stop Reached</span>
            <strong style={{ color: "#e11d48" }}>{stopHitCount}</strong>
            <small>Paper invalidation level reached</small>
          </div>
          <div className="watchlist-stat-card">
            <span>Average Paper Return</span>
            <strong className={avgPnl >= 0 ? "text-pos" : "text-neg"}>
              {trackedItems.length === 0 ? "—" : avgPnl >= 0 ? `+${fmt(avgPnl)}%` : `${fmt(avgPnl)}%`}
            </strong>
            <small>Triggered plans vs latest close</small>
          </div>
        </div>

        {error && (
          <div className="bt-alert-error" role="alert">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Watchlist Main Table */}
        <section className="bt-panel">
          <div className="bt-panel-head">
            <div>
              <span className="bt-eyebrow">SAVED SETUPS</span>
              <h2>Saved Morning Plans ({items.length})</h2>
            </div>
          </div>

          {loading ? (
            <div className="bt-loading-state">
              <RefreshCw size={18} className="spin" />
              <span>Evaluating watchlist items against latest daily market bars…</span>
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>
              <BookmarkCheck size={32} style={{ color: "#94a3b8", marginBottom: "8px" }} />
              <p>Your watchlist is currently empty.</p>
              <small>Open <a href="/market-scanner" className="bt-link">Market Scanner</a>, build a morning plan, then choose <strong>&quot;Save Plan&quot;</strong> on a candidate.</small>
            </div>
          ) : (
            <div className="bt-table-wrap">
              <table className="bt-table">
                <thead>
                  <tr>
                    <th className="left">Stock</th>
                    <th className="left">Setup Type</th>
                    <th className="right">Saved Date</th>
                    <th className="right">Trigger</th>
                    <th className="right">Latest Close</th>
                    <th className="right">Target</th>
                    <th className="right">Stop</th>
                    <th className="right">Paper Return</th>
                    <th className="center">Status</th>
                    <th className="center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="left">
                        <strong>{item.symbol}</strong>
                        <small className="bt-table-sub">{item.company_name}</small>
                      </td>
                      <td className="left">
                        <span className="scanner-sector-pill">{item.setup_type}</span>
                      </td>
                      <td className="right font-mono">{item.entry_date}</td>
                      <td className="right font-mono">₹{fmt(item.entry_price)}</td>
                      <td className="right font-mono">
                        <strong>₹{fmt(item.current_price)}</strong>
                      </td>
                      <td className="right font-mono text-pos">₹{fmt(item.target_price)}</td>
                      <td className="right font-mono text-neg">₹{fmt(item.stop_loss_price)}</td>
                      <td className="right font-mono">
                        <strong className={item.pnl_pct >= 0 ? "text-pos" : "text-neg"}>
                          {item.status === "waiting_for_trigger" ? "—" : item.pnl_pct >= 0 ? `+${fmt(item.pnl_pct)}%` : `${fmt(item.pnl_pct)}%`}
                        </strong>
                      </td>
                      <td className="center">
                        {item.status === "target_hit" && (
                          <span className="watchlist-badge target-hit">
                            <CheckCircle2 size={12} /> Target Reached
                          </span>
                        )}
                        {item.status === "stop_loss_hit" && (
                          <span className="watchlist-badge stop-hit">
                            <XCircle size={12} /> Stop Reached
                          </span>
                        )}
                        {item.status === "waiting_for_trigger" && (
                          <span className="watchlist-badge waiting">
                            <Clock3 size={12} /> Waiting for Trigger
                          </span>
                        )}
                        {item.status === "active" && (
                          <span className="watchlist-badge active">
                            <BookmarkCheck size={12} /> Triggered · Paper
                          </span>
                        )}
                      </td>
                      <td className="center">
                        <button
                          type="button"
                          className="watchlist-del-btn"
                          onClick={() => void deleteItem(item.id)}
                          title="Remove item"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
