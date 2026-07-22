"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Gauge, Pause, Play, SkipBack } from "lucide-react";

type Candle = { date: string; open: number; high: number; low: number; close: number };
type Signal = { date: string; type: "entry" | "exit"; price: number };
type Trade = { id?: string; trade_id?: number; entry_date?: string; exit_date?: string; entry_price?: number; exit_price?: number; pnl: number };
type TradePath = { trade_id: number; date: string; unrealized_pnl: number; realized_pnl: number };
type IndicatorSeries = Record<string, Array<{ date: string; value: number | null }>>;

const money = (value: number) => "₹" + Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const signedMoney = (value: number) => (value >= 0 ? "+" : "−") + money(value);
const dateOnly = (value?: string) => value?.slice(0, 10) ?? "";
const readableDate = (value?: string) => value ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value.slice(0, 10) + "T00:00:00")) : "—";
const isOnOrBefore = (value: string | undefined, target: string) => Boolean(value && dateOnly(value) <= target);
const isSameDate = (left: string | undefined, right: string) => dateOnly(left) === right;
const SPEEDS = [{ label: "0.5×", ms: 1200 }, { label: "1×", ms: 650 }, { label: "2×", ms: 320 }, { label: "5×", ms: 130 }];

function ReplayMetric({ label, value, tone = "neutral", detail }: { label: string; value: string; tone?: "neutral" | "positive" | "negative"; detail?: string }) {
  return <div className={"bt-replay-metric " + tone}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

function IndicatorMiniChart({ label, series, visibleDates, color }: { label: string; series: Array<{ date: string; value: number | null }>; visibleDates: string[]; color: string }) {
  const width = 960;
  const height = 92;
  const left = 42;
  const right = 12;
  const top = 12;
  const bottom = 18;
  const dateIndex = new Map(visibleDates.map((date, index) => [date, index]));
  const points = series.map((point) => ({ index: dateIndex.get(dateOnly(point.date)), value: point.value })).filter((point): point is { index: number; value: number } => typeof point.index === "number" && typeof point.value === "number");
  const values = points.map((point) => point.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const range = Math.max(max - min, 0.0001);
  const xFor = (index: number) => left + (index / Math.max(visibleDates.length - 1, 1)) * (width - left - right);
  const yFor = (value: number) => top + ((max - value) / range) * (height - top - bottom);
  const path = points.map((point, index) => (index === 0 ? "M" : "L") + xFor(point.index).toFixed(1) + " " + yFor(point.value).toFixed(1)).join(" ");
  const current = points.at(-1)?.value;
  return <div className="bt-replay-indicator"><div className="bt-replay-indicator-heading"><span><i style={{ background: color }} /> {label}</span><strong>{typeof current === "number" ? current.toFixed(2) : "—"}</strong></div><svg viewBox={"0 0 " + width + " " + height} role="img" aria-label={label + " indicator through the replay"}><line x1={left} x2={width - right} y1={height / 2} y2={height / 2} stroke="#e2e8f0" strokeDasharray="3 4" /><path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" /></svg></div>;
}

export default function StrategyReplay({
  candles,
  indicators = {},
  signals = [],
  trades = [],
  tradePath = [],
  initialCapital,
}: {
  candles: Candle[];
  indicators?: IndicatorSeries;
  signals?: Signal[];
  trades?: Trade[];
  tradePath?: TradePath[];
  initialCapital: number;
}) {
  const [visibleCount, setVisibleCount] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(650);
  const shown = candles.slice(0, Math.max(1, Math.min(visibleCount, candles.length)));
  const current = shown.at(-1);
  const currentDate = dateOnly(current?.date);
  const currentIndex = Math.max(0, shown.length - 1);
  const visibleDates = shown.map((candle) => dateOnly(candle.date));
  const priceIndicatorEntries = Object.entries(indicators).filter(([label]) => /sma|ema|bollinger|upper|lower|middle|band|vwap/i.test(label));
  const oscillatorEntries = Object.entries(indicators).filter(([label]) => !/sma|ema|bollinger|upper|lower|middle|band|vwap/i.test(label));
  const priceValues = shown.flatMap((candle) => [candle.high, candle.low]);
  const priceIndicatorValues = priceIndicatorEntries.flatMap(([, series]) => series.slice(0, visibleCount).map((point) => point.value).filter((value): value is number => typeof value === "number"));
  const chartValues = priceValues.concat(priceIndicatorValues);
  const min = chartValues.length ? Math.min(...chartValues) : 0;
  const max = chartValues.length ? Math.max(...chartValues) : 1;
  const range = Math.max(max - min, 1);
  const width = 960;
  const height = 360;
  const left = 72;
  const right = 20;
  const top = 20;
  const bottom = 40;
  const xFor = (index: number) => left + (index / Math.max(shown.length - 1, 1)) * (width - left - right);
  const yFor = (value: number) => top + ((max - value) / range) * (height - top - bottom);
  const dateIndex = new Map(shown.map((candle, index) => [dateOnly(candle.date), index]));
  const palette = ["#4f46e5", "#059669", "#d97706", "#db2777"];
  const priceLines = priceIndicatorEntries.map(([label, series], seriesIndex) => {
    const points = series.map((point) => ({ index: dateIndex.get(dateOnly(point.date)), value: point.value })).filter((point): point is { index: number; value: number } => typeof point.index === "number" && typeof point.value === "number");
    const path = points.map((point, index) => (index === 0 ? "M" : "L") + xFor(point.index).toFixed(1) + " " + yFor(point.value).toFixed(1)).join(" ");
    return { label, path, color: palette[seriesIndex % palette.length] };
  });
  const completedTrades = trades.filter((trade) => isOnOrBefore(trade.exit_date, currentDate));
  const openTrades = trades.filter((trade) => isOnOrBefore(trade.entry_date, currentDate) && !isOnOrBefore(trade.exit_date, currentDate));
  const entriesToday = signals.filter((signal) => signal.type === "entry" && isSameDate(signal.date, currentDate));
  const exitsToday = signals.filter((signal) => signal.type === "exit" && isSameDate(signal.date, currentDate));
  const attempts = signals.filter((signal) => signal.type === "entry" && isOnOrBefore(signal.date, currentDate)).length;
  const realizedToday = trades.filter((trade) => isSameDate(trade.exit_date, currentDate)).reduce((total, trade) => total + Number(trade.pnl || 0), 0);
  const realizedTotal = completedTrades.reduce((total, trade) => total + Number(trade.pnl || 0), 0);
  const pathByTrade = new Map<string, TradePath>();
  tradePath.filter((path) => isOnOrBefore(path.date, currentDate)).forEach((path) => pathByTrade.set(String(path.trade_id), path));
  const unrealizedPnl = openTrades.reduce((total, trade) => total + Number(pathByTrade.get(String(trade.trade_id ?? trade.id))?.unrealized_pnl ?? 0), 0);
  const dailyPnl = realizedToday + unrealizedPnl;
  const totalPnl = realizedTotal + unrealizedPnl;
  const currentEvent = entriesToday.length || exitsToday.length
    ? (entriesToday.length ? entriesToday.length + " entr" + (entriesToday.length > 1 ? "ies" : "y") : "") + (entriesToday.length && exitsToday.length ? " · " : "") + (exitsToday.length ? exitsToday.length + " exit" + (exitsToday.length > 1 ? "s" : "") : "") + " recorded today."
    : "No entry or exit was recorded on this day.";
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setVisibleCount((count) => {
      if (count >= candles.length) { setPlaying(false); return count; }
      return count + 1;
    }), speedMs);
    return () => window.clearInterval(timer);
  }, [playing, speedMs, candles.length]);
  const playNext = () => setVisibleCount((count) => {
    if (count >= candles.length) { setPlaying(false); return count; }
    return count + 1;
  });
  const priceLabels = [max, min + range / 2, min].map((value) => money(value));

  return <div className="bt-candle-chart bt-strategy-replay">
    <div className="bt-replay-heading"><div><span className="bt-eyebrow">DAY-BY-DAY EXECUTION</span><h3>Read the strategy as it happened</h3><p>Start at day 1, move one NSE candle at a time, and see exactly when the rules entered, exited, gained, or lost money.</p></div><div className="bt-replay-progress"><strong>Day {Math.min(visibleCount, candles.length)} of {candles.length}</strong><span>{readableDate(currentDate)}</span></div></div>
    <div className="bt-replay-current"><div><span>Current candle</span><strong>{readableDate(currentDate)}</strong><small>O {money(current?.open ?? 0)} · H {money(current?.high ?? 0)} · L {money(current?.low ?? 0)} · C {money(current?.close ?? 0)}</small></div><div className="bt-replay-event"><span>What happened</span><strong>{currentEvent}</strong><small>{entriesToday[0] ? "Entry price " + money(entriesToday[0].price) : exitsToday[0] ? "Exit price " + money(exitsToday[0].price) : "The strategy was waiting for a signal."}</small></div></div>
    <svg viewBox={"0 0 " + width + " " + height} role="img" aria-label="Readable historical candlestick chart with strategy entries and exits"><title>Day-by-day strategy replay</title><desc>Historical NSE candles with price-based indicators, entry and exit markers, and a visible current replay day.</desc>{[0, .5, 1].map((fraction) => <g key={fraction}><line x1={left} x2={width - right} y1={top + fraction * (height - top - bottom)} y2={top + fraction * (height - top - bottom)} stroke="#e2e8f0" strokeDasharray="3 4" /><text x={left - 9} y={top + fraction * (height - top - bottom) + 4} textAnchor="end" className="bt-result-svg-label">{priceLabels[fraction === 0 ? 0 : fraction === .5 ? 1 : 2]}</text></g>)}{shown.map((candle, index) => { const x = xFor(index); const candleWidth = Math.max(4, Math.min(12, (width - left - right) / Math.max(shown.length, 1) * .6)); const up = candle.close >= candle.open; return <g key={candle.date}><line x1={x} x2={x} y1={yFor(candle.high)} y2={yFor(candle.low)} stroke={up ? "#059669" : "#e11d48"} strokeWidth="1.5" /><rect x={x - candleWidth / 2} y={Math.min(yFor(candle.open), yFor(candle.close))} width={candleWidth} height={Math.max(2, Math.abs(yFor(candle.open) - yFor(candle.close)))} fill={up ? "#a7f3d0" : "#fecdd3"} stroke={up ? "#059669" : "#e11d48"} /></g>; })}{priceLines.map((line) => <path key={line.label} d={line.path} fill="none" stroke={line.color} strokeWidth="2" strokeLinecap="round" />)}{signals.filter((signal) => dateIndex.has(dateOnly(signal.date))).map((signal) => { const index = dateIndex.get(dateOnly(signal.date)) ?? 0; const x = xFor(index); const y = yFor(signal.price); return <g key={signal.type + "-" + signal.date + "-" + signal.price}><line x1={x} x2={x} y1={y - 14} y2={y + 14} stroke={signal.type === "entry" ? "#4f46e5" : "#e11d48"} strokeDasharray="2 2" /><circle cx={x} cy={y} r="5" fill={signal.type === "entry" ? "#4f46e5" : "#e11d48"} stroke="#fff" strokeWidth="2" /></g>; })}<line x1={xFor(currentIndex)} x2={xFor(currentIndex)} y1={top} y2={height - bottom} stroke="#0f172a" strokeDasharray="4 4" opacity=".55" /><text x={left} y={height - 11} className="bt-result-svg-label">{readableDate(shown[0]?.date)}</text><text x={width - right} y={height - 11} textAnchor="end" className="bt-result-svg-label">{readableDate(currentDate)}</text></svg>
    <div className="bt-replay-legend"><span><i className="entry" /> Entry</span><span><i className="exit" /> Exit</span>{priceLines.map((line) => <span key={line.label}><i style={{ background: line.color }} /> {line.label}</span>)}<span><i className="cursor" /> Current day</span></div>
    <div className="bt-replay-controls"><div className="bt-replay-buttons"><button type="button" className="bt-secondary small" onClick={() => { setVisibleCount(1); setPlaying(false); }}><SkipBack size={13} /> Day 1</button><button type="button" className="bt-secondary small" onClick={() => { setPlaying(false); setVisibleCount((count) => Math.max(1, count - 1)); }} disabled={visibleCount <= 1} aria-label="Previous replay day"><ChevronLeft size={14} /> Previous</button><button type="button" className="bt-primary small" onClick={() => { if (!playing && visibleCount >= candles.length) setVisibleCount(1); setPlaying((value) => !value); }}><>{playing ? <Pause size={13} /> : <Play size={13} />} {playing ? "Pause" : "Play"}</></button><button type="button" className="bt-secondary small" onClick={() => { setPlaying(false); playNext(); }} disabled={visibleCount >= candles.length} aria-label="Next replay day">Next <ChevronRight size={14} /></button></div><label className="bt-replay-speed"><Gauge size={13} /> Speed<select value={speedMs} onChange={(event) => setSpeedMs(Number(event.target.value))}>{SPEEDS.map((speed) => <option key={speed.ms} value={speed.ms}>{speed.label}</option>)}</select></label></div>
    <input className="bt-replay-slider" type="range" min={1} max={Math.max(1, candles.length)} value={Math.min(visibleCount, candles.length)} onChange={(event) => { setPlaying(false); setVisibleCount(Number(event.target.value)); }} aria-label="Choose replay day" /><div className="bt-replay-slider-labels"><span>Day 1 · {readableDate(candles[0]?.date)}</span><span>Day {candles.length} · {readableDate(candles.at(-1)?.date)}</span></div>
    <div className="bt-replay-metrics"><ReplayMetric label="Account value" value={money(initialCapital + totalPnl)} detail={"Started with " + money(initialCapital)} /><ReplayMetric label="Today’s change" value={signedMoney(dailyPnl)} tone={dailyPnl >= 0 ? "positive" : "negative"} detail="Realized + unrealized P&L" /><ReplayMetric label="Realized today" value={signedMoney(realizedToday)} tone={realizedToday >= 0 ? "positive" : "negative"} detail={"Total realized " + signedMoney(realizedTotal)} /><ReplayMetric label="Unrealized now" value={signedMoney(unrealizedPnl)} tone={unrealizedPnl >= 0 ? "positive" : "negative"} detail={openTrades.length + " open position" + (openTrades.length === 1 ? "" : "s")} /><ReplayMetric label="Trade attempts" value={String(attempts)} detail={completedTrades.length + " completed · " + openTrades.length + " open"} /><ReplayMetric label="Total P&L" value={signedMoney(totalPnl)} tone={totalPnl >= 0 ? "positive" : "negative"} detail="Realized + open-position P&L" /></div>
    <div className="bt-replay-activity"><div><span className="bt-eyebrow">EXECUTION JOURNAL</span><strong>{readableDate(currentDate)} · {currentEvent}</strong><p>{entriesToday.length ? "The strategy attempted " + entriesToday.length + " new position" + (entriesToday.length > 1 ? "s" : "") + " today." : exitsToday.length ? "The strategy closed " + exitsToday.length + " position" + (exitsToday.length > 1 ? "s" : "") + " today." : "No trade was taken on this candle; the account simply moved with any open position."}</p></div><div className="bt-replay-activity-stats"><span>Entries today <b>{entriesToday.length}</b></span><span>Exits today <b>{exitsToday.length}</b></span><span>Attempts so far <b>{attempts}</b></span><span>Closed trades <b>{completedTrades.length}</b></span></div></div>
    {oscillatorEntries.length > 0 && <div className="bt-replay-indicators"><div className="bt-replay-section-title"><strong>Indicator readings</strong><span>Separate scales keep RSI, MACD, and other oscillators readable.</span></div>{oscillatorEntries.map(([label, series], index) => <IndicatorMiniChart key={label} label={label} series={series} visibleDates={visibleDates} color={palette[(index + priceLines.length) % palette.length]} />)}</div>}
    {playing && <div className="bt-replay-autoplay" role="status"><Play size={12} fill="currentColor" /> Playing at {SPEEDS.find((speed) => speed.ms === speedMs)?.label ?? "1×"} · showing {readableDate(currentDate)}</div>}
  </div>;
}
