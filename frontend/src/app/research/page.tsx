"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle, ChevronRight, Circle, Code2, Loader2, MessageSquare, Play, Send, Sparkles } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { getMarketAvailability, type MarketAvailability } from "@/lib/market-data";
import { SymbolCombobox } from "@/components/data/SymbolCombobox";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
const EXAMPLES = [
  "Test whether a 20/50 moving-average crossover can capture medium-term trends.",
  "Test a conservative long-only crossover strategy with realistic costs.",
  "Compare a short and long moving average across a complete market cycle.",
];

type StepStatus = "complete" | "running" | "pending";
type HypothesisAnalysis = {
  summary: string;
  assumptions: string[];
  risks: string[];
  suggested_backtest: { symbol: string; timeframe: string; fast_window: number; slow_window: number; rationale: string };
};
type BacktestResult = {
  run_id: string;
  trades: Array<{ id: string; pnl: number; return_pct: number }>;
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

export default function ResearchPage() {
  const today = new Date().toISOString().slice(0, 10);
  const defaultStart = new Date(new Date(`${today}T00:00:00`).setFullYear(new Date(`${today}T00:00:00`).getFullYear() - 1)).toISOString().slice(0, 10);
  const [hypothesis, setHypothesis] = useState("Test whether a 20/50 moving-average crossover can capture medium-term trends in RELIANCE.");
  const [symbol, setSymbol] = useState("RELIANCE");
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

  const dsl = useMemo(() => analysis ? JSON.stringify({
    source: "local_ollama_review",
    symbol: analysis.suggested_backtest.symbol,
    timeframe: analysis.suggested_backtest.timeframe,
    strategy: { type: "sma_crossover", fast_window: analysis.suggested_backtest.fast_window, slow_window: analysis.suggested_backtest.slow_window },
    assumptions: analysis.assumptions,
    risks: analysis.risks,
  }, null, 2) : "Run Parse Hypothesis to generate a reviewable strategy proposal.", [analysis]);

  const ensureResearchData = async (targetSymbol: string) => {
    setImportJob({ job_id: "", status: "queued", message: "Preparing the official NSE data request…", stage: "Queued" });
    try {
      const response = await fetch(`${API_BASE_URL}/research/ensure-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: targetSymbol, start: requestedStart }),
      });
      const payload = await response.json().catch(() => null) as ImportJob | { detail?: string } | null;
      if (!response.ok) throw new Error(payload && "detail" in payload ? payload.detail ?? "Could not start the NSE import." : "Could not start the NSE import.");
      const job = payload as ImportJob;
      setImportJob(job);

      const poll = async (): Promise<void> => {
        const statusResponse = await fetch(`${API_BASE_URL}/data/nse-import/${job.job_id}`);
        const statusPayload = await statusResponse.json().catch(() => null) as ImportJob | { detail?: string } | null;
        if (!statusResponse.ok) throw new Error(statusPayload && "detail" in statusPayload ? statusPayload.detail ?? "Could not read import progress." : "Could not read import progress.");
        const next = statusPayload as ImportJob;
        setImportJob(next);
        if (next.status === "complete") {
          const refreshed = await getMarketAvailability(targetSymbol);
          setAvailability(refreshed);
          setStartDate(requestedStart);
          setEndDate(requestedEnd);
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

  const parseHypothesis = async (nextHypothesis = hypothesis) => {
    if (!nextHypothesis.trim() || !symbol.trim()) return;
    setLoading(true);
    setError(null);
    setBacktest(null);
    try {
      const response = await fetch(`${API_BASE_URL}/research/hypothesis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hypothesis: nextHypothesis, symbol: symbol.trim().toUpperCase(), timeframe: "1day" }),
      });
      const payload = await response.json().catch(() => null) as HypothesisAnalysis | { detail?: string } | null;
      if (!response.ok) throw new Error(payload && "detail" in payload ? payload.detail ?? "Research parsing failed." : "Research parsing failed.");
      const result = payload as HypothesisAnalysis;
      setAnalysis(result);
      const selectedSymbol = symbol.trim().toUpperCase();
      const localData = await getMarketAvailability(selectedSymbol);
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
      setChatHistory((history) => [...history, { role: "ai", text: `${result.summary} Suggested test: SMA(${result.suggested_backtest.fast_window}) / SMA(${result.suggested_backtest.slow_window}). ${result.suggested_backtest.rationale}` }]);
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
      const response = await fetch(`${API_BASE_URL}/backtests/sma-crossover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          start: `${startDate}T00:00:00`,
          end: `${endDate}T23:59:59`,
          timeframe: "1day",
          fast_window: analysis.suggested_backtest.fast_window,
          slow_window: analysis.suggested_backtest.slow_window,
          initial_capital: 100000,
          commission: 0,
          slippage: 0,
        }),
      });
      const payload = await response.json().catch(() => null) as BacktestResult | { detail?: string } | null;
      if (!response.ok) throw new Error(payload && "detail" in payload ? payload.detail ?? "Backtest failed." : "Backtest failed.");
      setBacktest(payload as BacktestResult);
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
  }, [autoRunPending, runningBacktest, analysis, availability, startDate, endDate]);

  const handleSendChat = () => {
    const text = chatMessage.trim();
    if (!text) return;
    setChatHistory((history) => [...history, { role: "user", text }]);
    setChatMessage("");
    void parseHypothesis(`${hypothesis}\n\nClarification from the trader: ${text}`);
  };

  return <div className="backtrack-page">
    <TopBar />
    <main className="backtrack-content bt-stack">
      <section className="bt-heading-row">
        <div><div className="bt-kicker"><span className="live-dot" /> RESEARCH WORKSPACE</div><h1>Natural language to a reviewable strategy.</h1><p>Use the installed local Ollama model to turn a trading hypothesis into a cautious SMA-crossover proposal.</p></div>
        <span className="data-source"><Sparkles size={14} /> Local Ollama + NSE cache</span>
      </section>

      <section className="bt-hypothesis-block">
        <div className="bt-hypothesis-header"><div className="bt-hypothesis-icon"><Sparkles size={17} /></div><span className="bt-hypothesis-title">Describe your trading hypothesis</span><span className="bt-ai-badge">Local AI</span></div>
        <textarea className="bt-hypothesis-textarea" value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} />
        <div className="bt-grid-2" style={{ margin: "14px 0" }}><div><label className="bt-field-label">NSE symbol</label><SymbolCombobox value={symbol} onChange={(nextSymbol) => { setSymbol(nextSymbol); setAnalysis(null); setAvailability(null); setStartDate(""); setEndDate(""); setBacktest(null); setImportJob(null); setAutoRunPending(false); }} /></div><div><label className="bt-field-label">Timeframe</label><input className="bt-field-input" value="1 day (official NSE cache)" disabled /></div><div><label className="bt-field-label">Backtest from</label><input className="bt-field-input" type="date" max={requestedEnd} value={requestedStart} onChange={(event) => { setRequestedStart(event.target.value); setAnalysis(null); setImportJob(null); setAutoRunPending(false); }} /></div><div><label className="bt-field-label">Backtest to</label><input className="bt-field-input" type="date" min={requestedStart} max={today} value={requestedEnd} onChange={(event) => { setRequestedEnd(event.target.value); setAnalysis(null); setImportJob(null); setAutoRunPending(false); }} /></div></div>
        <div className="bt-hypothesis-footer"><div className="bt-hypothesis-pills">{EXAMPLES.map((example) => <button key={example} className="bt-hypothesis-pill" onClick={() => setHypothesis(example)}>{example.slice(0, 42)}…</button>)}</div><button className="bt-primary" onClick={() => void parseHypothesis()} disabled={loading}>{loading ? <><Loader2 size={14} className="spin" /> Parsing with Ollama…</> : <><Play size={14} /> Parse Hypothesis</>}</button></div>
      </section>

      {error && <div className="bt-alert-error" role="alert">{error}</div>}

      {importJob && <section className="bt-panel" style={{ padding: "20px" }}><div className="bt-row-between"><div><div className="bt-row"><Loader2 size={16} className={importJob.status === "complete" || importJob.status === "failed" ? "" : "spin"} style={{ color: importJob.status === "failed" ? "#e11d48" : "#4f46e5" }} /><h3>Official NSE history preparation</h3></div><p className="text-xs text-slate-500" style={{ marginTop: "6px" }}>{importJob.message}</p></div><span className="bt-ai-badge">{importJob.status}</span></div><div className="bt-grid-2" style={{ marginTop: "16px" }}>{["Validate local cache", "Download missing NSE archives", "Store only missing bars", "Ready to backtest"].map((step, index) => { const completed = importJob.status === "complete" || (index === 0 && importJob.status !== "queued") || (index === 1 && importJob.stage?.includes("Saving")); return <div key={step} className="bt-callout"><strong>{completed ? "✓ " : "○ "}{step}</strong><p>{index === 1 && importJob.total_days ? `${importJob.completed_days ?? 0}/${importJob.total_days} trading days checked` : completed ? "Done" : "Waiting"}</p></div>; })}</div>{importJob.status === "failed" && <div className="bt-alert-error" style={{ marginTop: "14px" }}>NSE data could not be imported. Check the symbol and retry Parse Hypothesis.</div>}</section>}

      <section className="bt-panel bt-pipeline-panel"><p className="bt-pipeline-title">Research execution status</p><div className="bt-pipeline-grid">{PIPELINE.map((label, index) => {
        const dataReady = Boolean(analysis && availability?.bars && (!importJob || importJob.status === "complete"));
        const completedSteps = backtest ? PIPELINE.length : dataReady ? 4 : analysis ? 2 : 0;
        const runningStep = loading ? 0 : importJob && importJob.status !== "complete" && importJob.status !== "failed" ? 2 : runningBacktest ? 4 : -1;
        const status: StepStatus = index < completedSteps ? "complete" : index === runningStep ? "running" : "pending";
        return <div key={label} className={`bt-pipeline-step ${status}`}><div className="bt-step-top"><span className="bt-step-num">0{index + 1}</span>{status === "complete" ? <CheckCircle size={14} style={{ color: "#059669" }} /> : status === "running" ? <Loader2 size={14} style={{ color: "#4f46e5" }} className="spin" /> : <Circle size={14} style={{ color: "#cbd5e1" }} />}</div><div><p className="bt-step-label">{label}</p><p className={`bt-step-status ${status}`}>{status}</p></div></div>;
      })}</div></section>

      <div className="bt-grid-2">
        <section className="bt-panel" style={{ padding: "20px" }}><div className="bt-row-between" style={{ marginBottom: "12px" }}><div className="bt-row"><Code2 size={16} style={{ color: "#4f46e5" }} /><h3>Extracted strategy proposal</h3></div><span className="bt-ai-badge">{analysis ? "Review required" : "Waiting"}</span></div><pre className="bt-dsl-preview"><code>{dsl}</code></pre>{analysis && <div className="bt-callout"><strong>Model rationale</strong><p>{analysis.suggested_backtest.rationale}</p></div>}<div className="bt-row-between" style={{ marginTop: "16px" }}><span className="text-xs text-slate-500">Proposal only · no trade is placed</span><Link href="/strategy" className="bt-secondary">Open Strategy Builder <ChevronRight size={14} /></Link></div></section>
        <section className="bt-panel" style={{ padding: "20px", display: "flex", flexDirection: "column" }}><div className="bt-row" style={{ marginBottom: "14px" }}><MessageSquare size={16} style={{ color: "#4f46e5" }} /><h3>Research clarification</h3></div><div className="bt-chat-scroll">{chatHistory.length === 0 ? <p className="text-xs text-slate-500">Parse a hypothesis first. Then ask for a clarification; the app will re-run the local review with your instruction.</p> : chatHistory.map((message, index) => <div key={index} className={`bt-chat-msg ${message.role}`}><span className="bt-chat-msg-role">{message.role === "ai" ? "● Local research model" : "You"}</span>{message.text}</div>)}</div><div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "14px", marginTop: "auto" }}><div className="bt-chat-input-row"><input type="text" placeholder="Request a parameter clarification…" className="bt-chat-input" value={chatMessage} onChange={(event) => setChatMessage(event.target.value)} onKeyDown={(event) => event.key === "Enter" && handleSendChat()} /><button className="bt-primary" onClick={handleSendChat} disabled={loading}><Send size={14} /> Send</button></div></div></section>
      </div>

      {analysis && (!importJob || importJob.status === "complete") && <section className="bt-panel" style={{ padding: "20px" }}>
        <div className="bt-row-between"><div><div className="bt-row"><Play size={16} style={{ color: "#4f46e5" }} /><h3>Run this proposal on local NSE data</h3></div><p className="text-xs text-slate-500" style={{ marginTop: "6px" }}>Paper-only simulation. Starting capital: ₹1,00,000; brokerage and slippage: ₹0.</p></div><span className="data-source">{availability ? `${availability.bars} daily bars` : "Checking data…"}</span></div>
        {!availability?.bars ? <div className="bt-alert-error" role="alert" style={{ marginTop: "16px" }}>No imported daily NSE data exists for {symbol.trim().toUpperCase() || "this symbol"}.</div> : <>
          <div className="bt-grid-2" style={{ margin: "16px 0" }}><div><label className="bt-field-label">From (available from {availability.earliest?.slice(0, 10)})</label><input className="bt-field-input" type="date" min={availability.earliest?.slice(0, 10)} max={endDate || availability.latest?.slice(0, 10)} value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div><div><label className="bt-field-label">To (available to {availability.latest?.slice(0, 10)})</label><input className="bt-field-input" type="date" min={startDate || availability.earliest?.slice(0, 10)} max={availability.latest?.slice(0, 10)} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div></div>
          <button className="bt-primary" onClick={() => void runBacktest()} disabled={runningBacktest || !startDate || !endDate}>{runningBacktest ? <><Loader2 size={14} className="spin" /> Running real backtest…</> : <><Play size={14} /> Run SMA({analysis.suggested_backtest.fast_window}/{analysis.suggested_backtest.slow_window}) backtest</>}</button>
        </>}
      </section>}

      {backtest && <section className="bt-panel" style={{ padding: "20px" }}><div className="bt-row-between"><div><div className="bt-row"><CheckCircle size={17} style={{ color: "#059669" }} /><h3>Backtest completed</h3></div><p className="text-xs text-slate-500" style={{ marginTop: "6px" }}>Run {backtest.run_id} · {symbol.trim().toUpperCase()} · {startDate} to {endDate}</p></div><span className="bt-ai-badge">Local data</span></div><div className="bt-grid-2" style={{ marginTop: "16px" }}><div className="bt-callout"><strong>Total return</strong><p style={{ fontSize: "1.35rem", color: (backtest.metrics.total_return ?? 0) >= 0 ? "#059669" : "#e11d48" }}>{formatPercent(backtest.metrics.total_return)}</p></div><div className="bt-callout"><strong>Max drawdown</strong><p style={{ fontSize: "1.35rem", color: "#e11d48" }}>{formatPercent(backtest.metrics.maximum_drawdown)}</p></div><div className="bt-callout"><strong>Sharpe ratio</strong><p style={{ fontSize: "1.35rem" }}>{(backtest.metrics.sharpe_ratio ?? 0).toFixed(2)}</p></div><div className="bt-callout"><strong>Closed trades</strong><p style={{ fontSize: "1.35rem" }}>{Math.round(backtest.metrics.trade_count ?? backtest.trades.length)}</p></div></div>{backtest.warnings.length > 0 && <div className="bt-alert-error" style={{ marginTop: "16px" }}>{backtest.warnings.join(" ")}</div>}<div className="bt-row-between" style={{ marginTop: "16px" }}><span className="text-xs text-slate-500">Results are historical simulations, not investment advice.</span><Link href="/strategy" className="bt-secondary">Edit strategy <ChevronRight size={14} /></Link></div></section>}
    </main>
  </div>;
}
