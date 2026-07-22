"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Shield,
  AlertTriangle,
  Download,
  Activity,
  BarChart2,
  List,
  ScanLine,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { MetricCard } from "@/components/ui/Cards";
import { BiasCheckBadge } from "@/components/ui/Badges";
import { EquityChart, DrawdownChart } from "@/components/charts/Charts";
import {
  mockBacktestResult,
  mockEquityCurve,
  mockDrawdownData,
} from "@/lib/mock-data";
import { formatPercent, formatNumber, formatCurrency, cn } from "@/lib/utils";

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

  return (
    <div className="backtrack-page">
      <TopBar />

      <div className="backtrack-content space-y-6">
        {/* ── Header ── */}
        <div className="bg-white border border-slate-200 shadow-xs rounded-xl p-5 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/backtests"
              className="p-2 rounded-xl transition-all border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="font-heading font-extrabold text-slate-900 text-lg">{result.name}</h1>
              <div className="flex items-center gap-3 mt-1 text-xs flex-wrap font-mono font-bold text-slate-500">
                <span className="text-indigo-600">
                  {result.id}
                </span>
                <span>·</span>
                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 tracking-wide font-mono uppercase text-[10px]">
                  COMPLETED
                </span>
                <span>·</span>
                <span>{result.runDuration}</span>
                <span>·</span>
                <span>{result.dateRange}</span>
                <span>·</span>
                <span>{result.symbols} · {result.exchange} · {result.timeframe}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 transition-all bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs">
              <Download size={14} /> Export
            </button>
          </div>
        </div>

        {/* ── Metrics Grid ── */}
        <div className="grid grid-cols-4 gap-4">
          <MetricCard label="Total Return" value={formatPercent(m.totalReturn)} color="gain" size="md" />
          <MetricCard label="CAGR" value={formatPercent(m.cagr)} color="gain" size="md" />
          <MetricCard label="Sharpe Ratio" value={formatNumber(m.sharpeRatio)} color="cyan" size="md" />
          <MetricCard label="Sortino Ratio" value={formatNumber(m.sortinoRatio)} color="cyan" size="md" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          <MetricCard label="Max Drawdown" value={formatPercent(m.maxDrawdown)} color="loss" size="md" />
          <MetricCard label="Win Rate" value={`${m.winRate}%`} color="gain" size="md" />
          <MetricCard label="Profit Factor" value={formatNumber(m.profitFactor)} color="cyan" size="md" />
          <MetricCard label="Trade Count" value={m.tradeCount.toString()} color="white" size="md" />
        </div>

        {/* ── Main content + AI sidebar ── */}
        <div className="grid grid-cols-3 gap-4">
          {/* Chart area */}
          <div className="col-span-2 space-y-4">
            {/* Tabs */}
            <div className="bg-white border border-slate-200 shadow-xs rounded-xl overflow-hidden">
              <div className="flex border-b border-slate-200 bg-slate-50/50">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={cn(
                      "flex items-center gap-2 px-5 py-3.5 text-xs font-bold uppercase font-mono tracking-wider transition-all border-b-2",
                      activeTab === id
                        ? "text-indigo-600 border-indigo-600 bg-indigo-50/50"
                        : "border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                    )}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>

              <div className="p-6">
                {activeTab === "equity" && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4 text-xs font-mono font-semibold">
                        <span className="text-emerald-700">
                          ━ Strategy: {formatCurrency(mockEquityCurve[mockEquityCurve.length - 1].strategy)}
                        </span>
                        <span className="text-slate-500">
                          - - Buy &amp; Hold: {formatCurrency(mockEquityCurve[mockEquityCurve.length - 1].benchmark)}
                        </span>
                      </div>
                    </div>
                    <EquityChart data={mockEquityCurve} height={260} />
                  </div>
                )}
                {activeTab === "drawdown" && (
                  <div>
                    <p className="text-xs mb-4 text-slate-500 font-mono">
                      Maximum Drawdown: <span className="text-rose-600 font-bold">
                        {formatPercent(m.maxDrawdown)}
                      </span> · Duration: <span className="font-bold text-slate-800">~43 days</span>
                    </p>
                    <DrawdownChart data={mockDrawdownData} height={260} />
                  </div>
                )}
                {activeTab === "trades" && (
                  <div>
                    <div className="grid grid-cols-4 gap-4 mb-6">
                      {[
                        { label: "Avg Winner", val: `+${formatCurrency(m.avgWinner)}`, colorClass: "text-emerald-700 font-bold" },
                        { label: "Avg Loser", val: formatCurrency(m.avgLoser), colorClass: "text-rose-600 font-bold" },
                        { label: "Payoff Ratio", val: formatNumber(m.payoffRatio), colorClass: "text-indigo-600 font-bold" },
                        { label: "Avg Hold", val: `${m.avgHoldingDays}d`, colorClass: "text-slate-800 font-bold" },
                      ].map(({ label, val, colorClass }) => (
                        <div key={label} className="text-center p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                          <div className="text-[10px] mb-1 text-slate-500 font-bold font-mono uppercase">{label}</div>
                          <div className={cn("font-mono text-sm", colorClass)}>{val}</div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2 max-h-48 overflow-auto pr-2 custom-scrollbar">
                      {Array.from({ length: 12 }, (_, i) => {
                        const isWin = (i * 7) % 10 > 3;
                        const pnl = isWin ? (1200 + (i * 150) % 800) : -(300 + (i * 90) % 600);
                        const holdingDays = 2 + (i * 3) % 7;
                        return (
                          <div key={i} className="flex items-center justify-between px-4 py-2.5 rounded-xl text-xs bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors">
                            <span className="font-mono font-bold text-slate-400">
                              #{String(i + 1).padStart(3, "0")}
                            </span>
                            <span className="text-slate-900 font-bold">NIFTY 50</span>
                            <span className="text-slate-500 font-mono">
                              {holdingDays}d
                            </span>
                            <span className={cn("font-mono font-bold", isWin ? "text-emerald-700" : "text-rose-600")}>
                              {isWin ? "+" : ""}{formatCurrency(pnl)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {activeTab === "bias" && (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600">
                      Automated bias detection checks performed against the backtest configuration and data.
                    </p>
                    <div className="space-y-2">
                      {result.biasChecks.map((check) => (
                        <BiasCheckBadge key={check.name} name={check.name} status={check.status} />
                      ))}
                    </div>
                    {result.warnings.length > 0 && (
                      <div className="mt-4 p-4 rounded-xl flex gap-3 bg-amber-50 border border-amber-200 text-amber-900">
                        <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs leading-relaxed font-medium">
                          {result.warnings[0]}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 flex-wrap font-mono">
              {[
                { label: "Parameter Sensitivity", classes: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100" },
                { label: "Monte Carlo", classes: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100" },
                { label: "Walk-Forward Test", classes: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
                { label: "Export Report", classes: "bg-white text-slate-700 border-slate-200 hover:bg-slate-50" },
              ].map(({ label, classes }) => (
                <button
                  key={label}
                  className={cn("px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border shadow-2xs uppercase tracking-wider", classes)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* AI Analysis Sidebar */}
          <div className="bg-white border border-slate-200 shadow-xs rounded-xl p-6 flex flex-col gap-5 border-l-4 border-l-indigo-600">
            <div className="flex items-center gap-2.5">
              <Sparkles size={18} className="text-indigo-600" />
              <h2 className="font-heading font-extrabold text-slate-900 text-lg">AI Analysis</h2>
            </div>

            <ul className="space-y-4 flex-1">
              {result.aiAnalysis.map((insight, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs mt-0.5 bg-indigo-50 text-indigo-700 font-mono font-bold border border-indigo-200">
                    {i + 1}
                  </span>
                  <p className="text-xs leading-relaxed text-slate-600 font-medium">
                    {insight}
                  </p>
                </li>
              ))}
            </ul>

            {/* Additional metrics */}
            <div className="border-t border-slate-100 pt-4 space-y-2.5 font-mono">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Additional Stats
              </h3>
              {[
                { label: "Calmar Ratio", val: formatNumber(m.calmarRatio), colorClass: "text-indigo-600 font-bold" },
                { label: "Volatility (Ann.)", val: `${m.annualizedVolatility}%`, colorClass: "text-slate-800 font-bold" },
                { label: "Exposure", val: `${m.exposure}%`, colorClass: "text-slate-800 font-bold" },
                { label: "Expectancy", val: formatCurrency(m.expectancy), colorClass: "text-emerald-700 font-bold" },
                { label: "Turnover", val: `${m.turnover.toFixed(1)}x/yr`, colorClass: "text-slate-800 font-bold" },
              ].map(({ label, val, colorClass }) => (
                <div key={label} className="flex justify-between text-xs">
                  <span className="text-slate-500 font-medium">{label}</span>
                  <span className={cn("font-mono", colorClass)}>{val}</span>
                </div>
              ))}
            </div>

            {/* Bias summary */}
            <div className="rounded-xl p-4 space-y-2.5 bg-slate-50 border border-slate-200 font-mono">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                <Shield size={14} className="text-indigo-600" />
                Bias Checks
              </div>
              {result.biasChecks.map((check) => (
                <div key={check.name} className="flex justify-between text-xs">
                  <span className="text-slate-500 font-medium">{check.name}</span>
                  <span className={cn(
                    "font-mono font-bold tracking-wide text-[10px]",
                    check.status === "PASS" ? "text-emerald-700" : check.status === "WARN" ? "text-amber-700" : "text-rose-600"
                  )}>
                    {check.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
