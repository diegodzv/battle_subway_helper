#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
import json
import re
import logging
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

# Configuración de logging
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s: %(message)s"
)

logger = logging.getLogger(__name__)

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

MOVE_SLUG_ALIASES: Dict[str, str] = {
    "faint-attack": "feint-attack",
    "hi-jump-kick": "high-jump-kick",
    "softboiled": "soft-boiled",
    "soft-boiled": "soft-boiled",
    "smelling-salt": "smelling-salts",
    "smellingsalt": "smelling-salts",
    "smelling-salts": "smelling-salts",
}

ITEM_SLUG_ALIASES: Dict[str, str] = {
    # reserved for future weirdness
}


# ----------------------------
# IO helpers
# ----------------------------

def iter_set_files(sets_dir: Path) -> Iterable[Path]:
    for p in sets_dir.iterdir():
        if p.is_file() and p.suffix == ".json" and not p.name.startswith("_"):
            yield p


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# ----------------------------
# Cache access
# ----------------------------

def load_cache(cache_path: Path) -> Tuple[Dict[str, Any], Dict[str, Any]]:
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

    sets_dir = Path(args.sets_dir)
    cache_path = Path(args.cache)

    moves_cache, items_cache = load_cache(cache_path)

    total = 0
    updated = 0

    for path in iter_set_files(sets_dir):
        total += 1
        d = load_json(path)
        if not isinstance(d, dict):
            continue

        changed = enrich_set(d, moves_cache, items_cache)
        if changed:
            updated += 1
            if args.write_in_place:
                save_json(path, d)

    logger.info(f"enrich. total_sets={total} updated={updated}")
    if not args.write_in_place:
        logger.info("No se escribió nada (usa --write_in_place para guardar).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
