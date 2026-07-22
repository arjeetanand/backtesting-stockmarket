"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Info, LockKeyhole, RotateCcw, Save, Settings2, SlidersHorizontal } from "lucide-react";
import TopBar from "@/components/layout/TopBar";

const SETTINGS_KEY = "backtrack:settings";

type ResearchSettings = {
  risk: string;
  commissionBps: string;
  execution: "Next bar open";
  warnLookahead: boolean;
  requireOutOfSample: boolean;
};

const DEFAULTS: ResearchSettings = {
  risk: "1.0",
  commissionBps: "10",
  execution: "Next bar open",
  warnLookahead: true,
  requireOutOfSample: true,
};

function readSettings(): ResearchSettings {
  try {
    const saved = window.localStorage.getItem(SETTINGS_KEY);
    if (!saved) return DEFAULTS;
    const parsed = JSON.parse(saved) as Partial<ResearchSettings>;
    return {
      risk: typeof parsed.risk === "string" ? parsed.risk : DEFAULTS.risk,
      commissionBps: typeof parsed.commissionBps === "string" ? parsed.commissionBps : DEFAULTS.commissionBps,
      execution: "Next bar open",
      warnLookahead: typeof parsed.warnLookahead === "boolean" ? parsed.warnLookahead : DEFAULTS.warnLookahead,
      requireOutOfSample: typeof parsed.requireOutOfSample === "boolean" ? parsed.requireOutOfSample : DEFAULTS.requireOutOfSample,
    };
  } catch {
    return DEFAULTS;
  }
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<ResearchSettings>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettings(readSettings()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const update = <K extends keyof ResearchSettings>(key: K, value: ResearchSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setError(null);
  };

  const saveSettings = () => {
    const risk = Number(settings.risk);
    const commission = Number(settings.commissionBps);
    if (!Number.isFinite(risk) || risk <= 0 || risk > 100) {
      setError("Max risk per trade must be between 0.1% and 100%.");
      return;
    }
    if (!Number.isFinite(commission) || commission < 0 || commission > 1_000) {
      setError("Commission must be between 0 and 1,000 basis points.");
      return;
    }
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    setSaved(true);
    setError(null);
    window.setTimeout(() => setSaved(false), 2200);
  };

  const resetSettings = () => {
    setSettings(DEFAULTS);
    window.localStorage.removeItem(SETTINGS_KEY);
    setSaved(true);
    setError(null);
    window.setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div className="backtrack-page bt-settings-page">
      <TopBar />
      <div className="backtrack-content bt-stack">
        <section className="bt-heading-row bt-settings-heading">
          <div>
            <div className="bt-kicker">09 / SETTINGS</div>
            <h1>Research settings</h1>
            <p>Save your research preferences in this browser. Test pages still show their own final inputs, and nothing here can place a live order.</p>
          </div>
          <div className="bt-heading-actions">
            <button type="button" className="bt-secondary" onClick={resetSettings}><RotateCcw size={14} /> Reset</button>
            <button type="button" className="bt-primary" onClick={saveSettings} aria-live="polite">
              {saved ? <Check size={14} /> : <Save size={14} />}
              {saved ? "Saved" : "Save settings"}
            </button>
          </div>
        </section>

        {error && <div className="bt-alert-error" role="alert"><Info size={16} /><span>{error}</span></div>}

        <div className="bt-settings-grid">
          <section className="bt-panel bt-settings-panel" aria-labelledby="research-defaults-title">
            <div className="bt-settings-panel-head">
              <div><span className="bt-eyebrow">DATA &amp; EXECUTION</span><h2 id="research-defaults-title">Research defaults</h2><p>Saved in this browser as your preferred starting values; each test can override them.</p></div>
              <span className="bt-settings-icon"><Settings2 size={17} /></span>
            </div>
            <div className="bt-setting-row">
              <div className="bt-setting-copy"><strong>Historical data source</strong><small>Official NSE daily archives saved in the local SQLite cache.</small></div>
              <span className="bt-secret-state">Free</span>
            </div>
            <label className="bt-setting-row" htmlFor="execution-model">
              <span className="bt-setting-copy"><strong>Execution model</strong><small>Signals are known at close and filled on the next available bar.</small></span>
              <select id="execution-model" value={settings.execution} onChange={(event) => update("execution", event.target.value as ResearchSettings["execution"])}>
                <option>Next bar open</option>
              </select>
            </label>
            <label className="bt-setting-row" htmlFor="commission-bps">
              <span className="bt-setting-copy"><strong>Commission reference</strong><small>Keep a realistic transaction-cost assumption visible when configuring a test.</small></span>
              <span className="bt-input-suffix"><input id="commission-bps" inputMode="decimal" type="number" min="0" max="1000" step="0.1" value={settings.commissionBps} onChange={(event) => update("commissionBps", event.target.value)} aria-describedby="commission-help" /><span>bps</span></span>
            </label>
            <p id="commission-help" className="bt-settings-help"><Info size={13} /> 10 bps equals 0.10% per simulated side.</p>
          </section>

          <section className="bt-panel bt-settings-panel" aria-labelledby="risk-guardrails-title">
            <div className="bt-settings-panel-head">
              <div><span className="bt-eyebrow">RISK GUARDRAILS</span><h2 id="risk-guardrails-title">Keep experiments honest</h2><p>These preferences remind you to test assumptions before trusting a result.</p></div>
              <span className="bt-settings-icon"><SlidersHorizontal size={17} /></span>
            </div>
            <label className="bt-setting-row" htmlFor="risk-per-trade">
              <span className="bt-setting-copy"><strong>Max risk per trade</strong><small>Keep a risk-sizing reference visible while configuring a strategy.</small></span>
              <span className="bt-input-suffix"><input id="risk-per-trade" inputMode="decimal" type="number" min="0.1" max="100" step="0.1" value={settings.risk} onChange={(event) => update("risk", event.target.value)} aria-describedby="risk-help" /><span>%</span></span>
            </label>
            <p id="risk-help" className="bt-settings-help"><Info size={13} /> This does not guarantee a maximum loss; gaps and liquidity can change outcomes.</p>
            <label className="bt-setting-row bt-setting-toggle-row" htmlFor="warn-lookahead">
              <span className="bt-setting-copy"><strong>Warn on look-ahead risk</strong><small>Keep timing and future-data warnings visible in result review.</small></span>
              <input id="warn-lookahead" className="bt-toggle" type="checkbox" checked={settings.warnLookahead} onChange={(event) => update("warnLookahead", event.target.checked)} />
            </label>
            <label className="bt-setting-row bt-setting-toggle-row" htmlFor="require-oos">
              <span className="bt-setting-copy"><strong>Require out-of-sample split</strong><small>Remind you to validate a strategy on unseen history.</small></span>
              <input id="require-oos" className="bt-toggle" type="checkbox" checked={settings.requireOutOfSample} onChange={(event) => update("requireOutOfSample", event.target.checked)} />
            </label>
          </section>

          <section className="bt-panel bt-settings-panel bt-settings-panel-wide" aria-labelledby="mode-title">
            <div className="bt-settings-panel-head">
              <div><span className="bt-eyebrow">LOCAL &amp; PRIVATE BY DEFAULT</span><h2 id="mode-title">Backtest-only mode</h2><p>What this application can and cannot access.</p></div>
              <span className="bt-settings-icon"><LockKeyhole size={17} /></span>
            </div>
            <div className="bt-settings-status-grid">
              <div className="bt-secret-row"><span className="bt-status-dot" /><div><strong>No broker connection</strong><small>No Dhan order placement, account sync, or live execution.</small></div><span className="bt-secret-state">Blocked</span></div>
              <div className="bt-secret-row"><span className="bt-status-dot" /><div><strong>No paid data key</strong><small>Historical NSE data is imported from official daily archives without credentials.</small></div><span className="bt-secret-state">Free</span></div>
              <div className="bt-secret-row"><span className="bt-status-dot optional" /><div><strong>Ollama is optional</strong><small>Only local research explanations use the configured Ollama model.</small></div><span className="bt-secret-state optional">Optional</span></div>
            </div>
            <div className="bt-settings-footer"><p>Change server paths and Ollama settings in the root <code>.env</code> file. Manage historical stock data from the Data page.</p><Link href="/data" className="bt-link">Manage stock data <span aria-hidden="true">→</span></Link></div>
          </section>
        </div>
      </div>
    </div>
  );
}
