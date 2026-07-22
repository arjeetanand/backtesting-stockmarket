"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, Calculator, Info, ShieldAlert, Sparkles } from "lucide-react";
import TopBar from "@/components/layout/TopBar";

export default function OptionsPage() {
  const [kind, setKind] = useState<"call" | "put">("call");
  const [spot, setSpot] = useState(24500);
  const [strike, setStrike] = useState(24500);
  const [premium, setPremium] = useState(165);
  const [lotSize, setLotSize] = useState(50);

  const payoff = useMemo(() =>
    Array.from({ length: 15 }, (_, index) => {
      const underlying = spot - 1500 + index * 250;
      const intrinsic = kind === "call" ? Math.max(underlying - strike, 0) : Math.max(strike - underlying, 0);
      return { underlying, pnl: (intrinsic - premium) * lotSize };
    }),
    [kind, spot, strike, premium, lotSize]
  );

  const maxLoss = premium * lotSize;
  const breakeven = kind === "call" ? strike + premium : strike - premium;
  const maxProfit = kind === "call" ? "Unlimited" : `₹${((strike - premium) * lotSize).toLocaleString("en-IN")}`;
  const min = Math.min(...payoff.map((point) => point.pnl), 0);
  const max = Math.max(...payoff.map((point) => point.pnl), 1);
  const xFor = (index: number) => (index / (payoff.length - 1)) * 900;
  const yFor = (value: number) => 210 - ((value - min) / Math.max(max - min, 1)) * 180;
  const path = payoff.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point.pnl)}`).join(" ");

  return (
    <div className="backtrack-page">
      <TopBar />
      <div className="backtrack-content bt-stack">
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker"><span className="live-dot" /> 07 / OPTIONS LAB</div>
            <h1>Understand the payoff before taking risk.</h1>
            <p>Use this lab to learn calls, puts, breakeven, and loss limits with an NSE-style contract example.</p>
          </div>
          <div className="bt-heading-actions">
            <span className="data-source"><BookOpen size={14} /> Education Mode</span>
          </div>
        </section>

        {/* Intro Alert */}
        <div className="options-intro">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Sparkles size={18} />
            <div>
              <strong>Call vs. Put in one sentence:</strong> A call benefits when the underlying rises above strike. A put benefits when it falls below strike. Maximum buyer loss is capped at premium paid.
            </div>
          </div>
          <div className="options-disclaimer">
            <ShieldAlert size={14} />
            <span>Educational simulator only</span>
          </div>
        </div>

        {/* Main Grid */}
        <div className="options-lab-grid">
          {/* Controls */}
          <section className="bt-panel options-controls">
            <div className="bt-panel-head">
              <div>
                <span className="bt-eyebrow">POSITION SETUP</span>
                <h2>Contract Parameters</h2>
              </div>
              <Calculator size={16} className="bt-muted-icon" />
            </div>

            <div className="options-tabs">
              <button className={kind === "call" ? "active" : ""} onClick={() => setKind("call")}>Long Call</button>
              <button className={kind === "put" ? "active" : ""} onClick={() => setKind("put")}>Long Put</button>
            </div>

            <div className="bt-stack-sm" style={{ marginTop: "8px" }}>
              <label className="bt-setting-row">
                <span>
                  <strong>Underlying Spot</strong>
                  <small>NIFTY 50 · NSE Index</small>
                </span>
                <span className="bt-input-suffix">
                  <input type="number" value={spot} onChange={(e) => setSpot(Number(e.target.value))} /> ₹
                </span>
              </label>

              <label className="bt-setting-row">
                <span>
                  <strong>Strike Price</strong>
                  <small>Contract execution price</small>
                </span>
                <span className="bt-input-suffix">
                  <input type="number" value={strike} onChange={(e) => setStrike(Number(e.target.value))} /> ₹
                </span>
              </label>

              <label className="bt-setting-row">
                <span>
                  <strong>Option Premium</strong>
                  <small>Price per unit paid</small>
                </span>
                <span className="bt-input-suffix">
                  <input type="number" value={premium} onChange={(e) => setPremium(Number(e.target.value))} /> ₹
                </span>
              </label>

              <label className="bt-setting-row">
                <span>
                  <strong>Lot Size</strong>
                  <small>NSE contract size</small>
                </span>
                <span className="bt-input-suffix">
                  <input type="number" value={lotSize} onChange={(e) => setLotSize(Number(e.target.value))} /> units
                </span>
              </label>
            </div>

            <Link href="/strategy" className="bt-primary full">
              Backtest This Setup <ArrowRight size={14} />
            </Link>
          </section>

          {/* Payoff Chart */}
          <section className="bt-panel options-payoff">
            <div className="bt-panel-head">
              <div>
                <span className="bt-eyebrow">PAYOFF PROFILE AT EXPIRY</span>
                <h2>{kind === "call" ? "Long Call" : "Long Put"} Strategy Payoff</h2>
              </div>
              <span className="bt-panel-note">Net P&amp;L Profile</span>
            </div>

            <svg className="options-chart" viewBox="0 0 920 250" role="img" aria-label="Option payoff chart">
              <line x1="0" x2="900" y1={yFor(0)} y2={yFor(0)} stroke="#e2e8f0" strokeDasharray="4 4" strokeWidth="1.5" />
              <path d={path} fill="none" stroke="#4f46e5" strokeWidth="2.5" />
              <text x="10" y="22" fill="#059669" fontSize="10" fontWeight="700" fontFamily="var(--font-jetbrains)">Profit</text>
              <text x="10" y="238" fill="#e11d48" fontSize="10" fontWeight="700" fontFamily="var(--font-jetbrains)">Loss</text>
              {payoff.filter((_, idx) => idx % 3 === 0).map((point, idx) => (
                <text key={point.underlying} x={xFor(idx * 3)} y="245" fill="#94a3b8" fontSize="10" fontFamily="var(--font-jetbrains)">
                  {(point.underlying / 1000).toFixed(1)}k
                </text>
              ))}
            </svg>

            {/* Summary Statistics */}
            <div className="bt-grid-3" style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #f1f5f9" }}>
              <div className="bt-stat-card" style={{ padding: "14px" }}>
                <span>MAX PROFIT</span>
                <strong style={{ color: "#059669", fontSize: "16px" }}>{maxProfit}</strong>
              </div>
              <div className="bt-stat-card" style={{ padding: "14px" }}>
                <span>MAX LOSS</span>
                <strong style={{ color: "#e11d48", fontSize: "16px" }}>−₹{maxLoss.toLocaleString("en-IN")}</strong>
              </div>
              <div className="bt-stat-card" style={{ padding: "14px" }}>
                <span>BREAKEVEN</span>
                <strong style={{ color: "#4f46e5", fontSize: "16px" }}>₹{breakeven.toLocaleString("en-IN")}</strong>
              </div>
            </div>
          </section>
        </div>

        {/* Learn Section */}
        <section className="bt-panel" style={{ padding: "24px" }}>
          <div className="bt-panel-head" style={{ marginBottom: "16px" }}>
            <div>
              <span className="bt-eyebrow">TERMINOLOGY GUIDE</span>
              <h2>Options Mechanics Essentials</h2>
            </div>
            <Info size={16} className="bt-muted-icon" />
          </div>
          <div className="bt-grid-3">
            <div className="bt-panel" style={{ padding: "16px", background: "#f8fafc" }}>
              <strong style={{ display: "block", color: "#0f172a", fontSize: "14px", marginBottom: "4px" }}>Strike Price</strong>
              <p style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.6 }}>The fixed price at which the option contract owner can buy (call) or sell (put) the underlying security.</p>
            </div>
            <div className="bt-panel" style={{ padding: "16px", background: "#f8fafc" }}>
              <strong style={{ display: "block", color: "#0f172a", fontSize: "14px", marginBottom: "4px" }}>Option Premium</strong>
              <p style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.6 }}>The non-refundable upfront cash paid per unit by the option buyer. It equals the buyer's total risk limit.</p>
            </div>
            <div className="bt-panel" style={{ padding: "16px", background: "#f8fafc" }}>
              <strong style={{ display: "block", color: "#0f172a", fontSize: "14px", marginBottom: "4px" }}>Breakeven Level</strong>
              <p style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.6 }}>The underlying market price at contract expiration where position payout exactly offsets initial premium cost.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
