"use client";

import Link from "next/link";
import { ArrowUpRight, BarChart3, CalendarRange, Download, ShieldCheck, Target, TrendingDown, TrendingUp } from "lucide-react";
import TopBar from "@/components/layout/TopBar";

const monthly = [12, 22, 18, 30, 26, 42, 36, 49, 45, 58, 54, 67, 63, 78, 74, 86, 82, 92];
const segments = [
  { label: "Trend days", value: 28, share: 64, color: "mint" },
  { label: "Range days", value: 17, share: 39, color: "blue" },
  { label: "High-volatility", value: 11, share: 25, color: "amber" },
];

export default function AnalyticsPage() {
  return (
    <div className="backtrack-page">
      <TopBar />
      <div className="backtrack-content space-y-6">
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker"><span className="live-dot" /> 03 / ANALYTICS</div>
            <h1>Understand where the edge came from.</h1>
            <p>Turn a backtest result into a decision: what worked, when it worked, and how fragile it is.</p>
          </div>
          <div className="bt-heading-actions">
            <span className="data-source"><ShieldCheck size={14} /> Dataset locked · 4Y</span>
            <button className="bt-secondary"><Download size={14} /> Export CSV</button>
          </div>
        </section>
        <div className="bt-toolbar"><div className="bt-toolbar-label"><CalendarRange size={15} /> Analysis window</div><button className="bt-tab active">2021–2024</button><button className="bt-tab">2023–2024</button><button className="bt-tab">Last 12M</button><span className="bt-toolbar-spacer" /><Link href="/robustness" className="bt-link">Open robustness view <ArrowUpRight size={13} /></Link></div>
        <div className="bt-kpi-grid"><div className="bt-stat-card mint"><span>Net return</span><strong>+21.6%</strong><small>₹21,617 on ₹100k</small><TrendingUp /></div><div className="bt-stat-card blue"><span>Sharpe ratio</span><strong>1.42</strong><small>Risk-adjusted return</small><Target /></div><div className="bt-stat-card rose"><span>Max drawdown</span><strong>-11.7%</strong><small>Peak to trough</small><TrendingDown /></div><div className="bt-stat-card violet"><span>Profit factor</span><strong>1.86</strong><small>₹1.86 earned per ₹1 lost</small><ShieldCheck /></div></div>
        <div className="bt-analytics-grid"><section className="bt-panel bt-performance"><div className="bt-panel-head"><div><span className="bt-eyebrow">EQUITY PROFILE</span><h2>Return by month</h2></div><span className="bt-panel-note">Strategy vs. NIFTY 50</span></div><div className="bt-bars">{monthly.map((value, index) => <div className="bt-bar-group" key={index}><div className="bt-bar benchmark" style={{ height: `${Math.max(12, value * 0.58)}%` }} /><div className="bt-bar strategy" style={{ height: `${value}%` }} /><small>{index % 3 === 0 ? `M${index + 1}` : ""}</small></div>)}</div><div className="bt-chart-legend"><span><i className="mint-dot" /> Strategy</span><span><i className="blue-dot" /> Buy &amp; hold</span><span className="bt-panel-note">Positive months: 11 / 16</span></div></section><section className="bt-panel"><div className="bt-panel-head"><div><span className="bt-eyebrow">REGIME BREAKDOWN</span><h2>When it worked</h2></div><BarChart3 size={16} className="bt-muted-icon" /></div><div className="bt-regime-list">{segments.map((segment) => <div className="bt-regime" key={segment.label}><div><span>{segment.label}</span><strong>{segment.value} trades</strong></div><div className="bt-progress"><span className={segment.color} style={{ width: `${segment.share}%` }} /></div><small>{segment.share}% of total P&amp;L contribution</small></div>)}</div><div className="bt-callout"><strong>Read this first</strong><p>Trend days drive most of the edge. Test sideways markets separately before increasing position size.</p></div></section></div>
        <section className="bt-panel"><div className="bt-panel-head"><div><span className="bt-eyebrow">TRADE QUALITY</span><h2>What the number hides</h2></div><Link href="/backtests" className="bt-link">Open trade blotter <ArrowUpRight size={13} /></Link></div><div className="bt-quality-table"><div className="bt-quality-row head"><span>Measure</span><span>Strategy</span><span>Benchmark</span><span>Read</span></div><div className="bt-quality-row"><span>Average win</span><strong>₹1,980</strong><span>—</span><small className="positive-copy">Wins have room to run</small></div><div className="bt-quality-row"><span>Average loss</span><strong className="negative-copy">−₹1,140</strong><span>—</span><small>Losses are smaller than wins</small></div><div className="bt-quality-row"><span>Time in market</span><strong>46%</strong><span>100%</span><small>Less exposure, more selectivity</small></div></div></section>
      </div>
    </div>
  );
}
