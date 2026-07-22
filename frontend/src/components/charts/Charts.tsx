"use client";

import { useMemo, useState, type ReactNode, type WheelEvent } from "react";
import { Maximize2, MoveHorizontal, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = Record<string, string | number>;

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  formatter?: (value: number) => string;
}

function ChartTooltip({ active, payload, label, formatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bt-chart-tooltip">
      <p>{label}</p>
      {payload.map((entry) => (
        <div key={entry.name}>
          <span style={{ backgroundColor: entry.color }} />
          <b>{entry.name}</b>
          <strong>{formatter ? formatter(entry.value) : entry.value.toFixed(2)}</strong>
        </div>
      ))}
    </div>
  );
}

function ChartControls({
  dataLength,
  visibleCount,
  setVisibleCount,
}: {
  dataLength: number;
  visibleCount: number;
  setVisibleCount: (value: number) => void;
}) {
  const zoom = (direction: "in" | "out") => {
    const next = direction === "in" ? Math.round(visibleCount * 0.7) : Math.round(visibleCount * 1.4);
    setVisibleCount(Math.max(Math.min(next, dataLength), Math.min(12, dataLength)));
  };
  return (
    <div className="bt-chart-controls" aria-label="Chart range controls">
      {[30, 90].filter((range) => range < dataLength).map((range) => (
        <button key={range} type="button" onClick={() => setVisibleCount(range)} className={visibleCount === range ? "is-active" : ""}>
          {range}D
        </button>
      ))}
      <button type="button" onClick={() => setVisibleCount(dataLength)} className={visibleCount === dataLength ? "is-active" : ""}>All</button>
      <i />
      <button type="button" onClick={() => zoom("out")} aria-label="Zoom out"><ZoomOut size={14} /></button>
      <button type="button" onClick={() => zoom("in")} aria-label="Zoom in"><ZoomIn size={14} /></button>
      <button type="button" onClick={() => setVisibleCount(dataLength)} aria-label="Reset chart scale"><RotateCcw size={14} /></button>
    </div>
  );
}

function InteractiveShell({
  data,
  children,
  height,
  title,
}: {
  data: Point[];
  children: (visibleData: Point[]) => ReactNode;
  height: number;
  title: string;
}) {
  const [visibleCount, setVisibleCount] = useState(data.length);
  const visibleData = useMemo(() => data.slice(Math.max(0, data.length - visibleCount)), [data, visibleCount]);
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setVisibleCount((count) => Math.max(Math.min(Math.round(count * (event.deltaY < 0 ? 0.82 : 1.22)), data.length), Math.min(12, data.length)));
  };

  return (
    <div className="bt-interactive-chart" onWheel={onWheel}>
      <div className="bt-chart-toolbar">
        <div><MoveHorizontal size={14} /><span>{title}</span><small>Ctrl/⌘ + scroll to zoom</small></div>
        <ChartControls dataLength={data.length} visibleCount={visibleCount} setVisibleCount={setVisibleCount} />
      </div>
      <div style={{ height }}>{children(visibleData)}</div>
      {data.length > 18 && (
        <div className="bt-chart-navigator" aria-label="Chart range navigator">
          <Maximize2 size={13} />
          <span>Drag the handles below to inspect a time range</span>
        </div>
      )}
    </div>
  );
}

const axis = {
  tick: { fill: "#64748b", fontFamily: "var(--font-jetbrains)", fontSize: 10 },
  tickLine: false,
  axisLine: { stroke: "#e2e8f0" },
};

function Navigator({ data }: { data: Point[] }) {
  if (data.length < 19) return null;
  return <Brush dataKey="date" height={24} travellerWidth={8} stroke="#4f46e5" fill="#f8fafc" tickFormatter={() => ""} />;
}

export function EquityChart({ data, height = 280 }: { data: Array<{ date: string; strategy: number; benchmark: number }>; height?: number }) {
  const fmt = (value: number) => `₹${(value / 1000).toFixed(0)}k`;
  return (
    <InteractiveShell data={data} height={height} title="Equity performance">
      {(visibleData) => <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={visibleData} margin={{ top: 10, right: 18, left: 6, bottom: 0 }}>
          <defs><linearGradient id="strategyGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#059669" stopOpacity={0.2} /><stop offset="1" stopColor="#059669" stopOpacity={0.01} /></linearGradient></defs>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" minTickGap={42} {...axis} />
          <YAxis orientation="right" tickFormatter={fmt} width={56} domain={["dataMin - 1000", "dataMax + 1000"]} {...axis} />
          <Tooltip cursor={{ stroke: "#64748b", strokeDasharray: "4 4" }} content={<ChartTooltip formatter={fmt} />} />
          <Legend wrapperStyle={{ fontFamily: "var(--font-jetbrains)", fontSize: 11, paddingTop: 8 }} />
          <Area type="monotone" dataKey="benchmark" name="Buy & Hold" stroke="#0ea5e9" strokeWidth={1.5} strokeDasharray="5 4" fill="none" />
          <Area type="monotone" dataKey="strategy" name="Strategy" stroke="#059669" strokeWidth={2.25} fill="url(#strategyGradient)" activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
          <Navigator data={visibleData} />
        </AreaChart>
      </ResponsiveContainer>}
    </InteractiveShell>
  );
}

export function MultiLineChart({ data, lines, height = 220 }: { data: Point[]; lines: Array<{ key: string; color: string; label: string }>; height?: number }) {
  return <InteractiveShell data={data} height={height} title="Performance comparison">{(visibleData) => <ResponsiveContainer width="100%" height="100%"><LineChart data={visibleData} margin={{ top: 10, right: 18, left: 6, bottom: 0 }}><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" minTickGap={42} {...axis} /><YAxis orientation="right" width={46} {...axis} /><Tooltip cursor={{ stroke: "#64748b", strokeDasharray: "4 4" }} content={<ChartTooltip />} /><Legend wrapperStyle={{ fontFamily: "var(--font-jetbrains)", fontSize: 11, paddingTop: 8 }} />{lines.map((line) => <Line key={line.key} type="monotone" dataKey={line.key} name={line.label} stroke={line.color} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} />)}<Navigator data={visibleData} /></LineChart></ResponsiveContainer>}</InteractiveShell>;
}

export function DrawdownChart({ data, height = 180 }: { data: Array<{ date: string; drawdown: number }>; height?: number }) {
  return <InteractiveShell data={data} height={height} title="Drawdown analysis">{(visibleData) => <ResponsiveContainer width="100%" height="100%"><AreaChart data={visibleData} margin={{ top: 10, right: 18, left: 6, bottom: 0 }}><defs><linearGradient id="ddGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e11d48" stopOpacity={0.05} /><stop offset="1" stopColor="#e11d48" stopOpacity={0.32} /></linearGradient></defs><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" minTickGap={42} {...axis} /><YAxis orientation="right" tickFormatter={(value) => `${value.toFixed(0)}%`} width={48} {...axis} /><ReferenceLine y={0} stroke="#94a3b8" /><Tooltip cursor={{ stroke: "#64748b", strokeDasharray: "4 4" }} content={<ChartTooltip formatter={(value) => `${value.toFixed(2)}%`} />} /><Area type="monotone" dataKey="drawdown" name="Drawdown" stroke="#e11d48" strokeWidth={2} fill="url(#ddGradient)" activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} /><Navigator data={visibleData} /></AreaChart></ResponsiveContainer>}</InteractiveShell>;
}
