"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Loader2, Search, Trash2 } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { fetchWithTimeout } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
type SavedRun = { run_id: string; execution_timestamp: string; source: "backtest" | "custom"; artifactKey?: string; config: { strategy?: string; symbol?: string; fast_window?: number; slow_window?: number; start?: string; end?: string }; metrics: Record<string, number> };
type ApiBacktest = Omit<SavedRun, "source">;
type CustomArtifact = { run_id: string; strategy_id?: string; symbol?: string; metrics?: Record<string, number>; equity_curve?: Array<{ date?: string; timestamp?: string }>; _artifact_key?: string; _saved_at?: string };

export default function BacktestsPage() {
  const [runs, setRuns] = useState<SavedRun[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [backtestResponse, customResponse] = await Promise.all([fetchWithTimeout(`${API_BASE_URL}/backtests`), fetchWithTimeout(`${API_BASE_URL}/research/artifacts/custom_backtest`)]);
      const savedPayload = await backtestResponse.json().catch(() => null);
      const customPayload = await customResponse.json().catch(() => null);
      if (!backtestResponse.ok) throw new Error(savedPayload?.detail ?? "Could not load your tests.");
      if (!customResponse.ok) throw new Error(customPayload?.detail ?? "Could not load saved research tests.");
      if (!Array.isArray(savedPayload) || !Array.isArray(customPayload)) throw new Error("The saved tests response was not valid. Please retry.");
      const savedRuns = (savedPayload as ApiBacktest[]).map((run) => ({ ...run, source: "backtest" as const }));
      const customRuns = (customPayload as CustomArtifact[]).map((run) => {
        const dates = run.equity_curve ?? [];
        const start = dates[0]?.date ?? dates[0]?.timestamp ?? "";
        const end = dates.at(-1)?.date ?? dates.at(-1)?.timestamp ?? "";
        return { run_id: run.run_id, execution_timestamp: run._saved_at ?? end ?? new Date().toISOString(), source: "custom" as const, artifactKey: run._artifact_key, config: { strategy: run.strategy_id ?? "custom strategy", symbol: run.symbol, start: start.slice(0, 10), end: end.slice(0, 10) }, metrics: { ...(run.metrics ?? {}), trade_count: Number(run.metrics?.total_trades ?? 0), maximum_drawdown: Number(run.metrics?.max_drawdown ?? 0) } };
      });
      setRuns([...savedRuns, ...customRuns].sort((left, right) => new Date(right.execution_timestamp).getTime() - new Date(left.execution_timestamp).getTime()));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load your tests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRuns(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRuns, reloadVersion]);

  const deleteRun = async (run: SavedRun) => {
    const runId = run.run_id;
    if (!window.confirm("Delete this saved test? Market data will remain available.")) return;
    setDeleting(runId);
    setError(null);
    setMessage(null);
    try {
      const endpoint = run.source === "custom" && run.artifactKey ? `${API_BASE_URL}/research/artifacts/custom_backtest/${encodeURIComponent(run.artifactKey)}` : `${API_BASE_URL}/backtests/${encodeURIComponent(runId)}`;
      const response = await fetchWithTimeout(endpoint, { method: "DELETE" });
      const payload = await response.json().catch(() => null) as { detail?: string } | null;
      if (!response.ok) throw new Error(payload?.detail ?? "Could not delete this test.");
      setRuns((current) => current.filter((run) => run.run_id !== runId));
      setMessage("Test deleted. Your imported NSE market data was preserved.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not delete this test.");
    } finally {
      setDeleting(null);
    }
  };

  const clearHistory = async () => {
    if (!window.confirm("Clear all saved testing history? This removes saved tests, research analyses, reliability reports, YouTube analyses, and replay sessions. NSE market data and imported archives are preserved.")) return;
    setDeleting("all");
    setError(null);
    setMessage(null);
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/testing-history`, { method: "DELETE" });
      const payload = await response.json().catch(() => null) as { detail?: string; message?: string } | null;
      if (!response.ok) throw new Error(payload?.detail ?? "Could not clear testing history.");
      setRuns([]);
      setMessage(payload?.message ?? "Testing history cleared. Market data was preserved.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not clear testing history.");
    } finally {
      setDeleting(null);
    }
  };

  const filtered = useMemo(() => runs.filter((run) => `${run.run_id} ${run.config.strategy ?? ""} ${run.config.symbol ?? ""}`.toLowerCase().includes(query.toLowerCase())), [runs, query]);
  return <div className="backtrack-page"><TopBar /><main className="backtrack-content bt-stack">
    <section className="bt-heading-row"><div><h1>My tests</h1><p>Every completed historical test saved by the local engine appears here.</p></div><div className="bt-heading-actions"><button type="button" className="bt-secondary" onClick={() => void clearHistory()} disabled={deleting !== null}><Trash2 size={14} /> Clear testing history</button><Link href="/research" className="bt-primary">Start a test <ArrowRight size={14} /></Link></div></section>
    {error && <div className="bt-alert-error bt-row-between" role="alert"><span>{error}</span><button type="button" className="bt-secondary small" onClick={() => setReloadVersion((value) => value + 1)} disabled={loading}>Retry</button></div>}
    {message && <div className="bt-alert-success" role="status">{message}</div>}
    <section className="bt-panel" style={{ padding: "14px 18px" }}><div className="bt-search-input-wrap"><Search size={14} className="text-slate-400" /><input placeholder="Search by stock, strategy, or test ID" value={query} onChange={(event) => setQuery(event.target.value)} /></div></section>
    {loading ? <div className="bt-panel" style={{ padding: "28px" }}><Loader2 size={18} className="spin" /> Loading your tests…</div> : filtered.length === 0 ? <div className="bt-panel" style={{ padding: "32px" }}><h2>{runs.length === 0 ? "No tests yet" : "No matching tests"}</h2><p className="text-xs text-slate-500" style={{ marginTop: "7px" }}>{runs.length === 0 ? "Use the Start a test button above to run a strategy on historical NSE data." : "Try another search."}</p></div> : <section className="bt-panel" style={{ padding: 0, overflow: "hidden" }}><div className="bt-table-wrap"><table className="bt-table"><thead><tr><th>Test</th><th>Stock</th><th>Date tested</th><th className="right">Return</th><th className="right">Sharpe</th><th className="right">Max fall</th><th className="right">Trades</th><th className="right">Actions</th></tr></thead><tbody>{filtered.map((run) => { const detailHref = run.source === "custom" ? `/research?symbol=${encodeURIComponent(run.config.symbol ?? "")}&start=${encodeURIComponent(run.config.start ?? "")}&end=${encodeURIComponent(run.config.end ?? "")}&strategy=${encodeURIComponent(run.config.strategy ?? "")}` : `/backtests/${encodeURIComponent(run.run_id)}`; return <tr key={`${run.source}-${run.run_id}`}><td><Link href={detailHref} className="bt-link"><strong>{run.config.strategy === "sma_crossover" ? `SMA ${run.config.fast_window}/${run.config.slow_window}` : run.config.strategy?.replaceAll("_", " ") ?? "Strategy test"}</strong></Link><br /><span className="bt-val-muted">{run.run_id}</span></td><td>{run.config.symbol ?? "NSE stock"}</td><td><span className="bt-row"><CalendarDays size={13} />{new Date(run.execution_timestamp).toLocaleDateString("en-IN")}</span></td><td className="right">{(Number(run.metrics.total_return ?? 0) * 100).toFixed(2)}%</td><td className="right">{Number(run.metrics.sharpe_ratio ?? 0).toFixed(2)}</td><td className="right">{(Number(run.metrics.maximum_drawdown ?? 0) * 100).toFixed(2)}%</td><td className="right">{Math.round(Number(run.metrics.trade_count ?? 0))}</td><td className="right"><button type="button" className="bt-row-action delete" aria-label={`Delete test ${run.run_id}`} title="Delete this test" onClick={() => void deleteRun(run)} disabled={deleting !== null}><Trash2 size={14} /></button></td></tr>; })}</tbody></table></div></section>}
  </main></div>;
}
