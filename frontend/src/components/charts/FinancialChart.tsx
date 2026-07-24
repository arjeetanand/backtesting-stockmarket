"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BarChart3, Loader2, Maximize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import {
  CandlestickSeries,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type CandlestickData,
  type IChartApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import {
  adaptFinancialChartData,
  chartTimestampKey,
  type ChartCandle,
  type ChartIndicator,
  type ChartTradeMarker,
  type FinancialTrade,
  type IndicatorSeries,
  type NormalizedCandle,
  type TradeMarker,
} from "@/lib/chart-data";

const INDICATOR_COLORS = ["#4f46e5", "#0ea5e9", "#d97706", "#db2777", "#7c3aed", "#0891b2"];
const visuallyHidden: CSSProperties = {
  border: 0,
  clip: "rect(0 0 0 0)",
  height: 1,
  margin: -1,
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  whiteSpace: "nowrap",
  width: 1,
};

export interface FinancialChartProps {
  candles: ReadonlyArray<NormalizedCandle>;
  indicators?: ReadonlyArray<IndicatorSeries>;
  tradeMarkers?: ReadonlyArray<TradeMarker>;
  trades?: ReadonlyArray<FinancialTrade>;
  selectedTradeId?: string | null;
  onTradeSelect?: (tradeId: string | null) => void;
  loading?: boolean;
  empty?: boolean;
  error?: string | Error | null;
  emptyMessage?: string;
  title?: string;
  description?: string;
  height?: number;
  initialVisibleCandles?: number;
  showVolume?: boolean;
  className?: string;
}

type ChartTime = { time: Time; key: string };
type HoveredCandle = ChartCandle | null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lineWidth(value: number | undefined): 1 | 2 | 3 | 4 {
  return clamp(Math.round(value ?? 2), 1, 4) as 1 | 2 | 3 | 4;
}

function toChartTime(timestamp: string | number): ChartTime | null {
  const key = chartTimestampKey(timestamp);
  if (!key) return null;
  if (typeof timestamp === "number") return { time: timestamp as Time, key };
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return { time: parsed.toISOString().slice(0, 10), key };
}

function timeKey(time: Time | undefined): string {
  if (time === undefined) return "";
  if (typeof time === "number" || typeof time === "string") return chartTimestampKey(time);
  const month = String(time.month).padStart(2, "0");
  const day = String(time.day).padStart(2, "0");
  return `${time.year}-${month}-${day}T00:00:00.000Z`;
}

function formatPrice(value: number): string {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatVolume(value: number | null): string {
  if (value === null) return "Unavailable";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString("en-IN");
}

function formatTimestamp(timestamp: string | number): string {
  const date = typeof timestamp === "number"
    ? new Date(timestamp < 1_000_000_000_000 ? timestamp * 1_000 : timestamp)
    : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return String(timestamp);
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "2-digit" }).format(date);
}

function ChartStatus({ kind, message }: { kind: "loading" | "empty" | "error"; message: string }) {
  const isError = kind === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live="polite"
      style={{ minHeight: 280, display: "grid", placeItems: "center", padding: 28, color: isError ? "#be123c" : "#64748b", textAlign: "center" }}
    >
      <div style={{ display: "grid", justifyItems: "center", gap: 8, maxWidth: 420 }}>
        {kind === "loading" && <Loader2 size={22} aria-hidden="true" className="spin" />}
        {kind === "error" && <BarChart3 size={22} aria-hidden="true" />}
        <strong>{kind === "loading" ? "Loading chart data…" : kind === "error" ? "Chart data could not be displayed" : "No chart data"}</strong>
        <span style={{ fontSize: 12, lineHeight: 1.5 }}>{message}</span>
      </div>
    </div>
  );
}

function groupIndicatorPanes(indicators: ReadonlyArray<ChartIndicator>): Array<{ id: string; label: string; indicators: ChartIndicator[] }> {
  const groups = new Map<string, { id: string; label: string; indicators: ChartIndicator[] }>();
  indicators.filter((indicator) => indicator.placement === "pane").forEach((indicator) => {
    const id = indicator.paneId?.trim() || indicator.id;
    const current = groups.get(id) ?? { id, label: indicator.paneLabel?.trim() || indicator.label, indicators: [] };
    current.indicators.push(indicator);
    groups.set(id, current);
  });
  return Array.from(groups.values());
}

function markerSelectionId(marker: ChartTradeMarker): string {
  return marker.tradeId ?? marker.id;
}

/** Render normalized OHLCV data through Lightweight Charts; parents own fetching and API state. */
export function FinancialChart({
  candles,
  indicators = [],
  tradeMarkers = [],
  trades = [],
  selectedTradeId,
  onTradeSelect,
  loading = false,
  empty = false,
  error = null,
  emptyMessage = "Provide historical candles for the selected range to inspect price action.",
  title = "Financial chart",
  description = "Historical OHLCV candles with optional indicators and simulated trade markers.",
  height = 300,
  initialVisibleCandles,
  showVolume = true,
  className,
}: FinancialChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const data = useMemo(() => adaptFinancialChartData({ candles, indicators, tradeMarkers, trades }), [candles, indicators, tradeMarkers, trades]);
  const defaultVisibleCandles = Math.max(1, Math.min(data.candles.length || 1, initialVisibleCandles ?? 90));
  const [visibleCount, setVisibleCount] = useState(defaultVisibleCandles);
  const [hoveredCandle, setHoveredCandle] = useState<HoveredCandle>(null);
  const [internalSelectedTradeId, setInternalSelectedTradeId] = useState<string | null>(null);
  const safeVisibleCount = clamp(visibleCount, 1, Math.max(1, data.candles.length));
  const requestedSelectedTradeId = selectedTradeId === undefined ? internalSelectedTradeId : selectedTradeId;
  const effectiveSelectedTradeId = requestedSelectedTradeId && (
    data.trades.some((trade) => trade.id === requestedSelectedTradeId) ||
    data.tradeMarkers.some((marker) => markerSelectionId(marker) === requestedSelectedTradeId)
  ) ? requestedSelectedTradeId : null;
  const visibleCandles = useMemo(
    () => data.candles.slice(Math.max(0, data.candles.length - safeVisibleCount)),
    [data.candles, safeVisibleCount],
  );
  const selectedTrade = effectiveSelectedTradeId ? data.trades.find((trade) => trade.id === effectiveSelectedTradeId) ?? null : null;
  const errorMessage = error instanceof Error ? error.message : error;
  const showEmpty = empty || data.candles.length === 0;
  const minVisible = Math.min(12, data.candles.length || 1);
  const chartHeight = Math.max(height, 280) + (showVolume ? 84 : 0) + groupIndicatorPanes(data.indicators).length * 128;
  const chartClassName = ["bt-interactive-chart", className].filter(Boolean).join(" ");

  const setSelectedTrade = useCallback((tradeId: string | null) => {
    if (selectedTradeId === undefined) setInternalSelectedTradeId(tradeId);
    onTradeSelect?.(tradeId);
  }, [onTradeSelect, selectedTradeId]);

  const zoom = (direction: "in" | "out") => {
    setVisibleCount((current) => {
      const next = direction === "in" ? Math.round(current * 0.72) : Math.round(current * 1.38);
      return clamp(next, minVisible, Math.max(minVisible, data.candles.length));
    });
  };

  useEffect(() => {
    if (!chartContainerRef.current || loading || errorMessage || showEmpty) return;
    const container = chartContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: chartHeight,
      layout: { background: { color: "#ffffff" }, textColor: "#475569", fontFamily: "Inter, system-ui, sans-serif", attributionLogo: false },
      grid: { vertLines: { color: "#f1f5f9" }, horzLines: { color: "#e2e8f0" } },
      crosshair: { mode: CrosshairMode.MagnetOHLC },
      rightPriceScale: { borderColor: "#cbd5e1" },
      timeScale: { borderColor: "#cbd5e1", timeVisible: false, secondsVisible: false, rightOffset: 6 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });
    chartRef.current = chart;

    const visibleKeys = new Set(visibleCandles.map((candle) => candle.timestampKey));
    const chartCandleTimes = visibleCandles.flatMap((candle) => {
      const converted = toChartTime(candle.timestamp);
      return converted ? [{ candle, ...converted }] : [];
    });
    const priceSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#059669",
      downColor: "#e11d48",
      borderUpColor: "#059669",
      borderDownColor: "#e11d48",
      wickUpColor: "#059669",
      wickDownColor: "#e11d48",
      priceLineVisible: false,
    });
    const candleData: CandlestickData<Time>[] = chartCandleTimes.map(({ candle, time }) => ({ time, open: candle.open, high: candle.high, low: candle.low, close: candle.close }));
    priceSeries.setData(candleData);

    if (showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
        priceLineVisible: false,
        lastValueVisible: false,
      }, 1);
      volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0 } });
      volumeSeries.setData(chartCandleTimes.map(({ candle, time }) => ({
        time,
        value: candle.volume ?? 0,
        color: candle.isBullish ? "#a7f3d0" : "#fecdd3",
      })));
    }

    data.indicators.filter((indicator) => indicator.placement === "overlay").forEach((indicator, index) => {
      const series = chart.addSeries(LineSeries, {
        color: indicator.color ?? INDICATOR_COLORS[index % INDICATOR_COLORS.length],
        lineWidth: lineWidth(indicator.lineWidth),
        lineStyle: indicator.lineStyle === "dashed" ? LineStyle.Dashed : LineStyle.Solid,
        title: indicator.label,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData(indicator.values.flatMap((point) => {
        if (!visibleKeys.has(point.timestampKey)) return [];
        const converted = toChartTime(point.timestamp);
        return converted ? [{ time: converted.time, value: point.value }] : [];
      }));
    });

    let paneIndex = showVolume ? 2 : 1;
    for (const pane of groupIndicatorPanes(data.indicators)) {
      const paneSeries = pane.indicators.map((indicator, index) => {
        const series = chart.addSeries(LineSeries, {
          color: indicator.color ?? INDICATOR_COLORS[index % INDICATOR_COLORS.length],
          lineWidth: lineWidth(indicator.lineWidth),
          lineStyle: indicator.lineStyle === "dashed" ? LineStyle.Dashed : LineStyle.Solid,
          title: indicator.label,
          priceLineVisible: false,
          lastValueVisible: false,
        }, paneIndex);
        series.setData(indicator.values.flatMap((point) => {
          if (!visibleKeys.has(point.timestampKey)) return [];
          const converted = toChartTime(point.timestamp);
          return converted ? [{ time: converted.time, value: point.value }] : [];
        }));
        indicator.referenceLines.forEach((reference) => {
          series.createPriceLine({
            price: reference.value,
            color: reference.color ?? "#94a3b8",
            lineWidth: 1,
            lineStyle: reference.dash ? LineStyle.Dashed : LineStyle.Solid,
            axisLabelVisible: Boolean(reference.label),
            title: reference.label ?? "",
          });
        });
        return series;
      });
      if (paneSeries.length) chart.panes()[paneIndex]?.setHeight(118);
      paneIndex += 1;
    }

    const markerMetadata = data.tradeMarkers.flatMap((marker, index) => {
      if (!visibleKeys.has(marker.timestampKey)) return [];
      const converted = toChartTime(marker.timestamp);
      if (!converted) return [];
      const id = marker.id || `marker-${index}`;
      return [{ id, selectionId: markerSelectionId(marker), key: marker.timestampKey, marker, time: converted.time }];
    });
    const markerPlugin = createSeriesMarkers(priceSeries, markerMetadata.map(({ id, marker, time }) => ({
      id,
      time,
      position: marker.kind === "entry" ? "belowBar" : "aboveBar",
      shape: marker.kind === "entry" ? "arrowUp" : marker.kind === "exit" ? "arrowDown" : "circle",
      color: marker.kind === "entry" ? "#059669" : marker.kind === "exit" ? "#e11d48" : "#4f46e5",
      text: marker.kind === "signal" ? "S" : marker.kind === "entry" ? "E" : "X",
      size: effectiveSelectedTradeId && markerSelectionId(marker) === effectiveSelectedTradeId ? 2 : 1,
    } satisfies SeriesMarker<Time>)));

    if (selectedTrade?.exit) {
      const entryTime = toChartTime(selectedTrade.entry.timestamp);
      const exitTime = toChartTime(selectedTrade.exit.timestamp);
      if (entryTime && exitTime && visibleKeys.has(chartTimestampKey(selectedTrade.entry.timestamp)) && visibleKeys.has(chartTimestampKey(selectedTrade.exit.timestamp))) {
        const tradeSeries = chart.addSeries(LineSeries, { color: "#4f46e5", lineWidth: 2, lineStyle: LineStyle.Dashed, crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false });
        tradeSeries.setData([{ time: entryTime.time, value: selectedTrade.entry.price }, { time: exitTime.time, value: selectedTrade.exit.price }]);
      }
    }

    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
      const key = timeKey(param.time);
      setHoveredCandle(key ? visibleCandles.find((candle) => candle.timestampKey === key) ?? null : null);
    };
    const handleClick = (param: MouseEventParams<Time>) => {
      const hoveredId = typeof param.hoveredObjectId === "string" ? param.hoveredObjectId : "";
      const marker = markerMetadata.find((item) => item.id === hoveredId) ?? markerMetadata.find((item) => item.key === timeKey(param.time));
      if (!marker) return;
      setSelectedTrade(effectiveSelectedTradeId === marker.selectionId ? null : marker.selectionId);
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);
    chart.subscribeClick(handleClick);
    chart.timeScale().fitContent();
    chart.panes()[0]?.setHeight(Math.max(220, height));

    const resizeObserver = new ResizeObserver(() => {
      if (container.clientWidth) chart.resize(container.clientWidth, chartHeight);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.unsubscribeClick(handleClick);
      markerPlugin.detach();
      chart.remove();
      chartRef.current = null;
    };
  }, [chartHeight, data, effectiveSelectedTradeId, errorMessage, height, loading, selectedTrade?.entry.price, selectedTrade?.entry.timestamp, selectedTrade?.exit, setSelectedTrade, showEmpty, showVolume, visibleCandles]);

  const reset = () => setVisibleCount(defaultVisibleCandles);
  const fit = () => setVisibleCount(Math.max(1, data.candles.length));
  const chartNavigator = !loading && !errorMessage && !showEmpty
    ? `${visibleCandles.length} of ${data.candles.length} candles · ${effectiveSelectedTradeId ? `Selected trade ${effectiveSelectedTradeId}` : "Click a trade marker to highlight it"}`
    : null;

  return (
    <div className={chartClassName} style={{ position: "relative" }}>
      <div className="bt-chart-toolbar" style={{ flexWrap: "wrap" }}>
        <div>
          <BarChart3 size={14} aria-hidden="true" />
          <span>{title}</span>
          <small>{description}</small>
        </div>
        <div className="bt-chart-controls" aria-label="Financial chart range controls">
          <button type="button" onClick={fit} disabled={showEmpty || loading} className={safeVisibleCount === data.candles.length ? "is-active" : ""}>Fit</button>
          <button type="button" onClick={() => zoom("out")} disabled={showEmpty || loading || safeVisibleCount >= data.candles.length} aria-label="Zoom out"><ZoomOut size={14} /></button>
          <button type="button" onClick={() => zoom("in")} disabled={showEmpty || loading || safeVisibleCount <= minVisible} aria-label="Zoom in"><ZoomIn size={14} /></button>
          <button type="button" onClick={reset} disabled={showEmpty || loading} aria-label="Reset chart range"><RotateCcw size={14} /></button>
          <button type="button" onClick={fit} disabled={showEmpty || loading} aria-label="Fit all candles"><Maximize2 size={14} /></button>
        </div>
      </div>
      {loading
        ? <ChartStatus kind="loading" message="Historical candles and chart overlays are being prepared." />
        : errorMessage
          ? <ChartStatus kind="error" message={errorMessage} />
          : showEmpty
            ? <ChartStatus kind="empty" message={emptyMessage} />
            : <div ref={chartContainerRef} role="img" aria-label={`${title}. ${description}`} style={{ minHeight: chartHeight }} />}
      <span style={visuallyHidden} aria-live="polite">{hoveredCandle ? `${formatTimestamp(hoveredCandle.timestamp)} open ${formatPrice(hoveredCandle.open)}, high ${formatPrice(hoveredCandle.high)}, low ${formatPrice(hoveredCandle.low)}, close ${formatPrice(hoveredCandle.close)}, volume ${formatVolume(hoveredCandle.volume)}` : ""}</span>
      {chartNavigator && <div className="bt-chart-navigator" aria-label="Chart range summary"><Maximize2 size={13} aria-hidden="true" /><span>{chartNavigator}</span><a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">Charting by TradingView</a></div>}
    </div>
  );
}
