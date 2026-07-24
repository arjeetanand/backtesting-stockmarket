/** API-independent data contracts and pure adapters for financial charts. */

export type ChartTimestamp = string | number;
export type IndicatorPlacement = "overlay" | "pane";
export type TradeSide = "long" | "short";
export type TradeMarkerKind = "entry" | "exit" | "signal";

export interface NormalizedCandle {
  timestamp: ChartTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

export interface IndicatorPoint {
  timestamp: ChartTimestamp;
  value: number | null;
}

export interface IndicatorReferenceLine {
  value: number;
  label?: string;
  color?: string;
  dash?: string;
}

export interface IndicatorSeries {
  id: string;
  label: string;
  values: ReadonlyArray<IndicatorPoint>;
  placement?: IndicatorPlacement;
  paneId?: string;
  paneLabel?: string;
  color?: string;
  lineWidth?: number;
  lineStyle?: "solid" | "dashed";
  referenceLines?: ReadonlyArray<IndicatorReferenceLine>;
}

export interface TradePoint {
  timestamp: ChartTimestamp;
  price: number;
}

export interface FinancialTrade {
  id: string;
  side?: TradeSide;
  entry: TradePoint;
  exit?: TradePoint | null;
  pnl?: number | null;
  label?: string;
}

export interface TradeMarker {
  id?: string;
  tradeId?: string;
  timestamp: ChartTimestamp;
  price: number;
  kind?: TradeMarkerKind;
  side?: TradeSide;
  label?: string;
}

export interface ChartCandle {
  timestamp: ChartTimestamp;
  timestampKey: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  isBullish: boolean;
}

export interface ChartIndicatorPoint {
  timestamp: ChartTimestamp;
  timestampKey: string;
  value: number;
}

export interface ChartIndicator extends Omit<IndicatorSeries, "values" | "placement" | "referenceLines"> {
  values: ReadonlyArray<ChartIndicatorPoint>;
  placement: IndicatorPlacement;
  referenceLines: ReadonlyArray<IndicatorReferenceLine>;
}

export interface ChartTradePoint {
  timestamp: ChartTimestamp;
  timestampKey: string;
  price: number;
}

export interface ChartTrade extends Omit<FinancialTrade, "entry" | "exit"> {
  entry: ChartTradePoint;
  exit?: ChartTradePoint | null;
}

export interface ChartTradeMarker extends Omit<TradeMarker, "id" | "timestamp" | "kind"> {
  id: string;
  timestamp: ChartTimestamp;
  timestampKey: string;
  kind: TradeMarkerKind;
}

export interface FinancialChartData {
  candles: ReadonlyArray<ChartCandle>;
  indicators: ReadonlyArray<ChartIndicator>;
  trades: ReadonlyArray<ChartTrade>;
  tradeMarkers: ReadonlyArray<ChartTradeMarker>;
}

export interface FinancialChartDataInput {
  candles: ReadonlyArray<NormalizedCandle>;
  indicators?: ReadonlyArray<IndicatorSeries>;
  trades?: ReadonlyArray<FinancialTrade>;
  tradeMarkers?: ReadonlyArray<TradeMarker>;
}

const isFiniteNumber = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Produces a stable key for joining candles, indicator points, and markers.
 * Date strings are canonicalized while opaque timestamps remain usable as-is.
 */
export function chartTimestampKey(timestamp: ChartTimestamp): string {
  if (typeof timestamp === "number") return String(timestamp);
  const value = timestamp.trim();
  if (!value) return "";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

function timestampSortValue(timestamp: ChartTimestamp): number | string {
  if (typeof timestamp === "number") return timestamp;
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? timestamp : parsed;
}

function compareTimestamps(left: ChartTimestamp, right: ChartTimestamp): number {
  const leftValue = timestampSortValue(left);
  const rightValue = timestampSortValue(right);
  if (typeof leftValue === "number" && typeof rightValue === "number") return leftValue - rightValue;
  return String(leftValue).localeCompare(String(rightValue));
}

function toChartTradePoint(point: TradePoint | null | undefined): ChartTradePoint | null {
  if (!point || !chartTimestampKey(point.timestamp) || !isFiniteNumber(point.price)) return null;
  return {
    timestamp: point.timestamp,
    timestampKey: chartTimestampKey(point.timestamp),
    price: point.price,
  };
}

function toChartTrade(trade: FinancialTrade): ChartTrade | null {
  const id = trade.id.trim();
  const entry = toChartTradePoint(trade.entry);
  if (!id || !entry) return null;
  return {
    id,
    side: trade.side,
    entry,
    exit: toChartTradePoint(trade.exit),
    pnl: isFiniteNumber(trade.pnl) ? trade.pnl : null,
    label: trade.label,
  };
}

function markerKey(marker: ChartTradeMarker): string {
  return `${marker.id}:${marker.timestampKey}:${marker.kind}:${marker.price}`;
}

function toChartMarker(marker: TradeMarker, fallbackId: string): ChartTradeMarker | null {
  if (!chartTimestampKey(marker.timestamp) || !isFiniteNumber(marker.price)) return null;
  const id = marker.id?.trim() || fallbackId;
  return {
    id,
    tradeId: marker.tradeId,
    timestamp: marker.timestamp,
    timestampKey: chartTimestampKey(marker.timestamp),
    price: marker.price,
    kind: marker.kind ?? "signal",
    side: marker.side,
    label: marker.label,
  };
}

function markersFromTrade(trade: ChartTrade): ChartTradeMarker[] {
  const markers: ChartTradeMarker[] = [{
    id: `${trade.id}:entry`,
    tradeId: trade.id,
    timestamp: trade.entry.timestamp,
    timestampKey: trade.entry.timestampKey,
    price: trade.entry.price,
    kind: "entry",
    side: trade.side,
    label: trade.label ? `${trade.label} entry` : "Entry",
  }];
  if (trade.exit) {
    markers.push({
      id: `${trade.id}:exit`,
      tradeId: trade.id,
      timestamp: trade.exit.timestamp,
      timestampKey: trade.exit.timestampKey,
      price: trade.exit.price,
      kind: "exit",
      side: trade.side,
      label: trade.label ? `${trade.label} exit` : "Exit",
    });
  }
  return markers;
}

/**
 * Normalizes chart inputs without knowing anything about HTTP, API schemas, or UI state.
 * Invalid numeric points are omitted; no missing market prices are synthesized.
 */
export function createFinancialChartData(input: FinancialChartDataInput): FinancialChartData {
  const candlesByTimestamp = new Map<string, ChartCandle>();
  for (const candle of input.candles) {
    const timestampKey = chartTimestampKey(candle.timestamp);
    if (
      !timestampKey ||
      !isFiniteNumber(candle.open) ||
      !isFiniteNumber(candle.high) ||
      !isFiniteNumber(candle.low) ||
      !isFiniteNumber(candle.close)
    ) continue;
    candlesByTimestamp.set(timestampKey, {
      timestamp: candle.timestamp,
      timestampKey,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: isFiniteNumber(candle.volume) ? candle.volume : null,
      isBullish: candle.close >= candle.open,
    });
  }
  const candles = Array.from(candlesByTimestamp.values()).sort((left, right) => compareTimestamps(left.timestamp, right.timestamp));

  const indicators = (input.indicators ?? []).flatMap((indicator): ChartIndicator[] => {
    const id = indicator.id.trim();
    const label = indicator.label.trim() || id;
    if (!id || !label) return [];
    const valuesByTimestamp = new Map<string, ChartIndicatorPoint>();
    for (const point of indicator.values) {
      const timestampKey = chartTimestampKey(point.timestamp);
      if (!timestampKey || !isFiniteNumber(point.value)) continue;
      valuesByTimestamp.set(timestampKey, { timestamp: point.timestamp, timestampKey, value: point.value });
    }
    return [{
      id,
      label,
      values: Array.from(valuesByTimestamp.values()).sort((left, right) => compareTimestamps(left.timestamp, right.timestamp)),
      placement: indicator.placement ?? "overlay",
      paneId: indicator.paneId,
      paneLabel: indicator.paneLabel,
      color: indicator.color,
      lineWidth: indicator.lineWidth,
      lineStyle: indicator.lineStyle,
      referenceLines: (indicator.referenceLines ?? []).filter((line) => isFiniteNumber(line.value)),
    }];
  });

  const trades = (input.trades ?? []).flatMap((trade): ChartTrade[] => {
    const chartTrade = toChartTrade(trade);
    return chartTrade ? [chartTrade] : [];
  });
  const markerMap = new Map<string, ChartTradeMarker>();
  for (const trade of trades) {
    for (const marker of markersFromTrade(trade)) markerMap.set(markerKey(marker), marker);
  }
  (input.tradeMarkers ?? []).forEach((marker, index) => {
    const chartMarker = toChartMarker(marker, `marker-${index}`);
    if (chartMarker) markerMap.set(markerKey(chartMarker), chartMarker);
  });
  const tradeMarkers = Array.from(markerMap.values()).sort((left, right) => {
    const timestampOrder = compareTimestamps(left.timestamp, right.timestamp);
    return timestampOrder || left.id.localeCompare(right.id);
  });

  return { candles, indicators, trades, tradeMarkers };
}

/** Short alias for callers that prefer an adapter-shaped name. */
export const adaptFinancialChartData = createFinancialChartData;
