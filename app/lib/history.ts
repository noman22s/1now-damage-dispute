/**
 * Lightweight dispute history stored in localStorage.
 * Saves a snapshot when the operator generates a dispute message so they can
 * reload past cases. No backend, no auth — runs entirely in the browser.
 */

export type HistoryEntry = {
  id: string;
  savedAt: string; // ISO
  vehicleLabel: string;
  renterName: string;
  tripStartDate: string;
  tripEndDate: string;
  mode: "guest_direct" | "turo_claim";
  totalLow: number;
  totalHigh: number;
  findingsCount: number;
  summary: string;
  disputeSubject: string;
};

const KEY = "ddp_history_v1";
const MAX_ENTRIES = 20;

function safeRead(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function safeWrite(arr: HistoryEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {
    // out of quota or disabled — silently ignore
  }
}

export function loadHistory(): HistoryEntry[] {
  return safeRead();
}

export function saveHistory(entry: HistoryEntry) {
  const all = safeRead();
  // dedup by id
  const filtered = all.filter((e) => e.id !== entry.id);
  filtered.unshift(entry);
  safeWrite(filtered.slice(0, MAX_ENTRIES));
}

export function deleteEntry(id: string) {
  safeWrite(safeRead().filter((e) => e.id !== id));
}

export function clearHistory() {
  safeWrite([]);
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
