export const SCANNER_STORAGE_KEY = "backtrack:market-scanner:v1";
export const SCANNER_STORAGE_VERSION = 1;

export type ScannerPreset = {
  id: string;
  name: string;
  universe: string;
  formulaId: string;
  parameters: Record<string, string | number | boolean>;
  start: string;
  end: string;
  updatedAt: string;
};

export type ScannerRecentRun = {
  id: string;
  universe: string;
  formulaId: string;
  parameters: Record<string, string | number | boolean>;
  matchCount: number;
  dataAsOf: string | null;
  coverageStatus: string;
  start: string;
  end: string;
  createdAt: string;
};

export type ScannerStorageState = {
  version: 1;
  presets: ScannerPreset[];
  recentRuns: ScannerRecentRun[];
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const EMPTY_STATE: ScannerStorageState = { version: SCANNER_STORAGE_VERSION, presets: [], recentRuns: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeState(value: unknown): ScannerStorageState {
  if (!isRecord(value) || value.version !== SCANNER_STORAGE_VERSION) return { ...EMPTY_STATE };
  const presets = Array.isArray(value.presets) ? value.presets.filter((item): item is ScannerPreset => {
    if (!isRecord(item)) return false;
    return isText(item.id) && isText(item.name) && isText(item.universe) && isText(item.formulaId) && isText(item.start) && isText(item.end) && isText(item.updatedAt) && isRecord(item.parameters);
  }) : [];
  const recentRuns = Array.isArray(value.recentRuns) ? value.recentRuns.filter((item): item is ScannerRecentRun => {
    if (!isRecord(item)) return false;
    return isText(item.id) && isText(item.universe) && isText(item.formulaId) && isRecord(item.parameters) && typeof item.matchCount === "number" && isText(item.start) && isText(item.end) && isText(item.createdAt);
  }) : [];
  return { version: SCANNER_STORAGE_VERSION, presets: presets.slice(0, 30), recentRuns: recentRuns.slice(0, 20) };
}

export function readScannerStorage(storage?: StorageLike | null): ScannerStorageState {
  if (!storage) return { ...EMPTY_STATE };
  try {
    const raw = storage.getItem(SCANNER_STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : { ...EMPTY_STATE };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export function writeScannerStorage(state: ScannerStorageState, storage?: StorageLike | null): void {
  if (!storage) return;
  try {
    storage.setItem(SCANNER_STORAGE_KEY, JSON.stringify(normalizeState(state)));
  } catch {
    // Private browsing and quota errors should not make the scanner unusable.
  }
}

export function upsertScannerPreset(state: ScannerStorageState, preset: ScannerPreset): ScannerStorageState {
  return { ...state, presets: [preset, ...state.presets.filter((item) => item.id !== preset.id)].slice(0, 30) };
}

export function removeScannerPreset(state: ScannerStorageState, id: string): ScannerStorageState {
  return { ...state, presets: state.presets.filter((item) => item.id !== id) };
}

export function addScannerRecentRun(state: ScannerStorageState, run: ScannerRecentRun): ScannerStorageState {
  return { ...state, recentRuns: [run, ...state.recentRuns.filter((item) => item.id !== run.id)].slice(0, 20) };
}

export function createScannerId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
