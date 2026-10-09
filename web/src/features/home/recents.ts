/**
 * Recents management for F1 Synapse session launcher.
 * Stores up to 5 recently viewed sessions in localStorage.
 */

export interface RecentSession {
  sessionId: string;
  eventName: string;
  round: number;
  year: number;
  type: string; // 'R' | 'Q' | 'S'
  lastViewed: number; // timestamp
}

const STORAGE_KEY = 'f1_recent_sessions';
const MAX_RECENTS = 5;

export function getRecentSessions(): RecentSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, MAX_RECENTS);
    }
  } catch (e) {
    console.warn('Failed to parse recent sessions:', e);
  }
  return [];
}

export function addRecentSession(session: Omit<RecentSession, 'lastViewed'>): RecentSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const current = getRecentSessions().filter((s) => s.sessionId !== session.sessionId);
    const updated: RecentSession[] = [
      { ...session, lastViewed: Date.now() },
      ...current,
    ].slice(0, MAX_RECENTS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.warn('Failed to save recent session:', e);
    return [];
  }
}

export function clearRecentSessions(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear recent sessions:', e);
  }
}
