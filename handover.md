# Backtrack end-to-end handover

Last reviewed: 2026-07-22

This is the operational handoff for the Backtrack research and backtesting workspace. Read this document before changing provider logic, strategy execution, trader-facing risk language, or release checks.

For a complete webpage-by-webpage frontend code reference, see [FRONTEND_CODEBASE_SUMMARY.md](file:///Users/arjeetanand/Library/CloudStorage/OneDrive-OracleCorporation/projects/backtrack/FRONTEND_CODEBASE_SUMMARY.md).

## 1. Product boundary

Backtrack is a research and paper-simulation product. It is designed to answer:

> “If I had applied this defined strategy to this instrument, timeframe, capital, and date range, what would the simulated result have been?”

It is not a broker terminal. The repository currently has no order-placement, account, portfolio-sync, or live-trading code. Do not add live execution as a side effect of a backtest feature. Live trading would require a separate authorization, approval, audit, kill-switch, and compliance design.

## 2. End-to-end architecture

```text
Browser / Next.js UI
  ├─ Dashboard and local five-module swarm demo
  ├─ Strategy and YouTube review surfaces
  ├─ Options education/calculator
  └─ Data, analytics, risk, settings pages
          │ HTTP / JSON
          ▼
FastAPI /api/v1
  ├─ Settings + dependency container
  ├─ Provider routes: health, providers, market-data
  ├─ Research routes: hypothesis, YouTube strategy
  └─ Backtest routes: SMA crossover, list/read in-memory runs
          │
          ▼
Application services
  ├─ ResearchService
  ├─ SMA backtest engine
  ├─ MarketDataValidator
  ├─ HypothesisService + Ollama adapter
  └─ YouTube extraction service
          │
          ▼
Provider adapters / repositories
  ├─ YahooFinanceClient: keyless historical OHLCV for research
  └─ InMemoryBacktestRepository: local-session run storage
```

### Important implementation distinction

The five swarm agents in `frontend/src/lib/agents/` are composable in-process modules used to make the dashboard workflow auditable and understandable. They are not five independent Python workers or five remote LLM agents. This is the correct local-development shape: deterministic, fast, and easy to test. A production job queue can later move these responsibilities into separately observable workers without changing the user-facing contract.

## 3. Five-agent ownership

### Agent 1 — Product surfaces

Owns:

- `frontend/src/app/`
- `frontend/src/components/layout/`
- `frontend/src/components/ui/`
- shared trader styles in `frontend/src/app/globals.css`

Responsibilities:

- Complete each route with an obvious trader task.
- Preserve loading, empty, error, and success states.
- Keep provider credentials out of browser code.
- Verify desktop and approximately 390px mobile layouts.

Handoff output: route changes, screenshots/observations, lint/build evidence, and any new API fields required.

### Agent 2 — Market-data backend

Owns:

- `src/quant_research/data_providers/`
- `src/quant_research/api/config.py`
- `src/quant_research/api/container.py`
- `src/quant_research/api/routes/api.py`
- provider-related schemas and tests

Responsibilities:

- Keep the historical-data path keyless and broker-free.
- Normalize external payloads into project models.
- Reject invalid, empty, unsorted, or ambiguous data.
- Add providers behind the provider protocol.
- Document rate limits, symbol identifiers, timeframe semantics, and response changes.

Current priority: keep the Yahoo Finance historical adapter reliable, transparent about its limits, and strictly separated from broker execution or real-time market feeds.

### Agent 3 — Test and release steward

Owns:

- `TESTING.md`
- `tests/`
- regression and smoke evidence
- release notes in this file

Responsibilities:

- Run the backend and frontend gates before handoff.
- Add a regression test for every provider, calculation, or route bug.
- Record environment assumptions and known limitations.
- Never store real tokens, account information, or unredacted provider payloads in test fixtures.

### Agent 4 — Strategy research and import

Owns:

- `src/quant_research/services/youtube_strategy.py`
- `frontend/src/app/strategy-import/page.tsx`
- future strategy DSL/compiler integration

Responsibilities:

- Convert a URL/transcript into a structured draft, not an executable order.
- Keep detected entry, exit, risk rules, assumptions, source URL, and confidence visible.
- Require human review before compiling imported rules into a backtest.
- Treat captions and creator claims as untrusted research input.

Current limitation: the importer uses an optional `yt-dlp` import for metadata and relies on pasted transcript text for deterministic extraction. It does not perform audio transcription.

### Agent 5 — Trader education and risk UX

Owns:

- `frontend/src/app/options/page.tsx`
- `frontend/src/app/analytics/page.tsx`
- `frontend/src/app/bias-validity/page.tsx`
- risk wording and assumptions across the UI

Responsibilities:

- Explain option payoff, premium, strike, breakeven, max loss, expiry, lot size, and margin concepts.
- Show the difference between backtest metrics and future performance.
- Keep uncertainty and execution assumptions next to the result.
- Never turn educational output into a recommendation.

### Replay Product Agent — Cross-cutting implementation role

Owns the proposed replay vertical slice described in [REPLAY_IMPLEMENTATION_PLAN.md](REPLAY_IMPLEMENTATION_PLAN.md).

Responsibilities:

- Translate trader-casa/replay-style workflows into Backtrack requirements.
- Keep manual replay and automated backtesting as separate, clearly labeled modes.
- Coordinate chart, server-authoritative cursor, simulated order matching, journal, analytics, and paper-mode boundaries.
- Never allow future candles or client-supplied timestamps to advance a secure replay session.

This is currently a documented product/engineering role, not a separately deployed remote worker. The first implementation should be owned by one engineer/agent across frontend and backend until the replay contract is stable.

## 4. Source-of-truth file map

| Concern | Source of truth |
| --- | --- |
| Runtime settings | `src/quant_research/api/config.py` |
| Dependency selection | `src/quant_research/api/container.py` |
| API contracts | `src/quant_research/api/schemas.py` and `src/quant_research/api/routes/api.py` |
| Provider interface | `src/quant_research/data_providers/base.py` |
| Historical-data integration | `src/quant_research/data_providers/yahoo_finance.py` |
| Data validation | `src/quant_research/domain/data/validator.py` |
| Backtest service | `src/quant_research/services/research.py` |
| SMA execution | `src/quant_research/services/sma_backtest.py` |
| Result models | `src/quant_research/domain/backtesting/models.py` |
| YouTube extraction | `src/quant_research/services/youtube_strategy.py` |
| Local swarm | `frontend/src/lib/agents/orchestrator.ts` |
| UI routes | `frontend/src/app/*/page.tsx` |
| Verification contract | `TESTING.md` |
| Chart replay roadmap | `REPLAY_IMPLEMENTATION_PLAN.md` |

## 5. Environment and provider handoff

Copy `.env.example` to `.env` at the repository root:

```dotenv
CORS_ORIGINS=http://localhost:3000
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b
```

Yahoo Finance historical data is the only configured backtest provider. It does not need credentials. The adapter maps common Indian symbols to Yahoo tickers (`RELIANCE → RELIANCE.NS`, `NIFTY 50 → ^NSEI`); add mappings only when they are verified against returned historical bars.

The frontend reads `NEXT_PUBLIC_API_BASE_URL` only from frontend build-time environment. Put that variable in `frontend/.env.local` when overriding the default backend URL. It must contain a URL, never a secret.

## 6. API handoff contract

All routes are under `/api/v1`:

| Method and path | Purpose | Provider required |
| --- | --- | --- |
| `GET /health` | Service/provider configuration status without secrets | No |
| `GET /providers` | Provider capabilities and configuration state | No |
| `GET /market-data` | Validated historical OHLCV bars | Keyless Yahoo Finance |
| `POST /backtests/sma-crossover` | Long-only SMA crossover simulation | Yes |
| `GET /backtests` | Runs from current server session | No |
| `GET /backtests/{run_id}` | One run from current server session | No |
| `POST /research/hypothesis` | Ollama reviewable suggestion | Ollama for a useful result |
| `POST /strategy/youtube` | Reviewable rules from URL/transcript | No when transcript is supplied |

Expected error semantics:

- `422`: invalid request or research parameters.
- `404`: unknown in-memory run ID.
- `502`: upstream provider/LLM failure.
- `503`: free historical source is temporarily unavailable.

## 7. Delivery sequence

1. Agent 2 adds or changes provider contracts and fake-opener/provider tests.
2. Agent 4 adds extraction/strategy changes with fixture-based transcript tests.
3. Agent 1 connects approved API contracts to loading/error/success UI states.
4. Agent 5 reviews every new metric and educational claim for risk clarity.
5. Agent 3 runs the complete `TESTING.md` checklist and records evidence.
6. The release owner reviews security, secrets, provider limits, and known limitations.

Do not merge a UI page that implies exchange-grade live data. Do not merge imported strategy execution without a human-review state and explicit assumptions.

## 8. Release checklist

- [ ] `.env` is not committed and all logs/screenshots are redacted.
- [ ] Yahoo symbol mappings and timeframe limitations are verified.
- [ ] `venv/bin/pytest -q` passes.
- [ ] `venv/bin/ruff check src tests` passes.
- [ ] `venv/bin/mypy src` passes.
- [ ] `npm run lint` passes with no new warnings.
- [ ] `npm run build -- --webpack` passes.
- [ ] `/health` and `/providers` return expected configuration state.
- [ ] Free-data outages return an explicit error rather than fabricated data.
- [ ] Backtest output shows execution, commission, slippage, and risk assumptions.
- [ ] Dashboard interaction, YouTube import, options calculator, settings, analytics, and mobile layout are manually checked.
- [ ] Backtest results are described as simulations, not recommendations.
- [ ] Deployment has a durable repository, job model, monitoring, and backup plan before multi-user use.

## 9. Known limitations and next work

- Backtest persistence is in-memory and resets on restart.
- The current public backtest endpoint exposes SMA crossover; imported YouTube rules are not yet compiled into the strategy DSL automatically.
- The frontend swarm is local/deterministic; production orchestration needs queued jobs and persisted agent events.
- Free historical data is not an exchange-grade or real-time feed; availability and intraday coverage can change.
- Options Lab does not yet model IV, Greeks, taxes, brokerage, margin, spreads, slippage, or expiry settlement in full.
- YouTube extraction does not perform speech-to-text and cannot verify creator claims.
- A production deployment needs authentication, authorization, rate limiting, audit logs, secret management, durable storage, observability, and a clear market-data licensing review.

## 10. Handoff record template

Every agent should append a short record to the next change request:

```text
Date:
Agent:
Changed files:
User-visible behavior:
API/provider changes:
Commands run:
Test evidence:
Known limitations:
Next owner/action:
```
