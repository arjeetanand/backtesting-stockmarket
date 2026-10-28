"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Check, CheckCircle, ChevronRight, Circle, Code2, Loader2, MessageSquare, Play, Send, Sparkles, Star } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import SectionArtwork from "@/components/illustrations/SectionArtwork";
import { getMarketAvailability, getMarketData, type MarketAvailability, type MarketDataBar } from "@/lib/market-data";
import { SymbolCombobox } from "@/components/data/SymbolCombobox";
import { STRATEGY_LIBRARY, UNIFIED_STRATEGIES } from "@/lib/strategy-library";
import { FinancialChart } from "@/components/charts/FinancialChart";
import { DrawdownChart } from "@/components/charts/Charts";
import { adaptBacktestChart, adaptMarketBars, type BacktestChartPayload } from "@/lib/research-chart";
import { canRunHistoricalTest } from "@/lib/research-flow";

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

type StepStatus = "complete" | "running" | "ready" | "pending";
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
  candles?: Array<{ date: string; open: number; high: number; low: number; close: number; volume?: number | null }>;
  indicators?: Record<string, Array<{ date: string; value: number | null }>>;
  signals?: Array<{ id?: string; date: string; type: "entry" | "exit"; price: number; trade_id?: number }>;
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

const PIPELINE = ["Analyze the idea", "Review the rule", "Confirm NSE history", "Run the simulation", "Choose follow-up checks"];
const moneyLabel = (value: number) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const signedMoneyLabel = (value: number) => `${value >= 0 ? "+" : "−"}${moneyLabel(Math.abs(value))}`;
const dateOnly = (value?: string) => value?.slice(0, 10) ?? "";
function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then((value) => { window.clearTimeout(timer); resolve(value); }, (reason) => { window.clearTimeout(timer); reject(reason); });
  });
}

type Candle = { date: string; open: number; high: number; low: number; close: number; volume?: number | null };

export default function ResearchPage() {
  const today = new Date().toISOString().slice(0, 10);
  const defaultStart = new Date(new Date(`${today}T00:00:00`).setFullYear(new Date(`${today}T00:00:00`).getFullYear() - 1)).toISOString().slice(0, 10);
  const [hypothesis, setHypothesis] = useState("Test whether a 20-day moving average crossing above a 50-day average is followed by positive returns.");
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
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: "ai" | "user"; text: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [runningBacktest, setRunningBacktest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [proposalScore, setProposalScore] = useState<number | null>(null);
  const [importedFlow, setImportedFlow] = useState(false);
  const [marketBars, setMarketBars] = useState<MarketDataBar[]>([]);
  const [marketDataLoading, setMarketDataLoading] = useState(false);
  const [marketDataError, setMarketDataError] = useState<string | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [hiddenIndicators, setHiddenIndicators] = useState<string[]>([]);

  const invalidateRun = () => {
    setReviewConfirmed(false);
    setBacktest(null);
    setSelectedTradeId(null);
    setMarketBars([]);
    setMarketDataLoading(false);
    setMarketDataError(null);
    setHiddenIndicators([]);
  };

  useEffect(() => {
    queueMicrotask(() => {
      try {
      const source = new URLSearchParams(window.location.search).get("source");
      const isHandoffFlow = source === "youtube-template" || source === "scanner" || source === "breakout-scanner";
      if (isHandoffFlow) {
        queueMicrotask(() => setRestored(true));
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
    });
  }, []);

  useEffect(() => {
    if (!restored) return;
    window.localStorage.setItem("backtrack:research-session", JSON.stringify({
    hypothesis, symbol, strategyId, timeframe, initialCapital, positionSizeAmount, stopLossPct, takeProfitPct, requestedStart, requestedEnd, analysis, availability, startDate, endDate, backtest, chatHistory, proposalScore,
  }));
  }, [restored, hypothesis, symbol, strategyId, timeframe, initialCapital, positionSizeAmount, stopLossPct, takeProfitPct, requestedStart, requestedEnd, analysis, availability, startDate, endDate, backtest, chatHistory, proposalScore]);

  useEffect(() => {
    if (!availability?.bars || !startDate || !endDate || timeframe === "1hour") return;
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed) {
        setMarketDataLoading(true);
        setMarketDataError(null);
      }
    });
    void withTimeout(
      getMarketData(symbol.trim().toUpperCase(), startDate, endDate, timeframe),
      "Historical candles are taking longer than expected. Check the API connection and retry.",
      15000,
    ).then((response) => {
      if (disposed) return;
      if (!response.quality.is_valid) {
        const firstIssue = response.quality.errors[0];
        throw new Error(typeof firstIssue === "string" ? firstIssue : firstIssue?.message ?? "The local market-data response failed validation.");
      }
      setMarketBars(response.bars);
    }).catch((requestError) => {
      if (!disposed) {
        setMarketBars([]);
        setMarketDataError(requestError instanceof Error ? requestError.message : "Could not load local historical candles.");
      }
    }).finally(() => {
      if (!disposed) setMarketDataLoading(false);
    });
    return () => { disposed = true; };
  }, [availability?.bars, endDate, startDate, symbol, timeframe]);

  const isLlmGenerated = Boolean(analysis?.generated_by && analysis.generated_by.toLowerCase().includes("ollama") && !analysis.generated_by.toLowerCase().includes("fallback"));
  const selectedStrategy = useMemo(
    () => STRATEGY_LIBRARY.find((item) => item.strategyId === strategyId),
    [strategyId],
  );
  const proposalAssumptions = analysis?.assumptions.filter((item) => !/ollama|model|llm/i.test(item)).slice(0, 2) ?? [];
  const proposalRisks = analysis?.risks.filter((item) => !/ollama|model|llm/i.test(item)).slice(0, 2) ?? [];
  const proposalUsedFallback = Boolean(analysis && (/fallback|ollama unavailable|could not reach ollama|did not respond/i.test(analysis.generated_by ?? "") || analysis.risks.some((item) => /ollama|could not reach|did not respond/i.test(item))));
  const canRunBacktest = canRunHistoricalTest({
    hasProposal: Boolean(analysis),
    reviewConfirmed,
    hasLocalData: Boolean(availability?.bars && startDate && endDate),
    supportedTimeframe: timeframe !== "1hour",
    isBusy: loading || runningBacktest,
    importComplete: !importJob || importJob.status === "complete",
  });
  const marketChart = useMemo(() => adaptMarketBars(marketBars), [marketBars]);
  const resultChart = useMemo(() => adaptBacktestChart((backtest ?? {}) as BacktestChartPayload), [backtest]);
  const visibleResultIndicators = useMemo(
    () => resultChart.indicators.filter((indicator) => !hiddenIndicators.includes(indicator.id)),
    [hiddenIndicators, resultChart.indicators],
  );
  const selectedDrawdown = useMemo(
    () => (backtest?.drawdown_curve ?? [])
      .filter((point) => {
        const date = dateOnly(point.date ?? point.timestamp);
        return Boolean(date) && (!startDate || date >= startDate) && (!endDate || date <= endDate);
      })
      .map((point) => ({ date: dateOnly(point.date ?? point.timestamp), drawdown: Number(point.drawdown ?? 0) })),
    [backtest?.drawdown_curve, endDate, startDate],
  );
  const dataReady = Boolean(availability?.bars && startDate && endDate && (!importJob || importJob.status === "complete"));
  const pipelineStatus: StepStatus[] = [
    loading ? "running" : analysis ? "complete" : "pending",
    analysis ? reviewConfirmed ? "complete" : "ready" : "pending",
    importJob && importJob.status !== "complete" && importJob.status !== "failed" ? "running" : dataReady ? "complete" : analysis ? "ready" : "pending",
    runningBacktest ? "running" : backtest ? "complete" : reviewConfirmed && dataReady ? "ready" : "pending",
    backtest ? "ready" : "pending",
  ];
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
    queueMicrotask(() => {
      setImportedFlow(true);
      const importedStrategy = params.get("strategy") ?? "sma_crossover";
      const selected = UNIFIED_STRATEGIES.find((item) => item.strategyId === importedStrategy) ?? UNIFIED_STRATEGIES[0];
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
        } else {
          void ensureResearchData(importedSymbol, importedStart, importedEnd);
        }
      }).catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Could not check local NSE history."));
    });
    // Scanner and imported-strategy handoffs are applied once when this route opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source");
    if (source !== "scanner" && source !== "breakout-scanner") return;
    queueMicrotask(() => {
      const handoffSymbol = (params.get("symbol") ?? "RELIANCE").trim().toUpperCase();
      const handoffStrategy = params.get("strategy") ?? "sma_crossover";
      const handoffTimeframe = params.get("timeframe");
      setSymbol(handoffSymbol);
      setStrategyId(STRATEGY_LIBRARY.some((item) => item.strategyId === handoffStrategy) ? handoffStrategy : "sma_crossover");
      if (handoffTimeframe && TIMEFRAMES.some((item) => item.value === handoffTimeframe)) setTimeframe(handoffTimeframe);
      if (params.get("start")) setRequestedStart(params.get("start")!);
      if (params.get("end")) setRequestedEnd(params.get("end")!);
      setAnalysis(null);
      setAvailability(null);
      setStartDate("");
      setEndDate("");
      setImportJob(null);
      setChatHistory([]);
      invalidateRun();
      setError(null);
    });
    // Scanner handoffs intentionally override the locally saved Research session.
  }, []);

  const parseHypothesis = async (nextHypothesis = hypothesis) => {
    if (!nextHypothesis.trim() || !symbol.trim()) return;
    setLoading(true);
    setError(null);
    invalidateRun();
    setAnalysis(null);
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
      } else {
        void ensureResearchData(selectedSymbol);
      }
      const selectedStrategy = UNIFIED_STRATEGIES.find((item) => item.strategyId === strategyId);
      setChatHistory((history) => [...history, { role: "ai", text: `${result.summary} Selected strategy: ${selectedStrategy?.name ?? strategyId}. The local model proposed windows ${result.suggested_backtest.fast_window} and ${result.suggested_backtest.slow_window}. ${result.suggested_backtest.rationale}` }]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Research parsing failed.");
    } finally {
      setLoading(false);
    }
  };

  const runBacktest = async () => {
    if (!analysis || !reviewConfirmed || !availability?.earliest || !availability.latest || !startDate || !endDate) return;
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

  const primaryAction = () => {
    if (!analysis) { void parseHypothesis(); return; }
    if (!reviewConfirmed) return;
    if (availability?.bars && startDate && endDate) { void runBacktest(); return; }
    if (!importJob || importJob.status === "failed" || importJob.status === "complete") void ensureResearchData(symbol.trim().toUpperCase(), requestedStart, requestedEnd);
  };

  const primaryActionLabel = runningBacktest ? "Running backtest…" : loading ? "Preparing strategy…" : analysis && reviewConfirmed && canRunBacktest ? "Run historical test" : analysis ? "Review the draft to continue" : "Analyze this idea";
  const progressMessage = loading
    ? "Reading the hypothesis, checking the selected rule, and asking the local model for a testable proposal."
    : runningBacktest
      ? "Walking through each historical candle, applying costs and risk limits, and calculating trade P&L."
      : null;

  const completedTrades = backtest?.trades ?? [];
  const winningTrades = completedTrades.filter((trade) => trade.pnl > 0).length;
  const losingTrades = completedTrades.filter((trade) => trade.pnl < 0).length;
  const netPnl = backtest ? backtest.final_equity - backtest.initial_capital : 0;
  const totalTrades = Math.round(backtest?.metrics?.trade_count ?? backtest?.metrics?.total_trades ?? completedTrades.length);
  const resultOutcome = totalTrades === 0 ? "No completed trades" : netPnl >= 0 ? "Positive in this sample" : "Negative in this sample";

  const handleSendChat = () => {
    const text = chatMessage.trim();
    if (!text) return;
    setChatHistory((history) => [...history, { role: "user", text }]);
    setChatMessage("");
    void parseHypothesis(`${hypothesis}\n\nClarification from the trader: ${text}`);
  };

  const retryOllama = () => {
    setAnalysis(null);
    invalidateRun();
    setError(null);
    void parseHypothesis();
  };

  return <div className="backtrack-page bt-research-page">
    <TopBar title="New research" />
    <main className="backtrack-content bt-stack">
      <section className="bt-heading-row">
        <div><h1>Research a trading idea</h1><p>Describe the setup, review the proposed rule, then test it on local NSE history.</p></div>
        <span className="data-source">{restored && (analysis || backtest) ? <><CheckCircle size={14} /> Saved session restored</> : <><BarChart3 size={14} /> Historical simulation · NSE data</>}</span>
      </section>

      <section className="bt-hypothesis-block">
        <div className="bt-hypothesis-header"><h2 className="bt-hypothesis-title">Start with your idea</h2><span className="bt-ai-badge">Optional local helper</span></div>
        <label className="bt-field-label" htmlFor="research-hypothesis">Describe the rule you want to test</label>
        <textarea id="research-hypothesis" className="bt-hypothesis-textarea" value={hypothesis} onChange={(event) => { setHypothesis(event.target.value); setAnalysis(null); invalidateRun(); }} />
        <div className="bt-grid-2 bt-research-inputs">
          <div><label className="bt-field-label">NSE symbol</label><SymbolCombobox value={symbol} onChange={(nextSymbol) => { setSymbol(nextSymbol); setAnalysis(null); setAvailability(null); setStartDate(""); setEndDate(""); invalidateRun(); setImportJob(null); }} /></div>
          <div><label className="bt-field-label">Strategy rule</label><select className="bt-field-input" aria-label="Strategy to test" value={strategyId} onChange={(event) => { setStrategyId(event.target.value); setAnalysis(null); invalidateRun(); }}><option value="sma_crossover">SMA crossover</option>{STRATEGY_LIBRARY.filter((item) => item.id !== "golden-cross" && item.strategyId !== "sma_crossover").map((item) => <option key={item.id} value={item.strategyId}>{item.name}</option>)}</select></div>
          <div><label className="bt-field-label">Backtest from</label><input className="bt-field-input" type="date" max={requestedEnd} value={requestedStart} onChange={(event) => { setRequestedStart(event.target.value); setStartDate(""); setEndDate(""); invalidateRun(); setImportJob(null); }} /></div>
          <div><label className="bt-field-label">Backtest to</label><input className="bt-field-input" type="date" min={requestedStart} max={today} value={requestedEnd} onChange={(event) => { setRequestedEnd(event.target.value); setStartDate(""); setEndDate(""); invalidateRun(); setImportJob(null); }} /></div>
        </div>
        <details className="bt-advanced-settings">
          <summary><span>Timeframe, capital &amp; risk</span><small>Daily NSE · {moneyLabel(initialCapital)} start · {moneyLabel(positionSizeAmount)} per trade</small></summary>
          <div className="bt-grid-2 bt-research-inputs">
            <div><label className="bt-field-label">Timeframe</label><select className="bt-field-input" aria-label="Backtest timeframe" value={timeframe} onChange={(event) => { setTimeframe(event.target.value); setAnalysis(null); invalidateRun(); }} >{TIMEFRAMES.map((item) => <option key={item.value} value={item.value}>{item.label} · {item.detail}</option>)}</select><span className="bt-field-help">Weekly and monthly are resampled from saved NSE daily candles. Hourly requires an intraday provider and is unavailable.</span></div>
            <div><label className="bt-field-label">Starting capital (₹)</label><input className="bt-field-input" type="number" min="1000" step="1000" value={initialCapital} onChange={(event) => { setInitialCapital(Math.max(1000, Number(event.target.value) || 1000)); invalidateRun(); }} /></div>
            <div><label className="bt-field-label">Money per trade (₹)</label><input className="bt-field-input" type="number" min="100" step="100" value={positionSizeAmount} onChange={(event) => { setPositionSizeAmount(Math.max(100, Number(event.target.value) || 100)); invalidateRun(); }} /><span className="bt-field-help">Fixed amount committed to each entry.</span></div>
            <div><label className="bt-field-label">Maximum loss per trade (%)</label><input className="bt-field-input" type="number" min="0" max="99" step="0.25" value={stopLossPct} onChange={(event) => { setStopLossPct(Math.min(99, Math.max(0, Number(event.target.value) || 0))); invalidateRun(); }} /><span className="bt-field-help">0 disables the stop-loss rule.</span></div>
            <div><label className="bt-field-label">Profit target per trade (%)</label><input className="bt-field-input" type="number" min="0" max="1000" step="0.25" value={takeProfitPct} onChange={(event) => { setTakeProfitPct(Math.min(1000, Math.max(0, Number(event.target.value) || 0))); invalidateRun(); }} /><span className="bt-field-help">0 exits only when the strategy signals.</span></div>
          </div>
        </details>
        <details className="bt-strategy-library" aria-label="Available strategy library"><summary><span><span className="bt-row"><BarChart3 size={15} style={{ color: "#4f46e5" }} /><strong>Browse the strategy library</strong></span><small>Pick from {STRATEGY_LIBRARY.length} supported rule sets if you want to compare approaches.</small></span><span className="bt-ai-badge">Optional</span></summary><div className="bt-strategy-library-body"><p className="bt-field-help">Source links are community references; the engine calculates fresh stats for your exact inputs. Price-action entries are labelled as Backtrack interpretations and remain reviewable.</p><div className="bt-strategy-library-grid">{STRATEGY_LIBRARY.map((item) => { const isSelected = strategyId === item.strategyId && item.id !== "golden-cross"; return <button type="button" key={item.id} data-testid={`strategy-card-${item.id}`} aria-pressed={isSelected} className={isSelected ? "is-selected" : ""} onClick={() => { setStrategyId(item.strategyId); setAnalysis(null); invalidateRun(); }}><span><strong>{item.name}</strong><small>{item.family} · {item.sourceLabel}</small></span><p>{item.description}</p><ChevronRight size={13} /></button>; })}</div>{strategyId && <p className="bt-library-selection"><Check size={13} /> Selected: <strong>{STRATEGY_LIBRARY.find((item) => item.strategyId === strategyId && item.id !== "golden-cross")?.name ?? STRATEGY_LIBRARY.find((item) => item.strategyId === strategyId)?.name}</strong> · {STRATEGY_LIBRARY.find((item) => item.strategyId === strategyId && item.id !== "golden-cross")?.use ?? STRATEGY_LIBRARY.find((item) => item.strategyId === strategyId)?.use}</p>}</div></details>
        <div className="bt-hypothesis-footer">
          <div className="bt-hypothesis-pills">{importedFlow ? <span className="bt-imported-formula-note"><CheckCircle size={13} /> Formula loaded from the strategy library. Review it before continuing.</span> : EXAMPLES.map((example) => <button type="button" key={example} className="bt-hypothesis-pill" onClick={() => { setHypothesis(example); setAnalysis(null); invalidateRun(); }}>{example.slice(0, 42)}…</button>)}</div>
          {!analysis && <button type="button" className="bt-primary" onClick={primaryAction} disabled={loading || runningBacktest || timeframe === "1hour"}>{loading ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} {primaryActionLabel}</button>}
        </div>
        {progressMessage && <div className="bt-run-status" role="status" aria-live="polite"><Loader2 size={15} className="spin" /><div><strong>{primaryActionLabel}</strong><span>{progressMessage}</span><small>This can take a little longer when NSE history or Ollama is being contacted. If Ollama is unavailable, a clearly labelled catalogue proposal keeps the historical test usable.</small></div></div>}
      </section>

      {error && <div className="bt-alert-error" role="alert">{error}</div>}

      {importJob && <section className="bt-panel" style={{ padding: "20px" }}><div className="bt-row-between"><div><div className="bt-row"><Loader2 size={16} className={importJob.status === "complete" || importJob.status === "failed" ? "" : "spin"} style={{ color: importJob.status === "failed" ? "#e11d48" : "#4f46e5" }} /><h3>Official NSE history preparation</h3></div><p className="text-xs text-slate-500" style={{ marginTop: "6px" }}>{importJob.message}</p></div><span className="bt-ai-badge">{importJob.status}</span></div><div className="bt-grid-2" style={{ marginTop: "16px" }}>{["Validate local cache", "Download or reuse archive", "Save full archive to SQLite", "Ready to backtest"].map((step, index) => { const completed = importJob.status === "complete" || (index === 0 && importJob.status !== "queued") || (index === 1 && importJob.stage?.includes("Saving")); return <div key={step} className="bt-callout"><strong>{completed ? "✓ " : "○ "}{step}</strong><p>{index === 1 && importJob.total_days ? `${importJob.completed_days ?? 0}/${importJob.total_days} trading days checked` : completed ? "Done" : "Waiting"}</p></div>; })}</div>{importJob.status === "failed" && <div className="bt-alert-error" style={{ marginTop: "14px" }}>NSE history could not be prepared. Retry the local data check when the API is available.</div>}</section>}

      <section className="bt-panel bt-pipeline-panel"><div className="bt-row-between"><p className="bt-pipeline-title">One research flow</p><span className="bt-panel-note">Checkpoints show real steps, not separate agents</span></div><div className="bt-pipeline-grid">{PIPELINE.map((label, index) => {
        const status = pipelineStatus[index] ?? "pending";
        return <div key={label} className={`bt-pipeline-step ${status}`}><div className="bt-step-top"><span className="bt-step-num">0{index + 1}</span>{status === "complete" ? <CheckCircle size={14} aria-hidden="true" /> : status === "running" ? <Loader2 size={14} className="spin" aria-hidden="true" /> : status === "ready" ? <ChevronRight size={14} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}</div><div><p className="bt-step-label">{label}</p><p className={`bt-step-status ${status}`}>{status}</p></div></div>;
      })}</div></section>

      <div className="bt-grid-2">
        <section className="bt-panel bt-proposal-panel" style={{ padding: "20px" }}>
          <div className="bt-row-between bt-proposal-heading"><div><div className="bt-row"><Code2 size={16} aria-hidden="true" /><h3>Review the proposed rule</h3></div><p className="bt-section-explanation">Backtrack turns your idea into a draft. Check its assumptions before running the simulation.</p></div><span className="bt-ai-badge">{analysis ? (isLlmGenerated ? "Local model draft" : "Curated rule") : "Waiting"}</span></div>
          {!analysis ? <div className="bt-proposal-empty"><SectionArtwork src="/illustrations/strategy-rules.png" className="bt-research-rule-art" /><span>Describe an idea above. Backtrack will draft a rule here so you can check its assumptions before running anything.</span></div> : <>
            <div className="bt-proposal-summary">
              <div className="bt-proposal-rule"><span className="bt-eyebrow">Rule being tested</span><strong>{selectedStrategy?.name ?? strategyId}</strong><p>{analysis.summary}</p><small>{selectedStrategy?.description ?? analysis.suggested_backtest.rationale}</small></div>
              <div className="bt-proposal-settings"><span>{symbol.trim().toUpperCase()} · {TIMEFRAMES.find((item) => item.value === timeframe)?.label ?? timeframe}</span><span>Fast {analysis.suggested_backtest.fast_window} / slow {analysis.suggested_backtest.slow_window}</span><span>{moneyLabel(positionSizeAmount)} per trade · {stopLossPct}% stop · {takeProfitPct}% target</span></div>
            </div>
            <div className="bt-proposal-next"><CheckCircle size={17} /><div><strong>What will happen</strong><p>{analysis.suggested_backtest.rationale} Signals are checked candle by candle and filled on the next candle. The result is historical evidence, not a forecast.</p></div></div>
            <div className="bt-proposal-columns"><div><strong>Assumptions</strong>{(proposalAssumptions.length ? proposalAssumptions : ["Signals execute on the next candle."]).map((item) => <p key={item}>• {item}</p>)}</div><div><strong>Watch for</strong>{(proposalRisks.length ? proposalRisks : ["Fees, slippage, sample size, and changing market regimes."]).map((item) => <p key={item}>• {item}</p>)}</div></div>
            {proposalUsedFallback && <p className="bt-proposal-source-note"><Sparkles size={13} /> Backtrack used its transparent rule catalogue because local Ollama was unavailable. You can still run the historical test.</p>}
            <label className="bt-review-confirm"><input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} /><span>I reviewed the rule, assumptions, and risk settings.</span></label>
            <details className="bt-proposal-details"><summary>Show technical details</summary><p className="bt-field-help">For review/debugging only. These details do not place an order or change the simulation.</p><pre className="bt-dsl-preview"><code>{dsl}</code></pre><div className="bt-proposal-score"><span>Was this explanation useful?</span>{[1, 2, 3, 4, 5].map((score) => <button type="button" key={score} aria-label={`Score proposal ${score} out of 5`} className={proposalScore === score ? "is-selected" : ""} onClick={() => setProposalScore(score)}><Star size={13} fill={proposalScore !== null && score <= proposalScore ? "currentColor" : "none"} /></button>)}{proposalScore && <small>Saved locally.</small>}</div></details>
            <div className="bt-proposal-actions"><span>{reviewConfirmed ? "The test will use historical NSE data and simulated fills." : "Confirm your review to enable the next step."}</span><span className="bt-row">{proposalUsedFallback && <button type="button" className="bt-secondary small" onClick={retryOllama} disabled={loading || runningBacktest}>Retry local explanation</button>}<button type="button" className="bt-primary" onClick={primaryAction} disabled={!reviewConfirmed || loading || runningBacktest || timeframe === "1hour" || Boolean(importJob && ["queued", "running"].includes(importJob.status))}>{runningBacktest || loading ? <Loader2 size={14} className="spin" /> : <Play size={14} />} {runningBacktest ? "Running simulation…" : canRunBacktest ? "Run historical test" : importJob?.status === "failed" ? "Retry NSE data check" : "Check local NSE data"}</button></span></div>
          </>}
        </section>
        <section className="bt-panel bt-clarification-panel" style={{ padding: "20px" }}>
          <details className="bt-clarification-details">
            <summary><span className="bt-row"><MessageSquare size={16} style={{ color: "#4f46e5" }} /><span><strong>Need help with this rule?</strong><small>Optional · ask one question about the setup or its risks.</small></span></span><span className="bt-ai-badge">Optional</span></summary>
            <div className="bt-clarification-body"><div className="bt-chat-scroll">{chatHistory.length === 0 ? <p className="text-xs text-slate-500">Ask the local helper to explain a term, challenge an assumption, or suggest a safer test.</p> : <>{chatHistory.slice(-3).map((message, index) => <div key={`${message.role}-${index}`} className={`bt-chat-msg ${message.role}`}><span className="bt-chat-msg-role">{message.role === "ai" ? (message.text.includes("Ollama did not respond") ? "● Curated fallback" : "● Local helper") : "You"}</span>{message.text}</div>)}{chatHistory.length > 3 && <p className="bt-field-help">{chatHistory.length - 3} earlier messages are hidden.</p>}</>}</div><div className="bt-chat-input-row"><input type="text" placeholder="For example: what does the stop loss change?" className="bt-chat-input" value={chatMessage} onChange={(event) => setChatMessage(event.target.value)} onKeyDown={(event) => event.key === "Enter" && handleSendChat()} /><button type="button" className="bt-primary" onClick={handleSendChat} disabled={loading}><Send size={14} /> Ask</button></div></div>
          </details>
        </section>
      </div>

      {analysis && (!importJob || importJob.status === "complete") && <section className="bt-panel" style={{ padding: "20px" }}>
        <div className="bt-row-between"><div><div className="bt-row"><BarChart3 size={16} style={{ color: "#4f46e5" }} /><h3>Historical data coverage</h3></div><p className="text-xs text-slate-500" style={{ marginTop: "6px" }}>This paper-only test uses {moneyLabel(initialCapital)} account size, {moneyLabel(positionSizeAmount)} per trade, {stopLossPct}% maximum loss, and {takeProfitPct}% profit target.</p></div><span className="data-source">{availability ? `${availability.bars} daily bars available` : "Checking data…"}</span></div>
        {!availability?.bars ? <div className="bt-alert-error" role="alert" style={{ marginTop: "16px" }}>No imported daily NSE data exists for {symbol.trim().toUpperCase() || "this symbol"}.</div> : <>
          <p className="bt-action-help"><CheckCircle size={13} /> Available history: {availability.earliest?.slice(0, 10)} → {availability.latest?.slice(0, 10)}. Choose the backtest dates once above; this section only confirms the stock has local NSE coverage.</p>
        </>}
      </section>}

      {analysis && !backtest && (!importJob || importJob.status === "complete") && <section className="bt-panel bt-research-chart-panel" aria-label="Historical price chart">
        <div className="bt-row-between"><div><div className="bt-row"><BarChart3 size={16} style={{ color: "#4f46e5" }} /><h3>Historical price and volume</h3></div><p className="text-xs text-slate-500" style={{ marginTop: "6px" }}>Real local NSE candles for {symbol.trim().toUpperCase()} · {timeframe === "1day" ? "daily" : `${timeframe} derived from daily NSE candles`} · {startDate} to {endDate}.</p></div><span className="data-source">{marketBars.length ? `${marketBars.length} candles loaded` : "Waiting for candles"}</span></div>
        <FinancialChart candles={marketChart.candles} indicators={marketChart.indicators} tradeMarkers={marketChart.tradeMarkers} trades={marketChart.trades} loading={marketDataLoading} unavailable={timeframe === "1hour"} error={marketDataError} empty={!marketDataLoading && !marketDataError && marketChart.candles.length === 0} emptyMessage="No local candles were returned for this range. Import the official NSE history before running a test." title={`${symbol.trim().toUpperCase()} · ${timeframe}`} description="Historical local NSE OHLCV candles. This chart does not display live prices." />
      </section>}

      {backtest && <section className="bt-panel bt-research-chart-panel" aria-label="Backtest price chart">
        <div className="bt-row-between"><div><div className="bt-row"><CheckCircle size={16} style={{ color: "#059669" }} /><h3>Signals on the historical chart</h3></div><p className="text-xs text-slate-500" style={{ marginTop: "6px" }}>Click an entry or exit marker to highlight the matching simulated trade. All fills remain historical and paper-only.</p></div><span className="bt-ai-badge">{resultChart.tradeMarkers.length ? `${resultChart.tradeMarkers.length} markers` : "No markers"}</span></div>
        {resultChart.indicators.length > 0 && <div className="bt-chart-indicator-toggle" aria-label="Show or hide backtest indicators"><span>Indicators</span>{resultChart.indicators.map((indicator) => { const hidden = hiddenIndicators.includes(indicator.id); return <button key={indicator.id} type="button" aria-pressed={!hidden} className={hidden ? "" : "is-active"} onClick={() => setHiddenIndicators((current) => hidden ? current.filter((id) => id !== indicator.id) : [...current, indicator.id])}>{indicator.label}</button>; })}</div>}
        <FinancialChart candles={resultChart.candles} indicators={visibleResultIndicators} tradeMarkers={resultChart.tradeMarkers} trades={resultChart.trades} selectedTradeId={selectedTradeId} onTradeSelect={setSelectedTradeId} empty={resultChart.candles.length === 0} emptyMessage="The backtest did not return chart candles. Re-run after confirming local history is available." title={`${backtest.symbol} · ${backtest.strategy_id ?? strategyId}`} description="Historical NSE candlesticks with backend-calculated indicators and simulated entry and exit markers." />
        {selectedTradeId && <div className="bt-chart-selection-note" role="status">Selected trade <strong>#{selectedTradeId}</strong>. The highlighted line connects its entry and exit when both points are visible.</div>}
      </section>}

      {backtest && <section className="bt-panel bt-research-result" style={{ padding: "20px" }}>
        <div className="bt-row-between"><div><div className="bt-row"><CheckCircle size={17} style={{ color: "#059669" }} /><h3>Backtest result</h3></div><p className="text-xs text-slate-500" style={{ marginTop: "6px" }}>{backtest.symbol} · {backtest.timeframe} · {startDate} to {endDate}</p></div><span className="bt-ai-badge">Historical NSE candles</span></div>
        <div className={`bt-result-outcome ${netPnl >= 0 ? "is-positive" : "is-negative"}`}>
          <div><span className="bt-eyebrow">{resultOutcome}</span><strong>{signedMoneyLabel(netPnl)}</strong><small>Net P&amp;L after the simulated entries, exits, fees, and slippage</small></div>
          <div><span>Ending equity</span><strong>{moneyLabel(backtest.final_equity)}</strong><small>Started with {moneyLabel(backtest.initial_capital)}</small></div>
        </div>
        <div className="bt-result-explainer"><BarChart3 size={17} /><div><strong>How to read this result</strong><p>The engine followed the selected rules one candle at a time and filled signals on the next candle, so this test does not look into the future. {totalTrades > 0 ? `It won ${winningTrades} of ${totalTrades} closed trades and lost ${losingTrades}.` : "It did not find a completed trade in this window."} This is evidence from one historical period, not a forecast.</p></div></div>
        <div className="bt-grid-2 bt-result-metrics" style={{ marginTop: "16px" }}>
          <div className="bt-callout"><strong>Trades</strong><p>{totalTrades}</p><small>{winningTrades} wins · {losingTrades} losses</small></div>
          <div className="bt-callout"><strong>Win rate</strong><p>{formatPercent(backtest.metrics?.win_rate)}</p><small>Share of closed trades that made money</small></div>
          <div className="bt-callout"><strong>Max drawdown</strong><p className="bt-result-negative">{formatPercent(backtest.metrics?.maximum_drawdown ?? backtest.metrics?.max_drawdown)}</p><small>Largest fall from a previous equity peak</small></div>
          <div className="bt-callout"><strong>Total return</strong><p className={netPnl >= 0 ? "bt-result-positive" : "bt-result-negative"}>{formatPercent(backtest.metrics?.total_return)}</p><small>Return relative to starting capital</small></div>
        </div>
        {completedTrades.length > 0 && <div className="bt-result-trades"><div className="bt-row-between"><strong>Trade-by-trade results</strong><span className="bt-field-help">Select a trade to focus its entry and exit on the chart.</span></div>{completedTrades.map((trade) => { const tradeId = String(trade.id ?? trade.trade_id); const selected = selectedTradeId === tradeId; return <button type="button" className={`bt-result-trade${selected ? " is-selected" : ""}`} aria-pressed={selected} key={tradeId} onClick={() => setSelectedTradeId(selected ? null : tradeId)}><span className="bt-trade-index">#{trade.trade_id ?? trade.id}</span><span><strong>{trade.entry_date || "Entry"} → {trade.exit_date || "Exit"}</strong><small>{trade.entry_price ? `₹${trade.entry_price.toLocaleString("en-IN")} → ₹${(trade.exit_price ?? 0).toLocaleString("en-IN")}` : "Simulated next-candle execution"}</small><small>Committed {moneyLabel(trade.entry_amount ?? 0)} · Held {trade.holding_days ?? 0} days · Best open {moneyLabel(trade.max_unrealized_pnl ?? 0)} · Worst open {moneyLabel(trade.min_unrealized_pnl ?? 0)}</small><small>Realized at exit {signedMoneyLabel(trade.pnl)}</small></span><b className={trade.pnl >= 0 ? "bt-result-positive" : "bt-result-negative"}>{signedMoneyLabel(trade.pnl)}</b></button>; })}</div>}
        {totalTrades === 0 && <div className="bt-empty-result"><strong>No completed trades in this window</strong><span>Try a longer date range, a different stock, or a strategy with signals in this period. No prices were invented.</span></div>}
        {(backtest.warnings?.length ?? 0) > 0 && <div className="bt-alert-error" style={{ marginTop: "16px" }}>{backtest.warnings?.join(" ")}</div>}
        <div className="bt-row-between bt-research-next-actions" style={{ marginTop: "16px" }}><span className="text-xs text-slate-500">Historical simulation only · no real order was placed. Follow-up tools ask you to confirm their own inputs.</span><span className="bt-row"><Link href="/robustness" className="bt-secondary">Reliability analysis <ChevronRight size={14} /> </Link><Link href="/bias-validity" className="bt-secondary">Validity checklist <ChevronRight size={14} /> </Link><Link href={{ pathname: "/replay", query: { source: "research", symbol, timeframe, start: startDate, end: endDate } }} className="bt-secondary">Replay these candles <ChevronRight size={14} /> </Link><Link href="/strategy" className="bt-secondary">Adjust rules <ChevronRight size={14} /> </Link><Link href={{ pathname: "/comparison", query: { source: "research", symbol, strategy: strategyId, timeframe, start: startDate, end: endDate, capital: initialCapital, position: positionSizeAmount, stop: stopLossPct, target: takeProfitPct } }} className="bt-secondary">Compare this run <ChevronRight size={14} /> </Link></span></div>
      </section>}
      {selectedDrawdown.length > 1 && <section className="bt-panel bt-research-chart-panel" aria-label="Backtest drawdown curve"><div className="bt-row-between"><div><h3>Drawdown through the same test window</h3><p className="text-xs text-slate-500" style={{ marginTop: "6px" }}>{startDate} → {endDate}. The percentage fall from the previous equity peak.</p></div><span className="data-source">Max {formatPercent(backtest?.metrics?.maximum_drawdown ?? backtest?.metrics?.max_drawdown)}</span></div><DrawdownChart data={selectedDrawdown} height={220} /></section>}
    </main>
  </div>;
}
