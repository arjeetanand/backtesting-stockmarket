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

type PresetCategory = "All" | "PSU Banks" | "Large Caps" | "IT Giants" | "Auto & Metals" | "Defense & Growth";

type PresetProfile = {
  category: "PSU Banks" | "Large Caps" | "IT Giants" | "Auto & Metals" | "Defense & Growth";
  label: string;
  symbol: string;
  target: string;
  rvol: string;
  dist: string;
  days: string;
  badge: string;
  desc: string;
  whyThisWorks: string;
};

// Comprehensive Preset Stock Profiles across Indian NSE Sectors & Volatility Classes
const PRESET_PROFILES: PresetProfile[] = [
  {
    category: "PSU Banks",
    label: "PSU Banking Momentum Surge",
    symbol: "PNB",
    target: "20",
    rvol: "2.0",
    dist: "5.0",
    days: "15",
    badge: "High Beta PSU",
    desc: "2.0x Volume surge near 52W High seeking +20% price expansion in 15 days.",
    whyThisWorks: "PSU Banks undergo strong multi-week trend legs during credit expansion cycles. When institutional volume doubles (2.0x RVOL) near 52W Highs, PNB frequently exhibits sustained momentum follow-through.",
  },
  {
    category: "PSU Banks",
    label: "Explosive PSU Bank Breakout",
    symbol: "CANBK",
    target: "15",
    rvol: "2.2",
    dist: "3.0",
    days: "15",
    badge: "Tight Base Breakout",
    desc: "Heavy 2.2x volume surge within 3% of ATH testing a 15% move in 15 days.",
    whyThisWorks: "Canara Bank exhibits clean Volatility Contraction Patterns (VCP). Filtering for 2.2x RVOL within 3% of 52W High filters out weak head-fake rallies and isolates high-conviction institutional buying.",
  },
  {
    category: "PSU Banks",
    label: "Heavyweight PSU Accumulation",
    symbol: "SBIN",
    target: "12",
    rvol: "1.8",
    dist: "5.0",
    days: "15",
    badge: "Institutional Titan",
    desc: "1.8x Volume accumulation seeking steady +12% target over 15 days.",
    whyThisWorks: "State Bank of India requires massive capital to move. A 1.8x RVOL indicates major FII/DII positioning. Setting a conservative +12% target yields a significantly higher historical hit rate.",
  },
  {
    category: "Large Caps",
    label: "Index Heavyweight Baseline",
    symbol: "RELIANCE",
    target: "10",
    rvol: "1.8",
    dist: "5.0",
    days: "10",
    badge: "NIFTY #1 Weight",
    desc: "Steady +10% target with 1.8x volume surge over 10 trading days.",
    whyThisWorks: "Reliance rarely surges 20% in 15 days outside major earnings surprises. Testing a +10% target with 1.8x RVOL isolates high-probability swing moves without over-extending expectations.",
  },
  {
    category: "Large Caps",
    label: "Private Bank Quality Leader",
    symbol: "HDFCBANK",
    target: "10",
    rvol: "1.6",
    dist: "4.0",
    days: "12",
    badge: "Core Banking",
    desc: "1.6x Volume surge near 52W High testing a +10% move in 12 days.",
    whyThisWorks: "HDFC Bank features moderate daily volatility. Lowering the RVOL threshold to 1.6x captures genuine institutional re-rating while maintaining high trade frequency.",
  },
  {
    category: "Large Caps",
    label: "Private Bank Outperformer",
    symbol: "ICICIBANK",
    target: "12",
    rvol: "1.8",
    dist: "3.0",
    days: "15",
    badge: "Outperformance Leader",
    desc: "1.8x Volume near fresh 52W High testing +12% gain over 15 days.",
    whyThisWorks: "ICICI Bank consistently leads private banking momentum. High proximity (3% to 52W High) ensures zero overhead trapped supply from previous years.",
  },
  {
    category: "IT Giants",
    label: "IT Sector Anchor",
    symbol: "TCS",
    target: "8",
    rvol: "1.6",
    dist: "4.0",
    days: "10",
    badge: "Defensive Quality",
    desc: "1.6x Volume surge seeking a realistic +8% trend continuation in 10 days.",
    whyThisWorks: "TCS has lower beta than midcap IT. A tight +8% target prevents exiting on minor profit pullbacks while capitalizing on steady institutional trend runs.",
  },
  {
    category: "IT Giants",
    label: "High Momentum Tech Leader",
    symbol: "INFY",
    target: "12",
    rvol: "2.0",
    dist: "5.0",
    days: "15",
    badge: "Tech Growth",
    desc: "2.0x Volume surge near 52W High targeting +12% move in 15 days.",
    whyThisWorks: "Infosys exhibits sharper post-earnings and sectoral volume breakouts than slower IT peers, making 2.0x RVOL an effective institutional signal filter.",
  },
  {
    category: "Auto & Metals",
    label: "High Beta Auto Surge",
    symbol: "TATAMOTORS",
    target: "20",
    rvol: "2.5",
    dist: "5.0",
    days: "15",
    badge: "High Beta Auto",
    desc: "Heavy 2.5x volume breakout targeting +20% rally over 15 days.",
    whyThisWorks: "Tata Motors is a high-beta cyclical leader. When volume spikes above 2.5x near annual highs, it frequently triggers powerful multi-week short squeezes and expansion legs.",
  },
  {
    category: "Auto & Metals",
    label: "Cyclical Metal Breakout",
    symbol: "TATASTEEL",
    target: "18",
    rvol: "2.4",
    dist: "5.0",
    days: "15",
    badge: "Commodity Cyclical",
    desc: "2.4x Volume surge during metal sector momentum targeting +18% gain.",
    whyThisWorks: "Steel stocks move in sharp, aggressive commodity cycles. Requiring 2.4x RVOL ensures institutional participation during global metal upswings.",
  },
  {
    category: "Defense & Growth",
    label: "Defense PSU Order Book Boom",
    symbol: "BEL",
    target: "20",
    rvol: "2.5",
    dist: "3.0",
    days: "15",
    badge: "Defense Leader",
    desc: "2.5x Volume surge near 52W High targeting +20% move over 15 days.",
    whyThisWorks: "Bharat Electronics experiences rapid institutional accumulation upon defense order announcements, leading to sustained multi-week breakouts.",
  },
];

export default function PatternFinderPage() {
  const [symbol, setSymbol] = useState("PNB");
  const [targetGain, setTargetGain] = useState("20");
  const [rvolThreshold, setRvolThreshold] = useState("2.0");
  const [dist52w, setDist52w] = useState("5.0");
  const [holdDays, setHoldDays] = useState("15");

  const [selectedCategory, setSelectedCategory] = useState<PresetCategory>("All");
  const [activePreset, setActivePreset] = useState<PresetProfile | null>(PRESET_PROFILES[0]);
  const [showBenchmarkGuide, setShowBenchmarkGuide] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PatternResult | null>(null);
  const [filterType, setFilterType] = useState<"all" | "true_positive" | "false_positive">("all");

  const applyPreset = (preset: PresetProfile) => {
    setSymbol(preset.symbol);
    setTargetGain(preset.target);
    setRvolThreshold(preset.rvol);
    setDist52w(preset.dist);
    setHoldDays(preset.days);
    setActivePreset(preset);
  };

  const filteredPresets = useMemo(() => {
    if (selectedCategory === "All") return PRESET_PROFILES;
    return PRESET_PROFILES.filter((p) => p.category === selectedCategory);
  }, [selectedCategory]);

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

  const outcomeStats = useMemo(() => {
    const values = filteredTrades.map((trade) => Number(trade.max_return_pct));
    const finalValues = filteredTrades.map((trade) => Number(trade.final_return_pct));
    const sortedFinal = [...finalValues].sort((a, b) => a - b);
    const medianFinal = sortedFinal.length ? sortedFinal[Math.floor(sortedFinal.length / 2)] : 0;
    return {
      best: values.length ? Math.max(...values) : 0,
      worst: values.length ? Math.min(...values) : 0,
      medianFinal,
      hitRate: filteredTrades.length ? filteredTrades.filter((trade) => trade.is_true_positive).length / filteredTrades.length * 100 : 0,
    };
  }, [filteredTrades]);

  return (
    <div className="backtrack-page pattern-finder-page">
      <TopBar title="Volume Spike & Breakout Pattern Finder" subtitle="Discover historical price surge patterns and analyze winning vs failed trade signals" />

      <main className="backtrack-content pattern-finder-content">
        
        {/* Simple Customer Explainer Banner */}
        <div className="pattern-finder-intro"
          style={{
            background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)",
            border: "1px solid #c7d2fe",
            borderRadius: "14px",
            padding: "22px 26px",
            marginBottom: "24px",
            boxShadow: "0 2px 8px rgba(79, 70, 224, 0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                background: "#4f46e5",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Zap size={24} />
            </div>
            <div>
              <h2 style={{ fontFamily: "var(--font-space-grotesk)", fontSize: "18px", fontWeight: "700", color: "#1e1b4b" }}>
                What is Pattern Finder and How Does It Work?
              </h2>
              <p style={{ fontSize: "13px", color: "#3730a3", marginTop: "4px", lineHeight: "1.5" }}>
                Before risking real money on a breakout idea, <strong>Pattern Finder</strong> tests if volume surges on a stock historically led to actual gains. It scans 25+ years of daily stock history (2000–2026) to calculate your exact historical win rate.
              </p>
            </div>
          </div>

          {/* 3-Step How-It-Works Visual Card */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginTop: "18px", paddingTop: "16px", borderTop: "1px solid #c7d2fe" }}>
            <div style={{ background: "#ffffff", padding: "12px 14px", borderRadius: "8px", border: "1px solid #a5b4fc" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#4338ca", fontWeight: "700", fontSize: "12px" }}>
                <span style={{ background: "#e0e7ff", borderRadius: "50%", width: "20px", height: "20px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "11px" }}>1</span>
                <span>The Trigger (Volume Surge)</span>
              </div>
              <p style={{ fontSize: "11px", color: "#475569", marginTop: "4px" }}>Scans for days when volume is at least 2.0x normal within 5% of 52-week highs.</p>
            </div>
            <div style={{ background: "#ffffff", padding: "12px 14px", borderRadius: "8px", border: "1px solid #a5b4fc" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#4338ca", fontWeight: "700", fontSize: "12px" }}>
                <span style={{ background: "#e0e7ff", borderRadius: "50%", width: "20px", height: "20px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "11px" }}>2</span>
                <span>The Test (Forward Move)</span>
              </div>
              <p style={{ fontSize: "11px", color: "#475569", marginTop: "4px" }}>Tracks if price surged +20% within the next 15 trading days.</p>
            </div>
            <div style={{ background: "#ffffff", padding: "12px 14px", borderRadius: "8px", border: "1px solid #a5b4fc" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#4338ca", fontWeight: "700", fontSize: "12px" }}>
                <span style={{ background: "#e0e7ff", borderRadius: "50%", width: "20px", height: "20px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "11px" }}>3</span>
                <span>The Verdict (Win Rate)</span>
              </div>
              <p style={{ fontSize: "11px", color: "#475569", marginTop: "4px" }}>Shows total successful breakouts vs failed false breakouts.</p>
            </div>
          </div>
        </div>

        {/* Multi-Sector Preset Stock Scans & Research Section */}
        <div className="bt-stat-card pattern-finder-presets" style={{ padding: "22px 24px", marginBottom: "24px", background: "#ffffff" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Sparkles className="text-amber-500" size={18} />
                <h3 style={{ fontFamily: "var(--font-space-grotesk)", fontSize: "16px", fontWeight: "700", color: "#0f172a" }}>
                  Multi-Sector Preset Stock Scans
                </h3>
              </div>
              <p style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                Select a research-tested preset profile tailored to stock sector, market cap, and volatility profile.
              </p>
            </div>

            <button
              onClick={() => setShowBenchmarkGuide(!showBenchmarkGuide)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "6px",
                background: "#f1f5f9",
                border: "1px solid #cbd5e1",
                color: "#334155",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              <Info size={14} className="text-indigo-600" />
              <span>{showBenchmarkGuide ? "Hide Research Guide" : "Pattern Benchmark Guide"}</span>
            </button>
          </div>

          {/* Sector Category Filter Tabs */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
            {(["All", "PSU Banks", "Large Caps", "IT Giants", "Auto & Metals", "Defense & Growth"] as PresetCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: "600",
                  border: "1px solid",
                  borderColor: selectedCategory === cat ? "#4f46e5" : "#e2e8f0",
                  background: selectedCategory === cat ? "#eef2ff" : "#ffffff",
                  color: selectedCategory === cat ? "#4338ca" : "#64748b",
                  cursor: "pointer",
                  transition: "all 120ms ease",
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Preset Cards Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
            {filteredPresets.map((p, idx) => {
              const isSelected = symbol.toUpperCase() === p.symbol.toUpperCase() && targetGain === p.target && rvolThreshold === p.rvol;
              return (
                <div
                  key={idx}
                  onClick={() => applyPreset(p)}
                  style={{
                    padding: "14px",
                    borderRadius: "10px",
                    border: "1.5px solid",
                    borderColor: isSelected ? "#6366f1" : "#e2e8f0",
                    background: isSelected ? "#f8fafc" : "#ffffff",
                    cursor: "pointer",
                    transition: "all 150ms ease",
                    boxShadow: isSelected ? "0 2px 8px rgba(99, 102, 241, 0.12)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", color: "#4f46e5", textTransform: "uppercase", fontFamily: "var(--font-jetbrains)" }}>
                      {p.symbol}
                    </span>
                    <span style={{ padding: "2px 7px", borderRadius: "4px", background: "#e0e7ff", color: "#3730a3", fontSize: "10px", fontWeight: "700" }}>
                      {p.badge}
                    </span>
                  </div>

                  <strong style={{ display: "block", fontSize: "13px", color: "#0f172a", marginBottom: "4px" }}>
                    {p.label}
                  </strong>
                  <p style={{ fontSize: "11px", color: "#64748b", lineHeight: "1.4", marginBottom: "10px" }}>
                    {p.desc}
                  </p>

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", fontSize: "10px", fontFamily: "var(--font-jetbrains)", fontWeight: "600", color: "#475569" }}>
                    <span style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>Target: +{p.target}%</span>
                    <span style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>RVOL: {p.rvol}x</span>
                    <span style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>52W Dist: ≤{p.dist}%</span>
                    <span style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>Hold: {p.days}d</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Preset Institutional Rationale Callout */}
          {activePreset && (
            <div style={{ marginTop: "16px", padding: "14px 18px", borderRadius: "10px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#334155", fontWeight: "700", fontSize: "13px" }}>
                <Zap size={16} className="text-amber-500" />
                <span>Why Parameters Work for {activePreset.symbol} ({activePreset.label}):</span>
              </div>
              <p style={{ fontSize: "12px", color: "#475569", marginTop: "4px", lineHeight: "1.5" }}>
                {activePreset.whyThisWorks}
              </p>
            </div>
          )}

          {/* Collapsible Educational Strategy & Benchmark Guide */}
          {showBenchmarkGuide ? (
            <div style={{ marginTop: "18px", padding: "20px", borderRadius: "12px", background: "#faf5ff", border: "1px solid #e9d5ff" }}>
              <h4 style={{ fontFamily: "var(--font-space-grotesk)", fontSize: "15px", fontWeight: "700", color: "#581c87", marginBottom: "10px" }}>
                Pattern Finder Benchmark & Parameter Selection Guide
              </h4>
              <p style={{ fontSize: "12px", color: "#6b21a8", marginBottom: "14px", lineHeight: "1.5" }}>
                Different stock categories require tailored parameters. Setting a 25% target on a slow bluechip will cause high false-positive rates, whereas setting a 2.5x RVOL on midcaps filters out false head-fakes.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
                <div style={{ background: "#ffffff", padding: "12px 14px", borderRadius: "8px", border: "1px solid #d8b4fe" }}>
                  <strong style={{ fontSize: "12px", color: "#581c87" }}>1. Large Caps & Index Heavyweights</strong>
                  <p style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", lineHeight: "1.4" }}>
                    • <strong>RVOL Range:</strong> 1.5x to 1.8x<br />
                    • <strong>Ideal Target:</strong> 8% to 12%<br />
                    • <strong>Why:</strong> Heavy market cap stocks rarely double their volume (3.0x) without major news. Smaller target gains produce higher win rates.
                  </p>
                </div>

                <div style={{ background: "#ffffff", padding: "12px 14px", borderRadius: "8px", border: "1px solid #d8b4fe" }}>
                  <strong style={{ fontSize: "12px", color: "#581c87" }}>2. High Beta Midcaps & PSU Stocks</strong>
                  <p style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", lineHeight: "1.4" }}>
                    • <strong>RVOL Range:</strong> 2.0x to 2.5x<br />
                    • <strong>Ideal Target:</strong> 15% to 22%<br />
                    • <strong>Why:</strong> High volatility allows multi-week +20% expansions once institutional accumulation begins.
                  </p>
                </div>

                <div style={{ background: "#ffffff", padding: "12px 14px", borderRadius: "8px", border: "1px solid #d8b4fe" }}>
                  <strong style={{ fontSize: "12px", color: "#581c87" }}>3. Proximity to 52-Week High</strong>
                  <p style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", lineHeight: "1.4" }}>
                    • <strong>Ideal Distance:</strong> Within 3% to 5%<br />
                    • <strong>Why:</strong> Stocks near 52W Highs have zero overhead trapped supply. Sellers from previous years are absent, allowing clean trend expansion.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Strategy Controls Form Card */}
        <div className="bt-stat-card pattern-finder-controls" style={{ padding: "24px", marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
            <Target size={20} className="text-indigo-600" />
            <h3 style={{ fontFamily: "var(--font-space-grotesk)", fontSize: "16px", fontWeight: "700", color: "#0f172a" }}>
              Customize Your Strategy Parameters
            </h3>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "20px" }}>
            <div>
              <label title="Select any Indian NSE stock from local database cache" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: "600", color: "#475569", marginBottom: "6px", cursor: "help" }}>
                <span>Select Stock Symbol</span>
                <HelpCircle size={13} className="text-slate-400" />
              </label>
              <SymbolCombobox value={symbol} onChange={setSymbol} />
              <span style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px", display: "block" }}>e.g., PNB, SBIN, RELIANCE, CANBK</span>
            </div>

            <div>
              <label title="The percentage profit target you want the stock to achieve after the volume breakout signal" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: "600", color: "#475569", marginBottom: "6px", cursor: "help" }}>
                <span>Target Profit Gain (%)</span>
                <HelpCircle size={13} className="text-slate-400" />
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
              <label title="Relative Volume: Entry day volume vs 20-day average. 2.0x means 200% of normal volume." style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: "600", color: "#475569", marginBottom: "6px", cursor: "help" }}>
                <span>Volume Surge Multiplier (RVOL)</span>
                <HelpCircle size={13} className="text-slate-400" />
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
              <label title="Proximity to 52-week high: only scan signals within X% of annual high peak" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: "600", color: "#475569", marginBottom: "6px", cursor: "help" }}>
                <span>52-Week High Distance (%)</span>
                <HelpCircle size={13} className="text-slate-400" />
              </label>
              <input
                type="number"
                step="0.5"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  fontWeight: "600",
                  outline: "none",
                }}
                value={dist52w}
                onChange={(e) => setDist52w(e.target.value)}
                placeholder="5.0"
              />
              <span style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px", display: "block" }}>Only scan signals near the 52-week high</span>
            </div>

            <div>
              <label title="Maximum number of trading days allowed to reach the target profit gain" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: "600", color: "#475569", marginBottom: "6px", cursor: "help" }}>
                <span>Holding Window (Trading Days)</span>
                <HelpCircle size={13} className="text-slate-400" />
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
            <div className="pattern-finder-results">
            <div className="pattern-finder-metrics" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", marginBottom: "24px" }}>
              
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
                <span title="Percentage of times the pattern successfully reached your target profit goal">Historical Hit Rate</span>
                <h3 style={{ fontFamily: "var(--font-space-grotesk)", fontSize: "28px", fontWeight: "700", color: "#059669", marginTop: "4px" }}>
                  {result.metrics.hit_rate_pct}%
                </h3>
                <p style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                  <strong>{result.metrics.true_positives}</strong> succeeded out of {result.metrics.total_triggers} setups
                </p>
              </div>

              <div className="bt-stat-card" style={{ borderLeft: "4px solid #4f46e5" }}>
                <span title="Setups that successfully reached your target profit within the holding window">SUCCESS (Target Met)</span>
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
                <span title="Setups that failed to reach your target profit within the holding window">FAILED (Target Missed)</span>
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

            <section className="bt-panel pattern-finder-visualization" aria-label="Historical breakout visualization" style={{ marginBottom: "24px" }}>
              <div className="bt-panel-head">
                <div><span className="bt-eyebrow">BREAKOUT VISUALIZATION</span><h2>{result.symbol} signal outcomes</h2><p>Each bar is one historical trigger. Height is the best return reached during the holding window; green met the target, red did not.</p></div>
                <span className="bt-panel-note">{filteredTrades.length} filtered signals</span>
              </div>
              <div className="pattern-finder-outcome-summary" aria-label="Outcome summary">
                <span><strong>{outcomeStats.hitRate.toFixed(1)}%</strong><small>filter hit rate</small></span>
                <span><strong>+{outcomeStats.best.toFixed(1)}%</strong><small>best peak move</small></span>
                <span><strong>{outcomeStats.medianFinal >= 0 ? "+" : ""}{outcomeStats.medianFinal.toFixed(1)}%</strong><small>median exit return</small></span>
                <span><strong>{outcomeStats.worst >= 0 ? "+" : ""}{outcomeStats.worst.toFixed(1)}%</strong><small>weakest peak move</small></span>
              </div>
              {filteredTrades.length ? <div className="pattern-finder-outcome-bars" role="img" aria-label="Bar chart of peak forward returns by historical trigger">
                {filteredTrades.slice(0, 80).map((trade, index) => {
                  const scale = Math.max(5, Math.abs(outcomeStats.best), Math.abs(outcomeStats.worst));
                  const height = Math.max(4, Math.min(100, Math.abs(trade.max_return_pct) / scale * 100));
                  return <div key={`${trade.entry_date}-${index}`} className="pattern-finder-outcome-bar-wrap" title={`${trade.entry_date}: peak ${trade.max_return_pct >= 0 ? "+" : ""}${trade.max_return_pct}% · final ${trade.final_return_pct >= 0 ? "+" : ""}${trade.final_return_pct}%`}><div className={`pattern-finder-outcome-bar ${trade.is_true_positive ? "is-success" : "is-failed"}`} style={{ height: `${height}%` }} /></div>;
                })}
              </div> : <div className="bt-chart-empty">No historical triggers match this filter.</div>}
              <div className="pattern-finder-chart-legend"><span><i className="is-success" /> Target met</span><span><i className="is-failed" /> Target missed</span><small>Hover a bar for trigger date, peak move, and final return.</small></div>
            </section>

            {/* Interactive Trade Signal & False Positive Log Table */}
            <div className="bt-stat-card pattern-finder-signal-log" style={{ padding: "24px" }}>
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
                    SUCCESS ({result.metrics.true_positives})
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
                    FAILED ({result.metrics.false_positives})
                  </button>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #f1f5f9", textAlign: "left", color: "#64748b", fontFamily: "var(--font-jetbrains)", fontSize: "11px", textTransform: "uppercase" }}>
                      <th title="Trading date when volume spike occurred" style={{ padding: "12px 10px" }}>Date</th>
                      <th title="Closing stock price on trigger day" style={{ padding: "12px 10px" }}>Stock Price</th>
                      <th title="Relative volume: Entry volume vs 20-day average volume" style={{ padding: "12px 10px" }}>Volume Surge (RVOL)</th>
                      <th title="Percentage gap to 52-week high peak" style={{ padding: "12px 10px" }}>52w High Dist %</th>
                      <th title="Highest percentage gain reached within holding window" style={{ padding: "12px 10px" }}>Peak Move</th>
                      <th title="Pattern test outcome: Success (Target Met) vs Failed (Target Missed)" style={{ padding: "12px 10px" }}>Signal Outcome</th>
                      <th title="Diagnostic explanation of why trade succeeded or failed" style={{ padding: "12px 10px" }}>Diagnostic Note</th>
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
                              <TrendingUp size={14} /> SUCCESS (Target Met)
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
                              <TrendingDown size={14} /> FAILED (Target Missed)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "12px 10px", color: t.failure_reason ? "#e11d48" : "#059669", fontSize: "12px", fontWeight: t.failure_reason ? "400" : "600" }}>
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
          </div>
        )}
      </main>
    </div>
  );
}
