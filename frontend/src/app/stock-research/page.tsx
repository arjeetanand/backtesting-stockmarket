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
  type StockResearchHistory,
  type StockResearchMetrics,
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

const GATE_COPY: Record<StockResearchResult["validation_gate"]["status"], string> = {
  passed: "Cleared this historical screen",
  failed: "Did not clear this historical screen",
  not_evaluable: "Not enough evidence to judge",
};

function gateTone(status: StockResearchResult["validation_gate"]["status"]): string {
  return `stock-research-gate ${status}`;
}

function profitFactor(metrics: StockResearchMetrics): string {
  if (metrics.profit_factor !== null) return number(metrics.profit_factor);
  return metrics.trades > 0 && metrics.losses === 0 ? "∞" : "—";
}

function MetricCard({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "gain" | "loss" }) {
  return <article className={`bt-stat-card stock-research-metric${tone ? ` ${tone}` : ""}`}>
    <span>{label}</span><strong>{value}</strong><small>{note}</small>
  </article>;
}

function MetricsTable({ title, metrics }: { title: string; metrics: StockResearchMetrics | null }) {
  return <section className="stock-research-metrics-panel bt-panel">
    <div className="bt-panel-head"><h3>{title}</h3><span>{metrics ? `${metrics.trades} closed trades` : "No sample"}</span></div>
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

  const run = async () => {
    const requestedSymbol = normalizeSymbol(symbol);
    if (!requestedSymbol) return;
    setRunning(true);
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
          <p>Search a symbol to see its price range, moving averages, momentum, a rule-based trade plan, and the rule’s historical out-of-sample record.</p>
        </div>
        <span className="stock-research-source"><ShieldCheck size={14} aria-hidden="true" /> Local NSE archive</span>
      </section>

      <section className="bt-panel stock-research-search" aria-label="Choose a stock">
        <div className="stock-research-search-copy"><span className="bt-eyebrow">START WITH A SYMBOL</span><strong>Which stock should we inspect?</strong><small>Search the local NSE catalogue or enter a symbol, then run the analysis.</small></div>
        <div className="stock-research-search-control">
          <label className="bt-field-label" htmlFor="stock-research-symbol">NSE symbol or company</label>
          <SymbolCombobox value={symbol} onChange={(next) => { setSymbol(next); setResult(null); setError(null); }} label="" inputId="stock-research-symbol" maxLength={50} disabled={running} />
        </div>
        <button type="button" className="bt-primary stock-research-run" onClick={() => void run()} disabled={running || !canRun}>
          {running ? <><LoaderCircle size={15} className="spin" aria-hidden="true" /> Analyzing history…</> : <><Activity size={15} aria-hidden="true" /> Analyze stock</>}
        </button>
      </section>

      <div className="stock-research-boundary"><Info size={15} aria-hidden="true" /><span><strong>Daily historical research only.</strong> No live quote or order is produced. Entry levels are conditional on the stated rule and next-session pricing.</span></div>
      {error && <div className="bt-alert-error" role="alert"><AlertTriangle size={16} aria-hidden="true" /><span>{error} If the local API received the request, its attempt is recorded when SQLite logging is available.</span></div>}

      {result && <>
        <section className="stock-research-result-head">
          <div><span className="bt-eyebrow">{result.run_status === "completed" ? "LATEST ANALYSIS" : "DATA STATUS"}</span><h2>{result.company_name || result.symbol} <small>{result.symbol}</small></h2><p>{result.message}</p></div>
          <span className={`stock-research-pill ${result.run_status}`}><span />{result.run_status.replaceAll("_", " ")}</span>
        </section>

        {result.run_status === "insufficient_data" && <section className="stock-research-empty bt-panel" role="status">
          <Database size={20} aria-hidden="true" /><div><strong>No usable local history for {result.symbol}</strong><p>{result.message} Import the official NSE daily archive from Data, then run the analysis again.</p></div>
        </section>}

        {technical && setup && <>
          <section className={gateTone(result.validation_gate.status)} aria-live="polite">
            <div className="stock-research-gate-icon">{result.validation_gate.status === "passed" ? <CheckCircle2 size={19} /> : result.validation_gate.status === "failed" ? <AlertTriangle size={19} /> : <Info size={19} />}</div>
            <div className="stock-research-gate-copy"><strong>{GATE_COPY[result.validation_gate.status]}</strong><p>{result.validation_gate.reasons.join(" ")}</p></div>
            <span>{result.validation_gate.minimum_win_rate_pct}% win rate · {result.validation_gate.minimum_oos_trades}+ OOS trades</span>
          </section>

          <section className="stock-research-kpis" aria-label="Stock and backtest summary">
            <MetricCard label="Latest close" value={money(technical.close)} note={`NSE daily · ${date(result.data_as_of)}`} />
            <MetricCard label="52-week range" value={`${money(technical.low_52w)} – ${money(technical.high_52w)}`} note={`${percent((technical.close / technical.low_52w - 1) * 100)} from 52-week low`} />
            <MetricCard label="Historical OOS win rate" value={oos ? `${number(oos.win_rate_pct, 1)}%` : "—"} note={oos ? `${oos.wins} wins · ${oos.losses} losses · ${oos.trades} trades` : "No out-of-sample period"} tone={oos && oos.win_rate_pct >= 70 ? "gain" : "loss"} />
            <MetricCard label="Historical price return · 1 year" value={percent(technical.return_1y_pct)} note="Past price movement; not a future growth forecast" tone={technical.return_1y_pct != null && technical.return_1y_pct >= 0 ? "gain" : "loss"} />
          </section>

          <section className="stock-research-plan bt-panel">
            <div className="stock-research-section-heading"><div><span className="bt-eyebrow">RULE-BASED SCENARIO</span><h2>Entry, risk &amp; targets</h2><p>{setup.status === "triggered" ? "The last completed daily candle met the rule; the next open is still unknown." : setup.status === "watch" ? "Trend is aligned; wait for the full breakout and volume rule." : setup.status === "stale_data" ? "Saved data is stale; refresh the NSE history before using these reference levels." : "The long trend filter is not aligned, so there is no qualifying long setup."}</p></div><span className={`stock-research-pill ${setup.status}`}><span />{setup.status.replaceAll("_", " ")}</span></div>
            <div className="stock-research-levels">
              <div><span>Entry trigger reference</span><strong>{money(setup.entry_trigger)}</strong><small>Prior 20-session high · confirmation uses daily close + volume</small></div>
              <div className="risk-level"><span>Stop · 1R risk</span><strong>{money(setup.stop_loss)}</strong><small>{money(setup.risk_per_share)} risk/share from the trigger reference</small></div>
              <div><span>Target · 1R</span><strong>{money(setup.target_1r)}</strong><small>One risk unit above the reference</small></div>
              <div className="target-level"><span>Target · 2R</span><strong>{money(setup.target_2r)}</strong><small>Two risk units above the reference</small></div>
            </div>
            <p className="stock-research-level-note"><Info size={14} aria-hidden="true" />{setup.level_note}</p>
            <div className="stock-research-exit-rules"><strong>When the fixed rule exits</strong>{setup.exit_rules.map((rule) => <p key={rule}>{rule}</p>)}</div>
          </section>

          <section className="stock-research-chart bt-panel">
            <div className="stock-research-section-heading"><div><span className="bt-eyebrow">PRICE &amp; TREND</span><h2>{result.symbol} daily candles</h2><p>Most recent 252 saved sessions with 20, 50 and 200-session moving averages.</p></div><span className="stock-research-date-range">{date(result.history_start)} – {date(result.data_as_of)} · {result.bar_count.toLocaleString("en-IN")} bars</span></div>
            <FinancialChart candles={candles} indicators={indicators} title={`${result.symbol} daily NSE history`} description="Historical daily OHLCV with 20, 50 and 200-session simple moving averages." height={290} initialVisibleCandles={90} emptyMessage="No local daily candles were returned for this symbol." />
          </section>

          <section className="stock-research-analysis bt-panel">
            <div className="stock-research-section-heading"><div><span className="bt-eyebrow">WHY THIS READOUT</span><h2>Indicators with plain-language reasons</h2><p>These describe the saved daily bars and the exact filters used by this fixed rule.</p></div></div>
            <div className="stock-research-indicators">
              <div><span>Simple moving averages</span><strong>20d {money(technical.sma20)} · 50d {money(technical.sma50)} · 200d {money(technical.sma200)}</strong><small>Price versus its averages shows recent and longer trend context.</small></div>
              <div><span>RSI · 14</span><strong>{number(technical.rsi14, 1)}</strong><small>Momentum gauge; high or low readings alone do not time a reversal.</small></div>
              <div><span>MACD · 12 / 26 / 9</span><strong>{number(technical.macd)} · signal {number(technical.macd_signal)}</strong><small>Histogram {number(technical.macd_histogram)}; above zero means MACD is above its signal.</small></div>
              <div><span>ATR · 14</span><strong>{money(technical.atr14)} · {number(technical.atr14_pct)}%</strong><small>Recent volatility used to size stop distance; it does not predict direction.</small></div>
              <div><span>Prior 20-session range</span><strong>{money(technical.prior20_low)} – {money(technical.prior20_high)}</strong><small>Breakout comparisons use prior sessions, excluding the signal day.</small></div>
              <div><span>Volume versus prior 20 sessions</span><strong>{technical.volume_ratio_20 == null ? "—" : `${number(technical.volume_ratio_20)}×`}</strong><small>Current day volume divided by the preceding 20-session average.</small></div>
            </div>
            <ul className="stock-research-reasons">{result.technical_reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            <div className="stock-research-returns" aria-label="Historical price returns">
              <div><span>1 month</span><strong>{percent(technical.return_1m_pct)}</strong></div><div><span>3 months</span><strong>{percent(technical.return_3m_pct)}</strong></div><div><span>1 year</span><strong>{percent(technical.return_1y_pct)}</strong></div><div><span>3 years</span><strong>{percent(technical.return_3y_pct)}</strong></div>
            </div>
            <p className="stock-research-muted">{result.growth_note}</p>
          </section>

          <section className="stock-research-backtest">
            <div className="stock-research-section-heading"><div><span className="bt-eyebrow">HISTORICAL CHECK</span><h2>Did this rule work on unseen history?</h2><p>After the 200-session indicator warm-up, the first 70% establish the training period; the final 30% are held out and reported separately.</p></div><span className="stock-research-date-range">{result.history_years.toFixed(1)} years · {result.data_source}</span></div>
            <div className="stock-research-metrics-grid"><MetricsTable title="Training period · 70%" metrics={result.training_metrics} /><MetricsTable title="Out-of-sample · final 30%" metrics={oos ?? null} /></div>
          </section>

          <section className="stock-research-trades bt-panel">
            <div className="stock-research-section-heading"><div><span className="bt-eyebrow">OUT-OF-SAMPLE TRADES</span><h2>Historical entries &amp; exits</h2><p>Closed trades from the held-out period after modeled transaction costs.</p></div><span className="stock-research-date-range">{oos?.wins ?? 0} wins · {oos?.losses ?? 0} losses</span></div>
            {!latestTrades.length ? <div className="stock-research-empty-inline">No completed trades in this out-of-sample window. A 0-trade result cannot satisfy the acceptance gate.</div> : <div className="bt-table-wrap"><table className="bt-table"><thead><tr><th>Signal</th><th>Entry</th><th>Exit</th><th className="right">Entry price</th><th className="right">Exit price</th><th className="right">Net return</th><th className="right">Net P/L</th><th>Exit reason</th></tr></thead><tbody>{latestTrades.map((trade) => <tr key={`${trade.signal_date}-${trade.entry_date}-${trade.exit_date}`}><td>{date(trade.signal_date)}</td><td>{date(trade.entry_date)}</td><td>{date(trade.exit_date)}</td><td className="right">{money(trade.entry_price)}</td><td className="right">{money(trade.exit_price)}</td><td className={`right ${trade.net_return_pct >= 0 ? "stock-positive" : "stock-negative"}`}>{percent(trade.net_return_pct)}</td><td className={`right ${trade.net_pnl >= 0 ? "stock-positive" : "stock-negative"}`}>{money(trade.net_pnl)}</td><td>{trade.exit_reason.replaceAll("_", " ")}</td></tr>)}</tbody></table>{(result.trades.length > 30) && <p className="stock-research-table-note">Showing the most recent 30 of {result.trades.length} out-of-sample trades.</p>}</div>}
          </section>

          <section className="stock-research-costs bt-panel">
            <div className="stock-research-section-heading"><div><span className="bt-eyebrow">ASSUMPTIONS &amp; SOURCES</span><h2>How the test is modeled</h2></div></div>
            <div className="stock-research-method-grid"><div><strong>Fixed long-only rule</strong><p>Daily close above prior 20-session high, close above SMA50, SMA50 above SMA200, and volume above the previous 20-session average. No parameter optimization.</p></div><div><strong>Execution and sizing</strong><p>Signals enter at the following session open. The simulation starts with ₹1,00,000 and buys whole shares with available equity. Stops use 2×ATR14, target is 2R, exits follow SMA50 or a 20-session limit. If stop and target both touch in one daily candle, stop is assumed first.</p></div><div><strong>Costs in the simulation</strong><p>{result.cost_assumptions ? `Slippage ${costPct(result.cost_assumptions.entry_slippage_pct)} each side; STT ${costPct(result.cost_assumptions.stt_pct_per_side)} each side; stamp duty ${costPct(result.cost_assumptions.stamp_duty_pct_buy_side)} on buy; SEBI fee ${costPct(result.cost_assumptions.sebi_turnover_fee_pct_per_side)} each side.` : "Unavailable."} Excludes {result.cost_assumptions?.excluded.join(", ") ?? "other charges"}.</p></div></div>
            <div className="stock-research-links"><a href="https://www.nseindia.com/static/market-data/eod-historical-data-subscription" target="_blank" rel="noreferrer">NSE historical data <ExternalLink size={12} /></a><a href="https://ta-lib.org/functions/sma" target="_blank" rel="noreferrer">SMA reference <ExternalLink size={12} /></a><a href="https://github.com/TA-Lib/ta-lib/blob/main/ta_codegen/input/rsi/rsi.md" target="_blank" rel="noreferrer">RSI reference <ExternalLink size={12} /></a><a href="https://ta-lib.org/functions/macdfix.html" target="_blank" rel="noreferrer">MACD reference <ExternalLink size={12} /></a><a href="https://ta-lib.org/functions/atr.html" target="_blank" rel="noreferrer">ATR reference <ExternalLink size={12} /></a><a href="https://www.nseindia.com/static/invest/first-time-investor-sebi-turnover-fees-stt-other-levies" target="_blank" rel="noreferrer">NSE levy schedule <ExternalLink size={12} /></a></div>
            <p className="stock-research-muted">A historical win rate—even if it passes the screen—is not a guarantee of future results. Prices are not adjusted for splits or bonus issues; these events can distort indicators, trade levels, and long-range backtests.</p>
          </section>
        </>}
      </>}

      <section className="stock-research-ledger bt-panel">
        <div className="stock-research-section-heading"><div><span className="bt-eyebrow">LOCAL RUN LEDGER</span><h2>Every attempt is counted</h2><p>Completed analyses, failed or insufficient-data attempts, and the number that passed or failed the historical gate.</p></div><button className="bt-secondary" type="button" onClick={() => { setHistoryLoading(true); setHistoryError(null); void refreshHistory(); }} disabled={historyLoading}><RefreshCw size={13} className={historyLoading ? "spin" : ""} aria-hidden="true" /> Refresh log</button></div>
        {historyError && <p className="stock-research-ledger-error" role="alert">{historyError}</p>}
        <div className="stock-research-ledger-stats">
          <div><span>Total attempts</span><strong>{count(history?.total_runs)}</strong></div>
          <div><span>Completed</span><strong>{count(history?.completed_runs)}</strong></div>
          <div><span>Failed attempts</span><strong>{count(history?.failed_attempts)}</strong></div>
          <div><span>Passed validation</span><strong>{count(history?.qualified_runs)}</strong></div>
          <div><span>Failed validation</span><strong>{count(history?.failed_gates)}</strong></div>
          <div><span>Not evaluable</span><strong>{count(history?.not_evaluable_runs)}</strong></div>
        </div>
        {history?.runs.length ? <div className="bt-table-wrap"><table className="bt-table"><thead><tr><th>Run time</th><th>Stock</th><th>Status</th><th>OOS trades</th><th>Wins / losses</th><th>Validation</th></tr></thead><tbody>{history.runs.map((runItem) => <tr key={runItem.run_id}><td>{date(runItem.logged_at)}</td><td><strong>{runItem.symbol || "—"}</strong></td><td>{runItem.run_status.replaceAll("_", " ")}{runItem.failure_reason && <small className="stock-research-failure">{runItem.failure_reason}</small>}</td><td>{runItem.trades}</td><td>{runItem.wins} / {runItem.losses}</td><td><span className={`stock-research-history-gate ${runItem.validation_status}`}>{runItem.validation_status.replaceAll("_", " ")}</span></td></tr>)}</tbody></table></div> : !historyLoading && !historyError ? <div className="stock-research-empty-inline"><Clock3 size={15} aria-hidden="true" />No research runs are logged yet. The first attempt will appear here.</div> : null}
      </section>

      <footer className="stock-research-footer"><Info size={14} aria-hidden="true" /><span>Run ID: <code>{result?.run_id ?? "—"}</code> · Start and finish times are recorded in the local SQLite research log. The app does not place orders.</span>{oos && <span className="stock-research-footer-counts"><ArrowUpRight size={13} /> {oos.wins} wins <ArrowDownRight size={13} /> {oos.losses} losses</span>}</footer>
    </main>
  </div>;
}
