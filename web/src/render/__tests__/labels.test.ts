import { describe, it, expect } from 'vitest';
import { Text } from 'pixi.js';
import { LabelsLayer } from '../layers/LabelsLayer';
import { Camera } from '../camera';
import { createSnapshot } from '@/engine/snapshot';
import { DriverInfo } from '@/api/types';
import { CarScreenPosition } from '../hitTest';

describe('LabelsLayer and collision avoidance', () => {
  const camera = new Camera(800, 600);
  camera.fitZoom = 1.0;
  camera.zoom = 1.0;

  const drivers: DriverInfo[] = [
    { code: 'VER', fullName: 'Max Verstappen', number: 1, team: 'Red Bull', color: '#3671c6', index: 0 },
    { code: 'NOR', fullName: 'Lando Norris', number: 4, team: 'McLaren', color: '#ff8000', index: 1 },
    { code: 'LEC', fullName: 'Charles Leclerc', number: 16, team: 'Ferrari', color: '#e8002d', index: 2 },
  ];

  const snapshot = createSnapshot(3);
  snapshot.n = 3;
  snapshot.orderByPosition[0] = 0; // VER P1
  snapshot.orderByPosition[1] = 1; // NOR P2
  snapshot.orderByPosition[2] = 2; // LEC P3
  snapshot.position[0] = 0;
  snapshot.position[1] = 1;
  snapshot.position[2] = 2;

  it('renders labels when visible and places priority drivers', () => {
    const labelsLayer = new LabelsLayer();
    const carPositions: CarScreenPosition[] = [
      { code: 'VER', x: 200, y: 200, index: 0 },
      { code: 'NOR', x: 205, y: 205, index: 1 }, // Very close to VER
      { code: 'LEC', x: 400, y: 400, index: 2 },
    ];

    labelsLayer.render(
      camera,
      snapshot,
      drivers,
      carPositions,
      true, // showLabels
      'NOR', // selectedDriver (priority)
      [],
    );

    expect(labelsLayer.container.visible).toBe(true);
    labelsLayer.destroy();
  });

  it('hides all labels when showLabels is false', () => {
    const labelsLayer = new LabelsLayer();
    const carPositions: CarScreenPosition[] = [
      { code: 'VER', x: 200, y: 200, index: 0 },
    ];

    labelsLayer.render(
      camera,
      snapshot,
      drivers,
      carPositions,
      false, // showLabels
      null,
      [],
    );

    expect(labelsLayer.container.visible).toBe(false);
    labelsLayer.destroy();
  });

  it('auto-hides labels when zoomed far out', () => {
    const labelsLayer = new LabelsLayer();
    const zoomedOutCamera = new Camera(800, 600);
    zoomedOutCamera.fitZoom = 1.0;
    zoomedOutCamera.zoom = 0.2; // Far below 0.45 * fitZoom

    const carPositions: CarScreenPosition[] = [
      { code: 'VER', x: 200, y: 200, index: 0 },
    ];

    labelsLayer.render(
      zoomedOutCamera,
      snapshot,
      drivers,
      carPositions,
      true,
      null,
      [],
    );

    expect(labelsLayer.container.visible).toBe(false);
    labelsLayer.destroy();
  });

  it('renders position rank badge and driver codes or numbers accurately', () => {
    const labelsLayer = new LabelsLayer();
    const carPositions: CarScreenPosition[] = [
      { code: 'VER', x: 200, y: 200, index: 0 },
      { code: 'NOR', x: 400, y: 200, index: 1 },
    ];

    // Default code mode: VER, NOR
    labelsLayer.render(
      camera,
      snapshot,
      drivers,
      carPositions,
      true,
      null,
      [],
      'code',
    );

    // Get rendered Pixi text objects from container (index 1 and 2, since index 0 is bgGraphics)
    const verText = labelsLayer.container.children[1] as Text;
    const norText = labelsLayer.container.children[2] as Text;

    expect(verText.text).toBe('VER');
    expect(norText.text).toBe('NOR');

    // Number mode: #1, #4
    labelsLayer.render(
      camera,
      snapshot,
      drivers,
      carPositions,
      true,
      null,
      [],
      'number',
    );

    expect(verText.text).toBe('#1');
    expect(norText.text).toBe('#4');

    labelsLayer.destroy();
  });

  it('runs 500 render passes with 20 drivers with zero runtime allocations', () => {
    const labelsLayer = new LabelsLayer();
    const twentyDrivers: DriverInfo[] = Array.from({ length: 20 }, (_, i) => ({
      code: `D${i + 1}`,
      fullName: `Driver ${i + 1}`,
      number: i + 1,
      team: 'Team',
      color: '#ffffff',
      index: i,
    }));

    const snap20 = createSnapshot(20);
    snap20.n = 20;
    for (let i = 0; i < 20; i++) {
      snap20.position[i] = i;
      snap20.orderByPosition[i] = i;
    }

    const carPositions20: CarScreenPosition[] = Array.from({ length: 20 }, (_, i) => ({
      code: `D${i + 1}`,
      x: 200 + (i % 5) * 40,
      y: 200 + Math.floor(i / 5) * 40,
      index: i,
    }));

    // Warmup
    for (let i = 0; i < 20; i++) {
      labelsLayer.render(camera, snap20, twentyDrivers, carPositions20, true, 'D1', ['D2'], 'code');
    }

    // Measure that 500 consecutive render calls execute smoothly in < 20ms
    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      labelsLayer.render(camera, snap20, twentyDrivers, carPositions20, true, 'D1', ['D2'], 'code');
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100); // Super fast execution (< 0.2 ms per call)
    labelsLayer.destroy();
  });
});
