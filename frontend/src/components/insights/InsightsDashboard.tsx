"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  Database,
  Info,
  Layers3,
  Map,
  RefreshCw,
  Table2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import SectionArtwork from "@/components/illustrations/SectionArtwork";
import {
  getInsights,
  type InsightCoverageStatus,
  type InsightMember,
  type InsightPeriod,
  type InsightSector,
  type InsightUniverse,
  type InsightsResponse,
  type InsightView,
} from "@/lib/insights-api";

const UNIVERSES: Array<{ value: InsightUniverse; label: string; description: string }> = [
  { value: "nifty50", label: "NIFTY 50", description: "Large-cap benchmark" },
  { value: "sensex", label: "Sensex", description: "BSE large-cap benchmark" },
  { value: "banknifty", label: "Bank Nifty", description: "Banking sector index" },
  { value: "nifty500", label: "NIFTY 500", description: "Broad local universe" },
];

const PERIODS: Array<{ value: InsightPeriod; label: string }> = [
  { value: "1D", label: "1D" },
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
];

function formatPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "−"}${Math.abs(value * 100).toFixed(digits)}%`;
}

function formatDate(value: string | null): string {
  if (!value) return "Date unavailable";
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function returnTone(value: number | null): "positive" | "negative" | "neutral" {
  if (value === null || Math.abs(value) < 0.000001) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function toneFromRange(value: number | null, values: Array<number | null>): CSSProperties {
  if (value === null) return { "--insights-tile-color": "#f1f5f9", "--insights-tile-ink": "#64748b" } as CSSProperties;
  const finite = values.filter((item): item is number => item !== null && Number.isFinite(item));
  const max = Math.max(...finite.map((item) => Math.abs(item)), 0.0001);
  const alpha = Math.min(0.74, 0.18 + (Math.abs(value) / max) * 0.5);
  const color = value >= 0 ? `rgba(5, 150, 105, ${alpha})` : `rgba(225, 29, 72, ${alpha})`;
  const ink = Math.abs(value) / max > 0.62 ? "#ffffff" : value >= 0 ? "#065f46" : "#9f1239";
  return { "--insights-tile-color": color, "--insights-tile-ink": ink } as CSSProperties;
}

function coverageLabel(status: InsightCoverageStatus): string {
  if (status === "ready") return "Complete coverage";
  if (status === "partial") return "Partial coverage";
  if (status === "stale") return "Stale local data";
  if (status === "empty") return "No local bars";
  return "Unavailable";
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "The local Insights request timed out. Check the backend and retry.";
  if (error instanceof TypeError && error.message === "Failed to fetch") return "Local Backtrack API is unavailable. Start the backend on port 8000, then retry.";
  return error instanceof Error ? error.message : "Could not load local index insights.";
}

function InsightState({
  kind,
  message,
  onRetry,
}: {
  kind: "loading" | "empty" | "unavailable";
  message?: string;
  onRetry?: () => void;
}) {
  const copy = kind === "loading"
    ? { title: "Reading local NSE bars", body: "Calculating returns and breadth for the selected index." }
    : kind === "empty"
      ? { title: "No local bars for this universe", body: "Import the official NSE daily archive for the selected members, then return here." }
      : { title: "Insights are unavailable", body: message ?? "The local API did not return an Insights snapshot." };
  return (
    <div className={`insights-state insights-state-${kind}`} role={kind === "unavailable" ? "alert" : undefined}>
      {kind === "empty" ? <SectionArtwork src="/illustrations/market-insights.png" className="bt-insights-empty-art" /> : kind === "loading" ? <RefreshCw size={22} className="spin" aria-hidden="true" /> : kind === "unavailable" ? <AlertCircle size={22} aria-hidden="true" /> : null}
      <div>
        <strong>{copy.title}</strong>
        <p>{kind === "empty" ? message ?? copy.body : copy.body}</p>
      </div>
      {kind === "empty" ? <Link href="/data" className="bt-dashboard-text-link">Import NSE history <ArrowRight size={14} /></Link> : null}
      {kind === "unavailable" && onRetry ? <button type="button" className="bt-secondary" onClick={onRetry}>Retry</button> : null}
    </div>
  );
}

function BreadthCard({ label, value, icon, tone, subValue }: { label: string; value: string; icon: ReactNode; tone: "positive" | "negative" | "neutral"; subValue: string }) {
  return (
    <article className={`insights-breadth-card is-${tone}`}>
      <div className="insights-breadth-card-head"><span>{label}</span><span className="insights-breadth-icon">{icon}</span></div>
      <strong>{value}</strong>
      <small>{subValue}</small>
    </article>
  );
}

function HeatmapTile({
  label,
  detail,
  value,
  values,
  active,
  onClick,
}: {
  label: string;
  detail: string;
  value: number | null;
  values: Array<number | null>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`insights-heatmap-tile is-${returnTone(value)}${active ? " is-selected" : ""}`}
      style={toneFromRange(value, values)}
      onClick={onClick}
      aria-pressed={active}
      title={`${label}: ${formatPercent(value)}`}
    >
      <span>{label}</span>
      <strong>{formatPercent(value)}</strong>
      <small>{detail}</small>
    </button>
  );
}

function MemberTable({ members, selectedSymbol, onSelect }: { members: InsightMember[]; selectedSymbol: string | null; onSelect: (symbol: string) => void }) {
  if (!members.length) return <div className="insights-inline-empty">No available members in this view.</div>;
  return (
    <div className="insights-table-scroll">
      <table className="insights-table">
        <caption className="sr-only">Top movers for the selected index and period</caption>
        <thead><tr><th scope="col">Stock</th><th scope="col">Sector</th><th scope="col">Return</th><th scope="col">Data</th></tr></thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.symbol} className={selectedSymbol === member.symbol ? "is-selected" : ""}>
              <td><button type="button" className="insights-stock-button" onClick={() => onSelect(member.symbol)} aria-pressed={selectedSymbol === member.symbol}><strong>{member.symbol}</strong><small>{member.companyName}</small></button></td>
              <td><span className="insights-sector-label">{member.sector}</span></td>
              <td className={`insights-return is-${returnTone(member.returnFraction)}`}>{formatPercent(member.returnFraction)}</td>
              <td className="insights-date-cell">{member.dataAsOf ? formatDate(member.dataAsOf) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectorTable({ sectors }: { sectors: InsightSector[] }) {
  if (!sectors.length) return <div className="insights-inline-empty">Sector classifications are unavailable for this snapshot.</div>;
  return (
    <div className="insights-table-scroll">
      <table className="insights-table">
        <caption className="sr-only">Sector performance for the selected index and period</caption>
        <thead><tr><th scope="col">Sector</th><th scope="col">Members</th><th scope="col">Return</th><th scope="col">Breadth</th></tr></thead>
        <tbody>
          {sectors.map((sector) => (
            <tr key={sector.sector}>
              <td><strong>{sector.sector}</strong></td>
              <td className="insights-mono-cell">{sector.stockCount || "—"}</td>
              <td className={`insights-return is-${returnTone(sector.returnFraction)}`}>{formatPercent(sector.returnFraction)}</td>
              <td className="insights-mono-cell">{sector.gainers} / {sector.losers}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function InsightsDashboard() {
  const [universe, setUniverse] = useState<InsightUniverse>("nifty50");
  const [period, setPeriod] = useState<InsightPeriod>("1D");
  const [view, setView] = useState<InsightView>("stock");
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await getInsights(universe, period);
      setData(next);
      setSelectedKey(null);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [period, universe]);

  useEffect(() => {
    let cancelled = false;
    getInsights(universe, period)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setSelectedKey(null);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [period, universe]);

  const selectedUniverse = UNIVERSES.find((item) => item.value === universe) ?? UNIVERSES[0];
  const visibleMembers = useMemo(() => {
    const members = data?.members ?? [];
    if (view === "sector" && selectedKey) return members.filter((member) => member.sector === selectedKey);
    return members;
  }, [data?.members, selectedKey, view]);
  const heatmapItems = view === "stock" ? data?.members ?? [] : data?.sectors ?? [];
  const heatmapValues = heatmapItems.map((item) => item.returnFraction);
  const selectedMember = view === "stock" ? data?.members.find((member) => member.symbol === selectedKey) : null;
  const hasResult = Boolean(data && data.members.length);
  const unavailable = Boolean(error && !data);
  const resultStatus = data?.coverageStatus ?? "empty";

  const selectUniverse = (next: InsightUniverse) => {
    setLoading(true);
    setError(null);
    setUniverse(next);
    setSelectedKey(null);
  };

  const selectPeriod = (next: InsightPeriod) => {
    setLoading(true);
    setError(null);
    setPeriod(next);
    setSelectedKey(null);
  };

  const retry = () => {
    setLoading(true);
    setError(null);
    void load();
  };

  return (
    <div className="backtrack-page insights-page">
      <div className="backtrack-content insights-content">
        <section className="bt-heading-row insights-heading">
          <div>
            <div className="bt-kicker"><Activity size={13} /> MARKET INSIGHTS</div>
            <h1>Market breadth at a glance</h1>
            <p>See how the selected index moved using locally imported official NSE daily bars.</p>
          </div>
          <div className="insights-source-badge"><Database size={14} /> Local NSE daily data</div>
        </section>

        <section className="insights-universe-panel bt-panel" aria-label="Index selector">
          <div className="insights-panel-label"><span>INDEX UNIVERSE</span><small>{selectedUniverse.description}</small></div>
          <div className="insights-universe-tabs" role="tablist" aria-label="Select an index universe">
            {UNIVERSES.map((item) => <button type="button" role="tab" aria-selected={universe === item.value} key={item.value} className={universe === item.value ? "is-active" : ""} onClick={() => selectUniverse(item.value)}>{item.label}</button>)}
          </div>
          <div className="insights-period-control">
            <span>PERIOD</span>
            <div className="insights-period-tabs" role="group" aria-label="Select return period">
              {PERIODS.map((item) => <button type="button" key={item.value} className={period === item.value ? "is-active" : ""} onClick={() => selectPeriod(item.value)}>{item.label}</button>)}
            </div>
          </div>
        </section>

        {error && data ? <div className="insights-alert" role="alert"><AlertCircle size={16} /><span>{error} Showing the last successful snapshot.</span><button type="button" onClick={retry}>Retry</button></div> : null}
        {loading && !data ? <InsightState kind="loading" /> : null}
        {unavailable ? <InsightState kind="unavailable" message={error ?? undefined} onRetry={retry} /> : null}
        {!loading && !unavailable && data && !hasResult ? <InsightState kind="empty" message={data.message ?? undefined} /> : null}

        {data && hasResult ? <>
          <section className="insights-status-strip" aria-live="polite">
            <span className={`insights-status-dot is-${resultStatus}`} aria-hidden="true" />
            <strong>{coverageLabel(resultStatus)}</strong>
            <span>{data.availableSymbols} of {data.totalSymbols || data.availableSymbols} members available</span>
            {data.missingSymbols > 0 ? <span className="insights-missing-note">{data.missingSymbols} missing</span> : null}
            <span className="insights-status-date">Data as of <b>{formatDate(data.dataAsOf)}</b></span>
          </section>

          <section className="insights-breadth-grid" aria-label="Market breadth summary">
            <BreadthCard label="Gainers" value={String(data.breadth.gainers)} icon={<TrendingUp size={16} />} tone="positive" subValue={`${formatPercent(data.breadth.gainers && data.members.length ? data.breadth.gainers / data.members.length : null)} of available`} />
            <BreadthCard label="Losers" value={String(data.breadth.losers)} icon={<TrendingDown size={16} />} tone="negative" subValue={`${formatPercent(data.breadth.losers && data.members.length ? data.breadth.losers / data.members.length : null)} of available`} />
            <BreadthCard label="Unchanged" value={String(data.breadth.unchanged)} icon={<Activity size={16} />} tone="neutral" subValue="No price change" />
            <BreadthCard label="Advances / declines" value={`${data.breadth.advances} / ${data.breadth.declines}`} icon={<ArrowUpRight size={16} />} tone={data.breadth.advances >= data.breadth.declines ? "positive" : "negative"} subValue="Member breadth" />
          </section>

          <section className="insights-main-grid">
            <div className="bt-panel insights-heatmap-panel">
              <div className="insights-panel-heading">
                <div><div className="bt-kicker"><Map size={13} /> RETURN HEATMAP</div><h2>{view === "stock" ? "Stocks" : "Sectors"} in {selectedUniverse.label}</h2><p>Tile color shows price return for {period}; tiles are equal-sized because local weights are not assumed.</p></div>
                <div className="insights-view-toggle" role="group" aria-label="Heatmap mode"><button type="button" className={view === "stock" ? "is-active" : ""} onClick={() => { setView("stock"); setSelectedKey(null); }}><Layers3 size={13} /> Stocks</button><button type="button" className={view === "sector" ? "is-active" : ""} onClick={() => { setView("sector"); setSelectedKey(null); }}><Map size={13} /> Sectors</button></div>
              </div>
              <div className="insights-heatmap" aria-label={`${view} return heatmap`}>
                {heatmapItems.length ? heatmapItems.map((item) => {
                  const label = "symbol" in item ? item.symbol : item.sector;
                  const detail = "symbol" in item ? item.sector : `${item.stockCount} stocks`;
                  return <HeatmapTile key={label} label={label} detail={detail} value={item.returnFraction} values={heatmapValues} active={selectedKey === label} onClick={() => setSelectedKey(label)} />;
                }) : <div className="insights-inline-empty">No heatmap rows are available for this selection.</div>}
              </div>
              <div className="insights-heatmap-legend"><span><i className="is-loss" /> Lower return</span><span><i className="is-neutral" /> Unchanged</span><span><i className="is-gain" /> Higher return</span><small>Click a tile to filter the table below.</small></div>
            </div>

            <aside className="bt-panel insights-detail-panel">
              <div className="bt-kicker"><Table2 size={13} /> SELECTED DETAIL</div>
              {selectedMember ? <><h2>{selectedMember.symbol}</h2><p>{selectedMember.companyName}</p><div className={`insights-detail-return is-${returnTone(selectedMember.returnFraction)}`}>{formatPercent(selectedMember.returnFraction)}</div><dl className="insights-detail-list"><div><dt>Sector</dt><dd>{selectedMember.sector}</dd></div><div><dt>Data date</dt><dd>{formatDate(selectedMember.dataAsOf)}</dd></div><div><dt>Universe</dt><dd>{selectedUniverse.label}</dd></div></dl></> : selectedKey && view === "sector" ? <><h2>{selectedKey}</h2><p>Sector aggregation for selected index.</p><div className={`insights-detail-return is-${returnTone(data.sectors.find((sector) => sector.sector === selectedKey)?.returnFraction ?? null)}`}>{formatPercent(data.sectors.find((sector) => sector.sector === selectedKey)?.returnFraction ?? null)}</div><dl className="insights-detail-list"><div><dt>Members</dt><dd>{data.sectors.find((sector) => sector.sector === selectedKey)?.stockCount ?? "—"}</dd></div><div><dt>Breadth</dt><dd>{data.sectors.find((sector) => sector.sector === selectedKey)?.gainers ?? 0} / {data.sectors.find((sector) => sector.sector === selectedKey)?.losers ?? 0}</dd></div></dl></> : <div className="insights-detail-empty"><Info size={18} /><strong>Select a tile</strong><p>Choose a stock or sector to inspect it and filter the movers table.</p></div>}
            </aside>
          </section>

          <section className="bt-panel insights-movers-panel">
            <div className="insights-panel-heading"><div><div className="bt-kicker"><ArrowDownRight size={13} /> TOP MOVERS</div><h2>{selectedKey && view === "sector" ? `${selectedKey} movers` : "Strongest moves"}</h2><p>{period} price returns ranked by absolute move from the available local bars.</p></div><span className="insights-row-count">{visibleMembers.length} rows</span></div>
            {view === "stock" ? <MemberTable members={(selectedKey ? (selectedMember ? [selectedMember] : visibleMembers) : data.topMovers)} selectedSymbol={selectedKey} onSelect={setSelectedKey} /> : <SectorTable sectors={data.sectors.filter((sector) => !selectedKey || sector.sector === selectedKey)} />}
          </section>

          <div className="insights-footnote"><Info size={14} /><span>Research-only view. Returns are calculated from locally imported daily candles; no live quotes or synthetic prices are used.</span></div>
        </> : null}
      </div>
    </div>
  );
}
