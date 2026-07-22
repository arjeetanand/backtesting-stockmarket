"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Database, Download, FileDown, ListChecks, RefreshCw, Search } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { fetchWithTimeout } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

type CacheStatus = { symbols: number; bars: number; earliest: string | null; latest: string | null };
type ImportStatus = { job_id: string; status: string; message: string; symbols?: number; downloaded_days?: number; skipped_days?: number; stored_bars?: number; already_available_days?: number; reused_archive_days?: number; archive_rows?: number; stage?: string; completed_days?: number; total_days?: number };
type CoverageItem = { symbol: string; bars: number; earliest: string | null; latest: string | null; cached_days: number; missing_days: number; total_days: number; fully_available: boolean };
type ImportPreview = { requested_symbols: number; complete_symbols: number; partial_symbols: number; missing_symbols: number; cached_bars: number; estimated_missing_bars: number; cached_trading_days: number; missing_trading_days: number; total_trading_days: number; fully_available: boolean; message: string; coverage: CoverageItem[] };
type Instrument = { symbol: string; company_name: string; industry: string | null; series: string | null; isin: string | null };
type InventoryItem = { symbol: string; company_name: string | null; industry: string | null; bars: number; earliest: string | null; latest: string | null; cached_days: number; requested_days: number; missing_days: number; fully_available: boolean };

const defaultEnd = new Date().toISOString().slice(0, 10);
const defaultStart = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const PREVIEW_PAGE_SIZE = 12;
const DATA_CLIENT_CACHE_TTL = 30_000;
const DATA_CLIENT_CACHE_VERSION = "backtrack:data-page:v1";

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
    // Storage can be unavailable in private browsing; in-memory caching still works.
  }
}

function invalidateDataClientCache(): void {
  dataClientMemory.clear();
  if (typeof window !== "undefined") {
    try {
      for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = window.sessionStorage.key(index);
        if (key?.startsWith(`${DATA_CLIENT_CACHE_VERSION}:`)) window.sessionStorage.removeItem(key);
      }
    } catch {
      // Ignore unavailable storage.
    }
  }
}

async function fetchDataJson<T>(key: string, url: string, timeoutMs: number, force = false): Promise<T> {
  if (!force) {
    const memoryEntry = dataClientMemory.get(key);
    if (memoryEntry && memoryEntry.expiresAt > Date.now()) return memoryEntry.value as T;
    const storedValue = readStoredData<T>(key);
    if (storedValue !== null) {
      dataClientMemory.set(key, { value: storedValue, expiresAt: Date.now() + DATA_CLIENT_CACHE_TTL });
      return storedValue;
    }
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
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [job, setJob] = useState<ImportStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<"sensex_banks_sector_etfs" | "nse_equities" | "custom">("sensex_banks_sector_etfs");
  const [customSymbols, setCustomSymbols] = useState<string[]>([]);
  const [instrumentQuery, setInstrumentQuery] = useState("");
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [catalogueMessage, setCatalogueMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewPage, setPreviewPage] = useState(0);
  const [checking, setChecking] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [quickImportSymbol, setQuickImportSymbol] = useState<string | null>(null);

  const invalidDateRange = start > end;

  const clearPreview = () => { setPreview(null); setPreviewPage(0); };

  const previewPageCount = preview ? Math.max(1, Math.ceil(preview.coverage.length / PREVIEW_PAGE_SIZE)) : 0;
  const previewPageStart = previewPage * PREVIEW_PAGE_SIZE;
  const previewRows = preview?.coverage.slice(previewPageStart, previewPageStart + PREVIEW_PAGE_SIZE) ?? [];

  const importRequest = () => ({
    start,
    end,
    preset,
    symbols: customSymbols,
  });

  const refreshCache = useCallback(async (force = false) => {
    try {
      setCache(await fetchDataJson<CacheStatus>("cache-status", `${API_BASE_URL}/data/cache`, 6_000, force));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not read cache status.");
    }
  }, []);

  const refreshInventory = useCallback(async (force = false) => {
    setInventoryLoading(true);
    try {
      const key = `inventory:${inventoryQuery.trim().toUpperCase()}:${start}:${end}`;
      setInventory(await fetchDataJson<InventoryItem[]>(key, `${API_BASE_URL}/data/inventory?query=${encodeURIComponent(inventoryQuery)}&start=${start}&end=${end}&limit=300`, 8_000, force));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not read saved stock coverage.");
    } finally {
      setInventoryLoading(false);
    }
  }, [end, inventoryQuery, start]);

  useEffect(() => {
    const initialFetch = window.setTimeout(() => { void refreshCache(); }, 0);
    return () => window.clearTimeout(initialFetch);
  }, [refreshCache]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshInventory(); }, 250);
    return () => window.clearTimeout(timer);
  }, [inventoryQuery, start, end, refreshInventory]);

  useEffect(() => {
    if (preset !== "custom") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/data/instruments?query=${encodeURIComponent(instrumentQuery)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Could not load the NSE equity catalogue.");
        setInstruments(await response.json() as Instrument[]);
      } catch (requestError) {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) setError(requestError instanceof Error ? requestError.message : "Could not load the NSE equity catalogue.");
      }
    }, 200);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [preset, instrumentQuery]);

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`${API_BASE_URL}/data/nse-import/${job.job_id}`);
      if (response.ok) {
        const next = await response.json() as ImportStatus;
        setJob(next);
        if (["complete", "failed"].includes(next.status)) {
          invalidateDataClientCache();
          void refreshCache(true);
          if (next.status === "complete") setPreview(null);
          setQuickImportSymbol(null);
          void refreshInventory(true);
        }
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [job, refreshCache, refreshInventory]);

  const startImport = async () => {
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/data/nse-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(importRequest()),
      });
      const payload = await response.json() as ImportStatus & { detail?: string };
      if (!response.ok) throw new Error(payload.detail ?? "Could not start the NSE import.");
      setJob({ ...payload, message: `Queued official NSE import for ${payload.symbols} instruments.` });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start the import.");
    }
  };

  const importOneStock = async (symbol: string) => {
    setError(null);
    setQuickImportSymbol(symbol);
    try {
      const response = await fetch(`${API_BASE_URL}/data/nse-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start, end, preset: "custom", symbols: [symbol] }),
      });
      const payload = await response.json() as ImportStatus & { detail?: string };
      if (!response.ok) throw new Error(payload.detail ?? `Could not import ${symbol}.`);
      setJob({ ...payload, message: `Queued missing history for ${symbol}.` });
    } catch (requestError) {
      setQuickImportSymbol(null);
      setError(requestError instanceof Error ? requestError.message : `Could not import ${symbol}.`);
    }
  };

  const checkAvailability = async () => {
    setError(null);
    setChecking(true);
    try {
      const response = await fetch(`${API_BASE_URL}/data/nse-import/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(importRequest()),
      });
      const payload = await response.json() as ImportPreview & { detail?: string };
      if (!response.ok) throw new Error(payload.detail ?? "Could not check local data availability.");
      setPreview(payload);
      setPreviewPage(0);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not check local data availability.");
    } finally {
      setChecking(false);
    }
  };

  const refreshCatalogue = async () => {
    setError(null);
    clearPreview();
    setCatalogueMessage("Refreshing the NSE stock list…");
    try {
      const response = await fetch(`${API_BASE_URL}/data/instruments/refresh`, { method: "POST" });
      const payload = await response.json() as { instruments?: number; detail?: string };
      if (!response.ok) throw new Error(payload.detail ?? "Could not refresh the NSE equity catalogue.");
      setCatalogueMessage(`${payload.instruments ?? 0} NSE equities saved locally. Newly listed IPO symbols are now searchable.`);
      setInstrumentQuery("");
    } catch (requestError) {
      setCatalogueMessage(null);
      setError(requestError instanceof Error ? requestError.message : "Could not refresh the NSE equity catalogue.");
    }
  };

  const toggleSymbol = (symbol: string) => { clearPreview(); setCustomSymbols((current) => current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol]); };

  const importing = job?.status === "queued" || job?.status === "running";

  return (
    <div className="backtrack-page">
      <TopBar />
      <div className="backtrack-content bt-stack bt-data-page">
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker"><span className="live-dot" /> MANAGE YOUR SAVED DATA</div>
            <h1>Save stock history once.</h1>
            <p>Find a stock, check what is already saved, and download only the missing days.</p>
          </div>
          <div className="bt-heading-actions">
              <button className="bt-secondary" onClick={() => void refreshCache(true)}>
              <RefreshCw size={14} /> Refresh cache summary
            </button>
          </div>
        </section>

        {/* Hero Provider Panel */}
        <div className="bt-data-hero">
          <div className="bt-data-hero-copy">
            <span className="bt-eyebrow">NSE HISTORY SOURCE</span>
            <div className="bt-provider-select">
              <span className="bt-provider-icon"><Database size={18} /></span>
              <strong>NSE Common Bhavcopy Archive</strong>
            </div>
            <p className="bt-source-description">Official daily exchange archives are saved locally, loaded into SQLite, and reused across stock imports, research, and replay. Existing archive-days are never downloaded twice.</p>
            <div className="bt-source-meta"><span><span className="bt-meta-dot" /> Official NSE source</span><span><Database size={12} /> SQLite cache</span><span><RefreshCw size={12} /> Incremental imports</span></div>
          </div>
          <div className={`bt-feed-status ${cache ? "is-ready" : "is-loading"}`}>
            <span className="feed-pulse" />
            <div>
              <strong>{cache ? `${cache.bars.toLocaleString("en-IN")} cached candles` : "Checking local cache"}</strong>
              <small>{cache ? `${cache.symbols.toLocaleString("en-IN")} instruments in SQLite` : "Reading saved data…"}</small>
            </div>
          </div>
        </div>

        <section className="bt-panel" style={{ padding: "20px" }}>
          <div className="bt-panel-head" style={{ marginBottom: "14px" }}>
            <div>
              <span className="bt-eyebrow">SAVED STOCK COVERAGE</span>
              <h2>Your stock database</h2>
              <p className="text-xs text-slate-500 mt-1">Green means the selected period is saved. Amber means some history is missing. Click once to download only that stock.</p>
            </div>
            <span className="bt-panel-note">{inventory.length.toLocaleString("en-IN")} shown</span>
          </div>
          <div className="bt-inventory-controls">
            <div className="bt-search-field"><Search size={15} /><input className="bt-field-input" value={inventoryQuery} onChange={(event) => setInventoryQuery(event.target.value)} placeholder="Search by stock symbol or company name" aria-label="Search saved stocks" /></div>
            <button type="button" className="bt-secondary whitespace-nowrap" onClick={() => void refreshInventory(true)} disabled={inventoryLoading}><RefreshCw size={14} className={inventoryLoading ? "spin" : ""} /> Refresh coverage</button>
          </div>
          <div className="bt-table-wrap" style={{ maxHeight: "390px", overflow: "auto" }}>
            <table className="bt-table">
              <thead><tr><th>Stock</th><th>Saved history</th><th className="right">Candles</th><th className="center">Status</th><th className="right">Action</th></tr></thead>
              <tbody>
                {inventory.map((item) => {
                  const complete = item.fully_available || (item.bars > 0 && item.requested_days === 0);
                  const isImporting = quickImportSymbol === item.symbol && importing;
                  return <tr key={item.symbol}>
                    <td><strong className="text-indigo-700">{item.symbol}</strong><br /><span className="bt-val-muted">{item.company_name ?? item.industry ?? "NSE listed stock"}</span></td>
                    <td className="whitespace-nowrap">{item.earliest?.slice(0, 10) ?? "Not saved"} → {item.latest?.slice(0, 10) ?? "—"}</td>
                    <td className="right">{item.bars.toLocaleString("en-IN")}</td>
                    <td className="center"><span className={complete ? "text-emerald-700 font-semibold" : "text-amber-700 font-semibold"}>{complete ? "Ready" : item.bars ? `${item.missing_days} days missing` : "Not saved"}</span></td>
                    <td className="right">{complete ? <span className="text-emerald-700">Saved</span> : <button type="button" className="bt-primary small" onClick={() => void importOneStock(item.symbol)} disabled={importing}><Download size={13} /> {isImporting ? "Importing…" : "Import this stock"}</button>}</td>
                  </tr>;
                })}
                {inventory.length === 0 && <tr><td colSpan={5}><div className="bt-data-empty"><Database size={22} /><strong>{inventoryLoading ? "Reading the saved stock database…" : inventoryQuery ? "No saved stocks match that search" : "No stock history saved yet"}</strong><span>{inventoryLoading ? "Checking SQLite coverage for the selected dates." : inventoryQuery ? "Try a symbol such as RELIANCE or search by company name." : "Use the import planner below to check the NSE universe and download only missing history."}</span></div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {/* Import Configuration Card */}
        <section className="bt-panel" style={{ padding: "24px" }}>
          <div className="bt-panel-head" style={{ marginBottom: "20px" }}>
            <div>
              <span className="bt-eyebrow">IMPORT PLANNER</span>
              <h2>Add stock history</h2>
              <p className="text-xs text-slate-500 mt-1">Saved coverage and the local archive folder are checked first. Existing archive-days are reused; only dates not saved anywhere are downloaded.</p>
            </div>
            <span className="bt-panel-note">Full archive + OHLCV</span>
          </div>

          <div className="bt-import-step-grid" aria-label="Import steps">
            {[["1", "Choose dates", "Set the history window"], ["2", "Choose stocks", "NSE list or custom"], ["3", "Review plan", "See what is already saved"], ["4", "Import missing", "Download only the remainder"]].map(([number, title, detail]) => <div key={number} className="bt-import-step"><span>{number}</span><div><strong>{title}</strong><small>{detail}</small></div></div>)}
          </div>

          <div className="bt-date-range" style={{ marginBottom: "20px" }}>
            <div>
              <label className="bt-field-label"><CalendarDays size={13} /> History start</label>
              <input
                type="date"
                value={start}
                onChange={(event) => { setStart(event.target.value); clearPreview(); }}
                className="bt-field-input"
              />
            </div>
            <div>
              <label className="bt-field-label"><CalendarDays size={13} /> History end</label>
              <input
                type="date"
                value={end}
                onChange={(event) => { setEnd(event.target.value); clearPreview(); }}
                className="bt-field-input"
              />
            </div>
          </div>
          {invalidDateRange && <p className="bt-inline-error" role="alert"><AlertCircle size={14} /> History start must be on or before history end.</p>}

          <div style={{ maxWidth: "760px", marginBottom: "20px" }}>
            <label className="bt-field-label"><ListChecks size={13} /> Stock universe</label>
            <div className="bt-universe-options" role="radiogroup" aria-label="Stock universe">
              <label className={`bt-radio-card ${preset === "sensex_banks_sector_etfs" ? "is-selected" : ""}`}><input name="stock-universe" value="sensex_banks_sector_etfs" type="radio" checked={preset === "sensex_banks_sector_etfs"} onClick={() => { setPreset("sensex_banks_sector_etfs"); clearPreview(); }} onChange={() => { setPreset("sensex_banks_sector_etfs"); clearPreview(); }} /><span><strong>Starter set</strong><small>Sensex, banks &amp; ETFs</small></span></label>
              <label className={`bt-radio-card ${preset === "nse_equities" ? "is-selected" : ""}`}><input name="stock-universe" value="nse_equities" type="radio" checked={preset === "nse_equities"} onClick={() => { setPreset("nse_equities"); clearPreview(); }} onChange={() => { setPreset("nse_equities"); clearPreview(); }} /><span><strong>All NSE equities</strong><small>Full listed equity catalogue</small></span></label>
              <label className={`bt-radio-card ${preset === "custom" ? "is-selected" : ""}`}><input name="stock-universe" value="custom" type="radio" checked={preset === "custom"} onClick={() => { setPreset("custom"); clearPreview(); }} onChange={() => { setPreset("custom"); clearPreview(); }} /><span><strong>My NSE symbols</strong><small>Pick specific stocks</small></span></label>
            </div>
            {preset === "custom" && <>
              <div className="bt-catalogue-controls"><div className="bt-search-field"><Search size={15} /><input className="bt-field-input" value={instrumentQuery} onChange={(event) => setInstrumentQuery(event.target.value)} placeholder="Search all NSE equities by symbol or company" aria-label="Search NSE equity catalogue" /></div><button type="button" className="bt-secondary whitespace-nowrap" onClick={() => void refreshCatalogue()}><RefreshCw size={14} /> Refresh stock list</button><a className="bt-secondary whitespace-nowrap" href={`${API_BASE_URL}/data/instruments/export`}><FileDown size={14} /> Download CSV</a></div>
              {catalogueMessage && <p className="text-xs text-emerald-700 mb-2">{catalogueMessage}</p>}
              <div className="border border-slate-200 rounded-lg max-h-52 overflow-auto bg-white">
                {instruments.map((instrument) => <label key={instrument.symbol} className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 text-xs cursor-pointer hover:bg-slate-50"><input type="checkbox" checked={customSymbols.includes(instrument.symbol)} onChange={() => toggleSymbol(instrument.symbol)} /><span className="font-mono font-bold text-indigo-700 w-24">{instrument.symbol}</span><span className="flex-1 text-slate-700">{instrument.company_name}</span><span className="text-slate-400">{instrument.industry ?? "—"}</span></label>)}
                {instruments.length === 0 && <p className="p-3 text-xs text-slate-500">No local NSE list yet. Use “Refresh stock list” to download the official equity catalogue.</p>}
              </div>
              {customSymbols.length > 0 && <p className="text-xs text-slate-600 mt-2">Selected: <strong>{customSymbols.join(", ")}</strong></p>}
              <p className="text-xs text-slate-500 mt-2">The catalogue is local after refresh. Search does not repeatedly call NSE. Select only the stocks you want to import and backtest.</p>
            </>}
            {preset === "nse_equities" && <div className="bt-universe-info"><p>The full NSE catalogue is checked against SQLite before import. One complete archive-day contains all stocks for that date, so each missing weekday is downloaded once and reused for every selected stock.</p><div className="bt-catalogue-actions"><button type="button" className="bt-secondary whitespace-nowrap" onClick={() => void refreshCatalogue()}><RefreshCw size={14} /> Refresh stock list</button><a className="bt-secondary whitespace-nowrap" href={`${API_BASE_URL}/data/instruments/export`}><FileDown size={14} /> Download CSV</a></div></div>}
          </div>

          <div className="bt-import-actions">
            <button className="bt-secondary" onClick={() => void checkAvailability()} disabled={checking || importing || invalidDateRange}>
              <RefreshCw size={15} /> {checking ? "Checking database…" : "3. Check database"}
            </button>
            <button className="bt-primary" onClick={() => void startImport()} disabled={importing || !preview || preview.fully_available === true || invalidDateRange}>
              <Download size={15} />
              {importing ? "Importing missing data…" : "4. Import missing data"}
            </button>
          </div>
          {!preview && !importing && <p className="bt-action-help"><ListChecks size={13} /> Check the database to generate an import plan. The download button unlocks only after the plan confirms missing data.</p>}

          {preview && <div className={preview.fully_available ? "bt-data-note mt-4" : "bt-callout mt-4"}>
            <div className="w-full">
              <strong>{preview.fully_available ? "Already available locally" : "Import plan ready — review before downloading"}</strong>
              <p>{preview.message}</p>
              <div className="grid grid-cols-2 md:grid-cols-7 gap-2 mt-4">
                {[["Requested", preview.requested_symbols], ["Complete", preview.complete_symbols], ["Need data", preview.missing_symbols], ["Cached bars", preview.cached_bars], ["Est. new bars", preview.estimated_missing_bars], ["Missing days", preview.missing_trading_days], ["Trading days", preview.total_trading_days]].map(([label, value]) => <div key={label} className="rounded-md border border-slate-200 bg-white px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div><div className="text-sm font-semibold text-slate-800">{Number(value).toLocaleString("en-IN")}</div></div>)}
              </div>
              <div className="mt-4 overflow-auto rounded-md border border-slate-200 bg-white">
                <table className="w-full text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-3 py-2">Symbol</th><th className="px-3 py-2">DB bars</th><th className="px-3 py-2">Complete archive-days</th><th className="px-3 py-2">Missing archive-days</th><th className="px-3 py-2">Stored period</th><th className="px-3 py-2">Plan</th></tr></thead><tbody>{previewRows.map((item) => <tr key={item.symbol} className="border-t border-slate-100"><td className="px-3 py-2 font-mono font-semibold text-indigo-700">{item.symbol}</td><td className="px-3 py-2">{item.bars.toLocaleString("en-IN")}</td><td className="px-3 py-2">{item.cached_days}/{item.total_days}</td><td className="px-3 py-2">{item.missing_days}</td><td className="px-3 py-2 whitespace-nowrap">{item.earliest?.slice(0, 10) ?? "—"} → {item.latest?.slice(0, 10) ?? "—"}</td><td className={item.fully_available ? "px-3 py-2 text-emerald-700" : "px-3 py-2 text-amber-700"}>{item.fully_available ? "Skip" : "Import missing"}</td></tr>)}</tbody></table>
              </div>
              {preview.coverage.length > 0 && <div className="bt-preview-pagination" aria-label="Import preview pages"><span>Showing {previewPageStart + 1}–{Math.min(previewPageStart + PREVIEW_PAGE_SIZE, preview.coverage.length)} of {preview.coverage.length.toLocaleString("en-IN")} symbols</span><div className="bt-pagination-controls"><button type="button" className="bt-pagination-button" aria-label="Previous preview page" title="Previous preview page" onClick={() => setPreviewPage((page) => Math.max(0, page - 1))} disabled={previewPage === 0}><ChevronLeft size={15} /></button><span aria-live="polite">Page {previewPage + 1} of {previewPageCount}</span><button type="button" className="bt-pagination-button" aria-label="Next preview page" title="Next preview page" onClick={() => setPreviewPage((page) => Math.min(previewPageCount - 1, page + 1))} disabled={previewPage >= previewPageCount - 1}><ChevronRight size={15} /></button></div></div>}
            </div>
          </div>}

          {job && (
            <div className={`mt-4 rounded-lg border px-4 py-3 ${job.status === "failed" ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50"}`} role={job.status === "failed" ? "alert" : "status"}>
              <div className="flex items-start gap-3">
                {job.status === "failed" ? <AlertCircle size={18} className="mt-0.5 flex-shrink-0 text-rose-600" /> : <RefreshCw size={18} className={`mt-0.5 flex-shrink-0 text-indigo-600 ${importing ? "spin" : ""}`} />}
                <div className="min-w-0 flex-1">
                  <p style={{ fontSize: "13px" }} className={job.status === "failed" ? "text-rose-700 font-semibold" : "text-slate-700 font-medium"}>
                    {job.stage ? `${job.stage}: ` : ""}{job.message}
                  </p>
                  {typeof job.completed_days === "number" && typeof job.total_days === "number" && <p className="mt-1 text-xs text-slate-500">{job.completed_days.toLocaleString("en-IN")}/{job.total_days.toLocaleString("en-IN")} trading days checked{typeof job.downloaded_days === "number" ? ` · ${job.downloaded_days.toLocaleString("en-IN")} downloaded` : ""}{typeof job.skipped_days === "number" && job.skipped_days > 0 ? ` · ${job.skipped_days.toLocaleString("en-IN")} unavailable` : ""}.</p>}
                  {typeof job.completed_days === "number" && typeof job.total_days === "number" && job.total_days > 0 && <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full transition-all ${job.status === "failed" ? "bg-rose-500" : "bg-indigo-600"}`} style={{ width: `${Math.min(100, (job.completed_days / job.total_days) * 100)}%` }} /></div>}
                </div>
                {job.status === "failed" && <button type="button" className="bt-primary small flex-shrink-0" onClick={() => void startImport()} disabled={invalidDateRange}><RefreshCw size={13} /> Retry import</button>}
              </div>
            </div>
          )}
          {error && (
            <p role="alert" style={{ marginTop: "14px", fontSize: "13px" }} className="text-rose-600 font-medium">
              {error}
            </p>
          )}
        </section>

        {/* Scope Note */}
        <div className="bt-data-note">
          <CheckCircle2 size={18} className="text-indigo-600 flex-shrink-0" />
          <div>
            <strong>Scope and limits</strong>
            <p>
              NSE archives cover exchange-traded NSE equities and ETFs. You can add individual symbols here; if their history is not cached, the app imports it once and reuses it across backtests and replay. Mutual-fund NAV history is a separate AMFI import because AMFI limits each official history download to 90 days. No broker connection or live order execution is involved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
