"use client";

import { useEffect, useMemo, useState, MouseEvent } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Database,
  FlaskConical,
  History,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
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
  test: {
    metrics: Record<string, number>;
    backtest: Record<string, number>;
    predictions: Array<{ date: string; actual_return: number; predicted_return: number }>;
  };
  walk_forward: { folds: Array<Record<string, number>>; message: string };
  warnings: string[];
};

type PastExperimentItem = {
  id?: string;
  run_id?: string;
  symbol?: string;
  horizon_days?: number;
  selected_model?: string;
  data?: { start: string; end: string };
  test?: { metrics: Record<string, number> };
  created_at?: string;
};

const FEATURE_DESCRIPTIONS: Record<string, string> = {
  return_1d: "1-Day Return",
  return_5d: "5-Day Return",
  return_20d: "20-Day Return",
  sma_10_distance: "SMA 10 Spread",
  sma_20_distance: "SMA 20 Spread",
  sma_50_distance: "SMA 50 Spread",
  sma_200_distance: "SMA 200 Spread",
  ema_12_distance: "EMA 12 Spread",
  ema_26_distance: "EMA 26 Spread",
  volatility_10d: "10-Day Volatility",
  volatility_20d: "20-Day Volatility",
  volume_change_1d: "1-Day Vol Change",
  relative_volume_20d: "RVOL (20D)",
  rsi_14: "RSI (14)",
  rsi_7: "Fast RSI (7)",
  macd_distance: "MACD Line",
  macd_signal_distance: "MACD Signal",
  macd_diff: "MACD Histogram",
  atr_14_normalized: "Normalized ATR (14)",
  bollinger_hband_distance: "Bollinger Upper Spread",
  bollinger_lband_distance: "Bollinger Lower Spread",
  bollinger_pband: "Bollinger %B",
  stoch_k: "Stochastic %K",
  stoch_d: "Stochastic %D",
  williams_r: "Williams %R",
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
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - colorMin) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function formatModelName(value: string): string {
  return value === "random_forest"
    ? "Random forest"
    : value === "hist_gradient_boosting"
    ? "Gradient boosting"
    : value === "train_mean"
    ? "Train mean"
    : "Ridge";
}

export default function MlLabPage() {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(today);
  const [horizon, setHorizon] = useState("5");
  const [timeframe, setTimeframe] = useState("1day");
  const [models, setModels] = useState<ModelId[]>(MODEL_OPTIONS.map((option) => option.id));
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced Ratios and Costs
  const [trainRatio, setTrainRatio] = useState(0.6);
  const [valRatio, setValRatio] = useState(0.2);
  const [testRatio, setTestRatio] = useState(0.2);
  const [commissionPct, setCommissionPct] = useState(0.001);
  const [slippagePct, setSlippagePct] = useState(0.0005);

  const [result, setResult] = useState<MlResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Saved Experiments History
  const [pastRuns, setPastRuns] = useState<PastExperimentItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Chart interactivity
  const [showActual, setShowActual] = useState(true);
  const [showPredicted, setShowPredicted] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const toggleModel = (id: ModelId) =>
    setModels((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch(`${API_BASE_URL}/ml/experiments?limit=20`);
      if (response.ok) {
        const data = (await response.json()) as PastExperimentItem[];
        setPastRuns(data);
      }
    } catch {
      // Ignore background history fetch errors silently
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    void fetchHistory();
  }, []);

  const runExperiment = async (customPayload?: object) => {
    if (!symbol.trim() || models.length === 0) {
      setError("Choose a stock and at least one model.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = customPayload ?? {
        symbol: symbol.trim().toUpperCase(),
        start,
        end,
        timeframe,
        horizon_days: Number(horizon),
        train_ratio: trainRatio,
        validation_ratio: valRatio,
        test_ratio: testRatio,
        models,
        commission_pct: commissionPct,
        slippage_pct: slippagePct,
      };

      const response = await fetch(`${API_BASE_URL}/ml/experiments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as MlResult & { detail?: string };
      if (!response.ok) throw new Error(payload.detail ?? "The ML experiment could not run.");
      setResult(payload);
      void fetchHistory();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The ML experiment could not run.");
    } finally {
      setLoading(false);
    }
  };

  const chart = useMemo(() => {
    if (!result?.test.predictions.length) return null;
    const preds = result.test.predictions;
    const values = preds.flatMap((point) => [point.actual_return, point.predicted_return]);
    const min = Math.min(...values, -0.01);
    const max = Math.max(...values, 0.01);
    const width = 760;
    const height = 190;
    const zeroY = height - ((0 - min) / Math.max(max - min, 0.0001)) * height;

    return {
      width,
      height,
      zeroY,
      actual: predictionPath(
        preds.map((p) => p.actual_return),
        width,
        height,
        min,
        max
      ),
      predicted: predictionPath(
        preds.map((p) => p.predicted_return),
        width,
        height,
        min,
        max
      ),
      min,
      max,
      count: preds.length,
      first: preds[0]?.date.slice(0, 10),
      last: preds.at(-1)?.date.slice(0, 10),
      preds,
    };
  }, [result]);

  const handleMouseMove = (e: MouseEvent<SVGSVGElement>) => {
    if (!chart || !chart.preds.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const index = Math.round(ratio * (chart.preds.length - 1));
    setHoverIndex(index);
  };

  const activePoint = hoverIndex !== null && chart ? chart.preds[hoverIndex] : null;

  return (
    <div className="backtrack-page bt-ml-page">
      <TopBar />
      <div className="backtrack-content bt-stack ml-lab-page">
        {/* Header section */}
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker">
              <span className="live-dot" /> NATIVE MACHINE LEARNING
            </div>
            <h1>Study whether history contains a repeatable signal.</h1>
            <p>
              Train past-only models on official NSE history, challenge them on unseen dates, and test realistic execution costs.
            </p>
          </div>
          <div className="bt-heading-actions">
            <button
              type="button"
              className={`bt-secondary-btn ${showHistory ? "is-active" : ""}`}
              onClick={() => setShowHistory((prev) => !prev)}
            >
              <History size={14} /> Saved Runs ({pastRuns.length})
            </button>
            <span className="data-source">
              <ShieldCheck size={14} /> Research-only · no live orders
            </span>
          </div>
        </section>

        {/* Experiment History Drawer / Panel */}
        {showHistory && (
          <section className="bt-panel ml-history-panel">
            <div className="bt-panel-head">
              <div>
                <span className="bt-eyebrow">SAVED EXPERIMENTS</span>
                <h2>Recent Experiment Runs</h2>
              </div>
              <button type="button" className="bt-text-btn" onClick={() => void fetchHistory()}>
                <RefreshCw size={13} className={loadingHistory ? "spin" : ""} /> Refresh
              </button>
            </div>
            {pastRuns.length === 0 ? (
              <p className="ml-history-empty">No previous ML experiment runs saved in local history yet.</p>
            ) : (
              <div className="ml-history-grid">
                {pastRuns.map((run, idx) => {
                  const symbolStr = run.symbol ?? (run as unknown as MlResult).symbol ?? "NSE";
                  const modelStr = run.selected_model ?? (run as unknown as MlResult).selected_model ?? "ridge";
                  const horizonDays = run.horizon_days ?? (run as unknown as MlResult).horizon_days ?? 5;
                  const dirAcc = run.test?.metrics?.directional_accuracy ?? (run as unknown as MlResult).test?.metrics?.directional_accuracy;

                  return (
                    <div
                      key={run.run_id ?? idx}
                      className="ml-history-card"
                      onClick={() => {
                        setResult(run as unknown as MlResult);
                        setShowHistory(false);
                      }}
                    >
                      <div className="ml-history-card-head">
                        <strong>{symbolStr}</strong>
                        <span className="ml-history-badge">{formatModelName(modelStr)}</span>
                      </div>
                      <div className="ml-history-card-body">
                        <span>Horizon: {horizonDays}d</span>
                        {dirAcc !== undefined && (
                          <span className="ml-history-metric">Dir: {pct(dirAcc)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <div className="ml-preflight-grid">
        {/* Main Controls Panel */}
        <section className="bt-panel ml-control-panel">
          <div className="bt-panel-head">
            <div>
              <span className="bt-eyebrow">EXPERIMENT SETUP</span>
              <h2>Build a clean historical test</h2>
            </div>
            <span className="bt-panel-note">Past-only features · chronological split</span>
          </div>

          <div className="ml-control-grid">
            <div className="ml-control-field ml-symbol-field">
              <label className="bt-field-label">NSE symbol</label>
              <SymbolCombobox value={symbol} onChange={setSymbol} label="NSE symbol" />
            </div>
            <label className="ml-control-field">
              <span className="bt-field-label">From</span>
              <input
                className="bt-field-input"
                type="date"
                value={start}
                max={end}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <label className="ml-control-field">
              <span className="bt-field-label">To</span>
              <input
                className="bt-field-input"
                type="date"
                value={end}
                min={start}
                max={today}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
            <label className="ml-control-field">
              <span className="bt-field-label">Forward horizon</span>
              <select
                className="bt-field-input"
                value={horizon}
                onChange={(event) => setHorizon(event.target.value)}
              >
                <option value="1">1 trading day</option>
                <option value="5">5 trading days</option>
                <option value="20">20 trading days</option>
              </select>
            </label>
          </div>

          <div className="ml-model-section">
            <div>
              <span className="bt-field-label">Candidate models</span>
              <p className="bt-field-help">Validation chooses the best model; the final score stays on later unseen dates.</p>
            </div>
            <div className="ml-model-options">
              {MODEL_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={`ml-model-option${models.includes(option.id) ? " is-selected" : ""}`}
                  onClick={() => toggleModel(option.id)}
                >
                  <span className="ml-model-check">{models.includes(option.id) ? "✓" : ""}</span>
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.detail}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Advanced Collapsible Settings */}
          <div className="ml-advanced-toggle-row">
            <button
              type="button"
              className="ml-advanced-btn"
              onClick={() => setShowAdvanced((prev) => !prev)}
            >
              <Settings2 size={14} /> Advanced Parameters &amp; Split Ratios{" "}
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {showAdvanced && (
            <div className="ml-advanced-panel">
              <div className="ml-advanced-grid">
                <label className="ml-control-field">
                  <span className="bt-field-label">Timeframe</span>
                  <select
                    className="bt-field-input"
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                  >
                    <option value="1day">1 Day Daily Bars</option>
                  </select>
                </label>
                <label className="ml-control-field">
                  <span className="bt-field-label">Train Ratio ({(trainRatio * 100).toFixed(0)}%)</span>
                  <input
                    type="range"
                    min="0.4"
                    max="0.8"
                    step="0.05"
                    value={trainRatio}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setTrainRatio(val);
                      const rem = 1.0 - val;
                      setValRatio(rem / 2);
                      setTestRatio(rem / 2);
                    }}
                  />
                </label>
                <label className="ml-control-field">
                  <span className="bt-field-label">Val Ratio ({(valRatio * 100).toFixed(0)}%)</span>
                  <input
                    type="range"
                    min="0.1"
                    max="0.3"
                    step="0.05"
                    value={valRatio}
                    onChange={(e) => setValRatio(parseFloat(e.target.value))}
                  />
                </label>
                <label className="ml-control-field">
                  <span className="bt-field-label">Test Ratio ({(testRatio * 100).toFixed(0)}%)</span>
                  <input
                    type="range"
                    min="0.1"
                    max="0.3"
                    step="0.05"
                    value={testRatio}
                    onChange={(e) => setTestRatio(parseFloat(e.target.value))}
                  />
                </label>
              </div>
              <div className="ml-advanced-grid ml-cost-grid">
                <label className="ml-control-field">
                  <span className="bt-field-label">Commission %</span>
                  <input
                    className="bt-field-input"
                    type="number"
                    step="0.0005"
                    min="0"
                    max="0.05"
                    value={commissionPct}
                    onChange={(e) => setCommissionPct(parseFloat(e.target.value) || 0)}
                  />
                </label>
                <label className="ml-control-field">
                  <span className="bt-field-label">Slippage %</span>
                  <input
                    className="bt-field-input"
                    type="number"
                    step="0.0001"
                    min="0"
                    max="0.05"
                    value={slippagePct}
                    onChange={(e) => setSlippagePct(parseFloat(e.target.value) || 0)}
                  />
                </label>
              </div>
            </div>
          )}

          <div className="ml-action-row">
            <div className="ml-method-note">
              <Database size={15} />
              <span>
                Uses the local official NSE cache. Import history first from{" "}
                <a href="/data">Manage stock data</a> if needed.
              </span>
            </div>
            <button
              type="button"
              className="bt-primary"
              onClick={() => void runExperiment()}
              disabled={loading}
            >
              {loading ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
              {loading ? "Running experiment…" : "Run ML experiment"}
            </button>
          </div>

          {error && (
            <div className="bt-alert-error" role="alert">
              <AlertTriangle size={16} />
              <div>
                <strong>Experiment Error:</strong> {error}
                {error.toLowerCase().includes("data") && (
                  <p style={{ marginTop: "4px" }}>
                    <a href="/data" style={{ textDecoration: "underline", color: "inherit", fontWeight: "bold" }}>
                      → Go to Data Import page to download official NSE historical archives.
                    </a>
                  </p>
                )}
              </div>
            </div>
          )}
        </section>

        {!result && !loading && !error && (
          <section className="bt-panel ml-diagnostics-empty" aria-label="Training diagnostics">
            <div className="bt-panel-head"><div><span className="bt-eyebrow">TRAINING DIAGNOSTICS</span><h2>Training and validation curves</h2><p>Model diagnostics will appear here after a past-only run.</p></div><span className="bt-panel-note">Awaiting experiment</span></div>
            <div className="ml-placeholder-chart" aria-hidden="true"><span /><span /><span /></div>
            <div className="ml-placeholder-metrics"><div><span>Directional precision</span><strong>—</strong></div><div><span>Test error (RMSE)</span><strong>—</strong></div></div>
            <p className="ml-diagnostics-note">No seeded values are shown. Run the experiment to calculate this view from the selected NSE history.</p>
          </section>
        )}
        </div>

        {!result && !loading && !error && (
          <section className="ml-empty-state">
            <div className="ml-empty-icon">
              <BrainCircuit size={23} />
            </div>
            <div>
              <h2>Start with one stock and a complete date range.</h2>
              <p>
                The experiment will calculate technical features, train selected candidates, test the winner on later dates, and evaluate realistic execution costs.
              </p>
            </div>
            <div className="ml-empty-steps">
              <span>
                <FlaskConical size={14} /> Build features
              </span>
              <span>
                <Clock3 size={14} /> Split by date
              </span>
              <span>
                <ShieldCheck size={14} /> Challenge the result
              </span>
            </div>
          </section>
        )}

        {loading && (
          <div className="bt-panel bt-loading-state">
            <RefreshCw size={18} className="spin" />
            <span>Building past-only features, training candidate models, and evaluating the test window…</span>
          </div>
        )}

        {result && (
          <>
            <section className="ml-result-intro">
              <div>
                <span className="bt-eyebrow">EXPERIMENT COMPLETE</span>
                <h2>
                  {result.symbol} · {result.horizon_days}-day return study
                </h2>
                <p>
                  {result.data.start.slice(0, 10)} to {result.data.end.slice(0, 10)} · run {result.run_id}
                </p>
              </div>
              <span className="ml-complete-badge">
                <CheckCircle2 size={14} /> Cached &amp; Reproducible
              </span>
            </section>

            <div className="ml-summary-grid">
              <div className="ml-summary-card">
                <span>Selected Model</span>
                <strong>{formatModelName(result.selected_model)}</strong>
                <small>Chosen on validation RMSE</small>
              </div>
              <div className="ml-summary-card">
                <span>Test Directional Accuracy</span>
                <strong className="is-highlight">{pct(result.test.metrics.directional_accuracy)}</strong>
                <small>Later unseen dates only</small>
              </div>
              <div className="ml-summary-card">
                <span>Strategy Return</span>
                <strong
                  className={
                    result.test.backtest.strategy_return >= result.test.backtest.buy_hold_return
                      ? "is-positive"
                      : "is-negative"
                  }
                >
                  {pct(result.test.backtest.strategy_return)}
                </strong>
                <small>Buy &amp; hold: {pct(result.test.backtest.buy_hold_return)}</small>
              </div>
              <div className="ml-summary-card">
                <span>Test Drawdown</span>
                <strong className="is-negative">{pct(result.test.backtest.maximum_drawdown)}</strong>
                <small>{result.test.backtest.trade_count.toFixed(0)} simulated trades</small>
              </div>
            </div>

            {/* Main Result Grid: Chart + Test Metrics */}
            <div className="ml-result-grid">
              <section className="bt-panel ml-chart-panel">
                <div className="bt-panel-head">
                  <div>
                    <span className="bt-eyebrow">UNSEEN TEST WINDOW</span>
                    <h2>Actual versus Predicted Return</h2>
                  </div>
                  <span className="bt-panel-note">
                    {chart?.first} → {chart?.last}
                  </span>
                </div>

                {chart && (
                  <div className="ml-line-chart-container">
                    <div className="ml-chart-toggles">
                      <button
                        type="button"
                        className={`ml-toggle-btn actual ${showActual ? "is-on" : ""}`}
                        onClick={() => setShowActual((p) => !p)}
                      >
                        <i className="actual" /> Actual Return
                      </button>
                      <button
                        type="button"
                        className={`ml-toggle-btn predicted ${showPredicted ? "is-on" : ""}`}
                        onClick={() => setShowPredicted((p) => !p)}
                      >
                        <i className="predicted" /> Model Prediction
                      </button>
                    </div>

                    <div className="ml-svg-wrap">
                      <svg
                        viewBox={`0 0 ${chart.width} ${chart.height + 25}`}
                        role="img"
                        aria-label="Actual and predicted forward returns chart"
                        onMouseMove={handleMouseMove}
                        onMouseLeave={() => setHoverIndex(null)}
                      >
                        {/* Zero axis line */}
                        <line
                          x1="0"
                          y1={chart.zeroY}
                          x2={chart.width}
                          y2={chart.zeroY}
                          stroke="#cbd5e1"
                          strokeDasharray="4 4"
                        />

                        {/* Curves */}
                        {showActual && (
                          <path
                            d={chart.actual}
                            fill="none"
                            stroke="#059669"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        )}
                        {showPredicted && (
                          <path
                            d={chart.predicted}
                            fill="none"
                            stroke="#4f46e5"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        )}

                        {/* Date Ticks */}
                        <text x="8" y={chart.height + 18} className="ml-chart-label">
                          {chart.first}
                        </text>
                        <text x={chart.width - 8} y={chart.height + 18} textAnchor="end" className="ml-chart-label">
                          {chart.last}
                        </text>

                        {/* Hover Overlay Crosshair */}
                        {hoverIndex !== null && chart && (
                          <g className="ml-hover-group">
                            {(() => {
                              const x = (hoverIndex / Math.max(chart.count - 1, 1)) * chart.width;
                              const actualVal = chart.preds[hoverIndex].actual_return;
                              const predVal = chart.preds[hoverIndex].predicted_return;
                              const range = Math.max(chart.max - chart.min, 0.0001);
                              const yActual = chart.height - ((actualVal - chart.min) / range) * chart.height;
                              const yPred = chart.height - ((predVal - chart.min) / range) * chart.height;

                              return (
                                <>
                                  <line
                                    x1={x}
                                    y1="0"
                                    x2={x}
                                    y2={chart.height}
                                    stroke="#6366f1"
                                    strokeDasharray="2 2"
                                    strokeWidth="1.5"
                                  />
                                  {showActual && <circle cx={x} cy={yActual} r="4" fill="#059669" stroke="#fff" strokeWidth="2" />}
                                  {showPredicted && <circle cx={x} cy={yPred} r="4" fill="#4f46e5" stroke="#fff" strokeWidth="2" />}
                                </>
                              );
                            })()}
                          </g>
                        )}
                      </svg>

                      {/* Floating Active Hover Card */}
                      {activePoint && (
                        <div className="ml-hover-tooltip">
                          <div className="ml-tooltip-date">{activePoint.date.slice(0, 10)}</div>
                          <div className="ml-tooltip-row">
                            <span className="dot actual" /> Actual: <strong>{pct(activePoint.actual_return, 2)}</strong>
                          </div>
                          <div className="ml-tooltip-row">
                            <span className="dot predicted" /> Predicted: <strong>{pct(activePoint.predicted_return, 2)}</strong>
                          </div>
                          <div className="ml-tooltip-status">
                            {Math.sign(activePoint.actual_return) === Math.sign(activePoint.predicted_return) ? (
                              <span className="status-match">
                                <TrendingUp size={12} /> Correct Direction
                              </span>
                            ) : (
                              <span className="status-diff">
                                <TrendingDown size={12} /> Direction Divergent
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="ml-chart-legend">
                      <span>Range {pct(chart.min, 2)} to {pct(chart.max, 2)}</span>
                    </div>
                  </div>
                )}
              </section>

              {/* Test Metrics */}
              <section className="bt-panel ml-test-panel">
                <div className="bt-panel-head">
                  <div>
                    <span className="bt-eyebrow">TEST METRICS</span>
                    <h2>How much signal is there?</h2>
                  </div>
                </div>
                <div className="ml-metric-list">
                  <div>
                    <span>MAE</span>
                    <strong>{metric(result.test.metrics.mae)}</strong>
                  </div>
                  <div>
                    <span>RMSE</span>
                    <strong>{metric(result.test.metrics.rmse)}</strong>
                  </div>
                  <div>
                    <span>Correlation</span>
                    <strong>{metric(result.test.metrics.correlation)}</strong>
                  </div>
                  <div>
                    <span>Direction</span>
                    <strong className="is-highlight">{pct(result.test.metrics.directional_accuracy)}</strong>
                  </div>
                </div>
                <p className="ml-test-note">
                  A model is useful only if this test window holds up across symbols, periods, costs, and walk-forward folds—not because one metric looks attractive.
                </p>
              </section>
            </div>

            {/* Validation Leaderboard */}
            <section className="bt-panel">
              <div className="bt-panel-head">
                <div>
                  <span className="bt-eyebrow">MODEL COMPARISON</span>
                  <h2>Validation Leaderboard</h2>
                </div>
                <span className="bt-panel-note">Lower RMSE is better</span>
              </div>
              <div className="bt-table-wrap">
                <table className="bt-table ml-table">
                  <thead>
                    <tr>
                      <th className="left">Model</th>
                      <th className="right">Validation MAE</th>
                      <th className="right">Validation RMSE</th>
                      <th className="right">Direction Accuracy</th>
                      <th className="center">Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.models.map((item) => (
                      <tr
                        key={item.model}
                        className={item.model === result.selected_model ? "ml-selected-row" : ""}
                      >
                        <td className="left">
                          <strong>{formatModelName(item.model)}</strong>
                          {item.model === result.selected_model && (
                            <span className="ml-row-label">
                              <Sparkles size={10} /> winner
                            </span>
                          )}
                        </td>
                        <td className="right">{metric(item.validation.mae)}</td>
                        <td className="right">{metric(item.validation.rmse)}</td>
                        <td className="right">{pct(item.validation.directional_accuracy)}</td>
                        <td className="center">
                          {item.kind === "baseline" ? (
                            <span className="ml-kind-badge baseline">Baseline</span>
                          ) : (
                            <span className="ml-kind-badge candidate">Candidate</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Bottom Grid: Data Breakdown & Walk-Forward Folds */}
            <div className="ml-bottom-grid">
              <section className="bt-panel">
                <div className="bt-panel-head">
                  <div>
                    <span className="bt-eyebrow">DATA AND VALIDATION</span>
                    <h2>Dataset &amp; Feature Set</h2>
                  </div>
                </div>
                <div className="ml-fact-list">
                  <div>
                    <span>Raw NSE bars</span>
                    <strong>{result.data.raw_bars.toLocaleString("en-IN")}</strong>
                  </div>
                  <div>
                    <span>Usable rows</span>
                    <strong>{result.data.usable_rows.toLocaleString("en-IN")}</strong>
                  </div>
                  <div>
                    <span>Features</span>
                    <strong>{result.data.feature_count}</strong>
                  </div>
                  <div>
                    <span>Train / Val / Test split</span>
                    <strong>
                      {result.splits.train_rows} / {result.splits.validation_rows} / {result.splits.test_rows}
                    </strong>
                  </div>
                </div>
                <div className="ml-feature-header">Features Engineered:</div>
                <div className="ml-feature-list">
                  {result.features.map((feature) => (
                    <span key={feature} title={feature}>
                      {FEATURE_DESCRIPTIONS[feature] ?? feature.replaceAll("_", " ")}
                    </span>
                  ))}
                </div>
              </section>

              <section className="bt-panel">
                <div className="bt-panel-head">
                  <div>
                    <span className="bt-eyebrow">WALK-FORWARD FOLDS</span>
                    <h2>Does it travel through time?</h2>
                  </div>
                  <span className="bt-panel-note">{result.walk_forward.folds.length} folds</span>
                </div>
                {result.walk_forward.folds.length ? (
                  <div className="ml-fold-list">
                    {result.walk_forward.folds.map((fold, index) => {
                      const dirPct = (fold.directional_accuracy ?? 0) * 100;
                      return (
                        <div key={index} className="ml-fold-card">
                          <div className="ml-fold-head">
                            <span>Fold {index + 1}</span>
                            <strong>{pct(fold.directional_accuracy)}</strong>
                          </div>
                          <div className="ml-fold-bar-wrap">
                            <div
                              className="ml-fold-bar-fill"
                              style={{ width: `${Math.min(100, Math.max(0, dirPct))}%` }}
                            />
                          </div>
                          <div className="ml-fold-foot">
                            <small>RMSE {metric(fold.rmse)}</small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                <p className="ml-test-note">{result.walk_forward.message}</p>
              </section>
            </div>

            {/* Caveats / Warnings */}
            <section className="ml-warning-panel">
              <AlertTriangle size={17} />
              <div>
                <strong>Read the caveats before trusting the result:</strong>
                {result.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
