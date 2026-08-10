"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  Download,
  Info,
  RefreshCw,
  Table2,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import TopBar from "@/components/layout/TopBar";
import {
  getFiiDiiData,
  getFiiDiiImportStatus,
  startFiiDiiImport,
  type FiiDiiChartPoint,
  type FiiDiiResponse,
  type FiiDiiRow,
  type FiiDiiScope,
  type FiiDiiSegment,
} from "@/lib/fii-dii-api";

type Granularity = "daily" | "weekly" | "monthly";
type Participant = "both" | "FII" | "DII";

const SEGMENTS: Array<{ value: FiiDiiSegment; label: string }> = [
  { value: "equity", label: "Equity" },
  { value: "index_future", label: "Index Future" },
  { value: "index_option", label: "Index Option" },
  { value: "stock_future", label: "Stock Future" },
  { value: "stock_option", label: "Stock Options" },
];

const RANGES = [
  { value: 30, label: "Last 30 Days" },
  { value: 90, label: "Last 3 Months" },
  { value: 180, label: "Last 6 Months" },
  { value: 365, label: "Last 1 Year" },
];

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

const today = new Date().toISOString().slice(0, 10);

function formatCr(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr.`;
}

function formatTableNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return Math.abs(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function netClass(value: number | null | undefined): string {
  return value !== null && value !== undefined && value >= 0 ? "fii-positive" : "fii-negative";
}

function shortDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function weekKey(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function monthKey(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function aggregateChart(rows: FiiDiiRow[], granularity: Granularity): FiiDiiChartPoint[] {
  const grouped = new Map<string, { fii_net: number; dii_net: number }>();
  rows.forEach((row) => {
    const key = granularity === "weekly" ? weekKey(row.date) : granularity === "monthly" ? monthKey(row.date) : row.date;
    const current = grouped.get(key) ?? { fii_net: 0, dii_net: 0 };
    if (row.participant === "FII") current.fii_net += row.net_value;
    if (row.participant === "DII") current.dii_net += row.net_value;
    grouped.set(key, current);
  });
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, values]) => ({
    date,
    label: granularity === "monthly" ? new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) : shortDate(date),
    fii_net: Number(values.fii_net.toFixed(2)),
    dii_net: Number(values.dii_net.toFixed(2)),
  }));
}

function pivotRows(rows: FiiDiiRow[]) {
  const byDate = new Map<string, { date: string; fii?: FiiDiiRow; dii?: FiiDiiRow }>();
  rows.forEach((row) => {
    const current = byDate.get(row.date) ?? { date: row.date };
    if (row.participant === "FII") current.fii = row;
    if (row.participant === "DII") current.dii = row;
    byDate.set(row.date, current);
  });
  return [...byDate.values()].sort((left, right) => right.date.localeCompare(left.date));
}

function exportRows(rows: ReturnType<typeof pivotRows>) {
  const lines = [
    ["Date", "FII Buy Cash (Cr)", "FII Sell Cash (Cr)", "FII Net Cash (Cr)", "DII Buy Cash (Cr)", "DII Sell Cash (Cr)", "DII Net Cash (Cr)"].join(","),
    ...rows.map((row) => [
      row.date,
      row.fii?.buy_value ?? "",
      row.fii?.sell_value ?? "",
      row.fii?.net_value ?? "",
      row.dii?.buy_value ?? "",
      row.dii?.sell_value ?? "",
      row.dii?.net_value ?? "",
    ].join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "backtrack-fii-dii.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function SummaryCard({ label, date, fii, dii }: { label: string; date?: string; fii: number; dii: number }) {
  return (
    <section className="fii-summary-card">
      <div className="fii-summary-head"><strong>{label}</strong><span>{date ? shortDate(date) : "Waiting for data"}</span></div>
      <div className="fii-summary-line"><span>FII</span><b className={netClass(fii)}>{formatCr(fii)}</b></div>
      <div className="fii-summary-line"><span>DII</span><b className={netClass(dii)}>{formatCr(dii)}</b></div>
    </section>
  );
}

function FlowTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return <div className="fii-tooltip"><strong>{label}</strong>{payload.map((entry) => <div key={entry.name}><i style={{ background: entry.color }} />{entry.name}<b>{formatCr(entry.value)}</b></div>)}</div>;
}

export default function FiiDiiPage() {
  const [scope, setScope] = useState<FiiDiiScope>("combined");
  const [segment, setSegment] = useState<FiiDiiSegment>("equity");
  const [participant, setParticipant] = useState<Participant>("both");
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [rangeDays, setRangeDays] = useState(30);
  const [data, setData] = useState<FiiDiiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<{ job_id: string; status: string; message: string } | null>(null);
  const autoImportKey = useRef("");

  const start = isoDaysAgo(rangeDays);
  const rangeLabel = RANGES.find((item) => item.value === rangeDays)?.label ?? "Selected range";
  const importing = job?.status === "queued" || job?.status === "running";

  const loadData = useCallback(async (triggerImport = false) => {
    setLoading(true);
    setError(null);
    try {
      const next = await getFiiDiiData(start, today, scope, segment);
      setData(next);
      const importKey = `${start}:${today}:${scope}`;
      const coverageStartsAfterRequestedRange = Boolean(next.coverage_start && next.coverage_start > start);
      if (triggerImport && (!next.rows.length || coverageStartsAfterRequestedRange) && autoImportKey.current !== importKey) {
        autoImportKey.current = importKey;
        const nextJob = await startFiiDiiImport(start, today, scope);
        setJob({ ...nextJob, status: "queued", message: "Official NSE import queued." });
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not read local FII/DII data.");
    } finally {
      setLoading(false);
    }
  }, [segment, scope, start]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData(true); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    if (!job || !importing) return;
    const timer = window.setInterval(async () => {
      try {
        const next = await getFiiDiiImportStatus(job.job_id);
        setJob(next);
        if (next.status === "complete") void loadData(false);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Could not read the FII/DII import status.");
      }
    }, 1800);
    return () => window.clearInterval(timer);
  }, [importing, job, loadData]);

  const filteredRows = useMemo(() => (data?.rows ?? []).filter((row) => participant === "both" || row.participant === participant), [data?.rows, participant]);
  const tableRows = useMemo(() => pivotRows(filteredRows), [filteredRows]);
  const chartRows = useMemo(() => aggregateChart(filteredRows, granularity), [filteredRows, granularity]);
  const indexByDate = useMemo(() => new Map((data?.nifty50 ?? []).map((item) => [item.date, item.close])), [data?.nifty50]);
  const chart = useMemo(() => chartRows.map((point) => ({ ...point, nifty50: indexByDate.get(point.date) ?? null })), [chartRows, indexByDate]);
  const summary = (period: Granularity) => data?.summaries.find((item) => item.period === period);
  const ready = Boolean(data?.rows.length);

  const manualImport = async () => {
    setError(null);
    try {
      const nextJob = await startFiiDiiImport(start, today, scope);
      setJob({ ...nextJob, status: "queued", message: "Official NSE import queued." });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start the official NSE import.");
    }
  };

  return (
    <div className="backtrack-page fii-page">
      <TopBar />
      <div className="backtrack-content bt-stack">
        <section className="bt-heading-row fii-heading">
          <div>
            <div className="bt-kicker"><span className="live-dot" /> MARKET INSIGHTS</div>
            <h1>FII / DII Data</h1>
            <p>Track institutional cash-market flows against the historical NSE session.</p>
          </div>
          <div className="bt-heading-actions">
            <span className="data-source"><BarChart3 size={14} /> Official NSE report</span>
            <button type="button" className="bt-secondary" onClick={() => void manualImport()} disabled={importing}><RefreshCw size={14} className={importing ? "spin" : ""} /> {importing ? "Importing…" : "Refresh NSE data"}</button>
          </div>
        </section>

        <section className="fii-source-note"><Info size={15} /><span><strong>Provisional institutional activity.</strong> FII/FPI and DII values are reported by NSE and may change after custodial confirmation. This page is for research, not trading instructions.</span><a href={data?.source_url ?? "https://www.nseindia.com/reports/fii-dii/"} target="_blank" rel="noreferrer">NSE source ↗</a></section>

        {data?.coverage_note && <section className="fii-source-note fii-coverage-note"><AlertCircle size={15} /><span>{data.coverage_note}</span></section>}

        <section className="fii-segment-tabs" aria-label="Institutional flow segment">
          {SEGMENTS.map((item) => <button type="button" key={item.value} className={segment === item.value ? "is-active" : ""} onClick={() => setSegment(item.value)}>{item.label}</button>)}
        </section>

        <section className="fii-summary-grid">
          <SummaryCard label="Daily" date={summary("daily")?.end} fii={summary("daily")?.fii_net ?? 0} dii={summary("daily")?.dii_net ?? 0} />
          <SummaryCard label="Weekly" date={summary("weekly")?.end} fii={summary("weekly")?.fii_net ?? 0} dii={summary("weekly")?.dii_net ?? 0} />
          <SummaryCard label="Monthly" date={summary("monthly")?.end} fii={summary("monthly")?.fii_net ?? 0} dii={summary("monthly")?.dii_net ?? 0} />
        </section>

        <section className="fii-controls-row">
          <label className="fii-select-label">Participant
            <select value={participant} onChange={(event) => setParticipant(event.target.value as Participant)}>
              <option value="both">Both FII &amp; DII</option><option value="FII">FII / FPI only</option><option value="DII">DII only</option>
            </select>
          </label>
          <label className="fii-select-label">Scope
            <select value={scope} onChange={(event) => setScope(event.target.value as FiiDiiScope)}>
              <option value="combined">NSE + BSE + MSEI</option><option value="nse_only">NSE only</option>
            </select>
          </label>
          <div className="fii-control-group" aria-label="Chart granularity">{(["daily", "weekly", "monthly"] as Granularity[]).map((item) => <button type="button" key={item} className={granularity === item ? "is-active" : ""} onClick={() => setGranularity(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
          <div className="fii-range-control" aria-label="Date range">{RANGES.map((item) => <button type="button" key={item.value} className={rangeDays === item.value ? "is-active" : ""} onClick={() => setRangeDays(item.value)}>{item.value === 30 ? "30D" : item.value === 90 ? "3M" : item.value === 180 ? "6M" : "1Y"}</button>)}</div>
          <span className="fii-range-label"><CalendarRange size={14} /> {rangeLabel}</span>
        </section>

        {error && <div className="fii-state fii-error" role="alert"><AlertCircle size={18} /><div><strong>FII/DII data needs attention</strong><p>{error}</p></div><button type="button" className="bt-secondary" onClick={() => void loadData(false)}>Retry</button></div>}

        <section className="bt-panel fii-chart-panel">
          <div className="fii-panel-heading"><div><div className="bt-kicker"><BarChart3 size={13} /> FLOW MAP</div><h2>Institutional activity</h2><p>{data?.coverage_start && data?.coverage_end ? `${shortDate(data.coverage_start)} → ${shortDate(data.coverage_end)} · values in ₹ crore` : "Import official NSE rows to populate the chart."}</p></div><div className="fii-chart-legend"><span><i className="fii-legend-fii" />FII</span><span><i className="fii-legend-dii" />DII</span><span><i className="fii-legend-index" />Nifty 50</span></div></div>
          <div className="fii-chart-wrap">
            {loading && <div className="fii-state"><RefreshCw size={19} className="spin" /><span>Reading local NSE insight data…</span></div>}
            {!loading && !ready && <div className="fii-state"><DatabaseIcon /><div><strong>No local FII/DII rows yet</strong><p>Backtrack will archive the official NSE report locally when you refresh the data.</p></div><button type="button" className="bt-primary" onClick={() => void manualImport()} disabled={importing}>{importing ? "Importing…" : "Import official data"}</button></div>}
            {!loading && ready && <ResponsiveContainer width="100%" height={355}><ComposedChart data={chart} margin={{ top: 12, right: 18, left: 0, bottom: 2 }}><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" minTickGap={24} tick={{ fill: "#64748b", fontFamily: "var(--font-jetbrains)", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} /><YAxis yAxisId="flow" orientation="left" tickFormatter={(value) => `${value < 0 ? "−" : ""}${Math.abs(value / 1000).toFixed(1)}k`} tick={{ fill: "#64748b", fontFamily: "var(--font-jetbrains)", fontSize: 10 }} tickLine={false} axisLine={false} /><YAxis yAxisId="index" orientation="right" tickFormatter={(value) => value.toLocaleString("en-IN")} tick={{ fill: "#64748b", fontFamily: "var(--font-jetbrains)", fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip content={<FlowTooltip />} cursor={{ fill: "rgba(79,70,224,.04)" }} /><Legend content={() => null} /><Bar yAxisId="flow" dataKey="fii_net" name="FII" fill="#f59b3d" barSize={16} radius={[3, 3, 0, 0]} /><Bar yAxisId="flow" dataKey="dii_net" name="DII" fill="#5d4df5" barSize={16} radius={[3, 3, 0, 0]} /><Line yAxisId="index" type="monotone" dataKey="nifty50" name="Nifty 50" stroke="#1479ff" strokeWidth={2.25} dot={false} connectNulls={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} /></ComposedChart></ResponsiveContainer>}
          </div>
          {ready && !data?.nifty50.length && <div className="fii-index-note"><Info size={13} /> Nifty 50 archives were not available for this range, so the line is shown only when official index closes are locally stored.</div>}
        </section>

        <section className="bt-panel fii-table-panel">
          <div className="fii-panel-heading"><div><div className="bt-kicker"><Table2 size={13} /> DAILY LEDGER</div><h2>Cash activity by session</h2><p>All values are ₹ crore. Net cash equals buy value minus sell value.</p></div><button type="button" className="bt-secondary" onClick={() => exportRows(tableRows)} disabled={!tableRows.length}><Download size={14} /> Export CSV</button></div>
          {tableRows.length ? <div className="fii-table-scroll"><table><thead><tr><th>Date</th><th>FII Buy Cash (Cr)</th><th>FII Sell Cash (Cr)</th><th>FII Net Cash (Cr)</th><th>DII Buy Cash (Cr)</th><th>DII Sell Cash (Cr)</th><th>DII Net Cash (Cr)</th></tr></thead><tbody>{tableRows.map((row) => <tr key={row.date}><td>{shortDate(row.date)} <small>{new Date(`${row.date}T00:00:00Z`).getUTCFullYear()}</small></td><td>{formatTableNumber(row.fii?.buy_value)}</td><td>{formatTableNumber(row.fii?.sell_value)}</td><td className={netClass(row.fii?.net_value)}>{formatCr(row.fii?.net_value)}</td><td>{formatTableNumber(row.dii?.buy_value)}</td><td>{formatTableNumber(row.dii?.sell_value)}</td><td className={netClass(row.dii?.net_value)}>{formatCr(row.dii?.net_value)}</td></tr>)}</tbody></table></div> : <div className="fii-empty-table">Import data to see the daily institutional activity ledger.</div>}
        </section>

        <footer className="fii-footer"><span><CheckCircle2 size={14} /> Local archive coverage: {data?.coverage_days ?? 0} sessions</span><span>Source: official NSE FII/FPI-DII report · {scope === "combined" ? "NSE + BSE + MSEI" : "NSE only"}</span></footer>
      </div>
    </div>
  );
}

function DatabaseIcon() {
  return <span className="fii-empty-icon"><BarChart3 size={20} /></span>;
}
