import type { MarketDataBar } from "./market-data";
import type {
  FinancialTrade,
  IndicatorSeries,
  NormalizedCandle,
  TradeMarker,
} from "./chart-data";

type RawCandle = {
  date?: string;
  timestamp?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number | null;
};

type RawIndicatorPoint = { date?: string; timestamp?: string; value?: number | null };
type RawTrade = {
  id?: string | number;
  trade_id?: string | number;
  entry_date?: string;
  exit_date?: string;
  entry_price?: number;
  exit_price?: number;
  pnl?: number;
  return_pct?: number;
};
type RawSignal = {
  id?: string | number;
  date?: string;
  timestamp?: string;
  type?: "entry" | "exit" | "signal";
  price?: number;
  trade_id?: string | number;
};

export type BacktestChartPayload = {
  candles?: RawCandle[];
  indicators?: Record<string, RawIndicatorPoint[]>;
  signals?: RawSignal[];
  trades?: RawTrade[];
};

export type ResearchChartInputs = {
  candles: NormalizedCandle[];
  indicators: IndicatorSeries[];
  tradeMarkers: TradeMarker[];
  trades: FinancialTrade[];
};

const OSCILLATOR_PATTERN = /(^|\s)(rsi|macd|atr|stochastic|adx|obv|momentum)(\s|$)/i;
const INDICATOR_COLORS = ["#4f46e5", "#059669", "#d97706", "#db2777", "#0ea5e9", "#7c3aed"];

function timestampOf(point: { date?: string; timestamp?: string }): string | null {
  const timestamp = point.date ?? point.timestamp;
  return timestamp && timestamp.trim() ? timestamp : null;
}

export function adaptMarketBars(bars: ReadonlyArray<MarketDataBar>): ResearchChartInputs {
  return {
    candles: bars.map((bar) => ({
      timestamp: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    })),
    indicators: [],
    tradeMarkers: [],
    trades: [],
  };
}

function adaptIndicators(raw: BacktestChartPayload["indicators"]): IndicatorSeries[] {
  return Object.entries(raw ?? {}).map(([label, points], index) => {
    const pane = OSCILLATOR_PATTERN.test(label) ? "pane" : "overlay";
    const values = (points ?? [])
      .map((point) => {
        const timestamp = timestampOf(point);
        return timestamp && typeof point.value === "number" && Number.isFinite(point.value)
          ? { timestamp, value: point.value }
          : null;
      })
      .filter((point): point is { timestamp: string; value: number } => Boolean(point));
    const normalizedLabel = label.trim() || `Indicator ${index + 1}`;
    const isRsi = /rsi/i.test(label);
    const isMacd = /macd/i.test(label);
    return {
      id: normalizedLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-") || `indicator-${index}`,
      label: normalizedLabel,
      values,
      placement: pane,
      paneId: pane === "pane" ? (isMacd ? "macd" : isRsi ? "rsi" : normalizedLabel) : undefined,
      paneLabel: pane === "pane" ? (isMacd ? "MACD" : isRsi ? "RSI" : normalizedLabel) : undefined,
      color: INDICATOR_COLORS[index % INDICATOR_COLORS.length],
      referenceLines: isRsi
        ? [{ value: 30, label: "30", color: "#94a3b8", dash: "4 4" }, { value: 70, label: "70", color: "#94a3b8", dash: "4 4" }]
        : isMacd
          ? [{ value: 0, label: "0", color: "#94a3b8", dash: "4 4" }]
          : [],
    };
  });
}

function adaptTrades(raw: ReadonlyArray<RawTrade>): FinancialTrade[] {
  return raw.flatMap((trade, index) => {
    const id = String(trade.trade_id ?? trade.id ?? index + 1);
    if (!trade.entry_date || typeof trade.entry_price !== "number" || !Number.isFinite(trade.entry_price)) return [];
    return [{
      id,
      side: "long" as const,
      entry: { timestamp: trade.entry_date, price: trade.entry_price },
      exit: trade.exit_date && typeof trade.exit_price === "number" && Number.isFinite(trade.exit_price)
        ? { timestamp: trade.exit_date, price: trade.exit_price }
        : null,
      pnl: typeof trade.pnl === "number" && Number.isFinite(trade.pnl) ? trade.pnl : null,
      label: typeof trade.return_pct === "number" ? `${trade.return_pct >= 0 ? "Winning" : "Losing"} trade` : undefined,
    }];
  });
}

function adaptSignals(raw: ReadonlyArray<RawSignal>): TradeMarker[] {
  return raw.flatMap((signal, index) => {
    const timestamp = timestampOf(signal);
    if (!timestamp || typeof signal.price !== "number" || !Number.isFinite(signal.price)) return [];
    const kind = signal.type === "entry" || signal.type === "exit" ? signal.type : "signal";
    return [{
      id: String(signal.id ?? `signal-${index}`),
      tradeId: signal.trade_id === undefined ? undefined : String(signal.trade_id),
      timestamp,
      price: signal.price,
      kind,
      label: kind === "entry" ? "Buy / entry" : kind === "exit" ? "Sell / exit" : "Signal",
    }];
  });
}

export function adaptBacktestChart(payload: BacktestChartPayload): ResearchChartInputs {
  return {
    candles: (payload.candles ?? []).flatMap((candle) => {
      const timestamp = timestampOf(candle);
      if (!timestamp) return [];
      return [{ timestamp, open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close), volume: typeof candle.volume === "number" ? candle.volume : null }];
    }),
    indicators: adaptIndicators(payload.indicators),
    tradeMarkers: adaptSignals(payload.signals ?? []),
    trades: adaptTrades(payload.trades ?? []),
  };
}
