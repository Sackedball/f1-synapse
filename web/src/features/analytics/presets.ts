import { DockviewApi } from 'dockview-react';
import { PANEL_REGISTRY } from './panelRegistry';

export type PresetName = 'Race Engineer' | 'Strategy' | 'Telemetry' | 'Broadcast (clean)';

export const PRESET_NAMES: PresetName[] = [
  'Race Engineer',
  'Strategy',
  'Telemetry',
  'Broadcast (clean)',
];

export function applyPreset(api: DockviewApi, presetName: PresetName) {
  api.clear();

  switch (presetName) {
    case 'Race Engineer': {
      const p1 = api.addPanel({
        id: 'telemetry',
        component: 'telemetry',
        title: PANEL_REGISTRY.telemetry.title,
      });
      const p2 = api.addPanel({
        id: 'headToHead',
        component: 'headToHead',
        title: PANEL_REGISTRY.headToHead.title,
        position: { referencePanel: p1, direction: 'right' },
      });
      api.addPanel({
        id: 'laptimes',
        component: 'laptimes',
        title: PANEL_REGISTRY.laptimes.title,
        position: { referencePanel: p2, direction: 'below' },
      });
      break;
    }

    case 'Strategy': {
      const p1 = api.addPanel({
        id: 'strategy',
        component: 'strategy',
        title: PANEL_REGISTRY.strategy.title,
      });
      const p2 = api.addPanel({
        id: 'laptimes',
        component: 'laptimes',
        title: PANEL_REGISTRY.laptimes.title,
        position: { referencePanel: p1, direction: 'below' },
      });
      api.addPanel({
        id: 'raceControl',
        component: 'raceControl',
        title: PANEL_REGISTRY.raceControl.title,
        position: { referencePanel: p2, direction: 'right' },
      });
      break;
    }

    case 'Telemetry': {
      const p1 = api.addPanel({
        id: 'telemetry',
        component: 'telemetry',
        title: PANEL_REGISTRY.telemetry.title,
      });
      const p2 = api.addPanel({
        id: 'headToHead',
        component: 'headToHead',
        title: PANEL_REGISTRY.headToHead.title,
        position: { referencePanel: p1, direction: 'right' },
      });
      api.addPanel({
        id: 'trackPosition',
        component: 'trackPosition',
        title: PANEL_REGISTRY.trackPosition.title,
        position: { referencePanel: p2, direction: 'below' },
      });
      break;
    }

    case 'Predictive Suite': {
      const p1 = api.addPanel({
        id: 'mlInsights',
        component: 'mlInsights',
        title: PANEL_REGISTRY.mlInsights.title,
      });
      const p2 = api.addPanel({
        id: 'strategy',
        component: 'strategy',
        title: PANEL_REGISTRY.strategy.title,
        position: { referencePanel: p1, direction: 'right' },
      });
      api.addPanel({
        id: 'telemetry',
        component: 'telemetry',
        title: PANEL_REGISTRY.telemetry.title,
        position: { referencePanel: p2, direction: 'below' },
      });
      break;
    }

    case 'Broadcast (clean)': {
      const p1 = api.addPanel({
        id: 'trackPosition',
        component: 'trackPosition',
        title: PANEL_REGISTRY.trackPosition.title,
      });
      const p2 = api.addPanel({
        id: 'raceControl',
        component: 'raceControl',
        title: PANEL_REGISTRY.raceControl.title,
        position: { referencePanel: p1, direction: 'below' },
      });
      api.addPanel({
        id: 'strategy',
        component: 'strategy',
        title: PANEL_REGISTRY.strategy.title,
        position: { referencePanel: p2, direction: 'right' },
      });
      break;
    }
  }
}
