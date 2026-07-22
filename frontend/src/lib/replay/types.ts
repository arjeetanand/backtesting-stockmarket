export interface ReplayBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ReplayOrder {
  order_id: string;
  side: "buy" | "sell";
  order_type: "market" | "limit" | "stop";
  quantity: number;
  requested_price: number;
  fill_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  status: "OPEN" | "FILLED" | "CLOSED" | "CANCELLED";
  created_at_bar: number;
  filled_at_bar: number | null;
  closed_at_bar: number | null;
  realized_pnl: number;
}

export interface ReplayEvent {
  event_id: string;
  timestamp: string;
  event_type: string;
  description: string;
}

export interface ReplaySessionData {
  session_id: string;
  symbol: string;
  timeframe: string;
  mode: "manual" | "automated";
  start_date: string;
  end_date: string;
  initial_capital: number;
  cash: number;
  equity: number;
  unrealized_pnl: number;
  realized_pnl: number;
  win_rate: number;
  trade_count: number;
  status: "REPLAYING" | "PAUSED" | "FINISHED";
  cursor_index: number;
  total_bars: number;
  current_bar: ReplayBar;
  revealed_bars: ReplayBar[];
  orders: ReplayOrder[];
  events: ReplayEvent[];
}
