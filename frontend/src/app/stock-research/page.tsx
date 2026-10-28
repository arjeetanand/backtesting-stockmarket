"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  Info,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { SymbolCombobox } from "@/components/data/SymbolCombobox";
import { FinancialChart } from "@/components/charts/FinancialChart";
import type { IndicatorSeries, NormalizedCandle } from "@/lib/chart-data";
import {
  getStockResearchHistory,
  runStockResearch,
  scanMorningStockResearch,
  type StockResearchHistory,
  type StockResearchMetrics,
  type StockResearchMorningScan,
  type StockResearchResult,
} from "@/lib/stock-research";

const money = (value: number | null | undefined) => value == null || !Number.isFinite(value)
  ? "—"
  : `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const percent = (value: number | null | undefined) => value == null || !Number.isFinite(value)
  ? "—"
  : `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;
const number = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value)
  ? "—"
  : value.toFixed(digits);
const costPct = (value: number) => `${Number(value.toFixed(6))}%`;
const normalizeSymbol = (value: string) => value.trim().toUpperCase().replace(/\.NS$/, "");
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const nseFinancialResultsUrl = (symbol: string) => `https://www.nseindia.com/companies-listing/corporate-filings-financial-results?symbol=${encodeURIComponent(symbol)}&tabIndex=equity`;

const GATE_COPY: Record<StockResearchResult["validation_gate"]["status"], string> = {
  passed: "Met the historical screen",
  failed: "Did not meet the historical screen",
  not_evaluable: "Not enough past data to score",
};

const SETUP_COPY: Record<NonNullable<StockResearchResult["setup"]>["status"], { title: string; body: string }> = {
  triggered: {
    title: "The rule's entry conditions were met",
    body: "The latest completed daily candle met this fixed rule. A next-session opening price or fill is not known yet.",
  },
  watch: {
    title: "Some conditions are met; wait for the rest",
    body: "The longer trend is aligned, but the completed-candle breakout and volume checks were not both met.",
  },
  stale_data: {
    title: "The saved daily data may be old",
    body: "Refresh the local NSE history before relying on any reference levels. This screen uses the date shown below.",
  },
  no_long_setup: {
    title: "This rule did not find a long setup",
    body: "The latest saved candle does not meet this fixed rule's long-term trend condition.",
  },
};

function profitFactor(metrics: StockResearchMetrics): string {
  if (metrics.profit_factor !== null) return number(metrics.profit_factor);
  return metrics.trades > 0 && metrics.losses === 0 ? "∞" : "—";
}

function MetricsTable({ title, metrics }: { title: string; metrics: StockResearchMetrics | null }) {
  return <section className="stock-research-metrics-panel bt-panel">
    <div className="bt-panel-head"><h3>{title}</h3><span>{metrics ? `${metrics.signal_occurrences} rule signals · ${metrics.trades} closed trades` : "No sample"}</span></div>
    {!metrics ? <p className="stock-research-muted">This period has no evaluable test metrics.</p> : <dl className="stock-research-metric-list">
      <div><dt>Wins / losses / flat</dt><dd>{metrics.wins} / {metrics.losses} / {metrics.flats}</dd></div>
      <div><dt>Win rate</dt><dd>{number(metrics.win_rate_pct, 1)}%</dd></div>
      <div><dt>Average net return per trade</dt><dd>{percent(metrics.expectancy_pct)}</dd></div>
      <div><dt>Profit factor</dt><dd>{profitFactor(metrics)}</dd></div>
      <div><dt>Compounded test return</dt><dd>{percent(metrics.total_return_pct)}</dd></div>
      <div><dt>Maximum drawdown</dt><dd>{percent(metrics.max_drawdown_pct)}</dd></div>
      <div><dt>Test window</dt><dd>{date(metrics.period_start)} – {date(metrics.period_end)}</dd></div>
    </dl>}
  </section>;
}

export default function StockResearchPage() {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [result, setResult] = useState<StockResearchResult | null>(null);
  const [history, setHistory] = useState<StockResearchHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runningSymbol, setRunningSymbol] = useState<string | null>(null);
  const [morningScan, setMorningScan] = useState<StockResearchMorningScan | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const historyRequestId = useRef(0);

  const refreshHistory = useCallback(async () => {
    const requestId = ++historyRequestId.current;
    try {
      const nextHistory = await getStockResearchHistory();
      if (requestId === historyRequestId.current) {
        setHistory(nextHistory);
        setHistoryError(null);
      }
    } catch (loadError) {
      if (requestId === historyRequestId.current) setHistoryError(loadError instanceof Error ? loadError.message : "Run history is unavailable.");
    } finally {
      if (requestId === historyRequestId.current) setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    const requestId = ++historyRequestId.current;
    void getStockResearchHistory().then((nextHistory) => {
      if (requestId === historyRequestId.current) {
        setHistory(nextHistory);
        setHistoryError(null);
      }
    }).catch((loadError: unknown) => {
      if (requestId === historyRequestId.current) setHistoryError(loadError instanceof Error ? loadError.message : "Run history is unavailable.");
    }).finally(() => {
      if (requestId === historyRequestId.current) setHistoryLoading(false);
    });
    return () => { historyRequestId.current += 1; };
  }, []);

  const run = async (symbolToRun = symbol) => {
    const requestedSymbol = normalizeSymbol(symbolToRun);
    if (!requestedSymbol) {
      setError("Enter an NSE symbol or choose a company from the list.");
      return;
    }
    setSymbol(requestedSymbol);
    setRunning(true);
    setRunningSymbol(requestedSymbol);
    setError(null);
    setHistoryError(null);
    setResult(null);
    try {
      setResult(await runStockResearch(requestedSymbol));
      setHistoryLoading(true);
      await refreshHistory();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "The analysis request failed.");
      setHistoryLoading(true);
      await refreshHistory();
    } finally {
      setRunning(false);
      setRunningSymbol(null);
    }
  };

  const runMorningScan = async () => {
    setScanLoading(true);
    setScanError(null);
    setMorningScan(null);
    try {
      const nextScan = await scanMorningStockResearch();
      setMorningScan(nextScan);
    } catch (scanRequestError) {
      setScanError(scanRequestError instanceof Error ? scanRequestError.message : "The morning scan could not be completed.");
    } finally {
      setScanLoading(false);
      setHistoryLoading(true);
      await refreshHistory();
    }
  };

  const candles = useMemo<NormalizedCandle[]>(() => (result?.chart ?? []).map((bar) => ({
    timestamp: bar.timestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  })), [result]);

  const indicators = useMemo<IndicatorSeries[]>(() => {
    if (!result?.chart.length) return [];
    return [
      { id: "sma20", label: "SMA 20", color: "#4f46e5", placement: "overlay", values: result.chart.map((bar) => ({ timestamp: bar.timestamp, value: bar.sma20 })) },
      { id: "sma50", label: "SMA 50", color: "#0284c7", placement: "overlay", values: result.chart.map((bar) => ({ timestamp: bar.timestamp, value: bar.sma50 })) },
      { id: "sma200", label: "SMA 200", color: "#d97706", placement: "overlay", values: result.chart.map((bar) => ({ timestamp: bar.timestamp, value: bar.sma200 })) },
    ];
  }, [result]);

  const technical = result?.technical;
  const setup = result?.setup;
  const oos = result?.out_of_sample_metrics;
  const latestTrades = [...(result?.trades ?? [])].slice(-30).reverse();
  const count = (value: number | undefined) => value ?? (historyLoading ? "…" : historyError ? "—" : 0);
  const normalizedSymbol = normalizeSymbol(symbol);
  const canRun = normalizedSymbol.length > 0 && symbol.trim().length <= 50;

  return <div className="backtrack-page stock-research-page">
    <TopBar title="Stock research" />
    <main className="backtrack-content bt-stack">
      <section className="bt-heading-row stock-research-heading">
        <div>
          <div className="bt-kicker"><Activity size={13} aria-hidden="true" /> ONE STOCK · EXPLAINED FROM DAILY NSE HISTORY</div>
          <h1>Stock research</h1>
          <p>Choose one NSE-listed company. We’ll explain the latest saved daily data, show conditional price levels, and check one fixed rule against past data.</p>
        </div>
        <span className="stock-research-source"><ShieldCheck size={14} aria-hidden="true" /> Local NSE archive</span>
      </section>

      <section className="stock-research-morning bt-panel" aria-labelledby="stock-research-morning-title">
        <div className="stock-research-section-heading">
          <div><span className="bt-eyebrow">MORNING SHORTLIST</span><h2 id="stock-research-morning-title">Find stocks that passed both checks</h2><p>Scan the local NIFTY 50 daily archive. A candidate must have a fresh daily trigger and pass the historical screen. This is not a live alert or a recommendation.</p></div>
          <button className="bt-primary stock-research-scan-button" type="button" onClick={() => void runMorningScan()} disabled={scanLoading || running}>
            {scanLoading ? <><LoaderCircle size={15} className="spin" aria-hidden="true" /> Checking saved history…</> : <><Activity size={15} aria-hidden="true" /> Scan NIFTY 50</>}
          </button>
        </div>

        {scanError && <div className="bt-alert-error stock-research-scan-error" role="alert"><AlertTriangle size={15} aria-hidden="true" /><span>{scanError} This scan uses only the local daily archive; check NSE data and try again.</span></div>}
        {scanLoading && <div className="stock-research-scan-loading" role="status"><LoaderCircle size={17} className="spin" aria-hidden="true" /><span>Checking the NIFTY 50 against saved daily bars. This may take a minute.</span></div>}
        {!scanLoading && !scanError && !morningScan && <p className="stock-research-scan-prompt">No scan has been run in this view yet. You can also search for one company below.</p>}

        {morningScan && <div className="stock-research-scan-results" aria-live="polite">
          <div className="stock-research-scan-intro">
            <div><strong>{morningScan.qualifying_setups === 0 ? "No candidates are ready from the available data" : `${morningScan.qualifying_setups} ${morningScan.qualifying_setups === 1 ? "stock matched" : "stocks matched"} both checks`}</strong><p>NIFTY 50 constituents dated {date(morningScan.universe_as_of)} · local daily data through {date(morningScan.data_as_of)}. Only fresh rule triggers with a passed historical screen appear below.</p></div>
            <span className="stock-research-scan-source">{morningScan.data_source}</span>
          </div>
          <dl className="stock-research-scan-topline">
            <div><dt>Stocks checked</dt><dd>{morningScan.symbols_scanned}</dd></div>
            <div><dt>Fresh rule triggers</dt><dd>{morningScan.fresh_signals}</dd></div>
            <div><dt>Ready to review</dt><dd>{morningScan.qualifying_setups}</dd></div>
          </dl>
          <details className="stock-research-scan-count-details">
            <summary>Show data coverage and full scan counts</summary>
            <dl className="stock-research-scan-counts">
              <div><dt>Stocks with saved data</dt><dd>{morningScan.symbols_with_data}</dd></div>
              <div><dt>Analyses completed</dt><dd>{morningScan.completed_runs}</dd></div>
              <div><dt>Missing saved data</dt><dd>{morningScan.missing_data}</dd></div>
              <div><dt>Not enough history</dt><dd>{morningScan.insufficient_history}</dd></div>
              <div><dt>Analysis errors</dt><dd>{morningScan.analysis_errors}</dd></div>
              <div><dt>Passed historical screen</dt><dd>{morningScan.passed_backtests}</dd></div>
              <div><dt>Did not pass historical screen</dt><dd>{morningScan.failed_backtests}</dd></div>
              <div><dt>Past data could not be scored</dt><dd>{morningScan.not_evaluable}</dd></div>
              <div><dt>Stale data or expired entry windows</dt><dd>{morningScan.stale_setups}</dd></div>
            </dl>
            <p>Coverage and gate outcomes can overlap: a stock with missing or short history is also not evaluable. Each symbol attempt is saved in Research history; this combined scan summary is not retained after reload.</p>
          </details>
          {!morningScan.candidates.length ? <div className="stock-research-empty-inline"><Clock3 size={15} aria-hidden="true" />No NIFTY 50 stock in the available local data met both checks. Open the full scan counts to see missing history or analysis errors, or search one symbol below.</div> : <div className="stock-research-candidates">
            {morningScan.candidates.map((candidate) => <article className="stock-research-candidate" key={candidate.run_id}>
              <div className="stock-research-candidate-head">
                <div><span className="stock-research-candidate-qualified">Fresh trigger · historical screen passed</span><h3>{candidate.company_name || candidate.symbol} <small>{candidate.symbol}</small></h3><p>Daily data through {date(candidate.data_as_of)} · {candidate.history_years.toFixed(1)} years saved</p></div>
              <span className="stock-research-candidate-winrate">{number(candidate.out_of_sample_metrics.win_rate_pct, 1)}% <small>win rate in past sample</small></span>
              </div>
              <dl className="stock-research-candidate-levels">
                <div><dt>Latest close</dt><dd>{money(candidate.technical.close)}</dd></div>
                <div><dt>Entry trigger</dt><dd>{money(candidate.setup.entry_trigger)}</dd></div>
                <div><dt>Stop level</dt><dd>{money(candidate.setup.stop_loss)}</dd></div>
                <div><dt>Target · 2 risk units</dt><dd>{money(candidate.setup.target_2r)}</dd></div>
                <div><dt>Pattern appearances</dt><dd>{candidate.out_of_sample_metrics.signal_occurrences} daily signals</dd></div>
                <div><dt>Closed trades</dt><dd>{candidate.out_of_sample_metrics.trades}</dd></div>
                <div><dt>Past wins</dt><dd>{candidate.out_of_sample_metrics.wins} of {candidate.out_of_sample_metrics.trades}</dd></div>
              </dl>
              <details className="stock-research-candidate-reasons">
                <summary>Why did this stock match?</summary>
                <ul>{candidate.setup.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                <strong>Rule exit</strong><ul>{candidate.setup.exit_rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
              </details>
              <button type="button" className="bt-secondary stock-research-candidate-review" onClick={() => void run(candidate.symbol)} disabled={running || scanLoading}>
                {runningSymbol === candidate.symbol ? <><LoaderCircle size={14} className="spin" aria-hidden="true" /> Building full review…</> : "Review full analysis"}
              </button>
              <small className="stock-research-candidate-ledger-note">This opens the chart and full trade details as a separate logged analysis.</small>
            </article>)}
          </div>}
          {!morningScan.candidates.length && (morningScan.missing_data > 0 || morningScan.insufficient_history > 0) && <a className="stock-research-data-link" href="/data">Import more official NSE history</a>}
        </div>}
      </section>

      <section className="bt-panel stock-research-search" aria-label="Choose a stock">
        <div className="stock-research-search-copy"><span className="bt-eyebrow">START WITH A SYMBOL</span><strong>Which company should we look at?</strong><small>Search by company name or NSE symbol, for example RELIANCE.</small></div>
        <div className="stock-research-search-control">
          <label className="bt-field-label" htmlFor="stock-research-symbol">NSE symbol or company</label>
          <SymbolCombobox value={symbol} onChange={(next) => { setSymbol(next); setResult(null); setError(null); }} label="" inputId="stock-research-symbol" maxLength={50} disabled={running || scanLoading} />
        </div>
        <button type="button" className="bt-primary stock-research-run" onClick={() => void run()} disabled={running || scanLoading || !canRun}>
          {running ? <><LoaderCircle size={15} className="spin" aria-hidden="true" /> Analyzing history…</> : <><Activity size={15} aria-hidden="true" /> Analyze stock</>}
        </button>
      </section>

      <div className="stock-research-boundary"><Info size={15} aria-hidden="true" /><span><strong>Daily historical research only.</strong> No live quote or order is produced. Entry levels are conditional on the stated rule and next-session pricing.</span></div>
      {error && <div className="bt-alert-error" role="alert"><AlertTriangle size={16} aria-hidden="true" /><span>{error} If the local API received the request, its attempt is recorded when SQLite logging is available.</span></div>}

      {result && <>
        <section className="stock-research-result-head">
          <div><span className="bt-eyebrow">{result.run_status === "completed" ? "LATEST DAILY-BAR REVIEW" : "DATA STATUS"}</span><h2>{result.company_name || result.symbol} <small>{result.symbol}</small></h2><p>{result.message}</p></div>
          <span className={`stock-research-pill ${result.run_status}`}><span />{result.run_status.replaceAll("_", " ")}</span>
        </section>

        {result.run_status === "insufficient_data" && <section className="stock-research-empty bt-panel" role="status">
          <Database size={20} aria-hidden="true" /><div><strong>No usable local history for {result.symbol}</strong><p>{result.message} Import the official NSE daily archive, then run the analysis again.</p><a className="stock-research-data-link" href="/data">Open NSE data</a></div>
        </section>}

        {technical && setup && <>
          <section className="stock-research-summary" aria-live="polite">
            <div className={`stock-research-summary-copy ${setup.status}`}>
              <span className="bt-eyebrow">WHAT THE LATEST SAVED DATA SAYS</span>
              <h2>{SETUP_COPY[setup.status].title}</h2>
              <p>{SETUP_COPY[setup.status].body}</p>
              <p className="stock-research-as-of"><strong>Daily data through {date(result.data_as_of)}</strong><span>{result.chart.length.toLocaleString("en-IN")} saved sessions · {result.data_source}</span></p>
            </div>
            <aside className={`stock-research-gate ${result.validation_gate.status}`} aria-label="Historical screen result">
              <div className="stock-research-gate-icon" aria-hidden="true">{result.validation_gate.status === "passed" ? <CheckCircle2 size={19} /> : result.validation_gate.status === "failed" ? <AlertTriangle size={19} /> : <Info size={19} />}</div>
              <div className="stock-research-gate-copy"><span className="bt-eyebrow">HISTORICAL SCREEN ONLY</span><strong>{GATE_COPY[result.validation_gate.status]}</strong><p>The {result.validation_gate.minimum_win_rate_pct}% win-rate cutoff is a rule for past data. Passing is not a forecast, promise, or recommendation.</p></div>
            </aside>
          </section>

          <section className="stock-research-plan bt-panel">
            <div className="stock-research-section-heading"><div><span className="bt-eyebrow">CONDITIONAL PRICE LEVELS</span><h2>If this rule triggers</h2><p>These are reference prices from saved daily candles. They are not a current quote, order, or known fill.</p></div><span className={`stock-research-pill ${setup.status}`}><span />{setup.status.replaceAll("_", " ")}</span></div>
            <div className="stock-research-levels">
              <div><span>Entry trigger</span><strong>{money(setup.entry_trigger)}</strong><small>Prior 20-session high; the rule also checks daily close and volume</small></div>
              <div className="risk-level"><span>Stop level</span><strong>{money(setup.stop_loss)}</strong><small>{money(setup.risk_per_share)} price risk per share below the trigger</small></div>
              <div><span>Target · 1 risk unit</span><strong>{money(setup.target_1r)}</strong><small>One stop-distance above the trigger</small></div>
              <div className="target-level"><span>Target · 2 risk units</span><strong>{money(setup.target_2r)}</strong><small>Two stop-distances above the trigger</small></div>
            </div>
            <p className="stock-research-level-note"><Info size={14} aria-hidden="true" /><span>{setup.level_note} “Risk unit” means the price distance from the entry trigger to the stop.</span></p>
            <div className="stock-research-exit-rules"><strong>Exact exit rule</strong><ul>{setup.exit_rules.map((rule) => <li key={rule}>{rule}</li>)}</ul></div>
          </section>

          <details className="stock-research-disclosure bt-panel">
            <summary><span><strong>Explore the daily price chart and indicators</strong><small>Price range, moving averages, momentum, volume, and the reasons behind this readout</small></span></summary>
            <div className="stock-research-disclosure-body">
              <section className="stock-research-chart">
                <div className="stock-research-section-heading"><div><span className="bt-eyebrow">PRICE HISTORY</span><h2>{result.symbol} daily candles</h2><p>Full saved daily history with 20, 50 and 200-session moving averages.</p></div><span className="stock-research-date-range">{date(result.history_start)} – {date(result.data_as_of)} · {result.chart.length.toLocaleString("en-IN")} bars</span></div>
                <FinancialChart candles={candles} indicators={indicators} title={`${result.symbol} daily NSE history`} description="Historical daily OHLCV with 20, 50 and 200-session simple moving averages." height={290} initialVisibleCandles={90} emptyMessage="No local daily candles were returned for this symbol." />
              </section>

              <section className="stock-research-analysis">
                <div className="stock-research-section-heading"><div><span className="bt-eyebrow">PRICE FACTS &amp; INDICATORS</span><h2>What is behind the summary</h2><p>These describe saved daily bars. None is a forecast by itself.</p></div></div>
                <dl className="stock-research-price-facts">
                  <div><dt>Latest close</dt><dd>{money(technical.close)}</dd><small>NSE daily · {date(result.data_as_of)}</small></div>
                  <div><dt>52-week range</dt><dd>{money(technical.low_52w)} – {money(technical.high_52w)}</dd><small>{percent((technical.close / technical.low_52w - 1) * 100)} from the 52-week low</small></div>
                  <div><dt>Past 1-year price change</dt><dd>{percent(technical.return_1y_pct)}</dd><small>Past price movement, not a future growth forecast</small></div>
                </dl>
                <div className="stock-research-indicators">
                  <div><span>Simple moving averages</span><strong>20-day {money(technical.sma20)} · 50-day {money(technical.sma50)} · 200-day {money(technical.sma200)}</strong><small>Price versus its averages shows recent and longer trend context.</small></div>
                  <div><span>RSI · 14</span><strong>{number(technical.rsi14, 1)}</strong><small>Momentum gauge; high or low readings alone do not time a reversal.</small></div>
                  <div><span>MACD · 12 / 26 / 9</span><strong>{number(technical.macd)} · signal {number(technical.macd_signal)}</strong><small>Histogram {number(technical.macd_histogram)}; above zero means MACD is above its signal.</small></div>
                  <div><span>ATR · 14</span><strong>{money(technical.atr14)} · {number(technical.atr14_pct)}%</strong><small>Recent volatility used to set stop distance; it does not predict direction.</small></div>
                  <div><span>Prior 20-session range</span><strong>{money(technical.prior20_low)} – {money(technical.prior20_high)}</strong><small>Breakout comparisons use prior sessions, excluding the signal day.</small></div>
                  <div><span>Volume versus prior 20 sessions</span><strong>{technical.volume_ratio_20 == null ? "—" : `${number(technical.volume_ratio_20)}×`}</strong><small>Current day volume divided by the preceding 20-session average.</small></div>
                </div>
                <h3 className="stock-research-subheading">Reasons behind this readout</h3>
                {result.technical_reasons.length ? <ul className="stock-research-reasons">{result.technical_reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p className="stock-research-muted">No additional indicator reasons are available for this data.</p>}
                <div className="stock-research-returns" aria-label="Historical price returns">
                  <div><span>1 month</span><strong>{percent(technical.return_1m_pct)}</strong></div><div><span>3 months</span><strong>{percent(technical.return_3m_pct)}</strong></div><div><span>1 year</span><strong>{percent(technical.return_1y_pct)}</strong></div><div><span>3 years</span><strong>{percent(technical.return_3y_pct)}</strong></div>
                </div>
                <div className="stock-research-growth-note">
                  <p>{result.growth_note} The local OHLCV archive contains share prices and volume; it cannot forecast company growth. For company results, see NSE&apos;s official filings for {result.symbol}.</p>
                  <a href={nseFinancialResultsUrl(result.symbol)} target="_blank" rel="noreferrer">NSE financial results for {result.symbol}<ExternalLink size={13} aria-hidden="true" /></a>
                </div>
              </section>
            </div>
          </details>

          <details className="stock-research-disclosure bt-panel">
            <summary><span><strong>See how the fixed rule performed on past data</strong><small>{result.history_years.toFixed(1)} years of saved history · training and held-out periods · individual trades</small></span></summary>
            <div className="stock-research-disclosure-body">
              <section className="stock-research-backtest">
                <div className="stock-research-section-heading"><div><span className="bt-eyebrow">HISTORICAL TEST</span><h2>Past results, split into two periods</h2><p>The first 70% of sessions are used for training; the final 30% are held out and shown separately. No parameter optimization is used.</p></div><span className="stock-research-date-range">{date(result.history_start)} – {date(result.data_as_of)} · {result.data_source}</span></div>
                <div className="stock-research-metrics-grid"><MetricsTable title="Training period · first 70%" metrics={result.training_metrics} /><MetricsTable title="Held-out period · final 30%" metrics={oos ?? null} /></div>
              </section>

              <section className="stock-research-trades">
                <div className="stock-research-section-heading"><div><span className="bt-eyebrow">HELD-OUT SAMPLE</span><h2>Past entries and exits</h2><p>Closed trades in the final held-out period, after the modeled transaction costs.</p></div><span className="stock-research-date-range">{oos?.wins ?? 0} wins · {oos?.losses ?? 0} losses · {oos?.trades ?? 0} trades</span></div>
                {!latestTrades.length ? <div className="stock-research-empty-inline">There were no completed trades in this held-out period. Without enough trades, the historical screen cannot be scored.</div> : <div className="bt-table-wrap"><table className="bt-table"><thead><tr><th>Signal</th><th>Entry</th><th>Exit</th><th className="right">Entry price</th><th className="right">Exit price</th><th className="right">Net return</th><th className="right">Net P/L</th><th>Exit reason</th></tr></thead><tbody>{latestTrades.map((trade) => <tr key={`${trade.signal_date}-${trade.entry_date}-${trade.exit_date}`}><td>{date(trade.signal_date)}</td><td>{date(trade.entry_date)}</td><td>{date(trade.exit_date)}</td><td className="right">{money(trade.entry_price)}</td><td className="right">{money(trade.exit_price)}</td><td className={`right ${trade.net_return_pct >= 0 ? "stock-positive" : "stock-negative"}`}>{percent(trade.net_return_pct)}</td><td className={`right ${trade.net_pnl >= 0 ? "stock-positive" : "stock-negative"}`}>{money(trade.net_pnl)}</td><td>{trade.exit_reason.replaceAll("_", " ")}</td></tr>)}</tbody></table>{(result.trades.length > 30) && <p className="stock-research-table-note">Showing the most recent 30 of {result.trades.length} held-out trades.</p>}</div>}
              </section>

              <section className="stock-research-screen-criteria">
                <h3>What the historical screen checks</h3>
                <p>It requires at least {result.validation_gate.minimum_history_years} years of data, {result.validation_gate.minimum_oos_trades} or more held-out trades, at least {result.validation_gate.minimum_win_rate_pct}% wins, positive average net return and total return after modeled costs, and a profit factor above 1 when there were losses. These are screening rules for past data only—not a forecast, promise, or recommendation.</p>
                {result.validation_gate.reasons.length ? <ul className="stock-research-reasons">{result.validation_gate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p className="stock-research-muted">This sample met each stated historical screen condition.</p>}
              </section>
            </div>
          </details>

          <details className="stock-research-disclosure bt-panel">
            <summary><span><strong>Review the rule, costs, and sources</strong><small>Exact entry conditions, sizing assumptions, excluded costs, and references</small></span></summary>
            <div className="stock-research-disclosure-body">
              <section className="stock-research-costs">
                <div className="stock-research-section-heading"><div><span className="bt-eyebrow">METHOD &amp; SOURCES</span><h2>How this result was made</h2></div></div>
                <div className="stock-research-method-grid"><div><strong>Fixed long-only rule</strong><p>Daily close above prior 20-session high, close above SMA50, SMA50 above SMA200, and volume above the previous 20-session average. No parameter optimization.</p></div><div><strong>Execution and sizing</strong><p>Signals enter at the following session open. The simulation starts with ₹1,00,000 and buys whole shares with available equity. Stops use 2×ATR14, target is 2R, exits follow SMA50 or a 20-session limit. If stop and target both touch in one daily candle, stop is assumed first.</p></div><div><strong>Costs in the simulation</strong><p>{result.cost_assumptions ? `Slippage ${costPct(result.cost_assumptions.entry_slippage_pct)} each side; STT ${costPct(result.cost_assumptions.stt_pct_per_side)} each side; stamp duty ${costPct(result.cost_assumptions.stamp_duty_pct_buy_side)} on buy; SEBI fee ${costPct(result.cost_assumptions.sebi_turnover_fee_pct_per_side)} each side.` : "Unavailable."} Excludes {result.cost_assumptions?.excluded.join(", ") ?? "other charges"}.</p></div></div>
                <div className="stock-research-links"><a href="https://www.nseindia.com/static/market-data/eod-historical-data-subscription" target="_blank" rel="noreferrer">NSE historical data <ExternalLink size={12} aria-hidden="true" /></a><a href="https://ta-lib.org/functions/sma" target="_blank" rel="noreferrer">SMA reference <ExternalLink size={12} aria-hidden="true" /></a><a href="https://github.com/TA-Lib/ta-lib/blob/main/ta_codegen/input/rsi/rsi.md" target="_blank" rel="noreferrer">RSI reference <ExternalLink size={12} aria-hidden="true" /></a><a href="https://ta-lib.org/functions/macdfix.html" target="_blank" rel="noreferrer">MACD reference <ExternalLink size={12} aria-hidden="true" /></a><a href="https://ta-lib.org/functions/atr.html" target="_blank" rel="noreferrer">ATR reference <ExternalLink size={12} aria-hidden="true" /></a><a href="https://www.nseindia.com/static/invest/first-time-investor-sebi-turnover-fees-stt-other-levies" target="_blank" rel="noreferrer">NSE levy schedule <ExternalLink size={12} aria-hidden="true" /></a></div>
                <p className="stock-research-muted">The scan applies current NIFTY 50 members to each symbol’s full saved history; it does not include former constituents and is not a survivorship-free index backtest. Ticker changes may also split a company’s history across symbols. A historical win rate—even if it passes the screen—is not a guarantee of future results. Prices are not adjusted for splits or bonus issues; these events can distort indicators, trade levels, and long-range backtests.</p>
              </section>
            </div>
          </details>
        </>}
      </>}

      <section className="stock-research-ledger bt-panel">
        <div className="stock-research-section-heading"><div><span className="bt-eyebrow">LOCAL RUN LEDGER</span><h2>Every attempt is counted</h2><p>Completed analyses, failed or insufficient-data attempts, and the number that passed or failed the historical gate.</p></div><button className="bt-secondary" type="button" onClick={() => { setHistoryLoading(true); setHistoryError(null); void refreshHistory(); }} disabled={historyLoading}><RefreshCw size={13} className={historyLoading ? "spin" : ""} aria-hidden="true" /> Refresh log</button></div>
        {historyError && <p className="stock-research-ledger-error" role="alert">{historyError}</p>}
        <div className="stock-research-ledger-stats">
          <div><span>Total attempts</span><strong>{count(history?.total_runs)}</strong></div>
          <div><span>Completed</span><strong>{count(history?.completed_runs)}</strong></div>
          <div><span>Failed attempts</span><strong>{count(history?.failed_attempts)}</strong></div>
          <div><span>Insufficient data</span><strong>{count(history?.insufficient_data_runs)}</strong></div>
          <div><span>Passed validation</span><strong>{count(history?.qualified_runs)}</strong></div>
          <div><span>Failed validation</span><strong>{count(history?.failed_gates)}</strong></div>
          <div><span>Not evaluable</span><strong>{count(history?.not_evaluable_runs)}</strong></div>
        </div>
        {history?.runs.length ? <div className="bt-table-wrap"><table className="bt-table"><thead><tr><th>Run time</th><th>Stock</th><th>Status</th><th>Rule signals</th><th>Closed trades</th><th>Wins / losses</th><th>Historical screen</th></tr></thead><tbody>{history.runs.map((runItem) => <tr key={runItem.run_id}><td>{date(runItem.logged_at)}</td><td><strong>{runItem.symbol || "—"}</strong></td><td>{runItem.run_status.replaceAll("_", " ")}{runItem.failure_reason && <small className="stock-research-failure">{runItem.failure_reason}</small>}</td><td>{runItem.signal_occurrences == null ? "—" : runItem.signal_occurrences}</td><td>{runItem.trades}</td><td>{runItem.wins} / {runItem.losses}</td><td><span className={`stock-research-history-gate ${runItem.validation_status}`}>{runItem.validation_status.replaceAll("_", " ")}</span></td></tr>)}</tbody></table></div> : !historyLoading && !historyError ? <div className="stock-research-empty-inline"><Clock3 size={15} aria-hidden="true" />No research runs are logged yet. The first attempt will appear here.</div> : null}
      </section>

      <footer className="stock-research-footer"><Info size={14} aria-hidden="true" /><span>Run ID: <code>{result?.run_id ?? "—"}</code> · Start and finish times are recorded in the local SQLite research log. No live prices or orders are provided.</span>{oos && <span className="stock-research-footer-counts"><ArrowUpRight size={13} /> {oos.wins} held-out wins <ArrowDownRight size={13} /> {oos.losses} losses</span>}</footer>
    </main>
  </div>;
}
