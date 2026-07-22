"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  Gauge,
  Play,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  WalletCards,
  Zap,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import {
  swarmAgents,
  type BacktestConfig,
} from "@/lib/agents/orchestrator";
import type { AgentSnapshot } from "@/lib/agents/types";
import { runLocalBacktest, type LiveBacktestResult } from "@/lib/backtest-api";
import { EquityChart } from "@/components/charts/Charts";
import { SymbolCombobox } from "@/components/data/SymbolCombobox";

const defaultConfig: BacktestConfig = {
  symbol: "RELIANCE",
  strategy: "RSI oversold + EMA trend",
  timeframe: "1day",
  start: "2024-01-01",
  end: "2026-06-30",
  initialCapital: 100000,
  commissionBps: 10,
};

const quickConfigs: Array<Pick<BacktestConfig, "symbol" | "strategy">> = [
  { symbol: "RELIANCE", strategy: "RSI oversold + EMA trend" },
  { symbol: "HDFCBANK", strategy: "RSI oversold + EMA trend" },
  { symbol: "TCS", strategy: "RSI oversold + EMA trend" },
];

const formatINR = (value: number) =>
  `₹${Math.round(value).toLocaleString("en-IN")}`;

const formatPct = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

function AgentRow({
  agent,
  index,
  running,
}: {
  agent: AgentSnapshot;
  index: number;
  running: boolean;
}) {
  const isActive = running && index === 2;
  const status = isActive ? "running" : "complete";
  return (
    <div
      className={`agent-row agent-${agent.color} ${
        isActive ? "agent-running" : ""
      }`}
    >
      <div className="agent-node">
        {isActive ? (
          <span className="agent-pulse" />
        ) : (
          <span className="agent-check">✓</span>
        )}
      </div>
      <div className="agent-copy">
        <div className="agent-title-line">
          <span className="agent-role">{agent.role}</span>
          <span className={`agent-status ${status}`}>{status}</span>
        </div>
        <p>{agent.name}</p>
        <small>
          {isActive
            ? "Running simulation on the selected range"
            : agent.description}
        </small>
      </div>
      <span className="agent-metric">
        {isActive ? "Processing" : agent.metric}
      </span>
    </div>
  );
}

function MetricTile({
  label,
  value,
  detail,
  tone,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  tone: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={`metric-tile metric-${tone}`}>
      <div className="metric-topline">
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function EquityCurve({
  data,
  initialCapital,
}: {
  data: Array<{ date: string; equity: number }>;
  initialCapital: number;
}) {
  return <EquityChart height={300} data={data.map((point) => ({ date: point.date, strategy: point.equity, benchmark: initialCapital }))} />;
}

export default function DashboardPage() {
  const [config, setConfig] = useState<BacktestConfig>(defaultConfig);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LiveBacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runBacktest = useCallback(async (requestedConfig: BacktestConfig) => {
    const symbol = requestedConfig.symbol.trim().toUpperCase();
    const initialCapital = Number(requestedConfig.initialCapital);
    if (!symbol) { setError("Choose an NSE symbol before running the backtest."); setResult(null); return; }
    if (!requestedConfig.start || !requestedConfig.end || requestedConfig.start > requestedConfig.end) { setError("Choose a valid date range: start date must be on or before end date."); setResult(null); return; }
    if (!Number.isFinite(initialCapital) || initialCapital <= 0) { setError("Initial capital must be greater than ₹0."); setResult(null); return; }
    setRunning(true);
    setError(null);
    setResult(null);
    try { setResult(await runLocalBacktest({ symbol, start: requestedConfig.start, end: requestedConfig.end, initialCapital })); }
    catch (requestError) { setResult(null); setError(requestError instanceof Error ? requestError.message : "Could not run the local backtest."); }
    finally { setRunning(false); }
  }, []);

  const handleRun = () => { void runBacktest(config); };

  useEffect(() => {
    const timer = window.setTimeout(() => { void runBacktest(defaultConfig); }, 0);
    return () => window.clearTimeout(timer);
  }, [runBacktest]); // Load the default, locally cached backtest once.

  const applyQuick = (symbol: string, strategy: string) => {
    setConfig((prev) => ({ ...prev, symbol, strategy }));
  };

  const netPnl = (result?.final_equity ?? config.initialCapital) - config.initialCapital;
  const netPnlTone = netPnl >= 0 ? "gain" : "loss";

  return (
    <div className="backtrack-page">
      <TopBar />

      <div className="backtrack-content">
        {/* Header */}
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker">
              <span className="live-dot" /> QUANT AGENT TERMINAL
            </div>
            <h1>Autonomous strategy validation engine.</h1>
            <p>
              Simulate trade logic across multi-year historical data using an
              orchestrated agent pipeline.
            </p>
          </div>
          <div className="bt-heading-actions">
            <span className="data-source">
              <Zap size={14} /> Local NSE daily cache
            </span>
          </div>
        </section>
        {error && <div className="bt-alert-error">{error}</div>}

        {/* Configuration Panel */}
        <div className="bt-panel setup-panel">
          <div className="quick-row">
            <span>Quick presets:</span>
            {quickConfigs.map((item) => (
              <button
                key={item.symbol}
                className="chip-btn"
                onClick={() => applyQuick(item.symbol, item.strategy)}
              >
                {item.symbol} · {item.strategy}
              </button>
            ))}
            <button
              className="reset-link"
              onClick={() => {
                setConfig(defaultConfig);
                void runBacktest(defaultConfig);
              }}
            >
              Reset defaults
            </button>
          </div>

          <div className="setup-fields">
            <div className="field-group">
              <label>Target Symbol</label>
              <SymbolCombobox value={config.symbol} onChange={(symbol) => setConfig({ ...config, symbol })} label="Target symbol" />
            </div>
            <div className="field-group field-strategy">
              <label>Strategy Rule</label>
              <input
                value={config.strategy}
                onChange={(e) =>
                  setConfig({ ...config, strategy: e.target.value })
                }
              />
            </div>
            <div className="field-group">
              <label>Timeframe</label>
              <select
                value={config.timeframe}
                onChange={(e) =>
                  setConfig({ ...config, timeframe: e.target.value })
                }
              >
                <option value="1day">1 Day (official NSE cache)</option>
              </select>
            </div>
          </div>

          <div className="secondary-fields">
            <div className="field-group">
              <label>Start Date</label>
              <input
                type="date"
                value={config.start}
                max={config.end}
                onChange={(e) =>
                  setConfig({ ...config, start: e.target.value })
                }
              />
            </div>
            <div className="field-group">
              <label>End Date</label>
              <input
                type="date"
                value={config.end}
                min={config.start}
                onChange={(e) => setConfig({ ...config, end: e.target.value })}
              />
            </div>
            <div className="field-group">
              <label>Initial Capital (₹)</label>
              <input
                type="number"
                value={config.initialCapital}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    initialCapital: Number(e.target.value),
                  })
                }
              />
            </div>
          </div>

          <button
            className="run-button"
            onClick={handleRun}
            disabled={running}
          >
            {running ? (
              <>Running Simulation…</>
            ) : (
              <>
                <Play size={16} /> Execute Backtest Pipeline
              </>
            )}
          </button>
        </div>

        {/* Metric Cards */}
        <div className="metric-grid">
          <MetricTile
            label="Net Profit"
            value={result ? formatINR(netPnl) : "—"}
            detail={result ? formatPct(result.metrics.total_return * 100) : "Run local backtest"}
            tone={netPnlTone}
            icon={<TrendingUp size={16} />}
          />
          <MetricTile
            label="Sharpe Ratio"
            value={result ? result.metrics.sharpe_ratio.toFixed(2) : "—"}
            detail="Risk Adjusted"
            tone="cyan"
            icon={<Gauge size={16} />}
          />
          <MetricTile
            label="Max Drawdown"
            value={result ? `${(result.metrics.max_drawdown * 100).toFixed(1)}%` : "—"}
            detail="Peak to Trough"
            tone="loss"
            icon={<ArrowDownRight size={16} />}
          />
          <MetricTile
            label="Win Rate"
            value={result ? `${(result.metrics.win_rate * 100).toFixed(1)}%` : "—"}
            detail={result ? `${result.metrics.total_trades} Trades` : "—"}
            tone="cyan"
            icon={<ShieldCheck size={16} />}
          />
          <MetricTile
            label="Profit Factor"
            value={result ? result.metrics.profit_factor.toFixed(2) : "—"}
            detail="Gross Win / Loss"
            tone="cyan"
            icon={<Activity size={16} />}
          />
          <MetricTile
            label="Ending Equity"
            value={result ? formatINR(result.final_equity) : "—"}
            detail={`Started: ${formatINR(config.initialCapital)}`}
            tone="gain"
            icon={<WalletCards size={16} />}
          />
        </div>

        {/* Equity Curve Chart */}
        <div className="bt-panel chart-panel">
          <div className="chart-head">
            <h2>Equity Curve &amp; Drawdown Benchmark</h2>
            <div className="chart-legend">
              <div className="legend-item">
                <span className="swatch-strategy" /> Strategy Equity
              </div>
            </div>
          </div>
          {result ? <EquityCurve data={result.equity_curve} initialCapital={config.initialCapital} /> : <p className="text-sm text-slate-500 p-8">No local result yet. Import the selected symbol and range, then run the backtest.</p>}
        </div>

        {/* Lower Grid: Swarm Agents + AI Summary */}
        <div className="lower-grid">
          <div className="bt-panel swarm-panel">
            <div className="bt-panel-head">
              <h2>Active Swarm Agents ({swarmAgents.length})</h2>
              <span className="tag-badge">Pipeline Active</span>
            </div>
            <div className="swarm-column">
              {swarmAgents.map((agent, index) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  index={index}
                  running={running}
                />
              ))}
            </div>
          </div>

          <div className="side-stack">
            <div className="bt-panel insight-panel">
              <div className="bt-panel-head">
                <h2>AI Executive Summary</h2>
                <Sparkles size={16} className="text-purple-600" />
              </div>
              <div className="insight-body">
                <p>
                  The <strong>{config.strategy}</strong> configuration on{" "}
                  <strong>{config.symbol}</strong> generated a net profit of{" "}
                  <strong>{result ? formatINR(netPnl) : "—"}</strong>{result ? ` (${formatPct(result.metrics.total_return * 100)}).` : "."}
                </p>
                <br />
                <p>
                  Risk exposure remained controlled with a max drawdown of{" "}
                  <strong>{result ? `${(result.metrics.max_drawdown * 100).toFixed(1)}%` : "—"}</strong> and Sharpe
                  ratio of <strong>{result ? result.metrics.sharpe_ratio.toFixed(2) : "—"}</strong>.
                </p>
              </div>
            </div>

            {/* Recent Trades Panel */}
            <div className="bt-panel table-panel">
              <div className="table-head">
                <h2>Execution Blotter</h2>
              </div>
              <table className="trade-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Return</th>
                    <th>P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {result?.trades.slice(0, 5).map((trade) => (
                    <tr key={trade.trade_id}>
                      <td>{trade.exit_date}</td>
                      <td>{trade.position}</td>
                      <td>{formatPct(trade.return_pct)}</td>
                      <td
                        className={
                          trade.pnl >= 0 ? "text-emerald-600" : "text-rose-600"
                        }
                      >
                        {formatINR(trade.pnl)}
                      </td>
                    </tr>
                  ))}
                  {result && result.trades.length === 0 && <tr><td colSpan={4} className="text-slate-500">No closed trades in this range. Try a wider range or another symbol.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
