"use client";

import { BookOpen, Sparkles, TrendingUp } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import IndicatorSchool from "@/components/learning/IndicatorSchool";

export default function OptionsPage() {
  return (
    <div className="backtrack-page bt-learn-page">
      <TopBar />
      <main className="backtrack-content bt-stack options-page">
        <section className="bt-heading-row options-heading">
          <div>
            <div className="bt-kicker">
              <Sparkles size={13} className="text-indigo-600" /> STOCK TECHNICAL RESEARCH &amp; INDICATOR SCHOOL
            </div>
            <h1>Stock Market Technical Analysis &amp; Strategy School</h1>
            <p>
              Understand technical indicators (RVOL, VCP, SMA Rebound, RSI Momentum, Donchian Breakout), learn price-action rules, and test every setup on official NSE stock market history.
            </p>
          </div>
          <div className="options-mode">
            <BookOpen size={15} /> 100% Research &amp; Backtesting Only
          </div>
        </section>

        <IndicatorSchool />
      </main>
    </div>
  );
}
