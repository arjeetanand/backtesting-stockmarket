# Backtrack product brief

## Product and audience

Backtrack is a personal, local research workspace for Indian equities. It helps one user turn a market idea into an explicit strategy rule, test it against official NSE daily history, and inspect the historical result.

## Primary job

Move from an idea to evidence in one guided flow:

1. Describe the idea and choose a listed symbol and date range.
2. Review the proposed rule, assumptions, and risks.
3. Confirm the needed NSE history is available locally or import it.
4. Run a cost-aware historical simulation and inspect its chart, trades, and metrics.
5. Challenge the result with the existing reliability and validity tools.

## Confirmed constraints

- The app is for personal local use; it does not support multiple users or accounts.
- Historical research only. Do not add live prices, broker connections, or real-money order execution.
- Use official NSE daily archives for the current market-data path. Missing history must remain unavailable until imported; never invent candles or results.
- Optional local model output and extracted strategy rules are drafts. The user reviews them before a backtest.
- Backtests and replay orders are simulations, not predictions or financial advice.
- Keep the interface simple, with the existing light indigo visual direction and a single guided research flow.

## Success and failure

Success means the user can understand and complete the idea-to-backtest workflow from one clear screen, see where its data and assumptions came from, and find the deeper checks without losing their place. It fails if the app implies independent agents ran when they did not, hides missing data, or presents a historical return as a forecast or executable trade.
