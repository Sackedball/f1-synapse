"""
Tyre degradation and wear estimation module.
Wraps BayesianTyreDegradationModel with fuel-correction and forward stint projections.
"""

from typing import Dict, List, Optional, Any
from src.bayesian_tyre_model import BayesianTyreDegradationModel, StateSpaceConfig


class TyreDegradationEstimator:
    """Estimates compound degradation, fuel-corrected pace, and forward projection."""

    def __init__(self, config: Optional[StateSpaceConfig] = None):
        self.bayesian_model = BayesianTyreDegradationModel(config=config)

    def get_compound_base_deg(self, compound: str) -> float:
        """Returns baseline degradation rate in seconds per lap."""
        c = compound.upper()
        if c in self.bayesian_model.tyre_profiles:
            return self.bayesian_model.tyre_profiles[c].degradation_rate
        # Fallback rates
        return {"SOFT": 0.05, "MEDIUM": 0.03, "HARD": 0.015, "INTER": 0.04, "WET": 0.02}.get(c, 0.03)

    def compute_driver_tyre_timeline(
        self,
        driver_code: str,
        laps: List[Dict[str, Any]],
        stints: List[Dict[str, Any]],
        total_laps: int = 53,
    ) -> Dict[str, Any]:
        """
        Computes per-lap estimated degradation, cumulative pace loss, and forward projection.
        """
        driver_laps = sorted([l for l in laps if l.get("driver") == driver_code], key=lambda x: x.get("lap", 0))
        driver_stints = sorted([s for s in stints if s.get("driver") == driver_code], key=lambda x: x.get("stint", 0))

        lap_numbers: List[int] = []
        deg_rates: List[float] = []
        pace_losses: List[float] = []

        fuel_per_lap = 1.6  # kg per lap
        fuel_effect = 0.032  # s / kg

        for lap_dict in driver_laps:
            lap_idx = int(lap_dict.get("lap", 1))
            lap_numbers.append(lap_idx)

            # Determine compound from stint or lap
            compound = "MEDIUM"
            for st in driver_stints:
                if st.get("lapStart", 1) <= lap_idx <= st.get("lapEnd", total_laps):
                    compound = str(st.get("compound", "MEDIUM")).upper()
                    break

            base_deg = self.get_compound_base_deg(compound)

            # Tyre age on current stint
            tyre_age = lap_dict.get("tyre_life")
            if tyre_age is None or tyre_age == 0:
                # Find start of current stint
                stint_start = 1
                for st in driver_stints:
                    if st.get("lapStart", 1) <= lap_idx <= st.get("lapEnd", total_laps):
                        stint_start = st.get("lapStart", 1)
                        break
                tyre_age = max(1, lap_idx - stint_start + 1)

            deg_rates.append(round(base_deg, 4))
            pace_losses.append(round(float(tyre_age * base_deg), 3))

        # Forward projection (next 5 laps based on last known stint compound)
        last_compound = "MEDIUM"
        if driver_stints:
            last_compound = str(driver_stints[-1].get("compound", "MEDIUM")).upper()
        last_base_deg = self.get_compound_base_deg(last_compound)
        current_loss = pace_losses[-1] if pace_losses else 0.0

        projected: List[float] = []
        for i in range(1, 6):
            projected.append(round(current_loss + i * last_base_deg, 3))

        return {
            "driver": driver_code,
            "laps": lap_numbers,
            "degradationSPerLap": deg_rates,
            "paceLossS": pace_losses,
            "projectedDegradation": projected,
        }
