"use client";

import { useMemo, useState } from "react";
import { CheckCircle, ChevronDown, ChevronUp, Eye, Play, Plus, Search, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { SymbolCombobox } from "@/components/data/SymbolCombobox";
import { runStrategyBacktest, type LiveBacktestResult } from "@/lib/backtest-api";

type ASTKind = "operator" | "indicator" | "comparison" | "literal";
type ASTNode = { kind: ASTKind; value: string };
type Template = { name: string; type: string; rsiOversold: number; rsiOverbought: number; fastEma: number; slowEma: number };

const templates: Template[] = [
  { name: "RSI Momentum", type: "Mean Reversion", rsiOversold: 30, rsiOverbought: 70, fastEma: 20, slowEma: 50 },
  { name: "MACD Crossover", type: "Trend Following", rsiOversold: 35, rsiOverbought: 65, fastEma: 12, slowEma: 26 },
  { name: "Bollinger Reversion", type: "Mean Reversion", rsiOversold: 25, rsiOverbought: 75, fastEma: 20, slowEma: 50 },
  { name: "ATR Breakout", type: "Breakout", rsiOversold: 40, rsiOverbought: 60, fastEma: 10, slowEma: 30 },
  { name: "EMA Trend", type: "Trend Following", rsiOversold: 30, rsiOverbought: 70, fastEma: 20, slowEma: 50 },
];

const initialEntry: ASTNode[] = [
  { kind: "operator", value: "AND" }, { kind: "indicator", value: "RSI(14)" }, { kind: "comparison", value: "<" }, { kind: "literal", value: "30" },
  { kind: "comparison", value: "," }, { kind: "operator", value: "CROSS_ABOVE" }, { kind: "indicator", value: "EMA_20" }, { kind: "indicator", value: "EMA_50" },
];
const initialExit: ASTNode[] = [{ kind: "indicator", value: "RSI(14)" }, { kind: "comparison", value: ">" }, { kind: "literal", value: "70" }];
const initialIndicators = [
  { alias: "rsi_14", type: "RSI", params: "period: 14" },
  { alias: "ema_20", type: "EMA", params: "period: 20" },
  { alias: "ema_50", type: "EMA", params: "period: 50" },
];
const initialRisk = { stopLoss: "3.0", takeProfit: "9.0", positionSize: "10.0", maxPositions: "1", commission: "0.1", slippage: "0.05" };

function ASTChip({ node }: { node: ASTNode }) { return <span className={`bt-ast-chip ${node.kind}`}>{node.value}</span>; }
function percent(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`; }

export default function StrategyPage() {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [title, setTitle] = useState("My RSI + EMA Strategy");
  const [start, setStart] = useState("2020-01-01");
  const [end, setEnd] = useState("2024-12-31");
  const [capital, setCapital] = useState("100000");
  const [selectedTemplate, setSelectedTemplate] = useState("RSI Momentum");
  const [templateQuery, setTemplateQuery] = useState("");
  const [showIndicators, setShowIndicators] = useState(true);
  const [showRisk, setShowRisk] = useState(true);
  const [indicators, setIndicators] = useState(initialIndicators);
  const [entryNodes, setEntryNodes] = useState(initialEntry);
  const [exitNodes, setExitNodes] = useState(initialExit);
  const [risk, setRisk] = useState(initialRisk);
  const [running, setRunning] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult] = useState<LiveBacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selected = templates.find((item) => item.name === selectedTemplate) ?? templates[0];
  const filteredTemplates = useMemo(() => templates.filter((item) => `${item.name} ${item.type}`.toLowerCase().includes(templateQuery.toLowerCase())), [templateQuery]);
  const validationChecks = useMemo(() => {
    const numericCapital = Number(capital);
    const numericRisk = Object.fromEntries(Object.entries(risk).map(([key, value]) => [key, Number(value)]));
    const validRisk = Number.isFinite(numericRisk.stopLoss) && Number.isFinite(numericRisk.takeProfit) && Number.isFinite(numericRisk.positionSize) && Number.isFinite(numericRisk.maxPositions) && Number.isFinite(numericRisk.commission) && Number.isFinite(numericRisk.slippage) && numericRisk.stopLoss >= 0 && numericRisk.takeProfit >= 0 && numericRisk.positionSize > 0 && numericRisk.positionSize <= 100 && numericRisk.maxPositions === 1 && numericRisk.commission >= 0 && numericRisk.commission <= 5 && numericRisk.slippage >= 0 && numericRisk.slippage <= 5;
    return [
      { name: "Stock selected", pass: Boolean(symbol.trim()) },
      { name: "Date range", pass: Boolean(start && end && start <= end) },
      { name: "Starting capital", pass: Number.isFinite(numericCapital) && numericCapital > 0 },
      { name: "Entry and exit rules", pass: entryNodes.length > 0 && exitNodes.length > 0 },
      { name: "Risk settings", pass: validRisk },
    ];
  }, [capital, end, entryNodes.length, exitNodes.length, risk, start, symbol]);
  const isReady = validationChecks.every((check) => check.pass);

  const updateTemplate = (template: Template) => {
    setSelectedTemplate(template.name);
    setRisk((current) => ({ ...current }));
    setEntryNodes([{ kind: "operator", value: "AND" }, { kind: "indicator", value: `RSI(${template.rsiOversold === 30 ? 14 : 14})` }, { kind: "comparison", value: "<" }, { kind: "literal", value: String(template.rsiOversold) }, { kind: "operator", value: "CROSS_ABOVE" }, { kind: "indicator", value: `EMA_${template.fastEma}` }, { kind: "indicator", value: `EMA_${template.slowEma}` }]);
    setExitNodes([{ kind: "indicator", value: "RSI(14)" }, { kind: "comparison", value: ">" }, { kind: "literal", value: String(template.rsiOverbought) }]);
  };

  const resetStrategy = () => {
    setSymbol("RELIANCE"); setTitle("My RSI + EMA Strategy"); setStart("2020-01-01"); setEnd("2024-12-31"); setCapital("100000"); setSelectedTemplate("RSI Momentum"); setIndicators(initialIndicators); setEntryNodes(initialEntry); setExitNodes(initialExit); setRisk(initialRisk); setResult(null); setError(null); setMessage("New strategy workspace ready.");
  };

  const execute = async (mode: "run" | "preview") => {
    const cleanSymbol = symbol.trim().toUpperCase();
    const numericCapital = Number(capital);
    const numericRisk = { stopLoss: Number(risk.stopLoss), takeProfit: Number(risk.takeProfit), positionSize: Number(risk.positionSize), maxPositions: Number(risk.maxPositions), commission: Number(risk.commission), slippage: Number(risk.slippage) };
    if (!cleanSymbol) { setError("Choose an NSE symbol before running the strategy."); return; }
    if (!start || !end || start > end) { setError("Choose a valid date range: start must be on or before end."); return; }
    if (!Number.isFinite(numericCapital) || numericCapital <= 0) { setError("Initial capital must be greater than ₹0."); return; }
    if ([numericRisk.stopLoss, numericRisk.takeProfit, numericRisk.commission, numericRisk.slippage, numericRisk.positionSize].some((value) => !Number.isFinite(value) || value < 0) || numericRisk.positionSize > 100 || numericRisk.stopLoss > 99 || numericRisk.commission > 5 || numericRisk.slippage > 5) { setError("Risk values must be valid percentages between 0 and 100."); return; }
    if (numericRisk.maxPositions !== 1) { setError("Strategy Lab currently runs one symbol at a time, so Max Positions must remain 1."); return; }
    setError(null); setMessage(null); setResult(null);
    if (mode === "run") setRunning(true); else setPreviewing(true);
    try {
      const next = await runStrategyBacktest({ symbol: cleanSymbol, start, end, initialCapital: numericCapital, rsiPeriod: 14, rsiOversold: selected.rsiOversold, rsiOverbought: selected.rsiOverbought, fastEma: selected.fastEma, slowEma: selected.slowEma, commissionPct: numericRisk.commission / 100, slippagePct: numericRisk.slippage / 100, stopLossPct: numericRisk.stopLoss / 100, takeProfitPct: numericRisk.takeProfit / 100, positionSizePct: numericRisk.positionSize, maxPositions: numericRisk.maxPositions });
      setResult(next);
      setMessage(mode === "preview" ? `Signal preview ready: ${next.equity_curve.length.toLocaleString("en-IN")} bars inspected for ${cleanSymbol}.` : `Backtest completed for ${cleanSymbol}.`);
    } catch (requestError) {
      const detail = requestError instanceof Error ? requestError.message : "Could not run the strategy.";
      setError(detail.includes("No local NSE data") ? `${detail} Refresh the NSE catalogue and import this symbol from Data & Providers first.` : detail);
    } finally { setRunning(false); setPreviewing(false); }
  };

  return <div className="backtrack-page">
    <TopBar />
    <div className="backtrack-content bt-stack">
    <section className="bt-heading-row"><div><div className="bt-kicker"><span className="live-dot" /> BUILD A STRATEGY</div><h1>Build your strategy.</h1><p>Start with a familiar template, change the rules if you want, and test the idea on historical NSE data.</p></div><div className="bt-heading-actions"><span className="data-source"><Sparkles size={14} /> {result ? "Test complete" : "Ready to test"}</span><button className="bt-primary" onClick={() => void execute("run")} disabled={running || previewing}><Play size={13} /> {running ? "Testing…" : "Run this test"}</button></div></section>
      {error && <div className="bt-alert-error" role="alert">{error}</div>}
      {message && <div className="bt-data-note" role="status"><CheckCircle size={16} className="text-emerald-600" /> <span>{message}</span></div>}

      <div className="bt-grid-12">
        <div className="bt-col-3"><div className="bt-panel" style={{ padding: "20px" }}><span className="bt-eyebrow">START HERE</span><h2 className="bt-lab-heading">Choose a template</h2><div className="bt-search-wrap"><Search size={13} /><input value={templateQuery} onChange={(event) => setTemplateQuery(event.target.value)} placeholder="Search templates…" aria-label="Search strategy templates" /></div><div className="bt-stack-sm">{filteredTemplates.map((template) => <button type="button" key={template.name} onClick={() => updateTemplate(template)} className={`bt-template-card${selectedTemplate === template.name ? " active" : ""}`}><span className="bt-template-name">{template.name}</span><span className="bt-template-type">{template.type}</span></button>)}{filteredTemplates.length === 0 && <p className="text-xs text-slate-500">No matching templates.</p>}</div><button className="bt-secondary" style={{ width: "100%", marginTop: "14px" }} onClick={resetStrategy}><Plus size={14} /> New Strategy</button></div></div>

        <div className="bt-col-6 bt-stack">
          <div className="bt-panel" style={{ padding: "22px" }}><div className="bt-strategy-title-row"><span className="bt-eyebrow">Name this test</span><input className="bt-strategy-title-input" value={title} onChange={(event) => setTitle(event.target.value)} /></div><div className="bt-grid-2"><div><label className="bt-field-label">Stock</label><SymbolCombobox value={symbol} onChange={setSymbol} label="Universe or symbol" /></div><div><label className="bt-field-label">Candle size</label><div className="bt-field-wrap"><select className="bt-field-select" value="1day" disabled><option value="1day">1D (Official NSE daily)</option></select><ChevronDown size={14} /></div></div><div><label className="bt-field-label">Start Date</label><input type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} className="bt-field-input bt-field-mono" /></div><div><label className="bt-field-label">End Date</label><input type="date" value={end} min={start} onChange={(event) => setEnd(event.target.value)} className="bt-field-input bt-field-mono" /></div><div><label className="bt-field-label">Starting money (₹)</label><input type="number" min="1" value={capital} onChange={(event) => setCapital(event.target.value)} className="bt-field-input bt-field-mono" /></div><div><label className="bt-field-label">Buy or sell</label><div className="bt-field-wrap"><select className="bt-field-select" value="long_only" disabled><option value="long_only">Long Only (supported)</option></select><ChevronDown size={14} /></div></div></div></div>

          <div className="bt-panel" style={{ padding: "20px" }}><button type="button" className="bt-collapse-toggle" onClick={() => setShowIndicators(!showIndicators)}><div><span className="bt-eyebrow">OPTIONAL INDICATORS</span><h2 className="bt-lab-subheading">Indicators ({indicators.length})</h2></div>{showIndicators ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>{showIndicators && <div className="bt-stack-sm" style={{ marginTop: "14px" }}>{indicators.map((indicator) => <div key={indicator.alias} className="bt-indicator-row"><span className="bt-indicator-type">{indicator.type}</span><span className="bt-indicator-alias">{indicator.alias}</span><span className="bt-indicator-params">{indicator.params}</span><button type="button" aria-label={`Remove ${indicator.alias}`} className="bt-indicator-del" onClick={() => setIndicators((current) => current.filter((item) => item.alias !== indicator.alias))}><Trash2 size={13} /></button></div>)}<button type="button" className="bt-secondary" style={{ marginTop: "4px" }} onClick={() => setIndicators((current) => current.length >= 5 ? current : [...current, { alias: `ema_${current.length + 10}`, type: "EMA", params: `period: ${current.length + 10}` }])}><Plus size={13} /> Add Indicator</button></div>}</div>

          <div className="bt-panel" style={{ padding: "20px" }}><div className="bt-panel-head" style={{ marginBottom: "12px" }}><div><span className="bt-eyebrow">Rule 1 · ENTRY</span><h2 className="bt-lab-subheading">When should the strategy buy?</h2><p className="text-xs text-slate-500 mt-1">All entry conditions must be true before a long position opens.</p></div><span className="bt-valid-badge">Valid rule</span></div><div className="bt-ast-strip">{entryNodes.map((node, index) => <ASTChip key={`${node.value}-${index}`} node={node} />)}</div><p className="text-xs text-slate-600 mt-3"><strong>In plain English:</strong> Buy when RSI is below {selected.rsiOversold} and the fast EMA crosses above the slow EMA.</p><button type="button" className="bt-secondary" style={{ fontSize: "11px", marginTop: "12px" }} onClick={() => setEntryNodes((current) => [...current, { kind: "operator", value: "AND" }, { kind: "indicator", value: "EMA_20" }])}><Plus size={12} /> Add entry condition</button></div>

          <div className="bt-panel" style={{ padding: "20px" }}><div style={{ marginBottom: "12px" }}><span className="bt-eyebrow">Rule 2 · EXIT</span><h2 className="bt-lab-subheading">When should the strategy sell?</h2><p className="text-xs text-slate-500 mt-1">A position closes when this exit condition is met, or when a risk limit triggers.</p></div><div className="bt-ast-strip">{exitNodes.map((node, index) => <ASTChip key={`${node.value}-${index}`} node={node} />)}</div><p className="text-xs text-slate-600 mt-3"><strong>In plain English:</strong> Sell when RSI rises above {selected.rsiOverbought}, or when stop-loss/take-profit limits are reached.</p><button type="button" className="bt-secondary" style={{ fontSize: "11px", marginTop: "12px" }} onClick={() => setExitNodes((current) => [...current, { kind: "operator", value: "OR" }, { kind: "indicator", value: "EMA_20" }])}><Plus size={12} /> Add exit condition</button></div>

          <div className="bt-panel" style={{ padding: "20px" }}><button type="button" className="bt-collapse-toggle" onClick={() => setShowRisk(!showRisk)}><div><span className="bt-eyebrow">HOW MUCH TO RISK</span><h2 className="bt-lab-subheading">Risk limits</h2></div>{showRisk ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>{showRisk && <div className="bt-risk-grid">{Object.entries(risk).map(([key, value]) => <div key={key}><label className="bt-field-label">{key === "stopLoss" ? "Stop Loss (%)" : key === "takeProfit" ? "Take Profit (%)" : key === "positionSize" ? "Position Size (%)" : key === "maxPositions" ? "Max Positions" : key === "commission" ? "Commission (%)" : "Slippage (%)"}</label><input type="number" min="0" max={key === "positionSize" ? "100" : undefined} value={value} onChange={(event) => setRisk((current) => ({ ...current, [key]: event.target.value }))} className="bt-field-input bt-field-mono" /></div>)}</div>}</div>
        </div>

        <div className="bt-col-3 bt-stack"><div className="bt-panel" style={{ padding: "20px" }}><div className="bt-panel-head" style={{ marginBottom: "16px" }}><div><span className="bt-eyebrow">FINAL CHECK</span><h2 className="bt-lab-heading">Review before testing</h2></div></div><div className={isReady ? "bt-validation-ok" : "bt-alert-error"}><CheckCircle size={20} /><div><p className="bt-validation-ok-title">{isReady ? "Ready to test" : "Needs your attention"}</p><p className="bt-validation-ok-sub">{isReady ? "All required inputs are valid." : "Fix the items marked CHECK below."}</p></div></div><div style={{ marginBottom: "16px" }}>{validationChecks.map((check) => <div key={check.name} className="bt-check-row"><span>{check.name}</span><span className={check.pass ? "bt-check-pass" : "text-rose-600 font-semibold"}>{check.pass ? "PASS" : "CHECK"}</span></div>)}</div><div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "12px", marginBottom: "16px" }}>{[{ label: "Template", val: selected.name }, { label: "Stock", val: symbol || "Not selected" }, { label: "Timeframe", val: "1D · NSE" }, { label: "Capital", val: `₹${Number(capital || 0).toLocaleString("en-IN")}` }].map((item) => <div key={item.label} className="bt-param-row"><span className="bt-param-label">{item.label}</span><span className="bt-param-val">{item.val}</span></div>)}</div><div className="bt-stack-sm"><button type="button" className="bt-primary" style={{ width: "100%" }} onClick={() => void execute("run")} disabled={running || previewing || !isReady}><Play size={14} /> {running ? "Running…" : "Run backtest"}</button><button type="button" className="bt-secondary" style={{ width: "100%" }} onClick={() => void execute("preview")} disabled={running || previewing || !isReady}><Eye size={14} /> {previewing ? "Previewing…" : "Preview signals"}</button></div></div><div className="bt-panel" style={{ padding: "18px" }}><div className="bt-exec-note"><strong><ShieldCheck size={14} /> How orders are simulated</strong>Signals use <span className="bt-code-token">Close T</span>. Fills use <span className="bt-code-token">Open T+1</span>, preventing lookahead bias.</div></div></div>
      </div>
      {result && <section className="bt-panel bt-strategy-result" aria-live="polite"><div className="bt-panel-head"><div><span className="bt-eyebrow">{title}</span><h2>{result.symbol} backtest result</h2></div><span className="bt-panel-note">{result.equity_curve.length.toLocaleString("en-IN")} bars</span></div><div className="bt-grid-3"><div className="bt-callout"><strong>Total Return</strong><p className={result.metrics.total_return >= 0 ? "positive-copy" : "negative-copy"}>{percent(result.metrics.total_return * 100)}</p></div><div className="bt-callout"><strong>Sharpe Ratio</strong><p>{result.metrics.sharpe_ratio.toFixed(2)}</p></div><div className="bt-callout"><strong>Max Drawdown</strong><p className="negative-copy">{percent(result.metrics.max_drawdown * 100)}</p></div><div className="bt-callout"><strong>Closed Trades</strong><p>{result.metrics.total_trades}</p></div><div className="bt-callout"><strong>Ending Equity</strong><p>₹{result.final_equity.toLocaleString("en-IN")}</p></div><div className="bt-callout"><strong>Run ID</strong><p className="text-xs">{result.run_id}</p></div></div></section>}
    </div>
  </div>;
}
