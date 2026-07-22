"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Info, Loader2, Play, Scale, Search, TrendingUp } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { SymbolCombobox } from "@/components/data/SymbolCombobox";
import { getMarketAvailability, type MarketAvailability } from "@/lib/market-data";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

type StrategyDefinition = {
  id: string;
  title: string;
  family: string;
  description: string;
  use: string;
  parameters: string;
};
type BacktestPayload = {
  run_id: string;
  strategy_id?: string;
  symbol?: string;
  timeframe?: string;
  initial_capital?: number;
  final_equity?: number;
  metrics?: Record<string, number>;
  trades?: Array<unknown>;
  detail?: string;
};
type MatrixResult = { id: string; strategyId: string; title: string; result: BacktestPayload; source?: "matrix" | "saved" };

const STRATEGIES: StrategyDefinition[] = [
  { id: "sma_crossover", title: "SMA Golden Cross", family: "Trend following", description: "Buys when a fast simple moving average crosses above a slower average.", use: "A simple baseline for medium-term trend changes.", parameters: "SMA 20 / 50" },
  { id: "ema_crossover", title: "EMA Trend Crossover", family: "Trend following", description: "Uses exponential averages so recent prices have more influence.", use: "Useful when you want a faster trend signal.", parameters: "EMA 20 / 50" },
  { id: "rsi_ema", title: "RSI + EMA Filter", family: "Momentum / pullback", description: "Buys an oversold pullback only while the fast EMA is above the slow EMA.", use: "Tests pullbacks inside a broader uptrend.", parameters: "RSI 14 · EMA 20 / 50" },
  { id: "rsi_mean_reversion", title: "RSI Mean Reversion", family: "Mean reversion", description: "Buys oversold conditions and exits as momentum returns toward neutral.", use: "Tests whether stretched moves tend to snap back.", parameters: "RSI 14 · 30 / 50" },
  { id: "bollinger_mean_reversion", title: "Bollinger Reversion", family: "Mean reversion", description: "Buys below the lower volatility band and exits near the moving average.", use: "Explores volatility bands and reversion to a centre line.", parameters: "20 periods · 2σ" },
  { id: "macd_crossover", title: "MACD Crossover", family: "Trend confirmation", description: "Follows MACD and signal-line crossovers for trend confirmation.", use: "Combines momentum with a slower trend filter.", parameters: "12 / 26 / 9" },
  { id: "donchian_breakout", title: "Donchian Breakout", family: "Breakout", description: "Enters on a new rolling high and exits on a rolling low.", use: "Studies whether sustained breakouts persist.", parameters: "50-day channel" },
  { id: "momentum", title: "Price Momentum", family: "Momentum", description: "Stays long while the selected lookback return remains positive.", use: "A direct test of recent price persistence.", parameters: "20-day momentum" },
];
const TIMEFRAMES = [
  { value: "1day", label: "Daily", detail: "NSE daily candles" },
  { value: "1week", label: "Weekly", detail: "Resampled from daily" },
  { value: "1month", label: "Monthly", detail: "Resampled from daily" },
];

function metric(result: BacktestPayload | undefined, key: string): number {
  const metrics = result?.metrics ?? {};
  if (key === "return") return Number(metrics.total_return ?? metrics.cagr ?? 0);
  if (key === "drawdown") return Number(metrics.max_drawdown ?? metrics.maximum_drawdown ?? 0);
  if (key === "trades") return Number(metrics.total_trades ?? metrics.trade_count ?? result?.trades?.length ?? 0);
  return Number(metrics[key] ?? 0);
}
function percentage(value: number): string { return `${(value * 100).toFixed(2)}%`; }
function diffClass(value: number): string { return value >= 0 ? "bt-diff up" : "bt-diff down"; }
function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (reason) => { clearTimeout(timer); reject(reason); });
  });
}

export default function ExperimentComparisonPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [symbol, setSymbol] = useState("RELIANCE");
  const [start, setStart] = useState("2024-01-01");
  const [end, setEnd] = useState("2026-06-30");
  const [timeframe, setTimeframe] = useState("1day");
  const [initialCapital, setInitialCapital] = useState(100000);
  const [positionSize, setPositionSize] = useState(10000);
  const [stopLoss, setStopLoss] = useState(2);
  const [takeProfit, setTakeProfit] = useState(4);
  const [availability, setAvailability] = useState<MarketAvailability | null>(null);
  const [selectedStrategies, setSelectedStrategies] = useState(["sma_crossover", "rsi_ema", "macd_crossover"]);
  const [results, setResults] = useState<MatrixResult[]>([]);
  const [savedRuns, setSavedRuns] = useState<MatrixResult[]>([]);
  const [baselineId, setBaselineId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedFromResearch, setLoadedFromResearch] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const querySymbol = params.get("symbol");
    if (querySymbol) setSymbol(querySymbol.toUpperCase());
    if (params.get("start")) setStart(params.get("start")!);
    if (params.get("end")) setEnd(params.get("end")!);
    if (params.get("timeframe")) setTimeframe(params.get("timeframe")!);
    if (params.get("capital")) setInitialCapital(Math.max(1, Number(params.get("capital")) || 100000));
    if (params.get("position")) setPositionSize(Math.max(1, Number(params.get("position")) || 10000));
    if (params.get("stop")) setStopLoss(Math.max(0, Number(params.get("stop")) || 0));
    if (params.get("target")) setTakeProfit(Math.max(0, Number(params.get("target")) || 0));
    const queryStrategy = params.get("strategy");
    if (queryStrategy && STRATEGIES.some((item) => item.id === queryStrategy)) setSelectedStrategies([queryStrategy]);
    setLoadedFromResearch(params.get("source") === "research");
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.allSettled([
      withTimeout(getMarketAvailability(symbol), "Could not load local NSE history before the connection timed out."),
      withTimeout(Promise.all([fetch(`${API_BASE_URL}/backtests`), fetch(`${API_BASE_URL}/research/artifacts/custom_backtest`)]), "Saved tests could not be loaded before the connection timed out."),
    ]).then(([availabilityResult, savedResult]) => {
      if (!active) return;
      if (availabilityResult.status === "fulfilled") setAvailability(availabilityResult.value);
      else setError(availabilityResult.reason instanceof Error ? availabilityResult.reason.message : "Could not load local NSE history. Check that the API is running and import this symbol first.");
      if (savedResult.status === "fulfilled") {
        const [smaResponse, customResponse] = savedResult.value;
        const savedSma = smaResponse.ok ? (smaResponse.json() as Promise<BacktestPayload[]>) : Promise.resolve([]);
        const savedCustom = customResponse.ok ? (customResponse.json() as Promise<BacktestPayload[]>) : Promise.resolve([]);
        Promise.all([savedSma, savedCustom]).then(([sma, custom]) => {
          if (!active) return;
          setSavedRuns([
            ...sma.map((result) => ({ id: result.run_id, strategyId: "sma_crossover", title: "Saved SMA crossover", result, source: "saved" as const })),
            ...custom.filter((result) => !result.symbol || result.symbol === symbol).map((result) => ({ id: result.run_id, strategyId: "custom", title: `Saved ${result.strategy_id ?? "strategy"}`, result, source: "saved" as const })),
          ]);
        }).catch(() => undefined);
      }
      setLoading(false);
    }).catch(() => { if (active) { setError("Could not load local NSE history. Check that the API is running and import this symbol first."); setLoading(false); } });
    return () => { active = false; };
  }, [symbol]);

  useEffect(() => {
    if (availability?.earliest && !new URLSearchParams(window.location.search).get("start")) setStart(availability.earliest.slice(0, 10));
    if (availability?.latest && !new URLSearchParams(window.location.search).get("end")) setEnd(availability.latest.slice(0, 10));
  }, [availability]);

  const visibleStrategies = useMemo(() => STRATEGIES.filter((strategy) => `${strategy.title} ${strategy.family} ${strategy.description}`.toLowerCase().includes(search.toLowerCase())), [search]);
  const baseline = results.find((row) => row.id === baselineId) ?? results[0];
  const highestReturn = results.length ? results.reduce((best, row) => metric(row.result, "return") > metric(best.result, "return") ? row : best) : null;
  const bestSharpe = results.length ? results.reduce((best, row) => metric(row.result, "sharpe_ratio") > metric(best.result, "sharpe_ratio") ? row : best) : null;
  const lowestDrawdown = results.length ? results.reduce((best, row) => metric(row.result, "drawdown") < metric(best.result, "drawdown") ? row : best) : null;

  const toggleStrategy = (strategyId: string) => setSelectedStrategies((current) => current.includes(strategyId) ? current.filter((id) => id !== strategyId) : [...current, strategyId]);
  const runMatrix = async () => {
    if (!selectedStrategies.length) { setError("Select at least one strategy before running the comparison."); return; }
    if (!start || !end || start > end) { setError("Choose a valid date range."); return; }
    if (initialCapital <= 0 || positionSize <= 0 || positionSize > initialCapital) { setError("Per-trade amount must be positive and no larger than starting capital."); return; }
    setRunning(true); setError(null);
    const selected = STRATEGIES.filter((strategy) => selectedStrategies.includes(strategy.id));
    const settled = await Promise.allSettled(selected.map(async (strategy): Promise<MatrixResult> => {
      const response = await withTimeout(fetch(`${API_BASE_URL}/backtests/custom`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, strategy_id: strategy.id, timeframe, start: `${start}T00:00:00`, end: `${end}T23:59:59`, initial_capital: initialCapital, rsi_period: 14, rsi_oversold: 30, rsi_overbought: 70, fast_ema: strategy.id === "macd_crossover" ? 12 : 20, slow_ema: strategy.id === "macd_crossover" ? 26 : 50, commission_pct: 0.001, slippage_pct: 0.0005, stop_loss_pct: stopLoss / 100, take_profit_pct: takeProfit / 100, position_size_amount: positionSize, max_positions: 1 }),
      }), `The ${strategy.title} test timed out. Check the API and local data.`);
      const payload = await response.json().catch(() => ({})) as BacktestPayload;
      if (!response.ok) throw new Error(payload.detail ?? `Could not run ${strategy.title}.`);
      return { id: payload.run_id, strategyId: strategy.id, title: strategy.title, result: payload, source: "matrix" };
    }));
    const next = settled.filter((item): item is PromiseFulfilledResult<MatrixResult> => item.status === "fulfilled").map((item) => item.value);
    setResults(next); setBaselineId(next[0]?.id ?? "");
    const failures = settled.filter((item) => item.status === "rejected");
    if (failures.length) setError(`${next.length} strategy${next.length === 1 ? "" : "ies"} completed; ${failures.length} could not run. ${failures[0].status === "rejected" ? failures[0].reason?.message ?? "Check the API response." : ""}`);
    setRunning(false);
  };

  return <div className="backtrack-page"><TopBar /><main className="backtrack-content bt-stack comparison-page">
    <section className="bt-heading-row comparison-heading"><div><div className="bt-kicker"><span className="live-dot" /> COMPARE TESTS</div><h1>Compare rules on the same evidence.</h1><p>Run several strategies against the same NSE symbol, dates, costs and risk limits. This makes the differences between rules easy to see.</p></div><span className="data-source"><Scale size={14} /> Local NSE cache</span></section>

    <section className="comparison-callout" aria-label="How compare tests works"><div className="comparison-callout-icon"><Info size={17} /></div><div><strong>What this page does</strong><p>It reruns each selected rule independently with identical inputs, then puts the historical metrics side by side. Higher return and Sharpe are generally better; a more negative drawdown means a deeper fall.</p><p><strong>What it does not do:</strong> it does not predict the next trade, select a guaranteed winner, or place an order. Use <Link href="/research">Test Strategy</Link> when you want one strategy’s candle-by-candle replay, entry/exit markers and trade P&amp;L.</p></div></section>
    {loadedFromResearch && <div className="comparison-handoff"><Check size={15} /> Inputs loaded from Test Strategy. Add more rules, then run a fair side-by-side comparison.</div>}

    <section className="bt-panel comparison-panel"><div className="comparison-section-title"><div><span className="bt-eyebrow">1 · EXPERIMENT INPUTS</span><h2>Keep the comparison fair</h2><p>Every selected strategy receives these exact settings.</p></div><span className="text-xs text-slate-500">{availability?.bars ? `${availability.bars.toLocaleString()} cached bars` : "Checking cache…"}</span></div><div className="bt-grid-2 comparison-fields"><div><label className="bt-field-label">NSE symbol</label><SymbolCombobox value={symbol} onChange={(next) => { setSymbol(next); setResults([]); }} /></div><div><label className="bt-field-label">Timeframe</label><select className="bt-field-input" value={timeframe} onChange={(event) => setTimeframe(event.target.value)}>{TIMEFRAMES.map((item) => <option value={item.value} key={item.value}>{item.label} · {item.detail}</option>)}</select></div><div><label className="bt-field-label">From</label><input className="bt-field-input" type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} /></div><div><label className="bt-field-label">To</label><input className="bt-field-input" type="date" value={end} min={start} max={today} onChange={(event) => setEnd(event.target.value)} /></div><div><label className="bt-field-label">Starting capital (₹)</label><input className="bt-field-input" type="number" min="1" value={initialCapital} onChange={(event) => setInitialCapital(Number(event.target.value))} /><span className="bt-field-help">The simulated account balance.</span></div><div><label className="bt-field-label">Amount per trade (₹)</label><input className="bt-field-input" type="number" min="1" value={positionSize} onChange={(event) => setPositionSize(Number(event.target.value))} /><span className="bt-field-help">The same rupee amount is committed by every rule.</span></div><div><label className="bt-field-label">Maximum loss per trade (%)</label><input className="bt-field-input" type="number" min="0" max="99" step="0.5" value={stopLoss} onChange={(event) => setStopLoss(Number(event.target.value))} /></div><div><label className="bt-field-label">Profit target per trade (%)</label><input className="bt-field-input" type="number" min="0" max="500" step="0.5" value={takeProfit} onChange={(event) => setTakeProfit(Number(event.target.value))} /></div></div>{availability?.bars === 0 && <div className="bt-alert-error" style={{ marginTop: 14 }}>No local history is available for {symbol}. Import it from Data &amp; Providers first.</div>}{error && <div className="bt-alert-error" role="alert" style={{ marginTop: 14 }}>{error}</div>}</section>

    <section className="bt-panel comparison-panel"><div className="comparison-section-title"><div><span className="bt-eyebrow">2 · STRATEGY SET</span><h2>Choose the rules to compare</h2><p>These are deterministic, commonly used templates—not recommendations.</p></div><div className="comparison-search"><Search size={14} /><input aria-label="Search strategies" placeholder="Search by name or style" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div><div className="comparison-strategy-grid">{visibleStrategies.map((strategy) => { const selected = selectedStrategies.includes(strategy.id); return <button key={strategy.id} type="button" aria-pressed={selected} onClick={() => toggleStrategy(strategy.id)} className={`comparison-strategy-card${selected ? " is-selected" : ""}`}><div className="bt-row-between"><span className="comparison-family">{strategy.family}</span><span className="comparison-check">{selected ? <Check size={15} /> : "＋"}</span></div><strong>{strategy.title}</strong><p>{strategy.description}</p><small>{strategy.use}</small><code>{strategy.parameters}</code></button>; })}</div><div className="comparison-run-row"><span className="text-xs text-slate-500">{selectedStrategies.length} selected · same dates, costs and risk settings</span><button className="bt-primary" onClick={() => void runMatrix()} disabled={running || !availability?.bars}>{running ? <><Loader2 size={14} className="spin" /> Running {selectedStrategies.length} tests…</> : <><Play size={14} /> Run comparison</>}</button></div></section>

    <div className="bt-kpi-grid comparison-kpis"><div className="bt-stat-card mint"><span>Best total return</span><strong>{highestReturn ? percentage(metric(highestReturn.result, "return")) : "—"}</strong><small>{highestReturn?.title ?? "Run a comparison first"}</small><TrendingUp /></div><div className="bt-stat-card blue"><span>Best Sharpe</span><strong>{bestSharpe ? metric(bestSharpe.result, "sharpe_ratio").toFixed(2) : "—"}</strong><small>{bestSharpe?.title ?? "Risk-adjusted return"}</small><Scale /></div><div className="bt-stat-card rose"><span>Deepest drawdown</span><strong>{lowestDrawdown ? percentage(metric(lowestDrawdown.result, "drawdown")) : "—"}</strong><small>{lowestDrawdown?.title ?? "Most negative peak-to-trough fall"}</small><AlertTriangle /></div><div className="bt-stat-card violet"><span>Runs completed</span><strong>{results.length}</strong><small>Fresh tests in this matrix</small><Scale /></div></div>

    <section className="bt-panel comparison-results"><div className="comparison-results-head"><div><span className="bt-eyebrow">3 · RESULTS</span><h2>Side-by-side historical outcome</h2><p>Use the reference row to see each strategy’s return difference. A metric is evidence, not a promise.</p></div>{results.length > 0 && <label className="comparison-baseline">Reference row<select className="bt-sort-select" value={baseline?.id ?? ""} onChange={(event) => setBaselineId(event.target.value)}>{results.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label>}</div>{loading ? <div className="comparison-empty"><Loader2 size={18} className="spin" /> Loading saved tests…</div> : results.length === 0 ? <div className="comparison-empty"><Scale size={20} /><strong>No comparison has been run yet.</strong><span>Select at least one strategy above. Previous saved tests are shown below as context.</span></div> : <div className="bt-table-wrap"><table className="bt-table"><thead><tr><th>Strategy / run</th><th className="right">Total return</th><th className="right">Sharpe</th><th className="right">Max drawdown</th><th className="right">Win rate</th><th className="right">Trades</th></tr></thead><tbody>{results.map((row) => { const base = baseline ? metric(baseline.result, "return") : 0; const difference = metric(row.result, "return") - base; return <tr key={row.id} className={row.id === baseline?.id ? "baseline" : undefined}><td><strong>{row.title}</strong><br /><span className="bt-val-muted">{row.result.timeframe ?? timeframe} · {symbol} · {start} to {end}</span></td><td className="right">{percentage(metric(row.result, "return"))} <span className={diffClass(difference)}>{difference >= 0 ? "+" : ""}{(difference * 100).toFixed(2)}%</span></td><td className="right">{metric(row.result, "sharpe_ratio").toFixed(2)}</td><td className="right">{percentage(metric(row.result, "drawdown"))}</td><td className="right">{percentage(metric(row.result, "win_rate"))}</td><td className="right">{Math.round(metric(row.result, "trades"))}</td></tr>; })}</tbody></table></div>}</section>

    {savedRuns.length > 0 && <section className="comparison-saved"><div><span className="bt-eyebrow">SAVED CONTEXT</span><h2>Previous tests</h2><p>Saved runs are kept separate from the fresh matrix so you do not mistake different dates or settings for a fair comparison.</p></div><div className="comparison-saved-list">{savedRuns.slice(0, 6).map((row) => <button key={row.id} type="button" onClick={() => { setResults((current) => current.some((item) => item.id === row.id) ? current : [...current, row]); setBaselineId(row.id); }}>{row.title}<span>{percentage(metric(row.result, "return"))} · {row.id}</span></button>)}</div></section>}
    <div className="comparison-footer"><Info size={15} /><span>For detailed candle replay, indicator lines, entry/exit markers and realized/unrealized trade P&amp;L, open a single run in Test Strategy.</span><Link href="/research" className="bt-secondary">Open Test Strategy</Link></div>
  </main></div>;
}
