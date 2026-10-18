import numpy as np
import pandas as pd
from typing import Dict, Optional, Tuple
from dataclasses import dataclass
from scipy import stats
from enum import Enum

class TyreCategory(Enum):
    SLICK = "SLICK"
    INTER = "INTER"
    WET = "WET"


class TrackCondition(Enum):
    DRY = "DRY"
    DAMP = "DAMP"
    WET = "WET"


@dataclass
class TyreProfile:
    name: str
    category: TyreCategory
    degradation_rate: float
    reset_pace: float
    warmup_laps: int
    max_analysis_laps: Optional[int]
    max_degradation: float
    cliff_lap: int = 30
    cliff_factor: float = 0.015
    
    def __post_init__(self):
        if self.degradation_rate < 0:
            raise ValueError(f"Degradation rate must be non-negative: {self.degradation_rate}")
        if self.warmup_laps < 0:
            raise ValueError(f"Warmup laps must be non-negative: {self.warmup_laps}")
        if self.cliff_lap < 0:
            raise ValueError(f"Cliff lap must be non-negative: {self.cliff_lap}")
        if self.cliff_factor < 0:
            raise ValueError(f"Cliff factor must be non-negative: {self.cliff_factor}")


@dataclass
class StateSpaceConfig:    
    sigma_epsilon: float = 0.3
    sigma_eta: float = 0.1
    
    fuel_effect_prior: float = 0.032
    starting_fuel: float = 110.0
    fuel_burn_rate: float = 1.6
    
    enable_warmup: bool = True
    enable_track_abrasion: bool = True  
    enable_thermal_cliff: bool = True
    cliff_penalty_factor: float = 0.015
    default_circuit_baseline: float = 69.0
    
    debug_logging: bool = False
    
    mismatch_penalties: Dict[Tuple[TyreCategory, TrackCondition], float] = None
    
    def __post_init__(self):
        if self.mismatch_penalties is None:
            self.mismatch_penalties = {
                (TyreCategory.SLICK, TrackCondition.DAMP): 2.0,
                (TyreCategory.SLICK, TrackCondition.WET): 8.0,
                
                (TyreCategory.INTER, TrackCondition.DRY): 1.5,
                (TyreCategory.INTER, TrackCondition.WET): 0.5,
                
                (TyreCategory.WET, TrackCondition.DRY): 4.0,
                (TyreCategory.WET, TrackCondition.DAMP): 1.0,
                
                (TyreCategory.SLICK, TrackCondition.DRY): 0.0,
                (TyreCategory.INTER, TrackCondition.DAMP): 0.0,
                (TyreCategory.WET, TrackCondition.WET): 0.0,
            }


COMPOUND_NAME_MAP = {
    'SOFT': 'SOFT',
    'S': 'SOFT',
    'MEDIUM': 'MEDIUM',
    'M': 'MEDIUM',
    'HARD': 'HARD',
    'H': 'HARD',
    'INTERMEDIATE': 'INTERMEDIATE',
    'INTER': 'INTERMEDIATE',
    'I': 'INTERMEDIATE',
    'WET': 'WET',
    'W': 'WET',
}

COMPOUND_BASE_OFFSETS = {
    'SOFT': -0.5,
    'MEDIUM': 0.0,
    'HARD': 0.6,
    'INTERMEDIATE': 5.0,
    'INTER': 5.0,
    'WET': 10.0,
}


class BayesianTyreDegradationModel:
    """
    Universal Bayesian state-space model for all tyre compounds with track abrasion.
    
    State equation:
        α_{t+1} = (1 - I_pit) * (α_t + ν * A_track + I(t > L_cliff) * κ * (t - L_cliff)^2) + I_pit * α_reset + η_t
        
    Observation equation:
        y_t = α_t + γ * fuel_t + δ_mismatch + ε_t
        
    Where:
        α_t = latent tire pace (true lap time capability)
        ν = degradation rate (compound-specific, seconds per lap)
        A_track = track abrasion factor (track-specific, dimensionless)
        L_cliff = thermal degradation cliff lap horizon (compound-specific)
        κ = non-linear cliff penalty factor
        γ = fuel effect (seconds per kg)
        δ_mismatch = condition-tyre mismatch penalty
        I_pit = indicator for pit stop
        α_reset = pace reset after pit stop (dynamically scaled to circuit baseline)
    """
    
    def __init__(self, config: Optional[StateSpaceConfig] = None):
        self.config = config or StateSpaceConfig()
        self.circuit_baseline = self.config.default_circuit_baseline
        
        self.tyre_profiles: Dict[str, TyreProfile] = {
            'HARD': TyreProfile(
                name='HARD',
                category=TyreCategory.SLICK,
                degradation_rate=0.01,
                reset_pace=round(self.circuit_baseline + COMPOUND_BASE_OFFSETS['HARD'], 3),
                warmup_laps=3,
                max_analysis_laps=None,
                max_degradation=2.0,
                cliff_lap=42,
                cliff_factor=0.012,
            ),
            'MEDIUM': TyreProfile(
                name='MEDIUM',
                category=TyreCategory.SLICK,
                degradation_rate=0.03,
                reset_pace=round(self.circuit_baseline + COMPOUND_BASE_OFFSETS['MEDIUM'], 3),
                warmup_laps=3,
                max_analysis_laps=None,
                max_degradation=2.0,
                cliff_lap=30,
                cliff_factor=0.015,
            ),
            'SOFT': TyreProfile(
                name='SOFT',
                category=TyreCategory.SLICK,
                degradation_rate=0.05,
                reset_pace=round(self.circuit_baseline + COMPOUND_BASE_OFFSETS['SOFT'], 3),
                warmup_laps=1,
                max_analysis_laps=10,
                max_degradation=2.0,
                cliff_lap=20,
                cliff_factor=0.020,
            ),
            'INTERMEDIATE': TyreProfile(
                name='INTERMEDIATE',
                category=TyreCategory.INTER,
                degradation_rate=0.04,
                reset_pace=round(self.circuit_baseline + COMPOUND_BASE_OFFSETS['INTERMEDIATE'], 3),
                warmup_laps=2,
                max_analysis_laps=None,
                max_degradation=3.0,
                cliff_lap=25,
                cliff_factor=0.015,
            ),
            'WET': TyreProfile(
                name='WET',
                category=TyreCategory.WET,
                degradation_rate=0.02,
                reset_pace=round(self.circuit_baseline + COMPOUND_BASE_OFFSETS['WET'], 3),
                warmup_laps=2,
                max_analysis_laps=None,
                max_degradation=2.5,
                cliff_lap=35,
                cliff_factor=0.015,
            ),
        }
        
        self.fuel_effect = self.config.fuel_effect_prior
        self.sigma_epsilon = self.config.sigma_epsilon
        self.sigma_eta = self.config.sigma_eta
        
        self.track_abrasion = 1.0
        
        self._abrasion_baseline = {
            'HARD': 0.003,
            'MEDIUM': 0.009,
            'SOFT': 0.015
        }
        
        self._latent_states = {}
        self._latent_uncertainty = {}
        self._latent_by_lap = {}
        self.driver_baselines = {}
        self._fitted = False

    def get_driver_reset_pace(self, driver: Optional[str], compound: str) -> float:
        """Get benchmark reset pace for a specific driver and compound, falling back to circuit baseline."""
        c = COMPOUND_NAME_MAP.get(str(compound).upper().strip(), str(compound).upper().strip())
        offset = COMPOUND_BASE_OFFSETS.get(c, 0.0)
        if driver and hasattr(self, "driver_baselines") and str(driver) in self.driver_baselines:
            return round(self.driver_baselines[str(driver)] + offset, 3)
        return round(self.circuit_baseline + offset, 3)

    def initialize_circuit_baseline(self, laps_df: pd.DataFrame) -> float:
        """
        Dynamically estimate the competitive clean-air circuit pace baseline
        (15th-25th percentile of valid non-pit/non-SC laps) and scale all compound
        reset_pace values relative to it. Also estimates driver-specific baselines.
        
        Compound offsets relative to baseline (Medium):
          - SOFT: -0.5s
          - MEDIUM: 0.0s
          - HARD: +0.6s
          - INTERMEDIATE: +5.0s
          - WET: +10.0s
        """
        if laps_df is None or laps_df.empty:
            return self.circuit_baseline

        laps = self._prepare_data(laps_df)
        if laps.empty:
            return self.circuit_baseline

        # Filter out SC / VSC laps if TrackStatus is available
        if "TrackStatus" in laps.columns:
            status_series = laps["TrackStatus"].astype(str)
            green_mask = status_series.isin(["1", "1.0", "Green"])
            if green_mask.sum() >= 5:
                laps = laps[green_mask]

        # Valid racing lap times (avoid abnormal laps)
        valid_mask = (laps["LapTimeSeconds"] > 40.0) & (laps["LapTimeSeconds"] < 240.0)
        laps = laps[valid_mask]
        if laps.empty:
            return self.circuit_baseline

        # Normalize lap times by compound offset and fuel effect
        norm_times = []
        for _, row in laps.iterrows():
            cmp = str(row["Compound"]).upper().strip()
            std_cmp = COMPOUND_NAME_MAP.get(cmp, cmp)
            offset = COMPOUND_BASE_OFFSETS.get(std_cmp, 0.0)

            fuel_mass = row.get("FuelMass")
            if fuel_mass is None or pd.isna(fuel_mass):
                lap_num = int(row.get("LapNumber", 1))
                fuel_mass = max(0.0, self.config.starting_fuel - (lap_num - 1) * self.config.fuel_burn_rate)
            fuel_corr = self.fuel_effect * float(fuel_mass)

            norm_times.append(float(row["LapTimeSeconds"]) - offset - fuel_corr)

        norm_times = np.array(norm_times)

        # Prefer dry slick laps if available
        if "TrackCondition" in laps.columns:
            dry_slick_mask = (
                (laps["TrackCondition"] == "DRY") &
                laps["Compound"].isin(["SOFT", "MEDIUM", "HARD"])
            ).values
            if dry_slick_mask.sum() >= 5:
                norm_times = norm_times[dry_slick_mask]

        if len(norm_times) >= 3:
            # 15th-25th percentile of competitive clean-air laps (20th percentile)
            baseline = float(np.percentile(norm_times, 20))
            baseline = max(45.0, min(200.0, baseline))
            self.circuit_baseline = round(baseline, 3)

        # Scale compound reset pace values relative to dynamic baseline
        for name, tyre in self.tyre_profiles.items():
            offset = COMPOUND_BASE_OFFSETS.get(name, 0.0)
            tyre.reset_pace = round(self.circuit_baseline + offset, 3)

        # Compute driver-specific baselines
        self.driver_baselines = {}
        driver_col = "Driver" if "Driver" in laps.columns else "driver"
        if driver_col in laps.columns:
            for drv, drv_df in laps.groupby(driver_col):
                drv_norm = []
                for _, row in drv_df.iterrows():
                    cmp = str(row["Compound"]).upper().strip()
                    std_cmp = COMPOUND_NAME_MAP.get(cmp, cmp)
                    offset = COMPOUND_BASE_OFFSETS.get(std_cmp, 0.0)
                    fuel_mass = row.get("FuelMass")
                    if fuel_mass is None or pd.isna(fuel_mass):
                        lap_num = int(row.get("LapNumber", 1))
                        fuel_mass = max(0.0, self.config.starting_fuel - (lap_num - 1) * self.config.fuel_burn_rate)
                    fuel_corr = self.fuel_effect * float(fuel_mass)
                    drv_norm.append(float(row["LapTimeSeconds"]) - offset - fuel_corr)
                if len(drv_norm) >= 3:
                    drv_base = float(np.percentile(drv_norm, 20))
                    self.driver_baselines[str(drv)] = round(max(45.0, min(200.0, drv_base)), 3)

        if self.config.debug_logging:
            print(f"Dynamic circuit baseline initialized: {self.circuit_baseline:.3f}s")
            for name, tyre in self.tyre_profiles.items():
                print(f"  {name} reset pace: {tyre.reset_pace:.3f}s")

        return self.circuit_baseline
        
    def estimate_track_abrasion(self, laps_df: pd.DataFrame) -> float:
        baseline = self._abrasion_baseline
        
        abrasion_samples = []
        
        for compound, base_rate in baseline.items():
            slick_laps = laps_df[
                (laps_df['Compound'] == compound) &
                (laps_df['TrackCondition'] == 'DRY')
            ]
            
            if slick_laps.empty:
                continue
            
            for driver in slick_laps['Driver'].unique():
                driver_laps = slick_laps[slick_laps['Driver'] == driver]
                
                for stint in driver_laps['Stint'].unique():
                    stint_laps = driver_laps[driver_laps['Stint'] == stint]
                    
                    if len(stint_laps) < 8:
                        continue
                    
                    stint_laps = stint_laps.copy()
                    stint_laps['LapOnTyre'] = range(1, len(stint_laps) + 1)
                    
                    fuel_corrected = (
                        stint_laps['LapTimeSeconds'] -
                        self.fuel_effect * stint_laps['FuelMass']
                    )
                    
                    delta = fuel_corrected - fuel_corrected.iloc[0]
                    
                    if delta.std() > 0:
                        slope, _, _, _ = stats.theilslopes(
                            delta.values, 
                            stint_laps['LapOnTyre'].values
                        )
                        
                        if slope > 0:
                            abrasion_samples.append(slope / base_rate)
        
        if len(abrasion_samples) < 3:
            if self.config.debug_logging:
                print("  Track abrasion: 1.000 (insufficient data, using neutral)")
            return 1.0  # Fallback to neutral
        
        abrasion = float(np.clip(np.median(abrasion_samples), 0.7, 1.4))
        
        if self.config.debug_logging:
            track_type = "abrasive" if abrasion > 1.05 else "smooth" if abrasion < 0.95 else "neutral"
            print(f"  Track abrasion: {abrasion:.3f} ({track_type}, from {len(abrasion_samples)} stints)")
        
        return abrasion
        
    def fit(self, laps_df: pd.DataFrame, driver: Optional[str] = None):
        """Fit model to lap data."""
        if driver and laps_df is not None and not laps_df.empty:
            driver_col = "Driver" if "Driver" in laps_df.columns else "driver"
            if driver_col in laps_df.columns:
                laps_df = laps_df[laps_df[driver_col] == driver]
        
        laps_clean = self._prepare_data(laps_df)
        
        if laps_clean.empty:
            if self.config.debug_logging:
                print("Warning: No valid laps after data preparation")
            return
        
        # Dynamically initialize circuit baseline from clean laps
        self.initialize_circuit_baseline(laps_clean)
        
        if self.config.enable_track_abrasion:
            self.track_abrasion = self.estimate_track_abrasion(laps_clean)
        else:
            self.track_abrasion = 1.0
        
        self._estimate_parameters(laps_clean)
        self._compute_latent_states(laps_clean)
        
        self._fitted = True
        
    def _prepare_data(self, laps_df: pd.DataFrame) -> pd.DataFrame:
        """Clean and validate lap data from either FastF1 or Web schema."""
        if laps_df is None or laps_df.empty:
            return pd.DataFrame()

        laps = laps_df.copy().reset_index(drop=True)

        # Schema alias mapping
        column_aliases = {
            "driver": "Driver",
            "lap": "LapNumber",
            "lap_number": "LapNumber",
            "lapNumber": "LapNumber",
            "timeSec": "LapTimeSeconds",
            "time_sec": "LapTimeSeconds",
            "LapTimeSec": "LapTimeSeconds",
            "compound": "Compound",
            "tyreLife": "TyreLife",
            "tyre_life": "TyreLife",
            "stint": "Stint",
            "trackCondition": "TrackCondition",
            "track_condition": "TrackCondition",
            "trackStatus": "TrackStatus",
            "track_status": "TrackStatus",
            "pitIn": "PitIn",
            "pit_in": "PitIn",
            "pitOut": "PitOut",
            "pit_out": "PitOut",
        }
        for old_col, new_col in column_aliases.items():
            if old_col in laps.columns and new_col not in laps.columns:
                laps[new_col] = laps[old_col]

        # Ensure Driver column
        if "Driver" not in laps.columns:
            laps["Driver"] = "DRV"
        else:
            laps["Driver"] = laps["Driver"].astype(str)

        # Ensure LapNumber column
        if "LapNumber" not in laps.columns:
            laps["LapNumber"] = range(1, len(laps) + 1)
        else:
            laps["LapNumber"] = pd.to_numeric(laps["LapNumber"], errors="coerce").fillna(1).astype(int)

        # Standardize Compound names
        if "Compound" in laps.columns:
            laps["Compound"] = (
                laps["Compound"]
                .astype(str)
                .str.upper()
                .str.strip()
                .map(lambda c: COMPOUND_NAME_MAP.get(c, c))
            )
        else:
            laps["Compound"] = "MEDIUM"

        # Standardize TrackCondition
        if "TrackCondition" not in laps.columns:
            laps["TrackCondition"] = "DRY"
        
        valid_conditions = {"DRY", "DAMP", "WET"}
        laps["TrackCondition"] = laps["TrackCondition"].astype(str).str.upper()
        laps.loc[~laps["TrackCondition"].isin(valid_conditions), "TrackCondition"] = "DRY"

        # Handle Pit In / Pit Out detection
        if "PitIn" in laps.columns:
            is_pit_in = laps["PitIn"].apply(lambda p: bool(p) if pd.notna(p) else False)
        elif "PitInTime" in laps.columns:
            is_pit_in = laps["PitInTime"].notna()
        else:
            is_pit_in = pd.Series(False, index=laps.index)

        if "PitOut" in laps.columns:
            is_pit_out = laps["PitOut"].apply(lambda p: bool(p) if pd.notna(p) else False)
        elif "PitOutTime" in laps.columns:
            is_pit_out = laps["PitOutTime"].notna()
        else:
            is_pit_out = pd.Series(False, index=laps.index)

        # Standardize LapTime to LapTimeSeconds
        if "LapTimeSeconds" not in laps.columns or laps["LapTimeSeconds"].isna().all():
            if "LapTime" in laps.columns:
                if pd.api.types.is_timedelta64_dtype(laps["LapTime"]):
                    laps["LapTimeSeconds"] = laps["LapTime"].dt.total_seconds()
                elif pd.api.types.is_numeric_dtype(laps["LapTime"]):
                    laps["LapTimeSeconds"] = laps["LapTime"].astype(float)
                else:
                    td = pd.to_timedelta(laps["LapTime"], errors="coerce")
                    laps["LapTimeSeconds"] = td.dt.total_seconds()
            else:
                laps["LapTimeSeconds"] = np.nan
        else:
            laps["LapTimeSeconds"] = pd.to_numeric(laps["LapTimeSeconds"], errors="coerce")

        # Auto-compute Stint if missing
        if "Stint" not in laps.columns or laps["Stint"].isna().all():
            laps = laps.sort_values(["Driver", "LapNumber"]).reset_index(drop=True)
            if "PitOut" in laps.columns:
                is_pit_out = laps["PitOut"].apply(lambda p: bool(p) if pd.notna(p) else False)
            elif "PitOutTime" in laps.columns:
                is_pit_out = laps["PitOutTime"].notna()
            else:
                is_pit_out = pd.Series(False, index=laps.index)
            stints = []
            for driver_name, drv_df in laps.groupby("Driver", sort=False):
                current_stint = 1
                prev_compound = None
                for idx, row in drv_df.iterrows():
                    cur_cmp = row.get("Compound")
                    p_out = is_pit_out.loc[idx]
                    if prev_compound is not None and (cur_cmp != prev_compound or p_out):
                        current_stint += 1
                    prev_compound = cur_cmp
                    stints.append(current_stint)
            laps["Stint"] = stints
        else:
            laps["Stint"] = pd.to_numeric(laps["Stint"], errors="coerce").fillna(1).astype(int)

        # Filtering valid laps
        has_multiple_laps = len(laps) > 2
        lap_filter = (
            ~is_pit_in.values &
            ~is_pit_out.values &
            laps["LapTimeSeconds"].notna().values &
            ((laps["LapTimeSeconds"] > 40.0) & (laps["LapTimeSeconds"] < 300.0)).values &
            laps["Compound"].notna().values
        )
        if has_multiple_laps:
            lap_filter = lap_filter & (laps["LapNumber"] > 1).values

        laps = laps[lap_filter].copy().reset_index(drop=True)

        if laps.empty:
            return laps

        laps["FuelMass"] = (
            self.config.starting_fuel -
            (laps["LapNumber"] - 1) * self.config.fuel_burn_rate
        ).clip(lower=0)

        laps = laps.sort_values(["Driver", "LapNumber"]).reset_index(drop=True)

        return laps
    
    def _get_tyre_category(self, compound: str) -> TyreCategory:
        if compound not in self.tyre_profiles:
            print(f"Warning: Unknown compound '{compound}', assuming MEDIUM slick")
            return TyreCategory.SLICK
        return self.tyre_profiles[compound].category
    
    def _should_use_lap_for_fitting(
        self,
        compound: str,
        track_condition: str
    ) -> bool:
        tyre_category = self._get_tyre_category(compound)
        
        condition_map = {
            'DRY': TrackCondition.DRY,
            'DAMP': TrackCondition.DAMP,
            'WET': TrackCondition.WET
        }
        condition = condition_map.get(track_condition, TrackCondition.DRY)
        
        matching_conditions = {
            TyreCategory.SLICK: [TrackCondition.DRY],
            TyreCategory.INTER: [TrackCondition.DAMP, TrackCondition.WET, TrackCondition.DRY],
            TyreCategory.WET: [TrackCondition.WET]
        }
        
        return condition in matching_conditions.get(tyre_category, [])
    
    def _estimate_parameters(self, laps_df: pd.DataFrame):
        compound_slopes = {name: [] for name in self.tyre_profiles.keys()}
        
        for compound_name, tyre in self.tyre_profiles.items():
            compound_laps = laps_df[laps_df['Compound'] == compound_name]
            
            if len(compound_laps) < 5:
                continue
            
            for driver in compound_laps['Driver'].unique():
                driver_laps = compound_laps[compound_laps['Driver'] == driver]
                
                for stint in driver_laps['Stint'].unique():
                    stint_laps = driver_laps[driver_laps['Stint'] == stint]
                    
                    if len(stint_laps) < 5:
                        continue
                    valid_laps = stint_laps[
                        stint_laps.apply(
                            lambda row: self._should_use_lap_for_fitting(
                                row['Compound'],
                                row['TrackCondition']
                            ),
                            axis=1
                        )
                    ]
                    
                    if len(valid_laps) < 3:
                        continue
                    
                    valid_laps = valid_laps.copy()
                    valid_laps['LapOnTyre'] = range(1, len(valid_laps) + 1)
                    
                    fuel_corrected = (
                        valid_laps['LapTimeSeconds'] -
                        self.fuel_effect * valid_laps['FuelMass']
                    )
                    
                    first_fc = fuel_corrected.iloc[0]
                    valid_laps['DeltaFromFirst'] = fuel_corrected - first_fc
                    
                    if self.config.enable_warmup:
                        analysis_laps = valid_laps[
                            valid_laps['LapOnTyre'] > tyre.warmup_laps
                        ]
                    else:
                        analysis_laps = valid_laps
                    
                    if tyre.max_analysis_laps is not None:
                        analysis_laps = analysis_laps[
                            analysis_laps['LapOnTyre'] <= tyre.max_analysis_laps
                        ]
                    
                    if len(analysis_laps) > 2:
                        x = analysis_laps['LapOnTyre'].values
                        y = analysis_laps['DeltaFromFirst'].values
                        
                        if len(x) > 0 and np.std(y) > 0:
                            slope, _, _, _ = stats.theilslopes(y, x)
                            slope = max(0, slope)
                            
                            if self.config.enable_track_abrasion and self.track_abrasion > 0:
                                slope = slope / self.track_abrasion
                            
                            if tyre.category == TyreCategory.INTER:
                                dry_fraction = (valid_laps['TrackCondition'] == 'DRY').sum() / len(valid_laps)
                                if dry_fraction > 0.3:
                                    slope = min(slope, 0.08)
                            
                            compound_slopes[compound_name].append(slope)
        
        for compound_name, tyre in self.tyre_profiles.items():
            if len(compound_slopes[compound_name]) > 0:
                median_slope = np.median(compound_slopes[compound_name])
                
                if tyre.category == TyreCategory.SLICK:
                    prior_weight = 0.3
                elif tyre.category == TyreCategory.INTER:
                    prior_weight = 0.4
                else:  
                    prior_weight = 0.5
                
                updated_rate = (
                    prior_weight * tyre.degradation_rate +
                    (1 - prior_weight) * median_slope
                )
                
                tyre.degradation_rate = updated_rate
                
                print(f"  {compound_name}: {tyre.degradation_rate:.4f} s/lap "
                      f"(from {len(compound_slopes[compound_name])} stints)")
            else:
                print(f"  {compound_name}: {tyre.degradation_rate:.4f} s/lap "
                      f"(using prior - insufficient valid stints)")
    
    def _compute_mismatch_penalty(
        self,
        compound: str,
        track_condition: str
    ) -> float:
        if compound not in self.tyre_profiles:
            return 0.0
        
        tyre_category = self.tyre_profiles[compound].category
        
        condition_map = {
            'DRY': TrackCondition.DRY,
            'DAMP': TrackCondition.DAMP,
            'WET': TrackCondition.WET
        }
        condition = condition_map.get(track_condition, TrackCondition.DRY)
        
        return self.config.mismatch_penalties.get(
            (tyre_category, condition),
            0.0
        )
    
    def _compute_latent_states(self, laps_df: pd.DataFrame):
        self._latent_states = {}
        self._latent_uncertainty = {}
        self._latent_by_lap = {}
        
        obs_var = self.sigma_epsilon ** 2
        proc_var = self.sigma_eta ** 2
        
        for driver in laps_df["Driver"].unique():
            driver_laps = (
                laps_df[laps_df["Driver"] == driver]
                .sort_values("LapNumber")
                .reset_index(drop=True)
            )
            
            mu_alpha = None
            var_alpha = None
            states = []
            variances = []
            prev_stint = None
            prev_condition_category = None
            stint_lap_count = 0
            
            self._latent_by_lap[driver] = {}

            for _, lap in driver_laps.iterrows():
                lap_num = int(lap["LapNumber"])
                raw_compound = lap["Compound"]
                compound = COMPOUND_NAME_MAP.get(str(raw_compound).upper().strip(), str(raw_compound).upper().strip())
                lap_time = lap["LapTimeSeconds"]
                fuel = lap["FuelMass"]
                stint = lap["Stint"]
                track_condition = lap.get("TrackCondition", "DRY")
                
                if compound not in self.tyre_profiles:
                    if self.config.debug_logging:
                        print(f"Warning: Unknown compound '{compound}' for {driver}, carrying forward state")
                    if mu_alpha is not None:
                        states.append(mu_alpha)
                        variances.append(var_alpha)
                    continue
                
                tyre = self.tyre_profiles[compound]
                
                condition_map = {
                    'DRY': TrackCondition.DRY,
                    'DAMP': TrackCondition.DAMP,
                    'WET': TrackCondition.WET
                }
                current_condition = condition_map.get(track_condition, TrackCondition.DRY)
                condition_category = 'DRY' if current_condition == TrackCondition.DRY else 'WET'
                
                condition_changed = (
                    prev_condition_category is not None and
                    prev_condition_category != condition_category
                )
                
                stint_reset_pace = self.get_driver_reset_pace(driver, compound)

                abrasion_factor = self.track_abrasion
                if tyre.category == TyreCategory.WET:
                    abrasion_factor = 1.0 + 0.3 * (self.track_abrasion - 1.0)
                nu = tyre.degradation_rate * abrasion_factor

                mismatch_penalty = self._compute_mismatch_penalty(
                    compound,
                    track_condition
                )

                if mu_alpha is None or stint != prev_stint or condition_changed:
                    if condition_changed and self.config.debug_logging:
                        old_category = prev_condition_category
                        print(f"  {driver}: Track transition {old_category}→{condition_category}, resetting pace")
                    
                    stint_lap_count = 1
                    lap_on_tyre = 1
                    if "TyreLife" in lap and pd.notna(lap["TyreLife"]) and int(lap["TyreLife"]) > 0:
                        lap_on_tyre = int(lap["TyreLife"])

                    cliff_penalty = 0.0
                    if getattr(self.config, 'enable_thermal_cliff', True) and lap_on_tyre > tyre.cliff_lap:
                        cliff_penalty = tyre.cliff_factor * ((lap_on_tyre - tyre.cliff_lap) ** 2)

                    drift = nu + cliff_penalty
                    if mismatch_penalty > 0.5:
                        drift = drift * (1.0 + mismatch_penalty / 10.0)

                    warmup_penalty = self._compute_warmup_penalty(tyre, lap_on_tyre)
                    
                    # Initialize at driver's stint reset pace with 1-lap drift prior
                    mu_prior = stint_reset_pace + drift
                    var_prior = proc_var * 2
                    
                    expected_lap = mu_prior + self.fuel_effect * fuel + mismatch_penalty + warmup_penalty
                    innovation = lap_time - expected_lap
                    kalman_gain = var_prior / (var_prior + obs_var)
                    
                    mu_alpha = mu_prior + kalman_gain * innovation
                    var_alpha = (1.0 - kalman_gain) * var_prior
                    
                    prev_stint = stint
                    prev_condition_category = condition_category
                else:
                    stint_lap_count += 1
                    lap_on_tyre = stint_lap_count
                    if "TyreLife" in lap and pd.notna(lap["TyreLife"]) and int(lap["TyreLife"]) > 0:
                        lap_on_tyre = int(lap["TyreLife"])

                    cliff_penalty = 0.0
                    if getattr(self.config, 'enable_thermal_cliff', True) and lap_on_tyre > tyre.cliff_lap:
                        cliff_penalty = tyre.cliff_factor * ((lap_on_tyre - tyre.cliff_lap) ** 2)
                    
                    drift = nu + cliff_penalty
                    if mismatch_penalty > 0.5:
                        drift = drift * (1.0 + mismatch_penalty / 10.0)
                    
                    warmup_penalty = self._compute_warmup_penalty(tyre, lap_on_tyre)
                    mu_pred = mu_alpha + drift
                    var_pred = var_alpha + proc_var
                    
                    expected_lap = (
                        mu_pred +
                        self.fuel_effect * fuel +
                        mismatch_penalty +
                        warmup_penalty
                    )
                    
                    innovation = lap_time - expected_lap
                    innovation_var = var_pred + obs_var
                    kalman_gain = var_pred / innovation_var
                    
                    mu_alpha = mu_pred + kalman_gain * innovation
                    var_alpha = (1.0 - kalman_gain) * var_pred
                
                states.append(mu_alpha)
                variances.append(var_alpha)

                self._latent_by_lap[driver][lap_num] = {
                    "mu": mu_alpha,
                    "var": var_alpha,
                    "stint": stint,
                    "compound": compound,
                    "lap_on_tyre": lap_on_tyre,
                    "stint_reset_pace": stint_reset_pace,
                }
            
            self._latent_states[driver] = states
            self._latent_uncertainty[driver] = variances
    
    def _compute_warmup_penalty(self, tyre: TyreProfile, lap_on_tyre: int) -> float:
        if not self.config.enable_warmup or lap_on_tyre > tyre.warmup_laps:
            return 0.0
        
        warmup_penalties = {
            TyreCategory.SLICK: 0.3,
            TyreCategory.INTER: 0.2,
            TyreCategory.WET: 0.15
        }
        
        max_penalty = warmup_penalties.get(tyre.category, 0.2)
        
        if tyre.warmup_laps > 0:
            penalty = max_penalty * (1 - (lap_on_tyre - 1) / tyre.warmup_laps)
        else:
            penalty = 0.0
        
        return penalty
    
    def predict_next_lap(
        self,
        driver: str,
        current_lap: int,
        laps_df: pd.DataFrame,
        track_condition: Optional[str] = None
    ) -> Tuple[float, float, Dict]:
        if not self._fitted:
            raise RuntimeError("Model must be fitted before prediction")
        
        driver_col = "Driver" if "Driver" in laps_df.columns else "driver"
        lap_col = "LapNumber" if "LapNumber" in laps_df.columns else "lap"

        driver_laps = laps_df[
            (laps_df[driver_col] == driver) &
            (laps_df[lap_col] <= current_lap)
        ].sort_values(lap_col)
        
        if driver_laps.empty:
            return None, None, {}
        
        last_lap = driver_laps.iloc[-1]
        raw_compound = last_lap.get('Compound', last_lap.get('compound', 'MEDIUM'))
        compound = COMPOUND_NAME_MAP.get(str(raw_compound).upper().strip(), str(raw_compound).upper().strip())
        stint = last_lap.get('Stint', last_lap.get('stint', 1))
        
        if compound not in self.tyre_profiles:
            if self.config.debug_logging:
                print(f"Warning: Unknown compound '{compound}'")
            return None, None, {}
        
        tyre = self.tyre_profiles[compound]
        
        stint_col = 'Stint' if 'Stint' in driver_laps.columns else 'stint'
        if stint_col in driver_laps.columns:
            stint_laps = driver_laps[driver_laps[stint_col] == stint]
        else:
            stint_laps = driver_laps

        tyre_life_val = last_lap.get('TyreLife', last_lap.get('tyre_life'))
        if tyre_life_val is not None and pd.notna(tyre_life_val) and int(tyre_life_val) > 0:
            laps_on_tyre = int(tyre_life_val)
        else:
            laps_on_tyre = len(stint_laps)
        
        next_lap_on_tyre = laps_on_tyre + 1

        abrasion_factor = self.track_abrasion
        if tyre.category == TyreCategory.WET:
            abrasion_factor = 1.0 + 0.3 * (self.track_abrasion - 1.0)
        
        effective_degradation = tyre.degradation_rate * abrasion_factor
        
        # Thermal cliff penalty
        cliff_penalty = 0.0
        if getattr(self.config, 'enable_thermal_cliff', True) and next_lap_on_tyre > tyre.cliff_lap:
            cliff_penalty = tyre.cliff_factor * ((next_lap_on_tyre - tyre.cliff_lap) ** 2)
            
        step_deg = effective_degradation + cliff_penalty

        # Actively read and propagate filtered posterior latent pace when available
        mu_alpha = None
        var_alpha = None
        last_lap_num = int(last_lap[lap_col])
        
        stint_latents = [
            (l_num, entry) for l_num, entry in self._latent_by_lap.get(driver, {}).items()
            if l_num <= last_lap_num and entry.get("stint") == stint
        ]
        if stint_latents:
            best_lap, best_entry = max(stint_latents, key=lambda x: x[0])
            mu_alpha = best_entry["mu"]
            var_alpha = best_entry["var"]
            laps_gap = max(0, last_lap_num - best_lap)
            if laps_gap > 0:
                mu_alpha = mu_alpha + laps_gap * step_deg
                var_alpha = var_alpha + laps_gap * (self.sigma_eta ** 2)

        reset_pace = self.get_driver_reset_pace(driver, compound)
        if mu_alpha is not None:
            # Active Kalman latent state propagation: α_{t+1} = μ_α[-1] + effective_degradation (+ cliff)
            alpha_t = mu_alpha + step_deg
            var_alpha_next = (var_alpha if var_alpha is not None else self.sigma_eta ** 2) + self.sigma_eta ** 2
        else:
            # Graceful prior fallback if no laps on current tyre have been observed
            if laps_on_tyre <= 1:
                alpha_t = reset_pace
            else:
                alpha_t = reset_pace + (laps_on_tyre - 1) * effective_degradation + cliff_penalty
            var_alpha_next = self.sigma_eta ** 2 * max(1, laps_on_tyre)

        warmup_penalty = self._compute_warmup_penalty(tyre, next_lap_on_tyre)
        alpha_t = alpha_t + warmup_penalty
        
        next_lap = current_lap + 1
        fuel_next = max(
            0,
            self.config.starting_fuel - (next_lap - 1) * self.config.fuel_burn_rate
        )
        
        if track_condition is None:
            track_condition = last_lap.get('TrackCondition', last_lap.get('track_condition', 'DRY'))
        
        mismatch_penalty = self._compute_mismatch_penalty(compound, track_condition)
        
        predicted_time = alpha_t + self.fuel_effect * fuel_next + mismatch_penalty
        std_dev = float(np.sqrt(var_alpha_next + self.sigma_epsilon ** 2))
        
        max_laps = tyre.max_degradation / max(effective_degradation, 0.001)
        effective_laps = laps_on_tyre * (1.0 + mismatch_penalty / 5.0)
        cliff_health_penalty = 0.0
        if getattr(self.config, 'enable_thermal_cliff', True) and laps_on_tyre > tyre.cliff_lap:
            cliff_health_penalty = (laps_on_tyre - tyre.cliff_lap) * 2.5
            
        health = max(0, min(100, 100 * (1 - (effective_laps + cliff_health_penalty) / max_laps)))
        
        info = {
            'latent_pace': float(alpha_t),
            'predicted_time': float(predicted_time),
            'std_dev': std_dev,
            'health': int(health),
            'laps_on_tyre': laps_on_tyre,
            'compound': compound,
            'category': tyre.category.value,
            'degradation_rate': tyre.degradation_rate,
            'effective_degradation': effective_degradation,  
            'cliff_penalty': cliff_penalty,
            'track_abrasion': self.track_abrasion,  
            'mismatch_penalty': mismatch_penalty,
            'track_condition': track_condition,
            'confidence_95': (
                float(predicted_time - 1.96 * std_dev),
                float(predicted_time + 1.96 * std_dev)
            )
        }
        
        return predicted_time, std_dev, info
    
    def get_degradation_rate(self, compound: str) -> float:
        """Get current degradation rate for compound."""
        c = COMPOUND_NAME_MAP.get(str(compound).upper().strip(), str(compound).upper().strip())
        if c not in self.tyre_profiles:
            return 0.05
        return self.tyre_profiles[c].degradation_rate
    
    def get_health(
        self,
        driver: str,
        current_lap: int,
        laps_df: pd.DataFrame,
        track_condition: Optional[str] = None
    ) -> Optional[Dict]:
        """Get tyre health information."""
        _, _, info = self.predict_next_lap(
            driver,
            current_lap,
            laps_df,
            track_condition
        )
        
        if not info:
            return None
        
        reset_pace = self.get_driver_reset_pace(driver, info['compound'])
        expected_delta = info['effective_degradation'] * info['laps_on_tyre'] + info.get('cliff_penalty', 0.0)
        actual_delta = max(0.0, info['latent_pace'] - reset_pace)
        overdriving = bool(actual_delta > expected_delta + 0.3)
        return {
            'compound': info['compound'],
            'category': info['category'],
            'laps_on_tyre': info['laps_on_tyre'],
            'health': info['health'],
            'expected_delta': expected_delta,
            'actual_delta': round(actual_delta, 3),
            'overdriving': overdriving,
            'uncertainty': info['std_dev'],
            'latent_pace': info['latent_pace'],
            'mismatch_penalty': info['mismatch_penalty'],
            'track_condition': info['track_condition'],
            'track_abrasion': info['track_abrasion']  
        }