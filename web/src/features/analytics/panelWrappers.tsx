import React from 'react';
import { IDockviewPanelProps } from 'dockview-react';
import { useAnalyticsContext } from './AnalysisContext';
import { DriverTelemetryPanel } from './panels/DriverTelemetryPanel';
import { HeadToHeadPanel } from './panels/HeadToHeadPanel';
import { LapTimesGapsPanel } from './panels/LapTimesGapsPanel';
import { TyreStrategyPanel } from './panels/TyreStrategyPanel';
import { RaceControlFeedPanel } from './panels/RaceControlFeedPanel';
import { TrackPositionStripPanel } from './panels/TrackPositionStripPanel';
import { DebugStreamInspectorPanel } from './panels/DebugStreamInspectorPanel';
import { MlInsightsPanel } from './panels/MlInsightsPanel';
import { ErrorState } from '@/components/ui/ErrorState';

interface PanelErrorBoundaryProps {
  children: React.ReactNode;
  panelName: string;
}

interface PanelErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class PanelErrorBoundary extends React.Component<PanelErrorBoundaryProps, PanelErrorBoundaryState> {
  constructor(props: PanelErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`Error in panel [${this.props.panelName}]:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex items-center justify-center p-4 bg-[var(--surface-1)]">
          <ErrorState
            title={`${this.props.panelName} Error`}
            message={this.state.error?.message || 'Failed to render analytics panel'}
            onRetry={() => this.setState({ hasError: false, error: null })}
          />
        </div>
      );
    }
    return (
      <div className="h-full w-full overflow-hidden panel-focus-highlight">
        {this.props.children}
      </div>
    );
  }
}

export const TelemetryWrapper: React.FC<IDockviewPanelProps> = () => {
  const { drivers, snapshot, store, clock } = useAnalyticsContext();
  return (
    <PanelErrorBoundary panelName="Driver Telemetry">
      <DriverTelemetryPanel
        drivers={drivers}
        snapshot={snapshot}
        store={store}
        clock={clock}
      />
    </PanelErrorBoundary>
  );
};

export const HeadToHeadWrapper: React.FC<IDockviewPanelProps> = () => {
  const { drivers, snapshot, store, clock } = useAnalyticsContext();
  return (
    <PanelErrorBoundary panelName="Head to Head">
      <HeadToHeadPanel
        drivers={drivers}
        snapshot={snapshot}
        store={store}
        clock={clock}
      />
    </PanelErrorBoundary>
  );
};

export const LapTimesWrapper: React.FC<IDockviewPanelProps> = () => {
  const { drivers, laps, snapshot, totalLaps } = useAnalyticsContext();
  return (
    <PanelErrorBoundary panelName="Lap Times & Gaps">
      <LapTimesGapsPanel
        drivers={drivers}
        laps={laps}
        snapshot={snapshot}
        totalLaps={totalLaps}
      />
    </PanelErrorBoundary>
  );
};

export const TyreStrategyWrapper: React.FC<IDockviewPanelProps> = () => {
  const { drivers, stints, snapshot, totalLaps } = useAnalyticsContext();
  return (
    <PanelErrorBoundary panelName="Tyre Strategy">
      <TyreStrategyPanel
        drivers={drivers}
        stints={stints}
        snapshot={snapshot}
        totalLaps={totalLaps}
      />
    </PanelErrorBoundary>
  );
};

export const RaceControlWrapper: React.FC<IDockviewPanelProps> = () => {
  const { raceControl, clock, drivers } = useAnalyticsContext();
  return (
    <PanelErrorBoundary panelName="Race Control Feed">
      <RaceControlFeedPanel
        raceControl={raceControl}
        clock={clock}
        drivers={drivers}
      />
    </PanelErrorBoundary>
  );
};

export const TrackPositionWrapper: React.FC<IDockviewPanelProps> = () => {
  const { drivers, snapshot } = useAnalyticsContext();
  return (
    <PanelErrorBoundary panelName="Track Position Strip">
      <TrackPositionStripPanel
        drivers={drivers}
        snapshot={snapshot}
      />
    </PanelErrorBoundary>
  );
};

export const StreamInspectorWrapper: React.FC<IDockviewPanelProps> = () => {
  const { drivers, snapshot, store, clock } = useAnalyticsContext();
  return (
    <PanelErrorBoundary panelName="Telemetry Stream Inspector">
      <DebugStreamInspectorPanel
        drivers={drivers}
        snapshot={snapshot}
        store={store}
        clock={clock}
      />
    </PanelErrorBoundary>
  );
};

export const MlInsightsWrapper: React.FC<IDockviewPanelProps> = () => {
  const { drivers, snapshot } = useAnalyticsContext();
  return (
    <PanelErrorBoundary panelName="ML Predictive Insights">
      <MlInsightsPanel
        drivers={drivers}
        snapshot={snapshot}
      />
    </PanelErrorBoundary>
  );
};

export const DOCKVIEW_COMPONENTS = {
  telemetry: TelemetryWrapper,
  headToHead: HeadToHeadWrapper,
  laptimes: LapTimesWrapper,
  strategy: TyreStrategyWrapper,
  raceControl: RaceControlWrapper,
  trackPosition: TrackPositionWrapper,
  streamInspector: StreamInspectorWrapper,
  mlInsights: MlInsightsWrapper,
};
