"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardPaste,
  Clock3,
  ExternalLink,
  FileText,
  Link2,
  Play,
  Sparkles,
  WalletCards,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { SymbolCombobox } from "@/components/data/SymbolCombobox";
import { fetchWithTimeout } from "@/lib/api";

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
  strategyId?: string;
  sourceType?: "youtube" | "curated";
  sourceUrl?: string;
};

type PopularStrategy = {
  id: string;
  strategyId: string;
  name: string;
  family: string;
  badge: string;
  description: string;
  howItWorks: string;
  indicators: string[];
  entryRules: string[];
  exitRules: string[];
  riskRules: string[];
  assumptions: string[];
  defaults: { symbol: string; timeframe: string; fast: number; slow: number };
  sourceUrl: string;
};

const POPULAR_STRATEGIES: PopularStrategy[] = [
  { id: "golden-cross", strategyId: "sma_crossover", name: "Golden Cross", family: "Trend following", badge: "Community favourite", description: "A long-term SMA crossover used to study major trend changes.", howItWorks: "Buys when the 50-day SMA crosses above the 200-day SMA and exits on the reverse cross.", indicators: ["SMA 50", "SMA 200"], entryRules: ["Enter long on a 50 SMA cross above the 200 SMA."], exitRules: ["Exit on a 50 SMA cross below the 200 SMA."], riskRules: ["Long-only paper simulation with commission and slippage included."], assumptions: ["Signals are calculated after the close and filled on the next candle.", "A 200-candle warm-up is required before the first signal."], defaults: { symbol: "RELIANCE", timeframe: "1day", fast: 50, slow: 200 }, sourceUrl: "https://www.youtube.com/results?search_query=golden+cross+trading+strategy" },
  { id: "ema-crossover", strategyId: "ema_crossover", name: "20/50 EMA crossover", family: "Trend following", badge: "Frequently tested", description: "A responsive medium-term trend signal with more weight on recent prices.", howItWorks: "Buys when the 20-day EMA crosses above the 50-day EMA and exits on the reverse cross.", indicators: ["EMA 20", "EMA 50"], entryRules: ["Enter long when EMA 20 crosses above EMA 50."], exitRules: ["Exit when EMA 20 crosses below EMA 50."], riskRules: ["Costs are applied on every simulated entry and exit."], assumptions: ["Next-candle execution prevents look-ahead bias."], defaults: { symbol: "RELIANCE", timeframe: "1day", fast: 20, slow: 50 }, sourceUrl: "https://www.youtube.com/results?search_query=20+50+ema+crossover+strategy" },
  { id: "rsi-ema", strategyId: "rsi_ema", name: "RSI pullback + EMA filter", family: "Momentum / pullback", badge: "Popular momentum setup", description: "Looks for an oversold pullback while the broader EMA trend remains positive.", howItWorks: "Buys below RSI 30 only when EMA 20 is above EMA 50; exits above RSI 70 or when the trend reverses.", indicators: ["RSI 14", "EMA 20", "EMA 50"], entryRules: ["Enter when RSI is below 30 and EMA 20 is above EMA 50."], exitRules: ["Exit when RSI is above 70 or EMA 20 falls below EMA 50."], riskRules: ["The engine uses one long position and applies 0.10% commission plus 0.05% slippage."], assumptions: ["RSI thresholds are defaults and should be stress-tested."], defaults: { symbol: "RELIANCE", timeframe: "1day", fast: 20, slow: 50 }, sourceUrl: "https://www.youtube.com/results?search_query=rsi+ema+pullback+strategy" },
  { id: "bollinger-reversion", strategyId: "bollinger_mean_reversion", name: "Bollinger Band reversion", family: "Mean reversion", badge: "Common retail setup", description: "Tests whether unusually weak closes revert toward a moving-average centre line.", howItWorks: "Buys below the lower Bollinger Band and exits when price returns above the middle band.", indicators: ["Bollinger Bands", "SMA 20"], entryRules: ["Enter when close falls below the lower Bollinger Band."], exitRules: ["Exit when close returns above the middle band."], riskRules: ["Mean reversion can fail during persistent downtrends; review drawdown and losing streaks."], assumptions: ["Band width uses the engine's standard-deviation implementation."], defaults: { symbol: "TCS", timeframe: "1day", fast: 20, slow: 50 }, sourceUrl: "https://www.youtube.com/results?search_query=bollinger+bands+mean+reversion+strategy" },
  { id: "macd-crossover", strategyId: "macd_crossover", name: "MACD crossover", family: "Trend confirmation", badge: "Classic indicator", description: "Uses a MACD line and signal-line cross to study momentum shifts.", howItWorks: "Buys when MACD crosses above its signal line and exits on the reverse cross.", indicators: ["MACD 12/26/9"], entryRules: ["Enter on a bullish MACD signal-line crossover."], exitRules: ["Exit on a bearish MACD signal-line crossover."], riskRules: ["This is a long-only historical simulation, not a recommendation."], assumptions: ["The standard MACD periods are used by the local engine."], defaults: { symbol: "INFY", timeframe: "1day", fast: 12, slow: 26 }, sourceUrl: "https://www.youtube.com/results?search_query=macd+crossover+strategy" },
  { id: "donchian-breakout", strategyId: "donchian_breakout", name: "Donchian breakout", family: "Breakout", badge: "Systematic trend setup", description: "Tests whether a new rolling high can start a sustained move.", howItWorks: "Buys a breakout above the previous 50-day high and exits below the previous 50-day low.", indicators: ["Donchian 50"], entryRules: ["Enter when close breaks above the prior rolling high."], exitRules: ["Exit when close breaks below the prior rolling low."], riskRules: ["Breakouts can create many small losses in sideways markets."], assumptions: ["The breakout bands exclude the current candle to avoid look-ahead bias."], defaults: { symbol: "HDFCBANK", timeframe: "1day", fast: 20, slow: 50 }, sourceUrl: "https://www.youtube.com/results?search_query=donchian+channel+breakout+strategy" },
];

const today = new Date().toISOString().slice(0, 10);
const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export default function StrategyImportPage() {
  const [url, setUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("RELIANCE");
  const [timeframe, setTimeframe] = useState("1day");
  const [initialCapital, setInitialCapital] = useState(100000);
  const [startDate, setStartDate] = useState(oneYearAgo);
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = POPULAR_STRATEGIES.find((item) => item.id === selectedTemplateId) ?? null;

  const selectTemplate = (template: PopularStrategy) => {
    setSelectedTemplateId(template.id);
    setSymbol(template.defaults.symbol);
    setTimeframe(template.defaults.timeframe);
    setExtraction({
      title: `${template.name} · curated community template`,
      strategyName: template.name,
      indicators: template.indicators,
      entryRules: template.entryRules,
      exitRules: template.exitRules,
      riskRules: template.riskRules,
      confidence: 1,
      transcriptAvailable: true,
      assumptions: template.assumptions,
      strategyId: template.strategyId,
      sourceType: "curated",
      sourceUrl: template.sourceUrl,
    });
    setError(null);
  };

  const strategyForBacktest = extraction?.strategyId ?? selectedTemplate?.strategyId ?? "sma_crossover";
  const formula = selectedTemplate?.howItWorks ?? extraction?.entryRules.concat(extraction.exitRules).join(" ") ?? "Review the extracted entry and exit rules before testing.";
  const backtestHref = `/research?source=youtube-template&template=${encodeURIComponent(selectedTemplate?.id ?? "custom")}&strategy=${encodeURIComponent(strategyForBacktest)}&symbol=${encodeURIComponent(symbol.trim().toUpperCase())}&timeframe=${encodeURIComponent(timeframe)}&capital=${initialCapital}&start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}&formula=${encodeURIComponent(formula)}`;

  const runExtraction = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithTimeout(
        `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1"}/strategy/youtube`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url, transcript: transcript || undefined }),
        },
        15_000,
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
        strategyId: data.strategy_id ?? (String(data.strategy_name ?? "").toLowerCase().includes("rsi") ? "rsi_ema" : "sma_crossover"),
        sourceType: "youtube",
        sourceUrl: url,
      });
      setSelectedTemplateId(null);
      if (!data.transcript_available) {
        setError("No captions were found for this video. Paste the YouTube transcript or notes below and try again.");
      }
    } catch (requestError) {
      setExtraction(null);
      setError(requestError instanceof Error ? requestError.message : "Could not read this YouTube video. Paste its transcript and try again.");
    } finally {
      setLoading(false);
    }
  };

  const active = extraction ?? {
    title: "No strategy extracted yet",
    strategyName: "Paste a link to begin",
    indicators: [],
    entryRules: [],
    exitRules: [],
    riskRules: [],
    confidence: 0,
    transcriptAvailable: false,
    assumptions: [],
  };

  return (
    <div className="backtrack-page">
      <TopBar />
      <div className="backtrack-content space-y-6 bt-youtube-page">
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker"><span className="live-dot" /> USE A YOUTUBE STRATEGY</div>
            <h1>Turn a video into testable rules.</h1>
            <p>Paste a YouTube link or transcript. We will show the rules we found so you can check them before running a backtest.</p>
          </div>
          <div className="bt-heading-actions">
            <span className="data-source"><Sparkles size={14} /> AI Extractor Active</span>
          </div>
      </section>

        {error && <div className="bt-alert-error" role="alert">{error}</div>}

        <section className="bt-panel bt-popular-panel">
          <div className="bt-row-between bt-popular-heading">
            <div>
              <span className="bt-eyebrow">POPULAR COMMUNITY STRATEGIES</span>
              <h2>Start from a strategy people commonly discuss</h2>
              <p>These are transparent rule templates based on widely used public strategies. Popularity is not a return promise. Open the YouTube search link to review the community discussion, then run the same rules on local NSE history.</p>
            </div>
            <span className="bt-ai-badge"><BarChart3 size={12} /> {POPULAR_STRATEGIES.length} supported templates</span>
          </div>
          <div className="bt-popular-grid">
            {POPULAR_STRATEGIES.map((template) => <button type="button" key={template.id} className={`bt-popular-card ${selectedTemplateId === template.id ? "is-selected" : ""}`} aria-pressed={selectedTemplateId === template.id} onClick={() => selectTemplate(template)}><div className="bt-row-between"><span className="bt-popular-badge">{template.badge}</span><ArrowRight size={14} /></div><strong>{template.name}</strong><small>{template.family}</small><p>{template.description}</p><span className="bt-popular-link"><ExternalLink size={11} /> YouTube community search</span></button>)}
          </div>
          <div className="bt-popular-controls">
            <div><label className="bt-field-label">NSE stock</label><SymbolCombobox value={symbol} onChange={setSymbol} /></div>
            <div><label className="bt-field-label"><Clock3 size={13} /> Timeframe</label><select className="bt-field-input" value={timeframe} onChange={(event) => setTimeframe(event.target.value)}><option value="1day">Daily · official NSE candles</option><option value="1week">Weekly · resampled daily data</option><option value="1month">Monthly · resampled daily data</option><option value="1hour" disabled>Hourly · intraday data required</option></select></div>
            <div><label className="bt-field-label"><WalletCards size={13} /> Starting capital (₹)</label><input className="bt-field-input" type="number" min={1000} step={1000} value={initialCapital} onChange={(event) => setInitialCapital(Math.max(1000, Number(event.target.value) || 1000))} /></div>
            <div><label className="bt-field-label">From</label><input className="bt-field-input" type="date" max={endDate} value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
            <div><label className="bt-field-label">To</label><input className="bt-field-input" type="date" min={startDate} max={today} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div>
          </div>
          <div className="bt-popular-footer"><span><Sparkles size={13} /> The backtest uses next-candle execution, commission, slippage, and the selected starting capital.</span>{selectedTemplate && !extraction && <div className="bt-row"><a className="bt-secondary small" href={selectedTemplate.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Review source</a><Link className="bt-primary small" href={backtestHref}>Backtest selected strategy <ArrowRight size={13} /></Link></div>}</div>
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
                <span className="bt-eyebrow">YOUR EXTRACTED RULES</span>
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
              <span><CheckCircle2 size={14} /> Paper-only draft · no live order is placed</span>
              {extraction ? <div className="bt-row"><a className="bt-secondary small" href={active.sourceUrl ?? url} target="_blank" rel="noreferrer" aria-label="Review strategy source"><ExternalLink size={13} /> Source</a><Link href={backtestHref} className="bt-primary small">
                Backtest this strategy <ArrowRight size={13} />
              </Link></div> : <span className="bt-field-help">Select a template or extract a video first.</span>}
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
