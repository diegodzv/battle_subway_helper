#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Añade a cada set:
- evs_numeric (dict stat->EV)
- ivs (dict stat->31)
- level=50
- stats_lv50 (calculadas Gen 5)
- sprite_url_pokeapi (desde PokéAPI sprites.front_default)
"""

from __future__ import annotations

import argparse
import json
import math
import logging
from pathlib import Path
from typing import Any, Dict, List

# Configuración de logging
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s: %(message)s"
)

logger = logging.getLogger(__name__)

STATS = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def list_set_files(dir_path: Path) -> List[Path]:
    return sorted(
        [p for p in dir_path.iterdir() if p.is_file() and p.suffix == ".json" and not p.name.startswith("_")]
    )


def parse_evs_text(evs_text: str) -> Dict[str, int]:
    """
    Smogon Subway:
    - 2 stats => 255/255
    - 3 stats => 170/170/170
    Entrada típica: "Atk/Spe" o "HP/Def/SpD"
    """
    parts = [p.strip() for p in (evs_text or "").split("/") if p.strip()]
    evs = {s: 0 for s in STATS}

    if not parts:
        return evs

    if len(parts) == 2:
        per = 255
    elif len(parts) == 3:
        per = 170
    else:
        per = 510 // len(parts)

    for p in parts:
        if p in evs:
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
    x = math.floor(((2 * base + iv + math.floor(ev / 4)) * level) / 100) + 5
    return math.floor(x * nature)


def calc_hp(base: int, iv: int, ev: int, level: int) -> int:
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

    sets_dir = Path(args.sets_dir)
    base_stats_path = Path(args.base_stats)
    out_dir = Path(args.out_dir)

    if not base_stats_path.exists():
        logger.error(f"Base stats file not found: {base_stats_path}")
        return 1

    base_db = read_json(base_stats_path)
    base_data = base_db.get("data", {})
    if not isinstance(base_data, dict) or not base_data:
        logger.error("base_stats.json no tiene data. ¿Ejecutaste fetch_base_stats_pokeapi.py?")
        return 1

    files = list_set_files(sets_dir)
    if not files:
        logger.warning(f"No encuentro sets en {sets_dir}")
        return 1

    if not args.write_in_place:
        out_dir.mkdir(parents=True, exist_ok=True)

    missing_species = 0
    updated = 0

    for p in files:
        s = read_json(p)
        if not isinstance(s, dict):
            continue

        sp = s.get("species")
        if not isinstance(sp, str) or sp not in base_data:
            missing_species += 1
            continue

        base_stats = base_data[sp]["base_stats"]
        evs_num = parse_evs_text(s.get("evs", ""))
        ivs = {k: args.iv for k in STATS}
        mods = nature_modifier(s.get("nature", ""))

        stats = {}
        stats["HP"] = calc_hp(base_stats["HP"], ivs["HP"], evs_num["HP"], args.level)
        for stat in ["Atk", "Def", "SpA", "SpD", "Spe"]:
            stats[stat] = calc_stat_non_hp(
                base=base_stats[stat],
                iv=ivs[stat],
                ev=evs_num[stat],
                level=args.level,
                nature=mods[stat],
            )

        sprites = base_data[sp].get("sprites") or {}
        sprite_url = sprites.get("front_default") if isinstance(sprites, dict) else None

        # Mutaciones
        s["level"] = args.level
        s["ivs"] = ivs
        s["evs_numeric"] = evs_num
        s["stats_lv50"] = stats
        s["sprite_url_pokeapi"] = sprite_url

        out_path = p if args.write_in_place else (out_dir / p.name)
        write_json(out_path, s)
        updated += 1

    logger.info(f"Process complete. sets={len(files)} updated={updated} missing_species={missing_species}")
    if missing_species:
        logger.warning("Faltan especies en base_stats.json: revisa mapeos en normalize_species_for_pokeapi().")
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
