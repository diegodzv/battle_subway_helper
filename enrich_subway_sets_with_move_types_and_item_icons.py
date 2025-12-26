#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import json
import os
import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

# ----------------------------
# Slug helpers (moves/items)
# ----------------------------

_CAMEL_SPLIT = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")
_NON_ALNUM = re.compile(r"[^a-zA-Z0-9]+")


def canonical_slug(name: str) -> str:
    """
    Convert Smogon-ish names into a PokeAPI-friendly kebab-case slug.
      - "BrightPowder" -> "bright-powder"
      - "Black Belt"   -> "black-belt"
      - "BubbleBeam"   -> "bubble-beam"
      - "Will-O-Wisp"  -> "will-o-wisp"
      - "Hi Jump Kick" -> "hi-jump-kick" (then alias-mapped to "high-jump-kick")
    """
    if not name:
        return ""
    s = name.strip().replace("_", " ").strip()

    # Split CamelCase if no spaces and no hyphens
    if " " not in s and "-" not in s:
        s = _CAMEL_SPLIT.sub("-", s)

    s = _NON_ALNUM.sub("-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-").lower()
    return s


def compact_slug(slug: str) -> str:
    return (slug or "").replace("-", "")


# ----------------------------
# Known PokeAPI slug aliases
# ----------------------------
# These are the classic "Smogon-ish" vs PokeAPI differences.
MOVE_SLUG_ALIASES: Dict[str, str] = {
    # Gen 2 move is "feint-attack" in PokeAPI, not "faint-attack"
    "faint-attack": "feint-attack",

    # PokeAPI uses "high-jump-kick"
    "hi-jump-kick": "high-jump-kick",

    # PokeAPI uses "soft-boiled"
    "softboiled": "soft-boiled",
    "soft-boiled": "soft-boiled",

    # PokeAPI uses plural "smelling-salts"
    "smelling-salt": "smelling-salts",
    "smellingsalt": "smelling-salts",
    "smelling-salts": "smelling-salts",
}

ITEM_SLUG_ALIASES: Dict[str, str] = {
    # (optional room for future weirdness)
}


# ----------------------------
# IO helpers
# ----------------------------

def iter_set_files(sets_dir: str) -> Iterable[str]:
    for fn in os.listdir(sets_dir):
        if not fn.endswith(".json"):
            continue
        if fn.startswith("_"):
            continue
        yield os.path.join(sets_dir, fn)


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, obj: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


# ----------------------------
# Cache access
# ----------------------------

def load_cache(cache_path: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Supports the current schema:
      { "meta": {...}, "moves": {...}, "items": {...} }
    """
    c = load_json(cache_path)
    if not isinstance(c, dict):
        return {}, {}

    moves = c.get("moves", {})
    items = c.get("items", {})

    if not isinstance(moves, dict):
        moves = {}
    if not isinstance(items, dict):
        items = {}

    return moves, items


def resolve_move_slug(raw_move_name: str, moves_cache: Dict[str, Any]) -> str:
    """
    1) canonical_slug
    2) alias mapping
    3) if still missing, try compact-match lookup against cache keys
    """
    base = canonical_slug(raw_move_name)
    if not base:
        return ""

    base = MOVE_SLUG_ALIASES.get(base, base)
    if base in moves_cache:
        return base

    # Compact fallback: match keys ignoring hyphens (useful for weird leftovers)
    target = compact_slug(base)
    if target:
        for k in moves_cache.keys():
            if compact_slug(k) == target:
                return k

    return base


def resolve_item_slug(raw_item_name: str, items_cache: Dict[str, Any]) -> str:
    base = canonical_slug(raw_item_name)
    if not base:
        return ""

    base = ITEM_SLUG_ALIASES.get(base, base)
    if base in items_cache:
        return base

    target = compact_slug(base)
    if target:
        for k in items_cache.keys():
            if compact_slug(k) == target:
                return k

    return base


def move_type_from_cache(slug: str, moves_cache: Dict[str, Any]) -> Optional[str]:
    e = moves_cache.get(slug)
    if not isinstance(e, dict):
        return None
    t = e.get("type")
    return t if isinstance(t, str) and t else None


def item_sprite_from_cache(slug: str, items_cache: Dict[str, Any]) -> Optional[str]:
    e = items_cache.get(slug)
    if not isinstance(e, dict):
        return None
    u = e.get("sprite_url")
    return u if isinstance(u, str) and u else None


# ----------------------------
# Main enrichment
# ----------------------------

def enrich_set(d: Dict[str, Any], moves_cache: Dict[str, Any], items_cache: Dict[str, Any]) -> bool:
    changed = False

    # --- Moves -> moves_meta ---
    moves = d.get("moves", []) or []
    if isinstance(moves, list):
        new_moves_meta: List[Dict[str, Any]] = []
        for m in moves:
            if not isinstance(m, str) or not m.strip():
                continue
            raw_name = m.strip()
            slug = resolve_move_slug(raw_name, moves_cache)
            t = move_type_from_cache(slug, moves_cache)
            new_moves_meta.append({"name": raw_name, "slug": slug, "type": t})

        if d.get("moves_meta") != new_moves_meta:
            d["moves_meta"] = new_moves_meta
            changed = True

    # --- Item -> item_slug + item_sprite_url ---
    item = d.get("item")
    if isinstance(item, str) and item.strip():
        raw_item = item.strip()
        item_slug = resolve_item_slug(raw_item, items_cache)
        sprite = item_sprite_from_cache(item_slug, items_cache)

        if d.get("item_slug") != item_slug:
            d["item_slug"] = item_slug
            changed = True
        if d.get("item_sprite_url") != sprite:
            d["item_sprite_url"] = sprite
            changed = True

    return changed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sets_dir", default="data/subway_pokemon", help="Directory with per-set JSON files")
    ap.add_argument("--cache", default="data/moves_items_cache.json", help="Path to moves/items cache JSON")
    ap.add_argument("--write_in_place", action="store_true", help="Write changes to the set files")
    args = ap.parse_args()

    moves_cache, items_cache = load_cache(args.cache)

    total = 0
    updated = 0

    for path in iter_set_files(args.sets_dir):
        total += 1
        d = load_json(path)
        if not isinstance(d, dict):
            continue

        changed = enrich_set(d, moves_cache, items_cache)
        if changed:
            updated += 1
            if args.write_in_place:
                save_json(path, d)

    print(f"[+] OK enrich. total_sets={total} updated={updated}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
