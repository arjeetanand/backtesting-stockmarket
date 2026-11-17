"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FileSpreadsheet, FileUp, Loader2, Plus, Save, Trash2 } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import {
  getPortfolioSnapshots,
  getPortfolioAnalysis,
  PortfolioHoldingDraft,
  PortfolioAnalysis,
  PortfolioPreview,
  PortfolioSnapshot,
  PortfolioSourceFormat,
  previewPortfolioFile,
  savePortfolioSnapshot,
} from "@/lib/portfolio-api";

type EditableHolding = PortfolioHoldingDraft & { rowId: number };

const ACCEPTED_FILES = ".xlsx,.pdf,.png,.jpg,.jpeg,.gif,.bmp,.tif,.tiff,.webp";

function currency(value: string | number): string {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount)
    : "—";
}

function localDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function isValidHolding(holding: EditableHolding): boolean {
  const quantity = Number(holding.quantity.replaceAll(",", ""));
  const price = Number(holding.average_price.replaceAll(",", ""));
  return Boolean(holding.symbol.trim()) && Number.isFinite(quantity) && quantity > 0 && Number.isFinite(price) && price > 0;
}

function newHolding(rowId: number, holding: Partial<PortfolioHoldingDraft> = {}): EditableHolding {
  return {
    rowId,
    symbol: holding.symbol ?? "",
    quantity: holding.quantity ?? "",
    average_price: holding.average_price ?? "",
    source_row: holding.source_row,
  };
}

export default function PortfolioPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const nextRowId = useRef(1);
  const [rows, setRows] = useState<EditableHolding[]>([]);
  const [sourceFormat, setSourceFormat] = useState<PortfolioSourceFormat>("manual");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getPortfolioSnapshots().then((items) => {
      if (active) setSnapshots(items);
    }).catch((loadError: unknown) => {
      if (active) setHistoryError(loadError instanceof Error ? loadError.message : "Could not load saved portfolios.");
    }).finally(() => {
      if (active) setHistoryLoading(false);
    });
    return () => { active = false; };
  }, []);

  const validRows = useMemo(() => rows.filter(isValidHolding), [rows]);
  const canSave = validRows.length === rows.length && rows.length > 0 && !previewing && !saving;
  const editableTotalCost = useMemo(() => rows.reduce((total, row) => {
    if (!isValidHolding(row)) return total;
    return total + Number(row.quantity.replaceAll(",", "")) * Number(row.average_price.replaceAll(",", ""));
  }, 0), [rows]);

  async function loadAnalysis(snapshotId: string) {
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      setAnalysis(await getPortfolioAnalysis(snapshotId));
    } catch (analysisLoadError) {
      setAnalysis(null);
      setAnalysisError(analysisLoadError instanceof Error ? analysisLoadError.message : "Could not load local portfolio analysis.");
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError(null);
    setMessage(null);
    setPreviewing(true);
    setWarnings([]);
    try {
      const preview: PortfolioPreview = await previewPortfolioFile(file);
      setSourceFormat(preview.source_format);
      setWarnings(preview.warnings);
      setRows(preview.holdings.map((holding) => newHolding(nextRowId.current++, holding)));
      setMessage(`Read ${preview.holdings.length} row${preview.holdings.length === 1 ? "" : "s"} for review. Correct any values before saving.`);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Could not read this file.");
    } finally {
      setPreviewing(false);
    }
  }

  function updateRow(rowId: number, field: "symbol" | "quantity" | "average_price", value: string) {
    setRows((current) => current.map((row) => row.rowId === rowId ? { ...row, [field]: value } : row));
    setError(null);
    setMessage(null);
  }

  function addRow() {
    setRows((current) => [...current, newHolding(nextRowId.current++)]);
    setError(null);
    setMessage(null);
  }

  function removeRow(rowId: number) {
    setRows((current) => current.filter((row) => row.rowId !== rowId));
    setError(null);
    setMessage(null);
  }

  async function confirmSnapshot() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const snapshot = await savePortfolioSnapshot(sourceFormat, rows);
      setSnapshots((current) => [snapshot, ...current.filter((item) => item.snapshot_id !== snapshot.snapshot_id)].slice(0, 20));
      setRows([]);
      setWarnings([]);
      setSourceFormat("manual");
      setMessage(`Portfolio saved with ${snapshot.total_positions} positions and ${currency(snapshot.total_cost_basis)} cost basis.`);
      await loadAnalysis(snapshot.snapshot_id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this portfolio.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="backtrack-page">
    <TopBar />
    <main className="backtrack-content bt-stack">
      <section className="bt-heading-row">
        <div>
          <h1>My portfolio</h1>
          <p>Import a broker statement, check every holding, then save a local snapshot for analysis.</p>
        </div>
      </section>

      {error && <div className="bt-alert-error" role="alert">{error}</div>}
      {message && <div className="bt-alert-success" role="status"><Check size={15} />{message}</div>}

      <section className="bt-panel bt-stack" style={{ padding: 20 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>1. Choose a statement</h2>
          <p style={{ marginTop: 5, color: "var(--bt-muted)", fontSize: 13 }}>
            Supports XLSX, PDF, PNG, JPEG, GIF, BMP, TIFF, and WebP files up to 10 MB. The file is parsed by Backtrack and is not saved or sent to an AI provider.
          </p>
        </div>
        <div className="bt-row-wrap">
          <input ref={fileInput} type="file" accept={ACCEPTED_FILES} onChange={(event) => void handleFileChange(event)} style={{ display: "none" }} aria-label="Choose portfolio statement" />
          <button type="button" className="bt-primary" onClick={() => fileInput.current?.click()} disabled={previewing || saving}>
            {previewing ? <Loader2 size={15} className="spin" /> : <FileUp size={15} />}
            {previewing ? "Reading statement…" : "Choose XLSX, PDF, or image"}
          </button>
          <span style={{ color: "var(--bt-muted)", fontSize: 12 }}>You can also add holdings manually below.</span>
        </div>
        {previewing && <div className="bt-loading-state" role="status"><Loader2 size={16} className="spin" />Parsing locally. Large or scanned statements can take a few seconds.</div>}
      </section>

      <section className="bt-panel bt-stack" style={{ padding: 20 }}>
        <div className="bt-row-between" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>2. Review and edit holdings</h2>
            <p style={{ marginTop: 5, color: "var(--bt-muted)", fontSize: 13 }}>
              {rows.length} row{rows.length === 1 ? "" : "s"} · Estimated cost basis {currency(editableTotalCost)} · Source: {sourceFormat.toUpperCase()}
            </p>
          </div>
          <div className="bt-row-wrap">
            <button type="button" className="bt-secondary" onClick={addRow} disabled={previewing || saving}><Plus size={14} /> Add holding</button>
          </div>
        </div>

        {warnings.length > 0 && <div className="bt-alert-error" role="status"><span>{warnings.join(" ")}</span></div>}

        {rows.length === 0 ? <div className="bt-panel" style={{ padding: 24, textAlign: "center", color: "var(--bt-muted)" }}>
          <FileSpreadsheet size={20} style={{ margin: "0 auto 8px" }} />
          <p>No holdings to review yet. Choose a statement or add a row manually.</p>
        </div> : <div className="bt-table-wrap">
          <table className="bt-table">
            <thead><tr><th>Symbol</th><th>Quantity</th><th>Average buy price (₹)</th><th>Source row</th><th aria-label="Actions" /></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.rowId}>
              <td><input className="bt-field-input" aria-label={`Symbol row ${row.rowId}`} value={row.symbol} maxLength={32} onChange={(event) => updateRow(row.rowId, "symbol", event.target.value)} /></td>
              <td><input className="bt-field-input" aria-label={`Quantity row ${row.rowId}`} type="text" inputMode="decimal" value={row.quantity} onChange={(event) => updateRow(row.rowId, "quantity", event.target.value)} /></td>
              <td><input className="bt-field-input" aria-label={`Average buy price row ${row.rowId}`} type="text" inputMode="decimal" value={row.average_price} onChange={(event) => updateRow(row.rowId, "average_price", event.target.value)} /></td>
              <td>{row.source_row ? `Row ${row.source_row}` : "Manual"}</td>
              <td className="right"><button type="button" className="bt-row-action delete" aria-label={`Remove ${row.symbol || "holding"}`} onClick={() => removeRow(row.rowId)} disabled={saving}><Trash2 size={14} /></button></td>
            </tr>)}</tbody>
          </table>
        </div>}

        <div className="bt-row-between" style={{ flexWrap: "wrap" }}>
          <span style={{ color: "var(--bt-muted)", fontSize: 12 }}>Only confirmed, normalized holdings and cost basis are stored in Backtrack’s local SQLite artifact store.</span>
          <button type="button" className="bt-primary" onClick={() => void confirmSnapshot()} disabled={!canSave}>
            {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
            {saving ? "Saving…" : "3. Confirm and save snapshot"}
          </button>
        </div>
      </section>

      <section className="bt-panel bt-stack" style={{ padding: 20 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Saved portfolio snapshots</h2>
          <p style={{ marginTop: 5, color: "var(--bt-muted)", fontSize: 13 }}>Snapshots stay on this Backtrack installation and remain available after restart.</p>
        </div>
        {historyError && <div className="bt-alert-error" role="alert">{historyError}</div>}
        {historyLoading ? <div className="bt-loading-state" role="status"><Loader2 size={16} className="spin" />Loading saved snapshots…</div> : snapshots.length === 0 ?
          <div style={{ padding: "8px 0", color: "var(--bt-muted)", fontSize: 13 }}>No confirmed snapshots yet.</div> :
          <div className="bt-table-wrap"><table className="bt-table">
            <thead><tr><th>Saved</th><th>Source</th><th className="right">Positions</th><th className="right">Shares</th><th className="right">Cost basis</th><th aria-label="Actions" /></tr></thead>
            <tbody>{snapshots.map((snapshot) => <tr key={snapshot.snapshot_id}>
              <td>{localDate(snapshot.created_at)}</td><td>{snapshot.source_format.toUpperCase()}</td>
              <td className="right">{snapshot.total_positions}</td><td className="right">{snapshot.total_shares}</td>
              <td className="right">{currency(snapshot.total_cost_basis)}</td><td className="right"><button type="button" className="bt-secondary small" onClick={() => void loadAnalysis(snapshot.snapshot_id)} disabled={analysisLoading}>{analysisLoading ? "Loading…" : "Analyze"}</button></td>
            </tr>)}</tbody>
          </table></div>}
      </section>

      <section className="bt-panel bt-stack" style={{ padding: 20 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Local portfolio analysis</h2>
          <p style={{ marginTop: 5, color: "var(--bt-muted)", fontSize: 13 }}>
            Daily NSE closes plus the same fixed long-only rule used in stock research. Levels are conditional, and this view does not rank holdings or suggest allocations.
          </p>
        </div>
        {analysisError && <div className="bt-alert-error" role="alert">{analysisError}</div>}
        {analysisLoading ? <div className="bt-loading-state" role="status"><Loader2 size={16} className="spin" />Analyzing saved holdings against cached daily bars…</div> : !analysis ?
          <div style={{ padding: "8px 0", color: "var(--bt-muted)", fontSize: 13 }}>Save a snapshot or choose Analyze from saved history to see its local daily valuation.</div> : <>
            <div className="bt-row-wrap" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ color: "var(--bt-muted)", fontSize: 12 }}>Data as of {analysis.data_as_of ?? "unavailable"} · {analysis.price_basis}</span>
              <span style={{ color: "var(--bt-muted)", fontSize: 12 }}>{analysis.totals.priced_positions} of {analysis.totals.total_positions} positions priced</span>
            </div>
            {analysis.totals.priced_positions < analysis.totals.total_positions && <div className="bt-alert-error" role="status">Some symbols have no cached daily close. Portfolio market value and unrealized P&amp;L below cover only the priced positions.</div>}
            {analysis.positions.some((position) => position.freshness === "stale") && <div className="bt-alert-error" role="status">One or more cached prices are over five calendar days old. Refresh NSE daily data before relying on those valuations.</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: 10 }}>
              <div className="bt-panel" style={{ padding: 14 }}><small>Full cost basis</small><strong style={{ display: "block", marginTop: 5 }}>{currency(analysis.totals.total_cost_basis)}</strong></div>
              <div className="bt-panel" style={{ padding: 14 }}><small>Market value of priced positions</small><strong style={{ display: "block", marginTop: 5 }}>{currency(analysis.totals.priced_market_value)}</strong></div>
              <div className="bt-panel" style={{ padding: 14 }}><small>Unrealized P&amp;L on priced positions</small><strong style={{ display: "block", marginTop: 5 }}>{currency(analysis.totals.unrealized_pnl_on_priced_positions)}</strong></div>
            </div>
            <div className="bt-table-wrap"><table className="bt-table">
              <thead><tr><th>Holding</th><th className="right">Quantity</th><th className="right">Average / cost basis</th><th className="right">Latest EOD close</th><th className="right">Value / unrealized P&amp;L</th><th>Cached technical context</th><th>Data status</th></tr></thead>
              <tbody>{analysis.positions.map((position) => <tr key={position.symbol}>
                <td><strong>{position.symbol}</strong><br /><span className="bt-val-muted">{position.data_as_of ? `As of ${position.data_as_of}` : "No local bars"}</span></td>
                <td className="right">{position.quantity}</td>
                <td className="right">{currency(position.average_price)} / {currency(position.cost_basis)}</td>
                <td className="right">{position.latest_close ? currency(position.latest_close) : "—"}</td>
                <td className="right">{position.market_value ? <>{currency(position.market_value)}<br /><span className="bt-val-muted">P&amp;L {currency(position.unrealized_pnl ?? "")} ({position.unrealized_pnl_pct ?? "—"}%)</span></> : "—"}</td>
                <td><div>20d {position.indicators.sma20 ? currency(position.indicators.sma20) : "—"} · 50d {position.indicators.sma50 ? currency(position.indicators.sma50) : "—"} · 200d {position.indicators.sma200 ? currency(position.indicators.sma200) : "—"}</div>
                  <div className="bt-val-muted">20 completed months {position.indicators.sma20_completed_months ? currency(position.indicators.sma20_completed_months) : "—"} · Relative volume {position.indicators.relative_volume_20d ? `${position.indicators.relative_volume_20d}×` : "—"}</div>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>{position.observations.map((observation, index) => <li key={`${position.symbol}-${index}`}>{observation}</li>)}</ul>
                  <div style={{ marginTop: 10 }}><strong>Conditional rule review: {position.rule_assessment.status.replaceAll("_", " ")}</strong>
                    <div>Entry {position.rule_assessment.entry_trigger ? currency(position.rule_assessment.entry_trigger) : "—"} · stop {position.rule_assessment.stop_loss ? currency(position.rule_assessment.stop_loss) : "—"} · 1R {position.rule_assessment.target_1r ? currency(position.rule_assessment.target_1r) : "—"} · 2R {position.rule_assessment.target_2r ? currency(position.rule_assessment.target_2r) : "—"}</div>
                    <small>{position.rule_assessment.level_note} Historical validation gate: not evaluated for this portfolio review.</small>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>{position.rule_assessment.reasons.map((reason, index) => <li key={`${position.symbol}-rule-${index}`}>{reason}</li>)}</ul>
                  </div>
                </td>
                <td>{position.freshness === "missing" ? "Missing" : position.freshness === "stale" ? `Stale · ${position.data_age_days} days` : "Daily EOD"}</td>
              </tr>)}</tbody>
            </table></div>
            <p style={{ color: "var(--bt-muted)", fontSize: 12 }}>Moving averages require enough cached daily bars. The monthly average uses 20 completed calendar months; relative volume compares the latest session with the previous 20 sessions. These are descriptive historical measures, not forecasts.</p>
          </>}
      </section>
    </main>
  </div>;
}
