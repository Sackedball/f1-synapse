import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Camera, Point2D } from '../camera';
import { Snapshot } from '@/engine/snapshot';
import { DriverInfo } from '@/api/types';
import { useMlStore } from '@/stores/mlStore';

const MAX_CHIPS = 3;

interface ChipSlot {
  text: Text;
  attacker: string;
  defender: string;
  targetAlpha: number;
  currentAlpha: number;
}

export class MlOverlay {
  readonly container: Container;
  private readonly linesGraphics: Graphics;
  private readonly chipsGraphics: Graphics;
  private chipSlots: ChipSlot[] = [];

  private ptAttacker: Point2D = { x: 0, y: 0 };
  private ptDefender: Point2D = { x: 0, y: 0 };
  private lastRenderTime: number = performance.now();

  private chipTextStyle = new TextStyle({
    fontFamily: 'Titillium Web, sans-serif',
    fontSize: 10,
    fontWeight: 'bold',
    fill: 0xffffff,
    letterSpacing: 0.5,
  });

  constructor() {
    this.container = new Container();
    this.linesGraphics = new Graphics();
    this.chipsGraphics = new Graphics();

    this.container.addChild(this.linesGraphics);
    this.container.addChild(this.chipsGraphics);

    for (let i = 0; i < MAX_CHIPS; i++) {
      const text = new Text({ text: '', style: this.chipTextStyle });
      text.anchor.set(0.5);
      text.visible = false;
      this.container.addChild(text);

      this.chipSlots.push({
        text,
        attacker: '',
        defender: '',
        targetAlpha: 0,
        currentAlpha: 0,
      });
    }
  }

  render(
    camera: Camera,
    snapshot: Snapshot | null,
    drivers: DriverInfo[] = [],
    performanceMode: boolean,
    showMlInsights: boolean,
    showTrackMlChips: boolean,
    selectedDriver: string | null = null,
  ): void {
    const now = performance.now();
    const dtMs = Math.min(100, Math.max(1, now - this.lastRenderTime));
    this.lastRenderTime = now;

    this.linesGraphics.clear();
    this.chipsGraphics.clear();

    const count = Math.min(snapshot?.n ?? 0, drivers.length);

    if (
      performanceMode ||
      !showMlInsights ||
      !showTrackMlChips ||
      !snapshot ||
      count < 2
    ) {
      for (let i = 0; i < MAX_CHIPS; i++) {
        const slot = this.chipSlots[i];
        slot.targetAlpha = 0;
        slot.currentAlpha = 0;
        slot.text.visible = false;
      }
      return;
    }

    const mlStore = useMlStore.getState();
    const activeBattles = mlStore.getActiveBattles(snapshot.t);

    if (activeBattles.length === 0) {
      for (let i = 0; i < MAX_CHIPS; i++) {
        const slot = this.chipSlots[i];
        slot.targetAlpha = 0;
        slot.currentAlpha = Math.max(0, slot.currentAlpha - dtMs / 200);
        if (slot.currentAlpha <= 0.01) {
          slot.text.visible = false;
        } else {
          slot.text.alpha = slot.currentAlpha;
        }
      }
      return;
    }

    // Rank battles: highest probability first, or prioritized if selected
    // Dismiss < 20% unless selected
    const candidates: Array<{
      attacker: string;
      defender: string;
      prob: number;
      attIdx: number;
      defIdx: number;
    }> = [];

    for (let b = 0; b < activeBattles.length; b++) {
      const battle = activeBattles[b];
      const prob = mlStore.getOvertake(battle.attacker, battle.defender, snapshot.t);
      if (prob === null) continue;

      // Filter out low probability noise (< 30% threshold)
      if (prob < 0.30) continue;

      // Find indices in snapshot
      let attIdx = -1;
      let defIdx = -1;
      for (let c = 0; c < count; c++) {
        if (drivers[c]?.code === battle.attacker) attIdx = c;
        if (drivers[c]?.code === battle.defender) defIdx = c;
      }

      if (attIdx >= 0 && defIdx >= 0) {
        // Enforce strictly adjacent on-track cars (e.g. P2 attacking P1, P3 attacking P2)
        const attPos = snapshot.position ? snapshot.position[attIdx] : 0;
        const defPos = snapshot.position ? snapshot.position[defIdx] : 0;
        const posDiff = Math.abs(attPos - defPos);
        if (posDiff !== 1) continue;
        if (attPos <= defPos) continue;

        candidates.push({
          attacker: battle.attacker,
          defender: battle.defender,
          prob,
          attIdx,
          defIdx,
        });
      }
    }

    // Sort by prob descending (prioritize selected)
    candidates.sort((a, b) => {
      const aSel = selectedDriver && (a.attacker === selectedDriver || a.defender === selectedDriver) ? 1 : 0;
      const bSel = selectedDriver && (b.attacker === selectedDriver || b.defender === selectedDriver) ? 1 : 0;
      if (aSel !== bSel) return bSel - aSel;
      return b.prob - a.prob;
    });

    const topCandidates = candidates.slice(0, MAX_CHIPS);

    for (let i = 0; i < MAX_CHIPS; i++) {
      const slot = this.chipSlots[i];
      if (i < topCandidates.length) {
        const item = topCandidates[i];
        slot.attacker = item.attacker;
        slot.defender = item.defender;
        slot.targetAlpha = 1.0;
        slot.currentAlpha = Math.min(1.0, slot.currentAlpha + dtMs / 200);

        const ax = snapshot.x[item.attIdx];
        const ay = snapshot.y[item.attIdx];
        const dx = snapshot.x[item.defIdx];
        const dy = snapshot.y[item.defIdx];

        camera.worldToScreen(ax, ay, this.ptAttacker);
        camera.worldToScreen(dx, dy, this.ptDefender);

        const screenDist = Math.hypot(
          this.ptDefender.x - this.ptAttacker.x,
          this.ptDefender.y - this.ptAttacker.y,
        );

        if (screenDist > 15 && screenDist < 800) {
          // Draw curved spline arc connector
          const midX = (this.ptAttacker.x + this.ptDefender.x) / 2;
          const midY = (this.ptAttacker.y + this.ptDefender.y) / 2;

          // Perpendicular offset for curved arc
          const nx = -(this.ptDefender.y - this.ptAttacker.y) / screenDist;
          const ny = (this.ptDefender.x - this.ptAttacker.x) / screenDist;
          const curveOffset = Math.min(24, screenDist * 0.15);
          const ctrlX = midX + nx * curveOffset;
          const ctrlY = midY + ny * curveOffset;

          const alpha = slot.currentAlpha;

          // Glowing purple arc line
          this.linesGraphics
            .moveTo(this.ptAttacker.x, this.ptAttacker.y)
            .quadraticCurveTo(ctrlX, ctrlY, this.ptDefender.x, this.ptDefender.y)
            .stroke({
              width: 2,
              color: 0xa855f7, // --insight purple
              alpha: alpha * 0.85,
            });

          // Chip pill at arc midpoint
          const chipX = (midX + ctrlX) / 2;
          const chipY = (midY + ctrlY) / 2;
          const pct = Math.round(item.prob * 100);
          const chipText = `${pct}% est.`;

          slot.text.text = chipText;
          slot.text.x = chipX;
          slot.text.y = chipY;
          slot.text.alpha = alpha;
          slot.text.visible = true;

          const chipW = 54;
          const chipH = 18;

          // Pill background in dark purple with border
          this.chipsGraphics
            .roundRect(chipX - chipW / 2, chipY - chipH / 2, chipW, chipH, chipH / 2)
            .fill({ color: 0x1a0f2e, alpha: alpha * 0.92 })
            .stroke({ width: 1.2, color: 0xa855f7, alpha: alpha * 0.95 });
        } else {
          slot.text.visible = false;
        }
      } else {
        slot.targetAlpha = 0;
        slot.currentAlpha = Math.max(0, slot.currentAlpha - dtMs / 200);
        if (slot.currentAlpha <= 0.01) {
          slot.text.visible = false;
        } else {
          slot.text.alpha = slot.currentAlpha;
        }
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
