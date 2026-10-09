import React from 'react';
import {
  Activity,
  Swords,
  Timer,
  Disc3,
  Radio,
  MapPin,
  Terminal,
  Sparkles,
} from 'lucide-react';

export interface PanelDefinition {
  id: string;
  title: string;
  category: 'TELEMETRY' | 'STRATEGY' | 'RACE_CONTROL' | 'DEV';
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

export const PANEL_REGISTRY: Record<string, PanelDefinition> = {
  telemetry: {
    id: 'telemetry',
    title: 'Driver Telemetry',
    category: 'TELEMETRY',
    icon: Activity,
    description: 'Speed, gear, throttle and brake strip charts for focused driver',
  },
  headToHead: {
    id: 'headToHead',
    title: 'Head-to-Head',
    category: 'TELEMETRY',
    icon: Swords,
    description: 'Direct comparison of 2 drivers with delta-time trace along distance',
  },
  laptimes: {
    id: 'laptimes',
    title: 'Lap Times & Gaps',
    category: 'STRATEGY',
    icon: Timer,
    description: 'Lap pace progression, personal bests, and sector breakdown',
  },
  strategy: {
    id: 'strategy',
    title: 'Tyre Strategy',
    category: 'STRATEGY',
    icon: Disc3,
    description: 'Gantt timeline of driver stints and tyre compound usage',
  },
  raceControl: {
    id: 'raceControl',
    title: 'Race Control Feed',
    category: 'RACE_CONTROL',
    icon: Radio,
    description: 'Live steward notifications, flags, and incident messages',
  },
  trackPosition: {
    id: 'trackPosition',
    title: 'Track Position Strip',
    category: 'TELEMETRY',
    icon: MapPin,
    description: 'Linear 0-100% circuit representation of car positions and gaps',
  },
  streamInspector: {
    id: 'streamInspector',
    title: 'Stream Inspector',
    category: 'DEV',
    icon: Terminal,
    description: 'Debug view of raw snapshot telemetry buffer and timings',
  },
  mlInsights: {
    id: 'mlInsights',
    title: 'ML Predictive Engine',
    category: 'STRATEGY',
    icon: Sparkles,
    description: 'Real-time overtake probability, pit anticipation, and tyre degradation models',
  },
};
