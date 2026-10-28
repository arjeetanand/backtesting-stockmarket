"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Clock3, LoaderCircle, RotateCcw } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { SymbolCombobox } from "@/components/data/SymbolCombobox";
import { runTimeMachineScenario, type ScenarioOutcomes, type TimeMachineResult } from "@/lib/time-machine";

type FormValues = {
  symbol: string;
  entryPrice: string;
  riskPct: string;
  targetR: string;
  maxHoldSessions: string;
  lookbackSessions: string;
  seed: string;
};

const initialForm: FormValues = {
  symbol: "RELIANCE",
  entryPrice: "",
  riskPct: "1",
  targetR: "2",
  maxHoldSessions: "10",
  lookbackSessions: "60",
  seed: "19",
};

const integerLabel = new Intl.NumberFormat("en-IN");
const priceLabel = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

function formatPrice(value: number) { return priceLabel.format(value); }
function formatR(value: number) { return `${value > 0 ? "+" : ""}${value.toFixed(2)} R`; }

function OutcomePanel({ title, note, outcomes }: { title: string; note: string; outcomes: ScenarioOutcomes }) {
  const rows = [
    ["Stop level touched", outcomes.stop_loss],
    ["Target level touched", outcomes.target],
    ["Time limit reached", outcomes.time_exit],
  ] as const;

  return (
    <section className="bt-panel" style={{ padding: "20px" }} aria-label={title}>
      <div className="bt-panel-head">
        <div><span className="bt-eyebrow">{title}</span><p className="text-xs text-slate-500">{note}</p></div>
        <span className="data-source">{integerLabel.format(outcomes.samples)} samples</span>
      </div>
      <p className="text-xs text-slate-500" style={{ marginTop: "16px" }}>Outcome counts · not probabilities</p>
      <dl className="bt-time-machine-outcomes">
        {rows.map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{integerLabel.format(count)}</dd></div>)}
      </dl>
      <dl className="bt-time-machine-stats">
        <div><dt>Average result</dt><dd>{formatR(outcomes.average_r)}</dd></div>
        <div><dt>Median result</dt><dd>{formatR(outcomes.median_r)}</dd></div>
      </dl>
      <div className="bt-time-machine-range" aria-label="Exit price percentiles">
        <div><span>5th percentile</span><strong>{formatPrice(outcomes.p05_exit_price)}</strong></div>
        <div><span>Median</span><strong>{formatPrice(outcomes.median_exit_price)}</strong></div>
        <div><span>95th percentile</span><strong>{formatPrice(outcomes.p95_exit_price)}</strong></div>
      </div>
    </section>
  );
}

export default function TimeMachinePage() {
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState<TimeMachineResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: keyof FormValues, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setResult(null);
    setError(null);
  };

  const run = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const riskPct = Number(form.riskPct);
    const targetR = Number(form.targetR);
    const maxHoldSessions = Number(form.maxHoldSessions);
    const lookbackSessions = Number(form.lookbackSessions);
    const seed = Number(form.seed);
    const entryPrice = form.entryPrice.trim() ? Number(form.entryPrice) : null;

    if (!form.symbol.trim()) { setError("Choose an NSE symbol first."); return; }
    if (!Number.isFinite(riskPct) || riskPct < 0.01 || riskPct > 25) { setError("Stop distance must be at least 0.01% and at most 25%."); return; }
    if (!Number.isFinite(targetR) || targetR < 0.01 || targetR > 10) { setError("Target R must be from 0.01 to 10."); return; }
    if (!Number.isInteger(maxHoldSessions) || maxHoldSessions < 1 || maxHoldSessions > 20) { setError("Maximum holding sessions must be a whole number from 1 to 20."); return; }
    if (!Number.isInteger(lookbackSessions) || lookbackSessions < 20 || lookbackSessions > 252) { setError("Lookback sessions must be a whole number from 20 to 252."); return; }
    if (!Number.isInteger(seed) || seed < 0 || seed > 2_147_483_647) { setError("Seed must be a whole number from 0 to 2,147,483,647."); return; }
    if (entryPrice !== null && (!Number.isFinite(entryPrice) || entryPrice < 0.01 || entryPrice > 1_000_000_000)) { setError("Entry price must be at least ₹0.01 and at most ₹1,000,000,000, or left blank to use the latest local close."); return; }

    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const next = await runTimeMachineScenario({
        symbol: form.symbol.trim().toUpperCase(),
        entry_price: entryPrice,
        risk_pct: riskPct,
        target_r: targetR,
        max_hold_sessions: maxHoldSessions,
        lookback_sessions: lookbackSessions,
        seed,
      });
      setResult(next);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The local scenario simulator could not run.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setForm(initialForm);
    setResult(null);
    setError(null);
  };

  return (
    <div className="backtrack-page">
      <TopBar title="Daily time machine" />
      <main className="backtrack-content bt-stack bt-time-machine">
        <section className="bt-heading-row">
          <div>
            <span className="bt-kicker"><Clock3 size={13} aria-hidden="true" /> DAILY SCENARIO LAB</span>
            <h1>Explore possible trade paths</h1>
            <p>Compare randomized daily-bar paths with outcomes from the same fixed rule on past bars.</p>
          </div>
        </section>

        <aside className="bt-panel" style={{ padding: "14px 18px" }} aria-label="How this simulator works">
          <p className="text-sm"><strong>Historical daily data only.</strong> This is a scenario study, not an intraday tool, forecast, or broker order. Sample and historical counts are not probabilities. Fees and slippage are excluded. If one daily bar touches both stop and target, the simulator treats the stop as first.</p>
        </aside>

        <form className="bt-panel bt-stack" style={{ padding: "20px" }} onSubmit={run} aria-labelledby="time-machine-form-title">
          <div className="bt-panel-head">
            <div><span className="bt-eyebrow">SET UP A SCENARIO</span><h2 id="time-machine-form-title">Choose the trade assumptions</h2></div>
            <button type="button" className="bt-secondary" onClick={reset} disabled={loading}><RotateCcw size={14} /> Reset</button>
          </div>

          <div className="bt-grid-2">
            <div>
              <span className="bt-field-label">NSE symbol</span>
              <SymbolCombobox value={form.symbol} onChange={(value) => update("symbol", value)} label="NSE symbol" />
            </div>
            <label><span className="bt-field-label">Entry price · optional</span>
              <input className="bt-field-input bt-field-mono" type="number" min="0.01" max="1000000000" step="0.01" inputMode="decimal" value={form.entryPrice} onChange={(event) => update("entryPrice", event.target.value)} placeholder="Use latest local close" />
              <small className="bt-field-help">Leave blank to use the latest close in your local cache.</small>
            </label>
          </div>

          <div className="bt-grid-2">
            <label><span className="bt-field-label">Stop distance from entry (%)</span>
              <input className="bt-field-input bt-field-mono" type="number" min="0.01" max="25" step="0.01" inputMode="decimal" value={form.riskPct} onChange={(event) => update("riskPct", event.target.value)} required />
              <small className="bt-field-help">Sets the stop price distance; it does not calculate account position size.</small>
            </label>
            <label><span className="bt-field-label">Target (R multiple)</span>
              <input className="bt-field-input bt-field-mono" type="number" min="0.01" max="10" step="0.01" inputMode="decimal" value={form.targetR} onChange={(event) => update("targetR", event.target.value)} required />
            </label>
          </div>

          <details>
            <summary className="bt-field-label" style={{ cursor: "pointer" }}>Advanced sample settings</summary>
            <div className="bt-grid-3" style={{ marginTop: "14px" }}>
              <label><span className="bt-field-label">Maximum hold · sessions</span>
                <input className="bt-field-input bt-field-mono" type="number" min="1" max="20" step="1" value={form.maxHoldSessions} onChange={(event) => update("maxHoldSessions", event.target.value)} required />
              </label>
              <label><span className="bt-field-label">Historical lookback · sessions</span>
                <input className="bt-field-input bt-field-mono" type="number" min="20" max="252" step="1" value={form.lookbackSessions} onChange={(event) => update("lookbackSessions", event.target.value)} required />
              </label>
              <label><span className="bt-field-label">Repeatable seed</span>
                <input className="bt-field-input bt-field-mono" type="number" min="0" max="2147483647" step="1" value={form.seed} onChange={(event) => update("seed", event.target.value)} required />
              </label>
            </div>
            <small className="bt-field-help">The same inputs and seed reproduce the same random sample.</small>
          </details>

          <div className="bt-row-between">
            <span className="bt-field-help">Uses only NSE daily bars already saved on this device.</span>
            <button type="submit" className="bt-primary" disabled={loading}>
              {loading ? <><LoaderCircle size={15} className="spin" aria-hidden="true" /> Running scenarios…</> : <>Run scenario <ArrowRight size={15} aria-hidden="true" /></>}
            </button>
          </div>
        </form>

        {error && (
          <div className="bt-alert-error" role="alert">
            <div><strong>Scenario could not run</strong><p>{error}</p><p>If the local history is missing or too short, import NSE archives first.</p><Link className="bt-link" href="/data">Manage NSE history <ArrowRight size={13} /></Link></div>
          </div>
        )}

        {loading && <div className="bt-panel bt-loading-state" role="status"><LoaderCircle size={17} className="spin" aria-hidden="true" /><span>Sampling paths from local daily history…</span></div>}

        {!loading && !error && !result && (
          <div className="bt-panel" style={{ padding: "20px" }} role="status">
            <strong>Ready when you are.</strong>
            <p className="text-xs text-slate-500" style={{ marginTop: "4px" }}>The simulator will use actual local NSE bars and show the source date range when it returns results.</p>
          </div>
        )}

        {result && (
          <section className="bt-stack" aria-labelledby="time-machine-result-title">
            <div className="bt-panel" style={{ padding: "20px" }}>
              <div className="bt-panel-head">
                <div><span className="bt-eyebrow">RESULT · {result.symbol}</span><h2 id="time-machine-result-title">Scenario levels</h2></div>
                <span className="data-source">As of {result.as_of_date.slice(0, 10)}</span>
              </div>
              <p className="text-xs text-slate-500" style={{ marginTop: "5px" }}>
                Source: {integerLabel.format(result.source_sessions)} local sessions, {result.data_start.slice(0, 10)} to {result.data_end.slice(0, 10)}. Seed {result.seed} · {integerLabel.format(result.simulations)} simulations.
              </p>
              <div className="bt-grid-3" style={{ marginTop: "16px" }}>
                <div className="bt-time-machine-level"><span>Entry</span><strong>{formatPrice(result.entry_price)}</strong></div>
                <div className="bt-time-machine-level"><span>Stop</span><strong>{formatPrice(result.stop_price)}</strong></div>
                <div className="bt-time-machine-level"><span>Target · {result.target_r.toFixed(2)} R</span><strong>{formatPrice(result.target_price)}</strong></div>
              </div>
              <p className="text-xs text-slate-500" style={{ marginTop: "12px" }}>Stop distance: {result.risk_pct.toFixed(2)}% · Price risk per share: {formatPrice(result.risk_per_share)} · Maximum hold: {integerLabel.format(result.max_hold_sessions)} sessions</p>
            </div>
            <div className="bt-grid-2">
              <OutcomePanel title="MONTE CARLO SAMPLE" note="Daily OHLC bars re-sampled with replacement" outcomes={result.monte_carlo} />
              <OutcomePanel title="HISTORICAL OUTCOMES" note="Fixed-rule outcomes on earlier daily bars" outcomes={result.historical_outcomes} />
            </div>
            <p className="bt-field-help">The two result groups describe sampled historical scenarios. Their counts and exit-price percentiles do not estimate future odds or promise a return.</p>
          </section>
        )}
      </main>
    </div>
  );
}
