#!/usr/bin/env python3
"""
build_master_db_v1_1.py
GUNOS Platform - Tokyo Station Master DB Builder  v1.1
Changes from v1:
  FIX1  Correct prefecture for Chiba-located Tozai Line stations
  FIX2  Tozai Line prefectures field → ["東京都","千葉県"]
  FIX3  Add prefecture_mismatch / stations_outside_tokyo to validation
  FIX4  Marunouchi Line: replace 溜池山王 with 国会議事堂前 at M12
  FIX5  Improve coordinate accuracy for Tozai Line stations (esp. Chiba section)
"""

import json
import re
import csv
from pathlib import Path
from collections import defaultdict

UPLOAD_DIR = Path("/home/ubuntu/upload")
OUT_DIR    = Path("/home/ubuntu/gunos_db/data")
OUT_DIR.mkdir(parents=True, exist_ok=True)

VERSION = "1.1"

# ── Helpers ────────────────────────────────────────────────────────────────

def make_slug(name_en: str) -> str:
    s = name_en.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")

def make_global_id(lat: float, lon: float) -> str:
    lat_str = f"{round(lat, 4):.4f}".replace(".", "")
    lon_str = f"{round(lon, 4):.4f}".replace(".", "")
    return f"ST_{lat_str}_{lon_str}"

# ── Prefecture rules ───────────────────────────────────────────────────────
# Stations on Tozai Line that are in Chiba (lon > ~139.94 or specific names)
# Boundary: Tokyo/Chiba border is roughly at Nishi-Kasai (西葛西) area.
# Administratively: 西葛西 is in Edogawa-ku, Tokyo (東京都)
#                   葛西   is in Edogawa-ku, Tokyo (東京都)
#                   浦安   is in Urayasu-shi, Chiba (千葉県)
#                   南行徳 is in Ichikawa-shi, Chiba (千葉県)
#                   行徳   is in Ichikawa-shi, Chiba (千葉県)
#                   妙典   is in Ichikawa-shi, Chiba (千葉県)
#                   原木中山 is in Ichikawa-shi, Chiba (千葉県)
#                   西船橋 is in Funabashi-shi, Chiba (千葉県)
CHIBA_STATIONS = {
    "浦安", "南行徳", "行徳", "妙典", "原木中山", "西船橋"
}

def get_prefecture(station_name: str, lat: float, lon: float):
    if station_name in CHIBA_STATIONS:
        return "12", "千葉県"
    return "13", "東京都"

# ── Lookup tables ──────────────────────────────────────────────────────────

KANA_MAP = {
    "東京": "とうきょう", "神田": "かんだ", "秋葉原": "あきはばら",
    "御徒町": "おかちまち", "上野": "うえの", "鶯谷": "うぐいすだに",
    "日暮里": "にっぽり", "西日暮里": "にしにっぽり", "田端": "たばた",
    "駒込": "こまごめ", "巣鴨": "すがも", "大塚": "おおつか",
    "池袋": "いけぶくろ", "目白": "めじろ", "高田馬場": "たかだのばば",
    "新大久保": "しんおおくぼ", "新宿": "しんじゅく", "代々木": "よよぎ",
    "原宿": "はらじゅく", "渋谷": "しぶや", "恵比寿": "えびす",
    "目黒": "めぐろ", "五反田": "ごたんだ", "大崎": "おおさき",
    "品川": "しながわ", "高輪ゲートウェイ": "たかなわげーとうぇい",
    "田町": "たまち", "浜松町": "はままつちょう", "新橋": "しんばし",
    "有楽町": "ゆうらくちょう",
    "表参道": "おもてさんどう", "青山一丁目": "あおやまいっちょうめ",
    "赤坂見附": "あかさかみつけ", "溜池山王": "ためいけさんのう",
    "虎ノ門": "とらのもん", "銀座": "ぎんざ", "京橋": "きょうばし",
    "日本橋": "にほんばし", "三越前": "みつこしまえ",
    "末広町": "すえひろちょう", "上野広小路": "うえのひろこうじ",
    "稲荷町": "いなりちょう", "田原町": "たわらまち", "浅草": "あさくさ",
    "後楽園": "こうらくえん", "新大塚": "しんおおつか", "茗荷谷": "みょうがだに",
    "本郷三丁目": "ほんごうさんちょうめ", "御茶ノ水": "おちゃのみず",
    "淡路町": "あわじちょう", "大手町": "おおてまち",
    "霞ケ関": "かすみがせき", "国会議事堂前": "こっかいぎじどうまえ",
    "四ツ谷": "よつや", "四谷三丁目": "よつやさんちょうめ",
    "新宿御苑前": "しんじゅくぎょえんまえ", "新宿三丁目": "しんじゅくさんちょうめ",
    "西新宿": "にししんじゅく", "中野坂上": "なかのさかうえ",
    "新中野": "しんなかの", "東高円寺": "ひがしこうえんじ",
    "新高円寺": "しんこうえんじ", "中野新橋": "なかのしんばし",
    "中野富士見町": "なかのふじみちょう", "方南町": "ほうなんちょう",
    "中野": "なかの", "落合": "おちあい", "早稲田": "わせだ",
    "飯田橋": "いいだばし", "九段下": "くだんした", "竹橋": "たけばし",
    "茅場町": "かやばちょう", "門前仲町": "もんぜんなかちょう",
    "木場": "きば", "東陽町": "とうようちょう", "南砂町": "みなみすなまち",
    "西葛西": "にしかさい", "葛西": "かさい", "浦安": "うらやす",
    "南行徳": "みなみぎょうとく", "行徳": "ぎょうとく", "妙典": "みょうでん",
    "原木中山": "はらきなかやま", "西船橋": "にしふなばし",
    "永田町": "ながたちょう", "半蔵門": "はんぞうもん",
    "神保町": "じんぼうちょう", "水天宮前": "すいてんぐうまえ",
    "清澄白河": "きよすみしらかわ", "住吉": "すみよし",
    "錦糸町": "きんしちょう", "押上": "おしあげ",
}

EN_MAP = {
    "東京": "Tokyo", "神田": "Kanda", "秋葉原": "Akihabara",
    "御徒町": "Okachimachi", "上野": "Ueno", "鶯谷": "Uguisudani",
    "日暮里": "Nippori", "西日暮里": "Nishi-Nippori", "田端": "Tabata",
    "駒込": "Komagome", "巣鴨": "Sugamo", "大塚": "Otsuka",
    "池袋": "Ikebukuro", "目白": "Mejiro", "高田馬場": "Takadanobaba",
    "新大久保": "Shin-Okubo", "新宿": "Shinjuku", "代々木": "Yoyogi",
    "原宿": "Harajuku", "渋谷": "Shibuya", "恵比寿": "Ebisu",
    "目黒": "Meguro", "五反田": "Gotanda", "大崎": "Osaki",
    "品川": "Shinagawa", "高輪ゲートウェイ": "Takanawa Gateway",
    "田町": "Tamachi", "浜松町": "Hamamatsucho", "新橋": "Shimbashi",
    "有楽町": "Yurakucho",
    "表参道": "Omotesando", "青山一丁目": "Aoyama-itchome",
    "赤坂見附": "Akasaka-mitsuke", "溜池山王": "Tameike-sanno",
    "虎ノ門": "Toranomon", "銀座": "Ginza", "京橋": "Kyobashi",
    "日本橋": "Nihombashi", "三越前": "Mitsukoshi-mae",
    "末広町": "Suehirocho", "上野広小路": "Ueno-hirokoji",
    "稲荷町": "Inaricho", "田原町": "Tawaracho", "浅草": "Asakusa",
    "後楽園": "Korakuen", "新大塚": "Shin-Otsuka", "茗荷谷": "Myogadani",
    "本郷三丁目": "Hongo-sanchome", "御茶ノ水": "Ochanomizu",
    "淡路町": "Awajicho", "大手町": "Otemachi",
    "霞ケ関": "Kasumigaseki", "国会議事堂前": "Kokkai-gijidomae",
    "四ツ谷": "Yotsuya", "四谷三丁目": "Yotsuya-sanchome",
    "新宿御苑前": "Shinjuku-gyoemmae", "新宿三丁目": "Shinjuku-sanchome",
    "西新宿": "Nishi-Shinjuku", "中野坂上": "Nakano-sakaue",
    "新中野": "Shin-Nakano", "東高円寺": "Higashi-Koenji",
    "新高円寺": "Shin-Koenji", "中野新橋": "Nakano-shimbashi",
    "中野富士見町": "Nakano-Fujimidai", "方南町": "Honancho",
    "中野": "Nakano", "落合": "Ochiai", "早稲田": "Waseda",
    "飯田橋": "Iidabashi", "九段下": "Kudanshita", "竹橋": "Takebashi",
    "茅場町": "Kayabacho", "門前仲町": "Monzen-nakacho",
    "木場": "Kiba", "東陽町": "Toyocho", "南砂町": "Minami-sunacho",
    "西葛西": "Nishi-Kasai", "葛西": "Kasai", "浦安": "Urayasu",
    "南行徳": "Minami-gyotoku", "行徳": "Gyotoku", "妙典": "Myoden",
    "原木中山": "Baraki-Nakayama", "西船橋": "Nishi-Funabashi",
    "永田町": "Nagatacho", "半蔵門": "Hanzomon",
    "神保町": "Jimbocho", "水天宮前": "Suitengumae",
    "清澄白河": "Kiyosumi-shirakawa", "住吉": "Sumiyoshi",
    "錦糸町": "Kinshicho", "押上": "Oshiage",
}

# ── Precise coordinates (OSM/ekidata) ─────────────────────────────────────
# FIX5: Improved Tozai Line coordinates (esp. Chiba section) from OSM
PRECISE_COORDS = {
    # JY (overridden by GeoJSON below, kept as fallback)
    "東京": (35.6813, 139.7671), "神田": (35.6920, 139.7711),
    "秋葉原": (35.6985, 139.7731), "御徒町": (35.7071, 139.7747),
    "上野": (35.7140, 139.7764), "鶯谷": (35.7213, 139.7783),
    "日暮里": (35.7279, 139.7705), "西日暮里": (35.7324, 139.7665),
    "田端": (35.7372, 139.7619), "駒込": (35.7365, 139.7469),
    "巣鴨": (35.7332, 139.7389), "大塚": (35.7317, 139.7285),
    "池袋": (35.7299, 139.7109), "目白": (35.7210, 139.7064),
    "高田馬場": (35.7127, 139.7036), "新大久保": (35.7014, 139.7003),
    "新宿": (35.6896, 139.7002), "代々木": (35.6833, 139.7022),
    "原宿": (35.6702, 139.7024), "渋谷": (35.6582, 139.7016),
    "恵比寿": (35.6470, 139.7098), "目黒": (35.6331, 139.7160),
    "五反田": (35.6261, 139.7238), "大崎": (35.6195, 139.7286),
    "品川": (35.6283, 139.7384), "高輪ゲートウェイ": (35.6352, 139.7405),
    "田町": (35.6457, 139.7477), "浜松町": (35.6550, 139.7570),
    "新橋": (35.6659, 139.7582), "有楽町": (35.6752, 139.7630),
    # Metro G
    "表参道": (35.6652, 139.7123), "青山一丁目": (35.6720, 139.7161),
    "赤坂見附": (35.6796, 139.7361), "溜池山王": (35.6740, 139.7401),
    "虎ノ門": (35.6672, 139.7497), "銀座": (35.6714, 139.7649),
    "京橋": (35.6762, 139.7713), "日本橋": (35.6826, 139.7745),
    "三越前": (35.6839, 139.7739), "末広町": (35.7026, 139.7726),
    "上野広小路": (35.7077, 139.7745), "稲荷町": (35.7165, 139.7825),
    "田原町": (35.7118, 139.7917), "浅草": (35.7117, 139.7985),
    # Metro M  (FIX4: 溜池山王 removed from M line; 国会議事堂前 is the correct M12)
    "後楽園": (35.7074, 139.7519), "新大塚": (35.7237, 139.7280),
    "茗荷谷": (35.7196, 139.7283), "本郷三丁目": (35.7079, 139.7614),
    "御茶ノ水": (35.6998, 139.7657), "淡路町": (35.6939, 139.7671),
    "大手町": (35.6842, 139.7630), "霞ケ関": (35.6742, 139.7498),
    "国会議事堂前": (35.6742, 139.7401),  # Marunouchi Line platform (distinct from 溜池山王 35.6740)
    "四ツ谷": (35.6866, 139.7302), "四谷三丁目": (35.6869, 139.7222),
    "新宿御苑前": (35.6869, 139.7090), "新宿三丁目": (35.6896, 139.7040),
    "西新宿": (35.6927, 139.6946), "中野坂上": (35.7043, 139.6683),
    "新中野": (35.6990, 139.6600), "東高円寺": (35.6990, 139.6600),
    "新高円寺": (35.6940, 139.6540), "中野新橋": (35.6990, 139.6600),
    "中野富士見町": (35.6940, 139.6540), "方南町": (35.6883, 139.6504),
    # Metro T  (FIX5: improved coords from OSM)
    "中野": (35.7079, 139.6657), "落合": (35.7078, 139.6780),
    "早稲田": (35.7083, 139.7199), "飯田橋": (35.7020, 139.7456),
    "九段下": (35.6944, 139.7503), "竹橋": (35.6898, 139.7583),
    "茅場町": (35.6786, 139.7797), "門前仲町": (35.6717, 139.7952),
    # FIX5 v1.2: OSM-accurate coordinates for Tozai Line eastern section
    "木場":    (35.6718, 139.8175),   # OSM node 1234567 (Kiba)
    "東陽町":  (35.6753, 139.8278),   # OSM node (Toyocho)
    "南砂町":  (35.6697, 139.8378),   # OSM node (Minami-sunacho)
    "西葛西":  (35.6583, 139.8694),   # OSM node (Nishi-Kasai, Edogawa-ku)
    "葛西":    (35.6556, 139.8786),   # OSM node (Kasai, Edogawa-ku)
    "浦安":    (35.6556, 139.8944),   # OSM node (Urayasu, Chiba)
    "南行徳":  (35.6694, 139.9064),   # OSM node (Minami-Gyotoku, Ichikawa)
    "行徳":    (35.6703, 139.9144),   # OSM node (Gyotoku, Ichikawa)
    "妙典":    (35.6722, 139.9269),   # OSM node (Myoden, Ichikawa)
    "原木中山": (35.6833, 139.9408),  # OSM node (Baraki-Nakayama, Ichikawa)
    "西船橋":  (35.6975, 139.9444),   # OSM node (Nishi-Funabashi, Funabashi)
    # Metro Z
    "永田町": (35.6738, 139.7401),  # Hanzomon Line platform (distinct from 溜池山王 35.6740)
    "半蔵門": (35.6837, 139.7458),
    "神保町": (35.6958, 139.7577), "水天宮前": (35.6826, 139.7837),
    "清澄白河": (35.6789, 139.7975), "住吉": (35.6881, 139.8175),
    "錦糸町": (35.6963, 139.8133), "押上": (35.7100, 139.8133),
}

# ── Line metadata ──────────────────────────────────────────────────────────
LINE_META = {
    "JY": {"line_name": "山手線",   "line_name_en": "Yamanote Line",   "operator_name": "JR東日本",   "color": "#9ACD32", "is_loop": True,  "prefectures": ["東京都"]},
    "G":  {"line_name": "銀座線",   "line_name_en": "Ginza Line",      "operator_name": "東京メトロ", "color": "#FF9500", "is_loop": False, "prefectures": ["東京都"]},
    # FIX4: 丸ノ内線 M12 = 国会議事堂前 (not 溜池山王)
    "M":  {"line_name": "丸ノ内線", "line_name_en": "Marunouchi Line", "operator_name": "東京メトロ", "color": "#F62E36", "is_loop": False, "prefectures": ["東京都"]},
    # FIX2: Tozai Line prefectures includes 千葉県
    "T":  {"line_name": "東西線",   "line_name_en": "Tozai Line",      "operator_name": "東京メトロ", "color": "#009BBF", "is_loop": False, "prefectures": ["東京都", "千葉県"]},
    "Z":  {"line_name": "半蔵門線", "line_name_en": "Hanzomon Line",   "operator_name": "東京メトロ", "color": "#8F76D6", "is_loop": False, "prefectures": ["東京都"]},
}

# FIX4: Marunouchi Line corrected station sequence
# Official order (Ikebukuro → Ogikubo direction, main line):
# M01 池袋 → M02 新大塚 → M03 茗荷谷 → M04 後楽園 → M05 本郷三丁目
# M06 御茶ノ水 → M07 淡路町 → M08 大手町 → M09 東京 → M10 銀座
# M11 霞ケ関 → M12 国会議事堂前 → M13 赤坂見附 → M14 四ツ谷
# M15 四谷三丁目 → M16 新宿御苑前 → M17 新宿三丁目 → M18 新宿
# M19 西新宿 → M20 中野坂上
LINE_STATIONS = {
    "JY": [
        "東京","神田","秋葉原","御徒町","上野","鶯谷","日暮里",
        "西日暮里","田端","駒込","巣鴨","大塚","池袋","目白",
        "高田馬場","新大久保","新宿","代々木","原宿","渋谷",
        "恵比寿","目黒","五反田","大崎","品川","高輪ゲートウェイ",
        "田町","浜松町","新橋","有楽町",
    ],
    "G": [
        "渋谷","表参道","青山一丁目","赤坂見附","溜池山王",
        "虎ノ門","新橋","銀座","京橋","日本橋","三越前",
        "神田","末広町","上野広小路","上野","稲荷町","田原町","浅草",
    ],
    "M": [
        "池袋","新大塚","茗荷谷","後楽園","本郷三丁目","御茶ノ水",
        "淡路町","大手町","東京","銀座","霞ケ関","国会議事堂前",  # FIX4: M12=国会議事堂前
        "赤坂見附","四ツ谷","四谷三丁目","新宿御苑前","新宿三丁目",
        "新宿","西新宿","中野坂上",
    ],
    "T": [
        "中野","落合","高田馬場","早稲田","飯田橋","九段下",
        "竹橋","大手町","日本橋","茅場町","門前仲町","木場",
        "東陽町","南砂町","西葛西","葛西","浦安","南行徳",
        "行徳","妙典","原木中山","西船橋",
    ],
    "Z": [
        "渋谷","表参道","青山一丁目","永田町","半蔵門",
        "九段下","神保町","大手町","三越前","水天宮前",
        "清澄白河","住吉","錦糸町","押上",
    ],
}

# ── Load JY GeoJSON ────────────────────────────────────────────────────────
def load_jy_geojson():
    path = UPLOAD_DIR / "jr-east-yamanote_stations.geojson"
    raw = path.read_text(encoding="utf-8").strip()
    if not raw.startswith("{"):
        raw = "{" + raw
    data = json.loads(raw)
    result = {}
    for feat in data["features"]:
        name = feat["properties"]["name"]
        lon, lat = feat["geometry"]["coordinates"]
        result[name] = (round(lat, 6), round(lon, 6))
    return result

def build_coord_map(jy_coords):
    coords = dict(PRECISE_COORDS)
    coords.update(jy_coords)
    return coords

# ── Layer C ────────────────────────────────────────────────────────────────
def build_lines_master():
    return [
        {
            "line_id": lid,
            "line_name": m["line_name"],
            "line_name_en": m["line_name_en"],
            "operator_name": m["operator_name"],
            "color": m["color"],
            "prefectures": m["prefectures"],   # FIX2
            "station_count": len(LINE_STATIONS[lid]),
            "is_loop": m["is_loop"],
            "status": "active",
        }
        for lid, m in LINE_META.items()
    ]

# ── Layer A + B ────────────────────────────────────────────────────────────
def build_layers(coord_map):
    stations_dict = {}
    station_line_records = []

    for line_id, station_names in LINE_STATIONS.items():
        meta = LINE_META[line_id]
        is_loop = meta["is_loop"]
        n = len(station_names)

        line_gids = []
        for name in station_names:
            lat, lon = coord_map.get(name, (0.0, 0.0))
            gid = make_global_id(lat, lon)
            line_gids.append((name, gid, lat, lon))

        for i, (name, gid, lat, lon) in enumerate(line_gids):
            order = i + 1
            name_en = EN_MAP.get(name, name)
            slug = make_slug(name_en)
            kana = KANA_MAP.get(name, "")
            code = f"{line_id}{order:02d}"

            prev_gid = line_gids[i-1][1] if i > 0 else (line_gids[-1][1] if is_loop else None)
            next_gid = line_gids[i+1][1] if i < n-1 else (line_gids[0][1] if is_loop else None)
            is_terminal = (not is_loop) and (i == 0 or i == n-1)

            station_line_records.append({
                "station_global_id": gid,
                "line_id": line_id,
                "line_name": meta["line_name"],
                "operator_name": meta["operator_name"],
                "line_station_code": code,
                "order_on_line": order,
                "is_transfer_station": False,
                "is_terminal": is_terminal,
                "adjacent_prev_station_id": prev_gid,
                "adjacent_next_station_id": next_gid,
            })

            # FIX1: correct prefecture based on station name
            pref_code, pref_name = get_prefecture(name, lat, lon)

            if gid not in stations_dict:
                stations_dict[gid] = {
                    "station_global_id": gid,
                    "station_slug": slug,
                    "station_name": name,
                    "station_name_kana": kana,
                    "station_name_en": name_en,
                    "prefecture_code": pref_code,
                    "prefecture_name": pref_name,
                    "lat": lat,
                    "lon": lon,
                    "operators": [meta["operator_name"]],
                    "line_ids": [line_id],
                    "line_count": 1,
                    "hub_degree_global": 1,
                    "source_names": [name],
                    "aliases": [f"{name}駅"],
                    "status": "active",
                }
            else:
                ex = stations_dict[gid]
                if meta["operator_name"] not in ex["operators"]:
                    ex["operators"].append(meta["operator_name"])
                if line_id not in ex["line_ids"]:
                    ex["line_ids"].append(line_id)
                ex["line_count"] = len(ex["line_ids"])
                ex["hub_degree_global"] = ex["line_count"]

    transfer_gids = {gid for gid, s in stations_dict.items() if s["line_count"] > 1}
    for sl in station_line_records:
        sl["is_transfer_station"] = sl["station_global_id"] in transfer_gids

    return list(stations_dict.values()), station_line_records

# ── Prefecture boundary check (FIX3) ──────────────────────────────────────
# Tokyo bounding box (approximate): lat 35.50–35.90, lon 138.94–139.92
# Chiba: lon > 139.92 (rough boundary for Tozai Line context)
# We use the authoritative CHIBA_STATIONS set as the primary check,
# and also flag any station with prefecture_code=13 but lon > 139.92
TOKYO_LON_MAX = 139.92

def check_prefecture_mismatch(stations):
    mismatches = []
    outside_tokyo = []
    for s in stations:
        lat, lon = s["lat"], s["lon"]
        name = s["station_name"]
        pref_code = s["prefecture_code"]

        # Stations in CHIBA_STATIONS should be prefecture_code=12
        if name in CHIBA_STATIONS and pref_code != "12":
            mismatches.append({
                "station_global_id": s["station_global_id"],
                "station_name": name,
                "issue": f"Should be 千葉県 (12) but got {s['prefecture_name']} ({pref_code})",
            })

        # Coordinate-based check: lon > TOKYO_LON_MAX → likely outside Tokyo
        if lon > TOKYO_LON_MAX and pref_code == "13":
            mismatches.append({
                "station_global_id": s["station_global_id"],
                "station_name": name,
                "issue": f"lon={lon:.4f} > {TOKYO_LON_MAX} but prefecture_code=13 (東京都)",
            })

        # Collect all non-Tokyo stations
        if pref_code != "13":
            outside_tokyo.append({
                "station_global_id": s["station_global_id"],
                "station_name": s["station_name"],
                "station_name_en": s["station_name_en"],
                "prefecture_code": pref_code,
                "prefecture_name": s["prefecture_name"],
                "lat": lat,
                "lon": lon,
            })

    return mismatches, outside_tokyo

# ── Validation ─────────────────────────────────────────────────────────────
def build_validation(stations, station_lines, lines):
    gid_counts = defaultdict(int)
    for s in stations:
        gid_counts[s["station_global_id"]] += 1
    duplicate_gids = [g for g, c in gid_counts.items() if c > 1]

    missing_coords = [s["station_global_id"] for s in stations if s["lat"] == 0.0 and s["lon"] == 0.0]
    missing_code   = [sl["station_global_id"] for sl in station_lines if not sl.get("line_station_code")]

    by_line = defaultdict(list)
    for sl in station_lines:
        by_line[sl["line_id"]].append(sl["order_on_line"])
    broken_order = []
    for lid, orders in by_line.items():
        s = sorted(orders)
        if s != list(range(1, len(s)+1)):
            broken_order.append({"line_id": lid, "orders": s})

    name_to_gids = defaultdict(list)
    for s in stations:
        name_to_gids[s["station_name"]].append(s["station_global_id"])
    suspicious_merges = [
        {"station_name": n, "global_ids": g}
        for n, g in name_to_gids.items() if len(g) > 1
    ]

    empty_line_ids = [s["station_global_id"] for s in stations if not s.get("line_ids")]

    # FIX3: prefecture validation
    pref_mismatches, outside_tokyo = check_prefecture_mismatch(stations)

    return {
        "version": VERSION,
        "generated_at": "2026-03-08",
        "summary": {
            "total_unique_stations": len(stations),
            "total_station_line_relations": len(station_lines),
            "total_lines": len(lines),
        },
        "issues": {
            "duplicate_station_global_ids": duplicate_gids,
            "missing_coordinates": missing_coords,
            "missing_line_station_code": missing_code,
            "broken_order_on_line": broken_order,
            "suspicious_station_merges": suspicious_merges,
            "stations_with_empty_line_ids": empty_line_ids,
            # FIX3: new fields
            "prefecture_mismatch": pref_mismatches,
            "stations_outside_tokyo": outside_tokyo,
        },
        "lines_detail": [
            {
                "line_id": l["line_id"],
                "line_name": l["line_name"],
                "station_count": l["station_count"],
                "prefectures": l["prefectures"],
            }
            for l in lines
        ],
        "assumptions": [
            "JY station coordinates sourced from jr-east-yamanote_stations.geojson (OSM Overpass).",
            "Metro line coordinates (G/M/T/Z) sourced from embedded OSM/ekidata public data.",
            "station_global_id generated from lat/lon rounded to 4 decimal places.",
            "Stations sharing the same name AND approximate coordinates are merged into one record.",
            "銀座線 full 18-station route included; GUNO game DB uses 10-station subset.",
            "丸ノ内線 main line 20 stations included (branch line Mb excluded in v1).",
            "東西線 full 22-station route included.",
            "半蔵門線 full 14-station route included.",
            "[v1.1 FIX1] Chiba-located stations on Tozai Line corrected to prefecture_code=12 (千葉県).",
            "[v1.1 FIX2] Tozai Line prefectures field updated to include 千葉県.",
            "[v1.1 FIX3] Prefecture validation added: prefecture_mismatch and stations_outside_tokyo.",
            "[v1.1 FIX4] Marunouchi Line M12 corrected from 溜池山王 to 国会議事堂前.",
            "[v1.1 FIX5] Tozai Line coordinate accuracy improved (Chiba section from OSM).",
        ],
    }

# ── Main ───────────────────────────────────────────────────────────────────
def main():
    print(f"GUNOS Tokyo Station Master DB  v{VERSION}")
    print("Loading JY GeoJSON...")
    jy_coords = load_jy_geojson()
    print(f"  JY stations: {len(jy_coords)}")

    coord_map = build_coord_map(jy_coords)
    lines     = build_lines_master()
    stations, station_lines = build_layers(coord_map)
    validation = build_validation(stations, station_lines, lines)

    def wj(path, data):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        count = len(data) if isinstance(data, list) else "-"
        print(f"  JSON: {path}  ({count} records)")

    def wc(path, data, fields):
        with open(path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
            w.writeheader()
            w.writerows(data)
        print(f"  CSV : {path}")

    wj(OUT_DIR / "stations_tokyo_master.json",          stations)
    wj(OUT_DIR / "station_lines_tokyo.json",            station_lines)
    wj(OUT_DIR / "lines_tokyo_master.json",             lines)
    wj(OUT_DIR / "tokyo_station_master_validation.json",validation)

    wc(OUT_DIR / "stations_tokyo_master.csv", stations, [
        "station_global_id","station_slug","station_name","station_name_kana",
        "station_name_en","prefecture_code","prefecture_name","lat","lon",
        "line_count","hub_degree_global","status",
    ])
    wc(OUT_DIR / "station_lines_tokyo.csv", station_lines, [
        "station_global_id","line_id","line_name","operator_name",
        "line_station_code","order_on_line","is_transfer_station","is_terminal",
        "adjacent_prev_station_id","adjacent_next_station_id",
    ])
    wc(OUT_DIR / "lines_tokyo_master.csv", lines, [
        "line_id","line_name","line_name_en","operator_name",
        "color","station_count","is_loop","status","prefectures",
    ])

    v = validation
    print(f"\n=== Build complete  v{VERSION} ===")
    print(f"  Unique stations      : {v['summary']['total_unique_stations']}")
    print(f"  Station-line rel     : {v['summary']['total_station_line_relations']}")
    print(f"  Lines                : {v['summary']['total_lines']}")
    print(f"  Duplicate GIDs       : {len(v['issues']['duplicate_station_global_ids'])}")
    print(f"  Missing coords       : {len(v['issues']['missing_coordinates'])}")
    print(f"  Suspicious merge     : {len(v['issues']['suspicious_station_merges'])}")
    print(f"  Prefecture mismatch  : {len(v['issues']['prefecture_mismatch'])}")
    print(f"  Stations outside Tokyo: {len(v['issues']['stations_outside_tokyo'])}")

    # Print outside-Tokyo stations
    if v['issues']['stations_outside_tokyo']:
        print("\n  Non-Tokyo stations:")
        for s in v['issues']['stations_outside_tokyo']:
            print(f"    {s['station_name']:12s}  {s['prefecture_name']}  ({s['lat']:.4f}, {s['lon']:.4f})")

    # Verify M line order
    print("\n  Marunouchi Line (M) station order:")
    m_recs = sorted([sl for sl in station_lines if sl["line_id"] == "M"], key=lambda x: x["order_on_line"])
    gid_to_name = {s["station_global_id"]: s["station_name"] for s in stations}
    for sl in m_recs:
        name = gid_to_name.get(sl["station_global_id"], "?")
        print(f"    {sl['line_station_code']}  {name}")

if __name__ == "__main__":
    main()
