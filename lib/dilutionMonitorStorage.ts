/** Browser localStorage for Dilution Monitor layout + watchlist. */

const SETTINGS_KEY = "dilution-monitor:settings:v1";
const WATCHLIST_KEY = "dilution-monitor:watchlist:v1";

export type DilutionMonitorSettings = {
  showPolygonColumn: boolean;
  showChart: boolean;
  showWatchlistColumn: boolean;
  enrichPolygonBadges: boolean;
};

export const DEFAULT_DILUTION_MONITOR_SETTINGS: DilutionMonitorSettings = {
  showPolygonColumn: true,
  showChart: true,
  showWatchlistColumn: true,
  enrichPolygonBadges: false,
};

export function loadDmSettings(): DilutionMonitorSettings {
  if (typeof window === "undefined") return DEFAULT_DILUTION_MONITOR_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_DILUTION_MONITOR_SETTINGS;
    const o = JSON.parse(raw) as Partial<DilutionMonitorSettings>;
    return { ...DEFAULT_DILUTION_MONITOR_SETTINGS, ...o };
  } catch {
    return DEFAULT_DILUTION_MONITOR_SETTINGS;
  }
}

export function saveDmSettings(s: DilutionMonitorSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode */
  }
}

export function loadWatchlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => String(x).trim().toUpperCase())
      .filter((t) => /^[A-Z]{1,6}$/.test(t));
  } catch {
    return [];
  }
}

export function saveWatchlist(symbols: string[]): void {
  try {
    const uniq = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(uniq));
  } catch {
    /* quota / private mode */
  }
}
