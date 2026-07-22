"use client";

import { useState } from "react";
import TopBar from "@/components/layout/TopBar";
import { TrendingUp, Scale, AlertTriangle, Eye, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ExperimentComparisonPage() {
  const [selectedBaseline, setSelectedBaseline] = useState("EXP-9900");

  const comparisonData = [
    { id: "EXP-9942", title: "Momentum Alpha V4", cagr: 24.2, cagrDiff: 5.7, sharpe: 1.82, sharpeDiff: 0.17, sortino: 2.45, sortinoDiff: 0.35, maxDd: -14.8, maxDdDiff: -2.4, profitFactor: 1.52, pfDiff: 0.07, trades: 1412, robustness: "78/100" },
    { id: "EXP-9915", title: "Mean Reversion V2", cagr: 16.1, cagrDiff: -2.4, sharpe: 1.48, sharpeDiff: -0.17, sortino: 1.95, sortinoDiff: -0.15, maxDd: -11.2, maxDdDiff: 1.2, profitFactor: 1.41, pfDiff: -0.04, trades: 980, robustness: "86/100" },
    { id: "EXP-9938", title: "RSI+EMA Filtered", cagr: 21.5, cagrDiff: 3.0, sharpe: 2.14, sharpeDiff: 0.49, sortino: 2.98, sortinoDiff: 0.88, maxDd: -9.5, maxDdDiff: 2.9, profitFactor: 1.65, pfDiff: 0.20, trades: 1105, robustness: "91/100", highlight: true },
    { id: "EXP-9921", title: "Breakout Trend V1", cagr: 14.8, cagrDiff: -3.7, sharpe: 1.75, sharpeDiff: 0.10, sortino: 2.20, sortinoDiff: 0.10, maxDd: -8.4, maxDdDiff: 4.0, profitFactor: 1.55, pfDiff: 0.10, trades: 850, robustness: "95/100" },
  ];

  return (
    <div className="backtrack-page">
      <TopBar />

      <div className={cn("backtrack-content", "bt-stack")}>
        {/* Page Header */}
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker"><span className="live-dot" /> 03 / EXPERIMENT MATRIX</div>
            <h1>Cross-sectional experiment analysis.</h1>
            <p>Compare multi-parameter backtest runs over the 2018-2023 dataset. Variances calculated against baseline.</p>
          </div>
          <div className="bt-heading-actions">
            <span className="data-source"><Scale size={14} /> Baseline: EXP-9900</span>
          </div>
        </section>
        
        {/* Bento Grid: Aggregate Insights */}
        <div className="bt-kpi-grid">
          <div className="bt-stat-card mint">
            <span>Highest Return</span>
            <strong>24.2%</strong>
            <small>CAGR · EXP-9942</small>
            <TrendingUp />
          </div>

          <div className="bt-stat-card blue">
            <span>Best Risk Adj.</span>
            <strong>2.14</strong>
            <small>Sharpe · EXP-9938</small>
            <Scale />
          </div>

          <div className="bt-stat-card rose">
            <span>Lowest Drawdown</span>
            <strong>-8.4%</strong>
            <small>Max DD · EXP-9921</small>
            <AlertTriangle />
          </div>

          <div className="bt-stat-card violet">
            <span>Convergence</span>
            <strong>32 Runs</strong>
            <small>Optimal Grid Achieved</small>
            <Scale />
          </div>
        </div>

        {/* Run Metrics Matrix Table */}
        <section className="bt-panel" style={{ padding: 0 }}>
          <div className="bt-panel-head" style={{ padding: '14px 24px', borderBottom: '1px solid #e2e8f0' }}>
            <div>
              <span className="bt-eyebrow">MATRIX</span>
              <h2>Run metrics comparison</h2>
            </div>
            {/* Baseline Select */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="bt-field-label" style={{ marginBottom: 0 }}>Baseline:</span>
              <select
                className="bt-sort-select"
                value={selectedBaseline}
                onChange={(e) => setSelectedBaseline(e.target.value)}
              >
                <option value="EXP-9900">EXP-9900 (Default)</option>
                <option value="EXP-9921">EXP-9921</option>
                <option value="EXP-9938">EXP-9938</option>
              </select>
            </div>
          </div>

          <div className="bt-table-wrap">
            <table className="bt-table">
              <thead>
                <tr>
                  <th>Experiment ID</th>
                  <th className="right">CAGR</th>
                  <th className="right">Sharpe</th>
                  <th className="right">Sortino</th>
                  <th className="right">Max DD</th>
                  <th className="right">Profit Factor</th>
                  <th className="right">Trades</th>
                  <th className="right">Robustness</th>
                  <th className="center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {/* Baseline Row */}
                <tr className="baseline">
                  <td style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#94a3b8' }} />
                    <span>EXP-9900</span>
                    <span className="bt-baseline-badge">Base</span>
                  </td>
                  <td className="right">18.5%</td>
                  <td className="right">1.65</td>
                  <td className="right">2.10</td>
                  <td className="right">-12.4%</td>
                  <td className="right">1.45</td>
                  <td className="right">1,245</td>
                  <td className="right">82/100</td>
                  <td className="center">
                    <button className="bt-row-action view">
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
                {/* Data Rows */}
                {comparisonData.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(row.highlight ? "highlight" : "")}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: row.highlight ? '#4f46e5' : '#cbd5e1' }} />
                        <span className={cn(row.highlight ? "bt-run-id" : "")} style={!row.highlight ? { fontWeight: 'bold' } : undefined}>{row.id}</span>
                        <span className="bt-val-muted">({row.title})</span>
                      </div>
                    </td>
                    <td className="right">
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 600 }}>{row.cagr}%</span>
                        <span className={cn("bt-diff", row.cagrDiff >= 0 ? "up" : "down")}>
                          {row.cagrDiff >= 0 ? "+" : ""}{row.cagrDiff}%
                        </span>
                      </div>
                    </td>
                    <td className="right">
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={row.highlight ? { color: '#4f46e5', fontWeight: 'bold' } : { fontWeight: 600 }}>{row.sharpe}</span>
                        <span className={cn("bt-diff", row.sharpeDiff >= 0 ? "up" : "down")}>
                          {row.sharpeDiff >= 0 ? "+" : ""}{row.sharpeDiff}
                        </span>
                      </div>
                    </td>
                    <td className="right">
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={row.highlight ? { color: '#4f46e5', fontWeight: 'bold' } : { fontWeight: 600 }}>{row.sortino}</span>
                        <span className={cn("bt-diff", row.sortinoDiff >= 0 ? "up" : "down")}>
                          {row.sortinoDiff >= 0 ? "+" : ""}{row.sortinoDiff}
                        </span>
                      </div>
                    </td>
                    <td className="right">
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 600 }}>{row.maxDd}%</span>
                        <span className={cn("bt-diff", row.maxDdDiff >= 0 ? "up" : "down")}>
                          {row.maxDdDiff >= 0 ? "+" : ""}{row.maxDdDiff}%
                        </span>
                      </div>
                    </td>
                    <td className="right">
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 600 }}>{row.profitFactor}</span>
                        <span className={cn("bt-diff", row.pfDiff >= 0 ? "up" : "down")}>
                          {row.pfDiff >= 0 ? "+" : ""}{row.pfDiff}
                        </span>
                      </div>
                    </td>
                    <td className="right" style={{ fontWeight: 500 }}>{row.trades}</td>
                    <td className="right">
                      <span className="bt-val-indigo">{row.robustness}</span>
                    </td>
                    <td className="center">
                      <button className="bt-row-action view">
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
