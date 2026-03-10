#!/usr/bin/env python3
"""
GUNO V6 — Deck Generator
Input:  data/derived/station_metrics_tokyo.json
Output: data/decks/deck_tokyo_v1.json
        data/decks/deck_tokyo_v1.csv
"""

import json
import csv
import os
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent.parent
METRICS_IN  = BASE_DIR / "data" / "derived" / "station_metrics_tokyo.json"
DECK_OUT    = BASE_DIR / "data" / "decks" / "deck_tokyo_v1.json"
CSV_OUT     = BASE_DIR / "data" / "decks" / "deck_tokyo_v1.csv"

# ── Config ─────────────────────────────────────────────────────────────────
DECK_SIZE = 40

RARITY_RULES = [
    (range(1,  6),  "S"),
    (range(6,  16), "A"),
    (range(16, 31), "B"),
    (range(31, 41), "C"),
]

def assign_rarity(rank: int) -> str:
    for r_range, rarity in RARITY_RULES:
        if rank in r_range:
            return rarity
    return "C"

# ── Load metrics ───────────────────────────────────────────────────────────
print("[DeckGen] Loading metrics:", METRICS_IN)
with open(METRICS_IN, "r", encoding="utf-8") as f:
    metrics_data = json.load(f)

stations = metrics_data["stations"]
print(f"[DeckGen] Total stations: {len(stations)}")

# ── Sort by score_total descending ─────────────────────────────────────────
sorted_stations = sorted(stations, key=lambda s: s["score_total"], reverse=True)

# ── Select top 40 ─────────────────────────────────────────────────────────
selected = sorted_stations[:DECK_SIZE]
print(f"[DeckGen] Selected top {DECK_SIZE} stations")

# ── Generate cards ─────────────────────────────────────────────────────────
cards = []
for i, station in enumerate(selected, start=1):
    rarity = assign_rarity(i)
    card = {
        "card_id":           f"card_{i:03d}",
        "station_global_id": station["station_global_id"],
        "station_name":      station["station_name"],
        "station_slug":      station["station_slug"],
        "score_total":       round(station["score_total"], 4),
        "rarity":            rarity,
        "rank":              i,
    }
    cards.append(card)
    print(f"  [{rarity}] #{i:02d} {station['station_name']} (score: {station['score_total']:.4f})")

# ── Build deck JSON ────────────────────────────────────────────────────────
deck = {
    "deck_meta": {
        "version":        "1.0",
        "source_metrics": "station_metrics_tokyo.json",
        "deck_size":      DECK_SIZE,
        "rarity_distribution": {
            "S": sum(1 for c in cards if c["rarity"] == "S"),
            "A": sum(1 for c in cards if c["rarity"] == "A"),
            "B": sum(1 for c in cards if c["rarity"] == "B"),
            "C": sum(1 for c in cards if c["rarity"] == "C"),
        }
    },
    "cards": cards
}

# ── Write JSON ─────────────────────────────────────────────────────────────
DECK_OUT.parent.mkdir(parents=True, exist_ok=True)
with open(DECK_OUT, "w", encoding="utf-8") as f:
    json.dump(deck, f, ensure_ascii=False, indent=2)
print(f"\n[DeckGen] JSON written: {DECK_OUT}")

# ── Write CSV ──────────────────────────────────────────────────────────────
fieldnames = ["card_id", "station_global_id", "station_name", "station_slug",
              "score_total", "rarity", "rank"]
with open(CSV_OUT, "w", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(cards)
print(f"[DeckGen] CSV written: {CSV_OUT}")

# ── Summary ────────────────────────────────────────────────────────────────
dist = deck["deck_meta"]["rarity_distribution"]
print(f"\n[DeckGen] Deck complete — {DECK_SIZE} cards")
print(f"  S: {dist['S']}  A: {dist['A']}  B: {dist['B']}  C: {dist['C']}")
