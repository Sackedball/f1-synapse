"""
Build Real Datasets for F1 Synapse ML Models.
Mines historical FastF1 telemetry and timing data to build real ground-truth datasets:
1. Overtake Dataset: car-following candidate pairs with continuous physics features and stable pass labels.
2. Pit Stop Dataset: discrete-time hazard labels (Y_L+1, Y_L+2, Y_L+3) with tyre life and strategy context.

CLI Usage:
  python scripts/build_real_datasets.py --dry-run
  python scripts/build_real_datasets.py --seasons 2023 --rounds 1 3 --output-dir data/
  python scripts/build_real_datasets.py --include-cached-web --sample-limit 1000
"""

import argparse
import os
import sys
from pathlib import Path
from typing import List, Optional
import pandas as pd

# Ensure project root is in sys.path
project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from src.ml.mining import (
    FastF1DatasetMiner,
    ensure_fastf1_cache,
    save_dataset,
    generate_mock_overtake_dataset,
    generate_mock_pit_dataset,
)


def parse_args():
    parser = argparse.ArgumentParser(
        description="F1 Synapse: Real Ground-Truth Data Mining Pipeline",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--seasons",
        nargs="+",
        type=int,
        default=[2023],
        help="F1 seasons to mine (e.g. 2023 2024)",
    )
    parser.add_argument(
        "--rounds",
        nargs="+",
        default=["1", "3"],
        help="Rounds to mine (e.g. 1 3, 1,3 or 'all')",
    )
    parser.add_argument(
        "--session-type",
        type=str,
        default="R",
        choices=["R", "S"],
        help="Session type ('R' for Race, 'S' for Sprint)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="data",
        help="Directory where mined datasets will be saved",
    )
    parser.add_argument(
        "--format",
        type=str,
        default="auto",
        choices=["auto", "csv", "parquet"],
        help="Export format for datasets",
    )
    parser.add_argument(
        "--sample-limit",
        type=int,
        default=None,
        help="Maximum candidate samples to retain per dataset (useful for rapid testing)",
    )
    parser.add_argument(
        "--sample-stride",
        type=float,
        default=1.0,
        help="Temporal sampling stride in seconds for candidate following pairs",
    )
    parser.add_argument(
        "--cache-dir",
        type=str,
        default=".fastf1-cache",
        help="Directory for FastF1 disk cache",
    )
    parser.add_argument(
        "--include-cached-web",
        action="store_true",
        help="Also mine from precomputed local web sessions in computed_data/web/",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fast testing mode: generates realistic mock ground-truth datasets without network or cache dependencies",
    )
    return parser.parse_args()


def mine_from_web_directory(
    miner: FastF1DatasetMiner,
    sample_limit: Optional[int] = None,
    sample_stride_sec: float = 1.0,
) -> tuple[List[pd.DataFrame], List[pd.DataFrame]]:
    """Mines precomputed local sessions stored in computed_data/web/."""
    from src.web.services.session_service import SessionService

    service = SessionService()
    web_dir = Path("computed_data/web")
    overtake_dfs: List[pd.DataFrame] = []
    pit_dfs: List[pd.DataFrame] = []

    if not web_dir.exists():
        return overtake_dfs, pit_dfs

    for session_folder in sorted(web_dir.iterdir()):
        if not session_folder.is_dir():
            continue
        sid = session_folder.name
        try:
            year, round_num, session_type = service.parse_session_id(sid)
        except Exception:
            continue

        if session_type != "R":
            continue

        print(f"Mining precomputed web session {sid}...")
        try:
            sess = service.load_from_disk(sid)
            if sess is None or sess.frame_store is None:
                continue

            # Convert loaded laps to DataFrame
            laps_records = [lap.model_dump() for lap in sess.laps]
            if laps_records:
                laps_df = pd.DataFrame(laps_records)
                # Map stints from sess.stints if available
                if getattr(sess, "stints", None):
                    stint_map = {}
                    for st in sess.stints:
                        for l in range(st.lap_start, st.lap_end + 1):
                            stint_map[(st.driver, l)] = st.stint
                    laps_df["stint"] = [
                        stint_map.get((r.get("driver"), r.get("lap")), 1)
                        for _, r in laps_df.iterrows()
                    ]
            else:
                laps_df = pd.DataFrame()

            circuit_len = (
                getattr(sess.track, "length_m", None)
                or getattr(sess.track, "circuit_length", None)
                or 5412.0
            )

            ot_df, p_df = miner.mine_from_frame_store(
                session_id=sid,
                circuit_id=round_num,
                frame_store=sess.frame_store,
                laps_df=laps_df,
                circuit_length=float(circuit_len),
                sample_stride_sec=sample_stride_sec,
                max_samples_per_race=sample_limit,
            )

            if not ot_df.empty:
                overtake_dfs.append(ot_df)
            if not p_df.empty:
                pit_dfs.append(p_df)

        except Exception as e:
            print(f"Warning: Failed to mine web session {sid}: {e}")

    return overtake_dfs, pit_dfs


def main():
    args = parse_args()

    print("=" * 70)
    print("F1 Synapse: Real Ground-Truth Data Mining Pipeline")
    print("=" * 70)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.dry_run:
        print("\n--- Running in DRY-RUN mode ---")
        n_samples = args.sample_limit or 500
        print(f"Generating realistic mock datasets ({n_samples} samples each)...")

        overtake_df = generate_mock_overtake_dataset(n_samples=n_samples)
        pit_df = generate_mock_pit_dataset(n_samples=n_samples)

        ext = ".parquet" if args.format == "parquet" else ".csv"
        ot_path = save_dataset(overtake_df, output_dir / f"overtake_dataset{ext}", file_format=args.format)
        pit_path = save_dataset(pit_df, output_dir / f"pit_stop_dataset{ext}", file_format=args.format)

        print(f"\n[OK] Mock Overtake Dataset saved to: {ot_path} ({len(overtake_df)} rows)")
        print(f"     Class balance: Y=1 (Overtakes): {(overtake_df['target_overtake'] == 1).sum()} | Y=0 (Defended): {(overtake_df['target_overtake'] == 0).sum()}")
        print(f"[OK] Mock Pit Stop Dataset saved to: {pit_path} ({len(pit_df)} rows)")
        print(f"     Hazard L+1: {(pit_df['target_pit_l1'] == 1).sum()} | L+2: {(pit_df['target_pit_l2'] == 1).sum()} | L+3: {(pit_df['target_pit_l3'] == 1).sum()}")
        print("Dry run completed successfully.")
        return 0

    # Initialize miner and ensure cache
    miner = FastF1DatasetMiner(cache_dir=args.cache_dir)
    print(f"FastF1 cache verified at: {miner.cache_dir}")

    all_overtake_dfs: List[pd.DataFrame] = []
    all_pit_dfs: List[pd.DataFrame] = []

    # 1. Optionally mine precomputed local web sessions
    if args.include_cached_web:
        print("\nChecking precomputed web sessions...")
        web_ot, web_pit = mine_from_web_directory(
            miner=miner,
            sample_limit=args.sample_limit,
            sample_stride_sec=args.sample_stride,
        )
        all_overtake_dfs.extend(web_ot)
        all_pit_dfs.extend(web_pit)

    # 2. Mine FastF1 historical sessions
    for season in args.seasons:
        rounds_to_process: List[int] = []
        if "all" in args.rounds:
            try:
                import fastf1
                schedule = fastf1.get_event_schedule(season)
                rounds_to_process = schedule[~schedule.is_testing()]["RoundNumber"].tolist()
            except Exception as e:
                print(f"Warning: Could not fetch schedule for {season}: {e}. Defaulting to rounds 1..3")
                rounds_to_process = [1, 2, 3]
        else:
            for r in args.rounds:
                for token in str(r).split(","):
                    tok = token.strip()
                    if tok.isdigit():
                        rounds_to_process.append(int(tok))

        print(f"\nProcessing Season {season} - Rounds: {rounds_to_process}")

        for rnd in rounds_to_process:
            try:
                ot_df, pit_df = miner.mine_session(
                    year=season,
                    round_number=rnd,
                    session_type=args.session_type,
                    max_samples_per_race=args.sample_limit,
                    sample_stride_sec=args.sample_stride,
                )
                if not ot_df.empty:
                    print(f"  -> Extracted {len(ot_df)} overtake candidate pairs (Y=1: {(ot_df['target_overtake'] == 1).sum()}, Y=0: {(ot_df['target_overtake'] == 0).sum()})")
                    all_overtake_dfs.append(ot_df)
                if not pit_df.empty:
                    print(f"  -> Extracted {len(pit_df)} pit stop hazard records (L+1: {(pit_df['target_pit_l1'] == 1).sum()})")
                    all_pit_dfs.append(pit_df)
            except Exception as e:
                print(f"Warning: Failed to process {season} Round {rnd}: {e}")

    # Consolidate and export
    print("\n" + "=" * 70)
    print("Consolidating Mined Datasets...")
    print("=" * 70)

    ext = ".parquet" if args.format == "parquet" else ".csv"

    if all_overtake_dfs:
        final_overtake_df = pd.concat(all_overtake_dfs, ignore_index=True)
        if args.sample_limit and len(final_overtake_df) > args.sample_limit:
            final_overtake_df = final_overtake_df.sample(n=args.sample_limit, random_state=42).reset_index(drop=True)
        ot_path = save_dataset(final_overtake_df, output_dir / f"overtake_dataset{ext}", file_format=args.format)
        print(f"[SUCCESS] Overtake Dataset: {ot_path}")
        print(f"          Total Samples : {len(final_overtake_df):,}")
        print(f"          Positive (Y=1): {(final_overtake_df['target_overtake'] == 1).sum():,} ({(final_overtake_df['target_overtake'] == 1).mean() * 100:.1f}%)")
        print(f"          Negative (Y=0): {(final_overtake_df['target_overtake'] == 0).sum():,} ({(final_overtake_df['target_overtake'] == 0).mean() * 100:.1f}%)")
        print(f"          Features      : {list(final_overtake_df.columns)}")
    else:
        print("[NOTICE] No overtake records mined. Run with --dry-run or check cache/network.")

    if all_pit_dfs:
        final_pit_df = pd.concat(all_pit_dfs, ignore_index=True)
        if args.sample_limit and len(final_pit_df) > args.sample_limit:
            final_pit_df = final_pit_df.sample(n=args.sample_limit, random_state=42).reset_index(drop=True)
        pit_path = save_dataset(final_pit_df, output_dir / f"pit_stop_dataset{ext}", file_format=args.format)
        print(f"\n[SUCCESS] Pit Stop Dataset: {pit_path}")
        print(f"          Total Laps    : {len(final_pit_df):,}")
        print(f"          Boxes L+1     : {(final_pit_df['target_pit_l1'] == 1).sum():,}")
        print(f"          Boxes L+2     : {(final_pit_df['target_pit_l2'] == 1).sum():,}")
        print(f"          Boxes L+3     : {(final_pit_df['target_pit_l3'] == 1).sum():,}")
        print(f"          Features      : {list(final_pit_df.columns)}")
    else:
        print("[NOTICE] No pit stop records mined. Run with --dry-run or check cache/network.")

    print("\nDataset mining pipeline completed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
