"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Check, CheckCircle, ChevronRight, Circle, Code2, Loader2, MessageSquare, Play, Send, Sparkles, Star, TrendingDown, TrendingUp } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { getMarketAvailability, type MarketAvailability } from "@/lib/market-data";
import { SymbolCombobox } from "@/components/data/SymbolCombobox";
import { STRATEGY_LIBRARY } from "@/lib/strategy-library";
import StrategyReplay from "@/components/research/StrategyReplay";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
const EXAMPLES = [
  "Test whether a 20/50 moving-average crossover can capture medium-term trends.",
  "Test a conservative long-only crossover strategy with realistic costs.",
  "Compare a short and long moving average across a complete market cycle.",
];

const TIMEFRAMES = [
  { value: "1day", label: "Daily", detail: "Official NSE candles" },
  { value: "1week", label: "Weekly", detail: "Resampled from NSE daily" },
  { value: "1month", label: "Monthly", detail: "Resampled from NSE daily" },
  { value: "1hour", label: "Hourly", detail: "Intraday provider required", unavailable: true },
];

type StepStatus = "complete" | "running" | "pending";
type HypothesisAnalysis = {
  generated_by?: string;
  model?: string;
  summary: string;
  assumptions: string[];
  risks: string[];
  suggested_backtest: { symbol: string; timeframe: string; fast_window: number; slow_window: number; rationale: string };
};
type BacktestResult = {
  run_id: string;
  symbol: string;
  timeframe: string;
  strategy_id?: string;
  initial_capital: number;
  final_equity: number;
  trades: Array<{ id?: string; trade_id?: number; symbol?: string; entry_date?: string; exit_date?: string; entry_price?: number; exit_price?: number; pnl: number; return_pct: number; holding_days?: number; entry_amount?: number; max_unrealized_pnl?: number; min_unrealized_pnl?: number }>;
  equity_curve?: Array<{ date?: string; timestamp?: string; equity: number }>;
  drawdown_curve?: Array<{ date?: string; timestamp?: string; drawdown: number }>;
  candles?: Array<{ date: string; open: number; high: number; low: number; close: number }>;
  indicators?: Record<string, Array<{ date: string; value: number | null }>>;
  signals?: Array<{ date: string; type: "entry" | "exit"; price: number }>;
  trade_path?: Array<{ trade_id: number; date: string; entry_amount: number; market_value: number; unrealized_pnl: number; realized_pnl: number }>;
  metrics: Record<string, number>;
  warnings: string[];
};
type ImportJob = {
  job_id: string;
  status: "queued" | "running" | "complete" | "failed";
  message: string;
  stage?: string;
  completed_days?: number;
  total_days?: number;
};

const PIPELINE = ["Parse hypothesis", "Validate proposal", "Select local data", "Compile strategy", "Run backtest", "Calculate metrics", "Check bias"];
const moneyLabel = (value: number) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then((value) => { window.clearTimeout(timer); resolve(value); }, (reason) => { window.clearTimeout(timer); reject(reason); });
  });
}

function ResearchResultChart({ curve, trades }: { curve: Array<{ date?: string; timestamp?: string; equity: number }>; trades: BacktestResult["trades"] }) {
  const width = 900;
  const height = 250;
  const left = 52;
  const right = 18;
  const top = 18;
  const bottom = 34;
  const safeCurve = curve
    .map((point) => ({ date: point.date ?? point.timestamp, equity: Number(point.equity) }))
    .filter((point) => Number.isFinite(point.equity));
  const values = safeCurve.map((point) => point.equity);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const range = Math.max(max - min, 1);
  const xFor = (index: number) => left + (index / Math.max(safeCurve.length - 1, 1)) * (width - left - right);
  const yFor = (value: number) => top + ((max - value) / range) * (height - top - bottom);
  const path = safeCurve.map((point, index) => `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)} ${yFor(point.equity).toFixed(1)}`).join(" ");
  const dateLabel = (value?: string) => value ? value.slice(0, 10) : "—";
  const indexForDate = (date: string | undefined) => {
    const target = dateLabel(date);
    if (target === "—") return -1;
    return safeCurve.findIndex((point) => dateLabel(point.date) === target);
  };
  return <div className="bt-result-chart"><div className="bt-row-between"><strong>Equity curve and simulated trades</strong><span className="bt-field-help"><TrendingUp size={13} /> Green line = portfolio value · dots = entries/exits</span></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Backtest equity curve with simulated trade markers"><title>Backtest equity curve</title><desc>The portfolio value changes through the selected historical period. Green dots are entries and red dots are exits.</desc>{[0, .5, 1].map((fraction) => <line key={fraction} x1={left} x2={width - right} y1={top + fraction * (height - top - bottom)} y2={top + fraction * (height - top - bottom)} stroke="#e2e8f0" strokeDasharray="3 4" />)}<path d={path} fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" />{trades.flatMap((trade) => { const entryIndex = indexForDate(trade.entry_date); const exitIndex = indexForDate(trade.exit_date); return [entryIndex, exitIndex].filter((index) => index >= 0).map((index, markerIndex) => <circle key={`${trade.id ?? trade.trade_id}-${index}-${markerIndex}`} cx={xFor(index)} cy={yFor(safeCurve[index].equity)} r="4" fill={markerIndex === 0 ? "#4f46e5" : "#e11d48"} stroke="#fff" strokeWidth="2" />); })}<text x={left} y={height - 10} className="bt-result-svg-label">{dateLabel(safeCurve[0]?.date)}</text><text x={width - right} y={height - 10} textAnchor="end" className="bt-result-svg-label">{dateLabel(safeCurve.at(-1)?.date)}</text><text x={left - 8} y={top + 4} textAnchor="end" className="bt-result-svg-label">{moneyLabel(max)}</text><text x={left - 8} y={height - bottom} textAnchor="end" className="bt-result-svg-label">{moneyLabel(min)}</text></svg><div className="bt-result-chart-legend"><span><i className="entry" /> Entry</span><span><i className="exit" /> Exit</span><span><TrendingDown size={13} /> Historical path, not a forecast</span></div></div>;
}

type Candle = { date: string; open: number; high: number; low: number; close: number };

export default function ResearchPage() {
  const today = new Date().toISOString().slice(0, 10);
  const defaultStart = new Date(new Date(`${today}T00:00:00`).setFullYear(new Date(`${today}T00:00:00`).getFullYear() - 1)).toISOString().slice(0, 10);
  const [hypothesis, setHypothesis] = useState("Test whether a 20/50 moving-average crossover can capture medium-term trends in RELIANCE.");
  const [symbol, setSymbol] = useState("RELIANCE");
  const [strategyId, setStrategyId] = useState("sma_crossover");
  const [timeframe, setTimeframe] = useState("1day");
  const [initialCapital, setInitialCapital] = useState(100000);
  const [positionSizeAmount, setPositionSizeAmount] = useState(10000);
  const [stopLossPct, setStopLossPct] = useState(2);
  const [takeProfitPct, setTakeProfitPct] = useState(4);
  const [requestedStart, setRequestedStart] = useState(defaultStart);
  const [requestedEnd, setRequestedEnd] = useState(today);
  const [analysis, setAnalysis] = useState<HypothesisAnalysis | null>(null);
  const [availability, setAvailability] = useState<MarketAvailability | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  const [autoRunPending, setAutoRunPending] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: "ai" | "user"; text: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [runningBacktest, setRunningBacktest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [proposalScore, setProposalScore] = useState<number | null>(null);
  const [importedFlow, setImportedFlow] = useState(false);

  useEffect(() => {
    try {
      const isImportedStrategyFlow = new URLSearchParams(window.location.search).get("source") === "youtube-template";
      if (isImportedStrategyFlow) {
        setRestored(true);
        return;
      }
      const saved = window.localStorage.getItem("backtrack:research-session");
      if (saved) {
        const snapshot = JSON.parse(saved) as Partial<{
          hypothesis: string;
          symbol: string;
          requestedStart: string;
          requestedEnd: string;
          analysis: HypothesisAnalysis;
          availability: MarketAvailability;
          startDate: string;
          endDate: string;
          backtest: BacktestResult;
          chatHistory: Array<{ role: "ai" | "user"; text: string }>;
          strategyId: string;
          timeframe: string;
          initialCapital: number;
          positionSizeAmount: number;
          stopLossPct: number;
          takeProfitPct: number;
          proposalScore: number | null;
        }>;
        if (snapshot.hypothesis) setHypothesis(snapshot.hypothesis);
        if (snapshot.symbol) setSymbol(snapshot.symbol);
        if (snapshot.requestedStart) setRequestedStart(snapshot.requestedStart);
        if (snapshot.requestedEnd) setRequestedEnd(snapshot.requestedEnd);
        if (snapshot.analysis) setAnalysis(snapshot.analysis);
        if (snapshot.availability) setAvailability(snapshot.availability);
        if (snapshot.startDate) setStartDate(snapshot.startDate);
        if (snapshot.endDate) setEndDate(snapshot.endDate);
        if (snapshot.backtest) setBacktest({ ...snapshot.backtest, trades: snapshot.backtest.trades ?? [], warnings: snapshot.backtest.warnings ?? [], metrics: snapshot.backtest.metrics ?? {} });
        if (snapshot.chatHistory) setChatHistory(snapshot.chatHistory);
        if (snapshot.strategyId) setStrategyId(snapshot.strategyId);
        if (snapshot.timeframe) setTimeframe(snapshot.timeframe);
        if (snapshot.initialCapital) setInitialCapital(snapshot.initialCapital);
        if (snapshot.positionSizeAmount) setPositionSizeAmount(snapshot.positionSizeAmount);
        if (typeof snapshot.stopLossPct === "number") setStopLossPct(snapshot.stopLossPct);
        if (typeof snapshot.takeProfitPct === "number") setTakeProfitPct(snapshot.takeProfitPct);
        if (typeof snapshot.proposalScore === "number") setProposalScore(snapshot.proposalScore);
      }
    } catch {
      window.localStorage.removeItem("backtrack:research-session");
    } finally {
      setRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!restored) return;
    window.localStorage.setItem("backtrack:research-session", JSON.stringify({
    hypothesis, symbol, strategyId, timeframe, initialCapital, positionSizeAmount, stopLossPct, takeProfitPct, requestedStart, requestedEnd, analysis, availability, startDate, endDate, backtest, chatHistory, proposalScore,
  }));
  }, [restored, hypothesis, symbol, strategyId, timeframe, initialCapital, positionSizeAmount, stopLossPct, takeProfitPct, requestedStart, requestedEnd, analysis, availability, startDate, endDate, backtest, chatHistory, proposalScore]);

  const isLlmGenerated = Boolean(analysis?.generated_by && analysis.generated_by.toLowerCase().includes("ollama") && !analysis.generated_by.toLowerCase().includes("fallback"));
  const dsl = useMemo(() => analysis ? JSON.stringify({
    source: isLlmGenerated ? "local_ollama_review" : "curated_rule_template",
    generated_by: analysis.generated_by ?? "local Ollama",
    model: analysis.model ?? "configured local model",
    symbol: analysis.suggested_backtest.symbol,
    timeframe,
    strategy: { type: strategyId, fast_window: analysis.suggested_backtest.fast_window, slow_window: analysis.suggested_backtest.slow_window, position_size_amount: positionSizeAmount, stop_loss_pct: stopLossPct / 100, take_profit_pct: takeProfitPct / 100 },
    assumptions: analysis.assumptions,
    risks: analysis.risks,
  }, null, 2) : "Run Parse Hypothesis to generate a reviewable strategy proposal.", [analysis, isLlmGenerated, strategyId, timeframe, positionSizeAmount, stopLossPct, takeProfitPct]);

  const ensureResearchData = async (targetSymbol: string, importStart = requestedStart, importEnd = requestedEnd) => {
    setImportJob({ job_id: "", status: "queued", message: "Preparing the official NSE data request…", stage: "Queued" });
    try {
      const response = await withTimeout(fetch(`${API_BASE_URL}/research/ensure-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: targetSymbol, start: importStart }),
      }), "NSE data preparation is taking longer than expected. Check the API connection and try again.", 15000);
      const payload = await response.json().catch(() => null) as ImportJob | { detail?: string } | null;
      if (!response.ok) throw new Error(payload && "detail" in payload ? payload.detail ?? "Could not start the NSE import." : "Could not start the NSE import.");
      const job = payload as ImportJob;
      setImportJob(job);

      const poll = async (): Promise<void> => {
        const statusResponse = await withTimeout(fetch(`${API_BASE_URL}/data/nse-import/${job.job_id}`), "NSE import progress could not be read. Check the API connection and retry.", 10000);
        const statusPayload = await statusResponse.json().catch(() => null) as ImportJob | { detail?: string } | null;
        if (!statusResponse.ok) throw new Error(statusPayload && "detail" in statusPayload ? statusPayload.detail ?? "Could not read import progress." : "Could not read import progress.");
        const next = statusPayload as ImportJob;
        setImportJob(next);
        if (next.status === "complete") {
          const refreshed = await getMarketAvailability(targetSymbol);
          setAvailability(refreshed);
          setStartDate(importStart);
          setEndDate(importEnd);
          setAutoRunPending(true);
          return;
        }
        if (next.status === "failed") return;
        window.setTimeout(() => { void poll().catch((pollError) => setError(pollError instanceof Error ? pollError.message : "Could not read import progress.")); }, 900);
      };
      void poll().catch((pollError) => setError(pollError instanceof Error ? pollError.message : "Could not read import progress."));
    } catch (requestError) {
      setImportJob(null);
      setError(requestError instanceof Error ? requestError.message : "Could not start the NSE import.");
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") !== "youtube-template") return;
    setImportedFlow(true);
    const importedStrategy = params.get("strategy") ?? "sma_crossover";
    const selected = STRATEGY_LIBRARY.find((item) => item.strategyId === importedStrategy && item.id !== "golden-cross") ?? STRATEGY_LIBRARY[0];
    const importedSymbol = (params.get("symbol") ?? "RELIANCE").trim().toUpperCase();
    const importedTimeframe = params.get("timeframe") ?? "1day";
    const importedCapital = Math.max(1000, Number(params.get("capital") ?? 100000) || 100000);
    const importedStart = params.get("start") ?? defaultStart;
    const importedEnd = params.get("end") ?? today;
    const importedFormula = params.get("formula") ?? selected.description;
    const importedAnalysis: HypothesisAnalysis = {
      generated_by: "Curated community strategy template",
      model: "Backtrack strategy catalogue",
      summary: `${selected.name} is ready to test on ${importedSymbol}. Formula: ${importedFormula}`,
      assumptions: ["This rule set is a transparent template assembled from a widely used public strategy family.", "Signals are calculated on each candle and executed on the next candle; commission and slippage are included."],
      risks: ["A historical result is not a forecast or investment advice.", "Results depend on the stock, timeframe, date range, costs, and market regime."],
      suggested_backtest: { symbol: importedSymbol, timeframe: importedTimeframe, fast_window: selected.defaults.fast, slow_window: selected.defaults.slow, rationale: selected.description },
    };
    setSymbol(importedSymbol);
    setStrategyId(selected.strategyId);
    setTimeframe(importedTimeframe);
    setInitialCapital(importedCapital);
    setRequestedStart(importedStart);
    setRequestedEnd(importedEnd);
    setHypothesis(importedFormula);
    setAnalysis(importedAnalysis);
    setError(null);
    void withTimeout(getMarketAvailability(importedSymbol), "The NSE catalogue check is taking longer than expected. Check the API connection and try again.", 10000).then((localData) => {
      setAvailability(localData);
      if (localData.bars > 0) {
        setStartDate(importedStart);
        setEndDate(importedEnd);
        setAutoRunPending(true);
      } else {
        void ensureResearchData(importedSymbol, importedStart, importedEnd);
      }
    }).catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Could not check local NSE history."));
  }, []);

  const parseHypothesis = async (nextHypothesis = hypothesis) => {
    if (!nextHypothesis.trim() || !symbol.trim()) return;
    setLoading(true);
    setError(null);
    setBacktest(null);
    try {
      const response = await withTimeout(fetch(`${API_BASE_URL}/research/hypothesis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hypothesis: nextHypothesis, symbol: symbol.trim().toUpperCase(), timeframe, strategy_id: strategyId }),
      }), "Strategy preparation is taking longer than expected. Check the API/Ollama connection and try again.", 30000);
      const payload = await response.json().catch(() => null) as HypothesisAnalysis | { detail?: string } | null;
      if (!response.ok) throw new Error(payload && "detail" in payload ? payload.detail ?? "Research parsing failed." : "Research parsing failed.");
      const result = payload as HypothesisAnalysis;
      setAnalysis(result);
      const selectedSymbol = symbol.trim().toUpperCase();
      const localData = await withTimeout(getMarketAvailability(selectedSymbol), "The NSE availability check timed out. Check the API connection and try again.", 10000);
      setAvailability(localData);
      const warmupStart = new Date(`${requestedStart}T00:00:00`);
      warmupStart.setFullYear(warmupStart.getFullYear() - 1);
      const hasRequiredHistory = Boolean(
        localData.earliest && localData.latest
        && localData.earliest.slice(0, 10) <= warmupStart.toISOString().slice(0, 10)
        && localData.latest.slice(0, 10) >= today,
      );
      if (hasRequiredHistory) {
        setImportJob(null);
        setStartDate(requestedStart);
        setEndDate(requestedEnd);
        setAutoRunPending(true);
      } else {
        void ensureResearchData(selectedSymbol);
      }
      const selectedStrategy = STRATEGY_LIBRARY.find((item) => item.strategyId === strategyId && item.id !== "golden-cross") ?? STRATEGY_LIBRARY.find((item) => item.strategyId === strategyId);
      setChatHistory((history) => [...history, { role: "ai", text: `${result.summary} Selected strategy: ${selectedStrategy?.name ?? strategyId}. The local model proposed windows ${result.suggested_backtest.fast_window} and ${result.suggested_backtest.slow_window}. ${result.suggested_backtest.rationale}` }]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Research parsing failed.");
    } finally {
      setLoading(false);
    }
  };

  const runBacktest = async () => {
    if (!analysis || !availability?.earliest || !availability.latest || !startDate || !endDate) return;
    if (startDate > endDate) {
      setError("The start date must be on or before the end date.");
      return;
    }
    setRunningBacktest(true);
    setError(null);
    try {
      if (timeframe === "1hour") {
        setError("Hourly testing needs an intraday data provider. The current official NSE archive is daily, so hourly candles are not invented or approximated.");
        return;
      }
      const endpoint = "/backtests/custom";
      const requestBody = {
        symbol: symbol.trim().toUpperCase(), strategy_id: strategyId, start: `${startDate}T00:00:00`, end: `${endDate}T23:59:59`, timeframe,
        rsi_period: strategyId.startsWith("rsi") ? analysis.suggested_backtest.fast_window : 14,
        fast_ema: analysis.suggested_backtest.fast_window, slow_ema: analysis.suggested_backtest.slow_window,
        initial_capital: initialCapital, commission_pct: 0.001, slippage_pct: 0.0005,
        position_size_amount: positionSizeAmount, stop_loss_pct: stopLossPct / 100, take_profit_pct: takeProfitPct / 100,
      };
      const response = await withTimeout(fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }), "The backtest is taking longer than expected. Check the API and local market data, then retry.", 60000);
      const payload = await response.json().catch(() => null) as BacktestResult | { detail?: string } | null;
      if (!response.ok) throw new Error(payload && "detail" in payload ? payload.detail ?? "Backtest failed." : "Backtest failed.");
      const raw = payload as { run_id: string; symbol?: string; timeframe?: string; strategy_id?: string; initial_capital?: number; final_equity?: number; metrics?: Record<string, number>; warnings?: string[]; equity_curve?: Array<{ timestamp?: string; date?: string; equity: number }>; candles?: Candle[]; indicators?: BacktestResult["indicators"]; signals?: BacktestResult["signals"]; trade_path?: BacktestResult["trade_path"]; trades?: Array<Record<string, unknown>> };
      setBacktest({
        ...raw,
        symbol: raw.symbol ?? symbol.trim().toUpperCase(),
        timeframe: raw.timeframe ?? timeframe,
        strategy_id: raw.strategy_id ?? strategyId,
        initial_capital: raw.initial_capital ?? initialCapital,
        final_equity: raw.final_equity ?? raw.equity_curve?.at(-1)?.equity ?? initialCapital,
        metrics: raw.metrics ?? {},
        warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
        equity_curve: raw.equity_curve?.map((point) => ({ date: point.date ?? point.timestamp?.slice(0, 10) ?? "", equity: point.equity })) ?? [],
        candles: raw.candles ?? [],
        indicators: raw.indicators ?? {},
        signals: raw.signals ?? [],
        trade_path: raw.trade_path ?? [],
        trades: (raw.trades ?? []).map((trade, index) => ({ id: String(trade.id ?? trade.trade_id ?? index + 1), trade_id: Number(trade.trade_id ?? index + 1), symbol: String(trade.symbol ?? symbol), entry_date: String(trade.entry_date ?? trade.entry_timestamp ?? "").slice(0, 10), exit_date: String(trade.exit_date ?? trade.exit_timestamp ?? "").slice(0, 10), entry_price: Number(trade.entry_price ?? 0), exit_price: Number(trade.exit_price ?? 0), pnl: Number(trade.pnl ?? 0), return_pct: Number(trade.return_pct ?? 0), holding_days: Number(trade.holding_days ?? 0), entry_amount: Number(trade.entry_amount ?? 0), max_unrealized_pnl: Number(trade.max_unrealized_pnl ?? 0), min_unrealized_pnl: Number(trade.min_unrealized_pnl ?? 0) })),
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Backtest failed.");
    } finally {
      setRunningBacktest(false);
    }
  };

  const formatPercent = (value: number | undefined) => `${((value ?? 0) * 100).toFixed(2)}%`;

  useEffect(() => {
    if (!autoRunPending || runningBacktest || !analysis || !availability?.bars || !startDate || !endDate) return;
    setAutoRunPending(false);
    void runBacktest();
  }, [autoRunPending, runningBacktest, analysis, availability, startDate, endDate, strategyId, timeframe, initialCapital]);

  const primaryAction = () => {
    if (!analysis) { void parseHypothesis(); return; }
    if (availability?.bars && startDate && endDate) { void runBacktest(); return; }
    if (!importJob) void ensureResearchData(symbol.trim().toUpperCase(), requestedStart, requestedEnd);
  };

  const primaryActionLabel = runningBacktest ? "Running backtest…" : loading ? "Preparing strategy…" : analysis && availability?.bars && startDate && endDate ? "Run backtest" : analysis ? "Prepare data & run" : "Prepare & run backtest";
  const progressMessage = loading
    ? "Reading the hypothesis, checking the selected rule, and asking the local model for a testable proposal."
    : runningBacktest
      ? "Walking through each historical candle, applying costs and risk limits, and calculating trade P&L."
      : null;

  const handleSendChat = () => {
    const text = chatMessage.trim();
    if (!text) return;
    setChatHistory((history) => [...history, { role: "user", text }]);
    setChatMessage("");
    void parseHypothesis(`${hypothesis}\n\nClarification from the trader: ${text}`);
  };

  const retryOllama = () => {
    setAnalysis(null);
    setBacktest(null);
    setError(null);
    void parseHypothesis();
  };

  return <div className="backtrack-page">
    <TopBar />
    <main className="backtrack-content bt-stack">
      <section className="bt-heading-row">
        <div><div className="bt-kicker"><span className="live-dot" /> TEST A STRATEGY</div><h1>Describe what you want to test.</h1><p>Tell us your idea in plain language. We will turn it into simple rules, find the stock history, and show the result.</p></div>
        <span className="data-source">{restored && (analysis || backtest) ? <><CheckCircle size={14} /> Saved session restored</> : <><Sparkles size={14} /> Local Ollama + NSE cache</>}</span>
      </section>

      <section className="bt-hypothesis-block">
        <div className="bt-hypothesis-header"><div className="bt-hypothesis-icon"><Sparkles size={17} /></div><span className="bt-hypothesis-title">Describe your trading hypothesis</span><span className="bt-ai-badge">Local AI</span></div>
        <textarea className="bt-hypothesis-textarea" value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} />
        <div className="bt-grid-2" style={{ margin: "14px 0" }}><div><label className="bt-field-label">NSE symbol</label><SymbolCombobox value={symbol} onChange={(nextSymbol) => { setSymbol(nextSymbol); setAnalysis(null); setAvailability(null); setStartDate(""); setEndDate(""); setBacktest(null); setImportJob(null); setAutoRunPending(false); }} /></div><div><label className="bt-field-label">Strategy</label><select className="bt-field-input" aria-label="Strategy to test" value={strategyId} onChange={(event) => { setStrategyId(event.target.value); setAnalysis(null); setBacktest(null); }}><option value="sma_crossover">SMA crossover</option>{STRATEGY_LIBRARY.filter((item) => item.id !== "golden-cross" && item.strategyId !== "sma_crossover").map((item) => <option key={item.id} value={item.strategyId}>{item.name}</option>)}</select></div><div><label className="bt-field-label">Timeframe</label><select className="bt-field-input" aria-label="Backtest timeframe" value={timeframe} onChange={(event) => { setTimeframe(event.target.value); setAnalysis(null); setBacktest(null); }} >{TIMEFRAMES.map((item) => <option key={item.value} value={item.value}>{item.label} · {item.detail}</option>)}</select><span className="bt-field-help">Weekly and monthly are resampled from saved NSE daily candles. Monthly needs a longer history for slow indicators. Hourly needs an intraday source and stays unavailable for this NSE archive.</span></div><div><label className="bt-field-label">Starting capital (₹)</label><input className="bt-field-input" type="number" min="1000" step="1000" value={initialCapital} onChange={(event) => setInitialCapital(Math.max(1000, Number(event.target.value) || 1000))} /><span className="bt-field-help">Paper-only account size.</span></div><div><label className="bt-field-label">Money per trade (₹)</label><input className="bt-field-input" type="number" min="100" step="100" value={positionSizeAmount} onChange={(event) => setPositionSizeAmount(Math.max(100, Number(event.target.value) || 100))} /><span className="bt-field-help">Fixed amount committed to each entry.</span></div><div><label className="bt-field-label">Maximum loss per trade (%)</label><input className="bt-field-input" type="number" min="0" max="99" step="0.25" value={stopLossPct} onChange={(event) => setStopLossPct(Math.min(99, Math.max(0, Number(event.target.value) || 0)))} /><span className="bt-field-help">0 disables the stop-loss rule.</span></div><div><label className="bt-field-label">Profit target per trade (%)</label><input className="bt-field-input" type="number" min="0" max="1000" step="0.25" value={takeProfitPct} onChange={(event) => setTakeProfitPct(Math.min(1000, Math.max(0, Number(event.target.value) || 0)))} /><span className="bt-field-help">0 lets the strategy exit on its signal.</span></div><div><label className="bt-field-label">Backtest from</label><input className="bt-field-input" type="date" max={requestedEnd} value={requestedStart} onChange={(event) => { setRequestedStart(event.target.value); setAnalysis(null); setImportJob(null); setAutoRunPending(false); }} /></div><div><label className="bt-field-label">Backtest to</label><input className="bt-field-input" type="date" min={requestedStart} max={today} value={requestedEnd} onChange={(event) => { setRequestedEnd(event.target.value); setAnalysis(null); setImportJob(null); setAutoRunPending(false); }} /></div></div>
        <section className="bt-strategy-library" aria-label="Available strategy library"><div className="bt-row-between"><div><div className="bt-row"><BarChart3 size={15} style={{ color: "#4f46e5" }} /><strong>Strategy library</strong></div><p className="bt-field-help">Choose a familiar, supported rule set. Source links are community references; the engine calculates fresh stats for your exact inputs.</p></div><span className="bt-ai-badge">{STRATEGY_LIBRARY.length} available</span></div><div className="bt-strategy-library-grid">{STRATEGY_LIBRARY.map((item) => { const isSelected = strategyId === item.strategyId && item.id !== "golden-cross"; return <button type="button" key={item.id} data-testid={`strategy-card-${item.id}`} aria-pressed={isSelected} className={isSelected ? "is-selected" : ""} onClick={() => { setStrategyId(item.strategyId); setAnalysis(null); setBacktest(null); }}><span><strong>{item.name}</strong><small>{item.family} · {item.sourceLabel}</small></span><p>{item.description}</p><ChevronRight size={13} /></button>; })}</div>{strategyId && <p className="bt-library-selection"><Check size={13} /> Selected: <strong>{STRATEGY_LIBRARY.find((item) => item.strategyId === strategyId && item.id !== "golden-cross")?.name ?? STRATEGY_LIBRARY.find((item) => item.strategyId === strategyId)?.name}</strong> · {STRATEGY_LIBRARY.find((item) => item.strategyId === strategyId && item.id !== "golden-cross")?.use ?? STRATEGY_LIBRARY.find((item) => item.strategyId === strategyId)?.use}</p>}</section>
        <div className="bt-hypothesis-footer"><div className="bt-hypothesis-pills">{importedFlow ? <span className="bt-imported-formula-note"><CheckCircle size={13} /> Formula loaded from YouTube strategy selection. Review the risk settings, then use this single action.</span> : EXAMPLES.map((example) => <button type="button" key={example} className="bt-hypothesis-pill" onClick={() => setHypothesis(example)}>{example.slice(0, 42)}…</button>)}</div><button type="button" className="bt-primary" onClick={primaryAction} disabled={loading || runningBacktest || timeframe === "1hour" || Boolean(importJob && ["queued", "running"].includes(importJob.status))}>{runningBacktest || loading ? <Loader2 size={14} className="spin" /> : <Play size={14} />} {primaryActionLabel}</button></div>
        {progressMessage && <div className="bt-run-status" role="status" aria-live="polite"><Loader2 size={15} className="spin" /><div><strong>{primaryActionLabel}</strong><span>{progressMessage}</span><small>This can take a little longer when NSE history or Ollama is being contacted. If Ollama is unavailable, a clearly labelled catalogue proposal keeps the historical test usable.</small></div></div>}
      </section>

      {error && <div className="bt-alert-error" role="alert">{error}</div>}

      {importJob && <section className="bt-panel" style={{ padding: "20px" }}><div className="bt-row-between"><div><div className="bt-row"><Loader2 size={16} className={importJob.status === "complete" || importJob.status === "failed" ? "" : "spin"} style={{ color: importJob.status === "failed" ? "#e11d48" : "#4f46e5" }} /><h3>Official NSE history preparation</h3></div><p className="text-xs text-slate-500" style={{ marginTop: "6px" }}>{importJob.message}</p></div><span className="bt-ai-badge">{importJob.status}</span></div><div className="bt-grid-2" style={{ marginTop: "16px" }}>{["Validate local cache", "Download or reuse archive", "Save full archive to SQLite", "Ready to backtest"].map((step, index) => { const completed = importJob.status === "complete" || (index === 0 && importJob.status !== "queued") || (index === 1 && importJob.stage?.includes("Saving")); return <div key={step} className="bt-callout"><strong>{completed ? "✓ " : "○ "}{step}</strong><p>{index === 1 && importJob.total_days ? `${importJob.completed_days ?? 0}/${importJob.total_days} trading days checked` : completed ? "Done" : "Waiting"}</p></div>; })}</div>{importJob.status === "failed" && <div className="bt-alert-error" style={{ marginTop: "14px" }}>NSE data could not be imported. Check the symbol and retry Parse Hypothesis.</div>}</section>}

      <section className="bt-panel bt-pipeline-panel"><p className="bt-pipeline-title">What happens next</p><div className="bt-pipeline-grid">{PIPELINE.map((label, index) => {
        const dataReady = Boolean(analysis && availability?.bars && (!importJob || importJob.status === "complete"));
        const completedSteps = backtest ? PIPELINE.length : dataReady ? 4 : analysis ? 2 : 0;
        const runningStep = loading ? 0 : importJob && importJob.status !== "complete" && importJob.status !== "failed" ? 2 : runningBacktest ? 4 : -1;
        const status: StepStatus = index < completedSteps ? "complete" : index === runningStep ? "running" : "pending";
        return <div key={label} className={`bt-pipeline-step ${status}`}><div className="bt-step-top"><span className="bt-step-num">0{index + 1}</span>{status === "complete" ? <CheckCircle size={14} style={{ color: "#059669" }} /> : status === "running" ? <Loader2 size={14} style={{ color: "#4f46e5" }} className="spin" /> : <Circle size={14} style={{ color: "#cbd5e1" }} />}</div><div><p className="bt-step-label">{label}</p><p className={`bt-step-status ${status}`}>{status}</p></div></div>;
      })}</div></section>

      <div className="bt-grid-2">
        <section className="bt-panel" style={{ padding: "20px" }}><div className="bt-row-between" style={{ marginBottom: "12px" }}><div className="bt-row"><Code2 size={16} style={{ color: "#4f46e5" }} /><h3>Strategy proposal</h3></div><span className="bt-ai-badge">{analysis ? (isLlmGenerated ? "LLM generated · review required" : "Curated rules · review required") : "Waiting"}</span></div><p className="bt-section-explanation">This is the structured interpretation of the selected strategy. It does not place a trade. Review the rules, timeframe, assumptions, and risks before running the simulation.</p>{analysis && <div className="bt-llm-origin"><Sparkles size={14} /><span>{isLlmGenerated ? "Generated by local Ollama" : "Generated by Backtrack's curated rule catalogue"}</span><code>{analysis.model ?? "configured model"}</code></div>}<pre className="bt-dsl-preview"><code>{dsl}</code></pre>{analysis && <><div className="bt-callout"><strong>Why this strategy is being tested</strong><p>{analysis.suggested_backtest.rationale}</p><p className="bt-field-help">The selected rule is: {STRATEGY_LIBRARY.find((item) => item.strategyId === strategyId && item.id !== "golden-cross")?.description ?? STRATEGY_LIBRARY.find((item) => item.strategyId === strategyId)?.description ?? "the rule shown above"} The engine checks that rule one candle at a time on the selected stock and timeframe. It is a testable historical idea, not a forecast.</p></div><div className="bt-proposal-columns"><div><strong>Assumptions</strong>{analysis.assumptions.length ? analysis.assumptions.map((item) => <p key={item}>• {item}</p>) : <p>• No extra assumptions returned.</p>}</div><div><strong>Risks to keep in mind</strong>{analysis.risks.length ? analysis.risks.map((item) => <p key={item}>• {item}</p>) : <p>• Review fees, slippage, sample size, and regime changes.</p>}</div></div><div className="bt-proposal-score"><span>Was this explanation useful?</span>{[1, 2, 3, 4, 5].map((score) => <button type="button" key={score} aria-label={`Score proposal ${score} out of 5`} className={proposalScore === score ? "is-selected" : ""} onClick={() => setProposalScore(score)}><Star size={13} fill={proposalScore !== null && score <= proposalScore ? "currentColor" : "none"} /></button>)}{proposalScore && <small>Saved locally for later model review.</small>}</div></>}<div className="bt-row-between" style={{ marginTop: "16px" }}><span className="text-xs text-slate-500">Proposal only · no trade is placed. Review or edit it above before running.</span>{analysis && !isLlmGenerated && analysis.generated_by?.toLowerCase().includes("ollama unavailable") && <button type="button" className="bt-secondary small" onClick={retryOllama}>Retry local Ollama</button>}</div></section>
        <section className="bt-panel" style={{ padding: "20px", display: "flex", flexDirection: "column" }}><div className="bt-row" style={{ marginBottom: "7px" }}><MessageSquare size={16} style={{ color: "#4f46e5" }} /><h3>Research clarification</h3></div><p className="bt-section-explanation">Ask the local Ollama model to explain a term, challenge an assumption, or suggest a safer test. Every model reply is labelled so it can be scored separately from your own notes.</p><div className="bt-chat-scroll">{chatHistory.length === 0 ? <p className="text-xs text-slate-500">Parse a hypothesis first. Then ask for a clarification; the app will re-run the local review with your instruction.</p> : chatHistory.map((message, index) => <div key={index} className={`bt-chat-msg ${message.role}`}><span className="bt-chat-msg-role">{message.role === "ai" ? (message.text.includes("Ollama did not respond") ? "● Curated fallback" : "● Generated by local Ollama") : "You"}</span>{message.text}</div>)}</div><div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "14px", marginTop: "auto" }}><div className="bt-chat-input-row"><input type="text" placeholder="Ask Ollama to clarify the proposal…" className="bt-chat-input" value={chatMessage} onChange={(event) => setChatMessage(event.target.value)} onKeyDown={(event) => event.key === "Enter" && handleSendChat()} /><button type="button" className="bt-primary" onClick={handleSendChat} disabled={loading}><Send size={14} /> Send</button></div></div></section>
      </div>

      {analysis && (!importJob || importJob.status === "complete") && <section className="bt-panel" style={{ padding: "20px" }}>
        <div className="bt-row-between"><div><div className="bt-row"><BarChart3 size={16} style={{ color: "#4f46e5" }} /><h3>Historical data coverage</h3></div><p className="text-xs text-slate-500" style={{ marginTop: "6px" }}>This paper-only test uses {moneyLabel(initialCapital)} account size, {moneyLabel(positionSizeAmount)} per trade, {stopLossPct}% maximum loss, and {takeProfitPct}% profit target.</p></div><span className="data-source">{availability ? `${availability.bars} daily bars available` : "Checking data…"}</span></div>
        {!availability?.bars ? <div className="bt-alert-error" role="alert" style={{ marginTop: "16px" }}>No imported daily NSE data exists for {symbol.trim().toUpperCase() || "this symbol"}.</div> : <>
          <p className="bt-action-help"><CheckCircle size={13} /> Available history: {availability.earliest?.slice(0, 10)} → {availability.latest?.slice(0, 10)}. Choose the backtest dates once above; this section only confirms the stock has local NSE coverage.</p>
        </>}
      </section>}

      {backtest && <section className="bt-panel bt-research-result" style={{ padding: "20px" }}><div className="bt-row-between"><div><div className="bt-row"><CheckCircle size={17} style={{ color: "#059669" }} /><h3>Backtest completed</h3></div><p className="text-xs text-slate-500" style={{ marginTop: "6px" }}>Run {backtest.run_id} · {backtest.symbol} · {backtest.timeframe} · {startDate} to {endDate}</p></div><span className="bt-ai-badge">Real local NSE candles</span></div><div className="bt-result-explainer"><BarChart3 size={17} /><div><strong>What happened in normal language</strong><p>The engine followed the selected rules one candle at a time. Signals were calculated after each candle and filled on the next candle, so the test does not look into the future. Use the replay below to reveal each historical day and understand every simulated entry, exit, gain, and loss.</p><p>With <strong>{moneyLabel(backtest.initial_capital)}</strong> starting capital and <strong>{moneyLabel(positionSizeAmount)}</strong> committed per trade, the simulation finished at <strong>{moneyLabel(backtest.final_equity)}</strong>. This describes one historical path; it does not tell us what the next trade will do.</p></div></div><div className="bt-grid-2 bt-result-metrics" style={{ marginTop: "16px" }}><div className="bt-callout"><strong>Total return</strong><p className={(backtest.metrics?.total_return ?? 0) >= 0 ? "bt-result-positive" : "bt-result-negative"}>{formatPercent(backtest.metrics?.total_return)}</p></div><div className="bt-callout"><strong>Maximum fall from a peak</strong><p className="bt-result-negative">{formatPercent(backtest.metrics?.maximum_drawdown ?? backtest.metrics?.max_drawdown)}</p></div><div className="bt-callout"><strong>Win rate</strong><p>{formatPercent(backtest.metrics?.win_rate)}</p></div><div className="bt-callout"><strong>Closed trades</strong><p>{Math.round(backtest.metrics?.trade_count ?? backtest.metrics?.total_trades ?? backtest.trades?.length ?? 0)}</p></div></div>{backtest.candles && backtest.candles.length > 0 && <StrategyReplay key={backtest.run_id} candles={backtest.candles} indicators={backtest.indicators} signals={backtest.signals} trades={backtest.trades ?? []} tradePath={backtest.trade_path ?? []} initialCapital={backtest.initial_capital} />}{backtest.equity_curve && backtest.equity_curve.length > 1 && <ResearchResultChart curve={backtest.equity_curve} trades={backtest.trades ?? []} />}{(backtest.trades?.length ?? 0) > 0 && <div className="bt-result-trades"><div className="bt-row-between"><strong>Where trades happened</strong><span className="bt-field-help">Entry and exit markers are also shown on the chart.</span></div>{(backtest.trades ?? []).map((trade) => <div className="bt-result-trade" key={trade.id ?? trade.trade_id}><span className="bt-trade-index">#{trade.trade_id ?? trade.id}</span><span><strong>{trade.entry_date || "Entry"} → {trade.exit_date || "Exit"}</strong><small>{trade.entry_price ? `₹${trade.entry_price.toLocaleString("en-IN")} → ₹${(trade.exit_price ?? 0).toLocaleString("en-IN")}` : "Simulated next-candle execution"}</small><small>Committed {moneyLabel(trade.entry_amount ?? 0)} · Held {trade.holding_days ?? 0} days · Best open {moneyLabel(trade.max_unrealized_pnl ?? 0)} · Worst open {moneyLabel(trade.min_unrealized_pnl ?? 0)}</small><small>Realized at exit {moneyLabel(trade.pnl)}</small></span><b className={trade.pnl >= 0 ? "bt-result-positive" : "bt-result-negative"}>{trade.pnl >= 0 ? "+" : "−"}{moneyLabel(Math.abs(trade.pnl))}</b></div>)}</div>}{(backtest.warnings?.length ?? 0) > 0 && <div className="bt-alert-error" style={{ marginTop: "16px" }}>{backtest.warnings?.join(" ")}</div>}<div className="bt-row-between" style={{ marginTop: "16px" }}><span className="text-xs text-slate-500">Historical simulation only · no real order was placed.</span><span className="bt-row"><Link href="/strategy" className="bt-secondary">Adjust rules in Strategy Lab <ChevronRight size={14} /> </Link><Link href={{ pathname: "/comparison", query: { source: "research", symbol, strategy: strategyId, timeframe, start: startDate, end: endDate, capital: initialCapital, position: positionSizeAmount, stop: stopLossPct, target: takeProfitPct } }} className="bt-secondary">Compare this run <ChevronRight size={14} /> </Link></span></div></section>}
    </main>
  </div>;
}
