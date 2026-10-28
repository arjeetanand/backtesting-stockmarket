"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  BookmarkCheck,
  Check,
  Clock3,
  Database,
  Flame,
  Globe,
  GitBranch,
  HelpCircle,
  Info,
  Layers,
  ListChecks,
  Pencil,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import MarketFlowBoard from "@/components/scanner/MarketFlowBoard";
import { getUnifiedComparisonList } from "@/lib/strategy-library";
import {
  getScannerCatalog,
  normalizeScannerCatalog,
  runBreakoutScan as fetchBreakoutScan,
  runHistoricalScan,
  runStructureZoneScan,
  runScreenerScan,
  scannerApiErrorMessage,
  type BreakoutScannerResponse,
  type BreakoutSetup,
  type ScannerFormula,
  type ScannerUniverse,
  type StructureZoneScanResponse,
  type ScreenerRunResponse,
} from "@/lib/scanner-api";
import {
  addScannerRecentRun,
  createScannerId,
  readScannerStorage,
  removeScannerPreset,
  upsertScannerPreset,
  writeScannerStorage,
  type ScannerPreset,
  type ScannerStorageState,
} from "@/lib/scanner-storage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
const UNIFIED_STRATEGY_OPTIONS = getUnifiedComparisonList();

const FALLBACK_CATALOG: ScannerFormula[] = normalizeScannerCatalog({
  formulas: UNIFIED_STRATEGY_OPTIONS.map((strategy) => ({
    id: strategy.id,
    name: strategy.title,
    category: strategy.family,
    description: strategy.description,
    required_fields: [],
    timeframe: "1day",
    status: "legacy historical strategy",
    strategy_type: strategy.id,
  })),
}).formulas;

const FALLBACK_UNIVERSES: ScannerUniverse[] = [
  { id: "nifty50", label: "NIFTY 50", description: "Configured NIFTY 50 constituents.", constituentCount: 50, asOf: null },
  { id: "sensex", label: "Sensex", description: "Configured BSE Sensex constituents when available locally.", constituentCount: 30, asOf: null },
  { id: "banknifty", label: "Bank Nifty", description: "Configured Bank Nifty constituents when available locally.", constituentCount: 12, asOf: null },
  { id: "nifty500", label: "NIFTY 500", description: "Configured NIFTY 500 constituents.", constituentCount: 500, asOf: null },
  { id: "all", label: "All imported stocks", description: "All locally imported symbols.", constituentCount: null, asOf: null },
];

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
type LeaderboardSort = "strategy_return" | "alpha" | "win_rate" | "drawdown" | "sharpe";

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

function pct(val: number | undefined, digits = 1): string {
  return Number.isFinite(val) ? `${(Number(val) * 100).toFixed(digits)}%` : "—";
}

function lossPct(val: number | undefined, digits = 1): string {
  return Number.isFinite(val) ? `-${Math.abs(Number(val) * 100).toFixed(digits)}%` : "—";
}

function fmt(val: number | undefined, digits = 2): string {
  return Number.isFinite(val) ? Number(val).toFixed(digits) : "—";
}

function rupees(val: number): string {
  return `₹${val.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function price(value: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
}

function dayLabel(value: string | null): string {
  if (!value) return "Unavailable";
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
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
  const alpha = (0.18 + intensity * 0.42).toFixed(2);
  return value >= midpoint ? `rgba(16, 185, 129, ${alpha})` : `rgba(244, 63, 94, ${alpha})`;
}

export default function MarketScannerPage() {
  const [activeTab, setActiveTab] = useState<"heatmap" | "breakout" | "structure" | "liquidity">("breakout");
  const today = new Date().toISOString().slice(0, 10);
  const defaultScanStart = new Date(new Date(`${today}T00:00:00`).setFullYear(new Date(`${today}T00:00:00`).getFullYear() - 2)).toISOString().slice(0, 10);

  // Screener state
  const [universe, setUniverse] = useState("nifty50");
  const [formulaId, setFormulaId] = useState("sma_golden_cross");
  const [formulaParameters, setFormulaParameters] = useState<Record<string, string | number | boolean>>({});
  const [strategyType, setStrategyType] = useState("sma_crossover");
  const [scanStart, setScanStart] = useState(defaultScanStart);
  const [scanEnd, setScanEnd] = useState(today);
  const [scannerCatalog, setScannerCatalog] = useState<{ formulas: ScannerFormula[]; universes: ScannerUniverse[] }>({ formulas: FALLBACK_CATALOG, universes: FALLBACK_UNIVERSES });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [screenerResult, setScreenerResult] = useState<ScreenerRunResponse | null>(null);
  const [loadingScreener, setLoadingScreener] = useState(false);
  const [screenerError, setScreenerError] = useState<string | null>(null);
  const [lastScreenerConfigKey, setLastScreenerConfigKey] = useState<string | null>(null);
  const [storageState, setStorageState] = useState<ScannerStorageState>(() => typeof window === "undefined" ? { version: 1, presets: [], recentRuns: [] } : readScannerStorage(window.localStorage));
  const [presetName, setPresetName] = useState("");
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingPresetName, setEditingPresetName] = useState("");
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
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
  const [breakoutResult, setBreakoutResult] = useState<BreakoutScannerResponse | null>(null);
  const [loadingBreakout, setLoadingBreakout] = useState(false);
  const [breakoutError, setBreakoutError] = useState<string | null>(null);

  const [structureResult, setStructureResult] = useState<StructureZoneScanResponse | null>(null);
  const [loadingStructure, setLoadingStructure] = useState(false);
  const [structureError, setStructureError] = useState<string | null>(null);

  const [scannerTimeSec, setScannerTimeSec] = useState<number | null>(null);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetric>("strategy");
  const [leaderboardQuery, setLeaderboardQuery] = useState("");
  const [leaderboardSort, setLeaderboardSort] = useState<LeaderboardSort>("strategy_return");
  const [showAllStocks, setShowAllStocks] = useState(false);

  const activeFormula = scannerCatalog.formulas.find((formula) => formula.id === formulaId) ?? FALLBACK_CATALOG[0];
  const scannerConfigKey = useMemo(() => JSON.stringify({ universe, formulaId, formulaParameters, scanStart, scanEnd }), [formulaId, formulaParameters, scanEnd, scanStart, universe]);
  const screenerIsStale = Boolean(screenerResult && scannerConfigKey !== lastScreenerConfigKey);
  const availableUniverses = scannerCatalog.universes.length ? scannerCatalog.universes : FALLBACK_UNIVERSES;

  useEffect(() => {
    let cancelled = false;
    void getScannerCatalog().then((catalog) => {
      if (cancelled) return;
      const nextCatalog = { formulas: catalog.formulas.length ? catalog.formulas : FALLBACK_CATALOG, universes: catalog.universes.length ? catalog.universes : FALLBACK_UNIVERSES };
      setScannerCatalog(nextCatalog);
      setFormulaId((current) => nextCatalog.formulas.some((formula) => formula.id === current) ? current : nextCatalog.formulas[0]?.id ?? current);
      if (catalog.formulas.length && !catalog.formulas.some((formula) => formula.id === formulaId)) {
        setFormulaId(catalog.formulas[0].id);
        setStrategyType(catalog.formulas[0].strategyType ?? catalog.formulas[0].id);
      }
      setCatalogError(null);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setCatalogError(scannerApiErrorMessage(error, "The screener catalog timed out. The compatibility catalog is available.", "Could not load the screener catalog."));
    }).finally(() => {
      if (!cancelled) setCatalogLoading(false);
    });
    return () => { cancelled = true; };
    // Catalog loading is an initialization request; formula changes must not refetch it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistScannerState = (nextState: ScannerStorageState) => {
    setStorageState(nextState);
    writeScannerStorage(nextState, window.localStorage);
  };

  const loadScannerConfig = (config: Pick<ScannerPreset, "universe" | "formulaId" | "parameters" | "start" | "end">) => {
    setUniverse(config.universe);
    setFormulaId(config.formulaId);
    setFormulaParameters(config.parameters);
    setStrategyType(scannerCatalog.formulas.find((formula) => formula.id === config.formulaId)?.strategyType ?? config.formulaId);
    setScanStart(config.start);
    setScanEnd(config.end);
    setStorageMessage("Configuration loaded. Press Run scan when you are ready.");
  };

  const saveCurrentPreset = () => {
    const name = presetName.trim();
    if (!name) {
      setStorageMessage("Give this saved scan a name first.");
      return;
    }
    const now = new Date().toISOString();
    const nextState = upsertScannerPreset(storageState, { id: createScannerId("preset"), name, universe, formulaId, parameters: formulaParameters, start: scanStart, end: scanEnd, updatedAt: now });
    persistScannerState(nextState);
    setPresetName("");
    setStorageMessage(`Saved scan “${name}”. Loading it will not run a scan automatically.`);
  };

  const renameSavedPreset = (preset: ScannerPreset) => {
    const name = editingPresetName.trim();
    if (!name) return;
    persistScannerState(upsertScannerPreset(storageState, { ...preset, name, updatedAt: new Date().toISOString() }));
    setEditingPresetId(null);
    setEditingPresetName("");
  };

  const rememberRecentRun = (result: ScreenerRunResponse) => {
    const nextState = addScannerRecentRun(storageState, { id: createScannerId("run"), universe: result.universe, formulaId: result.formulaId, parameters: formulaParameters, matchCount: result.totalMatches, dataAsOf: result.dataAsOf, coverageStatus: result.coverageStatus, start: scanStart, end: scanEnd, createdAt: new Date().toISOString() });
    persistScannerState(nextState);
  };

  const runScreener = async () => {
    const requestedConfigKey = scannerConfigKey;
    const t0 = performance.now();
    setLoadingScreener(true);
    setScreenerError(null);
    setStorageMessage(null);
    try {
      const result = await runScreenerScan({ universe, formulaId, parameters: formulaParameters, start: scanStart, end: scanEnd });
      setScreenerResult(result);
      setLastScreenerConfigKey(requestedConfigKey);
      setScannerTimeSec(Number(((performance.now() - t0) / 1000).toFixed(1)));
      rememberRecentRun(result);
      setSelectedSector(null);
    } catch (err) {
      setScreenerError(scannerApiErrorMessage(err, "The screener timed out. Try a smaller universe or check the local cache.", "Error running the selected screener formula."));
    } finally {
      setLoadingScreener(false);
    }
  };

  const runHistoricalResearchScan = async () => {
    setLoadingScanner(true);
    setScannerError(null);
    const t0 = performance.now();
    try {
      const data = await runHistoricalScan({ universe, strategyType, start: scanStart, end: scanEnd });
      setScannerResult(data);
      setSelectedSector(null);
      setScannerTimeSec(Number(((performance.now() - t0) / 1000).toFixed(1)));
    } catch (err) {
      setScannerError(scannerApiErrorMessage(err, "The historical scan took too long. Try NIFTY 50 or a shorter local dataset.", "Error running historical scanner."));
    } finally {
      setLoadingScanner(false);
    }
  };

  const runStructureScan = async () => {
    setLoadingStructure(true);
    setStructureError(null);
    try {
      setStructureResult(await runStructureZoneScan(universe));
    } catch (err) {
      setStructureError(scannerApiErrorMessage(err, "The daily structure scan timed out. Try a smaller configured universe or check local NSE history.", "Error scanning daily structure zones."));
    } finally {
      setLoadingStructure(false);
    }
  };

  const runBreakoutScan = async (convictionScore = minConviction) => {
    setLoadingBreakout(true);
    setBreakoutError(null);
    try {
      const data = await fetchBreakoutScan({ minConviction: Number(convictionScore) });
      setBreakoutResult(data);
    } catch (err) {
      setBreakoutError(scannerApiErrorMessage(err, "The morning scan took too long. Retry once the local NSE cache is ready.", "Error building the morning plan."));
    } finally {
      setLoadingBreakout(false);
    }
  };

  const [bookmarkingSym, setBookmarkingSym] = useState<string | null>(null);
  const [bookmarkMessage, setBookmarkMessage] = useState<string | null>(null);
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);

  const addToWatchlist = async (setup: BreakoutSetup) => {
    if (!setup.morning_plan) {
      setBookmarkError(`${setup.symbol} has no usable prior-session range for a conditional plan.`);
      return;
    }
    setBookmarkingSym(setup.symbol);
    setBookmarkMessage(null);
    setBookmarkError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/watchlist/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: setup.symbol,
          company_name: setup.company_name,
          setup_type: setup.setup_type,
          entry_price: setup.morning_plan.entry_trigger,
          target_price: setup.morning_plan.target_2r,
          stop_loss_price: setup.morning_plan.stop_level,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Failed to add setup.");
      setBookmarkMessage(`${setup.symbol} plan saved with its prior-high trigger, prior-low stop, and 2R target. The watchlist uses local daily bars and cannot confirm an intraday fill.`);
    } catch (err) {
      setBookmarkError(err instanceof Error ? err.message : "Error adding to watchlist.");
    } finally {
      setBookmarkingSym(null);
    }
  };

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

  const breakoutSummary = useMemo(() => {
    const setups = breakoutResult?.setups ?? [];
    return {
      candidates: breakoutResult?.total_candidates ?? 0,
      uniqueStocks: new Set(setups.map((item) => item.symbol)).size,
      highConviction: setups.filter((item) => item.conviction_score >= 70).length,
      sectors: new Set(setups.map((item) => item.sector)).size,
      averageRvol: setups.length ? setups.reduce((sum, item) => sum + item.rvol, 0) / setups.length : 0,
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

  const filteredLeaderboard = useMemo(() => {
    const query = leaderboardQuery.trim().toLowerCase();
    const rows = (scannerResult?.leaderboard ?? []).filter((item) => !query || `${item.symbol} ${item.company_name} ${item.sector}`.toLowerCase().includes(query));
    return [...rows].sort((a, b) => {
      if (leaderboardSort === "alpha") return (b.strategy_return - b.buy_hold_return) - (a.strategy_return - a.buy_hold_return);
      if (leaderboardSort === "win_rate") return b.win_rate - a.win_rate;
      if (leaderboardSort === "drawdown") return a.max_drawdown - b.max_drawdown;
      if (leaderboardSort === "sharpe") return b.sharpe_ratio - a.sharpe_ratio;
      return b.strategy_return - a.strategy_return;
    });
  }, [leaderboardQuery, leaderboardSort, scannerResult?.leaderboard]);
  const visibleLeaderboard = showAllStocks ? filteredLeaderboard : filteredLeaderboard.slice(0, 12);
  const heatmapSectors = useMemo(() => scannerResult?.sector_heatmap ?? [], [scannerResult?.sector_heatmap]);
  const heatmapValues = heatmapSectors.map((item) => heatmapValue(item, heatmapMetric));
  const heatmapMin = Math.min(...heatmapValues, 0);
  const heatmapMax = Math.max(...heatmapValues, 0);
  const heatmapRows = useMemo(() => {
    const rows: SectorItem[][] = [[], [], []];
    const totals = [0, 0, 0];
    [...heatmapSectors].sort((a, b) => b.stock_count - a.stock_count).forEach((sector) => {
      const rowIndex = totals.indexOf(Math.min(...totals));
      rows[rowIndex].push(sector);
      totals[rowIndex] += sector.stock_count;
    });
    return rows.filter((row) => row.length > 0);
  }, [heatmapSectors]);
  const selectedSectorItem = heatmapSectors.find((item) => item.sector === selectedSector) ?? null;
  const selectedSectorStocks = selectedSectorItem
    ? (scannerResult?.leaderboard ?? [])
      .filter((item) => item.sector === selectedSectorItem.sector)
      .sort((a, b) => stockResearchScore(b) - stockResearchScore(a) || b.strategy_return - a.strategy_return)
      .slice(0, 10)
    : [];
  const averageBuyHoldReturn = visibleLeaderboard.length
    ? visibleLeaderboard.reduce((sum, item) => sum + item.buy_hold_return, 0) / visibleLeaderboard.length
    : null;
  const universeLabel = availableUniverses.find((item) => item.id === universe)?.label ?? (universe === "nifty500" ? "NIFTY 500" : "All imported");

  const exportLeaderboard = () => {
    if (!scannerResult?.leaderboard.length) return;
    const headers = ["Symbol", "Company", "Sector", "Bars", "Strategy Return", "Buy & Hold", "Alpha", "Win Rate", "Max Drawdown", "Sharpe", "Trades"];
    const rows = filteredLeaderboard.map((item) => [item.symbol, item.company_name, item.sector, item.bars, item.strategy_return, item.buy_hold_return, item.strategy_return - item.buy_hold_return, item.win_rate, item.max_drawdown, item.sharpe_ratio, item.trade_count]);
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `backtrack-${universe}-${strategyType}-${scanStart}-to-${scanEnd}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="backtrack-page bt-scanner-page">
      <TopBar />
      <div className="backtrack-content bt-stack market-scanner-page">
        {/* Heading Header */}
        <section className="bt-heading-row bt-scanner-heading">
          <div>
            <div className="bt-kicker">
              <span className="live-dot" /> LOCAL NSE · MORNING RESEARCH
            </div>
            <h1>Market Scanner &amp; Morning Plan</h1>
            <p>
              Review ranked technical candidates and conditional price levels from the latest available local NSE daily candles.
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
            <Zap size={16} /> Morning Plan
            {breakoutResult && (
              <span className="scanner-tab-badge">{breakoutResult.total_candidates}</span>
            )}
          </button>
          <button
            type="button"
            className={`scanner-tab-btn ${activeTab === "liquidity" ? "is-active" : ""}`}
            onClick={() => setActiveTab("liquidity")}
          >
            <GitBranch size={16} /> Liquidity flow
          </button>
          <button
            type="button"
            className={`scanner-tab-btn ${activeTab === "structure" ? "is-active" : ""}`}
            onClick={() => setActiveTab("structure")}
          >
            <Layers size={16} /> Daily structure zones
            {structureResult && <span className="scanner-tab-badge">{structureResult.total_zones}</span>}
          </button>
        </div>

        {activeTab === "liquidity" && <MarketFlowBoard />}

        {/* Tab 1: Universe Screener & Sector Heatmap */}
        {activeTab === "heatmap" && (
          <>
            <section className="scanner-reference-layout" aria-label="Market scanner workspace">
              <aside className="bt-panel scanner-filter-rail">
                <div className="scanner-rail-heading">
                  <span className="bt-eyebrow">SCREEN NOW</span>
                  <h2>Choose a formula</h2>
                  <p>Build a local NSE screener configuration, then run it explicitly when you are ready.</p>
                </div>

                <label className="scanner-rail-field">
                  <span>Formula library</span>
                  <select className="bt-field-input" value={formulaId} onChange={(event) => { setFormulaId(event.target.value); setFormulaParameters({}); }}>
                    {scannerCatalog.formulas.map((formula) => <option key={formula.id} value={formula.id}>{formula.name}</option>)}
                  </select>
                </label>
                <label className="scanner-rail-field">
                  <span>Target universe</span>
                  <select className="bt-field-input" value={universe} onChange={(event) => setUniverse(event.target.value)}>
                    {availableUniverses.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>

                {activeFormula && (
                  <div className="scanner-formula-summary" role="status">
                    <strong>{activeFormula.category}</strong>
                    <span>{activeFormula.description}</span>
                    <small>{activeFormula.timeframe} · {activeFormula.status}</small>
                  </div>
                )}

                {activeFormula?.parameters.map((parameter) => (
                  <label className="scanner-rail-field" key={parameter.id}>
                    <span>{parameter.label}</span>
                    {parameter.options?.length ? (
                      <select className="bt-field-input" value={String(formulaParameters[parameter.id] ?? parameter.default ?? "")} onChange={(event) => setFormulaParameters((current) => ({ ...current, [parameter.id]: event.target.value }))}>
                        {parameter.options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
                      </select>
                    ) : (
                      <input className="bt-field-input" type={parameter.type === "number" ? "number" : "text"} value={String(formulaParameters[parameter.id] ?? parameter.default ?? "")} min={parameter.min} max={parameter.max} onChange={(event) => setFormulaParameters((current) => ({ ...current, [parameter.id]: parameter.type === "number" ? Number(event.target.value) : event.target.value }))} />
                    )}
                  </label>
                ))}

                <div className="scanner-rail-dates">
                  <label className="scanner-rail-field"><span>History from</span><input className="bt-field-input" type="date" value={scanStart} max={scanEnd} onChange={(event) => setScanStart(event.target.value)} /></label>
                  <label className="scanner-rail-field"><span>History to</span><input className="bt-field-input" type="date" value={scanEnd} min={scanStart} max={today} onChange={(event) => setScanEnd(event.target.value)} /></label>
                </div>

                <div className="scanner-rail-rule">
                  <span>Configuration status</span>
                  <strong>{screenerIsStale ? "Changed · rerun required" : screenerResult ? "Results match filters" : "Ready to run"}</strong>
                </div>
                <button type="button" className="bt-primary scanner-rail-run" onClick={() => void runScreener()} disabled={loadingScreener}>
                  {loadingScreener ? <RefreshCw size={13} className="spin" /> : <Play size={13} />}
                  {loadingScreener ? "Running…" : "Run scan"}
                </button>

                <div className="scanner-rail-source"><ShieldCheck size={13} /><span>Formula catalog from the API<br />official NSE daily cache only</span></div>

                <div className="scanner-saved-scans">
                  <div className="scanner-saved-heading"><ListChecks size={13} /><span>FORMULA LIBRARY</span></div>
                  <small className="scanner-storage-note">{catalogLoading ? "Loading catalog…" : catalogError ? "Compatibility catalog · API unavailable" : `${scannerCatalog.formulas.length} formulas available`}</small>
                  <small className="scanner-storage-note">{activeFormula?.requiredFields.length ? `Needs: ${activeFormula.requiredFields.join(", ")}` : "Technical fields are validated by the backend."}</small>
                </div>

                <div className="scanner-saved-scans">
                  <div className="scanner-saved-heading"><BookmarkCheck size={13} /><span>MY SAVED SCANS</span></div>
                  <div className="scanner-save-row">
                    <input className="bt-field-input" aria-label="Saved scan name" value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Name this configuration" />
                    <button type="button" className="bt-secondary-btn" onClick={saveCurrentPreset}><Save size={12} /> Save</button>
                  </div>
                  {storageMessage && <small className="scanner-storage-note" role="status">{storageMessage}</small>}
                  {storageState.presets.length === 0 ? <small className="scanner-storage-note">No saved scans yet. Save a configuration to reuse it later.</small> : storageState.presets.map((preset) => (
                    <div className="scanner-saved-item" key={preset.id}>
                      {editingPresetId === preset.id ? <input className="bt-field-input" aria-label={`Rename ${preset.name}`} value={editingPresetName} onChange={(event) => setEditingPresetName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") renameSavedPreset(preset); }} /> : <button type="button" className="scanner-saved-load" onClick={() => loadScannerConfig(preset)}><strong>{preset.name}</strong><small>{preset.universe} · {preset.formulaId}</small></button>}
                      {editingPresetId === preset.id ? <button type="button" className="scanner-icon-btn" aria-label={`Save new name for ${preset.name}`} onClick={() => renameSavedPreset(preset)}><Check size={12} /></button> : <button type="button" className="scanner-icon-btn" aria-label={`Rename ${preset.name}`} onClick={() => { setEditingPresetId(preset.id); setEditingPresetName(preset.name); }}><Pencil size={12} /></button>}
                      <button type="button" className="scanner-icon-btn" aria-label={`Delete ${preset.name}`} onClick={() => persistScannerState(removeScannerPreset(storageState, preset.id))}><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>

                <div className="scanner-saved-scans">
                  <div className="scanner-saved-heading"><Clock3 size={13} /><span>RECENT RUNS</span></div>
                  {storageState.recentRuns.length === 0 ? <small className="scanner-storage-note">Previous explicit runs will appear here.</small> : storageState.recentRuns.slice(0, 5).map((run) => (
                    <button type="button" className="scanner-saved-load" key={run.id} onClick={() => loadScannerConfig(run)}><strong>{run.formulaId} · {run.matchCount} matches</strong><small>{run.universe} · {run.dataAsOf ?? "data date unavailable"}</small></button>
                  ))}
                </div>
              </aside>

              <div className="scanner-results-workspace">
                <div className="scanner-reference-kpis" aria-label="Scanner summary">
                  <div className="scanner-reference-kpi"><span>MATCHING RESULTS</span><strong>{screenerResult?.totalMatches.toLocaleString("en-IN") ?? "—"}</strong><small>{universeLabel} formula matches</small></div>
                  <div className="scanner-reference-kpi is-positive"><span>DATA COVERAGE</span><strong>{screenerResult?.coverageStatus ?? "—"}</strong><small>{screenerResult ? `${screenerResult.availableSymbols} symbols available` : "shown after an explicit run"}</small></div>
                  <div className="scanner-reference-kpi"><span>DATA AS OF</span><strong>{screenerResult?.dataAsOf ?? "—"}</strong><small>latest local daily bar</small></div>
                  <div className="scanner-reference-kpi"><span>SCAN TIME</span><strong>{scannerTimeSec ? `${scannerTimeSec}s` : "—"}</strong><small>explicit local run</small></div>
                </div>

                {catalogError && <div className="bt-alert-warning scanner-reference-alert" role="status"><Info size={15} /> {catalogError} The compatibility formula list is available; scan endpoints still require the backend contract.</div>}
                {scannerError && (
                  <div className="bt-alert-error scanner-reference-alert" role="alert"><AlertCircle size={15} /> {scannerError}</div>
                )}
                {screenerError && <div className="bt-alert-error scanner-reference-alert" role="alert"><AlertCircle size={15} /> {screenerError}</div>}

                {loadingScreener && (
                  <div className="bt-panel scanner-reference-empty" role="status" aria-live="polite"><RefreshCw size={18} className="spin" /><strong>Running {activeFormula?.name ?? "formula"}…</strong><span>This starts only after you press Run scan. The page will not keep retrying in the background.</span></div>
                )}

                {!loadingScreener && !screenerResult && !screenerError && (
                  <div className="bt-panel scanner-reference-empty"><ListChecks size={21} /><strong>Ready for an explicit scan</strong><span>Choose a formula and universe, review the dates, then press Run scan. Changing filters never starts a request.</span></div>
                )}

                {!loadingScreener && screenerResult && (
                  <section className="scanner-heatmap-surface" aria-labelledby="screener-results-title">
                    <div className="scanner-heatmap-head">
                      <div>
                        <span className="bt-eyebrow">FORMULA RESULTS</span>
                        <h2 id="screener-results-title">{activeFormula?.name ?? screenerResult.formulaId} matches</h2>
                        <p>{screenerResult.totalMatches} matching symbols from {universeLabel}. This is a current local-data screen, not a backtest or live quote.</p>
                      </div>
                      {screenerIsStale && <span className="bt-field-help" role="status">Filters changed · rerun required</span>}
                    </div>
                    {screenerResult.missingSymbols.length > 0 && <div className="bt-alert-warning scanner-reference-alert" role="status"><Info size={15} /> {screenerResult.missingSymbols.length} requested symbols have no local bars. Import the required NSE archive before treating the screen as complete.</div>}
                    {screenerResult.matches.length === 0 ? <div className="scanner-reference-empty"><Database size={21} /><strong>No matches in the available local data</strong><span>{screenerResult.coverageStatus === "unavailable" ? "The selected universe is unavailable locally." : "Try another formula or import more official NSE daily history."}</span><Link href="/data" className="bt-secondary-btn"><Database size={13} /> Manage stock data</Link></div> : (
                      <div className="scanner-screener-match-list" role="list" aria-label="Formula matches">
                        {screenerResult.matches.map((match) => <article className="scanner-screener-match" key={match.symbol} role="listitem"><div><strong>{match.symbol}</strong><small>{match.companyName} · {match.sector}</small></div><span className="scanner-screener-score">{match.score === null ? "Match" : `${match.score.toFixed(1)} score`}</span><p>{match.reason}</p><small>{match.dataAsOf ?? screenerResult.dataAsOf ?? "Local date unavailable"}{match.close === null ? "" : ` · Close ₹${match.close.toLocaleString("en-IN")}`}</small></article>)}
                      </div>
                    )}
                    <div className="scanner-reference-footer"><span>{screenerResult.availableSymbols} symbols available · {screenerResult.coverageStatus} coverage · {screenerResult.dataAsOf ?? "data date unavailable"}</span><button type="button" className="bt-secondary-btn" onClick={() => void runHistoricalResearchScan()} disabled={loadingScanner}><Database size={13} /> {loadingScanner ? "Running history…" : "Historical research scan"}</button></div>
                  </section>
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
                        {heatmapRows.map((row, rowIndex) => <div className="scanner-sector-row" key={`sector-row-${rowIndex}`}>
                        {row.map((sector) => {
                          const value = heatmapValue(sector, heatmapMetric);
                          const isSelected = selectedSector === sector.sector;
                          return (
                            <button
                              type="button"
                              key={sector.sector}
                              className={`scanner-sector-tile ${isSelected ? "is-selected" : ""}`}
                              style={{ flexGrow: Math.max(1, sector.stock_count), background: heatmapTone(value, heatmapMin, heatmapMax) }}
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
                        </div>)}
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
                                <Link href={`/research?symbol=${encodeURIComponent(item.symbol)}&strategy=${encodeURIComponent(strategyType)}&start=${encodeURIComponent(scanStart)}&end=${encodeURIComponent(scanEnd)}&source=scanner`} className="scanner-sector-research-link">Research <span>↗</span></Link>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="scanner-sector-prompt">Select a sector tile to load its highest-scoring stocks and the evidence behind the score.</div>
                      )}
                    </section>

                    <div className="scanner-stock-grid">
                      <div className="scanner-leaderboard-tools" aria-label="Leaderboard controls">
                        <label><span>Find a stock or sector</span><input className="bt-field-input" value={leaderboardQuery} onChange={(event) => setLeaderboardQuery(event.target.value)} placeholder="RELIANCE, banking…" /></label>
                        <label><span>Rank by</span><select className="bt-field-input" value={leaderboardSort} onChange={(event) => setLeaderboardSort(event.target.value as LeaderboardSort)}><option value="strategy_return">Strategy return</option><option value="alpha">Alpha vs buy &amp; hold</option><option value="win_rate">Win rate</option><option value="drawdown">Lowest drawdown</option><option value="sharpe">Sharpe ratio</option></select></label>
                        <button type="button" className="bt-secondary-btn" onClick={exportLeaderboard} disabled={!filteredLeaderboard.length}><Database size={13} /> Export CSV</button>
                      </div>
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
                    <div className="scanner-reference-footer"><span>Showing {visibleLeaderboard.length} of {filteredLeaderboard.length} matching instruments. {filteredLeaderboard.length > 12 && <button type="button" className="scanner-inline-action" onClick={() => setShowAllStocks((current) => !current)}>{showAllStocks ? "Show top 12" : "Show all"}</button>}</span><span>Avg B&amp;H: <strong>{pct(averageBuyHoldReturn ?? undefined)}</strong></span></div>
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
                    onClick={() => void runHistoricalResearchScan()}
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

        {activeTab === "structure" && (
          <>
            <section className="bt-panel scanner-control-panel bt-scanner-filter-panel structure-zone-controls">
              <div className="bt-panel-head">
                <div>
                  <span className="bt-eyebrow">LOCAL DAILY CANDLES</span>
                  <h2>Daily structure zones</h2>
                  <p className="bt-field-help">
                    Backtrack checks for a strong daily close through the previous 20-session range, preceded by an opposite candle. It marks that candle’s full range and tracks later touches and invalidation using local NSE history.
                  </p>
                </div>
                <div className="structure-zone-actions">
                  <label className="scanner-rail-field">
                    <span>Market universe</span>
                    <select className="bt-field-input" value={universe} onChange={(event) => { setUniverse(event.target.value); setStructureResult(null); setStructureError(null); }} disabled={loadingStructure}>
                      {availableUniverses.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </label>
                  <button type="button" className="bt-primary scanner-rail-run" onClick={() => void runStructureScan()} disabled={loadingStructure || catalogLoading}>
                    {loadingStructure ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
                    {loadingStructure ? "Scanning…" : "Run daily scan"}
                  </button>
                </div>
              </div>
              <p className="structure-zone-disclaimer">
                This is a transparent daily-bar research heuristic, not a live feed, institutional-flow detector, trade recommendation, or prediction. Nothing runs until you press Run daily scan.
              </p>
              {structureError && <div className="bt-alert-error" role="alert"><AlertCircle size={16} /> {structureError}</div>}
            </section>

            {loadingStructure && (
              <div className="bt-panel bt-loading-state" role="status" aria-live="polite">
                <RefreshCw size={18} className="spin" />
                <span>Checking the selected universe’s locally saved daily bars…</span>
              </div>
            )}

            {!loadingStructure && structureResult && (
              <>
                <section className="bt-panel scanner-breakout-explainer" aria-label="Daily structure scan summary">
                  <div>
                    <strong>{structureResult.total_zones} active zones · {availableUniverses.find((item) => item.id === structureResult.universe)?.label ?? structureResult.universe}</strong>
                    <p>Scanned {structureResult.scanned_symbols} of {structureResult.requested_symbols} requested symbols · latest cached bar {dayLabel(structureResult.data_as_of)}.</p>
                  </div>
                  <span className="bt-field-help">{structureResult.coverage_status} coverage</span>
                </section>

                {(structureResult.missing_symbols.length > 0 || structureResult.insufficient_history_symbols.length > 0) && (
                  <div className="bt-alert-warning structure-zone-coverage" role="status">
                    <Info size={15} />
                    {structureResult.missing_symbols.length > 0 && <span>{structureResult.missing_symbols.length} {structureResult.missing_symbols.length === 1 ? "symbol has" : "symbols have"} no local bars. </span>}
                    {structureResult.insufficient_history_symbols.length > 0 && <span>{structureResult.insufficient_history_symbols.length} {structureResult.insufficient_history_symbols.length === 1 ? "symbol has" : "symbols have"} too little daily history for this rule. </span>}
                    <Link href="/data" className="bt-link">Manage NSE history →</Link>
                  </div>
                )}

                {structureResult.zones.length === 0 ? (
                  <div className="bt-panel scanner-reference-empty" role="status">
                    <Database size={21} />
                    <strong>{structureResult.scanned_symbols === 0 ? "No usable daily history in this universe" : "No active zones matched this rule"}</strong>
                    <span>{structureResult.scanned_symbols === 0 ? "Import official NSE daily archives, then run the scan again." : "The scan only reports recent confirmed zones whose invalidation level has not been crossed on a daily close."}</span>
                    {structureResult.scanned_symbols === 0 && <Link href="/data" className="bt-secondary-btn"><Database size={13} /> Manage stock data</Link>}
                  </div>
                ) : (
                  <div className="breakout-grid structure-zone-grid" role="list" aria-label="Active daily structure zones">
                    {structureResult.zones.map((zone) => (
                      <article key={`${zone.symbol}-${zone.direction}-${zone.confirmed_date}`} className="breakout-card structure-zone-card" role="listitem">
                        <div className="breakout-card-head">
                          <div>
                            <strong>{zone.symbol}</strong>
                            <small>{zone.company_name} · {zone.sector}</small>
                          </div>
                          <span className={`structure-zone-direction ${zone.direction}`}>{zone.direction}</span>
                        </div>

                        <div className="structure-zone-band">
                          <span>DAILY ZONE RANGE</span>
                          <strong>{price(zone.zone_low)} – {price(zone.zone_high)}</strong>
                          <small>Latest close {price(zone.close)} · {zone.distance_pct === 0 ? "inside the zone" : `${zone.distance_pct.toFixed(2)}% from the zone`}</small>
                        </div>

                        <div className="breakout-stats-grid structure-zone-stats">
                          <div><span>State</span><strong>{zone.state === "testing" ? "Testing" : zone.state === "retested" ? "Retested" : "Untested"}</strong></div>
                          <div><span>Confirmed</span><strong>{dayLabel(zone.confirmed_date)}</strong></div>
                          <div><span>Break level</span><strong>{price(zone.break_level)}</strong></div>
                          <div><span>Impulse / prior ATR</span><strong>{zone.impulse_atr.toFixed(2)}×</strong></div>
                        </div>

                        <p className="structure-zone-note">
                          Last bar {dayLabel(zone.data_as_of)} · source candle {dayLabel(zone.source_candle_date)} · {zone.touch_sessions} later touch session{zone.touch_sessions === 1 ? "" : "s"} · {zone.bars_since_confirmation} bar{zone.bars_since_confirmation === 1 ? "" : "s"} since confirmation. A daily close {zone.direction === "bullish" ? "below" : "above"} {price(zone.direction === "bullish" ? zone.zone_low : zone.zone_high)} invalidates this zone.
                        </p>

                        <div className="structure-zone-card-actions">
                          <Link href={`/research?symbol=${encodeURIComponent(zone.symbol)}&source=structure-zones`} className="bt-secondary-btn">Open in Research ↗</Link>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}

            {!loadingStructure && !structureResult && !structureError && (
              <div className="bt-panel scanner-reference-empty" role="status">
                <Layers size={21} />
                <strong>Run a local daily structure scan</strong>
                <span>Select a configured universe and press Run daily scan. Results use only saved NSE candles and include their as-of date and coverage.</span>
              </div>
            )}
          </>
        )}

        {/* Tab 2: Automated Breakout Scanner */}
        {activeTab === "breakout" && (
          <>
            <section className="bt-panel scanner-control-panel bt-scanner-filter-panel">
              <div className="bt-panel-head">
                <div>
                  <span className="bt-eyebrow">MANUAL MORNING PLAN · REGULAR NSE SESSION</span>
                  <h2>Rank Technical Setups for the Morning</h2>
                  <p>Run manually at 9:00 IST for the regular NSE pre-open. This uses completed local daily candles only; it has no auction quotes, headlines, or live entry confirmation.</p>
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
                    <RefreshCw size={14} className={loadingBreakout ? "spin" : ""} /> Build Morning Plan
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
                  <span>Minimum setup score: <strong>{minConviction}</strong></span>
                  <input
                    type="range"
                    min="30"
                    max="90"
                    step="5"
                    value={minConviction}
                    onChange={(e) => setMinConviction(Number(e.target.value))}
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
                    <span>Latest completed daily-bar volume divided by its 20-session average. <strong>2.0x</strong> means twice the average; before open, it is not today’s live volume or evidence of institutional buying.</span>
                  </div>
                  <div style={{ background: "#fff", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                    <strong style={{ color: "#4338ca", display: "block" }}>52W Dist (Distance to 52-Week High)</strong>
                    <span>Percentage gap to the 52-week peak price. Stocks within <strong>0% – 4%</strong> are testing fresh annual breakouts above overhead resistance.</span>
                  </div>
                  <div style={{ background: "#fff", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                    <strong style={{ color: "#4338ca", display: "block" }}>RSI 14 (Relative Strength Index)</strong>
                    <span>Momentum indicator calculated from the latest 14 daily closes. Higher readings describe recent price strength; they do not predict future direction.</span>
                  </div>
                  <div style={{ background: "#fff", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                    <strong style={{ color: "#4338ca", display: "block" }}>20D Range &amp; VCP</strong>
                    <span>Width between the highest high and lowest low over 20 sessions. The scanner treats a range below 11% as a pattern filter, not a breakout forecast.</span>
                  </div>
                  <div style={{ background: "#fff", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                    <strong style={{ color: "#4338ca", display: "block" }}>Setup Score</strong>
                    <span>Heuristic rating (0–100) from the scanner’s technical rules. It ranks matches; it is not a probability or validated prediction.</span>
                  </div>
                  <div style={{ background: "#fff", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                    <strong style={{ color: "#4338ca", display: "block" }}>SMA Rebound (20D / 50D)</strong>
                    <span>Price moving back above a 20-day or 50-day Simple Moving Average. This is a historical pattern match, not proof that the trend will continue.</span>
                  </div>
                </div>
              </section>
            )}

            {loadingBreakout && (
              <div className="bt-panel bt-loading-state">
                <RefreshCw size={18} className="spin" />
                <span>Building a ranked morning plan from the latest local NSE daily candles…</span>
              </div>
            )}

            {!loadingBreakout && breakoutResult && (
              <>
                {bookmarkError && <div className="bt-alert-error" role="alert"><AlertCircle size={15} /> {bookmarkError}</div>}
                {bookmarkMessage && <div className="bt-alert-success" role="status">{bookmarkMessage} <Link href="/watchlist" className="bt-link">Open Daily Watchlist →</Link></div>}
                <section className="bt-panel scanner-breakout-explainer" aria-label="How to use the morning plan">
                  <div><strong>{breakoutSummary.uniqueStocks} ranked stocks from {breakoutResult.symbols_scanned} cached NSE symbols · data through {breakoutResult.data_as_of ?? "no dated local candle"}</strong><p>The score ranks technical matches; it is not a win probability or a guaranteed “best stock.” Levels use each stock’s latest session high/low: trigger at the prior high, invalidation at the prior low, target at 2R. Confirm the opening price and volume after 9:15 IST; skip a gap beyond the target or below the stop.</p></div>
                  <span className="bt-field-help">Manual scan · local NSE daily data · no live quotes</span>
                </section>
                <section className="bt-scanner-kpis" aria-label="Breakout scan summary">
                  <div className="bt-scanner-kpi"><span>Setup signals</span><strong>{breakoutSummary.candidates}</strong><small>after minimum-score filter</small></div>
                  <div className="bt-scanner-kpi"><span>Unique stocks</span><strong>{breakoutSummary.uniqueStocks}</strong><small>deduplicated symbols</small></div>
                  <div className="bt-scanner-kpi is-positive"><span>Score ≥ 70</span><strong>{breakoutSummary.highConviction}</strong><small>heuristic matches</small></div>
                  <div className="bt-scanner-kpi"><span>Average RVOL</span><strong>{breakoutSummary.averageRvol.toFixed(1)}x</strong><small>volume vs 20D average</small></div>
                </section>
              </>
            )}

            {filteredSetups && !loadingBreakout && (
              <div className="breakout-grid">
                {filteredSetups.length === 0 ? (
                  <div className="bt-panel" style={{ gridColumn: "1 / -1", textAlign: "center", padding: "30px" }}>
                    <p style={{ color: "#64748b" }}>No setup candidates matched the minimum score of {minConviction}. Lower the slider to view additional technical matches.</p>
                  </div>
                ) : (
                  filteredSetups.map((setup, index) => (
                    <div key={`${setup.symbol}-${setup.setup_type}`} className="breakout-card">
                      <div className="breakout-card-head">
                        <div>
                          <strong>{setup.symbol}</strong>
                          <small>{index === 0 ? "Top score in this view · " : ""}{setup.company_name}</small>
                        </div>
                        <span className={`breakout-badge ${setup.setup_type.includes("52W") ? "high-52w" : setup.setup_type.replaceAll(" ", "-").toLowerCase()}`}>
                          {setup.setup_type}
                        </span>
                      </div>

                      <div className="breakout-conviction-wrap">
                        <div className="breakout-conviction-head">
                          <span title="Heuristic technical setup ranking (0-100); it is not a probability">Setup score</span>
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
                          <span title="Latest completed daily-bar volume divided by the average of 20 sessions; it is not today's live volume">RVOL</span>
                          <strong className={setup.rvol >= 1.8 ? "text-pos" : ""} title="Latest completed session volume divided by its 20-day average; not today's live volume">{setup.rvol}x</strong>
                        </div>
                        <div>
                          <span title="Percentage gap to the stock's highest high over the last 52 weeks (380 days)">52W Dist</span>
                          <strong>{setup.dist_52w_high}%</strong>
                        </div>
                        <div>
                          <span title="Momentum indicator from the latest 14 daily closes; it describes recent prices and does not predict direction">RSI (14)</span>
                          <strong>{setup.rsi_14}</strong>
                        </div>
                      </div>

                      {setup.morning_plan ? (
                        <>
                          <div className="breakout-stats-grid" aria-label={`Conditional plan levels for ${setup.symbol}`} style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                            <div><span title={`Prior session high from ${setup.morning_plan.data_as_of}; confirm a break after the market opens`}>Entry trigger · prior high</span><strong>{rupees(setup.morning_plan.entry_trigger)}</strong></div>
                            <div><span title={`Prior session low from ${setup.morning_plan.data_as_of}; plan invalidation level`}>Stop · prior low</span><strong>{rupees(setup.morning_plan.stop_level)}</strong></div>
                            <div><span title="Target is 2 times the prior-session high-to-low risk range">Target · 2R</span><strong>{rupees(setup.morning_plan.target_2r)}</strong></div>
                            <div><span title="Reference risk per share; position size is not calculated without your risk budget">Risk / share</span><strong>{rupees(setup.morning_plan.risk_per_share)}</strong></div>
                          </div>
                          <small className="bt-field-help">Levels use {setup.morning_plan.data_as_of} daily data. They are conditional references, not a confirmed entry.</small>
                        </>
                      ) : (
                        <p className="bt-field-help" role="status">No conditional levels: the latest session has no usable high-to-low range.</p>
                      )}

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", borderTop: "1px solid #f1f5f9", paddingTop: "8px", marginTop: "4px" }}>
                        <p className="breakout-desc" style={{ borderTop: 0, paddingTop: 0, marginTop: 0, flex: 1 }}>{setup.description}</p>
                        <button
                          type="button"
                          className="bt-secondary-btn"
                          style={{ padding: "4px 8px", fontSize: "10px", gap: "4px", flexShrink: 0 }}
                          onClick={() => void addToWatchlist(setup)}
                          disabled={bookmarkingSym === setup.symbol || !setup.morning_plan}
                          >
                            <BookmarkCheck size={12} />
                            {bookmarkingSym === setup.symbol ? "Saving…" : "Save Plan"}
                          </button>
                          <Link href={`/research?symbol=${encodeURIComponent(setup.symbol)}&strategy=donchian_breakout&source=breakout-scanner`} className="bt-secondary-btn" style={{ padding: "4px 8px", fontSize: "10px", gap: "4px", flexShrink: 0, textDecoration: "none" }}>
                            Test history ↗
                          </Link>
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
