import {
  ApiError,
  SessionMeta,
  TrackGeometry,
  LapRow,
  Stint,
  RaceControlMessage,
  WeatherSample,
  HealthResponse,
  RaceEvent,
  MlTimelines,
  RoundSummary,
  CacheStatusResponse,
  SessionLoadRequest,
  SessionLoadResponse,
  JobStatus,
  QualiResultsResponse,
  QualiTelemetryResponse,
  SettingsResponse,
  SettingsUpdateRequest,
  ClearCacheResponse,
} from './types';

/* ───────────── Static demo mode (hosted build, no Python backend) ─────────────
 * Built with VITE_DEMO_MODE=1. Every request is served from files exported by
 * scripts/export_static_demo.py into public/demo/<sid>/, listed in demo/index.json.
 */
export interface DemoSession {
  sessionId: string;
  year: number;
  round: number;
  type: string;
  eventName: string;
  circuitName: string;
  country: string;
  date: string;
  totalLaps: number;
  numChunks: number;
}

export function isDemoMode(): boolean {
  return import.meta.env.VITE_DEMO_MODE === '1';
}

let demoManifest: Promise<DemoSession[]> | null = null;
export function getDemoSessions(): Promise<DemoSession[]> {
  if (!demoManifest) {
    demoManifest = fetch('/demo/index.json')
      .then((r) => (r.ok ? r.json() : { sessions: [] }))
      .then((j: { sessions?: DemoSession[] }) => j.sessions ?? [])
      .catch(() => {
        demoManifest = null;
        return [];
      });
  }
  return demoManifest;
}

export const DEMO_UNAVAILABLE_MESSAGE =
  'This session is not part of the online demo. Processing new sessions needs the local backend ' +
  '(GPU + FastF1); pick one of the preloaded races marked as cached.';

const DEMO_SETTINGS: SettingsResponse = {
  cacheLocation: '(hosted demo, read-only)',
  computedDataLocation: 'demo/',
  cacheSizeBytes: 0,
  cacheSizeMb: 0,
  cacheExists: true,
  dataExists: true,
};

/** Fetches a binary or JSON payload that may be stored gzipped (".gz") on the static host. */
export async function fetchMaybeGzip(path: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(path, { signal });
  if (!res.ok) throw new ApiError(res.status, `Failed to load ${path}`);
  const buf = await res.arrayBuffer();
  const b = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  // Host may already have decoded it (Content-Encoding: gzip) — only gunzip real gzip bytes.
  if (b[0] === 0x1f && b[1] === 0x8b) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).arrayBuffer();
  }
  return buf;
}

/** Base URL for static session files, or null when talking to the live API. */
function staticBase(sid: string): string | null {
  if (isDemoMode()) return `/demo/${encodeURIComponent(sid)}`;
  if (isFixtureMode()) return `/fixtures/${getFixtureName()}`;
  return null;
}

export function isFixtureMode(): boolean {
  if (isDemoMode()) return true;
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('fixture') || !!window.localStorage.getItem('f1_fixture');
}

export function getFixtureName(): string {
  if (typeof window === 'undefined') return 'suzuka-2026-r3';
  const params = new URLSearchParams(window.location.search);
  return params.get('fixture') || window.localStorage.getItem('f1_fixture') || 'suzuka-2026-r3';
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal });
  if (!res.ok) {
    let payload;
    try {
      payload = await res.json();
    } catch {
      // Not JSON
    }
    throw new ApiError(res.status, payload);
  }
  return res.json() as Promise<T>;
}

type QualiTelemetryFile = Record<string, Record<string, QualiTelemetryResponse>>;
const qualiTelemetryCache = new Map<string, Promise<QualiTelemetryFile>>();

/** All drivers' quali telemetry in one static file (gzipped in demo mode); fetched once per session. */
function loadAllQualiTelemetry(sid: string, signal?: AbortSignal): Promise<QualiTelemetryFile> {
  const url = isDemoMode()
    ? `/demo/${encodeURIComponent(sid)}/quali_telemetry.json.gz`
    : `/fixtures/${getFixtureName()}/quali_telemetry.json`;
  let p = qualiTelemetryCache.get(url);
  if (!p) {
    p = fetchMaybeGzip(url, signal).then((buf) => JSON.parse(new TextDecoder().decode(buf)));
    p.catch(() => qualiTelemetryCache.delete(url));
    qualiTelemetryCache.set(url, p);
  }
  return p;
}

export const api = {
  async getHealth(signal?: AbortSignal): Promise<HealthResponse> {
    if (isFixtureMode()) {
      return { status: 'ok', version: 'fixture-mode' };
    }
    return request<HealthResponse>('/api/health', signal);
  },

  async getSessionMeta(sid: string, signal?: AbortSignal): Promise<SessionMeta> {
    const base = staticBase(sid);
    if (base) return request<SessionMeta>(`${base}/meta.json`, signal);
    return request<SessionMeta>(`/api/sessions/${encodeURIComponent(sid)}/meta`, signal);
  },

  async getTrackGeometry(sid: string, signal?: AbortSignal): Promise<TrackGeometry> {
    const base = staticBase(sid);
    if (base) return request<TrackGeometry>(`${base}/track.json`, signal);
    return request<TrackGeometry>(`/api/sessions/${encodeURIComponent(sid)}/track`, signal);
  },

  async getLaps(sid: string, signal?: AbortSignal): Promise<LapRow[]> {
    const base = staticBase(sid);
    if (base) return request<LapRow[]>(`${base}/laps.json`, signal);
    return request<LapRow[]>(`/api/sessions/${encodeURIComponent(sid)}/laps`, signal);
  },

  async getStints(sid: string, signal?: AbortSignal): Promise<Stint[]> {
    const base = staticBase(sid);
    if (base) return request<Stint[]>(`${base}/stints.json`, signal);
    return request<Stint[]>(`/api/sessions/${encodeURIComponent(sid)}/stints`, signal);
  },

  async getRaceControl(sid: string, signal?: AbortSignal): Promise<RaceControlMessage[]> {
    const base = staticBase(sid);
    if (base) return request<RaceControlMessage[]>(`${base}/race_control.json`, signal);
    return request<RaceControlMessage[]>(`/api/sessions/${encodeURIComponent(sid)}/race-control`, signal);
  },

  async getWeather(sid: string, signal?: AbortSignal): Promise<WeatherSample[]> {
    const base = staticBase(sid);
    if (base) return request<WeatherSample[]>(`${base}/weather.json`, signal);
    return request<WeatherSample[]>(`/api/sessions/${encodeURIComponent(sid)}/weather`, signal);
  },

  async getEvents(sid: string, signal?: AbortSignal): Promise<RaceEvent[]> {
    const base = staticBase(sid);
    if (base) return request<RaceEvent[]>(`${base}/events.json`, signal);
    return request<RaceEvent[]>(`/api/sessions/${encodeURIComponent(sid)}/events`, signal);
  },

  async getMlTimelines(sid: string, signal?: AbortSignal): Promise<MlTimelines> {
    const base = staticBase(sid);
    if (base) return request<MlTimelines>(`${base}/ml.json`, signal);
    return request<MlTimelines>(`/api/sessions/${encodeURIComponent(sid)}/ml`, signal);
  },

  async getSeasonSchedule(year: number, signal?: AbortSignal): Promise<RoundSummary[]> {
    if (isDemoMode()) {
      const rounds = new Map<number, RoundSummary>();
      for (const d of await getDemoSessions()) {
        if (d.year !== year || rounds.has(d.round)) continue;
        rounds.set(d.round, {
          round: d.round,
          name: d.eventName,
          country: d.country,
          location: d.circuitName,
          date: d.date,
          sessions: ['Qualifying', 'Race'],
        });
      }
      return [...rounds.values()].sort((a, b) => a.round - b.round);
    }
    if (isFixtureMode()) {
      return [
        {
          round: 3,
          name: 'Japanese Grand Prix',
          country: 'Japan',
          location: 'Suzuka',
          date: `${year}-04-07`,
          sessions: ['FP1', 'FP2', 'FP3', 'Qualifying', 'Race'],
        },
      ];
    }
    return request<RoundSummary[]>(`/api/seasons/${year}/schedule`, signal);
  },

  async getCacheStatus(year?: number, signal?: AbortSignal): Promise<CacheStatusResponse> {
    if (isDemoMode()) {
      const all = (await getDemoSessions()).filter((d) => year === undefined || d.year === year);
      const roundNums = [...new Set(all.map((d) => d.round))];
      return {
        rounds: roundNums.map((round) => ({
          round,
          sessions: ['FP1', 'FP2', 'FP3', 'Q', 'R'].map((type) => ({
            type,
            cached: all.some((d) => d.round === round && d.type === type),
          })),
        })),
      };
    }
    if (isFixtureMode()) {
      return {
        rounds: [
          {
            round: 3,
            sessions: [
              { type: 'FP1', cached: false },
              { type: 'FP2', cached: false },
              { type: 'FP3', cached: false },
              { type: 'Q', cached: true },
              { type: 'R', cached: true },
            ],
          },
        ],
      };
    }
    const q = year !== undefined ? `?year=${year}` : '';
    return request<CacheStatusResponse>(`/api/cache/status${q}`, signal);
  },

  async loadSession(req: SessionLoadRequest, signal?: AbortSignal): Promise<SessionLoadResponse> {
    if (isDemoMode()) {
      const type = req.type ?? 'R';
      const hit = (await getDemoSessions()).find(
        (d) => d.year === req.year && d.round === req.round && d.type === type,
      );
      if (!hit) throw new Error(DEMO_UNAVAILABLE_MESSAGE);
      return { jobId: 'ready', sessionId: hit.sessionId };
    }
    const res = await fetch('/api/sessions/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new ApiError(res.status, payload);
    }
    return res.json() as Promise<SessionLoadResponse>;
  },

  async getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobStatus> {
    if (isDemoMode()) throw new Error(DEMO_UNAVAILABLE_MESSAGE);
    return request<JobStatus>(`/api/jobs/${encodeURIComponent(jobId)}`, signal);
  },

  async getQualiResults(sid: string, signal?: AbortSignal): Promise<QualiResultsResponse> {
    const base = staticBase(sid);
    if (base) return request<QualiResultsResponse>(`${base}/quali_results.json`, signal);
    return request<QualiResultsResponse>(`/api/sessions/${encodeURIComponent(sid)}/quali/results`, signal);
  },

  async getQualiTelemetry(
    sid: string,
    driver: string,
    segment: string = 'Q3',
    signal?: AbortSignal,
  ): Promise<QualiTelemetryResponse> {
    if (isFixtureMode()) {
      const allTelem = await loadAllQualiTelemetry(sid, signal);
      const drv = allTelem[driver];
      if (!drv || !drv[segment]) {
        throw new ApiError(404, { error: { code: 'driver_not_found', message: `Driver ${driver} in ${segment} not found` } });
      }
      return {
        driver,
        segment,
        ...drv[segment],
      };
    }
    return request<QualiTelemetryResponse>(
      `/api/sessions/${encodeURIComponent(sid)}/quali/telemetry?driver=${encodeURIComponent(driver)}&segment=${encodeURIComponent(segment)}`,
      signal,
    );
  },

  async getSettings(signal?: AbortSignal): Promise<SettingsResponse> {
    if (isDemoMode()) return DEMO_SETTINGS;
    if (isFixtureMode()) {
      return {
        cacheLocation: '.fastf1-cache',
        computedDataLocation: 'computed_data',
        cacheSizeBytes: 245 * 1024 * 1024,
        cacheSizeMb: 245.0,
        cacheExists: true,
        dataExists: true,
      };
    }
    return request<SettingsResponse>('/api/settings', signal);
  },

  async updateSettings(req: SettingsUpdateRequest, signal?: AbortSignal): Promise<SettingsResponse> {
    if (isDemoMode()) throw new Error('Storage settings are read-only in the online demo.');
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new ApiError(res.status, payload);
    }
    return res.json() as Promise<SettingsResponse>;
  },

  async clearCache(signal?: AbortSignal): Promise<ClearCacheResponse> {
    if (isDemoMode()) throw new Error('The online demo has no cache to clear.');
    const res = await fetch('/api/settings/cache/clear', {
      method: 'POST',
      signal,
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new ApiError(res.status, payload);
    }
    return res.json() as Promise<ClearCacheResponse>;
  },
};

