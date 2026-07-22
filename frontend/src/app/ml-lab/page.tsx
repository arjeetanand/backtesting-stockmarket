"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, Clock3, Database, FlaskConical, Play, RefreshCw, ShieldCheck } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { SymbolCombobox } from "@/components/data/SymbolCombobox";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
const MODEL_OPTIONS = [
  { id: "ridge", label: "Ridge", detail: "Stable linear baseline" },
  { id: "random_forest", label: "Random forest", detail: "Non-linear ensemble" },
  { id: "hist_gradient_boosting", label: "Gradient boosting", detail: "Regularized boosting" },
] as const;

type ModelId = (typeof MODEL_OPTIONS)[number]["id"];
type MlResult = {
  run_id: string;
  symbol: string;
  timeframe: string;
  horizon_days: number;
  data: { raw_bars: number; usable_rows: number; feature_count: number; start: string; end: string };
  splits: { train_rows: number; validation_rows: number; test_rows: number };
  features: string[];
  selected_model: string;
  models: Array<{ model: string; kind: string; validation: Record<string, number> }>;
  test: { metrics: Record<string, number>; backtest: Record<string, number>; predictions: Array<{ date: string; actual_return: number; predicted_return: number }> };
  walk_forward: { folds: Array<Record<string, number>>; message: string };
  warnings: string[];
};

const today = new Date().toISOString().slice(0, 10);
const defaultStart = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function pct(value: number | undefined, digits = 1): string {
  return Number.isFinite(value) ? `${(Number(value) * 100).toFixed(digits)}%` : "—";
}

function metric(value: number | undefined, digits = 4): string {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : "—";
}

function predictionPath(values: number[], width: number, height: number, colorMin: number, colorMax: number): string {
  if (!values.length) return "";
  const range = Math.max(colorMax - colorMin, 0.0001);
  return values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width;
    const y = height - ((value - colorMin) / range) * height;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

function formatModelName(value: string): string {
  return value === "random_forest" ? "Random forest" : value === "hist_gradient_boosting" ? "Gradient boosting" : value === "train_mean" ? "Train mean" : "Ridge";
}

export default function MlLabPage() {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(today);
  const [horizon, setHorizon] = useState("5");
  const [models, setModels] = useState<ModelId[]>(MODEL_OPTIONS.map((option) => option.id));
  const [result, setResult] = useState<MlResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleModel = (id: ModelId) => setModels((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  const runExperiment = async () => {
    if (!symbol.trim() || models.length === 0) {
      setError("Choose a stock and at least one model.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/ml/experiments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: symbol.trim().toUpperCase(), start, end, timeframe: "1day", horizon_days: Number(horizon), models }),
      });
      const payload = await response.json() as MlResult & { detail?: string };
      if (!response.ok) throw new Error(payload.detail ?? "The ML experiment could not run.");
      setResult(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The ML experiment could not run.");
    } finally {
      setLoading(false);
    }
  };

  const chart = useMemo(() => {
    if (!result?.test.predictions.length) return null;
    const values = result.test.predictions.flatMap((point) => [point.actual_return, point.predicted_return]);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    return {
      actual: predictionPath(result.test.predictions.map((point) => point.actual_return), 760, 190, min, max),
      predicted: predictionPath(result.test.predictions.map((point) => point.predicted_return), 760, 190, min, max),
      min,
      max,
      first: result.test.predictions[0]?.date.slice(0, 10),
      last: result.test.predictions.at(-1)?.date.slice(0, 10),
    };
  }, [result]);

  return <div className="backtrack-page"><TopBar /><div className="backtrack-content bt-stack ml-lab-page">
    <section className="bt-heading-row"><div><div className="bt-kicker"><span className="live-dot" /> NATIVE MACHINE LEARNING</div><h1>Study whether history contains a repeatable signal.</h1><p>Train small, explainable models on the saved NSE history, then challenge them with unseen dates and Backtrack execution costs.</p></div><div className="bt-heading-actions"><span className="data-source"><ShieldCheck size={14} /> Research-only · no live orders</span></div></section>

    <section className="bt-panel ml-control-panel"><div className="bt-panel-head"><div><span className="bt-eyebrow">EXPERIMENT SETUP</span><h2>Build a clean historical test</h2></div><span className="bt-panel-note">Past-only features · chronological split</span></div><div className="ml-control-grid"><div className="ml-control-field ml-symbol-field"><label className="bt-field-label">NSE symbol</label><SymbolCombobox value={symbol} onChange={setSymbol} label="NSE symbol" /></div><label className="ml-control-field"><span className="bt-field-label">From</span><input className="bt-field-input" type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} /></label><label className="ml-control-field"><span className="bt-field-label">To</span><input className="bt-field-input" type="date" value={end} min={start} max={today} onChange={(event) => setEnd(event.target.value)} /></label><label className="ml-control-field"><span className="bt-field-label">Forward horizon</span><select className="bt-field-input" value={horizon} onChange={(event) => setHorizon(event.target.value)}><option value="1">1 trading day</option><option value="5">5 trading days</option><option value="20">20 trading days</option></select></label></div><div className="ml-model-section"><div><span className="bt-field-label">Candidate models</span><p className="bt-field-help">Validation chooses the best model; the final score stays on later unseen dates.</p></div><div className="ml-model-options">{MODEL_OPTIONS.map((option) => <button type="button" key={option.id} className={`ml-model-option${models.includes(option.id) ? " is-selected" : ""}`} onClick={() => toggleModel(option.id)}><span className="ml-model-check">{models.includes(option.id) ? "✓" : ""}</span><span><strong>{option.label}</strong><small>{option.detail}</small></span></button>)}</div></div><div className="ml-action-row"><div className="ml-method-note"><Database size={15} /><span>Uses the local official NSE cache. Import history first from <a href="/data">Manage stock data</a> if needed.</span></div><button type="button" className="bt-primary" onClick={() => void runExperiment()} disabled={loading}>{loading ? <RefreshCw size={14} className="spin" /> : <Play size={14} />} {loading ? "Running experiment…" : "Run ML experiment"}</button></div>{error && <p className="bt-alert-error" role="alert">{error}</p>}</section>

    {!result && !loading && !error && <section className="ml-empty-state"><div className="ml-empty-icon"><BrainCircuit size={23} /></div><div><h2>Start with one stock and a complete date range.</h2><p>The experiment will calculate technical features, train the selected candidates, test the winner on later dates, and show whether the signal survives realistic execution assumptions.</p></div><div className="ml-empty-steps"><span><FlaskConical size={14} /> Build features</span><span><Clock3 size={14} /> Split by date</span><span><ShieldCheck size={14} /> Challenge the result</span></div></section>}
    {loading && <div className="bt-panel bt-loading-state"><RefreshCw size={18} className="spin" /><span>Building past-only features, training candidates, and checking the later test window…</span></div>}

    {result && <>
      <section className="ml-result-intro"><div><span className="bt-eyebrow">EXPERIMENT COMPLETE</span><h2>{result.symbol} · {result.horizon_days}-day return study</h2><p>{result.data.start.slice(0, 10)} to {result.data.end.slice(0, 10)} · run {result.run_id}</p></div><span className="ml-complete-badge"><CheckCircle2 size={14} /> Cached and reproducible</span></section>
      <div className="ml-summary-grid"><div className="ml-summary-card"><span>Selected model</span><strong>{formatModelName(result.selected_model)}</strong><small>Chosen on validation RMSE</small></div><div className="ml-summary-card"><span>Test directional accuracy</span><strong>{pct(result.test.metrics.directional_accuracy)}</strong><small>Later unseen dates only</small></div><div className="ml-summary-card"><span>Strategy return</span><strong className={result.test.backtest.strategy_return >= result.test.backtest.buy_hold_return ? "is-positive" : "is-negative"}>{pct(result.test.backtest.strategy_return)}</strong><small>Buy &amp; hold: {pct(result.test.backtest.buy_hold_return)}</small></div><div className="ml-summary-card"><span>Test drawdown</span><strong className="is-negative">{pct(result.test.backtest.maximum_drawdown)}</strong><small>{result.test.backtest.trade_count.toFixed(0)} simulated entries</small></div></div>

      <div className="ml-result-grid"><section className="bt-panel ml-chart-panel"><div className="bt-panel-head"><div><span className="bt-eyebrow">UNSEEN TEST WINDOW</span><h2>Actual versus predicted return</h2></div><span className="bt-panel-note">{chart?.first} → {chart?.last}</span></div>{chart && <div className="ml-line-chart"><svg viewBox="0 0 760 220" role="img" aria-label="Actual and predicted forward returns"><line x1="0" y1="110" x2="760" y2="110" stroke="#cbd5e1" strokeDasharray="4 5" /><path d={chart.actual} transform="translate(0 15)" fill="none" stroke="#059669" strokeWidth="2" /><path d={chart.predicted} transform="translate(0 15)" fill="none" stroke="#4f46e5" strokeWidth="2" /><text x="8" y="210" className="ml-chart-label">{chart.first}</text><text x="752" y="210" textAnchor="end" className="ml-chart-label">{chart.last}</text></svg><div className="ml-chart-legend"><span><i className="actual" /> Actual forward return</span><span><i className="predicted" /> Model prediction</span><span className="ml-chart-range">Range {pct(chart.min)} to {pct(chart.max)}</span></div></div>}</section><section className="bt-panel ml-test-panel"><div className="bt-panel-head"><div><span className="bt-eyebrow">TEST METRICS</span><h2>How much signal is there?</h2></div></div><div className="ml-metric-list"><div><span>MAE</span><strong>{metric(result.test.metrics.mae)}</strong></div><div><span>RMSE</span><strong>{metric(result.test.metrics.rmse)}</strong></div><div><span>Correlation</span><strong>{metric(result.test.metrics.correlation)}</strong></div><div><span>Direction</span><strong>{pct(result.test.metrics.directional_accuracy)}</strong></div></div><p className="ml-test-note">A model is useful only if this test window holds up across symbols, periods, costs, and walk-forward folds—not because one metric looks attractive.</p></section></div>

      <section className="bt-panel"><div className="bt-panel-head"><div><span className="bt-eyebrow">MODEL COMPARISON</span><h2>Validation leaderboard</h2></div><span className="bt-panel-note">Lower RMSE is better</span></div><div className="bt-table-wrap"><table className="bt-table ml-table"><thead><tr><th className="left">Model</th><th className="right">Validation MAE</th><th className="right">Validation RMSE</th><th className="right">Direction</th><th className="center">Role</th></tr></thead><tbody>{result.models.map((item) => <tr key={item.model} className={item.model === result.selected_model ? "ml-selected-row" : ""}><td className="left"><strong>{formatModelName(item.model)}</strong>{item.model === result.selected_model && <span className="ml-row-label">selected</span>}</td><td className="right">{metric(item.validation.mae)}</td><td className="right">{metric(item.validation.rmse)}</td><td className="right">{pct(item.validation.directional_accuracy)}</td><td className="center">{item.kind === "baseline" ? "Baseline" : "Candidate"}</td></tr>)}</tbody></table></div></section>

      <div className="ml-bottom-grid"><section className="bt-panel"><div className="bt-panel-head"><div><span className="bt-eyebrow">DATA AND VALIDATION</span><h2>What was actually tested?</h2></div></div><div className="ml-fact-list"><div><span>Raw NSE bars</span><strong>{result.data.raw_bars.toLocaleString("en-IN")}</strong></div><div><span>Usable rows</span><strong>{result.data.usable_rows.toLocaleString("en-IN")}</strong></div><div><span>Features</span><strong>{result.data.feature_count}</strong></div><div><span>Train / validation / test</span><strong>{result.splits.train_rows} / {result.splits.validation_rows} / {result.splits.test_rows}</strong></div></div><div className="ml-feature-list">{result.features.map((feature) => <span key={feature}>{feature.replaceAll("_", " ")}</span>)}</div></section><section className="bt-panel"><div className="bt-panel-head"><div><span className="bt-eyebrow">WALK-FORWARD</span><h2>Does it travel through time?</h2></div><span className="bt-panel-note">{result.walk_forward.folds.length} folds</span></div>{result.walk_forward.folds.length ? <div className="ml-fold-list">{result.walk_forward.folds.map((fold, index) => <div key={index}><span>Fold {index + 1}</span><strong>{pct(fold.directional_accuracy)}</strong><small>RMSE {metric(fold.rmse)}</small></div>)}</div> : null}<p className="ml-test-note">{result.walk_forward.message}</p></section></div>
      <section className="ml-warning-panel"><AlertTriangle size={17} /><div><strong>Read the caveats before trusting the result.</strong>{result.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></section>
    </>}
  </div></div>;
}
