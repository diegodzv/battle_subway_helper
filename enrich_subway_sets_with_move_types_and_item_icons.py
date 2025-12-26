#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import json
import os
import re
from typing import Any, Dict, List, Optional

# Must match the slug logic in fetch script
_CAMEL_SPLIT = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")
_NON_ALNUM = re.compile(r"[^a-zA-Z0-9]+")


def canonical_slug(name: str) -> str:
    if not name:
        return ""
    s = name.strip().replace("_", " ").strip()
    if " " not in s and "-" not in s:
        s = _CAMEL_SPLIT.sub("-", s)
    s = _NON_ALNUM.sub("-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-").lower()
    return s


def slug_candidates(raw: str) -> List[str]:
    c = canonical_slug(raw)
    if not c:
        return []
    out = [c]
    nohy = c.replace("-", "")
    if nohy != c:
        out.append(nohy)
    # also try raw-lower stripped (legacy cache keys)
    rawish = "".join(ch for ch in raw.strip().lower() if ch.isalnum() or ch == "-")
    if rawish and rawish not in out:
        out.append(rawish)
    # unique preserving order
    return list(dict.fromkeys(out))


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, obj: Any) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def iter_set_files(sets_dir: str):
    for fn in os.listdir(sets_dir):
        if not fn.endswith(".json"):
            continue
        if fn.startswith("_"):
            continue
        yield os.path.join(sets_dir, fn)


def pick_move_type(cache: Dict[str, Any], move_name: str) -> Optional[str]:
    # Prefer canonical kebab-case first, then fallbacks
    for key in slug_candidates(move_name):
        e = cache.get(key)
        if isinstance(e, dict) and "type" in e and not e.get("not_found") and e.get("type"):
            return e.get("type")
    return None


def pick_item_sprite(cache: Dict[str, Any], item_name: str) -> Optional[str]:
    # Prefer canonical kebab-case first, then fallbacks
    for key in slug_candidates(item_name):
        e = cache.get(key)
        if isinstance(e, dict) and "sprite_url" in e and not e.get("not_found") and e.get("sprite_url"):
            return e.get("sprite_url")
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sets_dir", default="data/subway_pokemon", help="Directory with per-set JSON files")
    ap.add_argument("--cache", default="data/moves_items_cache.json", help="Cache JSON file")
    ap.add_argument("--write_in_place", action="store_true", help="Overwrite set json files in place")
    args = ap.parse_args()

    cache = load_json(args.cache)
    if not isinstance(cache, dict):
        raise RuntimeError("Cache JSON must be a dict")

    updated = 0
    total = 0

    for path in iter_set_files(args.sets_dir):
        total += 1
        d = load_json(path)
        changed = False

        # Moves meta
        moves = d.get("moves") or []
        moves_meta = []
        for m in moves:
            if not isinstance(m, str):
                continue
            t = pick_move_type(cache, m)
            moves_meta.append({"name": m, "type": t})
        if moves_meta:
            # Only update if different (avoid churn)
            if d.get("moves_meta") != moves_meta:
                d["moves_meta"] = moves_meta
                changed = True

        # Item icon
        item = d.get("item")
        if isinstance(item, str) and item.strip():
            sprite = pick_item_sprite(cache, item)
            if d.get("item_sprite_url") != sprite:
                d["item_sprite_url"] = sprite
                changed = True

            # Optional: store canonical item slug for debugging/future
            item_slug = canonical_slug(item)
            if item_slug and d.get("item_slug") != item_slug:
                d["item_slug"] = item_slug
                changed = True

        if changed:
            updated += 1
            if args.write_in_place:
                save_json(path, d)

    print(f"[+] OK enrich. total_sets={total} updated={updated}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
