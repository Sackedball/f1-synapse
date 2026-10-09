import { Container, Graphics } from 'pixi.js';
import { Camera, Point2D } from '../camera';
import { Snapshot } from '@/engine/snapshot';
import { DriverInfo } from '@/api/types';
import { canvasPalette, parseColor } from '../palette';
import { CarScreenPosition } from '../hitTest';
import { useSelectionStore } from '@/stores/selectionStore';

const MAX_DRIVERS = 24;

export class CarsLayer {
  readonly container: Container;
  private readonly graphics: Graphics;
  private readonly haloGraphics: Graphics;

  // Screen positions for hit-testing and labels
  private carPositionsPool: CarScreenPosition[] = Array.from({ length: MAX_DRIVERS }, () => ({
    code: '',
    x: 0,
    y: 0,
    index: 0,
  }));
  private carPositions: CarScreenPosition[] = [];
  private chevronScratch: number[] = [0, 0, 0, 0, 0, 0, 0, 0];

  // Previous world positions for heading estimation
  private prevWorldX = new Float32Array(MAX_DRIVERS);
  private prevWorldY = new Float32Array(MAX_DRIVERS);
  private headings = new Float32Array(MAX_DRIVERS);
  private hasPrevPos = new Uint8Array(MAX_DRIVERS);
  private lastTime = -1;

  private scratchPt: Point2D = { x: 0, y: 0 };

  constructor() {
    this.container = new Container();
    this.haloGraphics = new Graphics();
    this.graphics = new Graphics();

    this.container.addChild(this.haloGraphics);
    this.container.addChild(this.graphics);
  }

  getCarScreenPositions(): CarScreenPosition[] {
    return this.carPositions;
  }

  render(
    camera: Camera,
    snapshot: Snapshot,
    drivers: DriverInfo[],
    time: number,
    selectedDriver: string | null = null,
    hoveredDriver: string | null = null,
    compareDrivers: string[] = [],
    focusMode = false,
    reducedMotion = false,
    playbackRate = 1.0,
  ): void {
    this.graphics.clear();
    this.haloGraphics.clear();
    this.carPositions.length = 0;

    // Reset heading history on seek/rewind discontinuity
    const maxAllowedStep = Math.max(1.5, playbackRate * 0.12);
    if (this.lastTime >= 0 && (time < this.lastTime || Math.abs(time - this.lastTime) > maxAllowedStep)) {
      this.hasPrevPos.fill(0);
    }
    this.lastTime = time;

    const n = Math.min(snapshot.n, drivers.length, MAX_DRIVERS);
    if (n === 0) return;

    // Pulse animation phase
    const pulse = reducedMotion ? 1.0 : 0.5 + 0.5 * Math.sin(time * 6);

    // Compute heading and screen coords for all drivers
    for (let d = 0; d < n; d++) {
      const status = snapshot.status[d];
      if (status === 2) continue; // Not started

      const wx = snapshot.x[d];
      const wy = snapshot.y[d];
      if (isNaN(wx) || isNaN(wy)) continue;

      camera.worldToScreen(wx, wy, this.scratchPt);
      const sx = this.scratchPt.x;
      const sy = this.scratchPt.y;

      const driver = drivers[d];
      if (driver && this.carPositions.length < MAX_DRIVERS) {
        const cp = this.carPositionsPool[this.carPositions.length];
        cp.code = driver.code;
        cp.x = sx;
        cp.y = sy;
        cp.index = d;
        this.carPositions.push(cp);
      }

      // Heading calculation along motion vector
      if (this.hasPrevPos[d]) {
        const dx = wx - this.prevWorldX[d];
        const dy = wy - this.prevWorldY[d];
        if (dx * dx + dy * dy > 0.0001) {
          this.headings[d] = camera.calculateScreenHeading(dx, dy);
        }
      }
      this.prevWorldX[d] = wx;
      this.prevWorldY[d] = wy;
      this.hasPrevPos[d] = 1;
    }

    // Render cars in reverse position order (P20 to P1) so leader is on top
    for (let p = n - 1; p >= 0; p--) {
      const d = snapshot.orderByPosition ? snapshot.orderByPosition[p] : p;
      if (d >= n) continue;

      const status = snapshot.status[d];
      if (status === 2) continue; // Not started

      const driver = drivers[d];
      if (!driver) continue;

      const wx = snapshot.x[d];
      const wy = snapshot.y[d];
      if (isNaN(wx) || isNaN(wy)) continue;

      camera.worldToScreen(wx, wy, this.scratchPt);
      const sx = this.scratchPt.x;
      const sy = this.scratchPt.y;

      const isSelected = selectedDriver === driver.code;
      const isHovered = hoveredDriver === driver.code;
      const isCompare = compareDrivers.includes(driver.code);
      const isFocused = isSelected || isCompare;

      // Alpha handling for focus mode and pit lane
      let carAlpha = 1.0;
      if (focusMode && !isFocused) {
        carAlpha = 0.25;
      }
      if (snapshot.inPit[d] === 1) {
        carAlpha *= 0.6;
      }

      // Retired car rendering
      if (status === 1) {
        // Grey cross
        const crossSize = 5;
        this.graphics
          .moveTo(sx - crossSize, sy - crossSize)
          .lineTo(sx + crossSize, sy + crossSize)
          .moveTo(sx + crossSize, sy - crossSize)
          .lineTo(sx - crossSize, sy + crossSize)
          .stroke({ width: 2, color: canvasPalette.textDisabled, alpha: 0.7 });
        continue;
      }

      const teamColor = parseColor(driver.color, canvasPalette.text1);
      const baseRadius = 7.5;
      const radius = isSelected ? baseRadius * 1.28 : isHovered ? baseRadius * 1.15 : baseRadius;

      // 1. Soft team-colored ambient halo on track
      this.haloGraphics
        .circle(sx, sy, radius + 2.5)
        .stroke({ width: 3.5, color: teamColor, alpha: carAlpha * 0.28 });

      // 2. Selection halo ring with pulsing glow
      if (isSelected || isCompare) {
        const haloR = radius + 4 + pulse * 2.5;
        this.haloGraphics
          .circle(sx, sy, haloR)
          .stroke({
            width: 2.5,
            color: isSelected ? canvasPalette.haloWhite : canvasPalette.accent,
            alpha: 0.9 + pulse * 0.1,
          });

        this.haloGraphics
          .circle(sx, sy, haloR + 3)
          .stroke({
            width: 4,
            color: isSelected ? canvasPalette.haloWhite : canvasPalette.accent,
            alpha: 0.25 * pulse,
          });
      }

      // 2b. Key-moment jump radial pulse (expanding ring fading from 0.6 to 0 over 320ms)
      if (!reducedMotion) {
        const pulseState = useSelectionStore.getState();
        if (pulseState.lastMomentPulseDriver === driver.code) {
          const dt = performance.now() - pulseState.lastMomentPulseTime;
          if (dt >= 0 && dt <= 320) {
            const progress = dt / 320;
            const pulseRadius = radius + progress * 24;
            const pulseAlpha = 0.6 * (1 - progress);
            this.haloGraphics
              .circle(sx, sy, pulseRadius)
              .stroke({
                width: 2.5,
                color: canvasPalette.accent,
                alpha: pulseAlpha,
              });
          }
        }
      }

      // 3. DRS Open indicator ring
      if (snapshot.drs[d] === 2) {
        const drsR = radius + 3.0 + (reducedMotion ? 0 : pulse * 1.5);
        this.haloGraphics
          .circle(sx, sy, drsR)
          .stroke({
            width: 2,
            color: canvasPalette.drsZoneActive,
            alpha: 0.95,
          });
      }

      // 4. Team-colored car disc with crisp dark outline
      this.graphics
        .circle(sx, sy, radius)
        .fill({ color: teamColor, alpha: carAlpha })
        .stroke({ width: 1.5, color: canvasPalette.carOutline, alpha: carAlpha * 0.95 });

      // 5. Direction chevron / nose indicator along heading
      const heading = this.headings[d];
      const cosH = Math.cos(heading);
      const sinH = Math.sin(heading);

      const noseX = sx + cosH * (radius + 2);
      const noseY = sy + sinH * (radius + 2);
      const leftWingX = sx + Math.cos(heading + 2.5) * (radius * 0.75);
      const leftWingY = sy + Math.sin(heading + 2.5) * (radius * 0.75);
      const rightWingX = sx + Math.cos(heading - 2.5) * (radius * 0.75);
      const rightWingY = sy + Math.sin(heading - 2.5) * (radius * 0.75);

      this.chevronScratch[0] = noseX;
      this.chevronScratch[1] = noseY;
      this.chevronScratch[2] = leftWingX;
      this.chevronScratch[3] = leftWingY;
      this.chevronScratch[4] = sx;
      this.chevronScratch[5] = sy;
      this.chevronScratch[6] = rightWingX;
      this.chevronScratch[7] = rightWingY;

      this.graphics
        .poly(this.chevronScratch)
        .fill({ color: canvasPalette.text1, alpha: carAlpha * 0.95 });

      // 6. Position rank badge indicator (P1 gold halo ring)
      const pos = (snapshot.position ? snapshot.position[d] : 0) + 1;
      if (pos === 1) {
        this.graphics
          .circle(sx, sy, radius + 2)
          .stroke({ width: 1.5, color: canvasPalette.warning, alpha: carAlpha * 0.95 });
      }

      // 7. Pit lane badge "P"
      if (snapshot.inPit[d] === 1) {
        const badgeX = sx + radius + 3;
        const badgeY = sy - radius - 2;
        this.graphics
          .circle(badgeX, badgeY, 4.5)
          .fill({ color: canvasPalette.warning, alpha: 0.9 })
          .stroke({ width: 1, color: canvasPalette.carOutline, alpha: 0.85 });
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
