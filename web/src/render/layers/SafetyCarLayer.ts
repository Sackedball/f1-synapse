import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Camera, Point2D } from '../camera';
import { Snapshot } from '@/engine/snapshot';
import { canvasPalette } from '../palette';

const MAX_SC_TRAIL = 20;

export class SafetyCarLayer {
  readonly container: Container;
  private readonly graphics: Graphics;
  private readonly label: Text;
  private readonly banner: Text;

  private trailX = new Float32Array(MAX_SC_TRAIL);
  private trailY = new Float32Array(MAX_SC_TRAIL);
  private trailHead = 0;
  private trailCount = 0;
  private lastSampleTime = -1;
  private lastTime = -1;
  private scratchPt: Point2D = { x: 0, y: 0 };

  constructor() {
    this.container = new Container();
    this.graphics = new Graphics();

    this.label = new Text({
      text: 'SC',
      style: new TextStyle({
        fontFamily: 'Titillium Web, sans-serif',
        fontSize: 10,
        fontWeight: '900',
        fill: canvasPalette.carOutline,
      }),
    });
    this.label.anchor.set(0.5);

    this.banner = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'Titillium Web, sans-serif',
        fontSize: 10,
        fontWeight: 'bold',
        fill: canvasPalette.scOrange,
      }),
    });
    this.banner.anchor.set(0, 0.5);

    this.container.addChild(this.graphics);
    this.container.addChild(this.label);
    this.container.addChild(this.banner);
  }

  clear(): void {
    this.trailCount = 0;
    this.trailHead = 0;
    this.lastSampleTime = -1;
    this.graphics.clear();
    this.label.visible = false;
    this.banner.visible = false;
  }

  render(
    camera: Camera,
    snapshot: Snapshot,
    time: number,
    reducedMotion = false,
    playbackRate = 1.0,
  ): void {
    this.graphics.clear();

    let scX = snapshot.scX;
    let scY = snapshot.scY;
    let scPhase = snapshot.scPhase;

    const isScActive = scPhase > 0 || snapshot.trackStatus === 2;

    if (isScActive && (isNaN(scX) || isNaN(scY) || scPhase === 0)) {
      // Synthesize SC ahead of the race leader on track
      const leaderIdx = snapshot.orderByPosition ? snapshot.orderByPosition[0] : 0;
      if (leaderIdx !== undefined && !isNaN(snapshot.x[leaderIdx])) {
        const lx = snapshot.x[leaderIdx];
        const ly = snapshot.y[leaderIdx];
        // Calculate tangent if speed > 0 or default offset
        const spd = snapshot.speed ? snapshot.speed[leaderIdx] : 0;
        const forwardOffset = Math.max(15, Math.min(35, spd * 0.4));
        scX = lx + forwardOffset;
        scY = ly + forwardOffset;
        scPhase = 2; // on_track
      }
    }

    if (!isScActive || isNaN(scX) || isNaN(scY)) {
      this.clear();
      return;
    }

    // Reset on seek or rewind (backward jump, or forward jump exceeding allowed frame delta)
    const maxAllowedStep = Math.max(1.5, playbackRate * 0.12);
    if (this.lastTime >= 0 && (time < this.lastTime || time - this.lastTime > maxAllowedStep)) {
      this.clear();
    }
    this.lastTime = time;

    // Sample trail
    if (this.lastSampleTime < 0 || time - this.lastSampleTime >= 0.1) {
      this.lastSampleTime = time;
      this.trailHead = (this.trailHead + 1) % MAX_SC_TRAIL;
      this.trailX[this.trailHead] = scX;
      this.trailY[this.trailHead] = scY;
      if (this.trailCount < MAX_SC_TRAIL) {
        this.trailCount++;
      }
    }

    // Draw SC Trail if deploying or returning
    if (snapshot.scPhase === 1 || snapshot.scPhase === 3) {
      for (let i = 0; i < this.trailCount - 1; i++) {
        const idx1 = (this.trailHead - this.trailCount + 1 + i + MAX_SC_TRAIL) % MAX_SC_TRAIL;
        const idx2 = (idx1 + 1) % MAX_SC_TRAIL;

        camera.worldToScreen(this.trailX[idx1], this.trailY[idx1], this.scratchPt);
        const x1 = this.scratchPt.x;
        const y1 = this.scratchPt.y;

        camera.worldToScreen(this.trailX[idx2], this.trailY[idx2], this.scratchPt);
        const x2 = this.scratchPt.x;
        const y2 = this.scratchPt.y;

        const progress = (i + 1) / this.trailCount;
        this.graphics
          .moveTo(x1, y1)
          .lineTo(x2, y2)
          .stroke({
            width: 2.5,
            color: canvasPalette.scOrange,
            alpha: 0.15 + progress * 0.6,
          });
      }
    }

    // Project SC location to screen
    camera.worldToScreen(scX, scY, this.scratchPt);
    const sx = this.scratchPt.x;
    const sy = this.scratchPt.y;

    const pulse = reducedMotion ? 1.0 : 0.5 + 0.5 * Math.sin(time * 8);

    // Pulsing outer orange halo
    const haloRadius = 12 + pulse * 4;
    this.graphics
      .circle(sx, sy, haloRadius)
      .stroke({
        width: 3,
        color: canvasPalette.scOrange,
        alpha: 0.35 * pulse,
      });

    // Solid SC Vehicle Circle
    const radius = 8;
    this.graphics
      .circle(sx, sy, radius)
      .fill({ color: canvasPalette.scOrange })
      .stroke({ width: 1.5, color: canvasPalette.carOutline, alpha: 0.9 });

    // Center "SC" text
    this.label.x = sx;
    this.label.y = sy;
    this.label.visible = true;

    // Status banner text
    let phaseText = 'SAFETY CAR';
    if (scPhase === 1) phaseText = 'SC - DEPLOYING';
    else if (scPhase === 3) phaseText = 'SC - IN THIS LAP';

    this.banner.text = phaseText;
    this.banner.x = sx + 12;
    this.banner.y = sy;
    this.banner.visible = true;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
