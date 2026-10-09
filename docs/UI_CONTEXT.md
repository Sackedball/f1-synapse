# F1 Synapse — UI Architecture & Component Context

> **Audience**: AI assistants, software engineers, and UI developers working on or extending the F1 Synapse web interface.  
> **Location of Source Code**: `f1-race-replay/web/src/`  
> **Copy Location**: `F1 project/ui components/`

---

## 1. Executive Summary & Philosophy

**F1 Synapse** is a modern, high-performance, broadcast-quality Formula 1 race replay, telemetry analysis, and predictive intelligence web platform. It replaces legacy desktop GUI software with a zero-compromise, 60 fps web interface built with:

- **React 19 & TypeScript**: Component-driven UI shell and application state.
- **Tailwind CSS v4 & Design Tokens**: Strict broadcast-grade design token system (`tokens.css`, `tokens.ts`) inspired by official Formula 1 broadcast graphics, timing towers, and pit wall displays.
- **PixiJS v8**: WebGL/WebGPU 2D canvas rendering engine for the interactive multi-layered track map.
- **uPlot**: Ultra-fast, lightweight canvas-based timeseries charting engine capable of rendering 100,000+ points at 60 fps.
- **Dockview**: Professional IDE-grade docking workspace for multi-panel telemetry analysis.
- **Zustand**: Minimal, zero-boilerplate, reactive state management stores.
- **25 Hz Binary Stream Engine**: Telemetry frames are delivered in pre-compiled binary chunks (columnar typed arrays) sampled with **zero memory allocations** in the hot rendering loop.

---

## 2. Directory & Component Hierarchy

The `ui components` directory structure maps 1:1 to the web frontend architecture:

```
ui components/
├── UI_CONTEXT.md             # This comprehensive AI context reference
├── README.md                 # Quick-start orientation guide
├── App.tsx                   # Root router, global error boundary & notifications
├── main.tsx                  # Application bootstrap entrypoint
│
├── design/                   # Design token system & visual styling
│   ├── tokens.css            # CSS custom properties (--surface, --accent, typography, spacing)
│   └── tokens.ts             # TypeScript design token constants and team palettes
│
├── motion/                   # Motion Design & Kinetic Typography System
│   ├── Cursor.tsx            # Custom magnetic blend-mode cursor (dot + ring + labels)
│   ├── Curtain.tsx           # Page transition curtain with diagonal skew slats
│   ├── Intro.tsx             # 5-red-lights countdown intro overlay
│   ├── Kinetic.tsx           # SplitRise, Scramble, Ticker, and useInView primitives
│   ├── PageKit.tsx           # PageNav, BigTitle, Choice pill, Switch, Reveal mask
│   ├── TraceLoader.tsx       # Formula 1 SVG track trace animated loaders
│   ├── useMagnetic.ts        # Magnetic attraction hook for interactive buttons
│   ├── pointer.ts            # High-frequency pointer tracker
│   ├── store.ts              # Intro and animation playback store
│   ├── f1.css                # Formula 1 broadcast graphic styles (kerbs, carbon, slashes)
│   ├── motion.css            # Core cursor, intro, curtain, and kinetic animations
│   ├── page.css              # PageKit layout, Choice pill, and Reveal styles
│   └── trace.css             # Track trace drawing animation styles
│
├── components/               # Base reusable primitives & layout shells
│   ├── layout/
│   │   ├── RaceWorkspace.tsx # Primary 3-column race replay layout
│   │   ├── ErrorBoundary.tsx # Catch-all crash protector with graceful reload
│   │   └── race.css          # Formation lap grid, row flashes, play button pulses
│   └── ui/                   # 26 atomic UI primitives
│       ├── Button.tsx        # Styled button with variants (primary, secondary, ghost, danger)
│       ├── Badge.tsx         # Pill badge for status, positions, and tags
│       ├── TyreBadge.tsx     # Official Pirelli tire compound indicator (S, M, H, I, W)
│       ├── DriverChip.tsx    # Driver badge with team color strip and driver code
│       ├── FlagPill.tsx      # FIA race status flag indicator (GREEN, YELLOW, SC, VSC, RED)
│       ├── Card.tsx          # Broadcast-style card container with subtle borders
│       ├── Chip.tsx          # Compact interactive filter tag
│       ├── Dialog.tsx        # Accessible modal dialog window
│       ├── DriverChip.tsx    # Compact driver badge
│       ├── EmptyState.tsx    # Fallback view for missing data
│       ├── ErrorState.tsx    # Standardized error presentation card
│       ├── Gauge.tsx         # Radial and bar gauges for throttle/brake/RPM
│       ├── Kbd.tsx           # Keyboard shortcut badge
│       ├── Menu.tsx          # Dropdown action menu
│       ├── PanelHeader.tsx   # Consistent header bar for collapsible panels
│       ├── Popover.tsx       # Floating context card
│       ├── ProgressBar.tsx   # Progress indicator bar
│       ├── Segmented.tsx     # Multi-choice segmented pill switch
│       ├── Skeleton.tsx      # Shimmer placeholder loading state
│       ├── Slider.tsx        # Range input slider for scrubbing and tuning
│       ├── Sparkline.tsx     # Micro SVG trend chart
│       ├── StatBar.tsx       # Key-value stat display with progress fill
│       ├── Tabs.tsx          # Tabbed navigation switcher
│       ├── Toggle.tsx        # Boolean switch control
│       ├── Tooltip.tsx       # Hover information tooltip
│       └── Wordmark.tsx      # Official F1 Synapse branding wordmark
│
├── features/                 # Domain-specific feature modules
│   ├── timing-tower/         # Live F1 Timing Tower
│   │   ├── TimingTower.tsx   # 20-driver timing ladder with FLIP animation
│   │   ├── formatGap.ts      # Gap delta formatter (+0.xxx, +x.x, LEADER, DNF, PIT)
│   │   └── sortTowerRows.ts  # Driver position sorting and gap calculator
│   │
│   ├── track-canvas/         # Interactive Track Map Viewport
│   │   ├── TrackCanvas.tsx   # PixiJS canvas container with resize observer
│   │   ├── CameraToolbar.tsx # Pan, zoom, follow driver, reset camera controls
│   │   └── CarTooltip.tsx    # Hover tooltip displaying speed and telemetry
│   │
│   ├── transport/            # Playback & Replay Controls
│   │   └── TransportControls.tsx # Play/pause, speed multipliers (0.5x..20x), scrub
│   │
│   ├── timeline/             # Multi-Track Race Timeline
│   │   ├── RaceTimeline.tsx  # Timeline scrubber with lap marks and safety car bands
│   │   ├── TimelineMarker.tsx# Incident and pit stop markers
│   │   ├── TimelineMinimap.tsx# Miniature full-race overview minimap
│   │   └── timelineMath.ts   # Time-to-pixel coordinate converters
│   │
│   ├── context-panel/        # Contextual Right Drawer
│   │   └── ContextPanel.tsx  # Driver telemetry gauges, pit predictions, weather
│   │
│   ├── analytics/            # Deep-Dive Telemetry & Dockable Workspace
│   │   ├── AnalysisWorkspace.tsx # Multi-panel Dockview layout
│   │   ├── AnalysisContext.tsx   # Dockview state context
│   │   ├── dockviewTheme.css     # F1 dark styling for dockview tabs
│   │   ├── panelRegistry.ts      # Registry of available docking panels
│   │   ├── panelWrappers.tsx     # Panel container wrappers
│   │   ├── presets.ts            # Saved panel layout presets (Driver, Strategy, etc.)
│   │   ├── charts/               # High-speed uPlot charting components
│   │   │   ├── chartTheme.ts     # uPlot dark broadcast color themes
│   │   │   ├── DistanceChart.tsx # Metric vs Along-Track Distance chart
│   │   │   ├── TimeSeriesChart.tsx# Metric vs Race Time chart
│   │   │   ├── GanttChart.tsx    # Stint and compound timeline chart
│   │   │   └── PositionStrip.tsx # Position lap-by-lap line chart
│   │   ├── math/                 # Mathematical calculations for charts
│   │   │   ├── deltaMath.ts      # Reference lap delta calculations
│   │   │   └── outlierFilter.ts  # Telemetry sensor noise filter
│   │   └── panels/               # 8 Dockable telemetry panels
│   │       ├── DriverTelemetryPanel.tsx   # Speed, throttle, brake, gear, DRS traces
│   │       ├── HeadToHeadPanel.tsx        # Driver A vs Driver B overlay comparison
│   │       ├── LapTimesGapsPanel.tsx      # Lap time scatter and delta ladder
│   │       ├── TyreStrategyPanel.tsx      # Stint lifecycle and degradation curves
│   │       ├── MlInsightsPanel.tsx        # Machine learning prediction forecasts
│   │       ├── RaceControlFeedPanel.tsx   # Official FIA race control notice stream
│   │       ├── TrackPositionStripPanel.tsx# Lap chart position changes
│   │       └── DebugStreamInspectorPanel.tsx # Low-level frame buffer debugger
│   │
│   ├── quali/                # Qualifying Analysis Page
│   │   ├── QualifyingPage.tsx# Q1/Q2/Q3 ladder with sector deltas
│   │   ├── QualiTrackMap.tsx # Qualifying line with mini-sector speed coloring
│   │   └── sectorColors.ts   # Purple (fastest overall), Green (personal best), Yellow
│   │
│   ├── home/                 # Race Calendar & Session Selection
│   │   ├── HomePage.tsx      # 2026 season calendar and hero view
│   │   ├── CircuitStage.tsx  # Interactive broadcast track-map with 20 circulating cars
│   │   ├── home.css          # Split stage layout, grid patterns, and hero styling
│   │   ├── circuits.ts       # Track metadata, country flags, lengths
│   │   ├── recents.ts        # Recently replayed sessions
│   │   └── SessionLoadModal.tsx # FastF1 download and progress dialog
│   │
│   ├── key-moments/          # Race Events Drawer
│   │   ├── KeyMomentsDrawer.tsx # Slide-out list of overtakes, crashes, flags
│   │   └── RecentMomentsCard.tsx# Compact event card with 1-click jump-to-time
│   │
│   ├── race-strip/           # Top Telemetry Strip
│   │   └── RaceStrip.tsx     # Compact top bar: Lap counter, Flag pill, Leader, Weather
│   │
│   ├── settings/             # Settings Page
│   │   └── SettingsPage.tsx  # Density, units (km/h vs mph), reduced motion
│   │
│   ├── shortcuts/            # Keyboard Shortcuts
│   │   └── ShortcutsModal.tsx# Hotkey reference modal (Space, J/K/L, arrows)
│   │
│   └── command-palette/      # Global Launcher
│       └── CommandPalette.tsx# Ctrl+K modal for driver search, actions, and views
│
├── pages/                    # Route View Entrypoints
│   ├── DevGallery.tsx        # Living interactive showcase of all primitives & tokens
│   └── Home.tsx              # Alternate Home view
│
├── render/                   # PixiJS Canvas Renderer Engine
│   ├── TrackRenderer.ts      # Main PixiJS Application manager and 60fps render loop
│   ├── camera.ts             # Pan, zoom, smooth spring follow, coordinate projection
│   ├── hitTest.ts            # Car click and hover detection
│   ├── palette.ts            # PixiJS color conversion and team hex palettes
│   └── layers/               # Render layers (drawn in precise z-order)
│       ├── BackgroundLayer.ts   # Canvas background and coordinate grid
│       ├── TrackAsphaltLayer.ts # Track ribbon, edges, asphalt fill, centerline
│       ├── DrsBandsLayer.ts     # DRS zones with active green glow
│       ├── FinishLineLayer.ts   # Checkerboard start/finish line
│       ├── CornersLayer.ts      # Corner number badges (T1..T18)
│       ├── MiniSectorsLayer.ts  # Mini-sector speed & delta heatmaps
│       ├── TrailsLayer.ts       # Motion trails trailing behind moving cars
│       ├── CarsLayer.ts         # Team-colored car discs and heading orientation
│       ├── SafetyCarLayer.ts    # Safety Car vehicle and flashing beacon
│       ├── FocusDimLayer.ts     # Dimming of other cars when a driver is focused
│       ├── LabelsLayer.ts       # High-visibility driver code and position badges
│       ├── MlOverlay.ts         # Predicted overtake vectors & pit markers
│       └── FpsOverlay.ts        # Real-time render performance FPS counter
│
├── stores/                   # Zustand State Stores
│   ├── playbackStore.ts      # Playback time, speed multiplier, playing/paused
│   ├── selectionStore.ts     # Selected driver, hovered driver, compare drivers
│   ├── sessionStore.ts       # Loaded session metadata, drivers, laps, geometry
│   ├── uiStore.ts            # Sidebar collapsed state, active tabs, timeline zoom
│   ├── settingsStore.ts      # Display density, metric/imperial, reduced motion
│   └── mlStore.ts            # ML predictions and strategy curves
│
├── engine/                   # Real-time Binary Stream Engine
│   ├── FrameStore.ts         # Sliding-window chunk cache with allocation-free sample()
│   ├── snapshot.ts           # Preallocated TypedArray Snapshot struct
│   ├── PlaybackClock.ts      # RAF playback clock with monotonic drift compensation
│   ├── binary.ts             # Binary chunk parsing and validation
│   └── usePlayback.ts        # React hook driving 60fps RAF loop
│
├── api/                      # Backend API Client & Generated Types
│   ├── client.ts             # Typed Fetch client connected to FastAPI backend
│   ├── frames.ts             # Binary chunk fetcher
│   └── types.ts              # DriverInfo, SessionMeta, TrackGeometry, etc.
│
└── utils/ & lib/             # Helper Utilities
    ├── units.ts              # km/h <-> mph, meters <-> miles converters
    ├── toast.ts              # Notification helper wrapping Sonner
    ├── exportSnapshot.ts     # PNG export of current frame
    └── utils.ts              # Tailwind clsx/twMerge helper
```

---

## 3. Design System & Visual Tokens

The design system lives in `design/tokens.css` and `design/tokens.ts`. All components adhere strictly to these tokens.

### 3.1 Color Palette

| Token | CSS Variable | Hex / Value | Purpose |
| :--- | :--- | :--- | :--- |
| **Surface 0** | `--surface-0` | `#0a0a0c` | Global canvas backdrop |
| **Surface 1** | `--surface-1` | `#121216` | Main panel backgrounds |
| **Surface 2** | `--surface-2` | `#1a1a22` | Cards, active rows, hovered items |
| **Surface 3** | `--surface-3` | `#22222e` | Selected items, popovers, modals |
| **Border** | `--border` | `rgba(255,255,255,0.08)` | Default subtle borders |
| **Border Active**| `--border-active` | `rgba(255,255,255,0.2)` | Focused/active borders |
| **Text 1** | `--text-1` | `#f0f0f5` | Primary high-contrast text |
| **Text 2** | `--text-2` | `#a0a0b2` | Secondary text, labels |
| **Text 3** | `--text-3` | `#606072` | Muted text, timestamps, captions |
| **Accent / Red**| `--accent` | `#e10600` | Official F1 Racing Red |
| **Success** | `--success` | `#00d26a` | Personal best / Green flag / DRS active |
| **Warning** | `--warning` | `#ffd200` | Yellow flag / Caution |
| **Danger** | `--danger` | `#eb0a1e` | Red flag / DNF / Incident |
| **Insight** | `--insight` | `#9b51e0` | ML prediction / purple sector |

### 3.2 Typography

1. **Display Font (`--font-display`)**: Formula 1 display face for Driver Codes (`VER`, `HAM`), position ranks, and bold header cards.
2. **Monospace Font (`--font-mono`)**: JetBrains Mono / SF Mono for telemetry timestamps, lap times (`1:31.254`), gap deltas (`+0.342`), speeds, and sensor readouts.
3. **Sans-Serif Font (`--font-sans`)**: Inter / system-ui for labels, buttons, navigation, and settings.

### 3.3 Density Modes

The UI supports two density modes controlled by the `data-density` attribute on the root element:
- `default`: Row height 36px, spacious pit wall layout.
- `compact`: Row height 30px, tighter timing tower for screens < 900px vertical height or grids with > 20 drivers.

### 3.4 Motion Design & Kinetic Typography System (`motion/`)

The application incorporates a bespoke motion design system:
- **Custom Cursor (`motion/Cursor.tsx`, `motion/pointer.ts`)**: Follows mouse coordinates with smooth spring interpolation. Offers modes (`link`, `view`, `hide`) and interactive textual cues.
- **Magnetic Buttons (`motion/useMagnetic.ts`)**: Buttons physically gravitate toward the cursor when hovered (`[data-magnetic]`).
- **Page Transitions (`motion/Curtain.tsx`)**: Navigating between routes activates a dynamic diagonal-skew slat curtain with staggered animation timing.
- **Race Start Intro (`motion/Intro.tsx`)**: Recreates the iconic Formula 1 5-red-lights sequence before splitting the screen open along an angled seam.
- **Kinetic Typography (`motion/Kinetic.tsx`)**:
  - `SplitRise`: Staggered per-character or per-word clip-path rise animation.
  - `Scramble`: Matrix-style cryptographic character deciphering effect.
  - `Ticker`: High-performance rolling digits for live metrics.
  - `useInView`: Scroll-triggered reveal animations.
- **Editorial Page Kit (`motion/PageKit.tsx`)**: Shared layout primitives (`PageNav`, `BigTitle`, `Choice` sliding pill, `Switch`, and `Reveal`).
- **Formation & Trace Loaders (`motion/TraceLoader.tsx`, `components/layout/race.css`)**: Starting grid formation animations and SVG circuit trace path-drawing loaders during data streaming.

---

## 4. Workspaces & Page Layouts

### 4.1 Race Workspace (`/race/:sid`)

Located in [`components/layout/RaceWorkspace.tsx`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/ui%20components/components/layout/RaceWorkspace.tsx).

The flagship replay experience uses a fixed 3-column workspace:
```
+------------------------------------------------------------------------------------+
| TopStrip (56px) [Lap Counter | Flag Pill | Leader | Air/Track Temp | Session Menu]  |
+---------------------+----------------------------------------+---------------------+
| Timing Tower (320px)| Track Canvas Viewport (1fr)            | Context Panel(360px)|
| - Pos 1..20         | - PixiJS Multi-layer Track Map         | - Driver Telemetry  |
| - Team Color Bar    | - Camera Toolbar (Zoom/Pan/Follow)     | - Pit Prediction    |
| - Driver Code       | - Car Tooltip on hover                 | - Weather Readings  |
| - Live Gap (+0.xxx) | - ML Overtake Cones                    | - Overtake Odds     |
| - Tire Compound/Life|                                        |                     |
+---------------------+----------------------------------------+---------------------+
| RaceTimeline & TransportControls (96px)                                             |
| [⏮ ⏪ ▶ ⏩ ⏭ 1x] [Timeline Scrubber with Laps, Safety Cars, Pit Stops, Flags]      |
+------------------------------------------------------------------------------------+
```

### 4.2 Analysis Workspace (`/analysis/:sid`)

Located in [`features/analytics/AnalysisWorkspace.tsx`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/ui%20components/features/analytics/AnalysisWorkspace.tsx).

Uses **Dockview** to provide a multi-panel telemetry workbench:
- Panels can be docked, tabbed, split horizontally/vertically, or closed.
- Saved layout presets: `Overview`, `Driver Telemetry`, `Strategy & Degradation`, `Head-to-Head`.
- All charts update synchronously to the current replay timestamp.

### 4.3 Qualifying Page (`/quali/:sid`)

Located in [`features/quali/QualifyingPage.tsx`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/ui%20components/features/quali/QualifyingPage.tsx).

- Classification ladder with Q1, Q2, and Q3 elimination drop-zones.
- Sector 1, 2, and 3 delta split times color-coded with official F1 colors (Purple for overall fastest, Green for driver personal best, Yellow for slower).
- Mini-sector heatmap track preview.

### 4.4 Home & Calendar Page (`/`)

Located in [`features/home/HomePage.tsx`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/ui%20components/features/home/HomePage.tsx).

- Complete Formula 1 2026 World Championship schedule.
- Interactive race cards featuring track geometry SVGs, round numbers, country flags, and dates.
- Modal dialog for fetching and caching FastF1 session data with real-time download progress.

---

## 5. Timing Tower & Leaderboard Mechanics

Located in [`features/timing-tower/`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/ui%20components/features/timing-tower/).

### 5.1 Format Rules (`formatGap.ts`)
- **P1 Leader**: Strictly returns `"LEADER"` (or `"—"` when `useDashForLeader: true`). **Only** rows with `isLeader === true` are marked as leader.
- **Interval Mode**: Shows delta to car directly ahead (`gapAhead`).
- **Leader Mode**: Shows delta to race leader (`gapLeader`).
- **Sub-second gap**: Displayed with 3 decimal places (e.g., `+0.245`).
- **Gap $\ge 1.0$s**: Displayed with 1 decimal place (e.g., `+2.4`).
- **Lapped Cars**: Displayed as `+1 LAP` or `+n LAPS`.
- **In Pit**: Displayed with white `"PIT"` badge.
- **Retired / DNF**: Sunk to the bottom of the ladder with red `"OUT"` / `"DNF"` badge.

### 5.2 Position Ordering & Animations
- Positions are driven by authoritative continuous along-track race distance (`dist`) from the telemetry engine.
- Position changes trigger smooth CSS **FLIP** transforms (`translateY`) so cars visibly slide up or down when an overtake occurs.
- Gain/Loss badges flash for 2,000ms upon position changes (`▲1` in green, `▼1` in red).
- Clicking a driver row selects the driver across all panels and instructs the track camera to follow them.

---

## 6. PixiJS Canvas Engine & Render Layers

Located in [`render/`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/ui%20components/render/).

The track canvas uses **PixiJS v8** inside a responsive `<canvas>` element. The render pipeline executes at 60 fps via `requestAnimationFrame`:

### 6.1 Layer Composition Order
```
BackgroundLayer (z: 0)
  └─ TrackAsphaltLayer (z: 10)  [inner/outer curb lines + asphalt ribbon + centerline]
      └─ DrsBandsLayer (z: 20)      [DRS activation zones with green highlight]
          └─ FinishLineLayer (z: 25)    [checkerboard start/finish timing line]
              └─ MiniSectorsLayer (z: 30)  [sector lines and speed heatmaps]
                  └─ CornersLayer (z: 35)      [corner numbers: T1, T2, ...]
                      └─ TrailsLayer (z: 40)       [fading motion tails behind cars]
                          └─ CarsLayer (z: 50)         [car discs, rotation, team color]
                              └─ SafetyCarLayer (z: 55)    [Mercedes-AMG SC vehicle & beacon]
                                  └─ FocusDimLayer (z: 60)     [dims unselected cars]
                                      └─ LabelsLayer (z: 70)       [driver code pills & numbers]
                                          └─ MlOverlay (z: 80)         [predicted overtake cones]
                                              └─ FpsOverlay (z: 90)        [performance stats]
```

### 6.2 Camera & Interaction Pipeline (`render/camera.ts`)
- **Pan**: Left-click and drag anywhere on the track canvas.
- **Zoom**: Mouse wheel or pinch gesture; zooms centered around the cursor position.
- **Driver Follow Mode**: When a driver is selected in `selectionStore`, the camera automatically centers on that driver with smooth lerp damping (`factor = 0.1`).
- **Hit Testing (`render/hitTest.ts`)**: Fast radial distance hit-testing detects hovering or clicking any car disc on track.

---

## 7. State Management Architecture (`stores/`)

The application state is segregated into single-responsibility Zustand stores:

| Store | File | Core State & Responsibilities |
| :--- | :--- | :--- |
| **`usePlaybackStore`** | `stores/playbackStore.ts` | Current replay time `t`, frame index, `isPlaying`, speed multiplier (`0.5x..20x`), looping, scrubber state. |
| **`useSelectionStore`** | `stores/selectionStore.ts` | `selectedDriver` (code), `hoveredDriver`, `compareDrivers` (for head-to-head), camera focus mode. |
| **`useSessionStore`** | `stores/sessionStore.ts` | Active session ID, session metadata (`SessionMeta`), circuit geometry, drivers list, laps, stints, weather. |
| **`useUiStore`** | `stores/uiStore.ts` | Right context panel collapsed/expanded, active tabs, timeline zoom level, dialog visibilities. |
| **`useSettingsStore`** | `stores/settingsStore.ts` | Density (`default` / `compact`), speed units (`km/h` / `mph`), reduced motion, ML insight overlays toggle. |
| **`useMlStore`** | `stores/mlStore.ts` | Precomputed ML timelines: overtake probabilities, predicted pit windows, degradation forecasts. |

---

## 8. Telemetry Engine & Binary Stream Protocol (`engine/`)

The application streams high-frequency 25 Hz race data using a custom binary columnar format rather than heavy JSON frames.

### 8.1 Binary Chunks
- Data is split into chunks of 1,500 frames (60 seconds of race time per chunk).
- Chunks are fetched on-demand by `FrameStore.ts` with sliding-window prefetching.
- Binary layout contains Float32 and Uint8 arrays for coordinates `(x, y)`, cumulative distance `dist`, `speed`, `throttle`, `brake`, `gear`, `drs`, `lap`, `position`, `inPit`, `status`, `gapAhead`, and `gapLeader`.

### 8.2 Zero-Allocation Sampling (`engine/snapshot.ts`)
```ts
store.sample(t: number, out: Snapshot): boolean
```
- The `Snapshot` object is preallocated once at application start.
- Every frame, `store.sample()` interpolates driver coordinates and channels between adjacent frames directly into the typed arrays of the existing `out` object.
- **Result**: Zero heap allocations in the animation loop, preventing garbage-collection micro-stutters and guaranteeing a locked 60 fps.

---

## 9. Guidelines for Extending the UI

When authoring or modifying UI components in this codebase:

1. **Strictly use Design Tokens**:
   - Never write raw hex color literals (e.g., `#ffffff`, `#121212`) in component styles.
   - Always use token variables: `bg-[var(--surface-1)]`, `text-[var(--text-1)]`, `border-[var(--border)]`, `text-[var(--accent)]`.
2. **Preserve Monospace Alignment**:
   - Lap times, intervals, speeds, gears, and sector splits must always use `font-mono` to prevent tabular jitter as numbers change.
3. **Respect Density Settings**:
   - Use `isCompact` or CSS container styles so rows shrink appropriately when density is set to `compact`.
4. **Driver Colors**:
   - Always resolve team colors via `driver.color` from `DriverInfo` with fallback to `--surface-3`.
5. **Component Tests**:
   - Pair components with Vitest tests in `__tests__/` asserting rendering, keyboard navigation, and event emission.
6. **Zero Memory Allocation in Loops**:
   - Never instantiate objects, arrays, or anonymous closures inside `sample()` or PixiJS tick callbacks.
