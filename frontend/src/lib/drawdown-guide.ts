export type DrawdownBar = {
  timestamp: string;
  low: number;
  close: number;
  volume: number;
};

export function summarizeRecentDrawdown(bars: readonly DrawdownBar[], sessions = 20) {
  if (bars.length < 2 || sessions < 1) return null;

  const latest = bars[bars.length - 1];
  const previous = bars[bars.length - 2];
  const recent = bars.slice(-sessions);
  const returnStart = Math.max(1, bars.length - sessions);
  const worstSession = bars.slice(returnStart).reduce((worst, bar, offset) => {
    const previousBar = bars[returnStart + offset - 1];
    const changePct = (bar.close / previousBar.close - 1) * 100;
    return !worst || changePct < worst.changePct ? { timestamp: bar.timestamp, changePct } : worst;
  }, null as { timestamp: string; changePct: number } | null);
  const priorVolumes = bars.slice(-sessions - 1, -1).map((bar) => bar.volume);
  const averagePriorVolume = priorVolumes.length === sessions
    ? priorVolumes.reduce((sum, volume) => sum + volume, 0) / sessions
    : null;
  const recentHighClose = Math.max(...recent.map((bar) => bar.close));
  const lastFive = bars.slice(-5);
  const lastFiveVolume = lastFive.length === 5
    ? lastFive.reduce((sum, bar) => sum + bar.volume, 0)
    : null;

  return {
    latest,
    latestChangePct: previous.close > 0 ? (latest.close / previous.close - 1) * 100 : null,
    worstSession,
    drawdownFromRecentHighPct: recentHighClose > 0
      ? (latest.close / recentHighClose - 1) * 100
      : null,
    averagePriorVolume,
    latestVolumeRatio: averagePriorVolume && averagePriorVolume > 0 ? latest.volume / averagePriorVolume : null,
    lastFiveVolume,
    lastFiveAverageVolume: lastFiveVolume == null ? null : lastFiveVolume / 5,
    lastFiveVsPriorAverage: averagePriorVolume && averagePriorVolume > 0 && lastFiveVolume != null
      ? lastFiveVolume / 5 / averagePriorVolume
      : null,
  };
}

export function calculatePaperPositionSize(entry: number, stop: number, maxLoss: number, allocationCap: number) {
  if (![entry, stop, maxLoss, allocationCap].every(Number.isFinite) || entry <= 0 || stop <= 0 || maxLoss <= 0 || allocationCap <= 0 || stop >= entry) {
    return null;
  }

  const riskPerShare = entry - stop;
  if (!Number.isFinite(riskPerShare) || riskPerShare <= 0) return null;
  const shares = Math.min(Math.floor(maxLoss / riskPerShare), Math.floor(allocationCap / entry));
  const positionValue = shares * entry;
  const modeledLoss = shares * riskPerShare;
  if (!Number.isSafeInteger(shares) || !Number.isFinite(positionValue) || !Number.isFinite(modeledLoss)) return null;

  return {
    shares,
    riskPerShare,
    positionValue,
    modeledLoss,
  };
}
