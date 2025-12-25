#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
import json
import os
import re
from typing import Any, Dict, List, Optional


def read_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: str, payload: Any) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def slugify_pokeapi(name: str) -> str:
    s = name.strip().lower()
    s = s.replace("’", "'")
    if s.startswith("hidden power"):
        return "hidden-power"
    s = s.replace("'", "")
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^a-z0-9\-]+", "", s)
    s = re.sub(r"\-+", "-", s).strip("-")
    return s


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sets_dir", default="data/subway_pokemon")
    ap.add_argument("--cache", default="data/moves_items_cache.json")
    ap.add_argument("--write_in_place", action="store_true")
    args = ap.parse_args()

    cache = read_json(args.cache)
    moves_cache: Dict[str, dict] = cache.get("moves", {})
    items_cache: Dict[str, dict] = cache.get("items", {})

    total = 0
    updated = 0

    for fn in os.listdir(args.sets_dir):
        if not fn.endswith(".json") or fn.startswith("_"):
            continue

        path = os.path.join(args.sets_dir, fn)
        data = read_json(path)
        total += 1

        changed = False

        # item icon
        item = data.get("item")
        if isinstance(item, str) and item.strip():
            item_slug = slugify_pokeapi(item)
            meta = items_cache.get(item_slug, {})
            sprite = meta.get("sprite_url")
            if data.get("item_sprite_url") != sprite:
                data["item_sprite_url"] = sprite
                changed = True

        # moves meta
        moves = data.get("moves")
        if isinstance(moves, list):
            mm: List[dict] = []
            for m in moves:
                if not isinstance(m, str) or not m.strip():
                    continue
                slug = slugify_pokeapi(m)
                meta = moves_cache.get(slug, {})
                mm.append(
                    {
                        "name": m,  # mantiene el nombre original (bonito)
                        "slug": slug,
                        "type": meta.get("type"),
                    }
                )
            if data.get("moves_meta") != mm:
                data["moves_meta"] = mm
                changed = True

        if changed:
            updated += 1
            if args.write_in_place:
                write_json(path, data)

    print(f"[+] OK enrich. total_sets={total} updated={updated}")
    if not args.write_in_place:
        print("[i] No se escribió nada (usa --write_in_place para guardar).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
