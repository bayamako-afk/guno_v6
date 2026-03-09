# Station Data Notes

## Overview

This document describes the data sources, design decisions, and known limitations
of the GUNOS Tokyo Station Master DB and Station Graph.

---

## Data Sources

| Dataset | Source | Notes |
|---|---|---|
| JY (Yamanote Line) station coordinates | `jr-east-yamanote_stations.geojson` (OSM Overpass) | 30 stations |
| Metro line coordinates (G / M / T / Z) | Embedded OSM / ekidata public data | Verified against OSM node positions |

---

## File Descriptions

### data/master/

| File | Description |
|---|---|
| `stations_tokyo_master.json` | Layer A — 86 unique stations across 5 lines |
| `station_lines_tokyo.json` | Layer B — 104 station-line relations |
| `lines_tokyo_master.json` | Layer C — 5 line records |
| `tokyo_station_master_validation.json` | Quality check results (v1.1) |

### data/graph/

| File | Description |
|---|---|
| `station_graph_tokyo.json` | Graph with 86 nodes, 100 edges, graph_statistics |

---

## station_global_id Format

```
ST_{lat4dec}_{lon4dec}
```

Example: `ST_356582_1397016` → lat=35.6582, lon=139.7016

IDs are generated from coordinates rounded to 4 decimal places.
**Do not modify station_global_id values.**

---

## Edge Normalization Rule

Edges are undirected and stored with `from < to` (lexicographic order on station_global_id).

```
norm_from = min(station_global_id_A, station_global_id_B)
norm_to   = max(station_global_id_A, station_global_id_B)
edge_id   = f"{line_id}_{norm_from}_{norm_to}"
```

---

## v1.1 Fixes

| Fix | Description |
|---|---|
| FIX1 | Corrected prefecture for 6 Chiba-located Tozai Line stations (`prefecture_code=12`) |
| FIX2 | Updated Tozai Line `prefectures` field to `["東京都", "千葉県"]` |
| FIX3 | Added `prefecture_mismatch` and `stations_outside_tokyo` to validation output |
| FIX4 | Corrected Marunouchi Line M12: `溜池山王` → `国会議事堂前` |
| FIX5 | Improved coordinate accuracy for Tozai Line Chiba section |

---

## Known Limitations

- 丸ノ内線 branch line (Mb: 中野坂上 ↔ 方南町) is excluded in v1.x.
- Coordinate precision is limited to 4 decimal places (~11m resolution).
- `溜池山王` and `国会議事堂前` are physically adjacent; their GIDs use slightly
  different lat values (35.6740 vs 35.6742) to avoid collision.
- Similarly, `永田町` uses lat=35.6738 to distinguish from `溜池山王` (35.6740).

---

## Future Pipeline

```
station_master
  → station_graph
  → network_metrics       (data/derived/station_metrics_tokyo.json)
  → deck_generator        (data/derived/deck_candidates_tokyo.json)
  → guno_cards            (data/derived/guno_pack_tokyo.json)
```
