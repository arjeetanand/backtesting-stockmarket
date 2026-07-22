"use client";

import { useEffect, useState } from "react";
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Zap,
  Activity,
  Crosshair,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import {
  createReplaySession,
  stepReplaySession,
  placeReplayOrder,
  closeReplayOrder,
  finishReplaySession,
} from "@/lib/replay/api";
import type { ReplaySessionData, ReplayBar } from "@/lib/replay/types";
import { getMarketAvailability, type MarketAvailability } from "@/lib/market-data";
import { SymbolCombobox } from "@/components/data/SymbolCombobox";

const formatINR = (val: number) =>
  `₹${Math.round(val).toLocaleString("en-IN")}`;

export default function ReplayPage() {
  const [session, setSession] = useState<ReplaySessionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Playback controls
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);

  // Order Form State
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState<number>(1);
  const [stopLoss, setStopLoss] = useState<string>("");
  const [takeProfit, setTakeProfit] = useState<string>("");

  // Setup Form State
  const [symbol, setSymbol] = useState("RELIANCE");
  const [timeframe, setTimeframe] = useState("1day");
  const [start, setStart] = useState("2024-01-01");
  const [end, setEnd] = useState("2026-06-30");
  const [availability, setAvailability] = useState<MarketAvailability | null>(null);
  const mode = "manual";
  const initialCapital = 100000;

  useEffect(() => {
    const cleanSymbol = symbol.trim();
    if (!cleanSymbol) { setAvailability(null); return; }
    const timer = window.setTimeout(async () => {
      try {
        const next = await getMarketAvailability(cleanSymbol);
        setAvailability(next);
        if (next.earliest && next.latest) {
          setStart(next.earliest.slice(0, 10));
          setEnd(next.latest.slice(0, 10));
        }
      } catch (requestError) {
        setAvailability(null);
        setError(requestError instanceof Error ? requestError.message : "Could not read local data availability.");
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [symbol]);

  const handleInitSession = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await createReplaySession({
        symbol,
        timeframe,
        start: `${start}T00:00:00`,
        end: `${end}T23:59:59`,
        mode,
        initial_capital: initialCapital,
      });
      setSession(data);
    } catch (requestError) {
      setSession(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Historical data could not be loaded."
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!isPlaying || !session || session.status === "FINISHED") return;
    const intervalMs = Math.max(150, 1000 / speed);
    const timer = setInterval(async () => {
      try {
        const next = await stepReplaySession(session.session_id, 1);
        setSession(next);
        if (next.status === "FINISHED") setIsPlaying(false);
      } catch {
        setIsPlaying(false);
        setError("The replay connection was interrupted.");
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isPlaying, session, speed]);

  const handleStep = async () => {
    if (!session || session.status === "FINISHED") return;
    try {
      setSession(await stepReplaySession(session.session_id, 1));
    } catch {
      setError("Could not advance the replay.");
    }
  };

  const handlePlaceOrder = async () => {
    if (!session) return;
    const sl = stopLoss ? parseFloat(stopLoss) : undefined;
    const tp = takeProfit ? parseFloat(takeProfit) : undefined;
    try {
      setSession(
        await placeReplayOrder(session.session_id, {
          side,
          quantity,
          order_type: "market",
          stop_loss: sl,
          take_profit: tp,
        })
      );
    } catch {
      setError("Could not place the simulated order.");
    }
  };

  const handleCloseOrder = async (orderId: string) => {
    if (!session) return;
    try {
      setSession(await closeReplayOrder(session.session_id, orderId));
    } catch {
      setError("Could not close the simulated position.");
    }
  };

  const handleFinishSession = async () => {
    if (!session) return;
    try {
      setSession(await finishReplaySession(session.session_id));
      setIsPlaying(false);
    } catch {
      setIsPlaying(false);
      setError("Could not finish the replay session.");
    }
  };

  /* ── Setup Screen ─────────────────────────────────────── */
  if (!session) {
    return (
      <div className="backtrack-page">
        <TopBar />
        <div className="backtrack-content bt-replay-setup">
          <div className="bt-panel bt-replay-setup-card" style={{ padding: "32px" }}>
            <span className="bt-eyebrow">Free Historical Replay</span>
            <h1>Choose your backtest period.</h1>
            <p>
              Uses locally imported official NSE historical candles. Orders are
              simulated only — never sent to a broker.
            </p>

            {error && <div className="bt-alert-error" style={{ marginTop: "16px" }}>{error}</div>}

            <div className="bt-grid-2" style={{ marginTop: "24px" }}>
              <div>
                <label className="bt-field-label">Symbol</label>
                <SymbolCombobox value={symbol} onChange={setSymbol} />
              </div>
              <div>
                <label className="bt-field-label">Timeframe</label>
                <input className="bt-field-input" value="1 day (official NSE cache)" disabled aria-label="Timeframe" />
              </div>
              <div>
                <label className="bt-field-label">Start date</label>
                <input
                  type="date"
                  className="bt-field-input bt-field-mono"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div>
                <label className="bt-field-label">End date</label>
                <input
                  type="date"
                  className="bt-field-input bt-field-mono"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>

            <p style={{ marginTop: "10px", color: "#64748b", fontSize: "11px", fontFamily: "var(--font-jetbrains)" }}>
              {availability?.bars
                ? `${availability.symbol}: ${availability.bars.toLocaleString("en-IN")} daily bars · ${availability.earliest?.slice(0, 10)} to ${availability.latest?.slice(0, 10)} · latest close ₹${availability.latest_close?.toLocaleString("en-IN")}`
                : "Enter an imported NSE symbol. Only daily historical data currently exists in the free local cache."}
            </p>

            <button
              className="bt-primary"
              style={{ width: "100%", marginTop: "20px", padding: "11px 16px", fontSize: "14px" }}
              onClick={handleInitSession}
              disabled={loading || !availability?.bars}
            >
              {loading ? (
                <>
                  <Activity size={15} className="spin" /> Loading historical candles…
                </>
              ) : (
                <>
                  <Play size={15} fill="currentColor" /> Start free replay
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentBar = session.current_bar;
  const revealedBars = session.revealed_bars;
  const openOrders = session.orders.filter((o) => o.status === "FILLED");
  const isFinished = session.status === "FINISHED";

  /* ── Replay Workspace ─────────────────────────────────── */
  return (
    <div className="backtrack-page">
      <TopBar />

      <div className="backtrack-content bt-stack">
        {/* Page Header */}
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker">
              <span className="live-dot" /> 01 / MARKET REPLAY WORKSPACE
            </div>
            <h1>Bar-by-bar historical replay.</h1>
            <p>
              Step through free historical candles without lookahead bias. All
              orders are simulated locally.
            </p>
          </div>
          <div className="bt-heading-actions">
            <span className="data-source">
              <Zap size={14} /> Anti-Hindsight Server Cursor
            </span>
            <button className="bt-secondary" onClick={handleInitSession}>
              <RotateCcw size={13} /> Reset Session
            </button>
          </div>
        </section>

        {error && <div className="bt-alert-error">{error}</div>}

        {/* Toolbar */}
        <div className="bt-panel bt-replay-toolbar">
          <div className="bt-replay-toolbar-left">
            <button
              className={isPlaying ? "bt-primary" : "bt-primary"}
              style={isPlaying ? { background: "#e11d48", borderColor: "#e11d48" } : {}}
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={isFinished}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              <span>{isPlaying ? "Pause" : "Play"}</span>
            </button>

            <button
              className="bt-secondary"
              onClick={handleStep}
              disabled={isPlaying || isFinished}
            >
              <SkipForward size={14} />
              <span>Step +1 Bar</span>
            </button>

            <div className="bt-replay-divider" />

            {/* Speed tabs */}
            <div className="bt-toolbar" style={{ border: 0, minHeight: 0, padding: 0 }}>
              {[0.5, 1, 2, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`bt-tab${speed === s ? " active" : ""}`}
                >
                  {s}x
                </button>
              ))}
            </div>

            <div className="bt-replay-divider" />

            <div className="bt-replay-cursor">
              <span>CURSOR:</span>
              <strong>
                {session.cursor_index + 1} / {session.total_bars}
              </strong>
              <small>({currentBar.date})</small>
            </div>
          </div>

          <div className="bt-replay-toolbar-right">
            <span className={`bt-replay-status${isFinished ? " finished" : ""}`}>
              ● {session.status}
            </span>
            {!isFinished && (
              <button
                className="bt-primary"
                style={{ background: "#e11d48", borderColor: "#e11d48" }}
                onClick={handleFinishSession}
              >
                Finish Session
              </button>
            )}
          </div>
        </div>

        {/* KPI Row */}
        <div className="bt-kpi-grid">
          <div className="bt-stat-card blue">
            <span>Equity</span>
            <strong>{formatINR(session.equity)}</strong>
            <small>Initial: {formatINR(session.initial_capital)}</small>
            <Activity size={20} />
          </div>
          <div className={`bt-stat-card ${session.realized_pnl >= 0 ? "mint" : "rose"}`}>
            <span>Realized P&amp;L</span>
            <strong>{formatINR(session.realized_pnl)}</strong>
            <small>{session.trade_count} Closed Trades</small>
            <TrendingUp size={20} />
          </div>
          <div className={`bt-stat-card ${session.unrealized_pnl >= 0 ? "mint" : "rose"}`}>
            <span>Unrealized P&amp;L</span>
            <strong>{formatINR(session.unrealized_pnl)}</strong>
            <small>{openOrders.length} Open Positions</small>
            <TrendingUp size={20} />
          </div>
          <div className="bt-stat-card violet">
            <span>Win Rate</span>
            <strong>{session.win_rate}%</strong>
            <small>Target &gt; 55%</small>
            <ShieldCheck size={20} />
          </div>
          <div className="bt-stat-card blue">
            <span>Cash Available</span>
            <strong>{formatINR(session.cash)}</strong>
            <small>Margin Free</small>
            <Zap size={20} />
          </div>
        </div>

        {/* Main Workspace */}
        <div className="bt-grid-12">
          {/* Chart + Journal */}
          <div className="bt-col-8 bt-stack">
            {/* Chart Panel */}
            <div className="bt-panel" style={{ padding: "20px" }}>
              <div className="bt-panel-head" style={{ marginBottom: "14px" }}>
                <div className="bt-row">
                  <h2>{session.symbol}</h2>
                  <span className="bt-symbol-badge">
                    {session.timeframe} · NSE
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-mono mt-1">Bar timestamp: {currentBar.date} · Replay timeframe: {session.timeframe}</p>
                <div className="bt-ohlc-row">
                  <span className="bt-ohlc-open">O <b>₹{currentBar.open}</b></span>
                  <span className="bt-ohlc-high">H <b>₹{currentBar.high}</b></span>
                  <span className="bt-ohlc-low">L <b>₹{currentBar.low}</b></span>
                  <span className="bt-ohlc-close">C <b>₹{currentBar.close}</b></span>
                </div>
              </div>

              <div className="bt-replay-chart-wrap">
                <ReplayCandleChart bars={revealedBars} />
              </div>
            </div>

            {/* Execution Journal */}
            <div className="bt-panel" style={{ padding: "20px" }}>
              <div className="bt-panel-head" style={{ marginBottom: "14px" }}>
                <div>
                  <span className="bt-eyebrow">Execution Journal</span>
                  <h2>Session logs</h2>
                </div>
              </div>
              <div className="bt-journal-scroll">
                {session.events.length === 0 ? (
                  <p style={{ color: "#94a3b8", fontSize: "12px", fontFamily: "var(--font-jetbrains)" }}>
                    No events yet. Step or play to record activity.
                  </p>
                ) : (
                  session.events
                    .slice()
                    .reverse()
                    .map((evt) => (
                      <div key={evt.event_id} className="bt-event-row">
                        <span className="bt-event-ts">{evt.timestamp}</span>
                        <span className="bt-event-type">{evt.event_type}</span>
                        <span className="bt-event-desc">{evt.description}</span>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="bt-col-4 bt-stack">
            {/* Order Ticket */}
            <div className="bt-panel bt-order-ticket" style={{ padding: "20px" }}>
              <div className="bt-panel-head" style={{ marginBottom: "14px" }}>
                <div>
                  <span className="bt-eyebrow">Order Ticket</span>
                  <h2>Market order</h2>
                </div>
              </div>

              {/* Buy / Sell Toggle */}
              <div className="bt-side-toggle">
                <button
                  className={`bt-side-btn buy${side === "buy" ? " active" : ""}`}
                  onClick={() => setSide("buy")}
                >
                  <TrendingUp size={13} /> Buy / Long
                </button>
                <button
                  className={`bt-side-btn sell${side === "sell" ? " active" : ""}`}
                  onClick={() => setSide("sell")}
                >
                  <TrendingDown size={13} /> Sell / Short
                </button>
              </div>

              {/* Fields */}
              <div className="bt-stack-sm" style={{ marginBottom: "16px" }}>
                <div>
                  <label className="bt-field-label">Quantity (Lots / Units)</label>
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) =>
                      setQuantity(Math.max(1, parseInt(e.target.value) || 1))
                    }
                    className="bt-field-input bt-field-mono"
                  />
                </div>
                <div className="bt-grid-2">
                  <div>
                    <label className="bt-field-label">Stop Loss (₹)</label>
                    <input
                      type="number"
                      placeholder="Optional"
                      value={stopLoss}
                      onChange={(e) => setStopLoss(e.target.value)}
                      className="bt-field-input bt-field-mono"
                    />
                  </div>
                  <div>
                    <label className="bt-field-label">Take Profit (₹)</label>
                    <input
                      type="number"
                      placeholder="Optional"
                      value={takeProfit}
                      onChange={(e) => setTakeProfit(e.target.value)}
                      className="bt-field-input bt-field-mono"
                    />
                  </div>
                </div>
              </div>

              <button
                className={side === "buy" ? "bt-primary" : "bt-primary"}
                style={{
                  width: "100%",
                  background: side === "buy" ? "#059669" : "#e11d48",
                  borderColor: side === "buy" ? "#059669" : "#e11d48",
                  padding: "10px 16px",
                }}
                onClick={handlePlaceOrder}
                disabled={isFinished}
              >
                Place {side.toUpperCase()} @ ₹{currentBar.close}
              </button>
            </div>

            {/* Position Blotter */}
            <div className="bt-panel" style={{ padding: "20px" }}>
              <div className="bt-panel-head" style={{ marginBottom: "14px" }}>
                <div>
                  <span className="bt-eyebrow">Positions</span>
                  <h2>Open ({openOrders.length})</h2>
                </div>
              </div>

              {openOrders.length === 0 ? (
                <div className="bt-blotter-empty">
                  No active open positions.
                </div>
              ) : (
                <div className="bt-stack-sm">
                  {openOrders.map((ord) => {
                    const diff =
                      currentBar.close - (ord.fill_price || currentBar.close);
                    const pnl =
                      ord.side === "buy"
                        ? diff * ord.quantity
                        : -diff * ord.quantity;
                    return (
                      <div key={ord.order_id} className="bt-position-row">
                        <div className="bt-position-meta">
                          <span
                            style={{
                              color: ord.side === "buy" ? "#059669" : "#e11d48",
                              textTransform: "uppercase",
                            }}
                          >
                            {ord.side} {ord.quantity}x @ ₹{ord.fill_price}
                          </span>
                          <span
                            style={{ color: pnl >= 0 ? "#059669" : "#e11d48" }}
                          >
                            {formatINR(pnl)}
                          </span>
                        </div>
                        <button
                          className="bt-secondary"
                          style={{ width: "100%", fontSize: "11px" }}
                          onClick={() => handleCloseOrder(ord.order_id)}
                        >
                          Close @ Market
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Candlestick Chart ───────────────────────────────────── */
function ReplayCandleChart({ bars }: { bars: ReplayBar[] }) {
  const [zoom, setZoom] = useState(1);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  if (!bars || bars.length === 0) return null;
  const height = 310;
  const leftPadding = 18;
  const rightPadding = 64;
  const topPadding = 16;
  const bottomPadding = 42;
  const candleWidth = 7 * zoom;
  const candleGap = 4 * zoom;
  const width = Math.max(820, leftPadding + rightPadding + bars.length * (candleWidth + candleGap));
  const minPrice = Math.min(...bars.map((b) => b.low)) * 0.998;
  const maxPrice = Math.max(...bars.map((b) => b.high)) * 1.002;
  const priceRange = Math.max(maxPrice - minPrice, 1);
  const plotHeight = height - topPadding - bottomPadding;
  const tickIndexes = bars.reduce<number[]>((ticks, bar, index) => {
    const current = new Date(bar.date);
    const previous = index > 0 ? new Date(bars[index - 1].date) : null;
    const monthChanged = !previous || current.getMonth() !== previous.getMonth() || current.getFullYear() !== previous.getFullYear();
    const lastTick = ticks.at(-1) ?? -99;
    if ((index === 0 || index === bars.length - 1 || monthChanged) && index - lastTick >= 6) ticks.push(index);
    return ticks;
  }, []);
  const xFor = (index: number) => leftPadding + index * (candleWidth + candleGap) + candleWidth / 2;
  const yFor = (price: number) => topPadding + ((maxPrice - price) / priceRange) * plotHeight;
  const hovered = hoveredIndex === null ? null : bars[hoveredIndex];

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * width;
    setHoveredIndex(Math.max(0, Math.min(bars.length - 1, Math.round((svgX - leftPadding - candleWidth / 2) / (candleWidth + candleGap)))));
  };

  return (
    <div className="bt-replay-chart-shell">
      <div className="bt-replay-chart-tools">
        <span><Crosshair size={13} /> Crosshair · hover any candle for OHLC</span>
        <div><button type="button" onClick={() => setZoom((value) => Math.max(0.65, value - 0.2))} aria-label="Zoom out"><ZoomOut size={13} /></button><button type="button" onClick={() => setZoom((value) => Math.min(2.6, value + 0.2))} aria-label="Zoom in"><ZoomIn size={13} /></button><button type="button" onClick={() => setZoom(1)}>Reset</button></div>
      </div>
      <div className="bt-replay-chart-scroll" aria-label="Historical candlestick chart. Scroll horizontally to inspect earlier dates.">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="bt-replay-candle-svg" onPointerMove={handlePointerMove} onPointerLeave={() => setHoveredIndex(null)}>
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const y = topPadding + plotHeight * pct;
        const val = maxPrice - priceRange * pct;
        return (
          <g key={pct}>
            <line
              x1={leftPadding}
              y1={y}
              x2={width - rightPadding}
              y2={y}
              stroke="#e2e8f0"
              strokeDasharray="3 3"
            />
            <text
              x={width - rightPadding + 6}
              y={y + 3}
              fill="#94a3b8"
              fontSize={9}
              fontFamily="JetBrains Mono"
            >
              ₹{Math.round(val)}
            </text>
          </g>
        );
      })}
      {bars.map((bar, idx) => {
        const x = xFor(idx);
        const yOpen = yFor(bar.open);
        const yClose = yFor(bar.close);
        const yHigh = yFor(bar.high);
        const yLow = yFor(bar.low);
        const isBullish = bar.close >= bar.open;
        const color = isBullish ? "#059669" : "#e11d48";
        const topY = Math.min(yOpen, yClose);
        const candleH = Math.max(2, Math.abs(yClose - yOpen));
        return (
          <g key={idx}>
            <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth={1} />
            <rect
              x={x - candleWidth / 2}
              y={topY}
              width={candleWidth}
              height={candleH}
              fill={color}
              rx={1}
            />
          </g>
        );
      })}
      {hovered && hoveredIndex !== null && <g className="bt-replay-crosshair"><line x1={xFor(hoveredIndex)} y1={topPadding} x2={xFor(hoveredIndex)} y2={height - bottomPadding} /><circle cx={xFor(hoveredIndex)} cy={yFor(hovered.close)} r="4" /><g transform={`translate(${Math.min(xFor(hoveredIndex) + 12, width - rightPadding - 132)}, ${topPadding + 10})`}><rect width="124" height="88" rx="5" /><text x="8" y="17">{new Date(hovered.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</text><text x="8" y="36">O ₹{hovered.open}</text><text x="8" y="51">H ₹{hovered.high}</text><text x="8" y="66">L ₹{hovered.low}</text><text x="8" y="81">C ₹{hovered.close}</text></g></g>}
      {tickIndexes.map((index) => {
        const date = new Date(bars[index].date);
        return <g key={`date-${index}`}>
          <line x1={xFor(index)} y1={height - bottomPadding} x2={xFor(index)} y2={height - bottomPadding + 4} stroke="#94a3b8" />
          <text x={xFor(index)} y={height - 14} textAnchor="middle" fill="#64748b" fontSize={10} fontFamily="JetBrains Mono">
            {date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}
          </text>
        </g>;
      })}
      <line x1={leftPadding} y1={height - bottomPadding} x2={width - rightPadding} y2={height - bottomPadding} stroke="#cbd5e1" />
      </svg>
    </div>
    </div>
  );
}
