"use client";

import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// Custom tooltip — plain interface, not extending Recharts types to avoid conflicts
interface CustomTooltipProps {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: string;
  formatter?: (v: number) => string;
}

const CustomTooltip = ({ active, payload, label, formatter }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          background: "rgba(10,14,26,0.95)",
          border: "1px solid rgba(0,212,255,0.2)",
          borderRadius: 8,
          padding: "10px 14px",
          backdropFilter: "blur(12px)",
          fontFamily: "var(--font-jetbrains)",
          fontSize: 12,
        }}
      >
        <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>{label}</p>
        {payload.map((entry: { name: string; value: number; color: string }, i: number) => (
          <p key={i} style={{ color: entry.color, marginBottom: 2 }}>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>{entry.name}: </span>
            {formatter ? formatter(entry.value) : entry.value.toFixed(2)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

interface EquityChartProps {
  data: Array<{ date: string; strategy: number; benchmark: number }>;
  height?: number;
}

export function EquityChart({ data, height = 280 }: EquityChartProps) {
  const fmt = (v: number) => `$${(v / 1000).toFixed(0)}k`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="strategyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="benchmarkGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#64748b" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#64748b" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="date"
          tick={{ fill: "rgba(255,255,255,0.3)", fontFamily: "var(--font-jetbrains)", fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={fmt}
          tick={{ fill: "rgba(255,255,255,0.3)", fontFamily: "var(--font-jetbrains)", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip
          content={({ active, payload, label }) => (
            <CustomTooltip
              active={active}
              payload={payload ? [...payload] : []}
              label={label != null ? String(label) : undefined}
              formatter={fmt}
            />
          )}
        />
        <Legend
          wrapperStyle={{
            fontFamily: "var(--font-jetbrains)",
            fontSize: 11,
            color: "rgba(255,255,255,0.5)",
            paddingTop: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="benchmark"
          name="Buy & Hold"
          stroke="#475569"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          fill="url(#benchmarkGradient)"
        />
        <Area
          type="monotone"
          dataKey="strategy"
          name="Strategy"
          stroke="#10B981"
          strokeWidth={2}
          fill="url(#strategyGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface MultiLineChartProps {
  data: Array<Record<string, string | number>>;
  lines: Array<{ key: string; color: string; label: string }>;
  height?: number;
}

export function MultiLineChart({ data, lines, height = 220 }: MultiLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="date"
          tick={{ fill: "rgba(255,255,255,0.3)", fontFamily: "var(--font-jetbrains)", fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v) => `${v.toFixed(0)}`}
          tick={{ fill: "rgba(255,255,255,0.3)", fontFamily: "var(--font-jetbrains)", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip
          content={({ active, payload, label }) => (
            <CustomTooltip active={active} payload={payload ? [...payload] : []} label={label != null ? String(label) : undefined} />
          )}
        />
        <Legend
          wrapperStyle={{
            fontFamily: "var(--font-jetbrains)",
            fontSize: 11,
            color: "rgba(255,255,255,0.5)",
            paddingTop: 8,
          }}
        />
        {lines.map((line) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.label}
            stroke={line.color}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

interface DrawdownChartProps {
  data: Array<{ date: string; drawdown: number }>;
  height?: number;
}

export function DrawdownChart({ data, height = 180 }: DrawdownChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="ddGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#EF4444" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="date"
          tick={{ fill: "rgba(255,255,255,0.3)", fontFamily: "var(--font-jetbrains)", fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v) => `${v.toFixed(0)}%`}
          tick={{ fill: "rgba(255,255,255,0.3)", fontFamily: "var(--font-jetbrains)", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <Tooltip
          content={({ active, payload, label }) => (
            <CustomTooltip
              active={active}
              payload={payload ? [...payload] : []}
              label={label != null ? String(label) : undefined}
              formatter={(v) => `${v.toFixed(2)}%`}
            />
          )}
        />
        <Area
          type="monotone"
          dataKey="drawdown"
          name="Drawdown"
          stroke="#EF4444"
          strokeWidth={1.5}
          fill="url(#ddGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
