"use client";

import { useState } from "react";
import {
  Plus,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Play,
  Eye,
  Trash2,
  Search,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { SymbolCombobox } from "@/components/data/SymbolCombobox";

const templates = [
  { name: "RSI Momentum", type: "Mean Reversion", sharpe: 1.87 },
  { name: "MACD Crossover", type: "Trend Following", sharpe: 1.34 },
  { name: "Bollinger Reversion", type: "Mean Reversion", sharpe: 1.12 },
  { name: "ATR Breakout", type: "Breakout", sharpe: 1.54 },
  { name: "EMA Trend", type: "Trend Following", sharpe: 0.94 },
];

const validationChecks = [
  "Indicator Dependencies",
  "Expression AST",
  "Date Range",
  "Symbol Availability",
  "Risk Settings",
];

type ASTKind = "operator" | "indicator" | "comparison" | "literal";
type ASTNode = { kind: ASTKind; value: string };

function ASTChip({ node }: { node: ASTNode }) {
  return (
    <span className={`bt-ast-chip ${node.kind}`}>{node.value}</span>
  );
}

const entryAST: ASTNode[] = [
  { kind: "operator", value: "AND" },
  { kind: "indicator", value: "RSI(14)" },
  { kind: "comparison", value: "<" },
  { kind: "literal", value: "30" },
  { kind: "comparison", value: "," },
  { kind: "operator", value: "CROSS_ABOVE" },
  { kind: "indicator", value: "EMA_20" },
  { kind: "indicator", value: "EMA_50" },
];

const exitAST: ASTNode[] = [
  { kind: "indicator", value: "RSI(14)" },
  { kind: "comparison", value: ">" },
  { kind: "literal", value: "70" },
];

const keyParams = [
  { label: "Est. Data Points", val: "1,247 bars" },
  { label: "Date Range", val: "5 years" },
  { label: "Indicators", val: "3" },
  { label: "Conditions", val: "2 entry, 1 exit" },
];

const riskFields = [
  { label: "Stop Loss (%)", val: "3.0" },
  { label: "Take Profit (%)", val: "9.0" },
  { label: "Position Size (%)", val: "10.0" },
  { label: "Max Positions", val: "3" },
  { label: "Commission (%)", val: "0.1" },
  { label: "Slippage (%)", val: "0.05" },
];

export default function StrategyPage() {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [showIndicators, setShowIndicators] = useState(true);
  const [showRisk, setShowRisk] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState("RSI Momentum");

  return (
    <div className="backtrack-page">
      <TopBar />

      <div className="backtrack-content bt-stack">
        {/* Page Header */}
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker">
              <span className="live-dot" /> 02 / STRATEGY LAB
            </div>
            <h1>Visually build &amp; validate strategies.</h1>
            <p>
              Design rule-based quantitative strategies using modular AST
              chips, indicators, and risk limits.
            </p>
          </div>
          <div className="bt-heading-actions">
            <span className="data-source">
              <Sparkles size={14} /> AST Engine Ready
            </span>
            <button className="bt-primary">
              <Play size={13} /> Run Backtest
            </button>
          </div>
        </section>

        {/* 3-column grid */}
        <div className="bt-grid-12">
          {/* ── LEFT: Template Library ── */}
          <div className="bt-col-3">
            <div className="bt-panel" style={{ padding: "20px" }}>
              <span className="bt-eyebrow">Library</span>
              <h2
                style={{
                  marginTop: "5px",
                  fontFamily: "var(--font-space-grotesk)",
                  fontSize: "17px",
                  fontWeight: 600,
                  color: "#0f172a",
                  marginBottom: "14px",
                }}
              >
                Templates
              </h2>

              <div className="bt-search-wrap">
                <Search size={13} />
                <input placeholder="Search templates…" />
              </div>

              <div className="bt-stack-sm">
                {templates.map((t) => (
                  <div
                    key={t.name}
                    onClick={() => setSelectedTemplate(t.name)}
                    className={`bt-template-card${
                      selectedTemplate === t.name ? " active" : ""
                    }`}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "8px",
                        marginBottom: "4px",
                      }}
                    >
                      <span className="bt-template-name">{t.name}</span>
                      <span className="bt-template-sharpe">{t.sharpe}</span>
                    </div>
                    <span className="bt-template-type">{t.type}</span>
                  </div>
                ))}
              </div>

              <button
                className="bt-secondary"
                style={{ width: "100%", marginTop: "14px" }}
              >
                <Plus size={14} /> New Strategy
              </button>
            </div>
          </div>

          {/* ── CENTER: Visual Builder ── */}
          <div className="bt-col-6 bt-stack">
            {/* Title & Setup */}
            <div className="bt-panel" style={{ padding: "22px" }}>
              <div
                style={{
                  borderBottom: "1px solid #f1f5f9",
                  paddingBottom: "14px",
                  marginBottom: "18px",
                }}
              >
                <span className="bt-eyebrow">Strategy Title</span>
                <input
                  className="bt-strategy-title-input"
                  defaultValue="My RSI + EMA Strategy"
                />
              </div>

              <div className="bt-grid-2">
                <div>
                  <label className="bt-field-label">Universe / Symbol</label>
                  <SymbolCombobox value={symbol} onChange={setSymbol} label="Universe or symbol" />
                </div>
                <div>
                  <label className="bt-field-label">Timeframe</label>
                  <div className="bt-field-wrap">
                    <select className="bt-field-select">
                      <option>1D (Daily)</option>
                      <option>4H (4 Hours)</option>
                      <option>1H (1 Hour)</option>
                      <option>15m (15 Mins)</option>
                    </select>
                    <ChevronDown size={14} />
                  </div>
                </div>
                <div>
                  <label className="bt-field-label">Start Date</label>
                  <input
                    type="date"
                    defaultValue="2020-01-01"
                    className="bt-field-input bt-field-mono"
                  />
                </div>
                <div>
                  <label className="bt-field-label">End Date</label>
                  <input
                    type="date"
                    defaultValue="2024-12-31"
                    className="bt-field-input bt-field-mono"
                  />
                </div>
                <div>
                  <label className="bt-field-label">Initial Capital (₹)</label>
                  <input
                    type="number"
                    defaultValue="100000"
                    className="bt-field-input bt-field-mono"
                    style={{ color: "#4f46e5" }}
                  />
                </div>
                <div>
                  <label className="bt-field-label">Trade Direction</label>
                  <div className="bt-field-wrap">
                    <select className="bt-field-select">
                      <option>Long Only</option>
                      <option>Short Only</option>
                      <option>Long + Short</option>
                    </select>
                    <ChevronDown size={14} />
                  </div>
                </div>
              </div>
            </div>

            {/* Indicators */}
            <div className="bt-panel" style={{ padding: "20px" }}>
              <div
                className="bt-collapse-toggle"
                onClick={() => setShowIndicators(!showIndicators)}
              >
                <div>
                  <span className="bt-eyebrow">Technicals</span>
                  <h2
                    style={{
                      marginTop: "4px",
                      fontFamily: "var(--font-inter)",
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#0f172a",
                    }}
                  >
                    Indicators (3)
                  </h2>
                </div>
                {showIndicators ? (
                  <ChevronUp size={16} style={{ color: "#94a3b8" }} />
                ) : (
                  <ChevronDown size={16} style={{ color: "#94a3b8" }} />
                )}
              </div>

              {showIndicators && (
                <div className="bt-stack-sm" style={{ marginTop: "14px" }}>
                  {[
                    { alias: "rsi_14", type: "RSI", params: "period: 14" },
                    { alias: "ema_20", type: "EMA", params: "period: 20" },
                    { alias: "ema_50", type: "EMA", params: "period: 50" },
                  ].map((ind) => (
                    <div key={ind.alias} className="bt-indicator-row">
                      <span className="bt-indicator-type">{ind.type}</span>
                      <span className="bt-indicator-alias">{ind.alias}</span>
                      <span className="bt-indicator-params">{ind.params}</span>
                      <button className="bt-indicator-del">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}

                  <button className="bt-secondary" style={{ marginTop: "4px" }}>
                    <Plus size={13} /> Add Indicator
                  </button>
                </div>
              )}
            </div>

            {/* Entry Conditions */}
            <div className="bt-panel" style={{ padding: "20px" }}>
              <div className="bt-panel-head" style={{ marginBottom: "12px" }}>
                <div>
                  <span className="bt-eyebrow">Logic</span>
                  <h2
                    style={{
                      marginTop: "4px",
                      fontFamily: "var(--font-inter)",
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#0f172a",
                    }}
                  >
                    Entry Conditions
                  </h2>
                </div>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: "4px",
                    background: "#f0fdf4",
                    color: "#15803d",
                    border: "1px solid #bbf7d0",
                    fontFamily: "var(--font-jetbrains)",
                    fontSize: "9px",
                    fontWeight: 700,
                    textTransform: "uppercase" as const,
                  }}
                >
                  Valid AST
                </span>
              </div>

              <div className="bt-ast-strip">
                {entryAST.map((node, i) => (
                  <ASTChip key={i} node={node} />
                ))}
              </div>

              <button className="bt-secondary" style={{ fontSize: "11px" }}>
                <Plus size={12} /> Add Condition
              </button>
            </div>

            {/* Exit Conditions */}
            <div className="bt-panel" style={{ padding: "20px" }}>
              <div style={{ marginBottom: "12px" }}>
                <span className="bt-eyebrow">Logic</span>
                <h2
                  style={{
                    marginTop: "4px",
                    fontFamily: "var(--font-inter)",
                    fontSize: "14px",
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  Exit Conditions
                </h2>
              </div>
              <div className="bt-ast-strip">
                {exitAST.map((node, i) => (
                  <ASTChip key={i} node={node} />
                ))}
              </div>
            </div>

            {/* Risk Settings */}
            <div className="bt-panel" style={{ padding: "20px" }}>
              <div
                className="bt-collapse-toggle"
                onClick={() => setShowRisk(!showRisk)}
              >
                <div>
                  <span className="bt-eyebrow">Risk &amp; Positioning</span>
                  <h2
                    style={{
                      marginTop: "4px",
                      fontFamily: "var(--font-inter)",
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#0f172a",
                    }}
                  >
                    Risk Settings
                  </h2>
                </div>
                {showRisk ? (
                  <ChevronUp size={16} style={{ color: "#94a3b8" }} />
                ) : (
                  <ChevronDown size={16} style={{ color: "#94a3b8" }} />
                )}
              </div>

              {showRisk && (
                <div className="bt-risk-grid">
                  {riskFields.map(({ label, val }) => (
                    <div key={label}>
                      <label className="bt-field-label">{label}</label>
                      <input
                        type="number"
                        defaultValue={val}
                        className="bt-field-input bt-field-mono"
                        style={{ color: "#4f46e5" }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Validation & Execution ── */}
          <div className="bt-col-3 bt-stack">
            {/* Validation Panel */}
            <div className="bt-panel" style={{ padding: "20px" }}>
              <div className="bt-panel-head" style={{ marginBottom: "16px" }}>
                <div>
                  <span className="bt-eyebrow">Validation</span>
                  <h2
                    style={{
                      marginTop: "5px",
                      fontFamily: "var(--font-space-grotesk)",
                      fontSize: "17px",
                      fontWeight: 600,
                      color: "#0f172a",
                    }}
                  >
                    Engine status
                  </h2>
                </div>
              </div>

              {/* Status badge */}
              <div className="bt-validation-ok">
                <CheckCircle
                  size={20}
                  style={{ color: "#15803d", flexShrink: 0 }}
                />
                <div>
                  <p className="bt-validation-ok-title">Strategy Valid</p>
                  <p className="bt-validation-ok-sub">All AST checks passed</p>
                </div>
              </div>

              {/* Checklist */}
              <div style={{ marginBottom: "16px" }}>
                {validationChecks.map((name) => (
                  <div key={name} className="bt-check-row">
                    <span>{name}</span>
                    <span className="bt-check-pass">PASS</span>
                  </div>
                ))}
              </div>

              {/* Key params */}
              <div
                style={{
                  borderTop: "1px solid #f1f5f9",
                  paddingTop: "12px",
                  marginBottom: "16px",
                }}
              >
                {keyParams.map(({ label, val }) => (
                  <div key={label} className="bt-param-row">
                    <span className="bt-param-label">{label}</span>
                    <span className="bt-param-val">{val}</span>
                  </div>
                ))}
              </div>

              {/* CTAs */}
              <div className="bt-stack-sm">
                <button className="bt-primary" style={{ width: "100%" }}>
                  <Play size={14} /> Compile &amp; Run Backtest
                </button>
                <button className="bt-secondary" style={{ width: "100%" }}>
                  <Eye size={14} /> Preview Signals
                </button>
              </div>
            </div>

            {/* Execution Guarantee */}
            <div className="bt-panel" style={{ padding: "18px" }}>
              <div className="bt-exec-note">
                <strong>
                  <ShieldCheck size={14} style={{ color: "#4f46e5" }} />
                  Execution Guarantee
                </strong>
                Signals evaluated on{" "}
                <span className="bt-code-token">Close T</span>. Fills
                executed on{" "}
                <span className="bt-code-token">Open T+1</span>. Zero
                lookahead leakage.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
