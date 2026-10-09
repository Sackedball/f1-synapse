# F1 Synapse

> **Broadcast-quality Formula 1 race replay, telemetry analysis, and predictive strategy engine.**

F1 Synapse delivers a high-performance web-based pit wall experience for Formula 1 races, featuring 60 fps WebGL circuit rendering, synchronized multi-driver telemetry graphs, automated qualifying session comparisons, and machine-learning-powered strategic forecasts.

---

## Key Features

- **60 FPS Hardware-Accelerated Circuit Canvas:** Real-time track visualization powered by PixiJS with dynamic camera tracking, driver follow modes, DRS activation bands, safety car indicators, and tire compound badges.
- **Broadcast Timing Tower:** Instantaneous intervals and leader gaps computed from cumulative track distance with smooth FLIP reordering transitions and colorblind-safe compound indicators.
- **Modular Dockview Analytics Workspace:** Desktop-grade multi-pane layout presets (`Race Engineer`, `Strategy`, `Telemetry`, `Broadcast`) featuring zero-allocation `uPlot` telemetry synchronization, tire stint history, and race control logs.
- **Machine Learning Predictive Engine:** Precomputed 2 Hz predictive timelines for overtake probability, pit stop window detection, and Bayesian tire compound degradation forecasting.
- **Qualifying Comparison Replay:** Distance-resampled mini-sector classification, lap delta traces ($\Delta t(x)$), and synchronized mini-map replay.
- **Offline & Fixture Support:** Pre-packaged fixture datasets with full playback capability without network connection.
- **Accessibility & Responsive Design:** WCAG 2.1 AA compliant (0 serious/critical axe violations), high-contrast tokens, reduced-motion overrides, and responsive scaling from 1366×768 to 3440×1440 ultrawide.

---

## Quick Start (One-Command Launch)

### Windows
Double-click `run.bat` or run in terminal:
```cmd
run.bat
```
*Automatically sets up the Python virtual environment, installs requirements, compiles the frontend if needed, and opens your default browser.*

### Linux / macOS
```bash
chmod +x run.sh
./run.sh
```

### Direct Python Execution
```bash
python main.py
```
Options:
- `python main.py --no-browser` — Start server without launching the browser window.
- `python main.py --port 8080` — Bind to a custom port.
- `python main.py --year 2024 --round 4 --session R` — Deep-link directly into a specific Grand Prix session.
- `python main.py --cli` — Interactive terminal menu for session selection.

---

## Developer Workflow

### Backend (Python / FastAPI)
```bash
# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate  # Windows: venv\Scripts\activate | Unix: source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run backend unit & integration tests
pytest tests/web/

# Start FastAPI dev server
python main.py
```

### Frontend (React 19 / TypeScript / Vite)
```bash
cd web

# Install dependencies
npm install

# Start Vite dev server with Hot Module Replacement (HMR)
npm run dev

# Run Vitest unit tests
npm test

# Typecheck and linting
npm run typecheck
npm run lint

# Production bundle build (outputs to web/dist/)
npm run build

# Playwright E2E and visual tests
npx playwright test
```

---

## Keyboard Controls & Navigation

| Key | Action |
|---|---|
| `Space` | Play / Pause replay toggle |
| `←` / `→` | Step playback ±10 seconds |
| `Shift` + `←` / `→` | Step playback ±1 whole lap |
| `↑` / `↓` | Adjust playback speed rate (0.25× – 32×) |
| `1` – `4` | Direct speed jump (1×, 2×, 4×, 8×) |
| `R` | Restart playback from lap 1 |
| `D` | Toggle DRS detection & activation zones |
| `B` | Toggle timeline progress bar |
| `L` | Cycle driver labels (Code / Number / Off) |
| `P` | Export high-resolution PNG composite snapshot |
| `Ctrl` + `K` | Open Command Palette |
| `H` / `?` | Open Keyboard Shortcuts & Help modal |
| `Esc` | Clear driver selection or close open dialogs |

---

## Project Structure

```
f1-race-replay/
├── main.py                     # Main application entry point & production runner
├── run.bat / run.sh            # Bootstrap launch scripts
├── requirements.txt            # Python dependencies (FastAPI, FastF1, scikit-learn, etc.)
├── src/
│   ├── f1_data.py              # Telemetry ingestion, caching, and distance calculations
│   ├── bayesian_tyre_model.py  # Bayesian tyre degradation model
│   ├── cli/                    # Interactive command-line race selector
│   ├── ml/                     # Extracted Qt-free ML feature engineering & models
│   │   ├── features.py         # Telemetry feature matrix extractor
│   │   ├── overtake.py         # Overtake probability inference
│   │   ├── pit.py              # Pit stop window prediction
│   │   └── registry.py         # Session ML cache registry
│   └── web/                    # FastAPI backend service
│       ├── app.py              # FastAPI app, GZip & static SPA serving
│       ├── config.py           # Server host/port/CORS configuration
│       ├── jobs.py             # Asynchronous FastF1 session loader & SSE manager
│       ├── routers/            # Health, seasons, sessions, settings, qualifying
│       └── services/           # Frame chunk encoder, track geometry, ML service
├── web/                        # React 19 + TypeScript + Vite frontend
│   ├── dist/                   # Production build assets served by FastAPI
│   ├── src/
│   │   ├── api/                # API client and TypeScript types
│   │   ├── design/             # Tokens, typography, themes
│   │   ├── engine/             # PlaybackClock and zero-allocation FrameStore
│   │   ├── features/           # Workspace, timing tower, timeline, dockview panels
│   │   ├── render/             # PixiJS track canvas and render layers
│   │   ├── stores/             # Zustand state stores (session, UI, selection, ML)
│   │   └── utils/              # Export utilities, formatting, toasts
│   └── e2e/                    # Playwright test specs (a11y, responsive, soak, visual)
├── tests/web/                  # Backend test suite (56 tests)
└── docs/web-revamp/            # Design system, API contract, and phase specifications
```

---

## Data Attribution & Machine Learning Caveats

- **Timing & Telemetry Data:** Telemetry data is fetched from the [FastF1](https://github.com/theOehrly/Fast-F1) Python library using publicly accessible official timing feeds. Formula 1, F1, and related marks are trademarks of Formula One Licensing B.V.
- **Predictive ML Models:** Overtake and pit prediction models are trained on physics-based race simulation datasets. All predictive percentages are displayed with explicit **"est."** indicators and reflect statistical approximations rather than deterministic outcomes.
