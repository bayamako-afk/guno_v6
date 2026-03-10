#!/usr/bin/env python3
"""
build_station_graph.py
GUNOS Platform - Station Graph Builder
Input:  stations_tokyo_master.json
        station_lines_tokyo.json
        lines_tokyo_master.json
Output: station_graph_tokyo.json
        station_graph_tokyo_nodes.csv
        station_graph_tokyo_edges.csv
"""

import json
import csv
from pathlib import Path
from collections import defaultdict

DATA_DIR = Path("/home/ubuntu/gunos_db/data")
VERSION  = "1.1"

# ── Load inputs ────────────────────────────────────────────────────────────

def load(filename):
    with open(DATA_DIR / filename, encoding="utf-8") as f:
        return json.load(f)

stations_master = load("stations_tokyo_master.json")
station_lines   = load("station_lines_tokyo.json")
lines_master    = load("lines_tokyo_master.json")

# ── Build nodes ────────────────────────────────────────────────────────────
# One node per unique station (station_global_id)

nodes = []
node_ids = set()

for s in stations_master:
    gid = s["station_global_id"]
    node = {
        "node_id":           gid,
        "station_global_id": gid,
        "station_name":      s["station_name"],
        "station_slug":      s["station_slug"],
        "lat":               s["lat"],
        "lon":               s["lon"],
        "line_count":        s["line_count"],
        "hub_degree_global": s["hub_degree_global"],
    }
    nodes.append(node)
    node_ids.add(gid)

print(f"Nodes built: {len(nodes)}")

# ── Build edges ────────────────────────────────────────────────────────────
# For each station_lines record, create an edge:
#   from = station_global_id
#   to   = adjacent_next_station_id
# Skip if next is None (terminal on non-loop line).
# Edges are undirected but stored as from→to by order_on_line.
# Deduplicate by (line_id, frozenset({from, to})).

line_meta = {l["line_id"]: l for l in lines_master}

edges = []
seen_edges = set()  # (line_id, from_gid, to_gid) with canonical order

validation_errors = []

for rec in station_lines:
    from_gid = rec["station_global_id"]
    to_gid   = rec.get("adjacent_next_station_id")
    line_id  = rec["line_id"]

    if to_gid is None:
        continue  # terminal station, no forward edge

    # Validation 1: nodes must exist
    if from_gid not in node_ids:
        validation_errors.append({
            "type": "missing_node",
            "detail": f"from={from_gid} not in nodes",
        })
        continue
    if to_gid not in node_ids:
        validation_errors.append({
            "type": "missing_node",
            "detail": f"to={to_gid} not in nodes (line={line_id})",
        })
        continue

    # Validation 2: no self-loop
    if from_gid == to_gid:
        validation_errors.append({
            "type": "self_loop",
            "detail": f"Self-loop at {from_gid} on line {line_id}",
        })
        continue

    # Normalize edge direction: from < to (lexicographic order on station_global_id)
    norm_from = min(from_gid, to_gid)
    norm_to   = max(from_gid, to_gid)

    # Deduplicate using normalized canonical key
    canonical = (line_id, norm_from, norm_to)
    if canonical in seen_edges:
        continue
    seen_edges.add(canonical)

    lm = line_meta.get(line_id, {})
    edge_id = f"{line_id}_{norm_from}_{norm_to}"

    edge = {
        "edge_id":       edge_id,
        "from":          norm_from,
        "to":            norm_to,
        "line_id":       line_id,
        "line_name":     rec["line_name"],
        "operator_name": rec["operator_name"],
    }
    edges.append(edge)

print(f"Edges built: {len(edges)}")
print(f"Validation errors: {len(validation_errors)}")
for e in validation_errors:
    print(f"  [{e['type']}] {e['detail']}")

# ── Graph statistics ───────────────────────────────────────────────────────

# Degree per node (number of edges)
degree = defaultdict(int)
for e in edges:
    degree[e["from"]] += 1
    degree[e["to"]]   += 1

# Edges per line
edges_per_line = defaultdict(int)
for e in edges:
    edges_per_line[e["line_id"]] += 1

# Hub nodes (degree >= 3)
hub_nodes = [n for n in nodes if n["hub_degree_global"] >= 2]

graph_statistics = {
    "version":      VERSION,
    "total_nodes":  len(nodes),
    "total_edges":  len(edges),
    "total_lines":  len(lines_master),
    "hub_nodes":    len(hub_nodes),
    "edges_per_line": dict(sorted(edges_per_line.items())),
    "validation": {
        "missing_node_refs":  len([e for e in validation_errors if e["type"] == "missing_node"]),
        "self_loops":         len([e for e in validation_errors if e["type"] == "self_loop"]),
        "duplicate_edges":    0,  # deduplicated above; count = 0 by construction
        "errors":             validation_errors,
    },
}

# ── Assemble output ────────────────────────────────────────────────────────

output = {
    "nodes":            nodes,
    "edges":            edges,
    "graph_statistics": graph_statistics,
}

out_path = DATA_DIR / "station_graph_tokyo.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
print(f"Written: {out_path}")

# ── CSV exports ────────────────────────────────────────────────────────────

node_fields = ["node_id", "station_global_id", "station_name", "station_slug",
               "lat", "lon", "line_count", "hub_degree_global"]
edge_fields = ["edge_id", "from", "to", "line_id", "line_name", "operator_name"]

def write_csv(path, data, fields):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(data)
    print(f"Written: {path}")

write_csv(DATA_DIR / "station_graph_tokyo_nodes.csv", nodes, node_fields)
write_csv(DATA_DIR / "station_graph_tokyo_edges.csv", edges, edge_fields)

# ── Summary ───────────────────────────────────────────────────────────────

print()
print("=== Station Graph Build Complete ===")
print(f"  Nodes        : {graph_statistics['total_nodes']}")
print(f"  Edges        : {graph_statistics['total_edges']}")
print(f"  Lines        : {graph_statistics['total_lines']}")
print(f"  Hub nodes    : {graph_statistics['hub_nodes']}")
print(f"  Edges/line   :")
for lid, cnt in graph_statistics["edges_per_line"].items():
    lname = line_meta[lid]["line_name"]
    print(f"    {lid}  {lname:8s}  {cnt} edges")
print(f"  Validation errors: {len(validation_errors)}")
