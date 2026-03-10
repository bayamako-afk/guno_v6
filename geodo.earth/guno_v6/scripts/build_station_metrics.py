#!/usr/bin/env python3.11
"""
build_station_metrics.py
GUNO V6 / GUNOS — Station Network Metrics Generator
Input : data/graph/station_graph_tokyo.json
Output: data/derived/station_metrics_tokyo.json
        data/derived/station_metrics_tokyo.csv
"""

import json
import csv
import math
from pathlib import Path
import networkx as nx

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).resolve().parent.parent
GRAPH_PATH = BASE_DIR / "data" / "graph"   / "station_graph_tokyo.json"
OUT_DIR    = BASE_DIR / "data" / "derived"
OUT_JSON   = OUT_DIR / "station_metrics_tokyo.json"
OUT_CSV    = OUT_DIR / "station_metrics_tokyo.csv"

OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Score formula weights ──────────────────────────────────────────────────────
W_DEGREE      = 1.0
W_LINE_COUNT  = 1.5
W_HUB_SCORE   = 1.5
W_BETWEENNESS = 10.0

# ── Load graph ────────────────────────────────────────────────────────────────
print(f"[Metrics] Loading graph from {GRAPH_PATH}")
with open(GRAPH_PATH, encoding="utf-8") as f:
    graph_data = json.load(f)

nodes = graph_data["nodes"]
edges = graph_data["edges"]
stats = graph_data.get("graph_statistics", {})

print(f"[Metrics] nodes: {len(nodes)}, edges: {len(edges)}")

# ── Build NetworkX undirected graph ───────────────────────────────────────────
G = nx.Graph()

# Add nodes
for n in nodes:
    G.add_node(n["node_id"], **n)

# Add edges (undirected — from < to already normalized, but Graph handles duplicates)
for e in edges:
    G.add_edge(e["from"], e["to"],
               line_id=e.get("line_id", ""),
               line_name=e.get("line_name", ""),
               edge_id=e.get("edge_id", ""))

print(f"[Metrics] NetworkX graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")

# ── Compute betweenness centrality ────────────────────────────────────────────
print("[Metrics] Computing betweenness centrality...")
betweenness = nx.betweenness_centrality(G, normalized=True)

# ── Compute degree ────────────────────────────────────────────────────────────
degree_map = dict(G.degree())

# ── Build metrics records ─────────────────────────────────────────────────────
records = []
for n in nodes:
    nid         = n["node_id"]
    deg         = degree_map.get(nid, 0)
    line_count  = n.get("line_count", 0)
    hub_score   = n.get("hub_degree_global", 0)
    btwn        = betweenness.get(nid, 0.0)

    score_total = (
        deg         * W_DEGREE      +
        line_count  * W_LINE_COUNT  +
        hub_score   * W_HUB_SCORE   +
        btwn        * W_BETWEENNESS
    )

    records.append({
        "station_global_id": nid,
        "station_name":      n.get("station_name", ""),
        "station_slug":      n.get("station_slug", ""),
        "degree":            deg,
        "line_count":        line_count,
        "hub_score":         hub_score,
        "betweenness":       round(btwn, 6),
        "score_total":       round(score_total, 4),
    })

# Sort descending by score_total
records.sort(key=lambda x: x["score_total"], reverse=True)

# ── Rank ──────────────────────────────────────────────────────────────────────
for i, r in enumerate(records, 1):
    r["rank"] = i

# ── Assemble output ───────────────────────────────────────────────────────────
output = {
    "dataset_meta": {
        "version":      "1.0",
        "source_graph": "station_graph_tokyo.json",
        "node_count":   len(nodes),
        "edge_count":   len(edges),
        "score_formula": {
            "degree":      W_DEGREE,
            "line_count":  W_LINE_COUNT,
            "hub_score":   W_HUB_SCORE,
            "betweenness": W_BETWEENNESS,
        },
        "top_station":  records[0]["station_name"] if records else "",
    },
    "stations": records,
}

# ── Write JSON ────────────────────────────────────────────────────────────────
with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
print(f"[Metrics] Written: {OUT_JSON}")

# ── Write CSV ─────────────────────────────────────────────────────────────────
CSV_FIELDS = [
    "rank", "station_global_id", "station_name", "station_slug",
    "degree", "line_count", "hub_score", "betweenness", "score_total",
]
with open(OUT_CSV, "w", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(records)
print(f"[Metrics] Written: {OUT_CSV}")

# ── Summary ───────────────────────────────────────────────────────────────────
print("\n=== Station Metrics Build Complete ===")
print(f"  Stations processed : {len(records)}")
print(f"  Top 10 by score_total:")
print(f"  {'Rank':<5} {'Station':<16} {'Degree':>6} {'Lines':>6} {'Hub':>5} {'Btwn':>8} {'Score':>8}")
print(f"  {'-'*58}")
for r in records[:10]:
    print(f"  {r['rank']:<5} {r['station_name']:<16} {r['degree']:>6} "
          f"{r['line_count']:>6} {r['hub_score']:>5} "
          f"{r['betweenness']:>8.4f} {r['score_total']:>8.4f}")
