"use client";

import { useState } from "react";
import SelectMenu from "@/components/ui/SelectMenu";
import {
  createGlobalMarketBrief,
  loadGlobalMarketBriefs,
  type GlobalMarketBriefData,
  type GlobalMarketTopic,
} from "@/lib/global-market";

export default function GlobalMarketBrief({ symbol }: { symbol?: string }) {
  const [topic, setTopic] = useState<GlobalMarketTopic>("global");
  const [brief, setBrief] = useState<GlobalMarketBriefData | null>(null);
  const [busy, setBusy] = useState<"create" | "load" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selectedSymbol = symbol?.trim().toUpperCase().replace(/\.NS$/, "") || undefined;
  const currentBrief = brief?.topic === topic && (brief.symbol || undefined) === selectedSymbol ? brief : null;

  async function run(action: "create" | "load") {
    if (busy) return;
    setBusy(action);
    setError("");
    setMessage("");
    try {
      if (action === "create") {
        setBrief(await createGlobalMarketBrief(topic, selectedSymbol));
        setMessage("Source-linked brief saved locally.");
      } else {
        const saved = await loadGlobalMarketBriefs(topic, selectedSymbol);
        setBrief(saved.briefs[0] ?? null);
        setMessage(saved.briefs.length ? "Showing the latest saved brief. Loading it makes no OpenAI request." : "No saved brief for this topic and stock yet.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The market brief request could not complete.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="bt-panel" style={{ padding: 20 }} aria-labelledby="global-market-brief-title">
      <div className="bt-row-between" style={{ flexWrap: "wrap" }}>
        <h2 id="global-market-brief-title">Global market context</h2>
        <span className="bt-panel-note">Optional web research</span>
      </div>
      <p className="bt-panel-note">Creating a brief sends only the selected market topic and optional NSE symbol to OpenAI. API and web-search charges apply. Your portfolio, local prices and trading history are excluded.</p>
      <p className="bt-panel-note">A backend OPENAI_API_KEY is required. Nothing is searched automatically. News context may be delayed and does not update the local NSE price cache.</p>
      <div className="bt-row-between" style={{ gap: 12, flexWrap: "wrap" }}>
        <label className="bt-panel-note">
          Market topic{" "}
          <SelectMenu aria-label="Market topic" className="bt-field-input" value={topic} disabled={busy !== null} onChange={(event) => {
            setTopic(event.target.value as GlobalMarketTopic);
            setBrief(null);
            setError("");
            setMessage("");
          }}>
            <option value="global">Global overview</option>
            <option value="equities">World equities</option>
            <option value="rates">Rates and currencies</option>
            <option value="commodities">Commodities</option>
          </SelectMenu>
        </label>
        <span className="bt-panel-note">{selectedSymbol ? `Stock context: ${selectedSymbol}` : "No stock context selected"}</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="bt-secondary" disabled={busy !== null} onClick={() => void run("load")}>
            {busy === "load" ? "Loading saved brief…" : "Load saved brief"}
          </button>
          <button type="button" className="bt-primary" disabled={busy !== null} onClick={() => void run("create")}>
            {busy === "create" ? "Searching sources…" : "Create brief · API charges apply"}
          </button>
        </div>
      </div>
      <div aria-live="polite" aria-busy={busy !== null}>
        {error && <p role="alert">{error}</p>}
        {message && <p className="bt-panel-note">{message}</p>}
        {!currentBrief && !message && !busy && <p className="bt-panel-note">Create a source-linked brief when needed, or load one already saved on this computer.</p>}
        {currentBrief && (
          <article>
            <p className="bt-panel-note">Saved {new Date(currentBrief.created_at).toLocaleString("en-IN")} · {currentBrief.model} · News context, not a forecast</p>
            <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.6 }}>{currentBrief.text}</div>
            <h3>Sources returned by web search</h3>
            <ul>{currentBrief.citations.map((citation) => (
              <li key={citation.url}><a href={citation.url} target="_blank" rel="noopener noreferrer">{citation.title}</a></li>
            ))}</ul>
          </article>
        )}
      </div>
    </section>
  );
}
