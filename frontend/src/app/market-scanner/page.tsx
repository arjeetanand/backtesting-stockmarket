"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  BarChart3,
  Database,
  Flame,
  Globe,
  Layers,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

type SectorItem = {
  sector: string;
  stock_count: number;
  avg_strategy_return: number;
  avg_buy_hold_return: number;
  avg_win_rate: number;
  avg_max_drawdown: number;
  outperforming_count: number;
};

type StockLeaderboardItem = {
  symbol: string;
  company_name: string;
  sector: string;
  bars: number;
  strategy_return: number;
  buy_hold_return: number;
  win_rate: number;
  max_drawdown: number;
  sharpe_ratio: number;
  trade_count: number;
};

type BreakoutSetup = {
  symbol: string;
  company_name: string;
  sector: string;
  setup_type: string;
  close: number;
  rvol: number;
  dist_52w_high: number;
  rsi_14: number;
  range_20d: number;
  conviction_score: number;
  description: string;
};

function pct(val: number | undefined, digits = 1): string {
  return Number.isFinite(val) ? `${(Number(val) * 100).toFixed(digits)}%` : "—";
}

function fmt(val: number | undefined, digits = 2): string {
  return Number.isFinite(val) ? Number(val).toFixed(digits) : "—";
}

export default function MarketScannerPage() {
  const [activeTab, setActiveTab] = useState<"heatmap" | "breakout">("heatmap");

  // Screener state
  const [universe, setUniverse] = useState("nifty500");
  const [strategyType, setStrategyType] = useState("sma_crossover");
  const [scannerResult, setScannerResult] = useState<{
    universe: string;
    strategy_type: string;
    total_scanned: number;
    sectors_count: number;
    sector_heatmap: SectorItem[];
    leaderboard: StockLeaderboardItem[];
  } | null>(null);
  const [loadingScanner, setLoadingScanner] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);

  // Breakout state
  const [minConviction, setMinConviction] = useState(50);
  const [selectedSetupFilter, setSelectedSetupFilter] = useState<string>("all");
  const [breakoutResult, setBreakoutResult] = useState<{
    total_candidates: number;
    setups: BreakoutSetup[];
  } | null>(null);
  const [loadingBreakout, setLoadingBreakout] = useState(false);
  const [breakoutError, setBreakoutError] = useState<string | null>(null);

  const [scannerTimeSec, setScannerTimeSec] = useState<number | null>(null);
  const [breakoutTimeSec, setBreakoutTimeSec] = useState<number | null>(null);

  const runUniverseScan = async () => {
    setLoadingScanner(true);
    setScannerError(null);
    const t0 = performance.now();
    try {
      const res = await fetch(`${API_BASE_URL}/market-scanner/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ universe, strategy_type: strategyType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Failed to run market scanner.");
      setScannerResult(data);
      setScannerTimeSec(Number(((performance.now() - t0) / 1000).toFixed(1)));
    } catch (err) {
      setScannerError(err instanceof Error ? err.message : "Error running scanner.");
    } finally {
      setLoadingScanner(false);
    }
  };

  const runBreakoutScan = async () => {
    setLoadingBreakout(true);
    setBreakoutError(null);
    const t0 = performance.now();
    try {
      const res = await fetch(`${API_BASE_URL}/breakout-scanner/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ min_conviction: Number(minConviction), limit: 60 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Failed to scan breakout setups.");
      setBreakoutResult(data);
      setBreakoutTimeSec(Number(((performance.now() - t0) / 1000).toFixed(1)));
    } catch (err) {
      setBreakoutError(err instanceof Error ? err.message : "Error scanning setups.");
    } finally {
      setLoadingBreakout(false);
    }
  };

  useEffect(() => {
    if (activeTab === "heatmap" && !scannerResult) {
      void runUniverseScan();
    } else if (activeTab === "breakout" && !breakoutResult) {
      void runBreakoutScan();
    }
  }, [activeTab]);

  const filteredSetups = breakoutResult?.setups.filter((item) => {
    if (selectedSetupFilter === "all") return true;
    if (selectedSetupFilter === "52w") return item.setup_type.includes("52W");
    if (selectedSetupFilter === "vcp") return item.setup_type.includes("VCP");
    if (selectedSetupFilter === "sma") return item.setup_type.includes("SMA");
    if (selectedSetupFilter === "rsi") return item.setup_type.includes("RSI");
    return true;
  });

  return (
    <div className="backtrack-page">
      <TopBar />
      <div className="backtrack-content bt-stack market-scanner-page">
        {/* Heading Header */}
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker">
              <span className="live-dot" /> MULTI-STOCK QUANT SCANNER
            </div>
            <h1>Market Scanner &amp; Automated Setup Recognition</h1>
            <p>
              Evaluate strategies across the entire NIFTY universe concurrently and detect high-conviction breakout setups on official NSE history.
            </p>
          </div>
          <div className="bt-heading-actions">
            <span className="data-source">
              <ShieldCheck size={14} /> Local Official Cache · Fast Vectorized
            </span>
          </div>
        </section>

        {/* Tab Selection Row */}
        <div className="scanner-tab-bar">
          <button
            type="button"
            className={`scanner-tab-btn ${activeTab === "heatmap" ? "is-active" : ""}`}
            onClick={() => setActiveTab("heatmap")}
          >
            <Globe size={16} /> Universe Screener &amp; Sector Heatmap
          </button>
          <button
            type="button"
            className={`scanner-tab-btn ${activeTab === "breakout" ? "is-active" : ""}`}
            onClick={() => setActiveTab("breakout")}
          >
            <Zap size={16} /> Automated Breakout Scanner
            {breakoutResult && (
              <span className="scanner-tab-badge">{breakoutResult.total_candidates}</span>
            )}
          </button>
        </div>

        {/* Tab 1: Universe Screener & Sector Heatmap */}
        {activeTab === "heatmap" && (
          <>
            <section className="bt-panel scanner-control-panel">
              <div className="bt-panel-head">
                <div>
                  <span className="bt-eyebrow">UNIVERSE PARAMETERS</span>
                  <h2>Configure Multi-Stock Strategy Evaluation</h2>
                </div>
              </div>

              <div className="scanner-control-grid">
                <label className="ml-control-field">
                  <span className="bt-field-label">Target Universe</span>
                  <select
                    className="bt-field-input"
                    value={universe}
                    onChange={(e) => setUniverse(e.target.value)}
                  >
                    <option value="nifty50">NIFTY 50 (Top Bluechips)</option>
                    <option value="nifty500">NIFTY 500 (Broad Market)</option>
                    <option value="all">All Imported Stocks</option>
                  </select>
                </label>

                <label className="ml-control-field">
                  <span className="bt-field-label">Strategy Template</span>
                  <select
                    className="bt-field-input"
                    value={strategyType}
                    onChange={(e) => setStrategyType(e.target.value)}
                  >
                    <option value="sma_crossover">SMA Crossover (Fast 20 / Slow 50)</option>
                    <option value="rsi_reversion">RSI Mean Reversion (RSI &lt; 35 Buy)</option>
                    <option value="breakout">52-Week High Breakout Strategy</option>
                  </select>
                </label>

                <div className="scanner-run-btn-wrap">
                  <button
                    type="button"
                    className="bt-primary"
                    onClick={() => void runUniverseScan()}
                    disabled={loadingScanner}
                  >
                    {loadingScanner ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
                    {loadingScanner ? "Scanning Universe…" : "Run Universe Screener"}
                  </button>
                </div>
              </div>

              {scannerError && (
                <div className="bt-alert-error" role="alert" style={{ marginTop: "12px" }}>
                  <AlertCircle size={16} /> {scannerError}
                </div>
              )}
            </section>

            {loadingScanner && (
              <div className="bt-panel bt-loading-state">
                <RefreshCw size={18} className="spin" />
                <span>Evaluating strategy vector across all stocks in universe and grouping sector performance…</span>
              </div>
            )}

            {scannerResult && scannerResult.total_scanned === 0 && !loadingScanner && (
              <div className="bt-panel" style={{ padding: "28px", textAlign: "center" }}>
                <div style={{ display: "inline-flex", padding: "12px", background: "#fef3c7", borderRadius: "50%", color: "#d97706", marginBottom: "12px" }}>
                  <Database size={24} />
                </div>
                <h3 style={{ fontSize: "17px", fontWeight: "700", color: "#1e293b" }}>No Market Data Found in Local Database</h3>
                <p style={{ color: "#64748b", fontSize: "12px", marginTop: "6px", maxWidth: "480px", marginLeft: "auto", marginRight: "auto" }}>
                  The Market Scanner requires imported daily bars for stocks in the target universe. Please visit the Data Import page to download official NSE archives.
                </p>
                <div style={{ marginTop: "16px" }}>
                  <Link href="/data" className="bt-primary" style={{ display: "inline-flex", gap: "8px", textDecoration: "none" }}>
                    <Database size={14} /> Import Stock Data
                  </Link>
                </div>
              </div>
            )}

            {scannerResult && scannerResult.total_scanned > 0 && !loadingScanner && (
              <>
                {/* Sector Heatmap Section */}
                <section className="bt-panel">
                  <div className="bt-panel-head">
                    <div>
                      <span className="bt-eyebrow">SECTOR PERFORMANCE HEATMAP</span>
                      <h2>Sector Alpha Breakdown ({scannerResult.sectors_count} Sectors)</h2>
                    </div>
                    <span className="bt-panel-note">
                      Scanned {scannerResult.total_scanned} stocks {scannerTimeSec ? `in ${scannerTimeSec}s` : ""}
                    </span>
                  </div>

                  <div className="sector-heatmap-grid">
                    {scannerResult.sector_heatmap.map((sec) => {
                      const isPositive = sec.avg_strategy_return >= sec.avg_buy_hold_return;
                      return (
                        <div
                          key={sec.sector}
                          className={`sector-heatmap-card ${isPositive ? "is-bullish" : "is-bearish"}`}
                        >
                          <div className="sector-card-head">
                            <strong>{sec.sector}</strong>
                            <span className="sector-stock-count">{sec.stock_count} stocks</span>
                          </div>
                          <div className="sector-card-metrics">
                            <div>
                              <span>Avg Strat Ret</span>
                              <strong className={sec.avg_strategy_return >= 0 ? "text-pos" : "text-neg"}>
                                {pct(sec.avg_strategy_return)}
                              </strong>
                            </div>
                            <div>
                              <span>Avg Win Rate</span>
                              <strong>{pct(sec.avg_win_rate)}</strong>
                            </div>
                          </div>
                          <div className="sector-card-foot">
                            <small>
                              {sec.outperforming_count}/{sec.stock_count} outperforming B&amp;H ({pct(sec.avg_buy_hold_return)})
                            </small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Stock Leaderboard Table */}
                <section className="bt-panel">
                  <div className="bt-panel-head">
                    <div>
                      <span className="bt-eyebrow">UNIVERSE LEADERBOARD</span>
                      <h2>All Scanned Instruments Sorted by Strategy Return</h2>
                    </div>
                  </div>

                  <div className="bt-table-wrap">
                    <table className="bt-table">
                      <thead>
                        <tr>
                          <th className="left">Stock</th>
                          <th className="left">Sector</th>
                          <th className="right">Bars</th>
                          <th className="right">Strategy Return</th>
                          <th className="right">Buy &amp; Hold</th>
                          <th className="right">Win Rate</th>
                          <th className="right">Sharpe</th>
                          <th className="right">Drawdown</th>
                          <th className="center">Trades</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scannerResult.leaderboard.map((item) => (
                          <tr key={item.symbol}>
                            <td className="left">
                              <strong>{item.symbol}</strong>
                              <small className="bt-table-sub">{item.company_name}</small>
                            </td>
                            <td className="left">
                              <span className="scanner-sector-pill">{item.sector}</span>
                            </td>
                            <td className="right font-mono">{item.bars}</td>
                            <td className="right font-mono">
                              <strong className={item.strategy_return >= item.buy_hold_return ? "text-pos" : "text-neg"}>
                                {pct(item.strategy_return)}
                              </strong>
                            </td>
                            <td className="right font-mono">{pct(item.buy_hold_return)}</td>
                            <td className="right font-mono">{pct(item.win_rate)}</td>
                            <td className="right font-mono">{fmt(item.sharpe_ratio)}</td>
                            <td className="right font-mono text-neg">{pct(item.max_drawdown)}</td>
                            <td className="center font-mono">{item.trade_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </>
        )}

        {/* Tab 2: Automated Breakout Scanner */}
        {activeTab === "breakout" && (
          <>
            <section className="bt-panel scanner-control-panel">
              <div className="bt-panel-head">
                <div>
                  <span className="bt-eyebrow">AUTOMATED BREAKOUT RECOGNITION</span>
                  <h2>Scan Recent History for High-Conviction Technical Setups</h2>
                </div>
                <button
                  type="button"
                  className="bt-secondary-btn"
                  onClick={() => void runBreakoutScan()}
                  disabled={loadingBreakout}
                >
                  <RefreshCw size={14} className={loadingBreakout ? "spin" : ""} /> Rescan Setups
                </button>
              </div>

              <div className="breakout-filter-bar">
                <div className="breakout-chips">
                  <button
                    type="button"
                    className={`breakout-chip ${selectedSetupFilter === "all" ? "is-active" : ""}`}
                    onClick={() => setSelectedSetupFilter("all")}
                  >
                    All Setups ({breakoutResult?.setups.length ?? 0})
                  </button>
                  <button
                    type="button"
                    className={`breakout-chip ${selectedSetupFilter === "52w" ? "is-active" : ""}`}
                    onClick={() => setSelectedSetupFilter("52w")}
                  >
                    <Flame size={13} /> 52W High + RVOL
                  </button>
                  <button
                    type="button"
                    className={`breakout-chip ${selectedSetupFilter === "vcp" ? "is-active" : ""}`}
                    onClick={() => setSelectedSetupFilter("vcp")}
                  >
                    <Layers size={13} /> VCP Contraction
                  </button>
                  <button
                    type="button"
                    className={`breakout-chip ${selectedSetupFilter === "sma" ? "is-active" : ""}`}
                    onClick={() => setSelectedSetupFilter("sma")}
                  >
                    <TrendingUp size={13} /> SMA Rebound
                  </button>
                  <button
                    type="button"
                    className={`breakout-chip ${selectedSetupFilter === "rsi" ? "is-active" : ""}`}
                    onClick={() => setSelectedSetupFilter("rsi")}
                  >
                    <Sparkles size={13} /> RSI Momentum
                  </button>
                </div>

                <div className="breakout-slider-wrap">
                  <span>Min Conviction: <strong>{minConviction}</strong></span>
                  <input
                    type="range"
                    min="30"
                    max="90"
                    step="5"
                    value={minConviction}
                    onChange={(e) => setMinConviction(Number(e.target.value))}
                    onMouseUp={() => void runBreakoutScan()}
                  />
                </div>
              </div>

              {breakoutError && (
                <div className="bt-alert-error" role="alert" style={{ marginTop: "12px" }}>
                  <AlertCircle size={16} /> {breakoutError}
                </div>
              )}
            </section>

            {loadingBreakout && (
              <div className="bt-panel bt-loading-state">
                <RefreshCw size={18} className="spin" />
                <span>Scanning technical price action across all imported stocks for VCP, 52W High, and RSI breakouts…</span>
              </div>
            )}

            {filteredSetups && !loadingBreakout && (
              <div className="breakout-grid">
                {filteredSetups.length === 0 ? (
                  <div className="bt-panel" style={{ gridColumn: "1 / -1", textAlign: "center", padding: "30px" }}>
                    <p style={{ color: "#64748b" }}>No setup candidates found matching the min conviction score of {minConviction}. Lower the score slider to view additional candidates.</p>
                  </div>
                ) : (
                  filteredSetups.map((setup) => (
                    <div key={`${setup.symbol}-${setup.setup_type}`} className="breakout-card">
                      <div className="breakout-card-head">
                        <div>
                          <strong>{setup.symbol}</strong>
                          <small>{setup.company_name}</small>
                        </div>
                        <span className={`breakout-badge ${setup.setup_type.includes("52W") ? "high-52w" : setup.setup_type.replaceAll(" ", "-").toLowerCase()}`}>
                          {setup.setup_type}
                        </span>
                      </div>

                      <div className="breakout-conviction-wrap">
                        <div className="breakout-conviction-head">
                          <span>Conviction Score</span>
                          <strong>{setup.conviction_score} / 100</strong>
                        </div>
                        <div className="breakout-score-bar">
                          <div
                            className="breakout-score-fill"
                            style={{ width: `${Math.min(100, Math.max(0, setup.conviction_score))}%` }}
                          />
                        </div>
                      </div>

                      <div className="breakout-stats-grid">
                        <div>
                          <span>Close</span>
                          <strong>₹{setup.close.toLocaleString("en-IN")}</strong>
                        </div>
                        <div>
                          <span>RVOL</span>
                          <strong className={setup.rvol >= 1.8 ? "text-pos" : ""}>{setup.rvol}x</strong>
                        </div>
                        <div>
                          <span>52W Dist</span>
                          <strong>{setup.dist_52w_high}%</strong>
                        </div>
                        <div>
                          <span>RSI (14)</span>
                          <strong>{setup.rsi_14}</strong>
                        </div>
                      </div>

                      <p className="breakout-desc">{setup.description}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
