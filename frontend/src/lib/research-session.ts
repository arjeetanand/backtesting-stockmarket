/** Keep only small Research session data in synchronous browser storage. */

export function buildResearchSessionSnapshot<
  T extends { backtest?: { _artifact_key?: string; run_id?: string } | null },
>(state: T): Omit<T, "backtest"> & { backtestArtifactKey: string | null; backtestRunId: string | null } {
  const { backtest, ...session } = state;
  return {
    ...session,
    backtestArtifactKey: backtest?._artifact_key ?? null,
    backtestRunId: backtest?.run_id ?? null,
  };
}
