"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { fetchWithTimeout } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

type Review = {
  symbol: string;
  data_as_of: string;
  model: string;
  bull_case: string;
  bear_case: string;
  review: string;
};

export function TradingAgentsReview({ runId }: { runId: string }) {
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

  const requestReview = async () => {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError(null);
    setReview(null);
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/stock-research/trading-agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId }),
        signal: controller.signal,
      }, 150_000);
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload?.detail === "string" ? payload.detail : "The AI review is unavailable. Try again later.");
      if (!controller.signal.aborted) setReview(payload as Review);
    } catch (reason: unknown) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "The AI review failed. Try again later.");
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setLoading(false);
      }
    }
  };

  return <section className="bt-panel" style={{ padding: 20 }} aria-label="TradingAgents review" aria-busy={loading}>
    <div className="stock-research-section-heading">
      <div><span className="bt-eyebrow">TradingAgents v0.7.1 · OpenAI</span><h2>Another view of this research</h2><p>Review the bullish and bearish cases from your saved NSE research. Clicking sends its research summary to OpenAI; API usage is billed to your account.</p></div>
      <button type="button" className="bt-primary" disabled={loading} onClick={() => void requestReview()}>
        {loading ? <><LoaderCircle size={15} className="spin" aria-hidden="true" /> Reviewing…</> : "Review with AI"}
      </button>
    </div>
    {loading && <p role="status">The analysts are reviewing the saved research. This can take up to two minutes.</p>}
    {error && <p className="bt-alert-error" role="alert">{error}</p>}
    {review && <div aria-live="polite">
      <p className="stock-research-muted">{review.symbol} · Saved daily data through {review.data_as_of} · {review.model}</p>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{review.review}</p>
      <details><summary>Read the bullish and bearish cases</summary>
        <h3>Bullish case</h3><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{review.bull_case}</p>
        <h3>Bearish case</h3><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{review.bear_case}</p>
      </details>
      <p className="stock-research-muted">AI-generated research can be wrong. Check it against the saved data before making a decision.</p>
    </div>}
  </section>;
}
