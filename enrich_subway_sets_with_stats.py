#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Añade a cada set:
- evs_numeric (dict stat->EV)
- ivs (dict stat->31)
- level=50
- stats_lv50 (calculadas Gen 5)
- (opcional) sprite_url (desde PokéAPI sprites.front_default)
"""

from __future__ import annotations

import argparse
import json
import math
import os
from typing import Dict, List


STATS = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"]


def read_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: str, payload: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def list_set_files(dir_path: str) -> List[str]:
    return [
        os.path.join(dir_path, fn)
        for fn in os.listdir(dir_path)
        if fn.endswith(".json") and not fn.startswith("_")
    ]


def parse_evs_text(evs_text: str) -> Dict[str, int]:
    """
    Smogon Subway:
    - 2 stats => 255/255
    - 3 stats => 170/170/170
    Entrada típica: "Atk/Spe" o "HP/Def/SpD"
    """
    parts = [p.strip() for p in evs_text.split("/") if p.strip()]
    if not parts:
        return {s: 0 for s in STATS}

    if len(parts) == 2:
        per = 255
    elif len(parts) == 3:
        per = 170
    else:
        # No debería pasar, pero por si acaso: repartir 510 aprox
        per = 510 // len(parts)

    evs = {s: 0 for s in STATS}
    for p in parts:
        if p not in evs:
            # por si viniera algo raro
            continue
        evs[p] = per
    return evs


def nature_modifier(nature: str) -> Dict[str, float]:
    """
    Devuelve multiplicadores por stat.
    """
    up_down = {
        "Adamant": ("Atk", "SpA"),
        "Bold": ("Def", "Atk"),
        "Brave": ("Atk", "Spe"),
        "Calm": ("SpD", "Atk"),
        "Careful": ("SpD", "SpA"),
        "Gentle": ("SpD", "Def"),
        "Hasty": ("Spe", "Def"),
        "Impish": ("Def", "SpA"),
        "Jolly": ("Spe", "SpA"),
        "Lax": ("Def", "SpD"),
        "Lonely": ("Atk", "Def"),
        "Mild": ("SpA", "Def"),
        "Modest": ("SpA", "Atk"),
        "Naive": ("Spe", "SpD"),
        "Naughty": ("Atk", "SpD"),
        "Quiet": ("SpA", "Spe"),
        "Rash": ("SpA", "SpD"),
        "Relaxed": ("Def", "Spe"),
        "Sassy": ("SpD", "Spe"),
        "Timid": ("Spe", "Atk"),
    }

    mods = {s: 1.0 for s in STATS}
    if nature in up_down:
        up, down = up_down[nature]
        mods[up] = 1.1
        mods[down] = 0.9
    return mods


def calc_stat_non_hp(base: int, iv: int, ev: int, level: int, nature: float) -> int:
    # floor(((2*base + iv + floor(ev/4)) * level)/100) + 5 then nature and floor
    x = math.floor(((2 * base + iv + math.floor(ev / 4)) * level) / 100) + 5
    return math.floor(x * nature)


def calc_hp(base: int, iv: int, ev: int, level: int) -> int:
    # floor(((2*base + iv + floor(ev/4)) * level)/100) + level + 10
    return math.floor(((2 * base + iv + math.floor(ev / 4)) * level) / 100) + level + 10


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sets_dir", default="data/subway_pokemon")
    parser.add_argument("--base_stats", default="data/base_stats.json")
    parser.add_argument("--level", type=int, default=50)
    parser.add_argument("--iv", type=int, default=31)
    parser.add_argument("--write_in_place", action="store_true", help="Sobrescribe cada JSON del set")
    parser.add_argument("--out_dir", default="data/subway_pokemon_enriched", help="Si no write_in_place, escribe aquí")
    args = parser.parse_args()

    base_db = read_json(args.base_stats)
    base_data = base_db.get("data", {})
    if not base_data:
        print("[!] base_stats.json no tiene data. ¿Ejecutaste el script 1?")
        return 1

    files = list_set_files(args.sets_dir)
    if not files:
        print(f"[!] No encuentro sets en {args.sets_dir}")
        return 1

    if not args.write_in_place:
        os.makedirs(args.out_dir, exist_ok=True)

    missing_species = 0

    for p in files:
        s = read_json(p)
        sp = s["species"]
        if sp not in base_data:
            missing_species += 1
            continue

        base_stats = base_data[sp]["base_stats"]
        evs_num = parse_evs_text(s.get("evs", ""))
        ivs = {k: args.iv for k in STATS}
        mods = nature_modifier(s.get("nature", ""))

        stats = {}
        # HP
        stats["HP"] = calc_hp(base_stats["HP"], ivs["HP"], evs_num["HP"], args.level)
        # others
        for stat in ["Atk", "Def", "SpA", "SpD", "Spe"]:
            stats[stat] = calc_stat_non_hp(
                base=base_stats[stat],
                iv=ivs[stat],
                ev=evs_num[stat],
                level=args.level,
                nature=mods[stat],
            )

        # opcional: sprite estable desde PokéAPI
        sprite_url = None
        sprites = base_data[sp].get("sprites") or {}
        sprite_url = sprites.get("front_default") or None

        s["level"] = args.level
        s["ivs"] = ivs
        s["evs_numeric"] = evs_num
        s["stats_lv50"] = stats
        s["sprite_url_pokeapi"] = sprite_url

        out_path = p if args.write_in_place else os.path.join(args.out_dir, os.path.basename(p))
        write_json(out_path, s)

    print(f"[+] OK. sets={len(files)} missing_species={missing_species}")
    if missing_species:
        print("[!] Te faltan species en base_stats.json: revisa mapeos raros del script 1.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
