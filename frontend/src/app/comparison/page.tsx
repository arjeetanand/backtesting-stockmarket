"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Play, Scale, Search, TrendingUp } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { SymbolCombobox } from "@/components/data/SymbolCombobox";
import { getMarketAvailability, type MarketAvailability } from "@/lib/market-data";
import { runStrategyBacktest, type LiveBacktestResult } from "@/lib/backtest-api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

type StrategyDefinition = { id: string; title: string; description: string; parameters: string };
type MatrixResult = {
  id: string;
  strategyId: string;
  title: string;
  result: LiveBacktestResult | SavedBacktestResult;
};
type SavedBacktestResult = {
  run_id: string;
  config: { strategy?: string };
  metrics: Record<string, number>;
  trades: Array<unknown>;
};
type SavedCustomResult = LiveBacktestResult & { strategy_id?: string };

const STRATEGIES: StrategyDefinition[] = [
  { id: "sma_crossover", title: "SMA Golden Cross", description: "Long when the fast simple moving average crosses above the slow average.", parameters: "SMA 20 / 50" },
  { id: "ema_crossover", title: "EMA Trend Crossover", description: "Faster exponential averages react earlier to changing trends.", parameters: "EMA 20 / 50" },
  { id: "rsi_ema", title: "RSI + EMA Filter", description: "Buy oversold pullbacks only when the fast EMA remains above the slow EMA.", parameters: "RSI 14 · EMA 20 / 50" },
  { id: "rsi_mean_reversion", title: "RSI Mean Reversion", description: "Buy oversold conditions and exit when price momentum normalises.", parameters: "RSI 14 · 30 / 50" },
  { id: "bollinger_mean_reversion", title: "Bollinger Bands", description: "Buy moves below the lower band and exit at the moving-average midpoint.", parameters: "20 periods · 2σ" },
  { id: "macd_crossover", title: "MACD Crossover", description: "Follow MACD line and signal-line crossovers for trend confirmation.", parameters: "12 / 26 / 9" },
  { id: "donchian_breakout", title: "Donchian Breakout", description: "Enter on a new rolling high and exit on a rolling low, inspired by Turtle trading.", parameters: "50-day channel" },
  { id: "momentum", title: "Price Momentum", description: "Stay long while the selected lookback return is positive.", parameters: "20-day momentum" },
];

function metric(result: MatrixResult["result"], key: string): number {
  const metrics = result.metrics as Record<string, number>;
  if (key === "trades") return "total_trades" in metrics ? Number(metrics.total_trades ?? 0) : Number(metrics.trade_count ?? 0);
  return Number(metrics[key] ?? 0);
}

function percentage(value: number): string { return `${(value * 100).toFixed(2)}%`; }

export default function ExperimentComparisonPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [symbol, setSymbol] = useState("RELIANCE");
  const [start, setStart] = useState("2024-01-01");
  const [end, setEnd] = useState("2026-06-30");
  const [availability, setAvailability] = useState<MarketAvailability | null>(null);
  const [selectedStrategies, setSelectedStrategies] = useState(["sma_crossover", "rsi_ema", "macd_crossover"]);
  const [results, setResults] = useState<MatrixResult[]>([]);
  const [baselineId, setBaselineId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSavedRuns = async () => {
    try {
      const [response, customResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/backtests`),
        fetch(`${API_BASE_URL}/research/artifacts/custom_backtest`),
      ]);
      const saved = response.ok ? await response.json() as SavedBacktestResult[] : [];
      const custom = customResponse.ok ? await customResponse.json() as SavedCustomResult[] : [];
      const savedSma = saved.map((result) => ({ id: result.run_id, strategyId: "sma_crossover", title: "Saved SMA crossover", result }));
      const savedCustom = custom
        .filter((result) => result.symbol === symbol)
        .map((result) => ({ id: result.run_id, strategyId: result.strategy_id ?? "rsi_ema", title: `Saved ${result.strategy_id ?? "strategy"}`, result }));
      setResults([...savedSma, ...savedCustom]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([getMarketAvailability(symbol), loadSavedRuns()]).then(([data]) => {
      setAvailability(data);
      if (data.earliest) setStart(data.earliest.slice(0, 10));
      if (data.latest) setEnd(data.latest.slice(0, 10));
    }).catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Could not load local NSE data."));
  }, [symbol]);

  const visibleStrategies = useMemo(() => STRATEGIES.filter((strategy) => `${strategy.title} ${strategy.description}`.toLowerCase().includes(search.toLowerCase())), [search]);
  const baseline = results.find((row) => row.id === baselineId) ?? results[0];
  const highestReturn = results.length ? results.reduce((best, row) => metric(row.result, "cagr") > metric(best.result, "cagr") ? row : best) : null;
  const bestSharpe = results.length ? results.reduce((best, row) => metric(row.result, "sharpe_ratio") > metric(best.result, "sharpe_ratio") ? row : best) : null;
  const lowestDrawdown = results.length ? results.reduce((best, row) => metric(row.result, "max_drawdown") > metric(best.result, "max_drawdown") ? row : best) : null;

  const toggleStrategy = (strategyId: string) => setSelectedStrategies((current) => current.includes(strategyId) ? current.filter((id) => id !== strategyId) : [...current, strategyId]);

  const runMatrix = async () => {
    if (!selectedStrategies.length) { setError("Select at least one strategy."); return; }
    if (!start || !end || start > end) { setError("Choose a valid date range."); return; }
    setRunning(true);
    setError(null);
    try {
      const selected = STRATEGIES.filter((strategy) => selectedStrategies.includes(strategy.id));
      const next = await Promise.all(selected.map(async (strategy): Promise<MatrixResult> => {
        if (strategy.id === "sma_crossover") {
          const response = await fetch(`${API_BASE_URL}/backtests/sma-crossover`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol, start: `${start}T00:00:00`, end: `${end}T23:59:59`, timeframe: "1day", fast_window: 20, slow_window: 50, initial_capital: 100000, commission: 0, slippage: 0 }) });
          const result = await response.json() as SavedBacktestResult;
          if (!response.ok) throw new Error("detail" in result ? String(result.detail) : `Could not run ${strategy.title}.`);
          return { id: result.run_id, strategyId: strategy.id, title: strategy.title, result };
        }
        const result = await runStrategyBacktest({ symbol, start, end, initialCapital: 100000, strategyId: strategy.id, rsiPeriod: 14, rsiOversold: 30, rsiOverbought: 70, fastEma: 20, slowEma: 50, commissionPct: 0, slippagePct: 0 });
        return { id: result.run_id, strategyId: strategy.id, title: strategy.title, result };
      }));
      setResults(next);
      setBaselineId(next[0]?.id ?? "");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The matrix run failed.");
    } finally {
      setRunning(false);
    }
  };

  return <div className="backtrack-page"><TopBar /><main className="backtrack-content bt-stack">
    <section className="bt-heading-row"><div><div className="bt-kicker"><span className="live-dot" /> EXPERIMENT MATRIX</div><h1>Compare real strategy runs.</h1><p>Choose well-known strategy rules, run them against local NSE history, and compare the resulting metrics. No sample results are shown.</p></div><span className="data-source"><Scale size={14} /> Local NSE cache</span></section>

    <section className="bt-panel" style={{ padding: "20px" }}><div className="bt-row-between"><div><span className="bt-eyebrow">RUN CONFIGURATION</span><h2>Market and test window</h2></div><span className="text-xs text-slate-500">{availability?.bars ? `${availability.bars} cached bars` : "Checking cache…"}</span></div><div className="bt-grid-2" style={{ marginTop: "16px" }}><div><label className="bt-field-label">NSE symbol</label><SymbolCombobox value={symbol} onChange={(next) => { setSymbol(next); setResults([]); }} /></div><div><label className="bt-field-label">Data source</label><input className="bt-field-input" value="Official NSE daily cache" disabled /></div><div><label className="bt-field-label">From</label><input className="bt-field-input" type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} /></div><div><label className="bt-field-label">To</label><input className="bt-field-input" type="date" value={end} min={start} max={today} onChange={(event) => setEnd(event.target.value)} /></div></div>{availability?.bars === 0 && <div className="bt-alert-error" style={{ marginTop: "14px" }}>No local history is available for {symbol}. Import this symbol from Data &amp; Providers first.</div>}{error && <div className="bt-alert-error" role="alert" style={{ marginTop: "14px" }}>{error}</div>}</section>

    <section className="bt-panel" style={{ padding: "20px" }}><div className="bt-row-between"><div><span className="bt-eyebrow">STRATEGY LIBRARY</span><h2>Famous strategies</h2><p className="text-xs text-slate-500" style={{ marginTop: "5px" }}>Select one or more deterministic templates for this matrix.</p></div><div className="bt-chat-input-row" style={{ maxWidth: "260px" }}><Search size={14} /><input className="bt-chat-input" placeholder="Search strategies" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div><div className="bt-grid-2" style={{ marginTop: "16px" }}>{visibleStrategies.map((strategy) => { const selected = selectedStrategies.includes(strategy.id); return <button key={strategy.id} type="button" onClick={() => toggleStrategy(strategy.id)} className="bt-callout" style={{ textAlign: "left", border: selected ? "1px solid #818cf8" : "1px solid #e2e8f0", background: selected ? "#eef2ff" : "#fff", cursor: "pointer" }}><div className="bt-row-between"><strong>{strategy.title}</strong><span style={{ color: selected ? "#4f46e5" : "#94a3b8" }}>{selected ? <Check size={16} /> : "＋"}</span></div><p>{strategy.description}</p><small>{strategy.parameters}</small></button>; })}</div><button className="bt-primary" style={{ marginTop: "18px" }} onClick={() => void runMatrix()} disabled={running || !availability?.bars}>{running ? <><Loader2 size={14} className="spin" /> Running selected strategies…</> : <><Play size={14} /> Run selected strategies</>}</button></section>

    <div className="bt-kpi-grid"><div className="bt-stat-card mint"><span>Highest CAGR</span><strong>{highestReturn ? percentage(metric(highestReturn.result, "cagr")) : "—"}</strong><small>{highestReturn?.title ?? "Run a matrix to calculate"}</small><TrendingUp /></div><div className="bt-stat-card blue"><span>Best Sharpe</span><strong>{bestSharpe ? metric(bestSharpe.result, "sharpe_ratio").toFixed(2) : "—"}</strong><small>{bestSharpe?.title ?? "Run a matrix to calculate"}</small><Scale /></div><div className="bt-stat-card rose"><span>Lowest drawdown</span><strong>{lowestDrawdown ? percentage(metric(lowestDrawdown.result, "max_drawdown")) : "—"}</strong><small>{lowestDrawdown?.title ?? "Run a matrix to calculate"}</small><AlertTriangle /></div><div className="bt-stat-card violet"><span>Experiments</span><strong>{results.length}</strong><small>Real runs in this matrix</small><Scale /></div></div>

    <section className="bt-panel" style={{ padding: 0 }}><div className="bt-panel-head" style={{ padding: "14px 24px", borderBottom: "1px solid #e2e8f0" }}><div><span className="bt-eyebrow">RESULTS</span><h2>Run metrics comparison</h2></div>{results.length > 0 && <label className="bt-row text-xs text-slate-500">Baseline<select className="bt-sort-select" value={baseline?.id ?? ""} onChange={(event) => setBaselineId(event.target.value)}>{results.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label>}</div>{loading ? <p style={{ padding: "24px" }}>Loading saved runs…</p> : results.length === 0 ? <div style={{ padding: "32px", textAlign: "center" }}><p>No experiment runs yet.</p><p className="text-xs text-slate-500" style={{ marginTop: "6px" }}>Select strategies above and run them on imported NSE data.</p></div> : <div className="bt-table-wrap"><table className="bt-table"><thead><tr><th>Strategy / Run</th><th className="right">CAGR</th><th className="right">Sharpe</th><th className="right">Sortino</th><th className="right">Max DD</th><th className="right">Profit Factor</th><th className="right">Win Rate</th><th className="right">Trades</th></tr></thead><tbody>{results.map((row) => { const base = baseline ? metric(baseline.result, "cagr") : 0; const diff = metric(row.result, "cagr") - base; return <tr key={row.id} className={row.id === baseline?.id ? "baseline" : undefined}><td><strong>{row.title}</strong><br /><span className="bt-val-muted">{row.id} · {symbol} · {start} to {end}</span></td><td className="right">{percentage(metric(row.result, "cagr"))} <span className={cnDiff(diff)}>{diff >= 0 ? "+" : ""}{(diff * 100).toFixed(2)}%</span></td><td className="right">{metric(row.result, "sharpe_ratio").toFixed(2)}</td><td className="right">{metric(row.result, "sortino_ratio").toFixed(2)}</td><td className="right">{percentage(metric(row.result, "max_drawdown"))}</td><td className="right">{metric(row.result, "profit_factor").toFixed(2)}</td><td className="right">{percentage(metric(row.result, "win_rate"))}</td><td className="right">{Math.round(metric(row.result, "trades"))}</td></tr>; })}</tbody></table></div>}</section>
  </main></div>;
}

function cnDiff(value: number): string { return value >= 0 ? "bt-diff up" : "bt-diff down"; }
