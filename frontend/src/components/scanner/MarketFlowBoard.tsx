"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, GitBranch, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { SymbolCombobox } from "@/components/data/SymbolCombobox";
import {
  inspectMarketFlowSymbol,
  runMarketFlowScan,
  type MarketFlowCandidate,
  type MarketFlowScanResponse,
  type MarketFlowSymbol,
} from "@/lib/scanner-api";

function money(value: number, signed = false): string {
  const absolute = Math.abs(value);
  const amount = absolute >= 10_000_000
    ? `${(absolute / 10_000_000).toFixed(1)} Cr`
    : absolute >= 100_000
      ? `${(absolute / 100_000).toFixed(1)} L`
      : absolute.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  const sign = signed ? (value < 0 ? "−" : value > 0 ? "+" : "") : "";
  return `${sign}₹${amount}`;
}

function dayLabel(value: string | null): string {
  if (!value) return "Unavailable";
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}

function pressureLabel(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function LeaderList({
  title,
  candidates,
  direction,
  selectedSymbol,
  onSelect,
}: {
  title: string;
  candidates: MarketFlowCandidate[];
  direction: "buy" | "sell";
  selectedSymbol: string;
  onSelect: (symbol: string) => void;
}) {
  return (
    <section className={`mf-ranking-list ${direction}`} aria-label={title}>
      <header className="mf-ranking-head">
        <div>
          <h3>{title}</h3>
          <small>{direction === "buy" ? "Largest positive" : "Largest negative"} 20-session estimates</small>
        </div>
        <span>{candidates.length}/20</span>
      </header>
      {candidates.length ? (
        <ol className="mf-ranking-rows">
          {candidates.map((item, index) => (
            <li key={item.symbol}>
              <button
                type="button"
                className={`mf-ranking-row ${selectedSymbol === item.symbol ? "is-selected" : ""}`}
                aria-pressed={selectedSymbol === item.symbol}
                onClick={() => onSelect(item.symbol)}
              >
                <span className="mf-rank-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="mf-ranking-name"><strong>{item.symbol}</strong><small>{item.company_name}</small></span>
                <span className="mf-ranking-value"><strong>{money(item.directional_pressure_inr, true)}</strong><small>Avg traded value {money(item.average_daily_turnover_inr)}/day · {pressureLabel(item.pressure_score_pct)} · {dayLabel(item.data_as_of)}</small></span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mf-list-empty">No symbols on this side of the pressure estimate.</p>
      )}
    </section>
  );
}

function FlowDiagram({
  result,
  selectedSymbol,
  onSelect,
}: {
  result: MarketFlowScanResponse;
  selectedSymbol: string;
  onSelect: (symbol: string) => void;
}) {
  const lanes = [
    { key: "buy" as const, title: "Buy pressure proxy", items: result.buyers.slice(0, 3) },
    { key: "sell" as const, title: "Sell pressure proxy", items: result.sellers.slice(0, 3) },
  ];
  const universeName = result.universe === "all" ? "All local NSE stocks" : result.universe === "nifty50" ? "NIFTY 50" : "NIFTY 500";

  return (
    <section className="bt-panel mf-flow-panel" aria-labelledby="mf-flow-title">
      <header className="mf-panel-heading">
        <div><h2 id="mf-flow-title">Daily pressure flow</h2><p>Choose a leader to inspect its candidate daily zones.</p></div>
        <span className={`mf-coverage-badge ${result.coverage_status}`}>{result.coverage_status} coverage</span>
      </header>
      <div className="mf-flow-diagram" aria-label={`${universeName} splits into buy and sell pressure leaders`}>
        <svg className="mf-flow-connectors" viewBox="0 0 1000 360" preserveAspectRatio="none" aria-hidden="true">
          <path className="buy" d="M190 180 C290 180 300 86 410 86 H970" />
          <path className="sell" d="M190 180 C290 180 300 274 410 274 H970" />
          <circle cx="190" cy="180" r="5" />
        </svg>
        <div className="mf-flow-source">
          <GitBranch size={18} aria-hidden="true" />
          <span>{universeName}</span>
          <strong>{result.ranked_symbols.toLocaleString("en-IN")}</strong>
          <small>stocks scored</small>
        </div>
        {lanes.map((lane) => (
          <section className={`mf-flow-lane ${lane.key}`} key={lane.key} aria-label={lane.title}>
            <h3>{lane.key === "buy" ? <TrendingUp size={15} aria-hidden="true" /> : <TrendingDown size={15} aria-hidden="true" />}{lane.title}</h3>
            {lane.items.length ? (
              <ol>
                {lane.items.map((item, index) => (
                  <li key={item.symbol}>
                    <button
                      type="button"
                      className={`mf-flow-leader ${selectedSymbol === item.symbol ? "is-selected" : ""}`}
                      aria-pressed={selectedSymbol === item.symbol}
                      onClick={() => onSelect(item.symbol)}
                    >
                      <span>{index + 1}</span><strong>{item.symbol}</strong><small>{pressureLabel(item.pressure_score_pct)}</small>
                    </button>
                  </li>
                ))}
              </ol>
            ) : <p className="mf-list-empty">No ranked symbols</p>}
          </section>
        ))}
      </div>
      <p className="mf-flow-caption">Each branch shows the top three of its 20-session ranked list. The ranking estimates daily close pressure; it is not buyer or seller identity data.</p>
    </section>
  );
}

function SelectedSymbolPanel({ symbol }: { symbol: MarketFlowSymbol | null }) {
  return (
    <section className="bt-panel mf-selected-panel" aria-labelledby="mf-selected-title" aria-live="polite">
      <header className="mf-panel-heading">
        <div><h2 id="mf-selected-title">{symbol ? `${symbol.symbol} · candidate daily zones` : "Inspect a stock's daily zones"}</h2><p>Price-action ranges from local daily candles; these are not resting orders or live order blocks.</p></div>
        {symbol?.close !== null && symbol?.close !== undefined && <span className="mf-close-label">Close {money(symbol.close)}</span>}
      </header>
      {!symbol && <p className="mf-list-empty">Run the scan or choose a stock from either ranked list.</p>}
      {symbol?.status === "missing" && (
        <div className="mf-symbol-state"><AlertCircle size={18} aria-hidden="true" /><p>No local daily history is saved for {symbol.symbol}. Import its official NSE history in <Link href="/data">Data &amp; Providers</Link>, then inspect again.</p></div>
      )}
      {symbol?.status === "insufficient_history" && <p className="mf-symbol-state">{symbol.symbol} has {symbol.data_as_of ? `history through ${dayLabel(symbol.data_as_of)}` : "some local history"}, but not enough sessions to evaluate the daily zone rule.</p>}
      {symbol?.status === "ready" && !symbol.zones.length && <p className="mf-symbol-state">No recent valid demand or supply candidate was found in the saved daily candles.</p>}
      {symbol?.status === "ready" && symbol.zones.length > 0 && (
        <div className="mf-zone-list">
          {symbol.zones.map((zone) => (
            <article className="mf-zone-row" key={`${zone.direction}-${zone.confirmed_date}`}>
              <div className="mf-zone-title">
                <span className={`structure-zone-direction ${zone.direction}`}>{zone.direction === "bullish" ? "Demand candidate" : "Supply candidate"}</span>
                <span>{zone.state === "testing" ? "Testing" : zone.state === "retested" ? "Retested" : "Untested"}</span>
              </div>
              <div className="mf-zone-range"><small>DAILY RANGE</small><strong>{money(zone.zone_low)} – {money(zone.zone_high)}</strong></div>
              <div className="mf-zone-detail"><span>Last close <strong>{money(zone.close)}</strong></span><span>Distance <strong>{zone.distance_pct === 0 ? "Inside range" : `${zone.distance_pct.toFixed(2)}%`}</strong></span><span>Confirmed <strong>{dayLabel(zone.confirmed_date)}</strong></span><span>Impulse <strong>{zone.impulse_atr.toFixed(2)}× ATR</strong></span></div>
              <p>A daily close {zone.direction === "bullish" ? "below" : "above"} {money(zone.direction === "bullish" ? zone.zone_low : zone.zone_high)} invalidates this candidate.</p>
              <Link href={`/research?symbol=${encodeURIComponent(symbol.symbol)}&source=market-flow-zones`} className="mf-research-link">Open daily chart in Research ↗</Link>
            </article>
          ))}
        </div>
      )}
      {symbol?.data_as_of && <small className="mf-selected-asof">Local candle date: {dayLabel(symbol.data_as_of)}</small>}
    </section>
  );
}

export default function MarketFlowBoard() {
  const [universe, setUniverse] = useState<MarketFlowScanResponse["universe"]>("all");
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [result, setResult] = useState<MarketFlowScanResponse | null>(null);
  const [selected, setSelected] = useState<MarketFlowSymbol | null>(null);
  const [loading, setLoading] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [symbolError, setSymbolError] = useState<string | null>(null);
  const scanRequest = useRef(0);
  const symbolRequest = useRef(0);

  const inspect = async (symbol: string) => {
    const clean = symbol.trim().toUpperCase().replace(/\.NS$/, "");
    if (!clean) return;
    scanRequest.current += 1;
    const requestId = ++symbolRequest.current;
    setSelectedSymbol(clean);
    setSelected(null);
    setInspecting(true);
    setSymbolError(null);
    try {
      const response = await inspectMarketFlowSymbol(clean);
      if (requestId === symbolRequest.current) setSelected(response);
    } catch (error) {
      if (requestId === symbolRequest.current) setSymbolError(error instanceof Error ? error.message : "Could not inspect this stock.");
    } finally {
      if (requestId === symbolRequest.current) setInspecting(false);
    }
  };

  const scan = async () => {
    const requestId = ++scanRequest.current;
    const symbolId = ++symbolRequest.current;
    setLoading(true);
    setScanError(null);
    setSymbolError(null);
    setResult(null);
    setSelected(null);
    try {
      const response = await runMarketFlowScan({ universe, selectedSymbol: selectedSymbol.trim() || undefined });
      if (requestId === scanRequest.current) {
        setResult(response);
        setSelected(response.selected);
        setSelectedSymbol(response.selected?.symbol ?? selectedSymbol.trim().toUpperCase());
      }
    } catch (error) {
      if (requestId === scanRequest.current) setScanError(error instanceof Error ? error.message : "Could not scan local market history.");
    } finally {
      if (requestId === scanRequest.current) setLoading(false);
      if (symbolId === symbolRequest.current) setInspecting(false);
    }
  };

  const changeUniverse = (value: MarketFlowScanResponse["universe"]) => {
    scanRequest.current += 1;
    symbolRequest.current += 1;
    setUniverse(value);
    setResult(null);
    setSelected(null);
    setLoading(false);
    setInspecting(false);
    setScanError(null);
    setSymbolError(null);
  };

  const changeSymbol = (value: string) => {
    symbolRequest.current += 1;
    setSelectedSymbol(value);
    setSelected(null);
    setInspecting(false);
    setSymbolError(null);
  };

  return (
    <div className="mf-board">
      <section className="bt-panel mf-controls-panel" aria-label="Market flow controls">
        <div className="mf-controls-grid">
          <label className="mf-control-field"><span>Stock universe</span><select className="bt-field-input" value={universe} onChange={(event) => changeUniverse(event.target.value as MarketFlowScanResponse["universe"])}><option value="all">All local NSE stocks</option><option value="nifty500">NIFTY 500</option><option value="nifty50">NIFTY 50</option></select></label>
          <div className="mf-control-field"><span>Inspect any NSE symbol</span><SymbolCombobox value={selectedSymbol} onChange={changeSymbol} label="Stock to inspect" disabled={loading || inspecting} /></div>
          <div className="mf-control-actions">
            <button type="button" className="bt-secondary-btn" onClick={() => void inspect(selectedSymbol)} disabled={!selectedSymbol.trim() || inspecting || loading}>{inspecting ? <RefreshCw size={14} className="spin" /> : null}{inspecting ? "Inspecting…" : "Inspect stock"}</button>
            <button type="button" className="bt-primary" onClick={() => void scan()} disabled={loading}>{loading ? <RefreshCw size={14} className="spin" /> : null}{loading ? "Scanning local bars…" : "Scan pressure flow"}</button>
          </div>
        </div>
        <p className="mf-method-note">Buy/sell pressure is estimated from each daily close position within its high-low range, weighted by traded value, over the latest 20 saved sessions. Daily candles do not contain buyer identities, bid/ask depth, or live orders.</p>
      </section>

      {scanError && <div className="mf-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{scanError}</span></div>}
      {symbolError && <div className="mf-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{symbolError}</span></div>}

      {!result && !loading && !scanError && (
        <div className="mf-empty-state"><GitBranch size={20} aria-hidden="true" /><div><strong>Map daily market pressure</strong><p>Scan the local NSE catalogue to see the strongest positive and negative 20-session estimates, then inspect candidate daily zones for any symbol.</p></div></div>
      )}
      {loading && <div className="mf-empty-state" role="status"><RefreshCw size={18} className="spin" aria-hidden="true" /><div><strong>Scanning saved daily candles</strong><p>All local NSE stocks may take a little longer. The results will show their actual candle dates and coverage.</p></div></div>}

      {result && (
        <>
          <div className="mf-result-strip" role="status">
            <span><strong>{result.ranked_symbols.toLocaleString("en-IN")}</strong> scored</span>
            <span><strong>{result.requested_symbols.toLocaleString("en-IN")}</strong> requested</span>
            <span><strong>{result.missing_symbols.toLocaleString("en-IN")}</strong> without bars</span>
            <span>Latest candle <strong>{dayLabel(result.data_as_of)}</strong></span>
          </div>
          {result.coverage_status !== "complete" && <p className="mf-coverage-note">Coverage is {result.coverage_status}: {result.insufficient_history_symbols} stocks need more than 20 valid sessions. Missing or insufficient history is excluded from the ranking.</p>}
          <FlowDiagram result={result} selectedSymbol={selected?.symbol ?? ""} onSelect={(symbol) => void inspect(symbol)} />
          <SelectedSymbolPanel symbol={selected} />
          <div className="mf-ranking-grid">
            <LeaderList title="Top 20 buy-pressure estimates" candidates={result.buyers} direction="buy" selectedSymbol={selected?.symbol ?? ""} onSelect={(symbol) => void inspect(symbol)} />
            <LeaderList title="Top 20 sell-pressure estimates" candidates={result.sellers} direction="sell" selectedSymbol={selected?.symbol ?? ""} onSelect={(symbol) => void inspect(symbol)} />
          </div>
        </>
      )}
    </div>
  );
}
