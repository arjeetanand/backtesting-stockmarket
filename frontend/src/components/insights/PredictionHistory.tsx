"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Clock3, RefreshCw } from "lucide-react";
import { getTrackedPredictions, type TrackedPrediction } from "@/lib/prediction-tracking";

const date = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const money = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const percent = (value: number | null) => value == null ? "—" : `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;

const touchCopy: Record<TrackedPrediction["touch_state"], string> = {
  no_touch: "No level touched",
  target_hit: "Target level touched",
  stop_hit: "Stop level touched",
  ambiguous_touch: "Both levels in one daily candle",
};
const entryCopy: Record<TrackedPrediction["entry_trigger_state"], string> = {
  triggered_at_signal: "Entry condition met on signal close",
  reached_after_signal: "Entry reference reached after signal",
  not_reached_yet: "Entry reference not reached yet",
  not_reached_in_window: "Entry reference not reached in window",
};

export function PredictionHistory() {
  const [predictions, setPredictions] = useState<TrackedPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPredictions(await getTrackedPredictions());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load saved setup tracking.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void getTrackedPredictions().then((records) => {
      if (active) setPredictions(records);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not load saved setup tracking.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return <section className="stock-research-ledger bt-panel" aria-labelledby="prediction-history-title">
    <div className="stock-research-section-heading">
      <div><span className="bt-eyebrow">FORWARD TRACKING</span><h2 id="prediction-history-title">Did the setup move as expected?</h2><p>Completed watch and triggered setups are saved automatically. New completed NSE sessions update the 20-session observation window.</p></div>
      <button className="bt-secondary" type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh setup tracking"><RefreshCw size={13} className={loading ? "spin" : ""} aria-hidden="true" /> Refresh</button>
    </div>
    <p className="stock-research-muted">These are price movements and daily level touches from the saved signal close, not simulated fills, portfolio returns, or AI accuracy. OHLCV alone cannot explain why price moved. If stop and target both fall inside one daily candle, the exact order is unknown.</p>
    {error && <p className="stock-research-ledger-error" role="alert"><AlertTriangle size={14} aria-hidden="true" /> {error}</p>}
    {!error && !predictions.length && !loading && <div className="stock-research-empty-inline"><Clock3 size={15} aria-hidden="true" />No eligible watch or triggered setups have been tracked yet. Run a fresh analysis after syncing NSE data.</div>}
    {predictions.length > 0 && <div className="bt-table-wrap"><table className="bt-table"><thead><tr><th>Stock · signal date</th><th>Recorded levels</th><th>Forward window</th><th>Price change from signal close</th><th>Entry &amp; observed path</th><th>Why it qualified</th></tr></thead><tbody>{predictions.map((item) => <tr key={item.prediction_id}>
      <td><strong>{item.symbol}</strong><small>{date(item.data_as_of)} · {item.setup_status.replaceAll("_", " ")}</small><small>Historical gate: {item.validation_status.replaceAll("_", " ")}</small></td>
      <td><small>Entry {money(item.entry_trigger)}</small><small>Stop {money(item.stop_loss)}</small><small>2R target {money(item.target_2r)}</small></td>
      <td>{item.status === "completed" ? `${item.horizon_sessions} sessions · through ${date(item.evaluated_through)}` : `${item.observed_sessions}/${item.horizon_sessions} sessions · pending`}</td>
      <td><strong>{percent(item.forward_return_pct)}</strong><small>Best {percent(item.max_favorable_move_pct)} · worst {percent(item.max_adverse_move_pct)}</small></td>
      <td><strong>{entryCopy[item.entry_trigger_state]}</strong>{item.entry_trigger_date && <small>{date(item.entry_trigger_date)}</small>}<small>{item.path_summary}</small><small>{touchCopy[item.touch_state]}{item.touch_date ? ` · ${date(item.touch_date)}` : ""}</small></td>
      <td><details><summary>Rule reasons</summary><ul>{item.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>{item.validation_reasons.length > 0 && <><strong>Historical gate</strong><ul>{item.validation_reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></>}</details></td>
    </tr>)}</tbody></table></div>}
  </section>;
}
