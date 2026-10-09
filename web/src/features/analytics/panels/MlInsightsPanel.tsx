import React, { useState, useMemo } from 'react';
import { DriverInfo } from '@/api/types';
import { Snapshot } from '@/engine/snapshot';
import { useSelectionStore, useMlStore, useSettingsStore } from '@/stores';
import { TyreBadge } from '@/components/ui/TyreBadge';
import { Sparkline } from '@/components/ui/Sparkline';
import { Info, HelpCircle, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

interface MlInsightsPanelProps {
  drivers: DriverInfo[];
  snapshot: Snapshot | null;
}

export const MlInsightsPanel: React.FC<MlInsightsPanelProps> = ({
  drivers,
  snapshot,
}) => {
  const { selectedDriver } = useSelectionStore();
  const { showMlInsights } = useSettingsStore();
  const { getBattleDetails, getPit, getTyre, modelMetadata } = useMlStore();

  const [followSelection, setFollowSelection] = useState<boolean>(true);
  const [manualAttacker, setManualAttacker] = useState<string | null>(null);
  const [manualDefender, setManualDefender] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState<boolean>(false);
  const [modelInfoOpen, setModelInfoOpen] = useState<boolean>(false);

  // Determine active attacker & defender
  const { attackerCode, defenderCode } = useMemo(() => {
    if (!followSelection && manualAttacker && manualDefender) {
      return { attackerCode: manualAttacker, defenderCode: manualDefender };
    }

    const count = Math.min(snapshot?.n ?? 0, drivers.length);
    if (!snapshot || count < 2) {
      return {
        attackerCode: drivers[1]?.code || null,
        defenderCode: drivers[0]?.code || null,
      };
    }

    // If followSelection and driver selected:
    if (followSelection && selectedDriver) {
      const selIdx = drivers.findIndex((d) => d.code === selectedDriver);
      if (selIdx >= 0 && snapshot.orderByPosition) {
        const order = snapshot.orderByPosition;
        let rank = -1;
        for (let i = 0; i < count; i++) {
          if (order[i] === selIdx) {
            rank = i;
            break;
          }
        }
        if (rank > 0) {
          // Car ahead is defender, selected is attacker
          const aheadIdx = order[rank - 1];
          return {
            attackerCode: selectedDriver,
            defenderCode: drivers[aheadIdx]?.code || null,
          };
        } else if (rank === 0 && count > 1) {
          // Selected is P1 (defender), car behind (P2) is attacker
          const behindIdx = order[1];
          return {
            attackerCode: drivers[behindIdx]?.code || null,
            defenderCode: selectedDriver,
          };
        }
      }
    }

    // Default: P2 vs P1 lead battle (by distance descending)
    const sortedByDist = Array.from({ length: count }, (_, i) => i).sort(
      (a, b) => snapshot.dist[b] - snapshot.dist[a],
    );

    const p1Idx = sortedByDist[0];
    const p2Idx = sortedByDist[1];

    return {
      attackerCode: drivers[p2Idx]?.code || null,
      defenderCode: drivers[p1Idx]?.code || null,
    };
  }, [followSelection, manualAttacker, manualDefender, snapshot, selectedDriver, drivers]);

  const attDriver = drivers.find((d) => d.code === attackerCode);
  const defDriver = drivers.find((d) => d.code === defenderCode);

  const t = snapshot?.t ?? 0;
  const battleData =
    attackerCode && defenderCode ? getBattleDetails(attackerCode, defenderCode, t) : null;

  const attPit = attackerCode ? getPit(attackerCode, t) : null;
  const defPit = defenderCode ? getPit(defenderCode, t) : null;

  const attIdx = attackerCode ? drivers.findIndex((d) => d.code === attackerCode) : -1;
  const defIdx = defenderCode ? drivers.findIndex((d) => d.code === defenderCode) : -1;

  const attLap = snapshot && attIdx >= 0 ? snapshot.lap[attIdx] ?? 1 : 1;
  const defLap = snapshot && defIdx >= 0 ? snapshot.lap[defIdx] ?? 1 : 1;

  const attTyre = attackerCode ? getTyre(attackerCode, attLap) : null;
  const defTyre = defenderCode ? getTyre(defenderCode, defLap) : null;

  const attTyreCompound = snapshot && attIdx >= 0 ? snapshot.tyre[attIdx] ?? 1 : 1;
  const attTyreLife = snapshot && attIdx >= 0 ? snapshot.tyreLife[attIdx] ?? 0 : 0;
  const defTyreCompound = snapshot && defIdx >= 0 ? snapshot.tyre[defIdx] ?? 1 : 1;
  const defTyreLife = snapshot && defIdx >= 0 ? snapshot.tyreLife[defIdx] ?? 0 : 0;

  // History sparkline for battle probability over past 60s
  const sparklineProbs = useMemo(() => {
    if (!attackerCode || !defenderCode || t <= 0) return [0.1, 0.1];
    const points: number[] = [];
    const startT = Math.max(0, t - 60);
    const step = 2.0; // sample every 2s
    for (let cur = startT; cur <= t; cur += step) {
      const d = getBattleDetails(attackerCode, defenderCode, cur);
      points.push(d ? d.probability : 0.05);
    }
    return points.length > 1 ? points : [0.1, 0.1];
  }, [attackerCode, defenderCode, t, getBattleDetails]);

  if (!showMlInsights) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-[var(--text-3)] bg-[var(--surface-0)]">
        <Sparkles className="w-8 h-8 mb-2 opacity-40 text-[var(--insight)]" />
        <p className="text-sm font-semibold text-[var(--text-2)] mb-1">ML Insights Disabled</p>
        <p className="text-xs max-w-xs">
          Enable &ldquo;Show ML insights&rdquo; in settings to view live predictive models.
        </p>
      </div>
    );
  }

  const overtakeProb = battleData?.probability ?? null;
  const gapM = battleData?.gapMeters ?? null;
  const closingKmh = battleData?.closingSpeedKmh ?? null;

  return (
    <div className="h-full flex flex-col bg-[var(--surface-0)] text-[var(--text-1)] select-none overflow-y-auto">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-1)]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--insight)]" />
          <span className="font-display font-bold text-xs tracking-wider uppercase text-[var(--text-1)]">
            PREDICTIVE BATTLE ENGINE
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-xs bg-[rgba(168,85,247,0.15)] text-[var(--insight)] border border-[rgba(168,85,247,0.3)]">
            est.
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Follow Selection Toggle */}
          <button
            type="button"
            onClick={() => setFollowSelection(!followSelection)}
            className={`text-[10px] font-mono px-2 py-0.5 rounded-xs transition-colors border ${
              followSelection
                ? 'bg-[var(--surface-3)] text-[var(--text-1)] border-[var(--border-hi)]'
                : 'bg-transparent text-[var(--text-3)] border-[var(--border)] hover:text-[var(--text-2)]'
            }`}
          >
            {followSelection ? 'Auto (P2 vs P1)' : 'Manual Pair'}
          </button>

          {/* Model Info Popover Button */}
          <button
            type="button"
            title="Model Information & Caveats"
            onClick={() => setModelInfoOpen(!modelInfoOpen)}
            className="text-[var(--text-3)] hover:text-[var(--insight)] transition-colors p-1"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Model Info Caveat Popover */}
      {modelInfoOpen && (
        <div className="mx-3 mt-2 p-3 rounded-xs bg-[var(--surface-2)] border border-[rgba(168,85,247,0.3)] text-xs space-y-1.5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="font-display font-bold text-[var(--insight)]">
              {modelMetadata?.name || 'F1-Synapse Predictive Suite'} (v{modelMetadata?.version || '1.0'})
            </span>
            <button
              type="button"
              onClick={() => setModelInfoOpen(false)}
              className="text-[var(--text-3)] hover:text-[var(--text-1)]"
            >
              ✕
            </button>
          </div>
          <p className="text-[11px] text-[var(--text-2)] leading-relaxed">
            Predictions are generated by LightGBM and XGBoost models trained on synthetic telemetry generated by the physics engine. They reflect physical feasibility, not human driver behavior. Treat as indicative.
          </p>
          <div className="pt-1 text-[10px] font-mono text-[var(--text-3)]">
            Target: Synthetic/Simulated &bull; All values labeled <span className="text-[var(--insight)]">est.</span>
          </div>
        </div>
      )}

      {/* Attacker vs Defender Selector */}
      <div className="grid grid-cols-2 gap-2 p-3 bg-[var(--surface-1)] border-b border-[var(--border)]">
        {/* Attacker */}
        <div className="p-2 rounded-xs bg-[var(--surface-2)] border border-[var(--border)]">
          <span className="text-[9px] font-mono font-bold uppercase text-[var(--text-3)] block mb-1">
            ATTACKER (BEHIND)
          </span>
          <div className="flex items-center gap-2">
            <div
              className="w-1.5 h-5 rounded-xs"
              style={{ backgroundColor: attDriver?.color || '#888' }}
            />
            {followSelection ? (
              <span className="font-display font-bold text-base text-[var(--text-1)]">
                {attackerCode || '—'}
              </span>
            ) : (
              <select
                aria-label="Attacker (Behind)"
                value={attackerCode || ''}
                onChange={(e) => setManualAttacker(e.target.value)}
                className="bg-transparent font-display font-bold text-sm text-[var(--text-1)] outline-none cursor-pointer"
              >
                {drivers.map((d) => (
                  <option key={d.code} value={d.code} className="bg-[var(--surface-2)]">
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Defender */}
        <div className="p-2 rounded-xs bg-[var(--surface-2)] border border-[var(--border)]">
          <span className="text-[9px] font-mono font-bold uppercase text-[var(--text-3)] block mb-1">
            DEFENDER (AHEAD)
          </span>
          <div className="flex items-center gap-2">
            <div
              className="w-1.5 h-5 rounded-xs"
              style={{ backgroundColor: defDriver?.color || '#888' }}
            />
            {followSelection ? (
              <span className="font-display font-bold text-base text-[var(--text-1)]">
                {defenderCode || '—'}
              </span>
            ) : (
              <select
                aria-label="Defender (Ahead)"
                value={defenderCode || ''}
                onChange={(e) => setManualDefender(e.target.value)}
                className="bg-transparent font-display font-bold text-sm text-[var(--text-1)] outline-none cursor-pointer"
              >
                {drivers.map((d) => (
                  <option key={d.code} value={d.code} className="bg-[var(--surface-2)]">
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Main Overtake Likelihood Gauge */}
      <div className="p-4 bg-[var(--surface-0)] border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono font-bold uppercase text-[var(--text-3)] tracking-wider">
            OVERTAKE LIKELIHOOD
          </span>
          <span className="font-mono text-xl font-black text-[var(--insight)]">
            {overtakeProb !== null ? `${Math.round(overtakeProb * 100)}% est.` : '< 5% est.'}
          </span>
        </div>

        {/* Linear Probability Bar */}
        <div className="w-full h-2.5 rounded-full bg-[var(--surface-3)] overflow-hidden mb-3">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.max(2, Math.min(100, (overtakeProb ?? 0.02) * 100))}%`,
              backgroundColor: 'var(--insight)',
            }}
          />
        </div>

        {/* 60s History Sparkline */}
        <div className="pt-1">
          <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-3)] mb-1">
            <span>60S TREND</span>
            <span>Current: {overtakeProb !== null ? `${Math.round(overtakeProb * 100)}%` : '0%'}</span>
          </div>
          <div className="flex justify-center py-1">
            <Sparkline data={sparklineProbs} width={300} height={36} color="var(--insight)" />
          </div>
        </div>
      </div>

      {/* Battle Metrics Grid */}
      <div className="grid grid-cols-2 gap-2 p-3 bg-[var(--surface-1)] border-b border-[var(--border)] text-xs">
        <div className="p-2.5 rounded-xs bg-[var(--surface-2)]">
          <span className="text-[9px] font-mono text-[var(--text-3)] uppercase block mb-1">
            SPATIAL GAP
          </span>
          <span className="font-mono text-sm font-bold text-[var(--text-1)]">
            {gapM !== null ? `${gapM.toFixed(1)} m` : '—'}
          </span>
        </div>

        <div className="p-2.5 rounded-xs bg-[var(--surface-2)]">
          <span className="text-[9px] font-mono text-[var(--text-3)] uppercase block mb-1">
            CLOSING SPEED
          </span>
          <span className="font-mono text-sm font-bold text-[var(--text-1)]">
            {closingKmh !== null ? `${closingKmh > 0 ? '+' : ''}${closingKmh.toFixed(1)} km/h` : '—'}
          </span>
        </div>
      </div>

      {/* Tyre Comparison */}
      <div className="p-3 bg-[var(--surface-0)] border-b border-[var(--border)] space-y-2">
        <span className="text-[10px] font-mono font-bold uppercase text-[var(--text-3)] tracking-wider block">
          TYRE DELTA & DEGRADATION
        </span>

        <div className="grid grid-cols-2 gap-2">
          {/* Attacker Tyre */}
          <div className="p-2 rounded-xs bg-[var(--surface-1)] border border-[var(--border)]">
            <div className="flex items-center justify-between mb-1">
              <span className="font-display font-bold text-xs">{attackerCode}</span>
              <TyreBadge compound={attTyreCompound} tyreLife={attTyreLife} size="sm" />
            </div>
            <div className="text-[10px] font-mono text-[var(--text-2)]">
              {attTyre ? `+${attTyre.degradationRate.toFixed(2)}s/lap est.` : `${attTyreLife} laps`}
            </div>
          </div>

          {/* Defender Tyre */}
          <div className="p-2 rounded-xs bg-[var(--surface-1)] border border-[var(--border)]">
            <div className="flex items-center justify-between mb-1">
              <span className="font-display font-bold text-xs">{defenderCode}</span>
              <TyreBadge compound={defTyreCompound} tyreLife={defTyreLife} size="sm" />
            </div>
            <div className="text-[10px] font-mono text-[var(--text-2)]">
              {defTyre ? `+${defTyre.degradationRate.toFixed(2)}s/lap est.` : `${defTyreLife} laps`}
            </div>
          </div>
        </div>
      </div>

      {/* Pit Anticipation Window */}
      <div className="p-3 bg-[var(--surface-1)] border-b border-[var(--border)] space-y-2">
        <span className="text-[10px] font-mono font-bold uppercase text-[var(--text-3)] tracking-wider block">
          PIT ANTICIPATION
        </span>

        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-xs bg-[var(--surface-2)]">
            <span className="text-[9px] font-mono text-[var(--text-3)] block mb-1">
              {attackerCode} PIT LIKELIHOOD
            </span>
            <span className="font-mono text-sm font-bold text-[var(--insight)]">
              {attPit !== null ? `${Math.round(attPit * 100)}% est.` : '--'}
            </span>
          </div>

          <div className="p-2 rounded-xs bg-[var(--surface-2)]">
            <span className="text-[9px] font-mono text-[var(--text-3)] block mb-1">
              {defenderCode} PIT LIKELIHOOD
            </span>
            <span className="font-mono text-sm font-bold text-[var(--insight)]">
              {defPit !== null ? `${Math.round(defPit * 100)}% est.` : '--'}
            </span>
          </div>
        </div>
      </div>

      {/* "Why?" Explainability Drawer */}
      <div className="p-3 bg-[var(--surface-0)] border-b border-[var(--border)]">
        <button
          type="button"
          onClick={() => setWhyOpen(!whyOpen)}
          className="w-full flex items-center justify-between py-1 text-xs font-mono font-bold text-[var(--text-2)] hover:text-[var(--insight)] transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>EXPLAINABILITY (FEATURE CONTRIBUTIONS)</span>
          </span>
          {whyOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {whyOpen && (
          <div className="mt-3 space-y-2 pt-2 border-t border-[var(--border)]">
            {battleData?.contributions ? (
              Object.entries(battleData.contributions).map(([feat, val]) => {
                const normVal = Math.min(1.0, Math.max(0.0, val));
                const labelMap: Record<string, string> = {
                  proximity: 'Proximity (< 30m)',
                  closing_speed: 'Closing Speed (Delta V)',
                  drs_boost: 'DRS Activation',
                  tyre_advantage: 'Tyre Age Advantage',
                  throttle_commitment: 'Throttle Commitment',
                };
                const label = labelMap[feat] || feat.replace('_', ' ');

                return (
                  <div key={feat} className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-2)]">
                      <span>{label}</span>
                      <span>{(normVal * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--insight)]"
                        style={{ width: `${Math.max(4, normVal * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-[11px] text-[var(--text-3)] py-1">
                Battle features are computed when cars are within active 3.0s window.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
