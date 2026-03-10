#!/usr/bin/env python3.11
"""
build_line_metrics.py
GUNO V6 / GUNOS — Line Metrics Generator

Inputs:
  data/master/lines_tokyo_master.json
  data/master/station_lines_tokyo.json
  data/derived/station_metrics_tokyo.json

Outputs:
  data/derived/line_metrics_tokyo.json
  data/derived/line_metrics_tokyo.csv (optional)
"""

import json
import csv
import math
from datetime import datetime, timezone
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR        = Path(__file__).resolve().parent.parent
LINES_MASTER    = BASE_DIR / "data" / "master"  / "lines_tokyo_master.json"
STATION_LINES   = BASE_DIR / "data" / "master"  / "station_lines_tokyo.json"
STATION_METRICS = BASE_DIR / "data" / "derived" / "station_metrics_tokyo.json"
OUT_DIR         = BASE_DIR / "data" / "derived"
OUT_JSON        = OUT_DIR / "line_metrics_tokyo.json"
OUT_CSV         = OUT_DIR / "line_metrics_tokyo.csv"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Formula weights ───────────────────────────────────────────────────────────
# line_strength = (station_count * 0.5) + (transfer_station_count * 2.0)
#               + (hub_score_sum * 0.3) + (avg_station_score * 0.5)
W_STRENGTH_STATION_COUNT   = 0.5
W_STRENGTH_TRANSFER_COUNT  = 2.0
W_STRENGTH_HUB_SCORE_SUM   = 0.3
W_STRENGTH_AVG_SCORE       = 0.5

# line_difficulty = (station_count * 0.4) - (transfer_station_count * 1.5)
#                 - (terminal_count * 0.3)
W_DIFFICULTY_STATION_COUNT  = 0.4
W_DIFFICULTY_TRANSFER_COUNT = 1.5
W_DIFFICULTY_TERMINAL_COUNT = 0.3

# ── Load inputs ───────────────────────────────────────────────────────────────
print(f"[LineMetrics] Loading lines master from {LINES_MASTER}")
with open(LINES_MASTER, encoding="utf-8") as f:
    lines_master = json.load(f)

print(f"[LineMetrics] Loading station_lines from {STATION_LINES}")
with open(STATION_LINES, encoding="utf-8") as f:
    station_lines_raw = json.load(f)

print(f"[LineMetrics] Loading station_metrics from {STATION_METRICS}")
with open(STATION_METRICS, encoding="utf-8") as f:
    metrics_data = json.load(f)

# ── Build lookup: station_global_id → metrics ─────────────────────────────────
stations_list = metrics_data.get("stations", metrics_data) if isinstance(metrics_data, dict) else metrics_data
station_metrics_map = {s["station_global_id"]: s for s in stations_list}
print(f"[LineMetrics] Station metrics loaded: {len(station_metrics_map)} stations")

# ── Build lookup: line_id → list of station_line entries ──────────────────────
from collections import defaultdict
line_stations_map = defaultdict(list)
for entry in station_lines_raw:
    line_stations_map[entry["line_id"]].append(entry)

# ── Validation tracking ───────────────────────────────────────────────────────
validation = {
    "total_lines_processed": 0,
    "missing_station_metrics": [],
    "lines_with_zero_transfers": [],
    "lines_with_zero_terminals": [],
}

# ── Compute metrics per line ──────────────────────────────────────────────────
results = []

for line in lines_master:
    line_id   = line["line_id"]
    line_name = line.get("line_name", "")
    line_name_en = line.get("line_name_en", "")
    operator  = line.get("operator_name", "")
    color     = line.get("color", "")
    is_loop   = line.get("is_loop", False)

    station_entries = line_stations_map.get(line_id, [])
    station_count   = len(station_entries)

    # Count transfer and terminal stations
    transfer_station_count = sum(1 for s in station_entries if s.get("is_transfer_station", False))
    terminal_count         = sum(1 for s in station_entries if s.get("is_terminal", False))

    # Gather station metrics for stations on this line
    hub_score_sum   = 0.0
    score_total_sum = 0.0
    missing_ids     = []

    for entry in station_entries:
        sid = entry["station_global_id"]
        m   = station_metrics_map.get(sid)
        if m is None:
            missing_ids.append(sid)
            continue
        hub_score_sum   += float(m.get("hub_score", 0) or 0)
        score_total_sum += float(m.get("score_total", 0) or 0)

    matched_count   = station_count - len(missing_ids)
    avg_station_score = round(score_total_sum / matched_count, 4) if matched_count > 0 else 0.0

    # Record validation issues
    if missing_ids:
        validation["missing_station_metrics"].append({
            "line_id": line_id,
            "missing_count": len(missing_ids),
            "missing_ids": missing_ids,
        })
    if transfer_station_count == 0:
        validation["lines_with_zero_transfers"].append(line_id)
    if terminal_count == 0 and not is_loop:
        validation["lines_with_zero_terminals"].append(line_id)

    # Compute line_strength and line_difficulty
    line_strength = (
        station_count          * W_STRENGTH_STATION_COUNT  +
        transfer_station_count * W_STRENGTH_TRANSFER_COUNT +
        hub_score_sum          * W_STRENGTH_HUB_SCORE_SUM  +
        avg_station_score      * W_STRENGTH_AVG_SCORE
    )
    line_difficulty = (
        station_count          * W_DIFFICULTY_STATION_COUNT  -
        transfer_station_count * W_DIFFICULTY_TRANSFER_COUNT -
        terminal_count         * W_DIFFICULTY_TERMINAL_COUNT
    )

    results.append({
        "line_id":                line_id,
        "line_name":              line_name,
        "line_name_en":           line_name_en,
        "operator_name":          operator,
        "color":                  color,
        "is_loop":                is_loop,
        "station_count":          station_count,
        "transfer_station_count": transfer_station_count,
        "terminal_count":         terminal_count,
        "hub_score_sum":          round(hub_score_sum, 4),
        "avg_station_score":      round(avg_station_score, 4),
        "line_strength":          round(line_strength, 4),
        "line_difficulty":        round(line_difficulty, 4),
    })

    validation["total_lines_processed"] += 1
    print(
        f"  [{line_id}] {line_name}: stations={station_count}, "
        f"transfers={transfer_station_count}, terminals={terminal_count}, "
        f"hub_score_sum={round(hub_score_sum,2)}, avg_score={round(avg_station_score,2)}, "
        f"strength={round(line_strength,2)}, difficulty={round(line_difficulty,2)}"
    )

# ── Sort by line_strength descending ─────────────────────────────────────────
results.sort(key=lambda x: x["line_strength"], reverse=True)

# ── Build output JSON ─────────────────────────────────────────────────────────
output = {
    "dataset_meta": {
        "version":      "1.0",
        "region":       "tokyo",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source_files": [
            "data/master/lines_tokyo_master.json",
            "data/master/station_lines_tokyo.json",
            "data/derived/station_metrics_tokyo.json",
        ],
        "formula": {
            "line_strength":    "station_count*0.5 + transfer_count*2.0 + hub_score_sum*0.3 + avg_score*0.5",
            "line_difficulty":  "station_count*0.4 - transfer_count*1.5 - terminal_count*0.3",
        },
        "total_lines": len(results),
    },
    "validation": validation,
    "lines": results,
}

# ── Write JSON ────────────────────────────────────────────────────────────────
with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
print(f"\n[LineMetrics] JSON written → {OUT_JSON}")

# ── Write CSV ─────────────────────────────────────────────────────────────────
CSV_FIELDS = [
    "line_id", "line_name", "line_name_en", "operator_name",
    "station_count", "transfer_station_count", "terminal_count",
    "hub_score_sum", "avg_station_score", "line_strength", "line_difficulty",
]
with open(OUT_CSV, "w", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(results)
print(f"[LineMetrics] CSV  written → {OUT_CSV}")

# ── Summary ───────────────────────────────────────────────────────────────────
print("\n=== Line Metrics Summary ===")
print(f"  Total lines processed : {validation['total_lines_processed']}")
print(f"  Missing station metrics: {len(validation['missing_station_metrics'])} lines affected")
print(f"  Lines with 0 transfers : {validation['lines_with_zero_transfers']}")
print(f"  Lines with 0 terminals : {validation['lines_with_zero_terminals']}")
print("\n  Ranking by line_strength:")
for i, r in enumerate(results, 1):
    print(f"  {i:2}. [{r['line_id']:4}] {r['line_name']:12} "
          f"strength={r['line_strength']:6.2f}  difficulty={r['line_difficulty']:5.2f}")
