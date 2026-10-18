#!/usr/bin/env python3
"""
CLI Evaluation Script for F1 Synapse Machine Learning Models.
Evaluates Overtake Likelihood and Pit Window Anticipation models across
a 3-tier benchmark suite (Domain Heuristic, Uncalibrated Booster, Calibrated Monotone Physics)
using Leave-One-Circuit-Out (LOCO) Cross-Validation and evaluates production artifacts.

Outputs:
- Comparative Markdown tables printed to stdout.
- Structured JSON evaluation report saved to `reports/model_evaluation_report.json`.
- Comprehensive Markdown evaluation report saved to `reports/model_evaluation_report.md`.
"""

from __future__ import annotations
import argparse
import datetime
import json
import os
import sys
from typing import Any, Dict, Optional
import joblib
import numpy as np
import pandas as pd

# Ensure repository root is on sys.path
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from src.ml.features import OVERTAKE_FEATURE_COLUMNS, PIT_FEATURE_COLUMNS
from src.ml.overtake import prepare_overtake_dataframe
from src.ml.pit import prepare_pit_dataframe
from src.ml.mining import generate_mock_overtake_dataset, generate_mock_pit_dataset
from src.ml.evaluation import (
    benchmark_overtake_models,
    benchmark_pit_models,
    evaluate_predictions,
    format_benchmark_markdown_table,
    BenchmarkReport,
)


def load_or_fallback_dataset(
    file_path: str,
    dataset_type: str,
    n_fallback: int = 500,
) -> pd.DataFrame:
    """
    Loads dataset from CSV file if present, or falls back to synthetic data mining generator.
    """
    if os.path.exists(file_path):
        print(f"Loading {dataset_type} dataset from: {file_path}")
        try:
            df = pd.read_csv(file_path)
            if not df.empty:
                print(f"Loaded {len(df)} samples ({df.get('circuit_id', pd.Series()).nunique()} unique circuits).")
                return df
        except Exception as e:
            print(f"Warning: Failed to load {file_path}: {e}")

    print(f"Warning: {file_path} not found or empty. Generating {n_fallback} synthetic samples for {dataset_type}...")
    if dataset_type == "overtake":
        df = generate_mock_overtake_dataset(n_samples=n_fallback)
    else:
        df = generate_mock_pit_dataset(n_samples=n_fallback)

    # Distribute fallback data across multiple circuits to enable LOCO validation
    if "circuit_id" in df.columns and df["circuit_id"].nunique() < 2:
        df["circuit_id"] = np.repeat([1, 2, 3], (len(df) // 3) + 1)[: len(df)]

    print(f"Generated {len(df)} synthetic fallback samples across {df.get('circuit_id', pd.Series()).nunique()} unique circuits.")
    return df


def evaluate_production_artifacts(
    df_overtake: pd.DataFrame,
    df_pit: pd.DataFrame,
    overtake_model_path: str = "models/overtake_lgbm.joblib",
    pit_model_path: str = "models/pit_window_xgb.joblib",
) -> Dict[str, Any]:
    """
    Evaluates serialized production models on the provided datasets.
    """
    results: Dict[str, Any] = {}

    # 1. Overtake Model
    if os.path.exists(overtake_model_path) and ("target_overtake" in df_overtake.columns or "target" in df_overtake.columns):
        print(f"\nEvaluating serialized production overtake model: {overtake_model_path}")
        target_col = "target_overtake" if "target_overtake" in df_overtake.columns else "target"
        try:
            ot_model = joblib.load(overtake_model_path)
            X_ot = prepare_overtake_dataframe(df_overtake)[OVERTAKE_FEATURE_COLUMNS]
            p_ot = ot_model.predict_proba(X_ot)[:, 1]
            results["overtake"] = evaluate_predictions(
                df_overtake[target_col],
                p_ot,
                model_name="Production Overtake LightGBM (Calibrated)",
            )
        except Exception as e:
            print(f"Error evaluating production overtake model: {e}")
            results["overtake"] = {"error": str(e)}
    else:
        results["overtake"] = {"status": "Model artifact or target not found"}

    # 2. Pit Model
    if os.path.exists(pit_model_path) and ("target_pit" in df_pit.columns or "target" in df_pit.columns):
        print(f"Evaluating serialized production pit model: {pit_model_path}")
        target_col = "target_pit" if "target_pit" in df_pit.columns else "target"
        try:
            pit_model = joblib.load(pit_model_path)
            X_pit = prepare_pit_dataframe(df_pit)[PIT_FEATURE_COLUMNS]
            p_pit = pit_model.predict_proba(X_pit)[:, 1]
            results["pit_stop"] = evaluate_predictions(
                df_pit[target_col],
                p_pit,
                model_name="Production Pit Window XGBoost (Calibrated)",
            )
        except Exception as e:
            print(f"Error evaluating production pit model: {e}")
            results["pit_stop"] = {"error": str(e)}
    else:
        results["pit_stop"] = {"status": "Model artifact or target not found"}

    return results


def export_reports(
    overtake_report: BenchmarkReport,
    pit_report: BenchmarkReport,
    production_eval: Dict[str, Any],
    reports_dir: str,
    df_overtake: pd.DataFrame,
    df_pit: pd.DataFrame,
) -> Tuple[str, str]:
    """
    Exports structured JSON and formatted Markdown reports to reports_dir.
    """
    os.makedirs(reports_dir, exist_ok=True)
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()

    json_path = os.path.join(reports_dir, "model_evaluation_report.json")
    md_path = os.path.join(reports_dir, "model_evaluation_report.md")

    # 1. JSON Report
    report_json_data = {
        "timestamp": timestamp,
        "summary": {
            "overtake_samples": len(df_overtake),
            "overtake_circuits": int(df_overtake.get("circuit_id", pd.Series()).nunique()),
            "pit_samples": len(df_pit),
            "pit_circuits": int(df_pit.get("circuit_id", pd.Series()).nunique()),
        },
        "overtake_benchmark": overtake_report.metrics,
        "pit_benchmark": pit_report.metrics,
        "production_models": production_eval,
    }

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(report_json_data, f, indent=2)

    # 2. Markdown Report
    md_lines = [
        "# F1 Synapse Machine Learning Evaluation Report",
        "",
        f"**Generated at:** `{timestamp}`",
        "",
        "## 1. Executive Summary",
        "",
        f"- **Overtake Evaluation Dataset:** {len(df_overtake)} samples across {df_overtake.get('circuit_id', pd.Series()).nunique()} unique circuit(s).",
        f"- **Pit Stop Evaluation Dataset:** {len(df_pit)} samples across {df_pit.get('circuit_id', pd.Series()).nunique()} unique circuit(s).",
        "- **Validation Protocol:** Leave-One-Circuit-Out (LOCO) Cross-Validation with fallback to Stratified K-Fold when group count < 2.",
        "- **Evaluation Metrics:** ROC-AUC, PR-AUC, Brier Score (lower is better), Expected Calibration Error (ECE, lower is better).",
        "",
        "## 2. Overtake Likelihood Model Benchmark",
        "",
        overtake_report.markdown_table,
        "",
        "### Overtake Benchmark Key Takeaways",
        r"- **Tier 1 (Physics Heuristic):** Establishes an interpretable kinematic lower bound using $\Delta s$, $\Delta v$, and DRS activation.",
        "- **Tier 2 (Uncalibrated LightGBM):** Captures multi-feature non-linear interactions but risks overconfident probability estimates on rare passes.",
        "- **Tier 3 (Calibrated Monotone Physics):** Enforces strict domain monotonicity (decreasing distance increases pass likelihood) and isotonic probability calibration for minimized ECE.",
        "",
        "## 3. Pit Stop Window Anticipation Benchmark",
        "",
        pit_report.markdown_table,
        "",
        "### Pit Stop Benchmark Key Takeaways",
        "- **Tier 1 (Stint Wear Heuristic):** Models baseline tyre age hazard and Safety Car / VSC pit opportunity bonuses.",
        "- **Tier 2 (Uncalibrated XGBoost):** Learns non-linear traffic gaps and fuel-corrected degradation slopes.",
        "- **Tier 3 (Calibrated Monotone Physics):** Enforces monotonic degradation penalties and isotonic calibration for honest pit anticipation probabilities.",
        "",
        "## 4. Production Model Verification",
        "",
    ]

    prod_metrics = {}
    if "overtake" in production_eval and "roc_auc" in production_eval["overtake"]:
        prod_metrics["Production Overtake LightGBM"] = production_eval["overtake"]
    if "pit_stop" in production_eval and "roc_auc" in production_eval["pit_stop"]:
        prod_metrics["Production Pit Window XGBoost"] = production_eval["pit_stop"]

    if prod_metrics:
        md_lines.append(format_benchmark_markdown_table(prod_metrics, title="Serialized Production Model Metrics"))
        md_lines.append("")
    else:
        md_lines.append("No production serialized models were successfully evaluated.")
        md_lines.append("")

    # Reliability diagram section
    md_lines.extend([
        "## 5. Calibration Reliability Summary",
        "",
        "Calibration bins evaluate the alignment between predicted probabilities and empirical event outcomes across decile confidence intervals.",
        "",
    ])

    for model_name, eval_dict in [("Overtake Model", production_eval.get("overtake")), ("Pit Window Model", production_eval.get("pit_stop"))]:
        if eval_dict and "reliability_bins" in eval_dict:
            md_lines.append(f"### {model_name} Reliability Bins")
            md_lines.append("| Bin | Probability Range | Samples | Mean Predicted | Empirical Accuracy |")
            md_lines.append("| :--- | :--- | :--- | :--- | :--- |")
            for b in eval_dict["reliability_bins"]:
                md_lines.append(
                    f"| {b['bin_idx']} | [{b['min_prob']:.2f}, {b['max_prob']:.2f}] | {b['sample_count']} | {b['mean_pred']:.4f} | {b['empirical_acc']:.4f} |"
                )
            md_lines.append("")

    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md_lines) + "\n")

    return json_path, md_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate F1 Synapse Machine Learning Models across 3-tier benchmark.")
    parser.add_argument("--overtake-data", type=str, default="data/overtake_dataset.csv", help="Path to overtake dataset CSV")
    parser.add_argument("--pit-data", type=str, default="data/pit_stop_dataset.csv", help="Path to pit stop dataset CSV")
    parser.add_argument("--reports-dir", type=str, default="reports", help="Directory to export JSON and Markdown reports")
    parser.add_argument("--cv-folds", type=int, default=None, help="Number of cross-validation folds (default: LOCO or auto)")
    args = parser.parse_args()
    if args.cv_folds is not None and args.cv_folds < 2:
        parser.error("--cv-folds must be an integer >= 2")

    print("=================================================================")
    print("      F1 SYNAPSE - STEP 6 MODEL EVALUATION PROTOCOL              ")
    print("=================================================================\n")

    # 1. Load Datasets
    df_ot = load_or_fallback_dataset(args.overtake_data, "overtake")
    df_pit = load_or_fallback_dataset(args.pit_data, "pit stop")

    # 2. Benchmark Overtake Models (3 Tiers)
    print("\n--- Running Overtake Likelihood Cross-Validation Benchmark ---")
    ot_report = benchmark_overtake_models(df_ot, n_splits=args.cv_folds)
    print("\n" + ot_report.markdown_table + "\n")

    # 3. Benchmark Pit Stop Models (3 Tiers)
    print("\n--- Running Pit Window Anticipation Cross-Validation Benchmark ---")
    pit_report = benchmark_pit_models(df_pit, n_splits=args.cv_folds)
    print("\n" + pit_report.markdown_table + "\n")

    # 4. Evaluate Serialized Production Models
    prod_eval = evaluate_production_artifacts(df_ot, df_pit)
    prod_table_dict = {}
    if "overtake" in prod_eval and "roc_auc" in prod_eval["overtake"]:
        prod_table_dict["Production Overtake LightGBM"] = prod_eval["overtake"]
    if "pit_stop" in prod_eval and "roc_auc" in prod_eval["pit_stop"]:
        prod_table_dict["Production Pit Window XGBoost"] = prod_eval["pit_stop"]

    if prod_table_dict:
        print("\n--- Serialized Production Model Metrics ---")
        print(format_benchmark_markdown_table(prod_table_dict) + "\n")

    # 5. Export Reports
    json_path, md_path = export_reports(ot_report, pit_report, prod_eval, args.reports_dir, df_ot, df_pit)
    print(f"Structured JSON evaluation report exported to: {json_path}")
    print(f"Comprehensive Markdown evaluation report exported to: {md_path}")
    print("\nEvaluation protocol successfully completed.")


if __name__ == "__main__":
    main()
