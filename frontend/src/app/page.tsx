"use client";

import { useEffect, useState } from "react";
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
  runSwarmBacktest,
  swarmAgents,
  type BacktestConfig,
} from "@/lib/agents/orchestrator";
import type { AgentSnapshot } from "@/lib/agents/types";

const defaultConfig: BacktestConfig = {
  symbol: "NIFTY 50",
  strategy: "RSI + EMA trend",
  timeframe: "1D",
  start: "2021-01-01",
  end: "2024-12-31",
  initialCapital: 100000,
  commissionBps: 10,
};

const quickConfigs: Array<Pick<BacktestConfig, "symbol" | "strategy">> = [
  { symbol: "NIFTY 50", strategy: "RSI + EMA trend" },
  { symbol: "BANKNIFTY", strategy: "MACD momentum" },
  { symbol: "RELIANCE", strategy: "Bollinger mean reversion" },
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
  data: Array<{ date: string; strategy: number; benchmark: number }>;
  initialCapital: number;
}) {
  const width = 960;
  const height = 270;
  const left = 58;
  const right = 12;
  const top = 12;
  const bottom = 30;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = data.flatMap((point) => [point.strategy, point.benchmark]);
  const min = Math.min(...values, initialCapital) * 0.96;
  const max = Math.max(...values, initialCapital) * 1.04;

  const xFor = (index: number) =>
    left + (index / Math.max(data.length - 1, 1)) * plotWidth;
  const yFor = (value: number) =>
    top + ((max - value) / Math.max(max - min, 1)) * plotHeight;

  const pathFor = (key: "strategy" | "benchmark") =>
    data
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"} ${xFor(index).toFixed(1)} ${yFor(
            point[key]
          ).toFixed(1)}`
      )
      .join(" ");

  const strategyPath = pathFor("strategy");
  const strategyArea = `${strategyPath} L ${xFor(data.length - 1).toFixed(
    1
  )} ${(top + plotHeight).toFixed(1)} L ${left} ${(top + plotHeight).toFixed(
    1
  )} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto overflow-visible"
    >
      <defs>
        <linearGradient id="strategyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Area fill under Strategy Curve */}
      <path d={strategyArea} fill="url(#strategyGrad)" />

      {/* Grid Lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const y = top + plotHeight * pct;
        const val = max - (max - min) * pct;
        return (
          <g key={pct}>
            <line
              x1={left}
              y1={y}
              x2={width - right}
              y2={y}
              stroke="#e2e8f0"
              strokeDasharray="4 4"
            />
            <text
              x={left - 8}
              y={y + 4}
              fill="#94a3b8"
              fontSize="10"
              textAnchor="end"
              fontFamily="var(--font-jetbrains)"
            >
              ₹{Math.round(val).toLocaleString()}
            </text>
          </g>
        );
      })}

      {/* Benchmark Line */}
      <path
        d={pathFor("benchmark")}
        fill="none"
        stroke="#0ea5e9"
        strokeWidth="2"
        strokeDasharray="4 4"
      />

      {/* Strategy Line */}
      <path
        d={strategyPath}
        fill="none"
        stroke="#4f46e5"
        strokeWidth="2.5"
      />
    </svg>
  );
}

export default function DashboardPage() {
  const [config, setConfig] = useState<BacktestConfig>(defaultConfig);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(() => runSwarmBacktest(defaultConfig));

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => {
      setResult(runSwarmBacktest(config));
      setRunning(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [running, config]);

  const handleRun = () => setRunning(true);

  const applyQuick = (symbol: string, strategy: string) => {
    setConfig((prev) => ({ ...prev, symbol, strategy }));
    setRunning(true);
  };

  const netPnl = result.finalValue - config.initialCapital;
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
              <Zap size={14} /> FastAPI Engine v2.4
            </span>
          </div>
        </section>

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
                setResult(runSwarmBacktest(defaultConfig));
              }}
            >
              Reset defaults
            </button>
          </div>

          <div className="setup-fields">
            <div className="field-group">
              <label>Target Symbol</label>
              <input
                value={config.symbol}
                onChange={(e) =>
                  setConfig({ ...config, symbol: e.target.value })
                }
              />
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
                <option value="1D">1 Day (Daily)</option>
                <option value="1H">1 Hour</option>
                <option value="15m">15 Mins</option>
              </select>
            </div>
          </div>

          <div className="secondary-fields">
            <div className="field-group">
              <label>Start Date</label>
              <input
                type="date"
                value={config.start}
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
            value={formatINR(netPnl)}
            detail={formatPct(result.netReturn)}
            tone={netPnlTone}
            icon={<TrendingUp size={16} />}
          />
          <MetricTile
            label="Sharpe Ratio"
            value={result.sharpe.toFixed(2)}
            detail="Risk Adjusted"
            tone="cyan"
            icon={<Gauge size={16} />}
          />
          <MetricTile
            label="Max Drawdown"
            value={`${result.maxDrawdown.toFixed(1)}%`}
            detail="Peak to Trough"
            tone="loss"
            icon={<ArrowDownRight size={16} />}
          />
          <MetricTile
            label="Win Rate"
            value={`${(result.winRate * 100).toFixed(1)}%`}
            detail={`${result.trades.length} Trades`}
            tone="cyan"
            icon={<ShieldCheck size={16} />}
          />
          <MetricTile
            label="Profit Factor"
            value={result.profitFactor.toFixed(2)}
            detail="Gross Win / Loss"
            tone="cyan"
            icon={<Activity size={16} />}
          />
          <MetricTile
            label="Ending Equity"
            value={formatINR(result.finalValue)}
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
              <div className="legend-item">
                <span className="swatch-benchmark" /> Benchmark (Buy &amp; Hold)
              </div>
            </div>
          </div>
          <EquityCurve
            data={result.equity}
            initialCapital={config.initialCapital}
          />
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
                  <strong>{formatINR(netPnl)}</strong> (
                  {formatPct(result.netReturn)}).
                </p>
                <br />
                <p>
                  Risk exposure remained controlled with a max drawdown of{" "}
                  <strong>{result.maxDrawdown.toFixed(1)}%</strong> and Sharpe
                  ratio of <strong>{result.sharpe.toFixed(2)}</strong>.
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
                  {result.trades.slice(0, 5).map((trade) => (
                    <tr key={trade.id}>
                      <td>{trade.exit}</td>
                      <td>{trade.side}</td>
                      <td>{formatPct(trade.returnPct)}</td>
                      <td
                        className={
                          trade.pnl >= 0 ? "text-emerald-600" : "text-rose-600"
                        }
                      >
                        {formatINR(trade.pnl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
