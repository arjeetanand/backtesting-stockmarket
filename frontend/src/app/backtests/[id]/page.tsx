"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowLeft, Download, List, Loader2, ScanLine, Shield, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import { DrawdownChart, EquityChart } from "@/components/charts/Charts";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
type MetricMap = Record<string, number>;
type ApiTrade = { id: string; symbol: string; entry_timestamp: string; exit_timestamp: string; entry_price: number; exit_price: number; size: number; direction: string; pnl: number; return_pct: number; holding_period_seconds: number };
type ApiResult = { run_id: string; strategy_hash: string; data_hash: string; engine_version: string; execution_timestamp: string; config: Record<string, unknown>; trades: ApiTrade[]; equity_curve: Array<{ timestamp: string; equity: number }>; metrics: MetricMap; warnings: string[] };
const TABS = [{ id: "equity", label: "Equity curve", icon: Activity }, { id: "drawdown", label: "Drawdown", icon: TrendingDown }, { id: "trades", label: "Trades", icon: List }, { id: "bias", label: "Data & bias checks", icon: ScanLine }];

function metric(metrics: MetricMap, ...keys: string[]) { return Number(keys.map((key) => metrics[key]).find((value) => typeof value === "number") ?? 0); }
function strategyName(config: Record<string, unknown>) { return config.strategy === "sma_crossover" ? `SMA ${config.fast_window ?? "?"}/${config.slow_window ?? "?"}` : String(config.strategy ?? "Backtest"); }

export default function BacktestResultPage() {
  const params = useParams<{ id: string }>();
  const [result, setResult] = useState<ApiResult | null>(null);
  const [activeTab, setActiveTab] = useState("equity");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    void fetchWithTimeout(`${API_BASE_URL}/backtests/${encodeURIComponent(params.id)}`).then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.detail ?? "Could not load this saved backtest.");
      return payload as ApiResult;
    }).then(setResult).catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Could not load this saved backtest.")).finally(() => setLoading(false));
  }, [params.id]);

  const curve = useMemo(() => {
    if (!result) return [];
    const initial = Number(result.config.initial_capital ?? result.equity_curve[0]?.equity ?? 0);
    return result.equity_curve.map((point) => ({ date: point.timestamp.slice(0, 10), strategy: point.equity, benchmark: initial }));
  }, [result]);
  const drawdown = useMemo(() => {
    let peak = 0;
    return curve.map((point) => { peak = Math.max(peak, point.strategy); return { date: point.date, drawdown: peak ? ((point.strategy - peak) / peak) * 100 : 0 }; });
  }, [curve]);

  if (loading) return <div className="backtrack-page"><TopBar /><main className="backtrack-content"><div className="bt-panel" style={{ padding: "32px" }}><Loader2 size={18} className="spin" /> Loading the saved backtest…</div></main></div>;
  if (error || !result) return <div className="backtrack-page"><TopBar /><main className="backtrack-content bt-stack"><Link href="/backtests" className="bt-link"><ArrowLeft size={14} /> Back to my tests</Link><div className="bt-alert-error" role="alert">{error ?? "This saved backtest was not found."}</div></main></div>;

  const m = result.metrics;
  const symbol = String(result.config.symbol ?? result.trades[0]?.symbol ?? "NSE stock");
  const start = curve[0]?.date ?? "—";
  const end = curve.at(-1)?.date ?? "—";
  const metrics = [
    ["Total return", formatPercent(metric(m, "total_return") * 100), "gain"],
    ["CAGR", formatPercent(metric(m, "cagr") * 100), "gain"],
    ["Sharpe ratio", formatNumber(metric(m, "sharpe_ratio")), "primary"],
    ["Sortino ratio", formatNumber(metric(m, "sortino_ratio")), "primary"],
    ["Maximum drawdown", formatPercent(metric(m, "maximum_drawdown") * 100), "loss"],
    ["Win rate", formatPercent(metric(m, "win_rate") * 100), "gain"],
    ["Profit factor", formatNumber(metric(m, "profit_factor")), "primary"],
    ["Trades", String(Math.round(metric(m, "trade_count"))), "neutral"],
  ];

  return <div className="backtrack-page"><TopBar /><main className="backtrack-content bt-run-detail">
    <section className="bt-run-header" aria-label="Backtest summary"><Link href="/backtests" aria-label="Back to backtest runs" className="bt-run-back"><ArrowLeft size={17} /></Link><div className="bt-run-title-group"><h1>{strategyName(result.config)} · {symbol}</h1><div className="bt-run-meta"><span className="bt-run-id">{result.run_id}</span><i>•</i><span>Completed {new Date(result.execution_timestamp).toLocaleString("en-IN")}</span><i>•</i><span>{start} → {end}</span><i>•</i><span>{result.engine_version}</span></div></div><button type="button" onClick={() => window.print()} className="bt-run-export"><Download size={14} /> Export</button></section>
    <section className="bt-run-metrics" aria-label="Backtest performance metrics">{metrics.map(([label, value, tone]) => <div key={label} className="bt-run-metric"><span>{label}</span><strong className={`bt-run-metric-${tone}`}>{value}</strong></div>)}</section>
    <div className="bt-run-layout"><section className="bt-run-workspace" aria-label="Backtest results"><div className="bt-run-chart-panel"><nav className="bt-run-tabs" aria-label="Backtest result views">{TABS.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-pressed={activeTab === id} onClick={() => setActiveTab(id)} className={cn("bt-run-tab", activeTab === id && "is-active")}><Icon size={14} /> {label}</button>)}</nav><div className="bt-run-chart-content">
      {activeTab === "equity" && <><div className="bt-run-chart-caption"><span>Final equity: <b>{formatCurrency(result.equity_curve.at(-1)?.equity ?? 0)}</b></span><span>Initial capital: {formatCurrency(Number(result.config.initial_capital ?? 0))}</span></div><EquityChart data={curve} height={286} /></>}
      {activeTab === "drawdown" && <><p className="bt-run-chart-caption">Maximum drawdown: <b className="text-rose-600">{formatPercent(metric(m, "maximum_drawdown") * 100)}</b></p><DrawdownChart data={drawdown} height={286} /></>}
      {activeTab === "trades" && <TradesView trades={result.trades} />}
      {activeTab === "bias" && <BiasView warnings={result.warnings} config={result.config} />}
    </div></div></section><aside className="bt-run-analysis" aria-label="Backtest summary"><div className="bt-run-analysis-title"><Shield size={19} /><h2>What this result means</h2></div><div className="bt-run-stats"><h3>Run details</h3>{[["Stock", symbol], ["Strategy", strategyName(result.config)], ["Timeframe", String(result.config.timeframe ?? "1day")], ["Initial capital", formatCurrency(Number(result.config.initial_capital ?? 0))], ["Final equity", formatCurrency(result.equity_curve.at(-1)?.equity ?? 0)], ["Data hash", result.data_hash.slice(0, 12)]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div><div className="bt-run-bias-summary"><h3><AlertTriangle size={14} /> Warnings</h3>{result.warnings.length ? result.warnings.map((warning) => <p key={warning} className="text-xs text-slate-600">{warning}</p>) : <p className="text-xs text-emerald-700">No warnings were returned by the engine.</p>}</div></aside></div>
  </main></div>;
}

function TradesView({ trades }: { trades: ApiTrade[] }) {
  if (!trades.length) return <div className="bt-panel" style={{ padding: "24px" }}><p>No trades were generated for this configuration.</p><p className="text-xs text-slate-500" style={{ marginTop: "6px" }}>This is a valid result: the entry rule did not trigger during the selected period.</p></div>;
  return <div className="bt-run-trades"><div className="bt-run-trade-table">{trades.map((trade) => <div key={trade.id}><span>{trade.id}</span><b>{trade.symbol}</b><span>{trade.entry_timestamp.slice(0, 10)} → {trade.exit_timestamp.slice(0, 10)}</span><strong className={trade.pnl >= 0 ? "gain" : "loss"}>{trade.pnl >= 0 ? "+" : ""}{formatCurrency(trade.pnl)}</strong></div>)}</div></div>;
}

function BiasView({ warnings, config }: { warnings: string[]; config: Record<string, unknown> }) {
  const executionModel = String(config.execution_model ?? "Configured by the backtest engine");
  return <div className="bt-run-bias-view"><p>This run uses the engine metadata and warnings saved with the result.</p><div className="bt-run-bias-summary"><h3><Shield size={14} /> Execution audit</h3><div><span>Execution model</span><b className="pass">Recorded</b></div><p className="text-xs text-slate-600">{executionModel}</p><div><span>Warnings</span><b className={warnings.length ? "warn" : "pass"}>{warnings.length ? `${warnings.length} WARN` : "PASS"}</b></div>{warnings.map((warning) => <p key={warning} className="text-xs text-amber-700">{warning}</p>)}</div></div>;
}
