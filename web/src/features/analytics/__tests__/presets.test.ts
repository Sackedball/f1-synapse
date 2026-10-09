import { describe, it, expect, vi } from 'vitest';
import { PRESET_NAMES, applyPreset, PresetName } from '../presets';
import { PANEL_REGISTRY } from '../panelRegistry';
import { DockviewApi } from 'dockview-react';

describe('presets - Layout Presets and Dockview API Configuration', () => {
  it('defines all 4 required layout presets', () => {
    expect(PRESET_NAMES).toEqual([
      'Race Engineer',
      'Strategy',
      'Telemetry',
      'Broadcast (clean)',
    ]);
  });

  interface MockPanelConfig {
    id: string;
    component: string;
    title: string;
    position?: unknown;
  }

  const createMockDockviewApi = () => {
    const panels: MockPanelConfig[] = [];
    const addPanel = vi.fn((config: MockPanelConfig) => {
      panels.push(config);
      return config;
    });
    return {
      clear: vi.fn(() => {
        panels.length = 0;
      }),
      addPanel,
      panels,
    } as unknown as DockviewApi & { panels: MockPanelConfig[]; addPanel: ReturnType<typeof vi.fn> };
  };

  it.each(PRESET_NAMES)('applies preset "%s" cleanly and registers valid panel IDs', (name: PresetName) => {
    const mockApi = createMockDockviewApi();

    applyPreset(mockApi, name);

    expect(mockApi.clear).toHaveBeenCalledTimes(1);
    expect(mockApi.addPanel).toHaveBeenCalled();

    // Check that every panel added exists in PANEL_REGISTRY and has non-empty title
    for (const call of mockApi.addPanel.mock.calls) {
      const config = call[0] as MockPanelConfig;
      expect(config.id).toBeDefined();
      expect(config.component).toBeDefined();
      expect(PANEL_REGISTRY[config.component as keyof typeof PANEL_REGISTRY]).toBeDefined();
      expect(config.title).toBeTruthy();
    }
  });

  it('verifies panel composition for "Strategy" preset', () => {
    const mockApi = createMockDockviewApi();
    applyPreset(mockApi, 'Strategy');

    const addedIds = mockApi.addPanel.mock.calls.map((c) => (c[0] as MockPanelConfig).id);
    expect(addedIds).toContain('strategy');
    expect(addedIds).toContain('laptimes');
    expect(addedIds).toContain('raceControl');
  });

  it('verifies panel composition for "Race Engineer" preset', () => {
    const mockApi = createMockDockviewApi();
    applyPreset(mockApi, 'Race Engineer');

    const addedIds = mockApi.addPanel.mock.calls.map((c) => (c[0] as MockPanelConfig).id);
    expect(addedIds).toContain('telemetry');
    expect(addedIds).toContain('headToHead');
    expect(addedIds).toContain('laptimes');
  });
});
