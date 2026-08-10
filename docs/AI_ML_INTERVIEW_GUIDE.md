# Backtrack — AI/ML Interview Guide

This is the interview-focused companion to [COMPLETE_PROJECT_GUIDE.md](COMPLETE_PROJECT_GUIDE.md). It explains what Backtrack does, why the design choices matter, how the ML workflow works, what problems were solved, and how to discuss the project in an AI/ML interview.

## 1. The 60-second project explanation

> Backtrack is a local, research-only Indian-market backtesting application. It imports official NSE daily archives into SQLite, creates validated OHLCV data, runs deterministic strategy backtests, scans multiple stocks, and provides a chronological ML research lab. The ML system predicts forward returns from technical features using Ridge, Random Forest, and Histogram Gradient Boosting. The important design choice is avoiding look-ahead bias: features use information available at time `T`, labels are future returns, train/validation/test windows are chronological, model selection happens on validation data, and final evaluation happens on unseen test dates with commission, slippage, next-bar-open execution, and walk-forward diagnostics.

The product does not place trades. Every result is historical evidence, and missing NSE data produces an unavailable/import state rather than fabricated prices.

## 2. What problem the system solves

A user wants to answer questions such as:

- Did a strategy historically work on a stock?
- Did it outperform buy-and-hold?
- How much drawdown and trading cost did it experience?
- Is there enough local history to evaluate it?
- Can technical features explain or predict a later return on unseen dates?
- Are a scanner result or ML result robust enough to investigate further?

The system separates four concerns:

1. **Data quality:** import and validate official NSE daily archives.
2. **Deterministic research:** run transparent rules and backtests.
3. **ML research:** train and evaluate models without temporal leakage.
4. **Decision support:** expose metrics, warnings, risk, provenance, and limitations.

## 3. End-to-end architecture

```text
Official NSE daily ZIP
        ↓
Bulk importer → raw rows + normalized OHLCV + coverage metadata
        ↓
SQLite market cache
        ↓
FastAPI services
  ├─ deterministic backtest engine
  ├─ breakout and market scanner
  ├─ ML feature/model/evaluation service
  └─ watchlist status tracker
        ↓ JSON /api/v1
Next.js research UI
```

Important code locations:

- `src/quant_research/services/ml_research.py` — feature engineering, models, splits, metrics, forecast backtest, walk-forward evaluation.
- `src/quant_research/domain/backtesting/vector_engine.py` — deterministic rule strategies and next-bar execution.
- `src/quant_research/services/breakout_scanner.py` — 52-week, VCP, SMA rebound, and RSI setup detection.
- `src/quant_research/services/watchlist.py` — simulated setup tracking after the setup entry date.
- `src/quant_research/repositories/` — SQLite persistence and concurrency behavior.
- `frontend/src/app/ml-lab/page.tsx` — ML Lab UI.
- `frontend/src/app/market-scanner/page.tsx` — Market Scanner UI.

## 4. ML problem formulation

### Input

Validated daily OHLCV bars for one symbol and a selected date range.

### Features

The service creates 25 technical features per date, including:

- returns: 1-day, 5-day, and 20-day;
- trend distances: SMA 10/20/50/200 and EMA 12/26;
- volatility and volume: rolling volatility, volume change, relative volume;
- momentum: RSI 7/14, stochastic K/D, Williams %R;
- MACD line, signal, and difference;
- normalized ATR;
- Bollinger distances and %B.

Features are generated separately per symbol after sorting by symbol and date. Rolling indicators use past bars and `fillna=False`; warm-up rows and invalid values are dropped.

### Target

For horizon `h`, the label at time `T` is:

```text
forward_return(T, h) = close(T + h) / close(T) - 1
```

Predicting return instead of raw price is preferable because returns are more comparable across price levels and directly map to the research question.

### Why this is supervised regression

The target is continuous future return, so the main task is regression. The system also reports directional accuracy by checking whether actual and predicted returns have the same sign. Directional accuracy is useful for a trading interpretation, but it is not a replacement for return, RMSE, cost, or drawdown analysis.

## 5. Preventing look-ahead bias

This is the most important interview topic.

### Correct timeline

```text
Date T:      observe OHLCV and indicators → create features X(T)
Future T+h:  observe close(T+h)             → create label y(T)
Later dates: use model prediction and simulate execution
```

The target uses future data for training labels, but the target must never be included in features or used while making a same-date trading decision.

### Chronological split

The current defaults are 60% train, 20% validation, and 20% test by unique date:

```text
oldest dates                         newest dates
|---------------- train ----------------|---- validation ----|------ test ------|
                                      model selection       final evaluation
```

The service splits by dates rather than randomly splitting rows. This matters because random splitting can place future market regimes in training and earlier observations in testing, producing overly optimistic results.

### Execution timing

The ML forecast backtest uses the prior prediction to act at the next bar’s open. It applies slippage and commission. The deterministic backtest engine follows the same principle: signal after close `T`, fill at open `T+1`.

### Walk-forward evaluation

For longer histories, the service trains on an expanding past window and evaluates on the next later fold. It never trains on dates after the fold’s test window. If fewer than 240 unique dates exist, it reports that three folds are unavailable rather than inventing a stability result.

### Interview answer

> I prevent leakage in three places: feature construction uses only historical values, splitting is chronological by unique date, and execution uses the next bar rather than the bar that generated the signal. I also keep a final test window untouched during model selection and use expanding-window walk-forward evaluation for additional temporal validation.

## 6. Models and why they are included

The service evaluates a small, interpretable model set through scikit-learn Pipelines:

| Model | Why use it | Main trade-off |
| --- | --- | --- |
| Ridge | Regularized linear baseline for stable relationships between indicators and return | Misses nonlinear interactions |
| Random Forest | Captures nonlinear feature interactions with an ensemble of trees | Can be less smooth and less extrapolative for noisy returns |
| Histogram Gradient Boosting | Strong nonlinear boosting model with regularization | More sensitive to tuning and regime changes |
| Train-mean baseline | Predicts the average training return | Establishes whether ML beats a trivial reference |

Each model is wrapped in a `StandardScaler` plus estimator pipeline. Ridge benefits directly from scaling; keeping the same pipeline shape makes training and prediction consistent.

The selected ML model is the model with the lowest validation RMSE. The baseline is reported for comparison but is not selected as the final ML model.

### Bias-variance explanation

- Ridge generally has higher bias but lower variance.
- Random Forest can reduce variance through averaging trees, but individual trees may overfit noisy patterns.
- Gradient boosting reduces bias by sequentially correcting errors, but can overfit without depth, leaf-size, learning-rate, and regularization controls.
- Time-series regime changes mean that a model can be statistically good in one period and fail later; validation and walk-forward results are therefore essential.

## 7. Metrics and what they mean

The ML service reports:

- **MAE:** average absolute prediction error; easy to interpret in return units.
- **RMSE:** penalizes large errors more strongly; used for model selection.
- **Directional accuracy:** fraction of predictions with the correct positive/negative sign.
- **Correlation:** relationship between actual and predicted returns; unstable on small samples, so it is not used alone.
- **Strategy return:** simulated return after forecast-driven entries/exits.
- **Buy-and-hold return:** reference return over the same test window.
- **Maximum drawdown:** largest peak-to-trough decline in the simulated equity curve.
- **Trade count:** how often the forecast changed the simulated position.

### Good metric discussion

> I would not choose a model only because it has the highest directional accuracy. I would compare it with the train-mean baseline, inspect RMSE and correlation, then evaluate after costs against buy-and-hold, maximum drawdown, trade count, and walk-forward consistency. A tiny metric improvement with high turnover or unstable folds is not useful evidence.

## 8. Cost-aware forecast backtest

The forecast is not treated as a paper prediction only. The system simulates:

1. A positive previous prediction opens a long position at the next bar’s open.
2. A non-positive previous prediction closes the position at the next bar’s open.
3. Slippage adjusts execution price.
4. Commission is applied on entries and exits.
5. Equity is marked using the close and final positions are closed at the end.
6. Return, buy-and-hold, drawdown, and trade count are returned.

Example with simplified values:

```text
Previous prediction = +1.2%
Next open = ₹100
Slippage = 0.05%
Entry execution = ₹100.05
Commission = 0.10%
```

This is still a simplified research simulation. It does not model liquidity, partial fills, taxes, bid/ask spreads, or broker behavior.

## 9. Validation and failure handling

The ML service rejects or explains invalid experiments:

- start date must be before end date;
- train, validation, and test ratios must sum to 1;
- at least one supported model must be selected;
- horizon must be positive;
- at least 60 usable rows are required after indicator warm-up;
- each chronological split must have at least 20 rows;
- insufficient dates produce an explicit walk-forward message;
- missing local market data produces an unavailable error;
- unsupported timeframes remain unavailable rather than receiving synthetic data.

This is an important production-quality principle: an honest unavailable result is better than a complete-looking but invalid prediction.

## 10. Scanner and watchlist concepts

These surfaces are not the same as ML, and that distinction is useful in an interview.

### Market Scanner

The scanner evaluates deterministic strategies across many stocks from the local cache and returns sector aggregates plus a leaderboard. It is a rule-based quant service, not a trained model. Its Stitch-aligned UI now shows:

- technical criteria and universe controls;
- matching results, average strategy return, scanned sectors, and scan time;
- data-backed stock cards with strategy/buy-and-hold comparison;
- win rate, Sharpe ratio, drawdown, sector, and bar count;
- explicit empty/import and API-unavailable states.

### Breakout Scanner

The breakout service calculates deterministic setup signals such as 52-week proximity with relative volume, volatility contraction, SMA rebound, and RSI surge. It assigns a conviction score from explicit conditions. This is explainable feature logic, not a probability calibrated by a model.

### Watchlist

When a user bookmarks a setup, the watchlist stores entry price/date, target, stop, and status. Status is evaluated only on bars at or after the entry date. This fixed a subtle bug where a pre-entry historical high or low could incorrectly mark a new setup as already completed.

## 11. Problems solved in this project

Use these as STAR stories: Situation, Task, Action, Result.

### Story 1 — Preventing look-ahead bias

- **Situation:** A market research system can easily produce unrealistic results if future prices leak into features or same-bar execution.
- **Task:** Make strategy and ML evaluation historically honest.
- **Action:** Built past-only indicators, forward-return labels, chronological date splits, untouched test evaluation, next-bar-open execution, costs, and walk-forward folds.
- **Result:** The output includes warnings, costs, buy-and-hold comparison, drawdown, and stability information instead of presenting a raw prediction as a trading recommendation.

### Story 2 — Making SQLite safe under local concurrency

- **Situation:** Multiple local frontend instances could run previews and artifact writes at the same time, causing `database is locked` errors.
- **Task:** Improve reliability without changing persistence behavior.
- **Action:** Added a 30-second SQLite connection timeout and `PRAGMA busy_timeout = 30000` to the market-cache, backtest, and artifact repositories.
- **Result:** Retried concurrent research successfully and preserved the existing SQLite data model.

### Story 3 — Fixing watchlist temporal correctness

- **Situation:** Watchlist status checked the entire symbol history, including prices before the setup was saved.
- **Task:** Ensure target/stop status reflects only post-entry evidence.
- **Action:** Filtered bars by entry date and added a regression test with a pre-entry extreme.
- **Result:** The setup remains active until a later bar reaches its target or stop; the focused test passes.

### Story 4 — Building a trustworthy data path

- **Situation:** A stock research UI must still behave correctly when local history is missing.
- **Task:** Avoid fake prices and make data readiness clear.
- **Action:** Used official NSE archive-day imports, SQLite coverage, explicit 404/409/422/502/503 handling, and unavailable/import UI states.
- **Result:** Users can see exactly whether data is saved, missing, importing, or unavailable.

### Story 5 — Improving scanner and ML usability without changing APIs

- **Situation:** The original Scanner and ML Lab surfaces did not match the Stitch design or clearly communicate the relationship between configuration and evidence.
- **Task:** Improve the visual hierarchy while preserving backend behavior.
- **Action:** Added a Scanner criteria rail/KPI/card layout and an ML configuration rail/wide diagnostics layout, with responsive mobile styles and truthful empty states.
- **Result:** Desktop and approximately 390px mobile checks showed the correct composition without horizontal overflow; the production build passed.

### Story 6 — Resolving stale local runtime state

- **Situation:** New routes returned 404 even though their source files and sidebar links existed; multiple watchers also produced `EMFILE` errors.
- **Task:** Make local development and route discovery reliable.
- **Action:** Restarted stale backend/frontend processes, isolated `.next-port-*` directories, and enabled configurable Watchpack polling.
- **Result:** Watchlist and daily-sync routes rendered correctly and local route discovery became more reliable.

## 12. Common AI/ML interview questions and answer patterns

### Why not use random train/test split?

Because market observations are time-dependent. Random splitting can train on future regimes and evaluate on earlier regimes, which leaks temporal information. I use chronological date splits and expanding-window walk-forward evaluation.

### Why predict returns instead of prices?

Returns are scale-normalized, easier to compare across stocks, and directly map to the performance question. Raw prices are non-stationary and can make error metrics misleading.

### How do you handle missing values?

Technical indicators have warm-up periods. I leave indicator `fillna=False`, replace infinities with missing values, drop rows missing required features or labels, and reject the experiment if too few usable rows remain. I do not fill missing market prices with synthetic values.

### How do you select a model?

Train candidate models on the training window, compare them on the validation window using RMSE, select the best ML model, refit it on train plus validation, and evaluate once on the untouched test window. The train-mean baseline provides a sanity check.

### What is overfitting here?

The model may learn historical noise, a particular market regime, or accidental indicator relationships. Warning signs include strong train results but weak test results, unstable walk-forward folds, high turnover, and no improvement over buy-and-hold after costs. I address it with chronological validation, regularization, simple baselines, limited model complexity, and out-of-sample checks.

### What would you improve next?

- Add purged/embargoed time-series cross-validation for overlapping forward-return labels.
- Add regime-aware evaluation and per-regime metrics.
- Calibrate prediction thresholds instead of using only positive versus non-positive return.
- Add transaction-cost sensitivity and turnover constraints.
- Compare against stronger baselines such as momentum and volatility-scaled rules.
- Add experiment tracking for parameters, data coverage, code version, and reproducibility.
- Add feature importance or SHAP-style explanations with careful leakage review.
- Add a proper portfolio-level evaluation rather than only one-symbol experiments.

## 13. Quant and ML concepts to revise

Before an interview, be ready to explain:

- supervised learning, regression, classification, and ranking;
- bias versus variance and regularization;
- train/validation/test roles;
- time-series leakage and look-ahead bias;
- stationarity, returns, volatility, and regime change;
- rolling indicators and warm-up windows;
- RMSE, MAE, correlation, directional accuracy, Sharpe ratio, and maximum drawdown;
- transaction costs, slippage, turnover, and next-bar execution;
- random forests versus gradient boosting;
- feature scaling and why it matters for Ridge more than trees;
- walk-forward validation and out-of-sample testing;
- reproducibility, caching, deterministic seeds, and data provenance;
- why a model with good prediction error may still be a poor trading strategy.

## 14. Example interview walkthrough

If asked to explain one ML run:

1. I select `RELIANCE`, daily bars, a date range, a five-day horizon, and candidate models.
2. The local provider returns validated NSE OHLCV bars.
3. I sort and de-duplicate by symbol/date and compute 25 past-only technical features.
4. The label is the five-day forward close-to-close return.
5. I remove indicator warm-up and invalid rows.
6. I split unique dates chronologically into train, validation, and test windows.
7. I fit Ridge, Random Forest, and Histogram Gradient Boosting on train only.
8. I select the lowest validation RMSE, refit on train plus validation, and predict the unseen test window.
9. I report MAE, RMSE, directional accuracy, correlation, strategy return, buy-and-hold, drawdown, trades, and walk-forward folds.
10. I explain that the result is historical research, includes costs and next-bar execution, and is not an investment recommendation.

## 15. Strong closing statement

> The core engineering lesson from Backtrack is that an ML result is only useful when the data contract, temporal validation, execution assumptions, persistence, and user-facing limitations are trustworthy. I focused on preventing false confidence: no future leakage, no fabricated prices, explicit baselines, cost-aware evaluation, regression tests for temporal bugs, and UI states that distinguish a real result from unavailable local history.
