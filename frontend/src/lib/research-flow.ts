export type ResearchReadiness = {
  hasProposal: boolean;
  reviewConfirmed: boolean;
  hasLocalData: boolean;
  supportedTimeframe: boolean;
  isBusy: boolean;
  importComplete: boolean;
};

export function canRunHistoricalTest(state: ResearchReadiness): boolean {
  return state.hasProposal
    && state.reviewConfirmed
    && state.hasLocalData
    && state.supportedTimeframe
    && !state.isBusy
    && state.importComplete;
}
