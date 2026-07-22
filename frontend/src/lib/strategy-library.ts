export type StrategyLibraryEntry = {
  id: string;
  strategyId: string;
  name: string;
  family: string;
  badge: string;
  sourceLabel: string;
  sourceUrl: string;
  popularityNote: string;
  description: string;
  use: string;
  howItWorks: string;
  indicators: string[];
  entryRules: string[];
  exitRules: string[];
  riskRules: string[];
  assumptions: string[];
  defaults: { symbol: string; timeframe: "1day" | "1week" | "1month"; fast: number; slow: number };
};

/**
 * The single catalogue used by Research and the YouTube strategy page.
 *
 * Source links intentionally point to a YouTube community search rather than
 * claiming that one creator invented or endorses a rule. Performance numbers
 * are never stored here: the selected stock/date/cost inputs determine the
 * live backtest statistics shown after a run.
 */
export const STRATEGY_LIBRARY: StrategyLibraryEntry[] = [
  {
    id: "golden-cross",
    strategyId: "sma_crossover",
    name: "Golden Cross",
    family: "Trend following",
    badge: "Community favourite",
    sourceLabel: "YouTube community strategy family",
    sourceUrl: "https://www.youtube.com/results?search_query=golden+cross+trading+strategy",
    popularityNote: "Widely discussed long-term crossover",
    description: "A long-term SMA crossover for studying major trend changes.",
    use: "A slower signal that helps study extended market regimes.",
    howItWorks: "Buy when the 50-day SMA crosses above the 200-day SMA and exit on the reverse cross.",
    indicators: ["SMA 50", "SMA 200"],
    entryRules: ["Enter long on a 50 SMA cross above the 200 SMA."],
    exitRules: ["Exit on a 50 SMA cross below the 200 SMA."],
    riskRules: ["Long-only paper simulation with commission and slippage included."],
    assumptions: ["Signals are calculated after the close and filled on the next candle.", "A 200-candle warm-up is required before the first signal."],
    defaults: { symbol: "RELIANCE", timeframe: "1day", fast: 50, slow: 200 },
  },
  {
    id: "sma-crossover",
    strategyId: "sma_crossover",
    name: "20/50 SMA crossover",
    family: "Trend following",
    badge: "Core engine rule",
    sourceLabel: "YouTube community strategy family",
    sourceUrl: "https://www.youtube.com/results?search_query=20+50+sma+crossover+strategy",
    popularityNote: "Common beginner trend template",
    description: "A transparent moving-average crossover for medium-term trend research.",
    use: "A simple baseline for comparing stocks, timeframes, and costs.",
    howItWorks: "Buy when the 20-day SMA crosses above the 50-day SMA and exit on the reverse cross.",
    indicators: ["SMA 20", "SMA 50"],
    entryRules: ["Enter long when SMA 20 crosses above SMA 50."],
    exitRules: ["Exit when SMA 20 crosses below SMA 50."],
    riskRules: ["Review drawdown and losing streaks; no live order is placed."],
    assumptions: ["Signals use close T and fill at open T+1 to avoid look-ahead bias."],
    defaults: { symbol: "RELIANCE", timeframe: "1day", fast: 20, slow: 50 },
  },
  {
    id: "ema-crossover",
    strategyId: "ema_crossover",
    name: "20/50 EMA crossover",
    family: "Trend following",
    badge: "Frequently tested",
    sourceLabel: "YouTube community strategy family",
    sourceUrl: "https://www.youtube.com/results?search_query=20+50+ema+crossover+strategy",
    popularityNote: "Frequently used responsive trend setup",
    description: "A responsive medium-term trend signal with more weight on recent prices.",
    use: "Useful when comparing faster trend response against SMA rules.",
    howItWorks: "Buy when the 20-day EMA crosses above the 50-day EMA and exit on the reverse cross.",
    indicators: ["EMA 20", "EMA 50"],
    entryRules: ["Enter long when EMA 20 crosses above EMA 50."],
    exitRules: ["Exit when EMA 20 crosses below EMA 50."],
    riskRules: ["Costs are applied on every simulated entry and exit."],
    assumptions: ["Next-candle execution prevents look-ahead bias."],
    defaults: { symbol: "RELIANCE", timeframe: "1day", fast: 20, slow: 50 },
  },
  {
    id: "rsi-ema",
    strategyId: "rsi_ema",
    name: "RSI pullback + EMA filter",
    family: "Momentum / pullback",
    badge: "Popular momentum setup",
    sourceLabel: "YouTube community strategy family",
    sourceUrl: "https://www.youtube.com/results?search_query=rsi+ema+pullback+strategy",
    popularityNote: "Common RSI and trend-filter combination",
    description: "Looks for an oversold pullback while the broader EMA trend remains positive.",
    use: "Study whether pullbacks inside an uptrend have historically recovered.",
    howItWorks: "Buy below RSI 30 only when EMA 20 is above EMA 50; exit above RSI 70 or when the trend reverses.",
    indicators: ["RSI 14", "EMA 20", "EMA 50"],
    entryRules: ["Enter when RSI is below 30 and EMA 20 is above EMA 50."],
    exitRules: ["Exit when RSI is above 70 or EMA 20 falls below EMA 50."],
    riskRules: ["Stress-test RSI thresholds and review losing streaks."],
    assumptions: ["One long position is used with commission and slippage included."],
    defaults: { symbol: "RELIANCE", timeframe: "1day", fast: 20, slow: 50 },
  },
  {
    id: "rsi-mean-reversion",
    strategyId: "rsi_mean_reversion",
    name: "RSI mean reversion",
    family: "Mean reversion",
    badge: "Classic oscillator rule",
    sourceLabel: "YouTube community strategy family",
    sourceUrl: "https://www.youtube.com/results?search_query=rsi+mean+reversion+strategy",
    popularityNote: "Long-running oscillator study pattern",
    description: "Tests whether an oversold move tends to recover toward neutral momentum.",
    use: "Compare reversion behavior across volatile and ranging stocks.",
    howItWorks: "Buy when RSI is below 30 and exit when RSI returns above 50.",
    indicators: ["RSI 14"],
    entryRules: ["Enter when RSI falls below 30."],
    exitRules: ["Exit when RSI rises above 50."],
    riskRules: ["Mean reversion can fail during persistent downtrends."],
    assumptions: ["RSI thresholds are defaults and should be stress-tested."],
    defaults: { symbol: "TCS", timeframe: "1day", fast: 14, slow: 50 },
  },
  {
    id: "bollinger-reversion",
    strategyId: "bollinger_mean_reversion",
    name: "Bollinger Band reversion",
    family: "Mean reversion",
    badge: "Common retail setup",
    sourceLabel: "YouTube community strategy family",
    sourceUrl: "https://www.youtube.com/results?search_query=bollinger+bands+mean+reversion+strategy",
    popularityNote: "Common volatility-band study pattern",
    description: "Tests whether unusually weak closes revert toward a moving-average centre line.",
    use: "Explore volatility bands without treating a band touch as a guaranteed reversal.",
    howItWorks: "Buy below the lower Bollinger Band and exit when price returns above the middle band.",
    indicators: ["Bollinger Bands", "SMA 20"],
    entryRules: ["Enter when close falls below the lower Bollinger Band."],
    exitRules: ["Exit when close returns above the middle band."],
    riskRules: ["Review drawdown because bands can widen during persistent trends."],
    assumptions: ["Band width uses the engine's standard-deviation implementation."],
    defaults: { symbol: "TCS", timeframe: "1day", fast: 20, slow: 50 },
  },
  {
    id: "macd-crossover",
    strategyId: "macd_crossover",
    name: "MACD crossover",
    family: "Trend confirmation",
    badge: "Classic indicator",
    sourceLabel: "YouTube community strategy family",
    sourceUrl: "https://www.youtube.com/results?search_query=macd+crossover+strategy",
    popularityNote: "Classic momentum confirmation rule",
    description: "Uses a MACD line and signal-line cross to study momentum shifts.",
    use: "Compare momentum confirmation with moving-average-only rules.",
    howItWorks: "Buy when MACD crosses above its signal line and exit on the reverse cross.",
    indicators: ["MACD 12/26/9"],
    entryRules: ["Enter on a bullish MACD signal-line crossover."],
    exitRules: ["Exit on a bearish MACD signal-line crossover."],
    riskRules: ["This is a long-only historical simulation, not a recommendation."],
    assumptions: ["Standard MACD periods are used by the local engine."],
    defaults: { symbol: "INFY", timeframe: "1day", fast: 12, slow: 26 },
  },
  {
    id: "donchian-breakout",
    strategyId: "donchian_breakout",
    name: "Donchian breakout",
    family: "Breakout",
    badge: "Systematic trend setup",
    sourceLabel: "YouTube community strategy family",
    sourceUrl: "https://www.youtube.com/results?search_query=donchian+channel+breakout+strategy",
    popularityNote: "Widely discussed channel-breakout rule",
    description: "Tests whether a new rolling high can start a sustained move.",
    use: "Study breakout persistence and the cost of false breakouts.",
    howItWorks: "Buy above the previous rolling high and exit below the previous rolling low.",
    indicators: ["Donchian 50"],
    entryRules: ["Enter when close breaks above the prior rolling high."],
    exitRules: ["Exit when close breaks below the prior rolling low."],
    riskRules: ["Breakouts can create many small losses in sideways markets."],
    assumptions: ["Bands exclude the current candle to avoid look-ahead bias."],
    defaults: { symbol: "HDFCBANK", timeframe: "1day", fast: 20, slow: 50 },
  },
  {
    id: "momentum",
    strategyId: "momentum",
    name: "Price momentum",
    family: "Momentum",
    badge: "Simple persistence test",
    sourceLabel: "YouTube community strategy family",
    sourceUrl: "https://www.youtube.com/results?search_query=price+momentum+trading+strategy",
    popularityNote: "Simple lookback-return baseline",
    description: "Holds while the chosen lookback return is positive and exits when it turns negative.",
    use: "Create a simple baseline before testing more complex indicators.",
    howItWorks: "Buy when the lookback return is positive and exit when it turns negative.",
    indicators: ["Momentum 20"],
    entryRules: ["Enter when the selected lookback return is above zero."],
    exitRules: ["Exit when the selected lookback return falls below zero."],
    riskRules: ["Review sensitivity to lookback length and transaction costs."],
    assumptions: ["Signals execute on the next available candle."],
    defaults: { symbol: "HDFCBANK", timeframe: "1day", fast: 20, slow: 50 },
  },
];

export const STRATEGY_SOURCE_DISCLAIMER = "YouTube links are community search references, not endorsements. Popularity is not performance evidence; return, win rate, drawdown, and trade stats are calculated only after you choose the stock, dates, costs, and run a backtest.";
