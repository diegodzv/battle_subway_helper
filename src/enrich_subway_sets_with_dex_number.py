#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Dict, Optional

DEX_FROM_SPRITE_RE = re.compile(r"/pokemon/(\d+)\.(?:png|gif)$", re.IGNORECASE)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def extract_dex_from_sprite_url(url: str) -> Optional[int]:
    m = DEX_FROM_SPRITE_RE.search(url.strip())
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def build_species_to_dex(base_stats: dict) -> Dict[str, int]:
    """
    Estructura real:
      {
        "meta": {...},
        "errors": [...],
        "data": {
          "Abomasnow": {
             "sprites": { "front_default": "https://.../pokemon/460.png", ... },
             ...
          },
          ...
        }
      }
    """
    if not isinstance(base_stats, dict) or "data" not in base_stats or not isinstance(base_stats["data"], dict):
        raise RuntimeError("base_stats.json no tiene la clave 'data' como dict.")

    mapping: Dict[str, int] = {}
    data = base_stats["data"]

    for species, entry in data.items():
        if not isinstance(entry, dict):
            continue
        sprites = entry.get("sprites")
        if not isinstance(sprites, dict):
            continue

        front_default = sprites.get("front_default")
        dex: Optional[int] = None

        if isinstance(front_default, str) and front_default.strip():
            dex = extract_dex_from_sprite_url(front_default)

        if dex is None:
            for v in sprites.values():
                if isinstance(v, str) and v.strip():
                    dex = extract_dex_from_sprite_url(v)
                    if dex is not None:
                        break

        if dex is not None:
            mapping[species] = dex

    if not mapping:
        raise RuntimeError("No pude construir mapping species->dex_number desde base_stats.json (data.*.sprites.*).")

    return mapping


def iter_set_files(sets_dir: Path):
    for p in sets_dir.iterdir():
        if p.is_file() and p.suffix == ".json" and not p.name.startswith("_"):
            yield p


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sets_dir", default="data/subway_pokemon")
    ap.add_argument("--base_stats", default="data/base_stats.json")
    ap.add_argument("--write_in_place", action="store_true")
    args = ap.parse_args()

    sets_dir = Path(args.sets_dir)
    base_stats_path = Path(args.base_stats)

    base_stats = read_json(base_stats_path)
    species_to_dex = build_species_to_dex(base_stats)

    updated = 0
    missing = 0
    total = 0

    for path in iter_set_files(sets_dir):
        data = read_json(path)
        total += 1

        species = data.get("species")
        if not isinstance(species, str):
            missing += 1
            continue

        dex = species_to_dex.get(species)
        if not isinstance(dex, int):
            missing += 1
            continue

        if data.get("dex_number") != dex:
            data["dex_number"] = dex
            updated += 1
            if args.write_in_place:
                write_json(path, data)

    print(f"[+] OK dex_number. total_sets={total} updated={updated} missing_species={missing}")
    if not args.write_in_place:
        print("[i] No se escribió nada (usa --write_in_place para guardar).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
