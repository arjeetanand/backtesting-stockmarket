"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, BookOpen, ShieldCheck } from "lucide-react";
import TopBar from "@/components/layout/TopBar";

export default function AnalyticsPage() {
  return (
    <div className="backtrack-page">
      <TopBar />
      <div className="backtrack-content bt-stack">
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker"><span className="live-dot" /> UNDERSTAND A TEST</div>
            <h1>See what shaped the result.</h1>
            <p>Choose a completed test first. This page will then help you understand returns, losses, and the periods where the idea worked.</p>
          </div>
          <div className="bt-heading-actions"><span className="data-source"><ShieldCheck size={14} /> Uses your saved tests</span></div>
        </section>

        <section className="bt-panel" style={{ padding: "38px 24px", textAlign: "center" }}>
          <BarChart3 size={30} className="text-indigo-600" style={{ margin: "0 auto 14px" }} />
          <h2>No test selected yet</h2>
          <p className="text-slate-500" style={{ maxWidth: "520px", margin: "8px auto 20px" }}>Run a strategy, save the result, and return here when you want a deeper explanation of what happened.</p>
          <div className="bt-heading-actions" style={{ justifyContent: "center" }}>
            <Link href="/research" className="bt-primary">Start a test <ArrowRight size={14} /></Link>
            <Link href="/backtests" className="bt-secondary">Open my tests</Link>
          </div>
        </section>

        <section className="bt-grid-3">
          <div className="bt-panel" style={{ padding: "20px" }}><BookOpen size={18} className="text-indigo-600" /><h2 style={{ marginTop: "10px" }}>Return</h2><p className="text-slate-500 text-sm">How much the test grew or lost over the selected dates.</p></div>
          <div className="bt-panel" style={{ padding: "20px" }}><ShieldCheck size={18} className="text-emerald-600" /><h2 style={{ marginTop: "10px" }}>Risk</h2><p className="text-slate-500 text-sm">How large the worst fall was while the strategy was running.</p></div>
          <div className="bt-panel" style={{ padding: "20px" }}><BarChart3 size={18} className="text-violet-600" /><h2 style={{ marginTop: "10px" }}>Trade quality</h2><p className="text-slate-500 text-sm">Whether wins, losses, and the number of trades support the result.</p></div>
        </section>
      </div>
    </div>
  );
}
