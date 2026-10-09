# REF — API Contract (draft v0.1)

> **Status: v1.0.** Phase 0 verified against real source. Changes require a version note at the bottom of this file. The FastAPI OpenAPI schema is the machine-readable truth; TypeScript types are generated from it (D7).

---

## 1. Conventions

- Base URL: `http://127.0.0.1:8000`. All REST under `/api`.
- **Time base:** `t` = seconds since replay start (matches the existing `frame["t"]`). `fps = 25`. Frame index `i = round(t * 25)`.
- **Units:** distance in metres (`dist` is **cumulative race distance since Lap 1**, strictly monotonic per driver); speed km/h; temperatures °C; coordinates are FastF1 position units (1/10 m).
- **Session id:** `{year}_{round}_{type}` e.g. `2026_3_R`. Types: `R` race, `Q` qualifying, `S` sprint, `SQ` sprint qualifying, `FP1`/`FP2`/`FP3` practice. (Supported by legacy app/FastF1).
- **Errors:** HTTP status + `{ "error": { "code": "string", "message": "string", "detail": any } }`.
- **Caching:** static per-session resources send `ETag` and `Cache-Control: public, max-age=31536000, immutable` (session data never changes once built).
- JSON via `orjson`; field names `camelCase` in JSON.

---

## 2. Endpoints

### Meta & schedule
| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | `{ status, version }` |
| GET | `/api/seasons/{year}/schedule` | `RoundSummary[]` |
| GET | `/api/cache/status?year=` | `{ rounds: { round, sessions: { type, cached }[] }[] }` |

### Loading a session (long-running)
| Method | Path | Returns |
|---|---|---|
| POST | `/api/sessions/load` body `{ year, round, type, refresh? }` | `{ jobId, sessionId }` (idempotent: already-cached returns `ready` immediately) |
| GET | `/api/jobs/{jobId}` | `JobStatus` |
| GET | `/api/jobs/{jobId}/events` | **SSE** stream of `JobEvent` |

### Session data (all require session loaded/ready)
| Method | Path | Returns |
|---|---|---|
| GET | `/api/sessions/{sid}/meta` | `SessionMeta` |
| GET | `/api/sessions/{sid}/track` | `TrackGeometry` |
| GET | `/api/sessions/{sid}/frames/{k}` | **binary** `FrameChunk` (chunk `k` = frames `[k*1500, (k+1)*1500)`) |
| GET | `/api/sessions/{sid}/events` | `RaceEvent[]` |
| GET | `/api/sessions/{sid}/laps` | `LapRow[]` |
| GET | `/api/sessions/{sid}/stints` | `Stint[]` |
| GET | `/api/sessions/{sid}/race-control` | `RaceControlMessage[]` |
| GET | `/api/sessions/{sid}/weather` | `WeatherSample[]` (low-rate timeline) |
| GET | `/api/sessions/{sid}/ml` | `MlTimelines` (Phase 7) |

### Qualifying (Phase 8)
| Method | Path | Returns |
|---|---|---|
| GET | `/api/sessions/{sid}/quali/results` | `QualiResult[]` |
| GET | `/api/sessions/{sid}/quali/telemetry?driver=&segment=Q1\|Q2\|Q3` | `QualiTelemetry` |

### Settings (Phase 8)
| Method | Path | Returns |
|---|---|---|
| GET / PUT | `/api/settings` | `Settings` (cache path, data path, units, perf mode) |

---

## 3. Types (TypeScript form; Pydantic mirrors them)

```ts
interface RoundSummary { round: number; name: string; country: string; location: string; date: string; sessions: string[] }

interface SessionMeta {
  sessionId: string; year: number; round: number; type: string;
  eventName: string; circuitName: string; country: string; date: string;
  totalLaps: number; totalFrames: number; fps: 25; chunkSize: 1500; durationSec: number;
  drivers: DriverInfo[];
}
interface DriverInfo { code: string; number: number; fullName: string; team: string; color: string /* #rrggbb */ ; index: number /* column index in chunks */ }

interface TrackGeometry {
  centerline: [number, number][];      // world coords, ordered in direction of travel
  inner: [number, number][]; outer: [number, number][];   // ribbon edges
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  rotationDeg: number;                  // broadcast orientation (0; not natively provided by legacy app)
  finishIndex: number;                  // index into centerline
  drsZones: { start: number; end: number }[];   // centerline index ranges
  sectors?: number[];                   // centerline indices of sector boundaries (optional; calculated via distance)
  corners?: { number: number; x: number; y: number; label?: string }[];
  lengthM: number;
}

interface RaceEvent {
  id: string; type: EventType; t: number; tEnd?: number; lap: number;
  drivers: string[]; label: string; severity: 'info'|'minor'|'major'; meta?: Record<string, unknown>;
}
type EventType = 'flag'|'safety_car'|'vsc'|'overtake'|'pit_in'|'pit_out'|'retirement'|'fastest_lap'|'battle'|'incident'|'penalty'|'start'|'finish';

interface LapRow { driver: string; lap: number; timeSec: number|null; s1: number|null; s2: number|null; s3: number|null; compound: string|null; tyreLife: number|null; pitIn: boolean; pitOut: boolean; isPB: boolean; isFastest: boolean }
interface Stint { driver: string; stint: number; compound: string; lapStart: number; lapEnd: number }
interface RaceControlMessage { t: number; lap: number; category: string; flag?: string; message: string; drivers?: string[] }
interface WeatherSample { t: number; airTemp: number; trackTemp: number; humidity: number; windSpeed: number; windDir: number; rainfall: boolean }

interface JobEvent { stage: 'queued'|'downloading'|'processing_drivers'|'resampling'|'indexing_events'|'computing_ml'|'ready'|'error'; progress: number /*0-1*/; message: string }
```

---

## 4. Binary `FrameChunk` format (`application/octet-stream`)

Little-endian. Server may gzip (`Content-Encoding: gzip`).

```
offset 0   : 4 bytes  magic "F1SC"
offset 4   : u32      headerLen
offset 8   : headerLen bytes  UTF-8 JSON header
then       : data blocks (each block start aligned to 4 bytes)
```

Header:
```json
{ "v": 1, "i0": 0, "n": 1500, "fps": 25,
  "drivers": ["VER","NOR"],
  "perDriver": [ {"name":"x","dtype":"f32"}, {"name":"y","dtype":"f32"}, ... ],
  "global":    [ {"name":"trackStatus","dtype":"u8"}, ... ] }
```

Data: for each `perDriver` channel in header order → for each driver in `drivers` order → `n` values. Then each `global` channel → `n` values.

**Per-driver channels (v1):**

| name | dtype | meaning |
|---|---|---|
| x, y | f32 | world position |
| dist | f32 | cumulative race distance (m) |
| speed | f32 | km/h |
| throttle | f32 | 0–100 |
| brake | f32 | 0–100 |
| gear | i8 | 0–8 |
| drs | u8 | 0 off · 1 eligible · 2 open (Raw mapping: 8=eligible, 10/12/14=open. Normalised server-side) |
| lap | i16 | lap number |
| tyre | u8 | 0 S · 1 M · 2 H · 3 I · 4 W · 255 unknown (Raw mapped from 'SOFT'=0, 'MEDIUM'=1, etc.) |
| tyreLife | u8 | laps on tyre |
| position | u8 | **precomputed server-side: sort by `dist` desc** |
| inPit | u8 | 0/1 |
| status | u8 | 0 running · 1 retired/out · 2 not started |
| gapAhead | f32 | seconds to car ahead (NaN for leader) — derived via `dist` difference over 55.56 m/s |
| gapLeader | f32 | seconds to leader |

**Global channels:** `trackStatus u8` (0 green · 1 yellow · 2 SC · 3 red · 4 VSC · 5 VSC ending — Raw: '1'=green, '2'=yellow, '4'=SC, '5'=red, '6'/'7'=VSC), `scX f32`, `scY f32`, `scPhase u8` (0 none · 1 deploying · 2 on-track · 3 returning).

Missing float values are `NaN`. Chunk size default **1500 frames (60 s)**.

---

## 5. Frontend `Snapshot` (output of `FrameStore.sample(t)`)

Preallocated, reused every call (no per-frame allocation):

```ts
interface Snapshot {
  t: number; frameIndex: number;
  n: number;                       // driver count
  x: Float32Array; y: Float32Array; dist: Float32Array; speed: Float32Array;
  throttle: Float32Array; brake: Float32Array;
  gear: Int8Array; drs: Uint8Array; lap: Int16Array; tyre: Uint8Array; tyreLife: Uint8Array;
  position: Uint8Array; inPit: Uint8Array; status: Uint8Array;
  gapAhead: Float32Array; gapLeader: Float32Array;
  trackStatus: number; scX: number; scY: number; scPhase: number;
  orderByPosition: Uint8Array;     // driver indices sorted by position (index 0 = P1)
}
```
Continuous channels (x, y, dist, speed, throttle, brake, gaps) are linearly interpolated; discrete channels use the lower frame.

---

## 6. Versioning

- v0.1 — initial draft (this file).
- *(append version notes here: v1.0 after Phase 0 verification, etc.)*
