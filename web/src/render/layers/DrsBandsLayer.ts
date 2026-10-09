import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Camera, Point2D } from '../camera';
import { TrackGeometry } from '@/api/types';
import { canvasPalette } from '../palette';

const MAX_ZONES = 6;

export class DrsBandsLayer {
  readonly container: Container;
  private readonly glowGraphics: Graphics;
  private readonly lineGraphics: Graphics;
  private readonly tagGraphics: Graphics;
  private tags: Text[] = [];
  private pt: Point2D = { x: 0, y: 0 };

  private tagStyle = new TextStyle({
    fontFamily: 'Titillium Web, sans-serif',
    fontSize: 8.5,
    fontWeight: 'bold',
    fill: canvasPalette.drsZone,
  });

  private activeTagStyle = new TextStyle({
    fontFamily: 'Titillium Web, sans-serif',
    fontSize: 8.5,
    fontWeight: 'bold',
    fill: canvasPalette.drsZoneActive,
  });

  constructor() {
    this.container = new Container();
    this.glowGraphics = new Graphics();
    this.lineGraphics = new Graphics();
    this.tagGraphics = new Graphics();

    this.container.addChild(this.glowGraphics);
    this.container.addChild(this.lineGraphics);
    this.container.addChild(this.tagGraphics);

    for (let i = 0; i < MAX_ZONES; i++) {
      const txt = new Text({ text: `DRS ${i + 1}`, style: this.tagStyle });
      txt.anchor.set(0.5);
      txt.visible = false;
      this.tags.push(txt);
      this.container.addChild(txt);
    }
  }

  render(camera: Camera, track: TrackGeometry | null, showDrsZones: boolean, isDrsActive = false): void {
    this.glowGraphics.clear();
    this.lineGraphics.clear();
    this.tagGraphics.clear();

    for (let i = 0; i < this.tags.length; i++) {
      this.tags[i].visible = false;
    }

    if (!showDrsZones || !track || !track.drsZones || !track.outer) return;

    const { outer, centerline } = track;
    const n = outer.length;
    const bandColor = isDrsActive ? canvasPalette.drsZoneActive : canvasPalette.drsZone;
    const bandAlpha = isDrsActive ? 0.95 : 0.40;
    const glowAlpha = isDrsActive ? 0.35 : 0.12;

    for (let z = 0; z < track.drsZones.length && z < MAX_ZONES; z++) {
      const zone = track.drsZones[z];
      const startIdx = Math.max(0, zone.start);
      const endIdx = Math.min(n - 1, zone.end);
      if (endIdx <= startIdx) continue;

      // 1. Soft outer glow
      camera.worldToScreen(outer[startIdx][0], outer[startIdx][1], this.pt);
      this.glowGraphics.moveTo(this.pt.x, this.pt.y);
      for (let i = startIdx + 1; i <= endIdx; i++) {
        camera.worldToScreen(outer[i][0], outer[i][1], this.pt);
        this.glowGraphics.lineTo(this.pt.x, this.pt.y);
      }
      this.glowGraphics.stroke({
        width: 4,
        color: bandColor,
        alpha: glowAlpha,
      });

      // 2. Crisp thin outer band (2.0 px)
      camera.worldToScreen(outer[startIdx][0], outer[startIdx][1], this.pt);
      const tagStartX = this.pt.x;
      const tagStartY = this.pt.y;

      this.lineGraphics.moveTo(this.pt.x, this.pt.y);
      for (let i = startIdx + 1; i <= endIdx; i++) {
        camera.worldToScreen(outer[i][0], outer[i][1], this.pt);
        this.lineGraphics.lineTo(this.pt.x, this.pt.y);
      }
      this.lineGraphics.stroke({
        width: 2.0,
        color: bandColor,
        alpha: bandAlpha,
      });

      // 3. Centerline subtle accent
      if (centerline && centerline.length > endIdx) {
        camera.worldToScreen(centerline[startIdx][0], centerline[startIdx][1], this.pt);
        this.lineGraphics.moveTo(this.pt.x, this.pt.y);
        for (let i = startIdx + 1; i <= endIdx; i++) {
          camera.worldToScreen(centerline[i][0], centerline[i][1], this.pt);
          this.lineGraphics.lineTo(this.pt.x, this.pt.y);
        }
        this.lineGraphics.stroke({
          width: 1.2,
          color: bandColor,
          alpha: isDrsActive ? 0.45 : 0.20,
        });
      }

      // 4. "DRS n" tag badge at zone start
      if (z < this.tags.length) {
        const tag = this.tags[z];
        tag.x = tagStartX;
        tag.y = tagStartY - 10;
        tag.style = isDrsActive ? this.activeTagStyle : this.tagStyle;
        tag.visible = camera.zoom >= camera.fitZoom * 0.7;

        if (tag.visible) {
          this.tagGraphics
            .roundRect(tagStartX - 16, tagStartY - 17, 32, 14, 3)
            .fill({ color: canvasPalette.labelBg, alpha: 0.85 })
            .stroke({ width: 1, color: bandColor, alpha: isDrsActive ? 0.9 : 0.45 });
        }
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
