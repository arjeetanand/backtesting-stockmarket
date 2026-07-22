"use client";

import { useEffect, useId, useState } from "react";
import { Search } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

type Instrument = { symbol: string; company_name: string; industry: string | null; series: string | null };

export function SymbolCombobox({ value, onChange, label = "Symbol", className = "" }: { value: string; onChange: (symbol: string) => void; label?: string; className?: string }) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Instrument[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const listId = useId();

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(value), 0);
    return () => window.clearTimeout(timer);
  }, [value]);
  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/data/instruments?query=${encodeURIComponent(query)}&limit=20`, { signal: controller.signal });
        if (response.ok) setResults(await response.json() as Instrument[]);
      } catch (requestError) {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) setResults([]);
      } finally { setLoading(false); }
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [open, query]);

  const select = (symbol: string) => { onChange(symbol); setQuery(symbol); setOpen(false); };
  return <div className={`bt-symbol-combobox ${className}`}>
    <label className="sr-only" htmlFor={listId}>{label}</label>
    <Search size={14} aria-hidden="true" />
    <input id={listId} className="bt-field-input" value={query} autoComplete="off" onFocus={() => setOpen(true)} onChange={(event) => { const next = event.target.value.toUpperCase(); setQuery(next); onChange(next); setOpen(true); }} placeholder="Search NSE symbol or company" role="combobox" aria-expanded={open} aria-controls={`${listId}-options`} />
    {open && <div id={`${listId}-options`} className="bt-symbol-options" role="listbox">
      {loading && <p>Searching NSE catalogue…</p>}
      {!loading && query.trim().length >= 2 && results.map((item) => <button type="button" key={item.symbol} onMouseDown={(event) => event.preventDefault()} onClick={() => select(item.symbol)} role="option" aria-selected={item.symbol === value}><b>{item.symbol}</b><span>{item.company_name}</span><small>{item.series ?? "EQ"}</small></button>)}
      {!loading && query.trim().length >= 2 && results.length === 0 && <p>No local matches. Refresh the NSE catalogue in Data &amp; Providers.</p>}
      {!loading && query.trim().length < 2 && <p>Type at least two characters to search all NSE equities.</p>}
    </div>}
  </div>;
}
