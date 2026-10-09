import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Camera } from '../camera';
import { Snapshot } from '@/engine/snapshot';
import { DriverInfo } from '@/api/types';
import { CarScreenPosition } from '../hitTest';
import { canvasPalette, parseColor } from '../palette';

const MAX_DRIVERS = 24;

interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// Candidate offset directions around the car: tight first, then extended
const CANDIDATE_OFFSETS = [
  { dx: 26, dy: 0 },    // E
  { dx: 22, dy: -14 },  // NE
  { dx: 0, dy: -18 },   // N
  { dx: -26, dy: 0 },   // W
  { dx: -22, dy: -14 }, // NW
  { dx: 22, dy: 14 },   // SE
  { dx: 0, dy: 18 },    // S
  { dx: -22, dy: 14 },  // SW
  // Extended offsets for crowded packs
  { dx: 40, dy: 0 },    // Far E
  { dx: 34, dy: -20 },  // Far NE
  { dx: 0, dy: -28 },   // Far N
  { dx: -40, dy: 0 },   // Far W
  { dx: 34, dy: 20 },   // Far SE
  { dx: 0, dy: 28 },    // Far S
];

export class LabelsLayer {
  readonly container: Container;
  private readonly bgGraphics: Graphics;
  private labels: Text[] = [];
  private rectPool: Rect[] = Array.from({ length: 150 }, () => ({
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
  }));
  private placedRectsCount = 0;
  private driverToCarPos: (CarScreenPosition | null)[] = new Array(MAX_DRIVERS).fill(null);
  private carRectIndices = new Int32Array(MAX_DRIVERS);
  private priorityIndices = new Int32Array(MAX_DRIVERS);
  private priorityCount = 0;

  private normalStyle = new TextStyle({
    fontFamily: 'Titillium Web, sans-serif',
    fontSize: 10,
    fontWeight: 'bold',
    fill: canvasPalette.text1,
    letterSpacing: 0.5,
  });

  private selectedStyle = new TextStyle({
    fontFamily: 'Titillium Web, sans-serif',
    fontSize: 10.5,
    fontWeight: '900',
    fill: canvasPalette.text1,
    letterSpacing: 0.5,
  });

  constructor() {
    this.container = new Container();
    this.bgGraphics = new Graphics();
    this.container.addChild(this.bgGraphics);

    // Preallocate text objects for up to MAX_DRIVERS
    for (let i = 0; i < MAX_DRIVERS; i++) {
      const txt = new Text({ text: '', style: this.normalStyle });
      txt.anchor.set(0.5);
      this.labels.push(txt);
      this.container.addChild(txt);
    }
  }

  render(
    camera: Camera,
    snapshot: Snapshot,
    drivers: DriverInfo[],
    carPositions: CarScreenPosition[],
    showLabels: boolean,
    selectedDriver: string | null = null,
    compareDrivers: string[] = [],
    labelMode: 'code' | 'number' = 'code',
    hoveredDriver: string | null = null,
  ): void {
    this.bgGraphics.clear();

    // Hide all if labels toggled off or zoomed extremely far out
    const isVisible = showLabels && camera.zoom >= camera.fitZoom * 0.45;
    if (!isVisible) {
      this.container.visible = false;
      return;
    }
    this.container.visible = true;

    // Reset placed rectangles and driver position lookup
    this.placedRectsCount = 0;
    this.driverToCarPos.fill(null);
    this.carRectIndices.fill(-1);

    for (let i = 0; i < carPositions.length; i++) {
      const cp = carPositions[i];
      if (cp.index >= 0 && cp.index < MAX_DRIVERS) {
        this.driverToCarPos[cp.index] = cp;
      }
      // Reserve car dot area so labels don't cover other cars
      if (this.placedRectsCount < this.rectPool.length) {
        if (cp.index >= 0 && cp.index < MAX_DRIVERS) {
          this.carRectIndices[cp.index] = this.placedRectsCount;
        }
        const pr = this.rectPool[this.placedRectsCount++];
        pr.minX = cp.x - 11;
        pr.minY = cp.y - 11;
        pr.maxX = cp.x + 11;
        pr.maxY = cp.y + 11;
      }
    }

    const n = Math.min(snapshot.n, drivers.length, MAX_DRIVERS);
    const isZoomedIn = camera.zoom > camera.fitZoom * 1.25;

    // Build priority list: selected/compare/hovered first, then P1-P3, then rest
    this.priorityCount = 0;

    // 1. High priority: selected, compare, hovered
    for (let d = 0; d < n; d++) {
      const code = drivers[d]?.code;
      if (code && (code === selectedDriver || code === hoveredDriver || compareDrivers.includes(code))) {
        this.priorityIndices[this.priorityCount++] = d;
      }
    }

    // 2. Normal priority: by race position
    for (let p = 0; p < n; p++) {
      const d = snapshot.orderByPosition ? snapshot.orderByPosition[p] : p;
      if (d < n) {
        // Zoomed-out default: only show P1-P3 + selected/hovered
        const pos = (snapshot.position ? snapshot.position[d] : 0);
        if (!isZoomedIn && pos > 3) {
          continue; // Skip lower positions when zoomed out
        }

        let alreadyAdded = false;
        for (let k = 0; k < this.priorityCount; k++) {
          if (this.priorityIndices[k] === d) {
            alreadyAdded = true;
            break;
          }
        }
        if (!alreadyAdded) {
          this.priorityIndices[this.priorityCount++] = d;
        }
      }
    }

    // Hide all text instances initially
    for (let i = 0; i < this.labels.length; i++) {
      this.labels[i].visible = false;
    }

    const labelW = 36;
    const labelH = 15;
    const barW = 3;

    for (let idx = 0; idx < this.priorityCount; idx++) {
      const d = this.priorityIndices[idx];
      const carPos = this.driverToCarPos[d];
      if (!carPos) continue;

      const driver = drivers[d];
      if (!driver) continue;

      const isSelected = selectedDriver === driver.code;
      const isCompare = compareDrivers.includes(driver.code);
      const isHovered = hoveredDriver === driver.code;
      const isPriority = isSelected || isCompare || isHovered;

      // Try candidate slots close to car
      let bestX = carPos.x + CANDIDATE_OFFSETS[0].dx;
      let bestY = carPos.y + CANDIDATE_OFFSETS[0].dy;
      let foundSlot = false;

      for (const slot of CANDIDATE_OFFSETS) {
        const cx = carPos.x + slot.dx;
        const cy = carPos.y + slot.dy;
        const cMinX = cx - labelW / 2;
        const cMinY = cy - labelH / 2;
        const cMaxX = cx + labelW / 2;
        const cMaxY = cy + labelH / 2;

        const ownRectIdx = d < MAX_DRIVERS ? this.carRectIndices[d] : -1;
        let collides = false;
        for (let r = 0; r < this.placedRectsCount; r++) {
          if (r === ownRectIdx) continue;
          const pr = this.rectPool[r];
          if (cMinX < pr.maxX && cMaxX > pr.minX && cMinY < pr.maxY && cMaxY > pr.minY) {
            collides = true;
            break;
          }
        }

        if (!collides) {
          bestX = cx;
          bestY = cy;
          foundSlot = true;
          if (this.placedRectsCount < this.rectPool.length) {
            const pr = this.rectPool[this.placedRectsCount++];
            pr.minX = cMinX;
            pr.minY = cMinY;
            pr.maxX = cMaxX;
            pr.maxY = cMaxY;
          }
          break;
        }
      }

      // If priority driver, force placement even if colliding
      if (!foundSlot && isPriority) {
        foundSlot = true;
        bestX = carPos.x + CANDIDATE_OFFSETS[0].dx;
        bestY = carPos.y + CANDIDATE_OFFSETS[0].dy;
      }

      // If non-priority driver could not find a clean slot near the car, drop it (avoids pileups!)
      if (foundSlot && d < this.labels.length) {
        const txt = this.labels[d];
        const mainText = labelMode === 'number' ? `#${driver.number}` : driver.code;
        if (txt.text !== mainText) {
          txt.text = mainText;
        }
        txt.style = isSelected ? this.selectedStyle : this.normalStyle;
        // Text is shifted slightly right to account for team color bar
        txt.x = bestX + barW / 2;
        txt.y = bestY;
        txt.visible = true;

        const pillLeft = bestX - labelW / 2;
        const pillTop = bestY - labelH / 2;
        const teamColor = parseColor(driver.color, canvasPalette.text1);

        // Thin leader line if label is offset > 28px from car
        const distToCar = Math.hypot(bestX - carPos.x, bestY - carPos.y);
        if (distToCar > 28) {
          // Connect car center to closest pill edge
          this.bgGraphics
            .moveTo(carPos.x, carPos.y)
            .lineTo(bestX, bestY)
            .stroke({ width: 1, color: canvasPalette.borderHi, alpha: 0.6 });
        }

        // Draw compact broadcast pill background
        this.bgGraphics
          .roundRect(pillLeft, pillTop, labelW, labelH, 2.5)
          .fill({ color: canvasPalette.labelBg, alpha: 0.92 })
          .stroke({
            width: 1,
            color: isSelected ? canvasPalette.haloWhite : canvasPalette.borderHi,
            alpha: isSelected ? 0.95 : 0.75,
          });

        // Team-color left vertical bar
        this.bgGraphics
          .roundRect(pillLeft, pillTop, barW, labelH, 1.5)
          .fill({ color: teamColor, alpha: 0.95 });
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
