"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, FileText, Play, Video } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { SymbolCombobox } from "@/components/data/SymbolCombobox";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
type SavedRun = { run_id: string; config: { strategy?: string; symbol?: string; fast_window?: number; slow_window?: number }; execution_timestamp: string; metrics: Record<string, number> };

export default function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [symbol, setSymbol] = useState("RELIANCE");
  const [start, setStart] = useState("2024-01-01");
  const [end, setEnd] = useState("2026-06-30");
  const [runs, setRuns] = useState<SavedRun[]>([]);

  useEffect(() => {
    void fetch(`${API_BASE_URL}/backtests`).then((response) => response.ok ? response.json() : []).then((data: SavedRun[]) => setRuns(data)).catch(() => setRuns([]));
  }, []);

  const researchUrl = `/research?symbol=${encodeURIComponent(symbol)}&start=${start}&end=${end}`;
  return <div className="backtrack-page"><TopBar /><main className="backtrack-content bt-stack">
    <section className="bt-heading-row"><div><h1>What would you like to test?</h1><p>Choose a stock, choose a time period, and test your idea using historical NSE data.</p></div></section>

    <section className="bt-panel bt-home-controls" style={{ padding: "20px" }}><div className="bt-grid-2"><div><label className="bt-field-label">Choose a stock</label><SymbolCombobox value={symbol} onChange={setSymbol} /></div><div><label className="bt-field-label">Time period</label><div className="bt-home-date-range"><CalendarDays size={16} className="text-slate-400" /><input className="bt-field-input" type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} /><span>to</span><input className="bt-field-input" type="date" value={end} min={start} max={today} onChange={(event) => setEnd(event.target.value)} /></div></div></div></section>

    <section className="bt-grid-3 bt-home-actions" aria-label="Choose what to test">
      <Link href={researchUrl} className="bt-panel bt-action-card">
        <span className="bt-action-card-icon"><FileText size={21} /></span>
        <div className="bt-action-card-copy"><h2>Start with a strategy</h2><p>Pick a known strategy or describe your own rules, then test them on history.</p></div>
        <span className="bt-action-card-action">Start testing <ArrowRight size={14} /></span>
      </Link>
      <Link href="/strategy-import" className="bt-panel bt-action-card">
        <span className="bt-action-card-icon"><Video size={21} /></span>
        <div className="bt-action-card-copy"><h2>Use a YouTube strategy</h2><p>Bring in a strategy you found online and review its rules before testing.</p></div>
        <span className="bt-action-card-action">Import a strategy <ArrowRight size={14} /></span>
      </Link>
      <Link href={`/replay?symbol=${encodeURIComponent(symbol)}&start=${start}&end=${end}`} className="bt-panel bt-action-card">
        <span className="bt-action-card-icon"><Play size={21} /></span>
        <div className="bt-action-card-copy"><h2>Replay the chart</h2><p>Move through the historical candles one step at a time to understand what happened.</p></div>
        <span className="bt-action-card-action">Open replay <ArrowRight size={14} /></span>
      </Link>
    </section>

    <section><div className="bt-row-between" style={{ marginBottom: "12px" }}><div><h2>Your recent tests</h2><p className="text-xs text-slate-500">Only tests saved by the local backtest engine appear here.</p></div><Link href="/backtests" className="bt-link">View all tests <ArrowRight size={13} /></Link></div>{runs.length === 0 ? <div className="bt-panel" style={{ padding: "28px" }}><p>No tests yet.</p><p className="text-xs text-slate-500" style={{ marginTop: "6px" }}>Start a strategy test above and your real result will appear here.</p></div> : <div className="bt-panel" style={{ padding: 0, overflow: "hidden" }}><div className="bt-table-wrap"><table className="bt-table"><thead><tr><th>Test</th><th>Stock</th><th>Period</th><th className="right">Return</th><th className="right">Win rate</th><th className="right">Max fall</th></tr></thead><tbody>{runs.slice(0, 5).map((run) => <tr key={run.run_id}><td><strong>{run.config.strategy === "sma_crossover" ? `SMA ${run.config.fast_window}/${run.config.slow_window}` : "Strategy test"}</strong><br /><span className="bt-val-muted">{run.run_id}</span></td><td>{run.config.symbol ?? "Local NSE"}</td><td>{new Date(run.execution_timestamp).toLocaleDateString("en-IN")}</td><td className="right">{(Number(run.metrics.total_return ?? 0) * 100).toFixed(2)}%</td><td className="right">{(Number(run.metrics.win_rate ?? 0) * 100).toFixed(1)}%</td><td className="right">{(Number(run.metrics.maximum_drawdown ?? 0) * 100).toFixed(2)}%</td></tr>)}</tbody></table></div></div>}</section>
    <div className="bt-callout"><strong>New to backtesting?</strong><p>Start with Learn to understand stocks, options, and the difference between a historical test and a live trade.</p><Link href="/options" className="bt-link">Open Learn <ArrowRight size={13} /></Link></div>
  </main></div>;
}
