"""
Tyre degradation and wear estimation module.
Wraps BayesianTyreDegradationModel with fuel-correction and forward stint projections.
"""

import math
from typing import Dict, List, Optional, Any, Union
import numpy as np
import pandas as pd

from src.bayesian_tyre_model import (
    BayesianTyreDegradationModel,
    StateSpaceConfig,
    COMPOUND_NAME_MAP,
)


class TyreDegradationEstimator:
    """Estimates compound degradation, fuel-corrected pace, and forward projection."""

    def __init__(self, config: Optional[StateSpaceConfig] = None):
        self.bayesian_model = BayesianTyreDegradationModel(config=config)

    def fit(self, laps: Union[pd.DataFrame, List[Dict[str, Any]]]):
        """Fits Bayesian tyre degradation model across session laps."""
        if isinstance(laps, list):
            laps_df = pd.DataFrame(laps)
        else:
            laps_df = laps
        if laps_df is not None and not laps_df.empty:
            self.bayesian_model.fit(laps_df)

    def get_compound_base_deg(self, compound: str) -> float:
        """Returns baseline degradation rate in seconds per lap."""
        c = COMPOUND_NAME_MAP.get(str(compound).upper().strip(), str(compound).upper().strip())
        if c in self.bayesian_model.tyre_profiles:
            return self.bayesian_model.tyre_profiles[c].degradation_rate
        # Fallback rates
        return {"SOFT": 0.05, "MEDIUM": 0.03, "HARD": 0.015, "INTERMEDIATE": 0.04, "WET": 0.02}.get(c, 0.03)

    def compute_driver_tyre_timeline(
        self,
        driver_code: str,
        laps: List[Dict[str, Any]],
        stints: List[Dict[str, Any]],
        total_laps: int = 53,
    ) -> Dict[str, Any]:
        """
        Computes per-lap estimated degradation, cumulative pace loss, Bayesian credible intervals,
        and forward projection.
        """
        # Auto-fit if not fitted and lap data with times is available
        if not self.bayesian_model._fitted and laps:
            laps_df = pd.DataFrame(laps)
            has_times = any(
                col in laps_df.columns
                for col in ["timeSec", "time_sec", "LapTime", "LapTimeSeconds", "LapTimeSec"]
            )
            if has_times:
                self.bayesian_model.fit(laps_df)

        driver_laps = sorted(
            [l for l in laps if l.get("driver") == driver_code or l.get("Driver") == driver_code],
            key=lambda x: x.get("lap", x.get("LapNumber", 0))
        )
        driver_stints = sorted(
            [s for s in stints if s.get("driver") == driver_code or s.get("Driver") == driver_code],
            key=lambda x: x.get("stint", x.get("Stint", 0))
        )

        lap_numbers: List[int] = []
        deg_rates: List[float] = []
        pace_losses: List[float] = []
        ci_lower: List[float] = []
        ci_upper: List[float] = []

        abrasion = self.bayesian_model.track_abrasion
        sigma_eta = self.bayesian_model.sigma_eta
        sigma_eps = self.bayesian_model.sigma_epsilon

        driver_latent = self.bayesian_model._latent_by_lap.get(driver_code, {})

        for lap_dict in driver_laps:
            lap_idx = int(lap_dict.get("lap", lap_dict.get("LapNumber", 1)))
            lap_numbers.append(lap_idx)

            # Determine compound and stint
            compound = "MEDIUM"
            current_stint_idx = 1
            for st in driver_stints:
                start = st.get("lapStart", st.get("lap_start", 1))
                end = st.get("lapEnd", st.get("lap_end", total_laps))
                if start <= lap_idx <= end:
                    compound = str(st.get("compound", "MEDIUM")).upper()
                    current_stint_idx = st.get("stint", 1)
                    break
            else:
                if "compound" in lap_dict or "Compound" in lap_dict:
                    compound = str(lap_dict.get("compound", lap_dict.get("Compound", "MEDIUM"))).upper()

            compound = COMPOUND_NAME_MAP.get(compound, compound)
            profile = self.bayesian_model.tyre_profiles.get(compound)

            base_deg = self.get_compound_base_deg(compound) * abrasion
            cliff_lap = profile.cliff_lap if profile else 30
            cliff_factor = profile.cliff_factor if profile else 0.015

            # Tyre age on current stint
            tyre_age = lap_dict.get("tyre_life", lap_dict.get("tyreLife"))
            if tyre_age is None or tyre_age == 0:
                stint_start = 1
                for st in driver_stints:
                    start = st.get("lapStart", st.get("lap_start", 1))
                    end = st.get("lapEnd", st.get("lap_end", total_laps))
                    if start <= lap_idx <= end:
                        stint_start = start
                        break
                tyre_age = max(1, lap_idx - stint_start + 1)
            else:
                tyre_age = int(tyre_age)

            # Thermal cliff penalty
            cliff_wear = 0.0
            if getattr(self.bayesian_model.config, 'enable_thermal_cliff', True) and tyre_age > cliff_lap:
                cliff_wear = cliff_factor * ((tyre_age - cliff_lap) ** 2)

            effective_deg = base_deg + cliff_wear
            deg_rates.append(round(effective_deg, 4))

            # Bayesian pace loss estimation
            latent_entry = driver_latent.get(lap_idx)
            if latent_entry and latent_entry.get("stint") == current_stint_idx and profile:
                # Latent Kalman state filtered pace loss relative to driver's stint reset pace
                filtered_pace = latent_entry["mu"]
                stint_base = latent_entry.get("stint_reset_pace")
                if stint_base is None:
                    stint_base = self.bayesian_model.get_driver_reset_pace(driver_code, compound)
                loss = max(0.0, filtered_pace - stint_base)
                loss_std = math.sqrt(latent_entry["var"])
            else:
                # Prior fallback
                loss = float(tyre_age * base_deg + cliff_wear)
                loss_std = math.sqrt(sigma_eta ** 2 * tyre_age + sigma_eps ** 2)

            pace_losses.append(round(loss, 3))
            ci_lower.append(round(max(0.0, loss - 1.96 * loss_std), 3))
            ci_upper.append(round(loss + 1.96 * loss_std, 3))

        # Forward projection (next 5 laps based on last known stint compound)
        last_compound = "MEDIUM"
        if driver_stints:
            last_compound = str(driver_stints[-1].get("compound", "MEDIUM")).upper()
        elif driver_laps:
            last_compound = str(driver_laps[-1].get("compound", driver_laps[-1].get("Compound", "MEDIUM"))).upper()

        last_compound = COMPOUND_NAME_MAP.get(last_compound, last_compound)
        last_profile = self.bayesian_model.tyre_profiles.get(last_compound)
        last_base_deg = self.get_compound_base_deg(last_compound) * abrasion
        last_cliff_lap = last_profile.cliff_lap if last_profile else 30
        last_cliff_factor = last_profile.cliff_factor if last_profile else 0.015

        current_loss = pace_losses[-1] if pace_losses else 0.0
        last_lap_idx = lap_numbers[-1] if lap_numbers else 0
        last_age = 0
        if driver_laps:
            last_dict = driver_laps[-1]
            last_age = last_dict.get("tyre_life", last_dict.get("tyreLife")) or 0
        if not last_age and driver_stints:
            last_st = driver_stints[-1]
            last_age = max(1, last_lap_idx - last_st.get("lapStart", last_st.get("lap_start", 1)) + 1)
        if not last_age:
            last_age = len(driver_laps)

        projected: List[float] = []
        proj_ci_lower: List[float] = []
        proj_ci_upper: List[float] = []

        last_std = (ci_upper[-1] - pace_losses[-1]) / 1.96 if pace_losses else math.sqrt(sigma_eps ** 2)
        last_var = last_std ** 2

        cum_loss = current_loss
        for i in range(1, 6):
            proj_age = last_age + i
            proj_cliff = 0.0
            if getattr(self.bayesian_model.config, 'enable_thermal_cliff', True) and proj_age > last_cliff_lap:
                proj_cliff = last_cliff_factor * ((proj_age - last_cliff_lap) ** 2)
            cum_loss += last_base_deg + proj_cliff
            proj_var = last_var + i * (sigma_eta ** 2)
            proj_std = math.sqrt(proj_var)

            projected.append(round(cum_loss, 3))
            proj_ci_lower.append(round(max(0.0, cum_loss - 1.96 * proj_std), 3))
            proj_ci_upper.append(round(cum_loss + 1.96 * proj_std, 3))

        return {
            "driver": driver_code,
            "laps": lap_numbers,
            "degradationSPerLap": deg_rates,
            "paceLossS": pace_losses,
            "projectedDegradation": projected,
            "credibleIntervalLower": ci_lower,
            "credibleIntervalUpper": ci_upper,
            "projectedCredibleIntervalLower": proj_ci_lower,
            "projectedCredibleIntervalUpper": proj_ci_upper,
        }
