"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  HelpCircle,
  Info,
  Play,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Volume2,
  XCircle,
  Zap,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { SymbolCombobox } from "@/components/data/SymbolCombobox";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

type TradeRecord = {
  entry_date: string;
  entry_price: number;
  rvol: number;
  dist_52w_pct: number;
  rsi_14: number;
  max_high_15d: number;
  max_return_pct: number;
  final_return_pct: number;
  is_true_positive: boolean;
  failure_reason: string | null;
};

type PatternResult = {
  symbol: string;
  total_bars: number;
  target_gain_pct: number;
  rvol_threshold: number;
  dist_52w_pct: number;
  hold_days: number;
  error?: string;
  metrics: {
    total_triggers: number;
    true_positives: number;
    false_positives: number;
    hit_rate_pct: number;
    avg_win_gain_pct: number;
    avg_loss_return_pct: number;
  };
  trades: TradeRecord[];
};

// Preset Stock Profiles for retail users
const PRESET_PROFILES = [
  { label: "High Momentum Banks", symbol: "PNB", target: "20", rvol: "2.0", days: "15", desc: "Breakout volume spikes in PSU Banks" },
  { label: "Large Cap Bluechips", symbol: "RELIANCE", target: "10", rvol: "1.8", days: "10", desc: "Steady 10% target for index leaders" },
  { label: "Explosive Growth", symbol: "CANBK", target: "15", rvol: "2.2", days: "15", desc: "Heavy volume surge near 52-week highs" },
  { label: "Private Sector Leaders", symbol: "FEDERALBNK", target: "15", rvol: "2.0", days: "12", desc: "Midcap bank volume accumulation" },
];

export default function PatternFinderPage() {
  const [symbol, setSymbol] = useState("PNB");
  const [targetGain, setTargetGain] = useState("20");
  const [rvolThreshold, setRvolThreshold] = useState("2.0");
  const [dist52w, setDist52w] = useState("5.0");
  const [holdDays, setHoldDays] = useState("15");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PatternResult | null>(null);
  const [filterType, setFilterType] = useState<"all" | "true_positive" | "false_positive">("all");

  const applyPreset = (preset: (typeof PRESET_PROFILES)[number]) => {
    setSymbol(preset.symbol);
    setTargetGain(preset.target);
    setRvolThreshold(preset.rvol);
    setHoldDays(preset.days);
  };

  const runTest = async () => {
    if (!symbol.trim()) {
      setError("Please select a stock symbol.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/pattern-finder/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          target_gain_pct: Number(targetGain),
          rvol_threshold: Number(rvolThreshold),
          dist_52w_pct: Number(dist52w),
          hold_days: Number(holdDays),
        }),
      });

      const payload = (await response.json()) as PatternResult & { detail?: string };
      if (!response.ok) throw new Error(payload.detail ?? "Failed to analyze pattern.");
      if (payload.error) throw new Error(payload.error);

      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute pattern analysis.");
    } finally {
      setLoading(false);
    }
  };

  const filteredTrades = useMemo(() => {
    if (!result?.trades) return [];
    if (filterType === "true_positive") return result.trades.filter((t) => t.is_true_positive);
    if (filterType === "false_positive") return result.trades.filter((t) => !t.is_true_positive);
    return result.trades;
  }, [result, filterType]);

  return (
    <div style={{ paddingTop: "72px", paddingBottom: "48px", minHeight: "100vh", backgroundColor: "#fafafa" }}>
      <TopBar title="Volume Spike & Breakout Pattern Finder" subtitle="Discover historical price surge patterns and analyze winning vs failed trade signals" />

      <div style={{ padding: "0 32px", maxWidth: "1400px", margin: "0 auto" }}>
        
        {/* Simple Customer Explainer Banner */}
        <div
          style={{
            background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)",
            border: "1px solid #c7d2fe",
            borderRadius: "14px",
            padding: "20px 24px",
            marginBottom: "24px",
            boxShadow: "0 2px 8px rgba(79, 70, 224, 0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "#4f46e5",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Zap size={22} />
            </div>
            <div>
              <h2 style={{ fontFamily: "var(--font-space-grotesk)", fontSize: "18px", fontWeight: "700", color: "#1e1b4b" }}>
                How Does Volume Spike Breakout Analysis Work?
              </h2>
              <p style={{ fontSize: "13px", color: "#4338ca", marginTop: "4px", lineHeight: "1.5" }}>
                When institutional traders buy heavily into a stock, they leave a <strong>Volume Spike</strong> signal. This tool scans 25+ years of stock data (2000–2026) to find every time a stock had a volume spike near its 52-week high, and tests whether it successfully gained your target profit or failed (false positive).
              </p>
            </div>
          </div>

          {/* Quick Setup Presets */}
          <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #c7d2fe" }}>
            <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: "11px", fontWeight: "700", color: "#3730a3", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Quick Preset Profiles:
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
              {PRESET_PROFILES.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => applyPreset(p)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    background: "#ffffff",
                    border: "1px solid #a5b4fc",
                    color: "#312e81",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                    transition: "all 120ms ease",
                  }}
                >
                  <Sparkles size={13} className="text-amber-500" />
                  <span>{p.label} ({p.symbol})</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Strategy Controls Form Card */}
        <div className="bt-stat-card" style={{ padding: "24px", marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
            <Target size={20} className="text-indigo-600" />
            <h3 style={{ fontFamily: "var(--font-space-grotesk)", fontSize: "16px", fontWeight: "700", color: "#0f172a" }}>
              Customize Your Strategy Parameters
            </h3>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "20px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#475569", marginBottom: "6px" }}>
                Select Stock Symbol
              </label>
              <SymbolCombobox value={symbol} onChange={setSymbol} />
              <span style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px", display: "block" }}>e.g., PNB, SBIN, RELIANCE, CANBK</span>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#475569", marginBottom: "6px" }}>
                Target Profit Gain (%)
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="number"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13px",
                    fontWeight: "600",
                    outline: "none",
                  }}
                  value={targetGain}
                  onChange={(e) => setTargetGain(e.target.value)}
                  placeholder="20"
                />
              </div>
              <span style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px", display: "block" }}>e.g. 20% price surge target</span>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#475569", marginBottom: "6px" }}>
                Volume Spike Multiplier (RVOL)
              </label>
              <input
                type="number"
                step="0.1"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  fontWeight: "600",
                  outline: "none",
                }}
                value={rvolThreshold}
                onChange={(e) => setRvolThreshold(e.target.value)}
                placeholder="2.0"
              />
              <span style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px", display: "block" }}>2.0 = Volume is 200% of 20-day avg</span>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#475569", marginBottom: "6px" }}>
                Holding Window (Trading Days)
              </label>
              <input
                type="number"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  fontWeight: "600",
                  outline: "none",
                }}
                value={holdDays}
                onChange={(e) => setHoldDays(e.target.value)}
                placeholder="15"
              />
              <span style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px", display: "block" }}>Time limit to reach profit target</span>
            </div>
          </div>

          <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={runTest}
              disabled={loading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "11px 28px",
                borderRadius: "8px",
                background: "#4f46e5",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: "600",
                border: "none",
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(79, 70, 224, 0.2)",
              }}
            >
              {loading ? <RefreshCw className="animate-spin" size={16} /> : <Play size={16} />}
              {loading ? "Analyzing 25+ Years of Data..." : "Run Pattern Analysis"}
            </button>
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: "16px 20px",
              backgroundColor: "#fef2f2",
              border: "1px solid #fca5a5",
              borderRadius: "10px",
              color: "#991b1b",
              marginBottom: "24px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <AlertTriangle size={20} />
            <span style={{ fontSize: "14px", fontWeight: "500" }}>{error}</span>
          </div>
        )}

        {/* Execution Results Section */}
        {result && (
          <div>
            {/* KPI Performance Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", marginBottom: "24px" }}>
              
              <div className="bt-stat-card">
                <span>Tested Stock</span>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "4px" }}>
                  <h3 style={{ fontFamily: "var(--font-space-grotesk)", fontSize: "28px", fontWeight: "700", color: "#0f172a" }}>
                    {result.symbol}
                  </h3>
                  <span style={{ fontSize: "12px", color: "#64748b", textTransform: "none" }}>({result.total_bars} candles)</span>
                </div>
                <p style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Analyzed from 2000 to 2026</p>
              </div>

              <div className="bt-stat-card" style={{ borderLeft: "4px solid #059669" }}>
                <span>Historical Hit Rate</span>
                <h3 style={{ fontFamily: "var(--font-space-grotesk)", fontSize: "28px", fontWeight: "700", color: "#059669", marginTop: "4px" }}>
                  {result.metrics.hit_rate_pct}%
                </h3>
                <p style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                  <strong>{result.metrics.true_positives}</strong> succeeded out of {result.metrics.total_triggers} setups
                </p>
              </div>

              <div className="bt-stat-card" style={{ borderLeft: "4px solid #4f46e5" }}>
                <span>True Positives (Winners)</span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                  <CheckCircle2 className="text-emerald-600" size={24} />
                  <h3 style={{ fontFamily: "var(--font-space-grotesk)", fontSize: "28px", fontWeight: "700", color: "#0f172a" }}>
                    {result.metrics.true_positives}
                  </h3>
                </div>
                <p style={{ fontSize: "12px", color: "#059669", marginTop: "4px", fontWeight: "600" }}>
                  Avg Winner Peak Move: +{result.metrics.avg_win_gain_pct}%
                </p>
              </div>

              <div className="bt-stat-card" style={{ borderLeft: "4px solid #e11d48" }}>
                <span>False Positives (Failed Signals)</span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                  <XCircle className="text-rose-600" size={24} />
                  <h3 style={{ fontFamily: "var(--font-space-grotesk)", fontSize: "28px", fontWeight: "700", color: "#0f172a" }}>
                    {result.metrics.false_positives}
                  </h3>
                </div>
                <p style={{ fontSize: "12px", color: "#e11d48", marginTop: "4px", fontWeight: "600" }}>
                  Avg Failed Return: {result.metrics.avg_loss_return_pct}%
                </p>
              </div>

            </div>

            {/* Interactive Trade Signal & False Positive Log Table */}
            <div className="bt-stat-card" style={{ padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "14px" }}>
                <div>
                  <h3 style={{ fontFamily: "var(--font-space-grotesk)", fontSize: "18px", fontWeight: "700", color: "#0f172a" }}>
                    Historical Breakout Setup Signals
                  </h3>
                  <p style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                    Inspect every historical volume spike setup and diagnose why false positives failed.
                  </p>
                </div>

                {/* Filter Buttons */}
                <div style={{ display: "flex", background: "#f1f5f9", padding: "4px", borderRadius: "8px", gap: "4px" }}>
                  <button
                    onClick={() => setFilterType("all")}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: "600",
                      border: "none",
                      cursor: "pointer",
                      background: filterType === "all" ? "#ffffff" : "transparent",
                      color: filterType === "all" ? "#0f172a" : "#64748b",
                      boxShadow: filterType === "all" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    }}
                  >
                    All Signals ({result.trades.length})
                  </button>
                  <button
                    onClick={() => setFilterType("true_positive")}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: "600",
                      border: "none",
                      cursor: "pointer",
                      background: filterType === "true_positive" ? "#ffffff" : "transparent",
                      color: filterType === "true_positive" ? "#059669" : "#64748b",
                      boxShadow: filterType === "true_positive" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    }}
                  >
                    True Positives ({result.metrics.true_positives})
                  </button>
                  <button
                    onClick={() => setFilterType("false_positive")}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: "600",
                      border: "none",
                      cursor: "pointer",
                      background: filterType === "false_positive" ? "#ffffff" : "transparent",
                      color: filterType === "false_positive" ? "#e11d48" : "#64748b",
                      boxShadow: filterType === "false_positive" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    }}
                  >
                    False Positives ({result.metrics.false_positives})
                  </button>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #f1f5f9", textAlign: "left", color: "#64748b", fontFamily: "var(--font-jetbrains)", fontSize: "11px", textTransform: "uppercase" }}>
                      <th style={{ padding: "12px 10px" }}>Date</th>
                      <th style={{ padding: "12px 10px" }}>Stock Price</th>
                      <th style={{ padding: "12px 10px" }}>Volume Surge (RVOL)</th>
                      <th style={{ padding: "12px 10px" }}>52w High Dist %</th>
                      <th style={{ padding: "12px 10px" }}>Peak 15d Move</th>
                      <th style={{ padding: "12px 10px" }}>Signal Outcome</th>
                      <th style={{ padding: "12px 10px" }}>Diagnostic Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTrades.map((t, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 10px", fontWeight: "600", color: "#0f172a" }}>{t.entry_date}</td>
                        <td style={{ padding: "12px 10px", fontFamily: "var(--font-jetbrains)" }}>₹{t.entry_price}</td>
                        <td style={{ padding: "12px 10px" }}>
                          <span style={{ padding: "3px 8px", borderRadius: "4px", background: "#eef2ff", color: "#3730a3", fontWeight: "600", fontFamily: "var(--font-jetbrains)", fontSize: "12px" }}>
                            {t.rvol}x Volume
                          </span>
                        </td>
                        <td style={{ padding: "12px 10px", fontFamily: "var(--font-jetbrains)" }}>{t.dist_52w_pct}%</td>
                        <td style={{ padding: "12px 10px", fontWeight: "700", fontFamily: "var(--font-jetbrains)", color: t.max_return_pct >= result.target_gain_pct ? "#059669" : "#d97706" }}>
                          +{t.max_return_pct}%
                        </td>
                        <td style={{ padding: "12px 10px" }}>
                          {t.is_true_positive ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "4px 10px",
                                borderRadius: "6px",
                                backgroundColor: "#ecfdf5",
                                color: "#047857",
                                fontSize: "12px",
                                fontWeight: "600",
                              }}
                            >
                              <TrendingUp size={14} /> True Positive
                            </span>
                          ) : (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "4px 10px",
                                borderRadius: "6px",
                                backgroundColor: "#fff1f2",
                                color: "#e11d48",
                                fontSize: "12px",
                                fontWeight: "600",
                              }}
                            >
                              <TrendingDown size={14} /> False Positive
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "12px 10px", color: t.failure_reason ? "#e11d48" : "#64748b", fontSize: "12px" }}>
                          {t.failure_reason ?? "✓ Reached Target Profit"}
                        </td>
                      </tr>
                    ))}
                    {filteredTrades.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "#64748b" }}>
                          No historical triggers match the selected filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
