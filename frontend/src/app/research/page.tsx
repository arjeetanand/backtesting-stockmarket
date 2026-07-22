"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Play,
  CheckCircle,
  Loader2,
  Circle,
  ChevronRight,
  Code2,
  MessageSquare,
  Send,
  ArrowRight,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { agentWorkflowSteps, exampleHypotheses } from "@/lib/mock-data";

type StepStatus = "complete" | "running" | "pending";

const initialStepStatuses: StepStatus[] = [
  "complete",
  "complete",
  "complete",
  "complete",
  "running",
  "pending",
  "pending",
  "pending",
];

const strategyDSL = `{
  "metadata": {
    "name": "RSI Oversold + EMA Trend",
    "version": "1.0.0"
  },
  "universe": "index",
  "symbols": ["NIFTY_50"],
  "exchange": "NSE",
  "timeframe": "1D",
  "date_range": {
    "start": "2019-01-01",
    "end": "2024-12-31"
  },
  "initial_capital": 100000,
  "trade_direction": "long",
  "indicators": {
    "rsi_14": { "type": "RSI", "parameters": { "period": 14 } },
    "ema_20": { "type": "EMA", "parameters": { "period": 20 } },
    "ema_50": { "type": "EMA", "parameters": { "period": 50 } }
  },
  "entry_conditions": [{
    "type": "logical", "op": "and",
    "conditions": [
      { "type": "comparison",
        "left": { "type": "indicator", "alias": "rsi_14" },
        "op": "<", "right": { "type": "literal", "value": 30 }
      },
      { "type": "cross", "op": "cross_above",
        "left": { "type": "indicator", "alias": "ema_20" },
        "right": { "type": "indicator", "alias": "ema_50" }
      }
    ]
  }],
  "position_sizing": { "type": "percent", "value": 0.1 },
  "commission": 0.001
}`;

export default function ResearchPage() {
  const [hypothesis, setHypothesis] = useState(
    "Test whether RSI oversold signals combined with EMA trend confirmation outperform buy and hold on NIFTY 50 from 2019 to 2024"
  );
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<
    Array<{ role: "ai" | "user"; text: string }>
  >([
    {
      role: "ai",
      text: "I parsed your hypothesis successfully. I assumed: 1D timeframe, NIFTY 50 index, long-only positions, ₹100K initial capital. Indicators extracted: RSI(14), EMA(20), EMA(50). Should I proceed with the backtest or adjust any parameters?",
    },
  ]);

  const handleSendChat = () => {
    if (!chatMessage.trim()) return;
    setChatHistory([...chatHistory, { role: "user" as const, text: chatMessage }]);
    setChatMessage("");
    setTimeout(() => {
      setChatHistory((prev) => [
        ...prev,
        {
          role: "ai" as const,
          text: "Understood. I've updated the parameters accordingly. Proceeding with backtest execution using the revised configuration.",
        },
      ]);
    }, 800);
  };

  return (
    <div className="backtrack-page">
      <TopBar />

      <div className="backtrack-content bt-stack">
        {/* Page Header */}
        <section className="bt-heading-row">
          <div>
            <div className="bt-kicker">
              <span className="live-dot" /> 01 / RESEARCH WORKSPACE
            </div>
            <h1>Natural language to strategy DSL.</h1>
            <p>
              Describe your hypothesis in plain text. Backtrack parses
              indicators, conditions, and risk rules into deterministic
              backtests.
            </p>
          </div>
          <div className="bt-heading-actions">
            <span className="data-source">
              <Sparkles size={14} /> Swarm Agent Active
            </span>
          </div>
        </section>

        {/* Hypothesis Input */}
        <div className="bt-hypothesis-block">
          <div className="bt-hypothesis-header">
            <div className="bt-hypothesis-icon">
              <Sparkles size={17} />
            </div>
            <span className="bt-hypothesis-title">
              Describe Your Trading Hypothesis
            </span>
            <span className="bt-ai-badge">AI-Powered</span>
          </div>

          <textarea
            className="bt-hypothesis-textarea"
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
          />

          <div className="bt-hypothesis-footer">
            <div className="bt-hypothesis-pills">
              {exampleHypotheses.map((ex, i) => (
                <button
                  key={i}
                  className="bt-hypothesis-pill"
                  onClick={() => setHypothesis(ex)}
                >
                  {ex.slice(0, 42)}…
                </button>
              ))}
            </div>
            <button className="bt-primary">
              <Play size={14} /> Parse Hypothesis
            </button>
          </div>
        </div>

        {/* Agent Pipeline */}
        <div className="bt-panel bt-pipeline-panel">
          <p className="bt-pipeline-title">Swarm Agent Execution Pipeline</p>
          <div className="bt-pipeline-grid">
            {agentWorkflowSteps.map((step, idx) => {
              const status = initialStepStatuses[idx];
              return (
                <div
                  key={step.id}
                  className={`bt-pipeline-step ${status}`}
                >
                  <div className="bt-step-top">
                    <span className="bt-step-num">0{step.id}</span>
                    {status === "complete" && (
                      <CheckCircle size={14} style={{ color: "#059669" }} />
                    )}
                    {status === "running" && (
                      <Loader2
                        size={14}
                        style={{
                          color: "#4f46e5",
                          animation: "bt-spin 0.8s linear infinite",
                        }}
                      />
                    )}
                    {status === "pending" && (
                      <Circle size={14} style={{ color: "#cbd5e1" }} />
                    )}
                  </div>
                  <div>
                    <p className="bt-step-label">{step.label}</p>
                    <p className={`bt-step-status ${status}`}>{status}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* DSL Preview + Chat */}
        <div className="bt-grid-2">
          {/* DSL Preview */}
          <div className="bt-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div className="bt-row-between" style={{ marginBottom: "12px" }}>
                <div className="bt-row">
                  <Code2 size={16} style={{ color: "#4f46e5" }} />
                  <h3
                    style={{
                      fontFamily: "var(--font-space-grotesk)",
                      fontSize: "15px",
                      fontWeight: 700,
                      color: "#0f172a",
                    }}
                  >
                    Extracted Strategy DSL
                  </h3>
                </div>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: "4px",
                    background: "#f0fdf4",
                    color: "#15803d",
                    border: "1px solid #bbf7d0",
                    fontFamily: "var(--font-jetbrains)",
                    fontSize: "9px",
                    fontWeight: 700,
                    textTransform: "uppercase" as const,
                  }}
                >
                  VALIDATED
                </span>
              </div>

              <pre className="bt-dsl-preview">
                <code>{strategyDSL}</code>
              </pre>
            </div>

            <div
              className="bt-row-between"
              style={{
                marginTop: "16px",
                paddingTop: "14px",
                borderTop: "1px solid #f1f5f9",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "10px",
                  color: "#94a3b8",
                }}
              >
                Deterministic · No Lookahead
              </span>
              <Link href="/strategy">
                <button className="bt-secondary">
                  Open in Strategy Builder
                  <ChevronRight size={14} />
                </button>
              </Link>
            </div>
          </div>

          {/* AI Agent Chat */}
          <div className="bt-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div className="bt-row" style={{ marginBottom: "14px" }}>
                <MessageSquare size={16} style={{ color: "#4f46e5" }} />
                <h3
                  style={{
                    fontFamily: "var(--font-space-grotesk)",
                    fontSize: "15px",
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  Agent Clarification Chat
                </h3>
              </div>

              <div className="bt-chat-scroll">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`bt-chat-msg ${msg.role}`}>
                    <span className="bt-chat-msg-role">
                      {msg.role === "ai" ? "● Swarm Research Agent" : "You"}
                    </span>
                    {msg.text}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div
                style={{
                  borderTop: "1px solid #f1f5f9",
                  paddingTop: "14px",
                }}
              >
                <div className="bt-chat-input-row">
                  <input
                    type="text"
                    placeholder="Ask a clarification or request parameter change…"
                    className="bt-chat-input"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                  />
                  <button className="bt-primary" onClick={handleSendChat}>
                    <Send size={14} /> Send
                  </button>
                </div>

                <div className="bt-chat-actions">
                  <Link href="/backtests/bt_a3f7c2d1" style={{ flex: 1 }}>
                    <button className="bt-primary" style={{ width: "100%" }}>
                      Proceed to Backtest <ArrowRight size={14} />
                    </button>
                  </Link>
                  <button className="bt-secondary" style={{ flex: 1 }}>
                    Adjust Parameters
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
