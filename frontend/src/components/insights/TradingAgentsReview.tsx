"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import {
  getSavedStockResearchRun,
  getTradingAgentsReviewHistory,
  requestTradingAgentsReview,
  type TradingAgentsReviewAttempt,
  type StockResearchResult,
} from "@/lib/stock-research";

export function TradingAgentsReview({
  runId,
  symbol,
  onAnalysisUpdated,
}: {
  runId: string;
  symbol: string;
  onAnalysisUpdated: (analysis: StockResearchResult) => void;
}) {
  const [attempts, setAttempts] = useState<TradingAgentsReviewAttempt[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);

  const refreshHistory = useCallback(async (signal?: AbortSignal) => {
    try {
      const history = await getTradingAgentsReviewHistory(symbol, signal);
      if (!signal?.aborted) {
        setAttempts(history.attempts);
        setHistoryError(null);
      }
    } catch (reason: unknown) {
      if (!signal?.aborted) setHistoryError(reason instanceof Error ? reason.message : "Saved AI review history is unavailable.");
    } finally {
      if (!signal?.aborted) setHistoryLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    const controller = new AbortController();
    void getTradingAgentsReviewHistory(symbol, controller.signal)
      .then((history) => {
        if (!controller.signal.aborted) {
          setAttempts(history.attempts);
          setHistoryError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setHistoryError(reason instanceof Error ? reason.message : "Saved AI review history is unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    return () => {
      controller.abort();
      pending.current?.abort();
    };
  }, [symbol]);

  const requestReview = async () => {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError(null);
    let refreshedAnalysis: StockResearchResult | null = null;
    try {
      const result = await requestTradingAgentsReview(runId, controller.signal);
      refreshedAnalysis = result.analysis;
      await refreshHistory(controller.signal);
      if (!controller.signal.aborted && refreshedAnalysis) onAnalysisUpdated(refreshedAnalysis);
    } catch (reason: unknown) {
      const detail = reason instanceof Error
        ? (reason as Error & { detail?: unknown }).detail
        : undefined;
      const sourceRunId = detail !== null && typeof detail === "object"
        ? (detail as Record<string, unknown>).source_run_id
        : null;
      if (typeof sourceRunId === "string") {
        try {
          refreshedAnalysis = await getSavedStockResearchRun(sourceRunId);
        } catch {
          // The attempt remains visible in history even if this saved analysis cannot be reopened.
        }
      }
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "The AI review failed. Try again later.");
        await refreshHistory(controller.signal);
        if (refreshedAnalysis) onAnalysisUpdated(refreshedAnalysis);
      }
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setLoading(false);
      }
    }
  };

  const openAnalysis = async (attempt: TradingAgentsReviewAttempt) => {
    if (!attempt.source_run_id) return;
    try {
      onAnalysisUpdated(await getSavedStockResearchRun(attempt.source_run_id));
    } catch (reason: unknown) {
      setHistoryError(reason instanceof Error ? reason.message : "The saved analysis is unavailable.");
    }
  };

  return <section className="bt-panel" style={{ padding: 20 }} aria-label="TradingAgents review" aria-busy={loading}>
    <div className="stock-research-section-heading">
      <div>
        <span className="bt-eyebrow">TradingAgents v0.7.1 · OpenAI</span>
        <h2>Another view of this research</h2>
        <p>Before each review, Backtrack checks the latest official NSE daily archive and reruns this analysis. The saved data date and sync result stay with the review. OpenAI API usage is billed to your account.</p>
      </div>
      <button type="button" className="bt-primary" disabled={loading} onClick={() => void requestReview()}>
        {loading ? <><LoaderCircle size={15} className="spin" aria-hidden="true" /> Refreshing &amp; reviewing…</> : "Review with AI"}
      </button>
    </div>
    {loading && <p role="status">Checking NSE’s latest published archive, refreshing the analysis, then asking the analysts. This can take a few minutes.</p>}
    {error && <p className="bt-alert-error" role="alert">{error}</p>}

    <div className="stock-research-ai-history" aria-label={`Saved AI review history for ${symbol}`}>
      <h3>Saved review history</h3>
      {historyLoading && <p className="stock-research-muted" role="status">Loading saved reviews…</p>}
      {historyError && <p className="bt-alert-error" role="alert">{historyError}</p>}
      {!historyLoading && !historyError && attempts.length === 0 && <p className="stock-research-muted">No review attempts are saved for {symbol} yet.</p>}
      {attempts.map((attempt) => <details key={attempt.attempt_id} className="stock-research-ai-attempt">
        <summary>
          {new Date(attempt.attempted_at).toLocaleString("en-IN")} · {attempt.status.replaceAll("_", " ")} · data through {attempt.data_as_of ?? "unavailable"}
        </summary>
        <p className="stock-research-muted">NSE refresh: {attempt.sync_status} · requested through {attempt.sync_target_day ?? "—"} · saved through {attempt.latest_trading_day ?? "—"}{attempt.synced_days ? ` · ${attempt.synced_days} new download(s)` : ""}{attempt.skipped_days ? ` · ${attempt.skipped_days} unavailable` : ""}{attempt.model ? ` · ${attempt.model}` : ""}</p>
        {attempt.sync_message && <p>{attempt.sync_message}</p>}
        <p className="stock-research-muted">Attempt <code>{attempt.attempt_id}</code>{attempt.data_hash ? ` · data ${attempt.data_hash.slice(0, 12)}` : ""}{attempt.reviewed_at ? ` · AI text generated ${new Date(attempt.reviewed_at).toLocaleString("en-IN")}` : ""}</p>
        {attempt.cache_hit && <p className="stock-research-muted">Reused a saved AI review because the market data and model were unchanged.</p>}
        {attempt.error && <p className="bt-alert-error" role="status">{attempt.error}</p>}
        {attempt.review && <>
          <p><strong>Review</strong></p>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{attempt.review}</p>
        </>}
        {(attempt.bull_case || attempt.bear_case) && <details>
          <summary>Read the bullish and bearish cases</summary>
          {attempt.bull_case && <><h4>Bullish case</h4><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{attempt.bull_case}</p></>}
          {attempt.bear_case && <><h4>Bearish case</h4><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{attempt.bear_case}</p></>}
        </details>}
        {attempt.source_run_id && <button type="button" className="bt-secondary-btn" onClick={() => void openAnalysis(attempt)}>Open saved analysis</button>}
        {attempt.review && <p className="stock-research-muted">AI-generated research can be wrong. Check it against the saved NSE data before making a decision.</p>}
      </details>)}
    </div>
  </section>;
}
