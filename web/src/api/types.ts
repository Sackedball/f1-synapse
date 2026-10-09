import type { components } from './types.gen';

export type SessionMeta = components['schemas']['SessionMeta'];
export type TrackGeometry = components['schemas']['TrackGeometry'];
export type DriverInfo = components['schemas']['DriverInfo'];
export type LapRow = components['schemas']['LapRow'];
export type Stint = components['schemas']['Stint'];
export type RaceControlMessage = components['schemas']['RaceControlMessage'];
export type WeatherSample = components['schemas']['WeatherSample'];
export type HealthResponse = components['schemas']['HealthResponse'];
export type RoundSummary = components['schemas']['RoundSummary'];
export type RaceEvent = components['schemas']['RaceEvent'];
export type EventType = components['schemas']['EventType'];
export type EventSeverity = components['schemas']['EventSeverity'];
export type MlTimelines = components['schemas']['MlTimelines'];
export type MlBattleSegment = components['schemas']['MlBattleSegment'];
export type MlDriverPitTimeline = components['schemas']['MlDriverPitTimeline'];
export type MlDriverTyreTimeline = components['schemas']['MlDriverTyreTimeline'];
export type MlModelMetadata = components['schemas']['MlModelMetadata'];
export type SettingsResponse = components['schemas']['SettingsResponse'];
export type SettingsUpdateRequest = components['schemas']['SettingsUpdateRequest'];
export type ClearCacheResponse = components['schemas']['ClearCacheResponse'];
export type QualiResultsResponse = components['schemas']['QualiResultsResponse'];
export type QualiDriverResult = components['schemas']['QualiDriverResult'];
export type QualiTelemetryResponse = components['schemas']['QualiTelemetryResponse'];
export type SectorTimes = components['schemas']['SectorTimes'];
export type CacheStatusResponse = components['schemas']['CacheStatusResponse'];
export type RoundCacheStatus = components['schemas']['RoundCacheStatus'];
export type SessionCacheStatus = components['schemas']['SessionCacheStatus'];
export type SessionLoadRequest = components['schemas']['SessionLoadRequest'];
export type SessionLoadResponse = components['schemas']['SessionLoadResponse'];
export type JobStatus = components['schemas']['JobStatus'];
export type JobEvent = components['schemas']['JobEvent'];

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    detail?: unknown;
  };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: unknown;

  constructor(status: number, payload?: ApiErrorPayload | string) {
    if (typeof payload === 'object' && payload?.error) {
      super(payload.error.message || `API error ${status}`);
      this.code = payload.error.code || 'UNKNOWN_ERROR';
      this.detail = payload.error.detail;
    } else {
      super(typeof payload === 'string' ? payload : `HTTP ${status}`);
      this.code = 'HTTP_ERROR';
    }
    this.status = status;
    this.name = 'ApiError';
  }
}
