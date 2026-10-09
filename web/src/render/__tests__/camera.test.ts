import { describe, it, expect, beforeEach } from 'vitest';
import { Camera } from '../camera';

describe('Camera transform & coordinate math', () => {
  let camera: Camera;

  beforeEach(() => {
    camera = new Camera(1920, 1080);
    camera.x = 0;
    camera.y = 0;
    camera.zoom = 1;
    camera.rotation = 0;
  });

  it('performs exact world-to-screen and screen-to-world round-trip without rotation', () => {
    const testPoints = [
      { wx: 0, wy: 0 },
      { wx: 1500, wy: -3200 },
      { wx: -8400, wy: 4200 },
      { wx: 12.34, wy: 56.78 },
    ];

    for (const pt of testPoints) {
      const screen = camera.worldToScreen(pt.wx, pt.wy);
      const world = camera.screenToWorld(screen.x, screen.y);

      expect(world.x).toBeCloseTo(pt.wx, 4);
      expect(world.y).toBeCloseTo(pt.wy, 4);
    }
  });

  it('performs exact round-trip with arbitrary rotation and zoom', () => {
    camera.x = 250;
    camera.y = -400;
    camera.zoom = 0.085;
    camera.rotation = (35 * Math.PI) / 180; // 35 degrees

    const testPoints = [
      { wx: 1000, wy: 2000 },
      { wx: -5000, wy: -3000 },
      { wx: 250, wy: -400 }, // Center
    ];

    for (const pt of testPoints) {
      const screen = camera.worldToScreen(pt.wx, pt.wy);
      const world = camera.screenToWorld(screen.x, screen.y);

      expect(world.x).toBeCloseTo(pt.wx, 3);
      expect(world.y).toBeCloseTo(pt.wy, 3);
    }
  });

  it('correctly maps world center to screen center', () => {
    camera.x = 500;
    camera.y = 1200;
    const screen = camera.worldToScreen(500, 1200);

    expect(screen.x).toBeCloseTo(1920 / 2, 4);
    expect(screen.y).toBeCloseTo(1080 / 2, 4);
  });

  it('calculates fitBounds to contain full track geometry with padding', () => {
    const bounds = {
      minX: -1000,
      maxX: 1000,
      minY: -500,
      maxY: 500,
    };

    camera.setBounds(bounds, 0);

    // Center should be (0, 0)
    expect(camera.targetX).toBeCloseTo(0);
    expect(camera.targetY).toBeCloseTo(0);

    // Track size: 2000 x 1000
    // Viewport: 1920 x 1080 with padding 48px each side
    // Avail: (1920 - 96) = 1824, (1080 - 96) = 984
    // Expected zoom: min(1824/2000, 984/1000) = min(0.912, 0.984) = 0.912
    expect(camera.fitZoom).toBeCloseTo(0.912, 3);
  });

  it('preserves world point under mouse cursor when zooming', () => {
    camera.x = 100;
    camera.y = 200;
    camera.zoom = 0.1;
    camera.rotation = 0;

    const cursorScreenX = 600;
    const cursorScreenY = 400;

    // Get world point under cursor before zoom
    const worldPointBefore = { ...camera.screenToWorld(cursorScreenX, cursorScreenY) };

    // Zoom in by factor of 1.5 at cursor
    camera.zoomAtScreenPoint(1.5, cursorScreenX, cursorScreenY);

    // Screen point of that same world point after zoom should still be at cursor
    const screenPointAfter = camera.worldToScreen(worldPointBefore.x, worldPointBefore.y);

    expect(screenPointAfter.x).toBeCloseTo(cursorScreenX, 2);
    expect(screenPointAfter.y).toBeCloseTo(cursorScreenY, 2);
  });

  it('pans responsively by screen delta', () => {
    camera.x = 0;
    camera.y = 0;
    camera.zoom = 0.1;
    camera.rotation = 0;

    // Drag 100px right on screen
    camera.panByScreenDelta(100, 0);
    // Camera center should move left in world coords so image moves right
    expect(camera.x).toBeLessThan(0);

    // Drag 50px down on screen
    camera.panByScreenDelta(0, 50);
    // In world coords, down on screen is negative Y direction, so camera moves positive Y
    expect(camera.y).toBeGreaterThan(0);
  });

  it('calculates screen headings along motion vectors accurately', () => {
    camera.rotation = 0;

    // Moving East (+X, 0) -> screen heading should be 0 (Right)
    const headingEast = camera.calculateScreenHeading(10, 0);
    expect(headingEast).toBeCloseTo(0, 4);

    // Moving North (0, +Y) -> screen heading should be -PI/2 (Up on screen)
    const headingNorth = camera.calculateScreenHeading(0, 10);
    expect(headingNorth).toBeCloseTo(-Math.PI / 2, 4);

    // Moving West (-X, 0) -> screen heading should be PI or -PI (Left on screen)
    const headingWest = camera.calculateScreenHeading(-10, 0);
    expect(Math.abs(headingWest)).toBeCloseTo(Math.PI, 4);

    // Moving South (0, -Y) -> screen heading should be +PI/2 (Down on screen)
    const headingSouth = camera.calculateScreenHeading(0, -10);
    expect(headingSouth).toBeCloseTo(Math.PI / 2, 4);
  });

  it('performs pinch-to-zoom centered at two-finger touch midpoint', () => {
    camera.x = 200;
    camera.y = 300;
    camera.zoom = 0.05;

    // Two finger touches at (400, 300) and (600, 300) -> midpoint is (500, 300)
    const midX = 500;
    const midY = 300;

    const worldBefore = { ...camera.screenToWorld(midX, midY) };

    // Pinch in: factor = 1.3 (fingers spreading apart)
    camera.zoomAtScreenPoint(1.3, midX, midY);

    const screenAfter = camera.worldToScreen(worldBefore.x, worldBefore.y);
    expect(screenAfter.x).toBeCloseTo(midX, 2);
    expect(screenAfter.y).toBeCloseTo(midY, 2);
    expect(camera.zoom).toBeCloseTo(0.05 * 1.3, 4);
  });
});
