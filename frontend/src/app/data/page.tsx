"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, Database, Download, RefreshCw, Search } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { fetchWithTimeout } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
const fullHistoryStart = "2000-01-01";
const today = new Date().toISOString().slice(0, 10);
const currentYear = new Date().getFullYear();
const dateYearsAgo = (years: number) => {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
};
const DATA_CLIENT_CACHE_TTL = 30_000;
const DATA_CLIENT_CACHE_VERSION = "backtrack:data-page:v2";

type CacheStatus = { symbols: number; bars: number; earliest: string | null; latest: string | null };
type ImportStatus = { job_id: string; status: string; message: string; symbols?: number; downloaded_days?: number; skipped_days?: number; stored_bars?: number; already_available_days?: number; reused_archive_days?: number; archive_rows?: number; stage?: string; completed_days?: number; total_days?: number };
type InventoryItem = { symbol: string; company_name: string | null; industry: string | null; bars: number; earliest: string | null; latest: string | null; cached_days: number; requested_days: number; missing_days: number; fully_available: boolean };
type ClientCacheEntry = { value: unknown; expiresAt: number };

const dataClientMemory = new Map<string, ClientCacheEntry>();
const dataClientRequests = new Map<string, Promise<unknown>>();

function readStoredData<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${DATA_CLIENT_CACHE_VERSION}:${key}`);
    if (!raw) return null;
    const entry = JSON.parse(raw) as ClientCacheEntry;
    return entry.expiresAt > Date.now() ? entry.value as T : null;
  } catch {
    return null;
  }
}

function writeStoredData(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${DATA_CLIENT_CACHE_VERSION}:${key}`, JSON.stringify({ value, expiresAt: Date.now() + DATA_CLIENT_CACHE_TTL }));
  } catch {
    // Session storage is optional.
  }
}

function invalidateDataClientCache(): void {
  dataClientMemory.clear();
  if (typeof window === "undefined") return;
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(`${DATA_CLIENT_CACHE_VERSION}:`)) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Session storage is optional.
  }
}

async function fetchDataJson<T>(key: string, url: string, timeoutMs: number, force = false): Promise<T> {
  if (!force) {
    const memoryEntry = dataClientMemory.get(key);
    if (memoryEntry && memoryEntry.expiresAt > Date.now()) return memoryEntry.value as T;
    const storedValue = readStoredData<T>(key);
    if (storedValue !== null) return storedValue;
    const activeRequest = dataClientRequests.get(key);
    if (activeRequest) return activeRequest as Promise<T>;
  }
  const request = fetchWithTimeout(url, {}, timeoutMs).then(async (response) => {
    if (!response.ok) throw new Error(`Data request failed (${response.status}).`);
    const value = await response.json() as T;
    dataClientMemory.set(key, { value, expiresAt: Date.now() + DATA_CLIENT_CACHE_TTL });
    writeStoredData(key, value);
    return value;
  }).finally(() => dataClientRequests.delete(key));
  dataClientRequests.set(key, request);
  return request;
}

export default function DataPage() {
  const [cache, setCache] = useState<CacheStatus | null>(null);
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [job, setJob] = useState<ImportStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catalogueMessage, setCatalogueMessage] = useState<string | null>(null);
  const [bootstrapRange, setBootstrapRange] = useState("all");
  const [customStart, setCustomStart] = useState(dateYearsAgo(4));
  const [customEnd, setCustomEnd] = useState(today);
  const [bootstrapBusy, setBootstrapBusy] = useState(false);
  const inventoryRequestId = useRef(0);

  const importing = job?.status === "queued" || job?.status === "running";
  const customDateError = bootstrapRange === "custom" && (!customStart || !customEnd || customStart > customEnd);

  const selectedDownloadRange = () => {
    if (bootstrapRange === "all") return { start: fullHistoryStart, end: today, label: "all history from 2000" };
    if (bootstrapRange === "4y") return { start: dateYearsAgo(4), end: today, label: "the last 4 years" };
    if (bootstrapRange === "1y") return { start: dateYearsAgo(1), end: today, label: "the last 1 year" };
    if (bootstrapRange.startsWith("year:")) {
      const year = bootstrapRange.slice(5);
      return { start: `${year}-01-01`, end: Number(year) === currentYear ? today : `${year}-12-31`, label: `${year} history` };
    }
    return { start: customStart, end: customEnd, label: `${customStart} to ${customEnd}` };
  };

  const refreshCache = useCallback(async (force = false) => {
    try {
      setCache(await fetchDataJson<CacheStatus>("cache-status", `${API_BASE_URL}/data/cache`, 6_000, force));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not read the local data service.");
    }
  }, []);

  const refreshInventory = useCallback(async (force = false) => {
    const query = inventoryQuery.trim().toUpperCase();
    const requestId = inventoryRequestId.current + 1;
    inventoryRequestId.current = requestId;
    if (!query) {
      setInventory([]);
      setInventoryLoading(false);
      return;
    }
    setInventoryLoading(true);
    try {
      const key = `inventory:${query}`;
      const result = await fetchDataJson<InventoryItem[]>(key, `${API_BASE_URL}/data/inventory?query=${encodeURIComponent(query)}&limit=50`, 15_000, force);
      if (requestId === inventoryRequestId.current) setInventory(result);
    } catch (requestError) {
      if (requestId === inventoryRequestId.current) setError(requestError instanceof Error ? requestError.message : "Could not read saved stocks.");
    } finally {
      if (requestId === inventoryRequestId.current) setInventoryLoading(false);
    }
  }, [inventoryQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshCache(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshCache]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshInventory(); }, 250);
    return () => window.clearTimeout(timer);
  }, [inventoryQuery, refreshInventory]);

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`${API_BASE_URL}/data/nse-import/${job.job_id}`);
      if (!response.ok) return;
      const next = await response.json() as ImportStatus;
      setJob(next);
      if (["complete", "failed"].includes(next.status)) {
        invalidateDataClientCache();
        void refreshCache(true);
        void refreshInventory(true);
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [job, refreshCache, refreshInventory]);

  const downloadHistoricalData = async () => {
    if (customDateError) {
      setError("Choose a valid start and end date. The start date must be before the end date.");
      return;
    }
    const { start: selectedStart, end: selectedEnd, label } = selectedDownloadRange();
    setError(null);
    setBootstrapBusy(true);
    try {
      const catalogueResponse = await fetch(`${API_BASE_URL}/data/instruments/refresh`, { method: "POST" });
      const cataloguePayload = await catalogueResponse.json() as { instruments?: number; detail?: string };
      if (!catalogueResponse.ok) throw new Error(cataloguePayload.detail ?? "Could not refresh the official NSE stock list.");
      setCatalogueMessage(`${cataloguePayload.instruments ?? 0} NSE stocks found. Checking saved history…`);

      const response = await fetch(`${API_BASE_URL}/data/nse-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: selectedStart, end: selectedEnd, preset: "nse_equities", symbols: [] }),
      });
      const payload = await response.json() as ImportStatus & { detail?: string };
      if (!response.ok) throw new Error(payload.detail ?? "Could not start the NSE history import.");
      setJob({ ...payload, message: `Queued ${label} for ${payload.symbols?.toLocaleString("en-IN") ?? "all"} NSE stocks.` });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start the NSE history import.");
    } finally {
      setBootstrapBusy(false);
    }
  };

  return (
    <div className="backtrack-page">
      <TopBar />
      <div className="backtrack-content bt-stack bt-data-page">
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker"><span className="live-dot" /> LOCAL NSE DATA</div>
            <h1>Download once. Search anytime.</h1>
            <p>Download official NSE history once, then search the stocks saved in your local database.</p>
          </div>
        </section>

        <div className="bt-data-hero">
          <div className="bt-data-hero-copy">
            <span className="bt-eyebrow">NSE HISTORY SOURCE</span>
            <div className="bt-provider-select"><span className="bt-provider-icon"><Database size={18} /></span><strong>Official NSE daily archives</strong></div>
            <p className="bt-source-description">Each downloaded trading-day archive contains all supported NSE stocks. Backtrack saves the ZIP locally and loads the full archive into SQLite for research, backtests, and replay.</p>
          </div>
          <div className={`bt-feed-status ${cache ? "is-ready" : "is-loading"}`}>
            <span className="feed-pulse" />
            <div><strong>{cache ? `${cache.bars.toLocaleString("en-IN")} saved candles` : "Checking local data"}</strong><small>{cache ? `${cache.symbols.toLocaleString("en-IN")} stocks in SQLite` : "Reading saved data…"}</small></div>
          </div>
        </div>

        <section className="bt-first-run-panel" aria-labelledby="first-run-heading">
          <div className="bt-first-run-copy">
            <span className="bt-eyebrow">FIRST-TIME SETUP</span>
            <h2 id="first-run-heading">Download NSE history once</h2>
            <p>Choose a quick time range or enter exact dates. The app checks the database and saved archives first, then downloads only what is missing in the background.</p>
            <small>One archive day refreshes every supported stock. You do not need to import stocks one by one.</small>
          </div>
          <div className="bt-first-run-action">
            <label className="bt-field-label" htmlFor="historical-scope"><CalendarDays size={13} /> History to download</label>
            <select id="historical-scope" className="bt-field-input" value={bootstrapRange} onChange={(event) => setBootstrapRange(event.target.value)} disabled={bootstrapBusy || importing}>
              <option value="all">All history · 2000 to today</option>
              <option value="4y">Last 4 years · one click</option>
              <option value="1y">Last 1 year · one click</option>
              <option value="custom">Custom start and end dates</option>
              {Array.from({ length: currentYear - 1999 }, (_, index) => currentYear - index).map((year) => <option key={year} value={`year:${year}`}>{year} only</option>)}
            </select>
            {bootstrapRange === "custom" && <div className="bt-custom-date-range">
              <label><span>Start date</span><input type="date" value={customStart} min={fullHistoryStart} max={today} onChange={(event) => setCustomStart(event.target.value)} disabled={bootstrapBusy || importing} /></label>
              <span className="bt-custom-date-separator">to</span>
              <label><span>End date</span><input type="date" value={customEnd} min={fullHistoryStart} max={today} onChange={(event) => setCustomEnd(event.target.value)} disabled={bootstrapBusy || importing} /></label>
            </div>}
            {bootstrapRange === "custom" && customDateError && <span className="bt-date-range-error" role="alert">Start date must be before end date.</span>}
            <button type="button" className="bt-primary" onClick={() => void downloadHistoricalData()} disabled={bootstrapBusy || importing}>
              <Download size={15} />
              {bootstrapBusy ? "Preparing import…" : importing ? "Import running…" : bootstrapRange === "all" ? "Download all NSE history" : bootstrapRange === "custom" ? "Download selected dates" : bootstrapRange === "4y" ? "Download last 4 years" : bootstrapRange === "1y" ? "Download last 1 year" : `Download ${bootstrapRange.slice(5)}`}
            </button>
            {catalogueMessage && <span className="bt-first-run-hint">{catalogueMessage}</span>}
            {!catalogueMessage && <span className="bt-first-run-hint">The import runs in the background and can be repeated safely.</span>}
          </div>
        </section>

        <section className="bt-panel bt-stock-search-panel" style={{ padding: "20px" }}>
          <div className="bt-panel-head" style={{ marginBottom: "14px" }}>
            <div><span className="bt-eyebrow">SEARCH LOCAL DATA</span><h2>Find a stock</h2><p className="text-xs text-slate-500 mt-1">Search the NSE catalogue and see which stocks have historical prices saved in this database.</p></div>
            <span className="bt-panel-note">{inventory.length.toLocaleString("en-IN")} shown</span>
          </div>
          <div className="bt-stock-search-box">
            <Search size={17} />
            <input className="bt-field-input" value={inventoryQuery} onChange={(event) => { setError(null); setInventoryQuery(event.target.value); }} placeholder="Search by symbol or company name" aria-label="Search stocks" />
          </div>
          <div className="bt-table-wrap bt-stock-search-results" style={{ maxHeight: "430px", overflow: "auto" }}>
            <table className="bt-table">
              <thead><tr><th>Stock</th><th>Saved period</th><th className="right">Candles</th><th className="center">Status</th></tr></thead>
              <tbody>
                {inventory.map((item) => <tr key={item.symbol}>
                  <td><strong className="text-indigo-700">{item.symbol}</strong><br /><span className="bt-val-muted">{item.company_name ?? item.industry ?? "NSE listed stock"}</span></td>
                  <td className="whitespace-nowrap">{item.earliest?.slice(0, 10) ?? "No prices saved yet"} {item.latest ? `→ ${item.latest.slice(0, 10)}` : ""}</td>
                  <td className="right">{item.bars.toLocaleString("en-IN")}</td>
                  <td className="center"><span className={item.bars > 0 ? "text-emerald-700 font-semibold" : "text-slate-500 font-semibold"}>{item.bars > 0 ? "Saved locally" : "Stock list only"}</span></td>
                </tr>)}
                {inventory.length === 0 && <tr><td colSpan={4}><div className="bt-data-empty"><Search size={22} /><strong>{inventoryLoading ? "Searching local data…" : inventoryQuery ? "No matching stock found" : "Search for a stock"}</strong><span>{inventoryLoading ? "Reading the local NSE catalogue and SQLite coverage." : inventoryQuery ? "Try a symbol such as RELIANCE or search by company name." : "Type a stock symbol or company name above."}</span></div></td></tr>}
              </tbody>
            </table>
          </div>
          <p className="bt-stock-search-note"><CheckCircle2 size={14} /> Every downloaded NSE archive is bulk-loaded for all supported stocks. There is no separate stock import step.</p>
        </section>

        {job && <div className={`bt-import-job ${job.status === "failed" ? "is-failed" : ""}`} role={job.status === "failed" ? "alert" : "status"}>
          {job.status === "failed" ? <AlertCircle size={18} /> : <RefreshCw size={18} className={importing ? "spin" : ""} />}
          <div className="min-w-0 flex-1"><strong>{job.stage ? `${job.stage}: ` : ""}{job.message}</strong>{typeof job.completed_days === "number" && typeof job.total_days === "number" && <><span>{job.completed_days.toLocaleString("en-IN")}/{job.total_days.toLocaleString("en-IN")} trading days checked{typeof job.downloaded_days === "number" ? ` · ${job.downloaded_days.toLocaleString("en-IN")} downloaded` : ""}.</span><div className="bt-import-job-progress"><i style={{ width: `${Math.min(100, (job.completed_days / Math.max(1, job.total_days)) * 100)}%` }} /></div></>}</div>
        </div>}
        {error && <p role="alert" className="bt-data-error"><AlertCircle size={14} /> {error}</p>}
      </div>
    </div>
  );
}
