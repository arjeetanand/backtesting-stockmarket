"""
Technical Pattern & Strategy Finder for Historical Market Data (2000-2026)

This script:
1. Queries historical daily OHLCV stock data from the local SQLite database.
2. Focuses on banking stocks and major benchmark components (e.g. PNB, SBIN, HDFCBANK, ICICIBANK, ACC, ADANIENT, etc.).
3. Identifies historical target events: Stocks gaining >= 20% within 10 to 15 trading days.
4. Analyzes the technical setup prior to the surge (Volume RVOL, RSI, Moving Averages, Volatility contraction, 52-week high distance).
5. Uses Decision Trees & Feature Analysis to extract winning rules and prints pattern metrics (Win rate, Avg Gain, Expected Value).
"""

import json
import sqlite3
import pandas as pd
import numpy as np
from datetime import datetime
from pathlib import Path
from sklearn.tree import DecisionTreeClassifier, export_text

DB_PATH = Path("data/market_cache.sqlite3")

# Major banking & top benchmark stock list for initial scanning
TARGET_SYMBOLS = [
    "PNB", "SBIN", "HDFCBANK", "ICICIBANK", "BANKBARODA", "CANBK", "AXISBANK", "KOTAKBANK", "INDUSINDBK", "FEDERALBNK",
    "ACC", "ADANIENT", "ADANIPORTS", "ABB", "ABBOTINDIA", "AARTIIND", "AMBUJACEM", "APOLLOTYRE", "ASHOKLEY", "ASIANPAINT",
    "AUROPHARMA", "BAJAJ-AUTO", "BAJFINANCE", "BAJAJFINSV", "BEL", "BHARATFORG", "BPCL", "BHARTIARTL", "BHEL", "BIOCON",
    "BOSCHLTD", "BRITANNIA", "CIPLA", "COALINDIA", "COLPAL", "DLF", "DRREDDY", "EICHERMOT", "GAIL", "GRASIM",
    "HAVELLS", "HEROMOTOCO", "HINDALCO", "HINUNVR", "INFY", "IOC", "ITC", "JINDALSTEL", "JSWSTEEL", "LICHSGFIN",
    "LT", "LUPIN", "M&M", "MARUTI", "MCDOWELL-N", "NATIONALUM", "NMDC", "NTPC", "ONGC", "PEL",
    "POWERGRID", "RELIANCE", "SAIL", "SIEMENS", "SUNPHARMA", "TATACONSUM", "TATAMOTORS", "TATAPOWER", "TATASTEEL", "TCS",
    "TECHM", "TITAN", "ULTRACATE", "UPL", "VEDL", "VOLTAS", "WIPRO", "ZEEL"
]

def load_stock_df(conn: sqlite3.Connection, symbol: str) -> pd.DataFrame:
    """Extract and parse OHLCV time series for a single symbol from nse_bhavcopy_rows."""
    query = "SELECT trading_day, payload FROM nse_bhavcopy_rows WHERE symbol = ? ORDER BY trading_day ASC"
    cursor = conn.cursor()
    cursor.execute(query, (symbol,))
    rows = cursor.fetchall()
    
    records = []
    for day, raw_payload in rows:
        p = json.loads(raw_payload)
        try:
            records.append({
                "date": day,
                "open": float(p.get("OPEN", 0)),
                "high": float(p.get("HIGH", 0)),
                "low": float(p.get("LOW", 0)),
                "close": float(p.get("CLOSE", 0)),
                "volume": float(p.get("TOTTRDQTY", 0)),
            })
        except (ValueError, TypeError):
            continue
            
    df = pd.DataFrame(records)
    if df.empty:
        return df
    
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)
    return df

def calculate_technical_features(df: pd.DataFrame) -> pd.DataFrame:
    """Compute pre-move technical indicators."""
    df = df.copy()
    
    # Moving Averages
    df["sma_20"] = df["close"].rolling(window=20).mean()
    df["sma_50"] = df["close"].rolling(window=50).mean()
    df["sma_200"] = df["close"].rolling(window=200).mean()
    
    # Distance from Moving Averages
    df["dist_sma_20"] = (df["close"] - df["sma_20"]) / df["sma_20"]
    df["dist_sma_50"] = (df["close"] - df["sma_50"]) / df["sma_50"]
    df["dist_sma_200"] = (df["close"] - df["sma_200"]) / df["sma_200"]
    
    # 52-week (252 trading days) High / Low Distance
    df["high_52w"] = df["high"].rolling(window=252).max()
    df["dist_52w_high"] = (df["high_52w"] - df["close"]) / df["high_52w"]
    
    # Relative Volume (RVOL) = Today's Volume / 20-day Avg Volume
    df["vol_sma_20"] = df["volume"].rolling(window=20).mean()
    df["rvol"] = df["volume"] / (df["vol_sma_20"] + 1e-6)
    
    # RSI (14)
    delta = df["close"].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / (loss + 1e-6)
    df["rsi_14"] = 100 - (100 / (1 + rs))
    
    # Volatility Contraction / Consolidation (20-day High - Low range / Close)
    df["range_20d"] = (df["high"].rolling(20).max() - df["low"].rolling(20).min()) / df["close"]
    
    # Target: Forward Max Return within next 10 to 15 trading days
    df["forward_max_high_15d"] = df["high"].iloc[::-1].rolling(window=15, min_periods=10).max().iloc[::-1].shift(-15)
    df["forward_max_return"] = (df["forward_max_high_15d"] - df["close"]) / df["close"]
    
    # Binary Target: Gain >= 20% in next 10-15 days
    df["target_20pct_surge"] = (df["forward_max_return"] >= 0.20).astype(int)
    
    return df

def find_patterns():
    print(f"Connecting to database at {DB_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    
    all_feature_rows = []
    
    print("Extracting features across target symbols...")
    for symbol in TARGET_SYMBOLS:
        df = load_stock_df(conn, symbol)
        if len(df) < 300:
            continue
            
        df = calculate_technical_features(df)
        # Drop rows with NaNs in indicators
        valid_df = df.dropna(subset=[
            "dist_sma_20", "dist_sma_50", "dist_sma_200", 
            "dist_52w_high", "rvol", "rsi_14", "range_20d", "target_20pct_surge"
        ]).copy()
        
        valid_df["symbol"] = symbol
        all_feature_rows.append(valid_df)
        
    conn.close()
    
    if not all_feature_rows:
        print("No valid dataset extracted.")
        return
        
    dataset = pd.concat(all_feature_rows, ignore_index=True)
    features = ["dist_sma_20", "dist_sma_50", "dist_sma_200", "dist_52w_high", "rvol", "rsi_14", "range_20d"]
    
    # Replace infinities and extreme values with NaN then drop
    dataset[features] = dataset[features].replace([np.inf, -np.inf], np.nan)
    dataset = dataset.dropna(subset=features + ["target_20pct_surge"]).copy()
    
    print(f"\nExtracted total clean dataset of {len(dataset):,} daily setup instances across {len(TARGET_SYMBOLS)} stocks.")
    surge_count = dataset['target_20pct_surge'].sum()
    print(f"Total historical 20%+ surges found: {surge_count:,} ({surge_count / len(dataset) * 100:.2f}% of all days)")

    X = dataset[features]
    y = dataset["target_20pct_surge"]
    
    # Train shallow interpretable Decision Tree to extract high-confidence technical rules
    clf = DecisionTreeClassifier(max_depth=3, min_samples_leaf=200, random_state=42)
    clf.fit(X, y)
    
    print("\n" + "="*70)
    print(" DISCOVERED TECHNICAL PATTERN RULES FOR >= 20% GAIN IN 10-15 DAYS ")
    print("="*70)
    tree_rules = export_text(clf, feature_names=features)
    print(tree_rules)
    
    # Filter high-probability setup conditions
    high_vol_breakout = dataset[
        (dataset["rvol"] > 2.0) & 
        (dataset["dist_52w_high"] <= 0.05) & 
        (dataset["rsi_14"] >= 60)
    ]
    
    print("\n" + "="*70)
    print(" SAMPLE HIGH-CONVICTION PATTERN: VOLUME SURGE + 52-WEEK HIGH BREAKOUT ")
    print("="*70)
    total_setups = len(high_vol_breakout)
    if total_setups > 0:
        winners = high_vol_breakout['target_20pct_surge'].sum()
        win_rate = winners / total_setups * 100
        avg_gain = high_vol_breakout['forward_max_return'].mean() * 100
        print(f"Total Historical Triggers : {total_setups:,}")
        print(f"Historical Hit Rate (>20% gain in 15d): {win_rate:.2f}%")
        print(f"Average Max Move in 15d    : +{avg_gain:.2f}%\n")
        print("Sample Historical Occurrences:")
        print(high_vol_breakout[["symbol", "date", "close", "rvol", "rsi_14", "forward_max_return"]].head(10).to_string(index=False))

if __name__ == "__main__":
    find_patterns()
