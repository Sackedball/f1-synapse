import { Container, Graphics } from 'pixi.js';
import { Camera, Point2D } from '../camera';
import { Snapshot } from '@/engine/snapshot';
import { DriverInfo } from '@/api/types';
import { parseColor } from '../palette';

const MAX_DRIVERS = 24;
const MAX_POINTS = 30;

export class TrailsLayer {
  readonly container: Container;
  private readonly graphics: Graphics;

  // Preallocated flat typed arrays for ring buffers
  private ringX = new Float32Array(MAX_DRIVERS * MAX_POINTS);
  private ringY = new Float32Array(MAX_DRIVERS * MAX_POINTS);
  private ringHead = new Int32Array(MAX_DRIVERS);
  private ringCount = new Int32Array(MAX_DRIVERS);
  private lastSampleTimes = new Float32Array(MAX_DRIVERS);

  private lastTime = -1;
  private scratchPt: Point2D = { x: 0, y: 0 };
  private ptsBuffer: Point2D[] = [];

  constructor() {
    this.container = new Container();
    this.graphics = new Graphics();
    this.graphics.blendMode = 'add';
    this.container.addChild(this.graphics);

    for (let i = 0; i < MAX_POINTS; i++) {
      this.ptsBuffer.push({ x: 0, y: 0 });
    }
  }

  clear(): void {
    this.ringHead.fill(0);
    this.ringCount.fill(0);
    this.lastSampleTimes.fill(-1);
    this.graphics.clear();
  }

  render(
    camera: Camera,
    snapshot: Snapshot,
    drivers: DriverInfo[],
    time: number,
    performanceMode: boolean,
    trailsLengthSec = 3,
    selectedDriver: string | null = null,
    focusMode = false,
    playbackRate = 1.0,
  ): void {
    this.graphics.clear();

    // If performance mode is active or trails are disabled, clear and exit
    if (performanceMode || trailsLengthSec <= 0) {
      return;
    }

    // Reset on seek or rewind (backward jump, or forward jump exceeding allowed frame delta)
    const maxAllowedStep = Math.max(1.5, playbackRate * 0.12);
    if (this.lastTime >= 0 && (time < this.lastTime || time - this.lastTime > maxAllowedStep)) {
      this.clear();
    }
    this.lastTime = time;

    const sampleInterval = Math.max(0.04, trailsLengthSec / MAX_POINTS);
    const n = Math.min(snapshot.n, drivers.length, MAX_DRIVERS);

    // Update ring buffers
    for (let d = 0; d < n; d++) {
      if (snapshot.status[d] === 2) continue; // Not started
      const wx = snapshot.x[d];
      const wy = snapshot.y[d];
      if (isNaN(wx) || isNaN(wy)) continue;

      const lastT = this.lastSampleTimes[d];
      if (lastT < 0 || time - lastT >= sampleInterval) {
        this.lastSampleTimes[d] = time;

        const count = this.ringCount[d];
        const nextHead = count === 0 ? 0 : (this.ringHead[d] + 1) % MAX_POINTS;
        this.ringHead[d] = nextHead;

        const offset = d * MAX_POINTS + nextHead;
        this.ringX[offset] = wx;
        this.ringY[offset] = wy;

        if (count < MAX_POINTS) {
          this.ringCount[d] = count + 1;
        }
      }
    }

    // Render additive-blend comet trails
    for (let d = 0; d < n; d++) {
      const rawCount = this.ringCount[d];
      if (rawCount < 2) continue;

      const speed = snapshot.speed ? snapshot.speed[d] : 0;
      // Suppress trails when car is nearly stationary (< 10 km/h)
      if (speed < 10) continue;

      const speedScale = Math.min(1.0, Math.max(0.2, speed / 260));
      const count = Math.max(2, Math.round(rawCount * speedScale));

      const driver = drivers[d];
      const isSelected = selectedDriver === driver?.code;
      const baseAlpha = focusMode && !isSelected ? 0.15 : 0.80;
      const teamColor = parseColor(driver?.color, 0xffffff);

      const head = this.ringHead[d];
      let validPts = 0;

      for (let i = 0; i < count; i++) {
        // Read from oldest to newest within the speed-scaled window
        const idx = (head - count + 1 + i + MAX_POINTS) % MAX_POINTS;
        const offset = d * MAX_POINTS + idx;
        const wx = this.ringX[offset];
        const wy = this.ringY[offset];

        camera.worldToScreen(wx, wy, this.scratchPt);
        this.ptsBuffer[validPts].x = this.scratchPt.x;
        this.ptsBuffer[validPts].y = this.scratchPt.y;
        validPts++;
      }

      // Draw tapered additive "comet" segments
      for (let i = 0; i < validPts - 1; i++) {
        const p1 = this.ptsBuffer[i];
        const p2 = this.ptsBuffer[i + 1];

        // Fraction from 0 (oldest tail tip) to 1 (newest under car)
        const progress = (i + 1) / validPts;
        const width = 0.8 + progress * progress * 3.8;
        const alpha = baseAlpha * (0.05 + progress * 0.95);

        this.graphics
          .moveTo(p1.x, p1.y)
          .lineTo(p2.x, p2.y)
          .stroke({ width, color: teamColor, alpha });
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
