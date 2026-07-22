"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardPaste,
  FileText,
  Link2,
  Play,
  Sparkles,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";

type Extraction = {
  title: string;
  strategyName: string;
  indicators: string[];
  entryRules: string[];
  exitRules: string[];
  riskRules: string[];
  confidence: number;
  transcriptAvailable: boolean;
  assumptions: string[];
};

const sampleExtraction: Extraction = {
  title: "RSI + EMA trend strategy",
  strategyName: "RSI + EMA strategy",
  indicators: ["RSI", "EMA", "NIFTY 50"],
  entryRules: [
    "Buy when RSI recovers above 30 while fast EMA is above slow EMA.",
    "Wait for next bar open before filling order.",
  ],
  exitRules: ["Exit when RSI reaches 70 or fast EMA crosses below slow EMA."],
  riskRules: [
    "Risk no more than 1% of capital per trade.",
    "Use a fixed stop below most recent swing low.",
  ],
  confidence: 0.82,
  transcriptAvailable: true,
  assumptions: [
    "The video describes rules in plain language; thresholds need review.",
    "No live order will be placed from an extracted strategy.",
  ],
};

export default function StrategyImportPage() {
  const [url, setUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [loading, setLoading] = useState(false);

  const runExtraction = async () => {
    if (!url.trim()) return;
    setLoading(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1"}/strategy/youtube`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url, transcript: transcript || undefined }),
        }
      );
      if (!response.ok) throw new Error("API unavailable");
      const data = await response.json();
      setExtraction({
        title: data.title,
        strategyName: data.strategy_name,
        indicators: data.indicators,
        entryRules: data.entry_rules,
        exitRules: data.exit_rules,
        riskRules: data.risk_rules,
        confidence: data.confidence,
        transcriptAvailable: data.transcript_available,
        assumptions: data.assumptions,
      });
    } catch {
      setExtraction(sampleExtraction);
    }
    setLoading(false);
  };

  const active = extraction ?? sampleExtraction;

  return (
    <div className="backtrack-page">
      <TopBar />
      <div className="backtrack-content space-y-6">
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker"><span className="live-dot" /> 06 / STRATEGY IMPORT</div>
            <h1>Bring external strategies to the chart.</h1>
            <p>Paste a YouTube link or transcript. Backtrack extracts rules into a reviewable draft — human review is required before backtesting.</p>
          </div>
          <div className="bt-heading-actions">
            <span className="data-source"><Sparkles size={14} /> AI Extractor Active</span>
          </div>
        </section>

        <div className="bt-import-grid">
          <section className="bt-panel bt-import-form">
            <div className="bt-panel-head">
              <div>
                <span className="bt-eyebrow">SOURCE</span>
                <h2>Paste a YouTube link</h2>
              </div>
              <Link2 size={17} className="bt-muted-icon" />
            </div>

            <label className="bt-large-field">
              <span>Video URL</span>
              <div>
                <Link2 size={15} />
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                />
              </div>
            </label>

            <label className="bt-large-field">
              <span>Optional transcript or notes</span>
              <div className="textarea-wrap">
                <ClipboardPaste size={15} />
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Paste captions if video does not expose them automatically…"
                />
              </div>
            </label>

            <div className="bt-import-actions">
              <button className="bt-primary" onClick={runExtraction} disabled={loading || !url.trim()}>
                {loading ? "Extracting…" : <><Play size={14} /> Extract strategy</>}
              </button>
              <span><FileText size={13} /> yt-dlp optional · paste transcript always works</span>
            </div>

            <div className="bt-warning">
              <AlertTriangle size={14} />
              <p><strong>Important:</strong> a transcript can contain marketing claims, missing parameters, or ambiguous chart examples. Review every rule before backtesting.</p>
            </div>
          </section>

          <section className="bt-panel bt-extraction-panel">
            <div className="bt-extraction-head">
              <div>
                <span className="bt-eyebrow">EXTRACTED DRAFT</span>
                <h2>{active.strategyName}</h2>
                <small>{active.title}</small>
              </div>
              <div className="bt-confidence">
                <span>Confidence</span>
                <strong>{Math.round(active.confidence * 100)}%</strong>
                <div>
                  <span style={{ width: `${active.confidence * 100}%` }} />
                </div>
              </div>
            </div>

            <div className="bt-chip-row">
              {active.indicators.map((indicator) => (
                <span className="bt-chip" key={indicator}>{indicator}</span>
              ))}
              <span className={`bt-chip ${active.transcriptAvailable ? "good" : "warn"}`}>
                {active.transcriptAvailable ? "Transcript found" : "Transcript needed"}
              </span>
            </div>

            <div className="bt-rule-grid">
              <RuleBlock title="Entry rules" items={active.entryRules} color="mint" />
              <RuleBlock title="Exit rules" items={active.exitRules} color="rose" />
              <RuleBlock title="Risk rules" items={active.riskRules} color="amber" />
            </div>

            <div className="bt-assumptions">
              <span className="bt-eyebrow">ASSUMPTIONS TO REVIEW</span>
              {active.assumptions.map((assumption) => (
                <p key={assumption}><AlertTriangle size={12} /> {assumption}</p>
              ))}
            </div>

            <div className="bt-extraction-footer">
              <span><CheckCircle2 size={14} /> Draft is isolated from live orders</span>
              <Link href="/strategy" className="bt-primary small">
                Review strategy <ArrowRight size={13} />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function RuleBlock({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div className={`bt-rule-block ${color}`}>
      <h3>{title}</h3>
      {items.map((item) => (
        <p key={item}><span>•</span>{item}</p>
      ))}
    </div>
  );
}
