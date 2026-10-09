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
} from './types';

export function isFixtureMode(): boolean {
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

export const api = {
  async getHealth(signal?: AbortSignal): Promise<HealthResponse> {
    if (isFixtureMode()) {
      return { status: 'ok', version: 'fixture-mode' };
    }
    return request<HealthResponse>('/api/health', signal);
  },

  async getSessionMeta(sid: string, signal?: AbortSignal): Promise<SessionMeta> {
    if (isFixtureMode()) {
      const fixture = getFixtureName();
      return request<SessionMeta>(`/fixtures/${fixture}/meta.json`, signal);
    }
    return request<SessionMeta>(`/api/sessions/${encodeURIComponent(sid)}/meta`, signal);
  },

  async getTrackGeometry(sid: string, signal?: AbortSignal): Promise<TrackGeometry> {
    if (isFixtureMode()) {
      const fixture = getFixtureName();
      return request<TrackGeometry>(`/fixtures/${fixture}/track.json`, signal);
    }
    return request<TrackGeometry>(`/api/sessions/${encodeURIComponent(sid)}/track`, signal);
  },

  async getLaps(sid: string, signal?: AbortSignal): Promise<LapRow[]> {
    if (isFixtureMode()) {
      const fixture = getFixtureName();
      return request<LapRow[]>(`/fixtures/${fixture}/laps.json`, signal);
    }
    return request<LapRow[]>(`/api/sessions/${encodeURIComponent(sid)}/laps`, signal);
  },

  async getStints(sid: string, signal?: AbortSignal): Promise<Stint[]> {
    if (isFixtureMode()) {
      const fixture = getFixtureName();
      return request<Stint[]>(`/fixtures/${fixture}/stints.json`, signal);
    }
    return request<Stint[]>(`/api/sessions/${encodeURIComponent(sid)}/stints`, signal);
  },

  async getRaceControl(sid: string, signal?: AbortSignal): Promise<RaceControlMessage[]> {
    if (isFixtureMode()) {
      const fixture = getFixtureName();
      return request<RaceControlMessage[]>(`/fixtures/${fixture}/race_control.json`, signal);
    }
    return request<RaceControlMessage[]>(`/api/sessions/${encodeURIComponent(sid)}/race-control`, signal);
  },

  async getWeather(sid: string, signal?: AbortSignal): Promise<WeatherSample[]> {
    if (isFixtureMode()) {
      const fixture = getFixtureName();
      return request<WeatherSample[]>(`/fixtures/${fixture}/weather.json`, signal);
    }
    return request<WeatherSample[]>(`/api/sessions/${encodeURIComponent(sid)}/weather`, signal);
  },

  async getEvents(sid: string, signal?: AbortSignal): Promise<RaceEvent[]> {
    if (isFixtureMode()) {
      const fixture = getFixtureName();
      return request<RaceEvent[]>(`/fixtures/${fixture}/events.json`, signal);
    }
    return request<RaceEvent[]>(`/api/sessions/${encodeURIComponent(sid)}/events`, signal);
  },

  async getMlTimelines(sid: string, signal?: AbortSignal): Promise<MlTimelines> {
    if (isFixtureMode()) {
      const fixture = getFixtureName();
      return request<MlTimelines>(`/fixtures/${fixture}/ml.json`, signal);
    }
    return request<MlTimelines>(`/api/sessions/${encodeURIComponent(sid)}/ml`, signal);
  },

  async getSeasonSchedule(year: number, signal?: AbortSignal): Promise<RoundSummary[]> {
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
    return request<JobStatus>(`/api/jobs/${encodeURIComponent(jobId)}`, signal);
  },

  async getQualiResults(sid: string, signal?: AbortSignal): Promise<QualiResultsResponse> {
    if (isFixtureMode()) {
      const fixture = getFixtureName();
      return request<QualiResultsResponse>(`/fixtures/${fixture}/quali_results.json`, signal);
    }
    return request<QualiResultsResponse>(`/api/sessions/${encodeURIComponent(sid)}/quali/results`, signal);
  },

  async getQualiTelemetry(
    sid: string,
    driver: string,
    segment: string = 'Q3',
    signal?: AbortSignal,
  ): Promise<QualiTelemetryResponse> {
    if (isFixtureMode()) {
      const fixture = getFixtureName();
      const allTelem = await request<Record<string, Record<string, QualiTelemetryResponse>>>(
        `/fixtures/${fixture}/quali_telemetry.json`,
        signal,
      );
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

