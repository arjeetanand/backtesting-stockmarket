"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
  { href: "/research", label: "STRATEGY LAB", title: "Test an idea", detail: "Turn a rule into a cost-aware historical test.", icon: FlaskConical },
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
            <h1 id="dashboard-title">Make the idea<br /><em>prove itself.</em></h1>
            <p>One local research desk for Indian equities. Load the history you have, test the rules you can explain, then challenge the result.</p>
            <div className="bt-dashboard-actions">
              <Link href="/research" className="bt-dashboard-primary">Start a strategy test <ArrowUpRight size={16} /></Link>
              <Link href="/data" className="bt-dashboard-secondary"><Database size={15} /> Manage NSE history</Link>
            </div>
            <div className="bt-dashboard-boundary">
              <span>Historical daily data</span><i aria-hidden="true" />
              <span>Local storage</span><i aria-hidden="true" />
              <span>Simulated orders</span>
            </div>
          </div>
          <figure className="bt-dashboard-illustration">
            <Image
              src="/illustrations/research-notebook-mascot.webp"
              alt="A notebook mascot reviews printed historical price records with a magnifying glass."
              width={960}
              height={640}
              sizes="(min-width: 1440px) 22vw, (min-width: 1000px) 33vw, 100vw"
              priority
            />
          </figure>
          <aside className="bt-dashboard-loop" aria-label="Research workflow">
            <div className="bt-dashboard-loop-head"><span>THE RESEARCH LOOP</span><span>01 — 03</span></div>
            <ol>
              <li><b>01</b><span><strong>Bring the data</strong><small>Official NSE archives, saved locally</small></span></li>
              <li><b>02</b><span><strong>Test the rule</strong><small>Next-candle fills, costs included</small></span></li>
              <li><b>03</b><span><strong>Check the evidence</strong><small>Drawdown, bias, and robustness</small></span></li>
            </ol>
            <Link href="/data" className="bt-dashboard-loop-link">Start with your data <ArrowRight size={14} /></Link>
          </aside>
        </section>

        <section id="workbench" aria-labelledby="workbench-title">
          <div className="bt-dashboard-section-head">
            <div><span className="bt-dashboard-overline">YOUR WORKBENCH</span><h2 id="workbench-title">Choose a direction</h2></div>
            <p>Each tool uses the same locally saved market history.</p>
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
