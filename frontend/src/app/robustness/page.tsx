"use client";

import { useState } from "react";
import TopBar from "@/components/layout/TopBar";
import { TrendingUp, Award, Activity } from "lucide-react";

export default function RobustnessPage() {
  // Mock data matching the design spec
  const robustnessScore = 78;
  const paramStability = 82;
  const oosDegradation = 71;
  const stressResilience = 81;

  const stressScenarios = [
    { name: "Transaction Costs (2x)", baseCagr: 14.2, stressedCagr: 9.8, baseDd: -18.5, stressedDd: -22.1, status: "PASS" },
    { name: "Slippage (+5bps)", baseCagr: 14.2, stressedCagr: 12.1, baseDd: -18.5, stressedDd: -19.8, status: "PASS" },
    { name: "Execution Delay (+100ms)", baseCagr: 14.2, stressedCagr: 2.4, baseDd: -18.5, stressedDd: -45.2, status: "FAIL" },
  ];

  // Lookback vs Threshold mock heatmap grid (10 columns, 4 rows)
  const heatmapData = [
    [0.1, 0.2, 0.5, 0.6, 0.8, 0.9, 0.7, 0.4, 0.2, 0.1],
    [0.2, 0.3, 0.6, 0.8, 0.95, 0.9, 0.6, 0.5, 0.3, 0.2],
    [0.1, 0.2, 0.4, 0.7, 0.85, 0.8, 0.5, 0.3, 0.1, 0.05],
    [0.05, 0.1, 0.3, 0.5, 0.6, 0.5, 0.3, 0.2, 0.05, 0.01],
  ];

  return (
    <div className="backtrack-page">
      <TopBar />
      <div className="backtrack-content bt-stack">
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker"><span className="live-dot" /> 05 / ROBUSTNESS SUITE</div>
            <h1>Strategy stability &amp; stress analysis.</h1>
            <p>Analyze parameter heatmaps, Walk-Forward Out-Of-Sample degradation, and Monte Carlo resampling.</p>
          </div>
          <div className="bt-heading-actions">
            <span className="data-source"><TrendingUp size={14} /> Monte Carlo N=1,000</span>
          </div>
        </section>

        {/* Top row: Score card + Heatmap */}
        <div className="bt-grid-12">
          {/* Score card */}
          <div className="bt-col-4 bt-panel bt-score-card">
            <div>
              <span className="bt-eyebrow">AGGREGATE ROBUSTNESS</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: '12px' }}>
                <span className="bt-score-number">{robustnessScore}</span>
                <span className="bt-score-denom">/100</span>
              </div>
            </div>
            <div className="bt-score-rows">
              <div className="bt-score-row">
                <span>Parameter Stability</span>
                <span>{paramStability}</span>
              </div>
              <div className="bt-score-row">
                <span>OOS Degradation</span>
                <span>{oosDegradation}</span>
              </div>
              <div className="bt-score-row">
                <span>Stress Resilience</span>
                <span>{stressResilience}</span>
              </div>
            </div>
          </div>

          {/* Heatmap */}
          <div className="bt-col-8 bt-panel bt-heatmap-panel">
            <div className="bt-panel-head" style={{ marginBottom: '16px' }}>
              <div>
                <span className="bt-eyebrow">PARAMETER SENSITIVITY</span>
                <h2>Lookback vs Threshold</h2>
              </div>
              <div className="bt-heatmap-legend">
                <span>Sharpe Ratio</span>
                <div className="bt-heatmap-gradient" />
              </div>
            </div>
            <div className="bt-heatmap-area">
              <div className="bt-heatmap-y">
                <span>0.8</span>
                <span>0.6</span>
                <span>0.4</span>
                <span>0.2</span>
              </div>
              <div className="bt-heatmap-grid">
                {heatmapData.map((row, rIndex) =>
                  row.map((val, cIndex) => {
                    let cellClass = 'bt-heatmap-cell neutral';
                    if (val > 0.9) cellClass = 'bt-heatmap-cell high-strong';
                    else if (val > 0.7) cellClass = 'bt-heatmap-cell high-mid';
                    else if (val > 0.4) cellClass = 'bt-heatmap-cell mid';
                    else if (val < 0.05) cellClass = 'bt-heatmap-cell low-strong';
                    else if (val < 0.2) cellClass = 'bt-heatmap-cell low-mid';
                    
                    return (
                      <div
                        key={`${rIndex}-${cIndex}`}
                        className={cellClass}
                        title={`Value: ${val}`}
                      />
                    );
                  })
                )}
              </div>
              <div className="bt-heatmap-x">
                <span>10d</span>
                <span>20d</span>
                <span>30d</span>
                <span>40d</span>
                <span>50d</span>
              </div>
            </div>
            <p className="bt-heatmap-note">Red indicates sensitivity parameter cliff.</p>
          </div>
        </div>

        {/* Charts row */}
        <div className="bt-grid-2">
          {/* Walk-forward */}
          <div className="bt-panel bt-wf-panel">
            <p className="bt-wf-title">Walk-Forward Performance (IS vs OOS)</p>
            <div className="bt-wf-chart">
              <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                <path d="M 0,90 Q 20,80 40,60 T 60,30 T 100,10" fill="none" stroke="#38bdf8" strokeDasharray="3 3" strokeWidth="2.5"></path>
                <path d="M 0,90 Q 20,85 40,70 T 60,50 T 100,40" fill="none" stroke="#4f46e5" strokeWidth="3"></path>
              </svg>
            </div>
            <div className="bt-wf-legend">
              <div className="bt-wf-legend-item"><span className="bt-wf-is-line" />In-Sample</div>
              <div className="bt-wf-legend-item"><span className="bt-wf-oos-line" />Out-of-Sample</div>
            </div>
          </div>

          {/* Monte Carlo */}
          <div className="bt-panel bt-mc-panel">
            <p className="bt-mc-title">Monte Carlo Return Distribution (n=10,000)</p>
            <div className="bt-mc-bars">
              {[5, 12, 25, 45, 68, 85, 95, 75, 50, 30, 15, 8, 3].map((h, idx) => (
                <div key={idx} className={`bt-mc-bar${idx === 6 ? ' peak' : ''}`} style={{ height: `${h}%` }} />
              ))}
            </div>
            <div className="bt-mc-footer">
              <span>-15%</span>
              <span className="bt-mc-mean">Mean: 12.4%</span>
              <span>+45%</span>
            </div>
          </div>
        </div>

        {/* Stress tests table */}
        <div className="bt-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="bt-panel-head" style={{ padding: '14px 24px', borderBottom: '1px solid #e2e8f0' }}>
            <div><span className="bt-eyebrow">STRESS TESTS</span><h2>Perturbations</h2></div>
          </div>
          <div className="bt-table-wrap">
            <table className="bt-table">
              <thead>
                <tr>
                  <th className="left">Scenario Vector</th>
                  <th className="right">Base CAGR</th>
                  <th className="right">Stressed CAGR</th>
                  <th className="right">Base Max DD</th>
                  <th className="right">Stressed Max DD</th>
                  <th className="center">Status</th>
                </tr>
              </thead>
              <tbody>
                {stressScenarios.map((sc, i) => (
                  <tr key={i}>
                    <td>{sc.name}</td>
                    <td className="right">{sc.baseCagr}%</td>
                    <td className="right" style={sc.stressedCagr < 10 ? { color: '#e11d48', fontWeight: 700 } : {}}>{sc.stressedCagr}%</td>
                    <td className="right">{sc.baseDd}%</td>
                    <td className="right" style={sc.stressedDd < -30 ? { color: '#e11d48', fontWeight: 700 } : {}}>{sc.stressedDd}%</td>
                    <td className="center">
                      <span className={sc.status === 'PASS' ? 'bt-stress-pass' : 'bt-stress-fail'}>{sc.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
