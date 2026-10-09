import { Application, Container } from 'pixi.js';
import { Camera } from './camera';
import { BackgroundLayer } from './layers/BackgroundLayer';
import { TrackAsphaltLayer } from './layers/TrackAsphaltLayer';
import { MiniSectorsLayer } from './layers/MiniSectorsLayer';
import { DrsBandsLayer } from './layers/DrsBandsLayer';
import { FinishLineLayer } from './layers/FinishLineLayer';
import { CornersLayer } from './layers/CornersLayer';
import { TrailsLayer } from './layers/TrailsLayer';
import { CarsLayer } from './layers/CarsLayer';
import { LabelsLayer } from './layers/LabelsLayer';
import { SafetyCarLayer } from './layers/SafetyCarLayer';
import { FocusDimLayer } from './layers/FocusDimLayer';
import { FpsOverlay } from './layers/FpsOverlay';
import { MlOverlay } from './layers/MlOverlay';
import { findNearestCar } from './hitTest';
import { canvasPalette } from './palette';

import { PlaybackClock } from '@/engine/PlaybackClock';
import { FrameStore } from '@/engine/FrameStore';
import { Snapshot, createSnapshot } from '@/engine/snapshot';
import { TrackGeometry, DriverInfo } from '@/api/types';
import { useUiStore, useSelectionStore, useSettingsStore } from '@/stores';

export interface DriverTooltipData {
  code: string;
  name: string;
  team: string;
  color: string;
  position: number;
  speed: number;
  gear: number;
  drs: number;
}

export interface TrackRendererOptions {
  clock: PlaybackClock | null;
  store: FrameStore | null;
  track: TrackGeometry | null;
  drivers: DriverInfo[];
  onHoverDriver?: (
    code: string | null,
    screenPos?: { x: number; y: number },
    data?: DriverTooltipData,
  ) => void;
}

export class TrackRenderer {
  readonly camera: Camera;
  private app: Application | null = null;
  private containerElement: HTMLElement | null = null;
  private destroyed = false;

  // Clock & Store
  private clock: PlaybackClock | null = null;
  private store: FrameStore | null = null;
  private track: TrackGeometry | null = null;
  private drivers: DriverInfo[] = [];
  private snapshot: Snapshot | null = null;

  // Layers in bottom-to-top order
  private backgroundLayer!: BackgroundLayer;
  private trackAsphaltLayer!: TrackAsphaltLayer;
  private miniSectorsLayer!: MiniSectorsLayer;
  private drsBandsLayer!: DrsBandsLayer;
  private finishLineLayer!: FinishLineLayer;
  private cornersLayer!: CornersLayer;
  private trailsLayer!: TrailsLayer;
  private carsLayer!: CarsLayer;
  private labelsLayer!: LabelsLayer;
  private safetyCarLayer!: SafetyCarLayer;
  private mlOverlay!: MlOverlay;
  readonly overlayHook: Container = new Container();
  private focusDimLayer!: FocusDimLayer;
  private fpsOverlay!: FpsOverlay;

  // Unsubscribe callbacks
  private unsubClock: (() => void) | null = null;
  private unsubUiStore: (() => void) | null = null;
  private unsubSelectionStore: (() => void) | null = null;
  private unsubSettingsStore: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // Interaction state
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragMoved = false;
  private hoveredDriverCode: string | null = null;
  private onHoverDriverCallback?: TrackRendererOptions['onHoverDriver'];

  // Cached state from stores
  private showLabels = true;
  private labelMode: 'code' | 'number' = 'code';
  private showDrsZones = true;
  private performanceMode = false;
  private showMlInsights = true;
  private showTrackMlChips = true;
  private northUp = false;
  private focusMode = false;
  private trailsLength = 3;
  private selectedDriver: string | null = null;
  private compareDrivers: string[] = [];

  // Multi-touch pinch tracking
  private activePointers = new Map<number, { clientX: number; clientY: number }>();
  private initialPinchDist = 0;

  private initialized = false;

  constructor(options: TrackRendererOptions) {
    this.clock = options.clock;
    this.store = options.store;
    this.track = options.track;
    this.drivers = options.drivers || [];
    this.onHoverDriverCallback = options.onHoverDriver;

    this.camera = new Camera(800, 600);
    this.snapshot = createSnapshot(Math.max(20, this.drivers.length));

    // Initialize all layers eagerly so they are never undefined
    this.backgroundLayer = new BackgroundLayer();
    this.trackAsphaltLayer = new TrackAsphaltLayer();
    this.miniSectorsLayer = new MiniSectorsLayer();
    this.drsBandsLayer = new DrsBandsLayer();
    this.finishLineLayer = new FinishLineLayer();
    this.cornersLayer = new CornersLayer();
    this.trailsLayer = new TrailsLayer();
    this.carsLayer = new CarsLayer();
    this.labelsLayer = new LabelsLayer();
    this.safetyCarLayer = new SafetyCarLayer();
    this.mlOverlay = new MlOverlay();
    this.focusDimLayer = new FocusDimLayer();
    this.fpsOverlay = new FpsOverlay();
  }

  async init(container: HTMLElement): Promise<void> {
    this.containerElement = container;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const app = new Application();
    this.app = app;

    const isPerfMode = useSettingsStore.getState().performanceMode;
    const targetDpr = isPerfMode ? 1 : Math.min(window.devicePixelRatio || 1, 2);

    await app.init({
      width,
      height,
      backgroundColor: canvasPalette.surface0,
      antialias: !isPerfMode,
      autoDensity: true,
      resolution: targetDpr,
    });

    if (this.destroyed || !this.containerElement) {
      if (app.renderer) {
        try {
          app.destroy(true, { children: true });
        } catch {
          // Ignore unmount error
        }
      }
      return;
    }

    container.appendChild(app.canvas);
    this.camera.setViewport(width, height);

    if (this.track && this.track.bounds) {
      this.camera.setBounds(this.track.bounds, this.track.rotationDeg || 0);
    }

    // Add layer containers to Pixi stage
    app.stage.addChild(this.backgroundLayer.container);
    app.stage.addChild(this.trackAsphaltLayer.container);
    app.stage.addChild(this.miniSectorsLayer.container);
    app.stage.addChild(this.drsBandsLayer.container);
    app.stage.addChild(this.finishLineLayer.container);
    app.stage.addChild(this.cornersLayer.container);
    app.stage.addChild(this.trailsLayer.container);
    app.stage.addChild(this.carsLayer.container);
    app.stage.addChild(this.labelsLayer.container);
    app.stage.addChild(this.safetyCarLayer.container);
    app.stage.addChild(this.mlOverlay.container);
    app.stage.addChild(this.overlayHook);
    app.stage.addChild(this.focusDimLayer.container);
    app.stage.addChild(this.fpsOverlay.container);

    this.initialized = true;

    // 2. Subscribe to store changes without triggering React re-renders
    const initUi = useUiStore.getState();
    this.showLabels = initUi.showLabels;
    this.labelMode = initUi.labelMode;
    this.showDrsZones = initUi.showDrsZones;
    this.performanceMode = initUi.performanceMode;
    this.northUp = initUi.northUp;
    this.focusMode = initUi.focusMode;
    this.trailsLength = initUi.trailsLength;
    this.fpsOverlay.setVisible(initUi.showFps);

    this.unsubUiStore = useUiStore.subscribe((state) => {
      this.showLabels = state.showLabels;
      this.labelMode = state.labelMode;
      this.showDrsZones = state.showDrsZones;
      this.performanceMode = state.performanceMode;
      this.trailsLength = state.trailsLength;
      this.focusMode = state.focusMode;
      this.fpsOverlay.setVisible(state.showFps);

      if (this.northUp !== state.northUp) {
        this.northUp = state.northUp;
        this.camera.setNorthUp(this.northUp, this.track?.rotationDeg || 0);
      }

      if (this.camera.mode !== state.cameraMode) {
        this.camera.setMode(state.cameraMode);
      }
      this.requestRender(true);
    });

    const initSel = useSelectionStore.getState();
    this.selectedDriver = initSel.selectedDriver;
    this.compareDrivers = initSel.compareDrivers;

    this.unsubSelectionStore = useSelectionStore.subscribe((state) => {
      this.selectedDriver = state.selectedDriver;
      this.compareDrivers = state.compareDrivers;
      this.requestRender(true);
    });

    const initSettings = useSettingsStore.getState();
    this.showMlInsights = initSettings.showMlInsights;
    this.showTrackMlChips = initSettings.showTrackMlChips;

    this.unsubSettingsStore = useSettingsStore.subscribe((state) => {
      this.showMlInsights = state.showMlInsights;
      this.showTrackMlChips = state.showTrackMlChips;
      this.requestRender();
    });

    // 3. Attach DOM interaction events
    this.attachEvents(container);

    // 4. Setup explicit ResizeObserver
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0 && this.app?.renderer) {
          this.app.renderer.resize(width, height);
          this.camera.setViewport(width, height);
          if (this.clock) {
            this.renderFrame(this.clock.raceTime);
          }
        }
      }
    });
    this.resizeObserver.observe(container);

    // 5. Subscribe to PlaybackClock
    if (this.clock) {
      this.unsubClock = this.clock.subscribe((t) => {
        this.renderFrame(t);
      });
      // Initial render
      this.renderFrame(this.clock.raceTime);
    }
  }

  setDependencies(clock: PlaybackClock | null, store: FrameStore | null, track: TrackGeometry | null, drivers: DriverInfo[]): void {
    const clockChanged = this.clock !== clock;
    if (clockChanged) {
      this.unsubClock?.();
      this.clock = clock;
      if (this.clock) {
        this.unsubClock = this.clock.subscribe((t) => this.renderFrame(t));
      }
    }

    this.store = store;
    this.track = track;
    this.drivers = drivers || [];

    if (this.track && this.track.bounds) {
      this.camera.setBounds(this.track.bounds, this.track.rotationDeg || 0);
    }

    if (this.drivers.length > 0 && (!this.snapshot || this.snapshot.n !== this.drivers.length)) {
      this.snapshot = createSnapshot(this.drivers.length);
    }

    if (this.initialized) {
      this.requestRender();
    }
  }

  setFocus(focus: boolean): void {
    this.focusMode = focus;
  }

  getOverlayHook(): Container {
    return this.overlayHook;
  }

  private attachEvents(container: HTMLElement): void {
    const onPointerDown = (e: PointerEvent) => {
      this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

      if (this.activePointers.size === 1) {
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.dragMoved = false;
      } else if (this.activePointers.size === 2) {
        this.isDragging = false;
        let pt0: { clientX: number; clientY: number } | null = null;
        let pt1: { clientX: number; clientY: number } | null = null;
        for (const p of this.activePointers.values()) {
          if (!pt0) pt0 = p;
          else if (!pt1) pt1 = p;
        }
        if (pt0 && pt1) {
          this.initialPinchDist = Math.hypot(
            pt0.clientX - pt1.clientX,
            pt0.clientY - pt1.clientY,
          );
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.activePointers.has(e.pointerId)) {
        this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
      }

      const rect = container.getBoundingClientRect();

      // Multi-touch pinch-to-zoom
      if (this.activePointers.size === 2 && this.initialPinchDist > 5) {
        let pt0: { clientX: number; clientY: number } | null = null;
        let pt1: { clientX: number; clientY: number } | null = null;
        for (const p of this.activePointers.values()) {
          if (!pt0) pt0 = p;
          else if (!pt1) pt1 = p;
        }
        if (pt0 && pt1) {
          const currentDist = Math.hypot(
            pt0.clientX - pt1.clientX,
            pt0.clientY - pt1.clientY,
          );
          if (currentDist > 5) {
            const factor = currentDist / this.initialPinchDist;
            const midX = (pt0.clientX + pt1.clientX) / 2 - rect.left;
            const midY = (pt0.clientY + pt1.clientY) / 2 - rect.top;
            this.camera.zoomAtScreenPoint(factor, midX, midY);
            this.initialPinchDist = currentDist;
            useUiStore.getState().setCameraMode('free');
            this.requestRender();
          }
        }
        return;
      }

      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (this.isDragging && this.activePointers.size === 1) {
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        if (dx * dx + dy * dy > 9) {
          this.dragMoved = true;
        }
        this.camera.panByScreenDelta(dx, dy);
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        useUiStore.getState().setCameraMode('free');
        this.requestRender();
      } else if (!this.isDragging) {
        // Hit test for hovered car
        const carPositions = this.carsLayer.getCarScreenPositions();
        const hit = findNearestCar(sx, sy, carPositions, 15);

        if (hit) {
          container.style.cursor = 'pointer';
          this.hoveredDriverCode = hit.code;
          useSelectionStore.getState().setHoveredDriver(hit.code);

          if (this.onHoverDriverCallback && this.snapshot && hit.index >= 0) {
            const driver = this.drivers[hit.index];
            const data: DriverTooltipData = {
              code: driver?.code || hit.code,
              name: driver?.fullName || hit.code,
              team: driver?.team || '',
              color: driver?.color || '#ffffff',
              position: (this.snapshot.position ? this.snapshot.position[hit.index] : 0) + 1,
              speed: Math.round(this.snapshot.speed ? this.snapshot.speed[hit.index] : 0),
              gear: this.snapshot.gear ? this.snapshot.gear[hit.index] : 0,
              drs: this.snapshot.drs ? this.snapshot.drs[hit.index] : 0,
            };
            this.onHoverDriverCallback(hit.code, { x: sx, y: sy }, data);
          }
        } else {
          container.style.cursor = 'default';
          if (this.hoveredDriverCode) {
            this.hoveredDriverCode = null;
            useSelectionStore.getState().setHoveredDriver(null);
            this.onHoverDriverCallback?.(null);
          }
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      this.activePointers.delete(e.pointerId);
      if (this.activePointers.size === 0) {
        this.initialPinchDist = 0;
      }

      if (this.isDragging) {
        this.isDragging = false;
        if (!this.dragMoved) {
          // It was a click!
          const rect = container.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;

          const carPositions = this.carsLayer.getCarScreenPositions();
          const hit = findNearestCar(sx, sy, carPositions, 15);

          if (hit) {
            if (e.shiftKey || e.ctrlKey) {
              useSelectionStore.getState().toggleCompareDriver(hit.code);
            } else {
              useSelectionStore.getState().setSelectedDriver(hit.code);
            }
          }
        }
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      this.activePointers.delete(e.pointerId);
      if (this.activePointers.size === 0) {
        this.initialPinchDist = 0;
      }
      this.isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      this.camera.zoomAtScreenPoint(factor, sx, sy);
      useUiStore.getState().setCameraMode('free');
      this.requestRender();
    };

    const onDblClick = (e: MouseEvent) => {
      e.preventDefault();
      this.camera.resetToFit();
      useUiStore.getState().setCameraMode('fit');
      this.requestRender(true);
    };

    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerCancel);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('dblclick', onDblClick);

    this.cleanupEvents = () => {
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerCancel);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('dblclick', onDblClick);
    };
  }

  private cleanupEvents: (() => void) | null = null;
  private pausedAnimRaf: number | null = null;

  requestRender(animate = false): void {
    if (!this.initialized || this.destroyed || !this.app) return;
    if (this.clock?.status === 'playing') {
      return;
    }

    if (animate) {
      if (this.pausedAnimRaf) cancelAnimationFrame(this.pausedAnimRaf);
      let frames = 30; // 0.5s at 60fps
      const loop = () => {
        if (this.destroyed || this.clock?.status === 'playing') {
          this.pausedAnimRaf = null;
          return;
        }
        this.renderFrame(this.clock?.currentTime ?? 0);
        frames--;
        if (frames > 0) {
          this.pausedAnimRaf = requestAnimationFrame(loop);
        } else {
          this.pausedAnimRaf = null;
        }
      };
      this.pausedAnimRaf = requestAnimationFrame(loop);
    } else {
      this.renderFrame(this.clock?.currentTime ?? 0);
    }
  }

  renderFrame(time: number): void {
    if (!this.initialized || this.destroyed || !this.app || !this.store || !this.snapshot) return;

    const t0 = performance.now();

    // 1. Sample interpolated snapshot
    this.store.sample(time, this.snapshot);
    const t1 = performance.now();
    const sampleMs = t1 - t0;

    // 2. Camera follow target update
    if (this.selectedDriver) {
      let selIdx = -1;
      for (let i = 0; i < this.drivers.length; i++) {
        if (this.drivers[i].code === this.selectedDriver) {
          selIdx = i;
          break;
        }
      }
      if (selIdx >= 0 && !isNaN(this.snapshot.x[selIdx])) {
        this.camera.setFollowTarget(this.snapshot.x[selIdx], this.snapshot.y[selIdx]);
      } else {
        this.camera.clearFollowTarget();
      }
    } else {
      this.camera.clearFollowTarget();
    }

    this.camera.update(1 / 60);

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    // 3. Render layers in sequence
    this.backgroundLayer.render(this.camera);
    this.trackAsphaltLayer.render(this.camera, this.track, this.snapshot.trackStatus, 1 / 60);
    let isAnyDrsActive = false;
    if (this.snapshot?.drs) {
      for (let i = 0; i < this.snapshot.n; i++) {
        if (this.snapshot.drs[i] === 2) {
          isAnyDrsActive = true;
          break;
        }
      }
    }
    this.drsBandsLayer.render(this.camera, this.track, this.showDrsZones, isAnyDrsActive);
    this.finishLineLayer.render(this.camera, this.track, time);
    this.cornersLayer.render(this.camera, this.track);

    const playbackRate = this.clock?.rate ?? 1.0;

    this.trailsLayer.render(
      this.camera,
      this.snapshot,
      this.drivers,
      time,
      this.performanceMode,
      this.trailsLength,
      this.selectedDriver,
      this.focusMode,
      playbackRate,
    );

    this.carsLayer.render(
      this.camera,
      this.snapshot,
      this.drivers,
      time,
      this.selectedDriver,
      this.hoveredDriverCode,
      this.compareDrivers,
      this.focusMode,
      reducedMotion,
      playbackRate,
    );

    const carPositions = this.carsLayer.getCarScreenPositions();
    this.labelsLayer.render(
      this.camera,
      this.snapshot,
      this.drivers,
      carPositions,
      this.showLabels,
      this.selectedDriver,
      this.compareDrivers,
      this.labelMode,
      this.hoveredDriverCode,
    );

    this.safetyCarLayer.render(
      this.camera,
      this.snapshot,
      time,
      reducedMotion,
      playbackRate,
    );

    this.mlOverlay.render(
      this.camera,
      this.snapshot,
      this.drivers,
      this.performanceMode,
      this.showMlInsights,
      this.showTrackMlChips,
      this.selectedDriver,
    );

    this.focusDimLayer.render(
      this.camera,
      this.snapshot,
      this.drivers,
      this.selectedDriver,
      this.focusMode,
    );

    const t2 = performance.now();
    const renderMs = t2 - t1;

    this.fpsOverlay.updateMetrics(sampleMs, renderMs, carPositions.length);
  }

  getCanvas(): HTMLCanvasElement | null {
    return (this.app?.canvas as HTMLCanvasElement) || null;
  }

  async extractCanvas(): Promise<HTMLCanvasElement | null> {
    if (!this.app || !this.app.renderer) return null;
    try {
      const extracted = await this.app.renderer.extract.canvas(this.app.stage);
      return extracted as HTMLCanvasElement;
    } catch {
      return this.getCanvas();
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.pausedAnimRaf) {
      cancelAnimationFrame(this.pausedAnimRaf);
      this.pausedAnimRaf = null;
    }
    this.cleanupEvents?.();
    this.unsubClock?.();
    this.unsubUiStore?.();
    this.unsubSelectionStore?.();
    this.unsubSettingsStore?.();
    this.resizeObserver?.disconnect();

    this.backgroundLayer?.destroy();
    this.trackAsphaltLayer?.destroy();
    this.miniSectorsLayer?.destroy();
    this.drsBandsLayer?.destroy();
    this.finishLineLayer?.destroy();
    this.cornersLayer?.destroy();
    this.trailsLayer?.destroy();
    this.carsLayer?.destroy();
    this.labelsLayer?.destroy();
    this.safetyCarLayer?.destroy();
    this.mlOverlay?.destroy();
    this.focusDimLayer?.destroy();
    this.fpsOverlay?.destroy();
    this.overlayHook?.destroy({ children: true });

    if (this.app) {
      if (this.app.renderer) {
        try {
          this.app.destroy(true, { children: true });
        } catch {
          // Ignore unmount error
        }
      }
      this.app = null;
    }
  }
}
