"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleHelp, ShieldAlert } from "lucide-react";
import TopBar from "@/components/layout/TopBar";

const checks = [
  { title: "Future information", copy: "The test must only use information that was known at the time of each trade.", status: "Built in" },
  { title: "Too many adjustments", copy: "A strategy that only works with one exact setting may be over-fitted.", status: "Review in reliability" },
  { title: "Enough trades", copy: "A small number of trades can make a good result look better than it really is.", status: "Review the trade count" },
  { title: "Trading costs", copy: "Brokerage, taxes and price slippage can reduce the result in real life.", status: "Set in your test" },
];

export default function BiasValidityPage() {
  return (
    <div className="backtrack-page">
      <TopBar />
      <div className="backtrack-content bt-stack">
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker"><span className="live-dot" /> BEFORE YOU TRUST A RESULT</div>
            <h1>Could this result be misleading?</h1>
            <p>Use this quick guide to check the common mistakes that can make a historical test look too good.</p>
          </div>
          <div className="bt-heading-actions"><span className="data-source"><ShieldAlert size={14} /> Safety guide</span></div>
        </section>

        <section className="bt-panel" style={{ padding: "22px" }}>
          <div className="bt-panel-head">
            <div><span className="bt-eyebrow">FOUR SIMPLE CHECKS</span><h2>Read this before making a decision</h2></div>
            <CircleHelp size={18} className="bt-muted-icon" />
          </div>
          <div className="bt-stack-sm">
            {checks.map((check) => (
              <div key={check.title} className="bt-check-row" style={{ alignItems: "flex-start", gap: "14px", padding: "14px 0" }}>
                <CheckCircle2 size={18} className="text-indigo-600" />
                <div style={{ flex: 1 }}><strong>{check.title}</strong><p className="text-slate-500 text-sm" style={{ marginTop: "4px" }}>{check.copy}</p></div>
                <span className="bt-panel-note">{check.status}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="bt-data-note" role="note">
          <CircleHelp size={17} className="text-indigo-600" />
          <span>A backtest is a study tool, not a promise of future profit. Test on dates you did not use to tune the strategy and keep risk small.</span>
        </section>

        <div className="bt-heading-actions" style={{ justifyContent: "flex-start" }}>
          <Link href="/robustness" className="bt-primary">Check reliability <ArrowRight size={14} /></Link>
          <Link href="/backtests" className="bt-secondary">Open my tests</Link>
        </div>
      </div>
    </div>
  );
}
