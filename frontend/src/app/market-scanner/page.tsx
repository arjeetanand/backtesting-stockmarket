"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  BookmarkCheck,
  Database,
  Flame,
  Globe,
  HelpCircle,
  Info,
  Layers,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { getUnifiedComparisonList } from "@/lib/strategy-library";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
const UNIFIED_STRATEGY_OPTIONS = getUnifiedComparisonList();

type SectorItem = {
  sector: string;
  stock_count: number;
  avg_strategy_return: number;
  avg_buy_hold_return: number;
  avg_win_rate: number;
  avg_max_drawdown: number;
  outperforming_count: number;
};

type HeatmapMetric = "strategy" | "alpha" | "win_rate";

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

function lossPct(val: number | undefined, digits = 1): string {
  return Number.isFinite(val) ? `-${Math.abs(Number(val) * 100).toFixed(digits)}%` : "—";
}

function fmt(val: number | undefined, digits = 2): string {
  return Number.isFinite(val) ? Number(val).toFixed(digits) : "—";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sectorAlpha(item: SectorItem): number {
  return item.avg_strategy_return - item.avg_buy_hold_return;
}

function sectorResearchScore(item: SectorItem): number {
  const breadth = item.stock_count ? item.outperforming_count / item.stock_count : 0;
  const returnComponent = clamp(50 + item.avg_strategy_return * 220, 0, 100) * 0.35;
  const alphaComponent = clamp(50 + sectorAlpha(item) * 320, 0, 100) * 0.25;
  const breadthComponent = breadth * 100 * 0.25;
  const riskComponent = clamp(100 - item.avg_max_drawdown * 180, 0, 100) * 0.15;
  return Math.round(returnComponent + alphaComponent + breadthComponent + riskComponent);
}

function stockResearchScore(item: StockLeaderboardItem): number {
  const alpha = item.strategy_return - item.buy_hold_return;
  const returnComponent = clamp(50 + item.strategy_return * 180, 0, 100) * 0.35;
  const alphaComponent = clamp(50 + alpha * 260, 0, 100) * 0.25;
  const winComponent = item.win_rate * 100 * 0.2;
  const riskComponent = clamp(100 - item.max_drawdown * 180, 0, 100) * 0.2;
  return Math.round(returnComponent + alphaComponent + winComponent + riskComponent);
}

function heatmapValue(item: SectorItem, metric: HeatmapMetric): number {
  if (metric === "alpha") return sectorAlpha(item);
  if (metric === "win_rate") return item.avg_win_rate;
  return item.avg_strategy_return;
}

function heatmapTone(value: number, min: number, max: number): string {
  const midpoint = min < 0 && max > 0 ? 0 : (min + max) / 2;
  const span = Math.max(Math.abs(max - midpoint), Math.abs(min - midpoint), 0.0001);
  const intensity = clamp(Math.abs(value - midpoint) / span, 0, 1);
  const alpha = (0.1 + intensity * 0.28).toFixed(2);
  return value >= midpoint ? `rgba(16, 185, 129, ${alpha})` : `rgba(244, 63, 94, ${alpha})`;
}

function apiErrorMessage(error: unknown, timeoutMessage: string, fallback: string): string {
  if (error instanceof DOMException && error.name === "AbortError") return timeoutMessage;
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return "Local Backtrack API is unavailable. Start the backend on port 8000, then retry.";
  }
  return error instanceof Error ? error.message : fallback;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 60_000): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
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
  const [showGlossary, setShowGlossary] = useState(false);
  const [breakoutResult, setBreakoutResult] = useState<{
    total_candidates: number;
    setups: BreakoutSetup[];
  } | null>(null);
  const [loadingBreakout, setLoadingBreakout] = useState(false);
  const [breakoutError, setBreakoutError] = useState<string | null>(null);

  const [scannerTimeSec, setScannerTimeSec] = useState<number | null>(null);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetric>("strategy");

  const runUniverseScan = async () => {
    setLoadingScanner(true);
    setScannerError(null);
    const t0 = performance.now();
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/market-scanner/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ universe, strategy_type: strategyType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Failed to run market scanner.");
      setScannerResult(data);
      setSelectedSector(null);
      setScannerTimeSec(Number(((performance.now() - t0) / 1000).toFixed(1)));
    } catch (err) {
      setScannerError(apiErrorMessage(err, "The universe scan took too long. Try NIFTY 50 or a shorter local dataset.", "Error running scanner."));
    } finally {
      setLoadingScanner(false);
    }
  };

  const runBreakoutScan = async (convictionScore = minConviction) => {
    setLoadingBreakout(true);
    setBreakoutError(null);
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/breakout-scanner/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ min_conviction: Number(convictionScore), limit: 60 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Failed to scan breakout setups.");
      setBreakoutResult(data);
    } catch (err) {
      setBreakoutError(apiErrorMessage(err, "The breakout scan took too long. The scan is limited to the priority NSE universe; retry once the local cache is ready.", "Error scanning setups."));
    } finally {
      setLoadingBreakout(false);
    }
  };

  const [bookmarkingSym, setBookmarkingSym] = useState<string | null>(null);

  const addToWatchlist = async (setup: BreakoutSetup) => {
    setBookmarkingSym(setup.symbol);
    try {
      const res = await fetch(`${API_BASE_URL}/watchlist/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: setup.symbol,
          company_name: setup.company_name,
          setup_type: setup.setup_type,
          entry_price: setup.close,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Failed to add setup.");
      alert(`Bookmarked ${setup.symbol} to your Daily Watchlist!`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error adding to watchlist.");
    } finally {
      setBookmarkingSym(null);
    }
  };

  useEffect(() => {
    if (activeTab === "heatmap" && !scannerResult) {
      void runUniverseScan();
    } else if (activeTab === "breakout" && !breakoutResult) {
      void runBreakoutScan();
    }
  }, [activeTab]);

  const setupCounts = useMemo(() => {
    const list = breakoutResult?.setups ?? [];
    return {
      all: list.length,
      "52w": list.filter((item) => item.setup_type.includes("52W")).length,
      vcp: list.filter((item) => item.setup_type.includes("VCP")).length,
      sma: list.filter((item) => item.setup_type.includes("SMA")).length,
      rsi: list.filter((item) => item.setup_type.includes("RSI")).length,
    };
  }, [breakoutResult]);

  const filteredSetups = breakoutResult?.setups.filter((item) => {
    if (selectedSetupFilter === "all") return true;
    if (selectedSetupFilter === "52w") return item.setup_type.includes("52W");
    if (selectedSetupFilter === "vcp") return item.setup_type.includes("VCP");
    if (selectedSetupFilter === "sma") return item.setup_type.includes("SMA");
    if (selectedSetupFilter === "rsi") return item.setup_type.includes("RSI");
    return true;
  });

  const visibleLeaderboard = scannerResult?.leaderboard.slice(0, 6) ?? [];
  const heatmapSectors = scannerResult?.sector_heatmap ?? [];
  const heatmapValues = heatmapSectors.map((item) => heatmapValue(item, heatmapMetric));
  const heatmapMin = Math.min(...heatmapValues, 0);
  const heatmapMax = Math.max(...heatmapValues, 0);
  const maxSectorStockCount = Math.max(...heatmapSectors.map((item) => item.stock_count), 1);
  const selectedSectorItem = heatmapSectors.find((item) => item.sector === selectedSector) ?? null;
  const selectedSectorStocks = selectedSectorItem
    ? (scannerResult?.leaderboard ?? [])
      .filter((item) => item.sector === selectedSectorItem.sector)
      .sort((a, b) => stockResearchScore(b) - stockResearchScore(a) || b.strategy_return - a.strategy_return)
      .slice(0, 10)
    : [];
  const averageStrategyReturn = visibleLeaderboard.length
    ? visibleLeaderboard.reduce((sum, item) => sum + item.strategy_return, 0) / visibleLeaderboard.length
    : null;
  const averageBuyHoldReturn = visibleLeaderboard.length
    ? visibleLeaderboard.reduce((sum, item) => sum + item.buy_hold_return, 0) / visibleLeaderboard.length
    : null;
  const universeLabel = universe === "nifty50" ? "NIFTY 50" : universe === "nifty500" ? "NIFTY 500" : "All imported";

  return (
    <div className="backtrack-page bt-scanner-page">
      <TopBar />
      <div className="backtrack-content bt-stack market-scanner-page">
        {/* Heading Header */}
        <section className="bt-heading-row bt-scanner-heading">
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
        <div className="scanner-tab-bar bt-scanner-tabs">
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
            <section className="scanner-reference-layout" aria-label="Market scanner workspace">
              <aside className="bt-panel scanner-filter-rail">
                <div className="scanner-rail-heading">
                  <span className="bt-eyebrow">TECHNICAL CRITERIA</span>
                  <h2>Market filters</h2>
                  <p>Run the same local NSE cache through a focused universe and strategy.</p>
                </div>

                <label className="scanner-rail-field">
                  <span>Target universe</span>
                  <select className="bt-field-input" value={universe} onChange={(event) => setUniverse(event.target.value)}>
                    <option value="nifty50">NIFTY 50</option>
                    <option value="nifty500">NIFTY 500</option>
                    <option value="all">All imported stocks</option>
                  </select>
                </label>
                <label className="scanner-rail-field">
                  <span>Strategy template</span>
                  <select className="bt-field-input" value={strategyType} onChange={(event) => setStrategyType(event.target.value)}>
                    {UNIFIED_STRATEGY_OPTIONS.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.title}</option>)}
                  </select>
                </label>

                <div className="scanner-rail-rule">
                  <span>Evaluation scope</span>
                  <strong>{universeLabel}</strong>
                </div>
                <button type="button" className="bt-primary scanner-rail-run" onClick={() => void runUniverseScan()} disabled={loadingScanner}>
                  {loadingScanner ? <RefreshCw size={13} className="spin" /> : <Play size={13} />}
                  {loadingScanner ? "Scanning…" : "Run scan"}
                </button>

                <div className="scanner-saved-scans">
                  <div className="scanner-saved-heading"><BookmarkCheck size={13} /><span>SAVED SCANS</span></div>
                  <button type="button" onClick={() => { setUniverse("nifty50"); setStrategyType("sma_crossover"); }}>
                    <span className="scanner-saved-check">{universe === "nifty50" && strategyType === "sma_crossover" ? "✓" : ""}</span>
                    <span><strong>Bluechip crossover</strong><small>NIFTY 50 · SMA</small></span>
                  </button>
                  <button type="button" onClick={() => { setUniverse("nifty500"); setStrategyType("rsi_mean_reversion"); }}>
                    <span className="scanner-saved-check">{universe === "nifty500" && strategyType === "rsi_mean_reversion" ? "✓" : ""}</span>
                    <span><strong>Mean reversion</strong><small>NIFTY 500 · RSI</small></span>
                  </button>
                  <button type="button" onClick={() => { setUniverse("all"); setStrategyType("donchian_breakout"); }}>
                    <span className="scanner-saved-check">{universe === "all" && strategyType === "donchian_breakout" ? "✓" : ""}</span>
                    <span><strong>Breakout momentum</strong><small>Imported · 52W high</small></span>
                  </button>
                </div>

                <div className="scanner-rail-source"><ShieldCheck size={13} /><span>Official NSE history<br />from the local cache</span></div>
              </aside>

              <div className="scanner-results-workspace">
                <div className="scanner-reference-kpis" aria-label="Scanner summary">
                  <div className="scanner-reference-kpi"><span>MATCHING RESULTS</span><strong>{scannerResult?.total_scanned?.toLocaleString("en-IN") ?? "—"}</strong><small>{universeLabel} symbols scanned</small></div>
                  <div className="scanner-reference-kpi is-positive"><span>AVG STRATEGY RETURN</span><strong>{pct(averageStrategyReturn ?? undefined)}</strong><small>top returned instruments</small></div>
                  <div className="scanner-reference-kpi"><span>SCANNED SECTORS</span><strong>{scannerResult?.sectors_count?.toLocaleString("en-IN") ?? "—"}</strong><small>groups in local cache</small></div>
                  <div className="scanner-reference-kpi"><span>SCAN TIME</span><strong>{scannerTimeSec ? `${scannerTimeSec}s` : "—"}</strong><small>vectorized local run</small></div>
                </div>

                {scannerError && (
                  <div className="bt-alert-error scanner-reference-alert" role="alert"><AlertCircle size={15} /> {scannerError}</div>
                )}

                {loadingScanner && (
                  <div className="bt-panel scanner-reference-empty"><RefreshCw size={18} className="spin" /><strong>Evaluating the selected universe…</strong><span>Grouping strategy performance from official NSE history.</span></div>
                )}

                {!loadingScanner && scannerResult?.total_scanned === 0 && (
                  <div className="bt-panel scanner-reference-empty"><Database size={21} /><strong>No imported symbols match this scan</strong><span>Import daily NSE archives before running the Market Scanner.</span><Link href="/data" className="bt-secondary-btn"><Database size={13} /> Manage stock data</Link></div>
                )}

                {!loadingScanner && scannerResult && scannerResult.total_scanned > 0 && (
                  <>
                    <section className="scanner-heatmap-surface" aria-labelledby="sector-heatmap-title">
                      <div className="scanner-heatmap-head">
                        <div>
                          <span className="bt-eyebrow">SECTOR ROTATION MAP</span>
                          <h2 id="sector-heatmap-title">Where the scan is finding strength</h2>
                          <p>Tile area shows how many scanned stocks represent the sector. Color shows the selected metric. Select a tile to rank its stocks.</p>
                        </div>
                        <label className="scanner-heatmap-select">
                          <span>Color by</span>
                          <select className="bt-field-input" value={heatmapMetric} onChange={(event) => setHeatmapMetric(event.target.value as HeatmapMetric)}>
                            <option value="strategy">Strategy return</option>
                            <option value="alpha">Outperformance vs B&amp;H</option>
                            <option value="win_rate">Win rate</option>
                          </select>
                        </label>
                      </div>

                      <div className="scanner-heatmap-legend" aria-label="Heatmap legend">
                        <span>Weaker</span><i className="is-negative" /><i className="is-neutral" /><i className="is-positive" /><span>Stronger</span>
                        <small>{heatmapMetric === "alpha" ? "sector strategy return minus buy & hold" : heatmapMetric === "win_rate" ? "average share of profitable trades" : "average strategy return"}</small>
                      </div>

                      <div className="scanner-sector-treemap" role="list" aria-label="Sector performance heatmap">
                        {heatmapSectors.map((sector) => {
                          const value = heatmapValue(sector, heatmapMetric);
                          const span = clamp(Math.ceil((sector.stock_count / maxSectorStockCount) * 4), 1, 4);
                          const rowSpan = clamp(Math.ceil((sector.stock_count / maxSectorStockCount) * 2), 1, 2);
                          const isSelected = selectedSector === sector.sector;
                          return (
                            <button
                              type="button"
                              key={sector.sector}
                              className={`scanner-sector-tile ${isSelected ? "is-selected" : ""}`}
                              style={{ gridColumn: `span ${span}`, gridRow: `span ${rowSpan}`, background: heatmapTone(value, heatmapMin, heatmapMax) }}
                              onClick={() => setSelectedSector(sector.sector)}
                              aria-pressed={isSelected}
                              aria-label={`${sector.sector}: ${pct(value)} ${heatmapMetric.replace("_", " ")}, ${sector.stock_count} stocks. Select to inspect.`}
                            >
                              <span className="scanner-sector-tile-top"><strong>{sector.sector}</strong><em>{sector.stock_count} stocks</em></span>
                              <span className="scanner-sector-tile-value">{pct(value)}</span>
                              <span className="scanner-sector-tile-bottom"><span>{sector.outperforming_count}/{sector.stock_count} beat B&amp;H</span><span>Score {sectorResearchScore(sector)}</span></span>
                            </button>
                          );
                        })}
                      </div>

                      {selectedSectorItem ? (
                        <div className="scanner-sector-detail" aria-live="polite">
                          <div className="scanner-sector-detail-head">
                            <div>
                              <span className="bt-eyebrow">SELECTED SECTOR</span>
                              <h3>{selectedSectorItem.sector}</h3>
                              <p>{selectedSectorItem.stock_count} stocks scanned · {selectedSectorItem.outperforming_count} outperforming buy &amp; hold · derived score {sectorResearchScore(selectedSectorItem)}/100</p>
                            </div>
                            <div className="scanner-sector-detail-stats"><span>Strategy <b>{pct(selectedSectorItem.avg_strategy_return)}</b></span><span>Alpha <b>{pct(sectorAlpha(selectedSectorItem))}</b></span><span>Win rate <b>{pct(selectedSectorItem.avg_win_rate)}</b></span><span>Drawdown <b className="text-neg">{lossPct(selectedSectorItem.avg_max_drawdown)}</b></span></div>
                          </div>
                          <div className="scanner-sector-stock-list-heading"><span>TOP STOCKS BY RESEARCH SCORE</span><small>Return, alpha, win rate and drawdown are all visible before you open a deeper test.</small></div>
                          <div className="scanner-sector-stock-list">
                            {selectedSectorStocks.map((item, index) => (
                              <div className="scanner-sector-stock-row" key={item.symbol}>
                                <span className="scanner-sector-rank">{String(index + 1).padStart(2, "0")}</span>
                                <div className="scanner-sector-stock-name"><strong>{item.symbol}</strong><small>{item.company_name}</small></div>
                                <span className="scanner-score-badge">{stockResearchScore(item)}<small>score</small></span>
                                <span><small>Strategy</small><b className={item.strategy_return >= 0 ? "text-pos" : "text-neg"}>{pct(item.strategy_return)}</b></span>
                                <span><small>Alpha</small><b className={item.strategy_return >= item.buy_hold_return ? "text-pos" : "text-neg"}>{pct(item.strategy_return - item.buy_hold_return)}</b></span>
                                <span><small>Win rate</small><b>{pct(item.win_rate)}</b></span>
                                <span><small>Drawdown</small><b className="text-neg">{lossPct(item.max_drawdown)}</b></span>
                                <Link href={`/research?symbol=${encodeURIComponent(item.symbol)}&source=scanner`} className="scanner-sector-research-link">Research <span>↗</span></Link>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="scanner-sector-prompt">Select a sector tile to load its highest-scoring stocks and the evidence behind the score.</div>
                      )}
                    </section>

                    <div className="scanner-stock-grid">
                      {visibleLeaderboard.map((item) => {
                        const maxReturn = Math.max(Math.abs(item.strategy_return), Math.abs(item.buy_hold_return), 0.01);
                        return (
                          <article key={item.symbol} className="scanner-stock-card">
                            <div className="scanner-stock-head">
                              <div><strong>{item.symbol}</strong><small>{item.company_name}</small></div>
                              <span className={item.strategy_return >= item.buy_hold_return ? "text-pos" : "text-neg"}>{pct(item.strategy_return)}</span>
                            </div>
                            <div className="scanner-stock-sector">{item.sector} <span>·</span> {item.bars.toLocaleString("en-IN")} bars</div>
                            <div className="scanner-return-profile" aria-label={`${item.symbol} strategy and buy and hold returns`}>
                              <div><span>Strategy</span><i className={item.strategy_return < 0 ? "is-negative" : ""} style={{ width: `${Math.max(8, Math.min(100, Math.abs(item.strategy_return) / maxReturn * 100))}%` }} /><b>{pct(item.strategy_return)}</b></div>
                              <div><span>B&amp;H</span><i className={`${item.buy_hold_return < 0 ? "is-negative " : ""}is-muted`} style={{ width: `${Math.max(8, Math.min(100, Math.abs(item.buy_hold_return) / maxReturn * 100))}%` }} /><b>{pct(item.buy_hold_return)}</b></div>
                            </div>
                            <div className="scanner-stock-metrics"><span>Win rate <b>{pct(item.win_rate)}</b></span><span>Sharpe <b>{fmt(item.sharpe_ratio)}</b></span><span>Drawdown <b className="text-neg">{pct(item.max_drawdown)}</b></span></div>
                          </article>
                        );
                      })}
                    </div>
                    <div className="scanner-reference-footer"><span>Showing {visibleLeaderboard.length} of {scannerResult.leaderboard.length} instruments in the local leaderboard.</span><span>Avg B&amp;H: <strong>{pct(averageBuyHoldReturn ?? undefined)}</strong></span></div>
                  </>
                )}
              </div>
            </section>

            <div className="scanner-legacy-heatmap" aria-hidden="true">
            <section className="bt-panel scanner-control-panel bt-scanner-filter-panel">
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
                    {UNIFIED_STRATEGY_OPTIONS.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.title} · {strategy.parameters}</option>)}
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

            <section className="bt-scanner-kpis" aria-label="Scanner summary">
              <div className="bt-scanner-kpi"><span>Matches</span><strong>{scannerResult?.total_scanned?.toLocaleString("en-IN") ?? "—"}</strong><small>symbols scanned</small></div>
              <div className="bt-scanner-kpi is-positive"><span>Avg strategy gain</span><strong>{scannerResult?.sector_heatmap.length ? pct(scannerResult.sector_heatmap.reduce((sum, item) => sum + item.avg_strategy_return, 0) / scannerResult.sector_heatmap.length) : "—"}</strong><small>across sectors</small></div>
              <div className="bt-scanner-kpi"><span>Sector groups</span><strong>{scannerResult?.sectors_count?.toLocaleString("en-IN") ?? "—"}</strong><small>from local cache</small></div>
              <div className="bt-scanner-kpi"><span>Scan time</span><strong>{scannerTimeSec ? `${scannerTimeSec}s` : "—"}</strong><small>vectorized run</small></div>
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
                <section className="bt-panel bt-scanner-results">
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
                <section className="bt-panel bt-scanner-table-panel">
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
            </div>
          </>
        )}

        {/* Tab 2: Automated Breakout Scanner */}
        {activeTab === "breakout" && (
          <>
            <section className="bt-panel scanner-control-panel bt-scanner-filter-panel">
              <div className="bt-panel-head">
                <div>
                  <span className="bt-eyebrow">AUTOMATED BREAKOUT RECOGNITION</span>
                  <h2>Scan Recent History for High-Conviction Technical Setups</h2>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    type="button"
                    className="bt-secondary-btn"
                    onClick={() => setShowGlossary((prev) => !prev)}
                  >
                    <HelpCircle size={14} /> {showGlossary ? "Hide Indicator Guide" : "Indicator Guide"}
                  </button>
                  <button
                    type="button"
                    className="bt-secondary-btn"
                    onClick={() => void runBreakoutScan()}
                    disabled={loadingBreakout}
                  >
                    <RefreshCw size={14} className={loadingBreakout ? "spin" : ""} /> Rescan Setups
                  </button>
                </div>
              </div>

              <div className="breakout-filter-bar">
                <div className="breakout-chips">
                  <button
                    type="button"
                    className={`breakout-chip ${selectedSetupFilter === "all" ? "is-active" : ""}`}
                    onClick={() => setSelectedSetupFilter("all")}
                  >
                    All Setups ({setupCounts.all})
                  </button>
                  <button
                    type="button"
                    className={`breakout-chip ${selectedSetupFilter === "52w" ? "is-active" : ""}`}
                    onClick={() => setSelectedSetupFilter("52w")}
                  >
                    <Flame size={13} /> 52W High + RVOL ({setupCounts["52w"]})
                  </button>
                  <button
                    type="button"
                    className={`breakout-chip ${selectedSetupFilter === "vcp" ? "is-active" : ""}`}
                    onClick={() => setSelectedSetupFilter("vcp")}
                  >
                    <Layers size={13} /> VCP Contraction ({setupCounts.vcp})
                  </button>
                  <button
                    type="button"
                    className={`breakout-chip ${selectedSetupFilter === "sma" ? "is-active" : ""}`}
                    onClick={() => setSelectedSetupFilter("sma")}
                  >
                    <TrendingUp size={13} /> SMA Rebound ({setupCounts.sma})
                  </button>
                  <button
                    type="button"
                    className={`breakout-chip ${selectedSetupFilter === "rsi" ? "is-active" : ""}`}
                    onClick={() => setSelectedSetupFilter("rsi")}
                  >
                    <Sparkles size={13} /> RSI Momentum ({setupCounts.rsi})
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
                    onMouseUp={(e) => void runBreakoutScan(Number((e.target as HTMLInputElement).value))}
                    onTouchEnd={(e) => void runBreakoutScan(Number((e.target as HTMLInputElement).value))}
                  />
                </div>
              </div>

              {breakoutError && (
                <div className="bt-alert-error" role="alert" style={{ marginTop: "12px" }}>
                  <AlertCircle size={16} /> {breakoutError}
                </div>
              )}
            </section>

            {/* Indicator Meaning & Glossary Panel */}
            {showGlossary && (
              <section className="bt-panel" style={{ background: "#f8fafc", borderLeft: "4px solid #6366f1", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", color: "#1e1b4b" }}>
                  <Info size={18} color="#4338ca" />
                  <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700 }}>Technical Indicators &amp; Metrics Cheat Sheet</h3>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px", fontSize: "12px", lineHeight: "1.5" }}>
                  <div style={{ background: "#fff", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                    <strong style={{ color: "#4338ca", display: "block" }}>RVOL (Relative Volume)</strong>
                    <span>Current volume divided by the 20-day average volume. An RVOL of <strong>2.0x</strong> means double the normal volume, signaling heavy institutional buying.</span>
                  </div>
                  <div style={{ background: "#fff", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                    <strong style={{ color: "#4338ca", display: "block" }}>52W Dist (Distance to 52-Week High)</strong>
                    <span>Percentage gap to the 52-week peak price. Stocks within <strong>0% – 4%</strong> are testing fresh annual breakouts above overhead resistance.</span>
                  </div>
                  <div style={{ background: "#fff", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                    <strong style={{ color: "#4338ca", display: "block" }}>RSI 14 (Relative Strength Index)</strong>
                    <span>Momentum score from 0 to 100 over 14 bars. Values above <strong>60</strong> signal strong bullish momentum expansion.</span>
                  </div>
                  <div style={{ background: "#fff", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                    <strong style={{ color: "#4338ca", display: "block" }}>20D Range &amp; VCP</strong>
                    <span>Width between 20-day high and low. Tight consolidation ($\le 11\%$) above 20-day SMA indicates supply absorption prior to an explosive breakout move.</span>
                  </div>
                  <div style={{ background: "#fff", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                    <strong style={{ color: "#4338ca", display: "block" }}>Conviction Score</strong>
                    <span>Algorithmic rating (0–100) combining volume surge, price tightness, and momentum. Scores above <strong>70</strong> represent high-quality setups.</span>
                  </div>
                  <div style={{ background: "#fff", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                    <strong style={{ color: "#4338ca", display: "block" }}>SMA Rebound (20D / 50D)</strong>
                    <span>Price reclaiming its 20-day or 50-day Simple Moving Average from below with strong volume confirmation, signaling a trend resumption.</span>
                  </div>
                </div>
              </section>
            )}

            {loadingBreakout && (
              <div className="bt-panel bt-loading-state">
                <RefreshCw size={18} className="spin" />
                <span>Scanning the priority NSE universe for VCP, 52W High, and RSI breakouts…</span>
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
                          <span title="Algorithmic setup quality score (0-100) based on volume, price tightness, and technical breakout structure">Conviction Score</span>
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
                          <span title="Latest closing price from official daily market data">Close</span>
                          <strong>₹{setup.close.toLocaleString("en-IN")}</strong>
                        </div>
                        <div>
                          <span title="Relative Volume: Current day volume divided by 20-day average volume (e.g. 1.8x = 180% of normal volume)">RVOL</span>
                          <strong className={setup.rvol >= 1.8 ? "text-pos" : ""}>{setup.rvol}x</strong>
                        </div>
                        <div>
                          <span title="Percentage gap to the stock's highest high over the last 52 weeks (380 days)">52W Dist</span>
                          <strong>{setup.dist_52w_high}%</strong>
                        </div>
                        <div>
                          <span title="14-day Relative Strength Index: Momentum oscillator rating (0-100). Above 60 indicates bullish momentum">RSI (14)</span>
                          <strong>{setup.rsi_14}</strong>
                        </div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", borderTop: "1px solid #f1f5f9", paddingTop: "8px", marginTop: "4px" }}>
                        <p className="breakout-desc" style={{ borderTop: 0, paddingTop: 0, marginTop: 0, flex: 1 }}>{setup.description}</p>
                        <button
                          type="button"
                          className="bt-secondary-btn"
                          style={{ padding: "4px 8px", fontSize: "10px", gap: "4px", flexShrink: 0 }}
                          onClick={() => void addToWatchlist(setup)}
                          disabled={bookmarkingSym === setup.symbol}
                        >
                          <BookmarkCheck size={12} />
                          {bookmarkingSym === setup.symbol ? "Bookmarking…" : "Bookmark Setup"}
                        </button>
                      </div>
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
