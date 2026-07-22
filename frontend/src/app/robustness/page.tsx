"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, RefreshCw, TrendingUp } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { SymbolCombobox } from "@/components/data/SymbolCombobox";
import { getMarketAvailability, type MarketAvailability } from "@/lib/market-data";
import { analyzeRobustness, type RobustnessReport, type SensitivityCell } from "@/lib/robustness-api";

function scoreClass(score: number) { return score >= 75 ? "ok" : score >= 50 ? "warn" : "critical"; }
function heatClass(value: number, min: number, max: number) {
  const ratio = max === min ? 0.5 : (value - min) / (max - min);
  return ratio >= 0.8 ? "high-strong" : ratio >= 0.6 ? "high-mid" : ratio >= 0.35 ? "mid" : ratio <= 0.12 ? "low-strong" : "low-mid";
}
function linePoints(values: number[], min: number, max: number) {
  return values.map((value, index) => `${values.length <= 1 ? 50 : (index / (values.length - 1)) * 100},${max === min ? 50 : 96 - ((value - min) / (max - min)) * 88}`).join(" ");
}
function formatScore(value: number | undefined) { return value === undefined ? "—" : String(value); }

export default function RobustnessPage() {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [availability, setAvailability] = useState<MarketAvailability | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [lookbackInput, setLookbackInput] = useState("10,14,20,30,40,50");
  const [thresholdInput, setThresholdInput] = useState("20,25,30,35,40");
  const [report, setReport] = useState<RobustnessReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const next = await getMarketAvailability(symbol);
        if (!active) return;
        setAvailability(next);
        setStart((current) => current || next.earliest?.slice(0, 10) || "");
        setEnd((current) => current || next.latest?.slice(0, 10) || "");
      } catch (requestError) { if (active) setError(requestError instanceof Error ? requestError.message : "Could not read local data availability."); }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [symbol]);

  const runAnalysis = async () => {
    const lookbackRange = lookbackInput.split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value >= 2);
    const thresholdRange = thresholdInput.split(",").map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value >= 5 && value <= 50);
    if (!symbol.trim()) { setError("Choose an NSE symbol first."); return; }
    if (!start || !end || start > end) { setError("Choose a valid analysis date range."); return; }
    if (lookbackRange.length < 2 || thresholdRange.length < 2) { setError("Enter at least two valid lookback and threshold values."); return; }
    setLoading(true); setError(null); setReport(null);
    try { setReport(await analyzeRobustness({ symbol: symbol.trim().toUpperCase(), start, end, lookbackRange, thresholdRange })); setLastUpdated(new Date().toLocaleTimeString()); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not run robustness analysis."); }
    finally { setLoading(false); }
  };

  const heatmap = useMemo(() => {
    if (!report) return { rows: [], lookbacks: [], thresholds: [], min: 0, max: 0 };
    const lookbacks = [...new Set(report.sensitivity_grid.map((cell) => cell.lookback))];
    const thresholds = [...new Set(report.sensitivity_grid.map((cell) => cell.threshold))];
    const values = report.sensitivity_grid.map((cell) => cell.sharpe_ratio);
    const rows = lookbacks.map((lookback) => thresholds.map((threshold) => report.sensitivity_grid.find((cell) => cell.lookback === lookback && cell.threshold === threshold)).filter((cell): cell is SensitivityCell => Boolean(cell)));
    return { rows, lookbacks, thresholds, min: Math.min(...values), max: Math.max(...values) };
  }, [report]);

  const mcMax = report ? Math.max(...report.monte_carlo.distribution_bins.map((bin) => bin.count), 1) : 1;
  const wfValues = report?.walk_forward.flatMap((point) => [point.in_sample_cagr, point.out_of_sample_cagr]) ?? [];
  const wfMin = wfValues.length ? Math.min(...wfValues) : 0;
  const wfMax = wfValues.length ? Math.max(...wfValues) : 1;

  return <div className="backtrack-page"><TopBar /><div className="backtrack-content bt-stack">
    <section className="bt-heading-row"><div><div className="bt-kicker"><span className="live-dot" /> IS THIS RESULT RELIABLE</div><h1>How dependable is this result?</h1><p>Change the settings and market conditions to see whether the idea still works.</p></div><div className="bt-heading-actions"><span className="data-source"><TrendingUp size={14} /> {lastUpdated ? `Updated ${lastUpdated}` : "Awaiting analysis"}</span></div></section>

    <section className="bt-panel bt-robustness-controls"><div className="bt-panel-head"><div><span className="bt-eyebrow">LIVE ANALYSIS INPUT</span><h2>Choose a stock and date range</h2></div><span className="bt-panel-note">{availability?.bars ? `${availability.bars.toLocaleString("en-IN")} days of saved history` : "No availability loaded"}</span></div><div className="bt-grid-12"><div className="bt-col-4"><label className="bt-field-label">NSE Symbol</label><SymbolCombobox value={symbol} onChange={(next) => { setSymbol(next); setReport(null); }} /></div><div className="bt-col-3"><label className="bt-field-label">From</label><input type="date" className="bt-field-input" value={start} min={availability?.earliest?.slice(0, 10)} max={end || availability?.latest?.slice(0, 10)} onChange={(event) => setStart(event.target.value)} /></div><div className="bt-col-3"><label className="bt-field-label">To</label><input type="date" className="bt-field-input" value={end} min={start || availability?.earliest?.slice(0, 10)} max={availability?.latest?.slice(0, 10)} onChange={(event) => setEnd(event.target.value)} /></div><div className="bt-col-2 bt-robustness-run"><button type="button" className="bt-secondary" onClick={() => void runAnalysis()} disabled={loading}><Activity size={14} /> Run</button></div></div><div className="bt-robustness-ranges"><label><span>Indicator periods</span><input className="bt-field-input bt-field-mono" value={lookbackInput} onChange={(event) => setLookbackInput(event.target.value)} /></label><label><span>RSI levels</span><input className="bt-field-input bt-field-mono" value={thresholdInput} onChange={(event) => setThresholdInput(event.target.value)} /></label></div>{error && <p className="bt-alert-error" role="alert">{error}</p>}</section>

    {!report && !loading && !error && <div className="bt-data-note"><CheckCircle2 size={17} className="text-indigo-600" /><span>Run the analysis to populate every chart from the selected NSE data. No seeded chart values are shown.</span></div>}
    {loading && <div className="bt-panel bt-loading-state"><RefreshCw size={18} className="spin" /><span>Checking different settings against the saved NSE history…</span></div>}

    {report && <>
      <div className="bt-grid-12"><div className="bt-col-4 bt-panel bt-score-card"><div><span className="bt-eyebrow">OVERALL SCORE</span><div className="bt-score-line"><span className={`bt-score-number ${scoreClass(report.aggregate_score)}`}>{formatScore(report.aggregate_score)}</span><span className="bt-score-denom">/100</span></div></div><div className="bt-score-rows">{[["Parameter Stability", report.parameter_stability_score], ["OOS Degradation", report.oos_degradation_score], ["Stress Resilience", report.stress_resilience_score]].map(([label, value]) => <div className="bt-score-row" key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div><small className="bt-report-id">Run {report.run_id}</small></div>
        <div className="bt-col-8 bt-panel bt-heatmap-panel"><div className="bt-panel-head"><div><span className="bt-eyebrow">DO DIFFERENT SETTINGS STILL WORK?</span><h2>Settings comparison</h2></div><span className="bt-panel-note">Result score · live test</span></div><div className="bt-live-heatmap"><div className="bt-live-heatmap-y">{heatmap.lookbacks.map((value) => <span key={value}>{value}</span>)}</div><div className="bt-live-heatmap-grid" style={{ gridTemplateColumns: `repeat(${heatmap.thresholds.length}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${heatmap.rows.length}, minmax(0, 1fr))` }}>{heatmap.rows.flat().map((cell) => <div key={`${cell.lookback}-${cell.threshold}`} className={`bt-heatmap-cell ${heatClass(cell.sharpe_ratio, heatmap.min, heatmap.max)}`} title={`Lookback ${cell.lookback}, threshold ${cell.threshold}: Sharpe ${cell.sharpe_ratio.toFixed(2)}`}><span>{cell.sharpe_ratio.toFixed(2)}</span></div>)}</div><div className="bt-live-heatmap-x">{heatmap.thresholds.map((value) => <span key={value}>{value}</span>)}</div></div><p className="bt-heatmap-note">Rows are indicator periods; columns are RSI levels.</p></div></div>

      <div className="bt-grid-2"><div className="bt-panel bt-wf-panel"><p className="bt-wf-title">Performance on new data</p>{report.walk_forward.length ? <div className="bt-live-line-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={linePoints(report.walk_forward.map((point) => point.in_sample_cagr), wfMin, wfMax)} fill="none" stroke="#38bdf8" strokeDasharray="3 3" strokeWidth="2.5" /><polyline points={linePoints(report.walk_forward.map((point) => point.out_of_sample_cagr), wfMin, wfMax)} fill="none" stroke="#4f46e5" strokeWidth="3" /></svg>{report.walk_forward.map((point, index) => <div key={point.period} className="bt-wf-point" style={{ left: `${report.walk_forward.length <= 1 ? 50 : (index / (report.walk_forward.length - 1)) * 100}%` }} title={`Period ${point.period}: IS ${point.in_sample_cagr.toFixed(2)}%, OOS ${point.out_of_sample_cagr.toFixed(2)}%`} />)}</div> : <div className="bt-chart-empty">Not enough bars for walk-forward folds.</div>}<div className="bt-wf-legend"><div className="bt-wf-legend-item"><span className="bt-wf-is-line" />In the setup period</div><div className="bt-wf-legend-item"><span className="bt-wf-oos-line" />On new data</div></div></div>
        <div className="bt-panel bt-mc-panel"><p className="bt-mc-title">Many possible outcomes (n={report.monte_carlo.num_simulations.toLocaleString("en-IN")})</p><div className="bt-mc-bars">{report.monte_carlo.distribution_bins.map((bin) => <div key={`${bin.bin_start}-${bin.bin_end}`} className={`bt-mc-bar${bin.count === mcMax ? " peak" : ""}`} style={{ height: `${Math.max(2, (bin.count / mcMax) * 100)}%` }} title={`${bin.bin_start.toFixed(1)}% to ${bin.bin_end.toFixed(1)}%: ${bin.count} simulations`} />)}</div><div className="bt-mc-footer"><span>{report.monte_carlo.percentile_5th.toFixed(1)}%</span><span className="bt-mc-mean">Mean: {report.monte_carlo.mean_return.toFixed(1)}%</span><span>{report.monte_carlo.percentile_95th.toFixed(1)}%</span></div></div></div>

      <div className="bt-panel" style={{ padding: 0, overflow: "hidden" }}><div className="bt-panel-head" style={{ padding: "14px 24px", borderBottom: "1px solid #e2e8f0" }}><div><span className="bt-eyebrow">TOUGH MARKET CONDITIONS</span><h2>What if the market changes?</h2></div><span className="bt-panel-note">Derived from {symbol.toUpperCase()} history</span></div><div className="bt-table-wrap"><table className="bt-table"><thead><tr><th className="left">Market condition</th><th className="right">Normal result</th><th className="right">Tougher result</th><th className="right">Normal worst fall</th><th className="right">Tougher worst fall</th><th className="center">Result</th></tr></thead><tbody>{report.stress_tests.map((scenario) => <tr key={scenario.scenario}><td>{scenario.scenario}</td><td className="right">{scenario.base_cagr.toFixed(1)}%</td><td className="right">{scenario.stressed_cagr.toFixed(1)}%</td><td className="right">{scenario.base_max_dd.toFixed(1)}%</td><td className="right">{scenario.stressed_max_dd.toFixed(1)}%</td><td className="center"><span className={scenario.status === "PASS" ? "bt-stress-pass" : "bt-stress-fail"}>{scenario.status}</span></td></tr>)}</tbody></table></div></div>
    </>}
  </div></div>;
}
