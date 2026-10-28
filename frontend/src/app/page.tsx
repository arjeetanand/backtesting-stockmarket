"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  Database,
  FlaskConical,
  Gauge,
  History,
  Search,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import SectionArtwork from "@/components/illustrations/SectionArtwork";
import ThinkingMascot from "@/components/illustrations/ThinkingMascot";
import { fetchWithTimeout } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

type SavedRun = {
  run_id: string;
  config: { strategy?: string; symbol?: string; fast_window?: number; slow_window?: number };
  execution_timestamp: string;
  metrics?: Record<string, number | null>;
};

const tools = [
  { href: "/market-scanner", label: "DISCOVERY", title: "Scan the market", detail: "Find technical matches in locally saved daily data.", icon: Search },
  { href: "/robustness", label: "VALIDATION", title: "Challenge the result", detail: "Check stability across parameters and market paths.", icon: Gauge },
  { href: "/ml-lab", label: "MODEL RESEARCH", title: "Explore ML signals", detail: "Compare past-only models on later unseen dates.", icon: BrainCircuit },
  { href: "/insights", label: "MARKET CONTEXT", title: "Read market breadth", detail: "Explore local index, sector, and stock context.", icon: Activity },
  { href: "/replay", label: "CANDLE REPLAY", title: "Replay history", detail: "Step through real candles with simulated orders.", icon: History },
];

function percent(value: number | null | undefined, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "—";
}

function savedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function strategyName(run: SavedRun) {
  return run.config.strategy === "sma_crossover"
    ? `SMA ${run.config.fast_window ?? 20}/${run.config.slow_window ?? 50}`
    : run.config.strategy ?? "Strategy test";
}

export default function DashboardPage() {
  const [runs, setRuns] = useState<SavedRun[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;

    void fetchWithTimeout(`${API_BASE_URL}/backtests`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The local results service returned an error.");
        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) throw new Error("The saved results response was not a list.");
        if (current) {
          setRuns(payload as SavedRun[]);
          setLoadState("ready");
        }
      })
      .catch(() => {
        if (current) setLoadState("error");
      });

    return () => {
      current = false;
      controller.abort();
    };
  }, [refreshKey]);

  return (
    <div className="backtrack-page">
      <TopBar title="Research overview" />
      <main className="backtrack-content bt-dashboard">
        <section className="bt-dashboard-hero" aria-labelledby="dashboard-title">
          <div className="bt-dashboard-hero-main">
            <div className="bt-dashboard-kicker"><span aria-hidden="true" /> OFFICIAL NSE · DAILY RESEARCH</div>
            <h1 id="dashboard-title">Turn an idea into<br /><em>historical evidence.</em></h1>
            <p>Prepare NSE daily history, review a strategy rule, run a backtest, then inspect the saved results. Everything stays on this device.</p>
            <div className="bt-dashboard-actions">
              <Link href="/data" className="bt-dashboard-primary"><Database size={15} /> Check or get NSE data <ArrowUpRight size={16} /></Link>
              <Link href="/research" className="bt-dashboard-secondary"><FlaskConical size={15} /> I have data — test an idea</Link>
            </div>
            <div className="bt-dashboard-boundary">
              <span>Historical daily data</span><i aria-hidden="true" />
              <span>Local storage</span><i aria-hidden="true" />
              <span>Simulated orders</span>
            </div>
          </div>
          <aside className="bt-dashboard-loop" aria-label="Research workflow">
            <div className="bt-dashboard-loop-head"><span>FROM DATA TO EVIDENCE</span><span>01 — 03</span></div>
            <SectionArtwork src="/illustrations/overview-research.png" className="bt-dashboard-illustration" />
            <ol>
              <li><b>01</b><span><strong>Prepare NSE data</strong><small>Import daily history to this device</small></span><Link href="/data" aria-label="Prepare NSE data">Open data <ArrowRight size={13} /></Link></li>
              <li><b>02</b><span><strong>Review and run a rule</strong><small>Check the assumptions before the test</small></span><Link href="/research" aria-label="Review and run a strategy">Open research <ArrowRight size={13} /></Link></li>
              <li><b>03</b><span><strong>Read the saved result</strong><small>Inspect return, drawdown, and risk</small></span><Link href="/backtests" aria-label="Read saved test results">Open saved tests <ArrowRight size={13} /></Link></li>
            </ol>
            <Link href="/comparison" className="bt-dashboard-loop-link">Then compare tests <ArrowRight size={14} /></Link>
          </aside>
        </section>

        <section id="workbench" aria-labelledby="workbench-title">
          <div className="bt-dashboard-section-head">
            <div><span className="bt-dashboard-overline">AFTER YOUR FIRST TEST</span><h2 id="workbench-title">Explore more tools</h2></div>
            <p>Optional views using the same locally saved market history.</p>
          </div>
          <div className="bt-dashboard-tools">
            {tools.map(({ href, label, title, detail, icon: Icon }, index) => (
              <Link href={href} className="bt-dashboard-tool" key={href}>
                <span className="bt-dashboard-tool-top"><span>{label}</span><span>0{index + 1}</span></span>
                <span className="bt-dashboard-tool-icon"><Icon size={18} strokeWidth={1.8} /></span>
                <strong>{title}</strong>
                <span className="bt-dashboard-tool-detail">{detail}</span>
                <ArrowUpRight className="bt-dashboard-tool-arrow" size={16} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>

        <section className="bt-dashboard-recent" aria-labelledby="recent-title">
          <div className="bt-dashboard-section-head">
            <div><span className="bt-dashboard-overline">LOCAL HISTORY</span><h2 id="recent-title">Recent tests</h2></div>
            <Link href="/backtests" className="bt-dashboard-text-link">All saved tests <ArrowRight size={14} /></Link>
          </div>

          {loadState === "loading" && (
            <div className="bt-panel bt-dashboard-state" role="status"><span className="bt-dashboard-loader" aria-hidden="true" />Loading saved tests from this device…</div>
          )}
          {loadState === "error" && (
            <div className="bt-panel bt-dashboard-state bt-dashboard-error" role="alert">
              <div><strong>Saved tests are unavailable</strong><p>Check that Backtrack’s local backend is running, then retry.</p></div>
              <button type="button" className="bt-secondary" onClick={() => { setLoadState("loading"); setRefreshKey((key) => key + 1); }}>Try again</button>
            </div>
          )}
          {loadState === "ready" && runs.length === 0 && (
            <div className="bt-panel bt-dashboard-empty">
              <ThinkingMascot size="medium" animate />
              <div><strong>Your research log starts here.</strong><p>Run a historical test and its real results will appear in this list.</p></div>
              <Link href="/research" className="bt-dashboard-text-link">Open Strategy Lab <ArrowRight size={14} /></Link>
            </div>
          )}
          {loadState === "ready" && runs.length > 0 && (
            <div className="bt-panel bt-dashboard-table-panel">
              <div className="bt-table-wrap"><table className="bt-table bt-dashboard-table">
                <thead><tr><th>Strategy</th><th>Stock</th><th>Saved</th><th className="right">Return</th><th className="right">Win rate</th><th className="right">Max drawdown</th></tr></thead>
                <tbody>{runs.slice(0, 5).map((run) => (
                  <tr key={run.run_id}>
                    <td><strong>{strategyName(run)}</strong><br /><span className="bt-val-muted">{run.run_id}</span></td>
                    <td>{run.config.symbol ?? "—"}</td>
                    <td>{savedDate(run.execution_timestamp)}</td>
                    <td className="right">{percent(run.metrics?.total_return)}</td>
                    <td className="right">{percent(run.metrics?.win_rate, 1)}</td>
                    <td className="right">{percent(run.metrics?.maximum_drawdown)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </div>
          )}
        </section>

        <footer className="bt-dashboard-footnote"><span className="bt-dashboard-footnote-mark" aria-hidden="true">i</span><p>Backtrack works with historical NSE daily archives. It does not provide live quotes or send broker orders; every backtest and replay order is simulated.</p><Link href="/options">Learning centre <ArrowRight size={13} /></Link></footer>
      </main>
    </div>
  );
}
