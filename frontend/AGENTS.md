# Frontend agent instructions

Read the repository-level [AGENTS.md](../AGENTS.md) first. This file adds frontend-specific rules.

## Source of truth

- Route behavior belongs in `src/app/<route>/page.tsx`.
- Shared visual behavior belongs in `src/app/globals.css` or an appropriate shared component.
- API contracts must match `src/quant_research/api/schemas.py` and `src/quant_research/api/routes/api.py`.
- Use the current local NSE/SQLite API. Do not restore Yahoo or mock market data to hide missing backend data.

## UI rules

- Keep each page focused on one user job.
- Avoid duplicate calls-to-action for the same action.
- Provide loading, empty, error, and success states.
- Keep date ranges and selected symbols visible and understandable.
- Do not claim real-time prices; the current provider is daily historical NSE data.
- Preserve keyboard focus, responsive layout, readable tables, and mobile behavior.
- Use typed API responses and bounded request timeouts.

## Change workflow

1. Inspect the existing page and API contract.
2. Make the smallest coherent change.
3. Keep request effects deduplicated and protect against stale responses.
4. Run `npm --prefix frontend run build`.
5. Run the relevant backend API test when a contract or data flow changes.
6. Use the Browser workflow for rendered changes when available.

Do not commit `.next/`, `node_modules/`, `.env*`, SQLite files, ZIP archives, screenshots, or generated reports.
