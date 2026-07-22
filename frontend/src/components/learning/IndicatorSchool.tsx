"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, CheckCircle2, Database, Gauge, LineChart, Play, RotateCcw, ShieldAlert, Target, Zap } from "lucide-react";
import { runStrategyBacktest, type LiveBacktestResult } from "@/lib/backtest-api";

type IndicatorId = "rsi" | "sma" | "ema" | "macd" | "bollinger" | "atr" | "stochastic" | "vwap";
type BacktestStrategy = "rsi_mean_reversion" | "sma_crossover" | "ema_crossover" | "macd_crossover" | "bollinger_mean_reversion" | "donchian_breakout";

type IndicatorGuide = {
  id: IndicatorId;
  name: string;
  family: string;
  oneLine: string;
  question: string;
  defaultPeriod: number;
  periodMin: number;
  periodMax: number;
  periodHint: string;
  standard: string;
  faster: string;
  slower: string;
  read: string[];
  helps: string;
  caution: string;
  strategyId: BacktestStrategy;
  exampleName: string;
  exampleRule: string;
};

const guides: IndicatorGuide[] = [
  {
    id: "rsi",
    name: "RSI",
    family: "Momentum",
    oneLine: "A 0–100 speedometer for recent price movement.",
    question: "Has price moved too far, too quickly?",
    defaultPeriod: 14,
    periodMin: 2,
    periodMax: 30,
    periodHint: "14 is the widely used starting point.",
    standard: "RSI 14",
    faster: "RSI 7 reacts quickly but is noisy.",
    slower: "RSI 30 is calmer and gives fewer signals.",
    read: ["Below 30: often called oversold; a possible pullback zone, not an automatic buy.", "Above 70: often called overbought; a possible cooling zone, not an automatic sell.", "Around 50: momentum is broadly balanced."],
    helps: "It helps you compare the strength of recent gains with recent losses and spot stretched moves.",
    caution: "RSI can stay above 70 in a strong uptrend or below 30 in a strong downtrend. Add a trend filter or test both directions.",
    strategyId: "rsi_mean_reversion",
    exampleName: "RSI mean reversion",
    exampleRule: "Buy below RSI 30; exit when RSI recovers above 50.",
  },
  {
    id: "sma",
    name: "SMA",
    family: "Trend",
    oneLine: "The average closing price over a chosen number of candles.",
    question: "Is price above or below its normal level?",
    defaultPeriod: 20,
    periodMin: 5,
    periodMax: 200,
    periodHint: "20/50 are common study periods; 200 is a long-term reference.",
    standard: "SMA 20 / 50",
    faster: "SMA 10/20 follows price more closely.",
    slower: "SMA 100/200 filters more noise but reacts late.",
    read: ["Price above a rising average suggests positive trend context.", "A fast average crossing above a slow average is a commonly tested bullish signal.", "The average is a filter, not a prediction of the next candle."],
    helps: "It turns a noisy price series into a simple trend line and gives strategies a repeatable entry/exit rule.",
    caution: "Moving averages lag. Crossovers may give back profit during sideways markets.",
    strategyId: "sma_crossover",
    exampleName: "SMA crossover",
    exampleRule: "Buy when SMA 20 crosses above SMA 50; exit on the reverse cross.",
  },
  {
    id: "ema",
    name: "EMA",
    family: "Trend",
    oneLine: "A moving average that gives more weight to recent prices.",
    question: "Is the recent trend changing faster than the older trend?",
    defaultPeriod: 20,
    periodMin: 5,
    periodMax: 100,
    periodHint: "20/50 are popular swing-trading defaults.",
    standard: "EMA 20 / 50",
    faster: "EMA 9/21 is more responsive for shorter swings.",
    slower: "EMA 50/200 is slower and used for broad trend context.",
    read: ["A fast EMA above a slow EMA is a positive trend filter.", "Crosses happen earlier than with an SMA, but false signals can increase.", "The slope of the line matters: flat means trend conviction is weak."],
    helps: "It is useful when you want a trend signal that adapts sooner to new information.",
    caution: "There is no universally best period. Compare settings across different periods instead of selecting the best one after the fact.",
    strategyId: "ema_crossover",
    exampleName: "EMA trend crossover",
    exampleRule: "Buy when EMA 20 crosses above EMA 50; exit on the reverse cross.",
  },
  {
    id: "macd",
    name: "MACD",
    family: "Momentum + trend",
    oneLine: "The gap between a fast and slow EMA, smoothed into a signal line.",
    question: "Is momentum accelerating or losing force?",
    defaultPeriod: 9,
    periodMin: 5,
    periodMax: 20,
    periodHint: "The classic setup is 12 / 26 / 9: fast EMA, slow EMA, signal.",
    standard: "MACD 12 / 26 / 9",
    faster: "A shorter signal period reacts sooner.",
    slower: "A longer signal period reduces noise and delays confirmation.",
    read: ["MACD above its signal line suggests improving momentum.", "A cross above zero can support a broader bullish trend read.", "The histogram shows whether the gap is widening or shrinking."],
    helps: "It combines direction and momentum in one view, often used to confirm—not replace—price structure.",
    caution: "MACD is derived from moving averages, so it is lagging and can whipsaw in a range.",
    strategyId: "macd_crossover",
    exampleName: "MACD crossover",
    exampleRule: "Buy when MACD crosses above its signal line; exit on the bearish cross.",
  },
  {
    id: "bollinger",
    name: "Bollinger Bands",
    family: "Volatility",
    oneLine: "A moving average wrapped in bands that expand and contract with volatility.",
    question: "Is price unusually far from its recent average?",
    defaultPeriod: 20,
    periodMin: 5,
    periodMax: 100,
    periodHint: "20 periods and 2 standard deviations is the common starting point.",
    standard: "20 periods · 2σ",
    faster: "10 periods reacts to short bursts and widens quickly.",
    slower: "50 periods describes a broader volatility envelope.",
    read: ["Touching a band means price is extended relative to recent volatility—not that reversal is guaranteed.", "A squeeze signals unusually quiet volatility and can precede a larger move.", "A walk along the upper band can be strength, not a sell signal."],
    helps: "It gives context for both stretch and changing volatility, which can improve how you size or filter a setup.",
    caution: "Mean-reversion entries can fail badly during a persistent trend. Test trend and range scenarios separately.",
    strategyId: "bollinger_mean_reversion",
    exampleName: "Bollinger reversion",
    exampleRule: "Buy below the lower band; exit when price returns to the middle band.",
  },
  {
    id: "atr",
    name: "ATR",
    family: "Risk / volatility",
    oneLine: "The average true range of price movement, measured in rupees.",
    question: "How much does this stock normally move?",
    defaultPeriod: 14,
    periodMin: 5,
    periodMax: 50,
    periodHint: "14 is a common baseline for daily risk planning.",
    standard: "ATR 14",
    faster: "ATR 7 adapts faster to a new volatility regime.",
    slower: "ATR 30 creates a steadier risk estimate.",
    read: ["ATR rising means the typical daily range is expanding.", "ATR is not directional: it can rise in both rallies and sell-offs.", "A stop at 1–2 ATR adapts to the stock’s current movement instead of using one fixed rupee value."],
    helps: "It helps set position size, stop distance, and realistic profit targets so a normal move does not stop you out.",
    caution: "ATR is an amount, not a forecast. A ₹30 ATR means something different for a ₹300 stock than a ₹3,000 stock.",
    strategyId: "donchian_breakout",
    exampleName: "Volatility-aware breakout",
    exampleRule: "Use a 50-day breakout and review the result alongside the stock’s ATR risk range.",
  },
  {
    id: "stochastic",
    name: "Stochastic",
    family: "Momentum",
    oneLine: "Compares the close with the recent high–low range.",
    question: "Is the close near the top or bottom of its recent range?",
    defaultPeriod: 14,
    periodMin: 5,
    periodMax: 30,
    periodHint: "14 with 3-period smoothing is a common default.",
    standard: "%K 14 · %D 3",
    faster: "5/3 catches shorter turns but can over-signal.",
    slower: "21/5 smooths more noise and turns later.",
    read: ["Above 80 is commonly called overbought; below 20 oversold.", "A cross of %K and %D can mark a momentum turn.", "Use it more carefully in strong trends, where it may remain extreme."],
    helps: "It can help time entries inside a range or identify a pullback turning point.",
    caution: "An extreme reading alone is not a reversal signal. Always define the market regime you are testing.",
    strategyId: "rsi_mean_reversion",
    exampleName: "Momentum pullback proxy",
    exampleRule: "Use the RSI mean-reversion engine as a testable momentum baseline, then compare the idea with Stochastic rules.",
  },
  {
    id: "vwap",
    name: "VWAP",
    family: "Price / volume",
    oneLine: "The average traded price weighted by volume during a session.",
    question: "Is price trading above or below the session’s volume-weighted average?",
    defaultPeriod: 1,
    periodMin: 1,
    periodMax: 30,
    periodHint: "Session VWAP resets each day; anchored VWAP uses a chosen start date.",
    standard: "Session VWAP",
    faster: "A session reset gives the most current intraday context.",
    slower: "An anchored VWAP from a major event gives broader context.",
    read: ["Above VWAP can indicate buyers are paying up relative to the session average.", "Below VWAP can indicate sellers have control of the session average.", "VWAP is strongest when paired with price structure and volume behaviour."],
    helps: "It gives a volume-aware reference price used heavily for intraday execution and institutional context.",
    caution: "This app’s official NSE archive is daily OHLCV. Session VWAP needs intraday candles, so it is a learning guide here rather than a daily backtest claim.",
    strategyId: "ema_crossover",
    exampleName: "Daily trend comparison",
    exampleRule: "Use EMA crossover as a daily-data comparison; do not treat it as a VWAP backtest.",
  },
];

const exampleSymbols = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK"];
const today = new Date().toISOString().slice(0, 10);
const defaultStart = `${new Date().getFullYear() - 3}-01-01`;

const strategyRecipes: Record<IndicatorId, { primary: string; usedIn: string; pairs: string; steps: string[]; historySupported: boolean }> = {
  rsi: { primary: "RSI mean reversion (implemented here)", usedIn: "Mean-reversion entries, pullback systems, and RSI + EMA trend filters.", pairs: "EMA 20/50 for trend direction, support/resistance for location, and ATR for risk distance.", steps: ["Calculate RSI over the last 14 daily candles.", "Enter the next day only after RSI closes below 30.", "Exit when RSI closes back above 50; this app executes on the following candle open."], historySupported: true },
  sma: { primary: "SMA crossover", usedIn: "Long-term trend following, Golden Cross studies, and buy-and-hold comparisons.", pairs: "A faster SMA 20 with a slower SMA 50 or 200 to define a trend change.", steps: ["Calculate the fast and slow averages on each daily close.", "Enter when SMA 20 crosses above SMA 50.", "Exit when the fast average crosses back below the slow average."], historySupported: true },
  ema: { primary: "EMA trend crossover", usedIn: "Swing trading, trend filters, and faster pullback systems.", pairs: "EMA 9/21 for short swings or EMA 20/50 for medium-term trend studies.", steps: ["Give recent closes more weight using two EMA periods.", "Enter when the faster EMA crosses above the slower EMA.", "Exit on the reverse cross; the signal is executed on the next candle."], historySupported: true },
  macd: { primary: "MACD crossover", usedIn: "Momentum confirmation, trend continuation, and zero-line studies.", pairs: "Price structure, support/resistance, or a longer trend average to reduce whipsaws.", steps: ["Subtract the 26-period EMA from the 12-period EMA.", "Smooth that gap into a 9-period signal line.", "Enter on a bullish MACD/signal cross and exit on a bearish cross."], historySupported: true },
  bollinger: { primary: "Bollinger mean reversion", usedIn: "Range trading, volatility squeezes, and stretch-versus-trend analysis.", pairs: "SMA 20 as the centre line, RSI for momentum, and ATR for stop distance.", steps: ["Calculate a 20-period average and bands two standard deviations away.", "Enter when the close falls below the lower band.", "Exit when price returns to the middle band; a strong trend can invalidate this idea."], historySupported: true },
  atr: { primary: "ATR risk planning", usedIn: "Position sizing, adaptive stops, breakout risk, and volatility regime checks.", pairs: "Any directional entry such as EMA, SMA, or Donchian breakout; ATR itself is not directional.", steps: ["Measure the average true range over 14 daily candles.", "Use a multiple such as 1–2 ATR for a volatility-aware stop distance.", "Reduce position size when ATR expands so one trade does not dominate risk."], historySupported: false },
  stochastic: { primary: "Stochastic pullback", usedIn: "Range trading, short-term momentum turns, and timing a pullback.", pairs: "Support/resistance, a trend filter, or RSI to avoid buying every extreme reading.", steps: ["Compare the close with the recent 14-candle high-low range.", "Look for a turn from below 20 near a support area.", "Confirm the market regime before treating an extreme as a reversal."], historySupported: false },
  vwap: { primary: "VWAP execution filter", usedIn: "Intraday execution, volume-aware trend context, and institutional reference pricing.", pairs: "Price action, volume, opening range, and a session high/low; it needs intraday data.", steps: ["Weight each traded price by its volume for the current session.", "Use price above/below VWAP as context, not a standalone buy/sell command.", "This app does not claim a VWAP backtest because its official archive is daily."], historySupported: false },
};

function pct(value: number | undefined) {
  return `${((Number(value) || 0) * 100).toFixed(2)}%`;
}

function periodMeaning(id: IndicatorId, period: number) {
  if (id === "rsi") return `RSI ${period} means every reading compares the latest close with the previous ${period} daily candles. The calculation averages the up moves and down moves, then converts the result to a 0–100 scale.`;
  if (id === "sma" || id === "ema") return `${id.toUpperCase()} ${period} means the line is calculated from a rolling window of ${period} daily closes. A larger number makes the line calmer but later.`;
  if (id === "macd") return `The MACD setup uses fast and slow EMA windows; the ${period} setting controls how quickly the signal line confirms a momentum change.`;
  if (id === "bollinger") return `${period} means the centre average and volatility bands use the latest ${period} daily closes.`;
  if (id === "vwap") return "Session VWAP resets each trading day. This page explains it, but does not run a VWAP backtest on daily-only data.";
  return `${selectedLabel(id)} ${period} means the calculation looks back across ${period} daily candles. A shorter window reacts faster; a longer window is steadier.`;
}

function selectedLabel(id: IndicatorId) {
  return guides.find((guide) => guide.id === id)?.name ?? "Indicator";
}

function Metric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className={`indicator-metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function IndicatorMiniVisual({ guide, period }: { guide: IndicatorGuide; period: number }) {
  const points = useMemo(() => Array.from({ length: 22 }, (_, index) => {
    const wave = Math.sin(index * 0.65 + period / 10) * 18;
    const drift = guide.family === "Trend" || guide.id === "macd" ? index * 1.2 : 0;
    return 56 - wave - drift;
  }), [guide.family, guide.id, period]);
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${index * 14 + 6},${point.toFixed(1)}`).join(" ");
  return <div className="indicator-mini-visual"><svg viewBox="0 0 310 74" role="img" aria-label={`${guide.name} concept visual`}><line x1="6" x2="304" y1="37" y2="37" stroke="#cbd5e1" strokeDasharray="4 4" /><path d={path} fill="none" stroke="#4f46e5" strokeWidth="3" strokeLinecap="round" /><circle cx="286" cy={points[20]} r="4" fill="#16a34a" /><text x="7" y="70">weak</text><text x="270" y="70">strong</text></svg><div className="indicator-mini-caption"><span>Concept only</span><strong>{guide.standard}</strong></div></div>;
}

export default function IndicatorSchool() {
  const [selectedId, setSelectedId] = useState<IndicatorId>("rsi");
  const [period, setPeriod] = useState(14);
  const [symbol, setSymbol] = useState("RELIANCE");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(today);
  const [capital, setCapital] = useState(100000);
  const [result, setResult] = useState<LiveBacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = guides.find((guide) => guide.id === selectedId) ?? guides[0];

  const selectGuide = (guide: IndicatorGuide) => {
    setSelectedId(guide.id);
    setPeriod(guide.defaultPeriod);
    setResult(null);
    setError(null);
  };

  const jumpToHistory = () => {
    document.getElementById("indicator-history-test")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const runExample = async () => {
    if (!strategyRecipes[selected.id].historySupported) {
      setError(`${selected.name} is explained here, but the current local backtest engine does not calculate it directly from the daily NSE archive yet. Use the paired strategy guidance above instead of treating a proxy result as an ${selected.name} test.`);
      return;
    }
    if (!symbol.trim() || !start || !end || start >= end) {
      setError("Choose a valid NSE symbol and a date range before running the example.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await runStrategyBacktest({
        symbol: symbol.trim().toUpperCase(),
        strategyId: selected.strategyId,
        start,
        end,
        initialCapital: capital,
        rsiPeriod: selected.id === "rsi" ? period : 14,
        rsiOversold: 30,
        rsiOverbought: selected.id === "rsi" ? 70 : 70,
        fastEma: selected.id === "macd" ? 12 : selected.id === "ema" ? Math.max(5, Math.min(period, 50)) : 20,
        slowEma: selected.id === "macd" ? 26 : selected.id === "ema" ? Math.max(10, Math.min(period * 2, 100)) : 50,
        commissionPct: 0.001,
        slippagePct: 0.0005,
      });
      setResult(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The local backtest could not run. Check that the selected stock data is imported.");
    } finally {
      setLoading(false);
    }
  };

  return <div className="indicator-school">
    <section className="indicator-hero bt-panel">
      <div className="indicator-hero-copy"><div className="indicator-hero-icon"><Activity size={20} /></div><div><h2>Indicators, without the jargon</h2><p>Learn what each indicator measures, start with the settings people commonly use, then test the idea on real saved NSE history.</p></div></div>
      <div className="indicator-hero-note"><Database size={15} /><span>Backtest examples use local SQLite NSE daily OHLCV data. No orders are placed.</span></div>
    </section>

    <section className="indicator-school-layout">
      <div className="indicator-catalog bt-panel"><div className="bt-panel-head"><div><span className="bt-eyebrow">THE LIBRARY</span><h2>Choose an indicator</h2></div><span className="bt-panel-note">{guides.length} guides</span></div><p className="indicator-muted">Start with the question you want to answer—not with a formula.</p><div className="indicator-guide-list">{guides.map((guide) => <button type="button" key={guide.id} className={`indicator-guide-button ${selected.id === guide.id ? "is-active" : ""}`} onClick={() => selectGuide(guide)}><span className="indicator-guide-mark">{guide.id === "rsi" ? "R" : guide.name.slice(0, 1)}</span><span><strong>{guide.name}</strong><small>{guide.family} · {guide.standard}</small></span><ArrowRight size={14} /></button>)}</div></div>

      <article className="indicator-detail bt-panel"><div className="indicator-detail-top"><div><span className="indicator-family">{selected.family}</span><h2>{selected.name}</h2><p>{selected.oneLine}</p></div><div className="indicator-question"><span>It answers</span><strong>{selected.question}</strong></div></div><IndicatorMiniVisual guide={selected} period={period} /><div className="indicator-controls"><label><span>Period</span><input aria-label={`Period ${period}`} type="range" min={selected.periodMin} max={selected.periodMax} value={period} onChange={(event) => setPeriod(Number(event.target.value))} /><strong>{period}</strong></label><div><span>Good first setting</span><strong>{selected.standard}</strong><small>{selected.periodHint}</small></div></div><div className="indicator-period-meaning"><strong>What does {selected.id === "rsi" ? `RSI ${period}` : `${selected.name} ${period}`} mean?</strong><p>{periodMeaning(selected.id, period)}</p></div><div className="indicator-setting-grid"><div><span className="setting-label"><Gauge size={14} /> Faster</span><p>{selected.faster}</p></div><div className="is-recommended"><span className="setting-label"><Target size={14} /> Start here</span><p>{selected.standard} · {selected.periodHint}</p></div><div><span className="setting-label"><ShieldAlert size={14} /> Slower</span><p>{selected.slower}</p></div></div><div className="indicator-reading"><div><h3>How to read it in plain English</h3><ul>{selected.read.map((item) => <li key={item}><CheckCircle2 size={15} />{item}</li>)}</ul></div><div className="indicator-help"><h3>Why traders use it</h3><p>{selected.helps}</p><h3>Important limit</h3><p>{selected.caution}</p></div></div><div className="indicator-recipe"><div><span className="indicator-family">WHERE IT BECOMES A STRATEGY</span><h3>{strategyRecipes[selected.id].primary}</h3><p><strong>Common uses:</strong> {strategyRecipes[selected.id].usedIn}</p><p><strong>Often combined with:</strong> {strategyRecipes[selected.id].pairs}</p></div><ol>{strategyRecipes[selected.id].steps.map((step) => <li key={step}>{step}</li>)}</ol></div>{strategyRecipes[selected.id].historySupported ? <button type="button" className="bt-primary indicator-test-cta" onClick={jumpToHistory}><Play size={14} /> Test {selected.name} on history <ArrowRight size={14} /></button> : <p className="indicator-not-supported"><ShieldAlert size={14} /><span>Education guide only for now: the engine does not directly backtest {selected.name} on the daily NSE archive yet.</span></p>}</article>
    </section>

    <section id="indicator-history-test" className="indicator-backtest bt-panel"><div className="indicator-backtest-header"><div><span className="bt-eyebrow">{strategyRecipes[selected.id].historySupported ? "PROVE IT WITH HISTORY" : "DATA AVAILABILITY"}</span><h2>{strategyRecipes[selected.id].historySupported ? "Here is where the history test runs" : "Why this indicator cannot be tested here yet"}</h2><p><strong>{selected.exampleName}:</strong> {selected.exampleRule}</p></div><div className="indicator-backtest-badge"><LineChart size={15} /> {strategyRecipes[selected.id].historySupported ? "Test, don’t assume" : "Be precise"}</div></div>{strategyRecipes[selected.id].historySupported ? <><div className="indicator-backtest-form"><label><span>NSE stock</span><input list="learning-stock-list" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="RELIANCE" /><datalist id="learning-stock-list">{exampleSymbols.map((item) => <option key={item} value={item} />)}</datalist></label><label><span>From</span><input type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} /></label><label><span>To</span><input type="date" value={end} min={start} max={today} onChange={(event) => setEnd(event.target.value)} /></label><label><span>Starting capital</span><input type="number" min="1000" step="1000" value={capital} onChange={(event) => setCapital(Math.max(1000, Number(event.target.value) || 1000))} /></label><button type="button" className="bt-primary" onClick={() => void runExample()} disabled={loading}>{loading ? <><RotateCcw size={14} className="spin" /> Running on saved candles…</> : <><Play size={14} /> Run this test</>}</button></div>{error && <p className="bt-alert-error" role="alert">{error}</p>}<div className="indicator-example-note"><Zap size={15} /><span><strong>What happens when you click:</strong> the app loads the selected symbol’s saved NSE daily candles from SQLite, calculates {selected.name} period {period}, applies the entry/exit rule above, executes signals on the next candle, and shows the result below. It never places a live order.</span></div>{result && <div className="indicator-result"><div className="indicator-result-title"><div><span className="bt-eyebrow">REAL RESULT — APPEARS HERE</span><h3>{result.symbol} · {selected.exampleName}</h3></div><span className="indicator-result-source"><Database size={13} /> {result.equity_curve?.length ?? 0} saved candles used</span></div><div className="indicator-metrics"><Metric label="Total return" value={pct(result.metrics.total_return)} tone={Number(result.metrics.total_return) >= 0 ? "positive" : "negative"} /><Metric label="Win rate" value={pct(result.metrics.win_rate)} /><Metric label="Max drawdown" value={pct(result.metrics.max_drawdown)} tone="negative" /><Metric label="Trades" value={String(Math.round(Number(result.metrics.total_trades ?? 0)))} /></div><p className="indicator-result-footnote">Period tested: {start} → {end} · Initial capital: ₹{capital.toLocaleString("en-IN")} · <Link href={`/research?symbol=${encodeURIComponent(result.symbol)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&strategy=${encodeURIComponent(selected.strategyId)}`} className="bt-link">Open full research view <ArrowRight size={13} /></Link></p></div>}</> : <div className="indicator-not-supported-panel"><ShieldAlert size={18} /><div><strong>Direct test not connected for {selected.name}</strong><p>The current engine supports direct historical tests for RSI, SMA, EMA, MACD, and Bollinger Bands. ATR needs a risk-aware execution rule; Stochastic needs its %K/%D crossover rule; VWAP needs intraday candles. A related strategy must not be labelled as proof of this indicator.</p></div></div>}</section>

    <section className="indicator-next"><div><span className="bt-eyebrow">A GOOD HABIT</span><h2>Use indicators as questions, not answers.</h2><p>Pick one idea, choose a period before looking at the result, test different market regimes, and compare the result with buy-and-hold.</p></div><div className="indicator-next-steps"><div><strong>1</strong><span>Define the signal</span></div><div><strong>2</strong><span>Test several periods</span></div><div><strong>3</strong><span>Check drawdown and costs</span></div><div><strong>4</strong><span>Validate on unseen dates</span></div></div></section>
  </div>;
}
