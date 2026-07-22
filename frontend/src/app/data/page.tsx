"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Database, Download, RefreshCw } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { fetchWithTimeout } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

type CacheStatus = { symbols: number; bars: number; earliest: string | null; latest: string | null };
type ImportStatus = { job_id: string; status: string; message: string; symbols?: number; downloaded_days?: number; skipped_days?: number; stored_bars?: number; already_available_days?: number; stage?: string; completed_days?: number; total_days?: number };
type CoverageItem = { symbol: string; bars: number; earliest: string | null; latest: string | null; cached_days: number; missing_days: number; total_days: number; fully_available: boolean };
type ImportPreview = { requested_symbols: number; complete_symbols: number; partial_symbols: number; missing_symbols: number; cached_bars: number; estimated_missing_bars: number; cached_trading_days: number; missing_trading_days: number; total_trading_days: number; fully_available: boolean; message: string; coverage: CoverageItem[] };
type Instrument = { symbol: string; company_name: string; industry: string | null; series: string | null; isin: string | null };
type InventoryItem = { symbol: string; company_name: string | null; industry: string | null; bars: number; earliest: string | null; latest: string | null; cached_days: number; requested_days: number; missing_days: number; fully_available: boolean };

const defaultEnd = new Date().toISOString().slice(0, 10);
const defaultStart = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

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
  const [checking, setChecking] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [quickImportSymbol, setQuickImportSymbol] = useState<string | null>(null);

  const clearPreview = () => setPreview(null);

  const importRequest = () => ({
    start,
    end,
    preset,
    symbols: customSymbols,
  });

  const refreshCache = async () => {
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/data/cache`);
      if (!response.ok) throw new Error("Could not read local cache status.");
      setCache(await response.json());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not read cache status.");
    }
  };

  const refreshInventory = async () => {
    setInventoryLoading(true);
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/data/inventory?query=${encodeURIComponent(inventoryQuery)}&start=${start}&end=${end}&limit=300`, {}, 15_000);
      if (!response.ok) throw new Error("Could not read saved stock coverage.");
      setInventory(await response.json() as InventoryItem[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not read saved stock coverage.");
    } finally {
      setInventoryLoading(false);
    }
  };

  useEffect(() => {
    const initialFetch = window.setTimeout(() => { void refreshCache(); }, 0);
    return () => window.clearTimeout(initialFetch);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshInventory(); }, 250);
    return () => window.clearTimeout(timer);
  }, [inventoryQuery, start, end]);

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
          void refreshCache();
          if (next.status === "complete") setPreview(null);
          setQuickImportSymbol(null);
          void refreshInventory();
        }
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [job]);

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
      <div className="backtrack-content bt-stack">
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker"><span className="live-dot" /> MANAGE YOUR SAVED DATA</div>
            <h1>Save stock history once.</h1>
            <p>Find a stock, check what is already saved, and download only the missing days.</p>
          </div>
          <div className="bt-heading-actions">
            <button className="bt-secondary" onClick={() => void refreshCache()}>
              <RefreshCw size={14} /> Refresh saved data
            </button>
          </div>
        </section>

        {/* Hero Provider Panel */}
        <div className="bt-data-hero">
          <div>
            <span className="bt-eyebrow">NSE HISTORY SOURCE</span>
            <div className="bt-provider-select">
              <Database size={20} className="text-indigo-600" />
              <strong>NSE Common Bhavcopy Archive</strong>
            </div>
            <p className="text-slate-600 text-xs mt-1">
              One archive is downloaded per trading day and filtered locally, avoiding a separate remote request for each stock or backtest.
            </p>
          </div>
          <div className="bt-feed-status">
            <span className="feed-pulse" />
            <div>
              <strong>{cache?.bars.toLocaleString("en-IN") ?? "—"} cached candles</strong>
              <small>{cache?.symbols ?? 0} instruments stored in SQLite</small>
            </div>
          </div>
        </div>

        <section className="bt-panel" style={{ padding: "20px" }}>
          <div className="bt-panel-head" style={{ marginBottom: "14px" }}>
            <div>
              <span className="bt-eyebrow">YOUR STOCK DATABASE</span>
              <h2>Find a stock and import it</h2>
              <p className="text-xs text-slate-500 mt-1">Green means the selected period is saved. Amber means some history is missing. Click once to download only that stock.</p>
            </div>
            <span className="bt-panel-note">{inventory.length.toLocaleString("en-IN")} shown</span>
          </div>
          <div className="flex gap-2 mb-3">
            <input className="bt-field-input" value={inventoryQuery} onChange={(event) => setInventoryQuery(event.target.value)} placeholder="Search by stock symbol or company name" aria-label="Search saved stocks" />
            <button type="button" className="bt-secondary whitespace-nowrap" onClick={() => void refreshInventory()} disabled={inventoryLoading}><RefreshCw size={14} className={inventoryLoading ? "spin" : ""} /> Refresh</button>
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
                {inventory.length === 0 && <tr><td colSpan={5}><div className="bt-chart-empty">{inventoryLoading ? "Reading the saved stock database…" : "No matching stocks found. Refresh the NSE stock list or search another name."}</div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {/* Import Configuration Card */}
        <section className="bt-panel" style={{ padding: "24px" }}>
          <div className="bt-panel-head" style={{ marginBottom: "20px" }}>
            <div>
              <span className="bt-eyebrow">SAFE, INCREMENTAL IMPORT</span>
              <h2>Choose data to save</h2>
              <p className="text-xs text-slate-500 mt-1">The database is checked first. Existing symbol-days are skipped; only missing NSE archives are downloaded.</p>
            </div>
            <span className="bt-panel-note">Daily OHLCV Only</span>
          </div>

          <div className="grid gap-2 md:grid-cols-4 mb-6" aria-label="Import steps">
            {[["1", "Choose dates", "Set the history window"], ["2", "Choose stocks", "NSE list or custom"], ["3", "Review plan", "See what is already saved"], ["4", "Import missing", "Download only the remainder"]].map(([number, title, detail]) => <div key={number} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">{number}</span><div><div className="text-xs font-semibold text-slate-800">{title}</div><div className="text-[11px] text-slate-500">{detail}</div></div></div>)}
          </div>

          <div className="bt-grid-2" style={{ maxWidth: "560px", marginBottom: "20px" }}>
            <div>
              <label className="bt-field-label">History start</label>
              <input
                type="date"
                value={start}
                onChange={(event) => { setStart(event.target.value); clearPreview(); }}
                className="bt-field-input"
              />
            </div>
            <div>
              <label className="bt-field-label">History end</label>
              <input
                type="date"
                value={end}
                onChange={(event) => { setEnd(event.target.value); clearPreview(); }}
                className="bt-field-input"
              />
            </div>
          </div>

          <div style={{ maxWidth: "760px", marginBottom: "20px" }}>
            <label className="bt-field-label">Stock universe</label>
            <div className="flex gap-3 flex-wrap mb-3">
              <label className="text-xs text-slate-700 flex items-center gap-2"><input type="radio" checked={preset === "sensex_banks_sector_etfs"} onChange={() => { setPreset("sensex_banks_sector_etfs"); clearPreview(); }} /> Starter set (Sensex, banks &amp; ETFs)</label>
              <label className="text-xs text-slate-700 flex items-center gap-2"><input type="radio" checked={preset === "nse_equities"} onChange={() => { setPreset("nse_equities"); clearPreview(); }} /> All NSE listed equities</label>
              <label className="text-xs text-slate-700 flex items-center gap-2"><input type="radio" checked={preset === "custom"} onChange={() => { setPreset("custom"); clearPreview(); }} /> My NSE symbols</label>
            </div>
            {preset === "custom" && <>
              <div className="flex gap-2 mb-2"><input className="bt-field-input" value={instrumentQuery} onChange={(event) => setInstrumentQuery(event.target.value)} placeholder="Search all NSE equities by symbol or company" /><button type="button" className="bt-secondary whitespace-nowrap" onClick={() => void refreshCatalogue()}>Refresh NSE list</button><a className="bt-secondary whitespace-nowrap" href={`${API_BASE_URL}/data/instruments/export`}>Download CSV</a></div>
              {catalogueMessage && <p className="text-xs text-emerald-700 mb-2">{catalogueMessage}</p>}
              <div className="border border-slate-200 rounded-lg max-h-52 overflow-auto bg-white">
                {instruments.map((instrument) => <label key={instrument.symbol} className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 text-xs cursor-pointer hover:bg-slate-50"><input type="checkbox" checked={customSymbols.includes(instrument.symbol)} onChange={() => toggleSymbol(instrument.symbol)} /><span className="font-mono font-bold text-indigo-700 w-24">{instrument.symbol}</span><span className="flex-1 text-slate-700">{instrument.company_name}</span><span className="text-slate-400">{instrument.industry ?? "—"}</span></label>)}
                {instruments.length === 0 && <p className="p-3 text-xs text-slate-500">No local NSE list yet. Use “Refresh NSE list” to download the official equity catalogue.</p>}
              </div>
              {customSymbols.length > 0 && <p className="text-xs text-slate-600 mt-2">Selected: <strong>{customSymbols.join(", ")}</strong></p>}
              <p className="text-xs text-slate-500 mt-2">The catalogue is local after refresh. Search does not repeatedly call NSE. Select only the stocks you want to import and backtest.</p>
            </>}
            {preset === "nse_equities" && <div className="flex items-center gap-3"><p className="text-xs text-slate-500 flex-1">The full NSE catalogue is checked against SQLite before import. Only missing archive-days are downloaded; existing bars are never duplicated.</p><button type="button" className="bt-secondary whitespace-nowrap" onClick={() => void refreshCatalogue()}><RefreshCw size={14} /> Refresh NSE list</button><a className="bt-secondary whitespace-nowrap" href={`${API_BASE_URL}/data/instruments/export`}>Download CSV</a></div>}
          </div>

          <div className="flex gap-3 flex-wrap">
            <button className="bt-secondary" onClick={() => void checkAvailability()} disabled={checking || importing}>
              <RefreshCw size={15} /> {checking ? "Checking database…" : "3. Check database"}
            </button>
            <button className="bt-primary" onClick={() => void startImport()} disabled={importing || !preview || preview.fully_available === true}>
              <Download size={15} />
              {importing ? "Importing missing data…" : "4. Import missing data"}
            </button>
          </div>
          {!preview && !importing && <p className="mt-2 text-xs text-slate-500">Check the database to generate the import plan. The download button unlocks only after that review.</p>}

          {preview && <div className={preview.fully_available ? "bt-data-note mt-4" : "bt-callout mt-4"}>
            <div className="w-full">
              <strong>{preview.fully_available ? "Already available locally" : "Import plan ready — review before downloading"}</strong>
              <p>{preview.message}</p>
              <div className="grid grid-cols-2 md:grid-cols-7 gap-2 mt-4">
                {[["Requested", preview.requested_symbols], ["Complete", preview.complete_symbols], ["Need data", preview.missing_symbols], ["Cached bars", preview.cached_bars], ["Est. new bars", preview.estimated_missing_bars], ["Missing days", preview.missing_trading_days], ["Trading days", preview.total_trading_days]].map(([label, value]) => <div key={label} className="rounded-md border border-slate-200 bg-white px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div><div className="text-sm font-semibold text-slate-800">{Number(value).toLocaleString("en-IN")}</div></div>)}
              </div>
              <div className="mt-4 overflow-auto rounded-md border border-slate-200 bg-white">
                <table className="w-full text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-3 py-2">Symbol</th><th className="px-3 py-2">DB bars</th><th className="px-3 py-2">Cached days</th><th className="px-3 py-2">Missing days</th><th className="px-3 py-2">Stored period</th><th className="px-3 py-2">Plan</th></tr></thead><tbody>{preview.coverage.slice(0, 12).map((item) => <tr key={item.symbol} className="border-t border-slate-100"><td className="px-3 py-2 font-mono font-semibold text-indigo-700">{item.symbol}</td><td className="px-3 py-2">{item.bars.toLocaleString("en-IN")}</td><td className="px-3 py-2">{item.cached_days}/{item.total_days}</td><td className="px-3 py-2">{item.missing_days}</td><td className="px-3 py-2 whitespace-nowrap">{item.earliest?.slice(0, 10) ?? "—"} → {item.latest?.slice(0, 10) ?? "—"}</td><td className={item.fully_available ? "px-3 py-2 text-emerald-700" : "px-3 py-2 text-amber-700"}>{item.fully_available ? "Skip" : "Import missing"}</td></tr>)}</tbody></table>
              </div>
              {preview.coverage.length > 12 && <p className="mt-2 text-xs text-slate-500">Showing 12 of {preview.coverage.length.toLocaleString("en-IN")} symbols. The summary above includes the complete catalogue.</p>}
            </div>
          </div>}

          {job && (
            <div style={{ marginTop: "14px" }}>
              <p style={{ fontSize: "13px" }} className={job.status === "failed" ? "text-rose-600 font-medium" : "text-slate-600 font-medium"}>
                {job.stage ? `${job.stage}: ` : ""}{job.message}{typeof job.completed_days === "number" && typeof job.total_days === "number" ? ` ${job.completed_days}/${job.total_days} trading days checked.` : ""}{typeof job.stored_bars === "number" ? ` ${job.stored_bars.toLocaleString("en-IN")} candles stored.` : ""}{typeof job.already_available_days === "number" && job.already_available_days > 0 ? ` ${job.already_available_days} already-imported days were skipped.` : ""}
              </p>
              {typeof job.completed_days === "number" && typeof job.total_days === "number" && job.total_days > 0 && <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${Math.min(100, (job.completed_days / job.total_days) * 100)}%` }} /></div>}
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
