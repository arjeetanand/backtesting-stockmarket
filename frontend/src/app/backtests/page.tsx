"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Search,
  Eye,
  GitCompare,
  Trash2,
  XCircle,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Activity,
  Award,
  BarChart3,
  CheckCircle2,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { StatusBadge } from "@/components/ui/Badges";
import { mockAllRuns } from "@/lib/mock-data";
import { formatPercent, formatNumber, cn } from "@/lib/utils";

export default function BacktestsPage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const toggleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const filtered = mockAllRuns.filter((run) => {
    const matchSearch =
      run.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      run.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === "All" || run.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const completedRuns = mockAllRuns.filter((r) => r.status === "COMPLETED");
  const avgSharpe = completedRuns.reduce((acc, r) => acc + (r.sharpe ?? 0), 0) / (completedRuns.length || 1);
  const maxCagr = Math.max(...completedRuns.map((r) => r.cagr ?? 0));

  return (
    <div className="backtrack-page">
      <TopBar />

      <div className="backtrack-content bt-stack">
        {/* Page Header */}
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker"><span className="live-dot" /> 04 / BACKTEST RUNS &amp; HISTORY</div>
            <h1>Execution &amp; backtest history.</h1>
            <p>{mockAllRuns.length} total runs logged on execution engine. Filter by performance metrics, symbols, and status.</p>
          </div>
          <div className="bt-heading-actions">
            <span className="data-source"><GitCompare size={14} /> {mockAllRuns.length} Runs Logged</span>
          </div>
        </section>

        {/* Top Summary Stat Cards */}
        <div className="bt-kpi-grid">
          <div className="bt-stat-card blue">
            <span>TOTAL EXECUTIONS</span>
            <strong>{mockAllRuns.length}</strong>
            <small>All engine runs</small>
            <Activity size={18} />
          </div>

          <div className="bt-stat-card mint">
            <span>BEST CAGR</span>
            <strong>{formatPercent(maxCagr)}</strong>
            <small>Top performing run</small>
            <TrendingUp size={18} />
          </div>

          <div className="bt-stat-card violet">
            <span>AVG SHARPE RATIO</span>
            <strong>{formatNumber(avgSharpe)}</strong>
            <small>Risk-adjusted score</small>
            <Award size={18} />
          </div>

          <div className="bt-stat-card blue">
            <span>COMPLETED RUNS</span>
            <strong>{completedRuns.length} / {mockAllRuns.length}</strong>
            <small>100% verified results</small>
            <CheckCircle2 size={18} />
          </div>
        </div>

        {/* ── Filters Bar ── */}
        <div className="bt-panel bt-filter-bar">
          {/* Search */}
          <div className="bt-search-input-wrap">
            <Search size={14} className="text-slate-400" />
            <input
              placeholder="Search by strategy name or run ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Status Filter Tabs */}
          <div className="bt-toolbar">
            {["All", "COMPLETED", "RUNNING", "FAILED"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn("bt-tab", statusFilter === s && "active")}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Sort Select */}
          <select className="bt-sort-select">
            <option>Sort: Date ↓</option>
            <option>Sort: Sharpe ↓</option>
            <option>Sort: CAGR ↓</option>
            <option>Sort: Max DD ↑</option>
          </select>
        </div>

        {/* ── Table ── */}
        <div className="bt-panel" style={{ padding: 0, overflow: "hidden" }}>
          <div className="bt-table-wrap">
            <table className="bt-table">
              <thead>
                <tr>
                  <th className="center">
                    <input
                      type="checkbox"
                      style={{ borderRadius: "4px", border: "1px solid #cbd5e1", accentColor: "#4f46e5", backgroundColor: "white", cursor: "pointer" }}
                      onChange={(e) =>
                        setSelected(e.target.checked ? filtered.map((r) => r.id) : [])
                      }
                      checked={selected.length === filtered.length && filtered.length > 0}
                    />
                  </th>
                  {["Run ID", "Strategy Name", "Symbols", "Status", "CAGR", "Sharpe", "Max DD", "Trades", "Date", "Actions"].map(
                    (col) => (
                      <th
                        key={col}
                        className={["CAGR", "Sharpe", "Max DD", "Trades"].includes(col) ? "right" : ["Actions"].includes(col) ? "center" : ""}
                      >
                        {col}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((run) => {
                  const isSelected = selected.includes(run.id);
                  return (
                    <tr
                      key={run.id}
                      className={isSelected ? "selected" : ""}
                    >
                      <td className="center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(run.id)}
                          style={{ borderRadius: "4px", border: "1px solid #cbd5e1", accentColor: "#4f46e5", backgroundColor: "white", cursor: "pointer" }}
                        />
                      </td>
                      <td>
                        <span className="bt-run-id">
                          {run.id}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: "var(--font-inter)", fontWeight: 700, color: "#0f172a" }}>
                          {run.name}
                        </span>
                      </td>
                      <td>
                        <span className="bt-symbol-chip">
                          {run.symbols.join(", ")}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="right">
                        <span
                          className={
                            run.cagr === null
                              ? "bt-val-muted"
                              : run.cagr > 0
                              ? "bt-val-gain"
                              : "bt-val-loss"
                          }
                        >
                          {formatPercent(run.cagr)}
                        </span>
                      </td>
                      <td className="right">
                        <span
                          className={
                            run.sharpe === null ? "bt-val-muted" : "bt-val-indigo"
                          }
                        >
                          {run.sharpe === null ? "—" : formatNumber(run.sharpe)}
                        </span>
                      </td>
                      <td className="right">
                        <span
                          className={
                            run.maxDrawdown === null ? "bt-val-muted" : "bt-val-loss"
                          }
                        >
                          {formatPercent(run.maxDrawdown)}
                        </span>
                      </td>
                      <td className="right">
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: "bold", color: "#334155" }}>
                          {run.trades ?? "—"}
                        </span>
                      </td>
                      <td>
                        <span className="bt-val-muted">
                          {run.runDate}
                        </span>
                      </td>
                      <td className="center">
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "center" }}>
                          {run.status === "COMPLETED" && (
                            <>
                              <Link
                                href={`/backtests/${run.id}`}
                                className="bt-row-action view"
                                title="View Results"
                              >
                                <Eye size={14} />
                              </Link>
                              <button
                                onClick={() => toggleSelect(run.id)}
                                className="bt-row-action compare"
                                title="Compare"
                              >
                                <GitCompare size={14} />
                              </button>
                              <button
                                className="bt-row-action delete"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                          {run.status === "RUNNING" && (
                            <button
                              className="bt-row-action cancel"
                              title="Cancel"
                            >
                              <XCircle size={14} />
                            </button>
                          )}
                          {run.status === "FAILED" && (
                            <>
                              <Link
                                href={`/backtests/${run.id}`}
                                className="bt-row-action error"
                                title="View Error"
                              >
                                <Eye size={14} />
                              </Link>
                              <button
                                className="bt-row-action retry"
                                title="Retry"
                              >
                                <RotateCcw size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Compare Panel Banner (When 2+ rows selected) ── */}
        {selected.length >= 2 && (
          <div className="bt-compare-banner">
            <div className="bt-compare-banner-left">
              <div className="bt-compare-icon">
                <GitCompare size={18} />
              </div>
              <span className="bt-compare-label">
                {selected.length} strategies selected for diff
              </span>
              <div className="bt-compare-ids">
                {selected.map((id) => (
                  <span
                    key={id}
                    className="bt-compare-id"
                  >
                    {id}
                  </span>
                ))}
              </div>
            </div>
            <div className="bt-compare-banner-right">
              <button
                onClick={() => setSelected([])}
                className="bt-secondary"
                style={{ fontSize: "11px" }}
              >
                Clear
              </button>
              <Link href="/comparison" className="bt-primary">
                <TrendingUp size={14} />
                Open Full Comparison
              </Link>
            </div>
          </div>
        )}

        {/* Pagination */}
        <div className="bt-pagination">
          <span className="bt-pagination-label">
            Showing {filtered.length} of {mockAllRuns.length} runs
          </span>
          <div className="bt-pagination-controls">
            <button className="bt-page-btn">
              <ChevronLeft size={16} />
            </button>
            {[1, 2, 3].map((p) => (
              <button
                key={p}
                className={p === 1 ? "bt-page-btn active" : "bt-page-btn"}
              >
                {p}
              </button>
            ))}
            <button className="bt-page-btn">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
