"use client";

import { useState } from "react";
import { Check, LockKeyhole, Save, Settings2, SlidersHorizontal } from "lucide-react";
import TopBar from "@/components/layout/TopBar";

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [risk, setRisk] = useState("1.0");
  const [execution, setExecution] = useState("Next bar open");

  return (
    <div className="backtrack-page">
      <TopBar />
      <div className="backtrack-content space-y-6">
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker">09 / SETTINGS</div>
            <h1>Make the research engine yours.</h1>
            <p>These controls shape simulations and risk guardrails. Nothing here can place a live order.</p>
          </div>
          <div className="bt-heading-actions">
            <button className="bt-primary" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 1800); }}>
              {saved ? <Check size={14} /> : <Save size={14} />}
              {saved ? "Saved" : "Save settings"}
            </button>
          </div>
        </section>

        <div className="bt-settings-grid">
          <section className="bt-panel bt-settings-panel">
            <div className="bt-panel-head">
              <div><span className="bt-eyebrow">DATA &amp; EXECUTION</span><h2>Research defaults</h2></div>
              <Settings2 size={16} className="bt-muted-icon" />
            </div>
            <label className="bt-setting-row">
              <span><strong>Historical data source</strong><small>Locally imported official NSE daily OHLCV for research backtests.</small></span>
              <span className="bt-input-suffix">Free</span>
            </label>
            <label className="bt-setting-row">
              <span><strong>Execution model</strong><small>Signals are known at close and executed at next available bar.</small></span>
              <select value={execution} onChange={(e) => setExecution(e.target.value)}>
                <option>Next bar open</option>
                <option>Same bar close (optimistic)</option>
              </select>
            </label>
            <label className="bt-setting-row">
              <span><strong>Default commission</strong><small>Used when a strategy does not override the cost model.</small></span>
              <span className="bt-input-suffix"><input value="10" readOnly /> bps</span>
            </label>
          </section>

          <section className="bt-panel bt-settings-panel">
            <div className="bt-panel-head">
              <div><span className="bt-eyebrow">RISK GUARDRAILS</span><h2>Keep experiments honest</h2></div>
              <SlidersHorizontal size={16} className="bt-muted-icon" />
            </div>
            <label className="bt-setting-row">
              <span><strong>Max risk per trade</strong><small>Used by the strategy builder as a sizing suggestion.</small></span>
              <span className="bt-input-suffix"><input value={risk} onChange={(e) => setRisk(e.target.value)} /> %</span>
            </label>
            <label className="bt-setting-row"><span><strong>Warn on look-ahead risk</strong><small>Block result handoff when execution timing is ambiguous.</small></span><input className="bt-toggle" type="checkbox" defaultChecked /></label>
            <label className="bt-setting-row"><span><strong>Require out-of-sample split</strong><small>Recommended before treating a strategy as tradable.</small></span><input className="bt-toggle" type="checkbox" defaultChecked /></label>
          </section>

          <section className="bt-panel bt-settings-panel">
            <div className="bt-panel-head">
              <div><span className="bt-eyebrow">NO PAID DATA REQUIRED</span><h2>Backtest-only mode</h2></div>
              <LockKeyhole size={16} className="bt-muted-icon" />
            </div>
            <div className="bt-secret-row"><LockKeyhole size={15} /><div><strong>No broker credentials</strong><small>The backend has no paid provider, broker, quote, option-chain, or live-order integration.</small></div><span className="bt-secret-state">Free</span></div>
            <div className="bt-secret-row"><LockKeyhole size={15} /><div><strong>No API key required</strong><small>Historical candles are fetched server-side from the free research data source.</small></div><span className="bt-secret-state">Free</span></div>
            <p className="bt-settings-footnote">Use the root <code>.env</code> only for CORS, optional Ollama research, and local API URL configuration. See <a href="/data">Free Historical Data</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
