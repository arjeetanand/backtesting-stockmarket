"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Loader2, Search } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { fetchWithTimeout } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
type SavedRun = { run_id: string; execution_timestamp: string; config: { strategy?: string; symbol?: string; fast_window?: number; slow_window?: number }; metrics: Record<string, number> };

export default function BacktestsPage() {
  const [runs, setRuns] = useState<SavedRun[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchWithTimeout(`${API_BASE_URL}/backtests`).then(async (response) => { const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.detail ?? "Could not load your tests."); return payload as SavedRun[]; }).then(setRuns).catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Could not load your tests.")).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => runs.filter((run) => `${run.run_id} ${run.config.strategy ?? ""} ${run.config.symbol ?? ""}`.toLowerCase().includes(query.toLowerCase())), [runs, query]);
  return <div className="backtrack-page"><TopBar /><main className="backtrack-content bt-stack">
    <section className="bt-heading-row"><div><h1>My tests</h1><p>Every completed historical test saved by the local engine appears here.</p></div><Link href="/research" className="bt-primary">Start a test <ArrowRight size={14} /></Link></section>
    {error && <div className="bt-alert-error" role="alert">{error}</div>}
    <section className="bt-panel" style={{ padding: "14px 18px" }}><div className="bt-search-input-wrap"><Search size={14} className="text-slate-400" /><input placeholder="Search by stock, strategy, or test ID" value={query} onChange={(event) => setQuery(event.target.value)} /></div></section>
    {loading ? <div className="bt-panel" style={{ padding: "28px" }}><Loader2 size={18} className="spin" /> Loading your tests…</div> : filtered.length === 0 ? <div className="bt-panel" style={{ padding: "32px" }}><h2>{runs.length === 0 ? "No tests yet" : "No matching tests"}</h2><p className="text-xs text-slate-500" style={{ marginTop: "7px" }}>{runs.length === 0 ? "Run a strategy on historical NSE data and it will appear here." : "Try another search."}</p>{runs.length === 0 && <Link href="/research" className="bt-link" style={{ display: "inline-flex", marginTop: "14px" }}>Start your first test <ArrowRight size={13} /></Link>}</div> : <section className="bt-panel" style={{ padding: 0, overflow: "hidden" }}><div className="bt-table-wrap"><table className="bt-table"><thead><tr><th>Test</th><th>Stock</th><th>Date tested</th><th className="right">Return</th><th className="right">Sharpe</th><th className="right">Max fall</th><th className="right">Trades</th></tr></thead><tbody>{filtered.map((run) => <tr key={run.run_id}><td><Link href={`/backtests/${encodeURIComponent(run.run_id)}`} className="bt-link"><strong>{run.config.strategy === "sma_crossover" ? `SMA ${run.config.fast_window}/${run.config.slow_window}` : "Strategy test"}</strong></Link><br /><span className="bt-val-muted">{run.run_id}</span></td><td>{run.config.symbol ?? "NSE stock"}</td><td><span className="bt-row"><CalendarDays size={13} />{new Date(run.execution_timestamp).toLocaleDateString("en-IN")}</span></td><td className="right">{(Number(run.metrics.total_return ?? 0) * 100).toFixed(2)}%</td><td className="right">{Number(run.metrics.sharpe_ratio ?? 0).toFixed(2)}</td><td className="right">{(Number(run.metrics.maximum_drawdown ?? 0) * 100).toFixed(2)}%</td><td className="right">{Math.round(Number(run.metrics.trade_count ?? 0))}</td></tr>)}</tbody></table></div></section>}
  </main></div>;
}
