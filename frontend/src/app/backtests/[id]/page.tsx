"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Download,
  List,
  ScanLine,
  Shield,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { BiasCheckBadge } from "@/components/ui/Badges";
import { DrawdownChart, EquityChart } from "@/components/charts/Charts";
import { mockBacktestResult, mockDrawdownData, mockEquityCurve } from "@/lib/mock-data";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

const TABS = [
  { id: "equity", label: "Equity Curve", icon: Activity },
  { id: "drawdown", label: "Drawdown", icon: TrendingDown },
  { id: "trades", label: "Trades", icon: List },
  { id: "bias", label: "Bias Detection", icon: ScanLine },
];

export default function BacktestResultPage() {
  const [activeTab, setActiveTab] = useState("equity");
  const result = mockBacktestResult;
  const m = result.metrics;
  const metrics = [
    { label: "Total Return", value: formatPercent(m.totalReturn), tone: "gain" },
    { label: "CAGR", value: formatPercent(m.cagr), tone: "gain" },
    { label: "Sharpe Ratio", value: formatNumber(m.sharpeRatio), tone: "primary" },
    { label: "Sortino Ratio", value: formatNumber(m.sortinoRatio), tone: "primary" },
    { label: "Max Drawdown", value: formatPercent(m.maxDrawdown), tone: "loss" },
    { label: "Win Rate", value: `${m.winRate}%`, tone: "gain" },
    { label: "Profit Factor", value: formatNumber(m.profitFactor), tone: "primary" },
    { label: "Trade Count", value: String(m.tradeCount), tone: "neutral" },
  ];

  return (
    <div className="backtrack-page">
      <TopBar />

      <main className="backtrack-content bt-run-detail">
        <section className="bt-run-header" aria-label="Backtest summary">
          <Link href="/backtests" aria-label="Back to backtest runs" className="bt-run-back">
            <ArrowLeft size={17} />
          </Link>
          <div className="bt-run-title-group">
            <h1>{result.name}</h1>
            <div className="bt-run-meta">
              <span className="bt-run-id">{result.id}</span><i>•</i>
              <span className="bt-run-status">{result.status}</span><i>•</i>
              <span>{result.runDuration}</span><i>•</i>
              <span>{result.dateRange}</span><i>•</i>
              <span>{result.symbols} · {result.exchange} · {result.timeframe}</span>
            </div>
          </div>
          <button type="button" onClick={() => window.print()} className="bt-run-export">
            <Download size={14} /> Export
          </button>
        </section>

        <section className="bt-run-metrics" aria-label="Backtest performance metrics">
          {metrics.map((metric) => (
            <div key={metric.label} className="bt-run-metric">
              <span>{metric.label}</span>
              <strong className={`bt-run-metric-${metric.tone}`}>{metric.value}</strong>
            </div>
          ))}
        </section>

        <div className="bt-run-layout">
          <section className="bt-run-workspace" aria-label="Backtest results">
            <div className="bt-run-chart-panel">
              <nav className="bt-run-tabs" aria-label="Backtest result views">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    type="button"
                    key={id}
                    aria-pressed={activeTab === id}
                    onClick={() => setActiveTab(id)}
                    className={cn("bt-run-tab", activeTab === id && "is-active")}
                  >
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </nav>

              <div className="bt-run-chart-content">
                {activeTab === "equity" && (
                  <>
                    <div className="bt-run-chart-caption">
                      <span>Strategy: <b>{formatCurrency(mockEquityCurve.at(-1)?.strategy ?? 0)}</b></span>
                      <span>Buy &amp; Hold: {formatCurrency(mockEquityCurve.at(-1)?.benchmark ?? 0)}</span>
                    </div>
                    <EquityChart data={mockEquityCurve} height={286} />
                  </>
                )}
                {activeTab === "drawdown" && (
                  <>
                    <p className="bt-run-chart-caption">Maximum Drawdown: <b className="text-rose-600">{formatPercent(m.maxDrawdown)}</b> · Duration: <b>~43 days</b></p>
                    <DrawdownChart data={mockDrawdownData} height={286} />
                  </>
                )}
                {activeTab === "trades" && <TradesView />}
                {activeTab === "bias" && <BiasView />}
              </div>
            </div>

            <div className="bt-run-actions" aria-label="Further backtest analysis">
              {[
                ["Parameter Sensitivity", "indigo"],
                ["Monte Carlo", "purple"],
                ["Walk-Forward Test", "green"],
                ["Export Report", "slate"],
              ].map(([label, tone]) => <button type="button" className={`bt-run-action ${tone}`} key={label}>{label}</button>)}
            </div>
          </section>

          <aside className="bt-run-analysis" aria-label="AI analysis">
            <div className="bt-run-analysis-title"><Sparkles size={19} /><h2>AI Analysis</h2></div>
            <ol className="bt-run-insights">
              {result.aiAnalysis.map((insight, index) => (
                <li key={insight}><span>{index + 1}</span><p>{insight}</p></li>
              ))}
            </ol>
            <div className="bt-run-stats">
              <h3>Additional Stats</h3>
              {[
                ["Calmar Ratio", formatNumber(m.calmarRatio), "primary"],
                ["Volatility (Ann.)", `${m.annualizedVolatility}%`, ""],
                ["Exposure", `${m.exposure}%`, ""],
                ["Expectancy", formatCurrency(m.expectancy), "gain"],
                ["Turnover", `${m.turnover.toFixed(1)}x/yr`, ""],
              ].map(([label, value, tone]) => <div key={label}><span>{label}</span><b className={tone}>{value}</b></div>)}
            </div>
            <div className="bt-run-bias-summary">
              <h3><Shield size={14} /> Bias Checks</h3>
              {result.biasChecks.map((check) => <div key={check.name}><span>{check.name}</span><b className={check.status.toLowerCase()}>{check.status}</b></div>)}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function TradesView() {
  const m = mockBacktestResult.metrics;
  const trades = Array.from({ length: 8 }, (_, index) => {
    const won = (index * 7) % 10 > 3;
    return { id: index + 1, won, holdingDays: 2 + (index * 3) % 7, pnl: won ? 1200 + (index * 150) % 800 : -(300 + (index * 90) % 600) };
  });
  return <div className="bt-run-trades">
    <div className="bt-run-trade-kpis">
      {[["Avg Winner", `+${formatCurrency(m.avgWinner)}`, "gain"], ["Avg Loser", formatCurrency(m.avgLoser), "loss"], ["Payoff Ratio", formatNumber(m.payoffRatio), "primary"], ["Avg Hold", `${m.avgHoldingDays}d`, ""]].map(([label, value, tone]) => <div key={label}><span>{label}</span><b className={tone}>{value}</b></div>)}
    </div>
    <div className="bt-run-trade-table">{trades.map((trade) => <div key={trade.id}><span>#{String(trade.id).padStart(3, "0")}</span><b>NIFTY 50</b><span>{trade.holdingDays}d</span><strong className={trade.won ? "gain" : "loss"}>{trade.won ? "+" : ""}{formatCurrency(trade.pnl)}</strong></div>)}</div>
  </div>;
}

function BiasView() {
  const result = mockBacktestResult;
  return <div className="bt-run-bias-view">
    <p>Automated checks validate the configuration and data assumptions before you rely on the result.</p>
    {result.biasChecks.map((check) => <BiasCheckBadge key={check.name} name={check.name} status={check.status} />)}
    <div className="bt-run-warning"><AlertTriangle size={16} /><span>{result.warnings[0]}</span></div>
  </div>;
}
