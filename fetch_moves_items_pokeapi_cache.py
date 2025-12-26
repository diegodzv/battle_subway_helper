#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import json
import os
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

import requests

POKEAPI_BASE = "https://pokeapi.co/api/v2"

# ----------------------------
# Slug helpers (moves/items)
# ----------------------------

_CAMEL_SPLIT = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")
_NON_ALNUM = re.compile(r"[^a-zA-Z0-9]+")

# Irregular PokeAPI names (not fixable by kebab/camel normalization)
MOVE_ALIAS_MAP: Dict[str, str] = {
    "faint-attack": "feint-attack",
    "hi-jump-kick": "high-jump-kick",
    "softboiled": "soft-boiled",
    "smellingsalt": "smelling-salts",
    "smelling-salt": "smelling-salts",
}

ITEM_ALIAS_MAP: Dict[str, str] = {
    "king-s-rock": "kings-rock",
}


def canonical_slug(name: str) -> str:
    """
    Convert Smogon-ish names into a PokeAPI-friendly slug.

    Examples:
      - "BrightPowder" -> "bright-powder"
      - "BlackGlasses" -> "black-glasses"
      - "BubbleBeam"   -> "bubble-beam"
      - "Will-O-Wisp"  -> "will-o-wisp"
      - "DoubleSlap"   -> "double-slap"
    """
    if not name:
        return ""

    s = name.strip()
    s = s.replace("_", " ").strip()

    # Split camelCase/PascalCase boundaries if it looks like "BrightPowder"
    if " " not in s and "-" not in s:
        s = _CAMEL_SPLIT.sub("-", s)

    # Replace any remaining punctuation with hyphen
    s = _NON_ALNUM.sub("-", s)

    # Collapse hyphens
    s = re.sub(r"-{2,}", "-", s).strip("-").lower()
    return s


def canonical_move_slug(raw: str) -> str:
    base = canonical_slug(raw)
    return MOVE_ALIAS_MAP.get(base, base)


def canonical_item_slug(raw: str) -> str:
    base = canonical_slug(raw)
    return ITEM_ALIAS_MAP.get(base, base)


# ----------------------------
# HTTP
# ----------------------------

@dataclass
class FetchResult:
    ok: bool
    payload: Dict[str, Any]


def http_get_json(url: str, timeout: float = 15.0) -> FetchResult:
    try:
        r = requests.get(
            url,
            timeout=timeout,
            headers={"User-Agent": "battle-subway-helper/1.0"},
        )
        if r.status_code != 200:
            return FetchResult(False, {"status": r.status_code})
        return FetchResult(True, r.json())
    except Exception as e:
        return FetchResult(False, {"error": str(e)})


def fetch_move_type(move_slug: str) -> Tuple[Optional[str], bool]:
    """
    Returns (type_name, not_found)
    """
    url = f"{POKEAPI_BASE}/move/{move_slug}/"
    res = http_get_json(url)
    if not res.ok:
        return None, True
    t = res.payload.get("type", {}).get("name")
    return t, False


def fetch_item_sprite(item_slug: str) -> Tuple[Optional[str], bool]:
    """
    Returns (sprite_url, not_found)
    """
    url = f"{POKEAPI_BASE}/item/{item_slug}/"
    res = http_get_json(url)
    if not res.ok:
        return None, True
    sprite = res.payload.get("sprites", {}).get("default")
    return sprite, False


# ----------------------------
# Data IO
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
        f.write("\n")


def extract_unique_moves_items(sets_dir: str) -> Tuple[Set[str], Set[str]]:
    moves: Set[str] = set()
    items: Set[str] = set()

    for path in iter_set_files(sets_dir):
        d = load_json(path)
        for m in d.get("moves", []) or []:
            if isinstance(m, str) and m.strip():
                moves.add(m.strip())
        it = d.get("item")
        if isinstance(it, str) and it.strip():
            items.add(it.strip())

    return moves, items


# ----------------------------
# Cache schema helpers (nested)
# ----------------------------

def ensure_nested_cache(cache_obj: Any) -> Dict[str, Any]:
    """
    Ensure schema:
    {
      "meta": {...},
      "moves": { slug: {...} },
      "items": { slug: {...} }
    }
    """
    if isinstance(cache_obj, dict) and isinstance(cache_obj.get("moves"), dict) and isinstance(cache_obj.get("items"), dict):
        cache_obj.setdefault("meta", {})
        return cache_obj

    # If it's a flat dict (legacy), try to split by field presence
    nested = {"meta": {}, "moves": {}, "items": {}}
    if isinstance(cache_obj, dict):
        for k, v in cache_obj.items():
            if not isinstance(v, dict):
                continue
            if "type" in v:
                nested["moves"][k] = v
            elif "sprite_url" in v:
                nested["items"][k] = v
    return nested


def update_meta(cache: Dict[str, Any], rate_limit_ms: int) -> None:
    meta = cache.setdefault("meta", {})
    meta["source"] = "pokeapi"
    meta["moves_total"] = len(cache.get("moves", {}))
    meta["items_total"] = len(cache.get("items", {}))
    meta["rate_limit_ms"] = rate_limit_ms
    meta["updated_at_unix"] = int(time.time())


# ----------------------------
# Main
# ----------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sets_dir", required=True, help="Directory with per-set JSON files (data/subway_pokemon)")
    ap.add_argument("--cache", required=True, help="Path to cache JSON (data/moves_items_cache.json)")
    ap.add_argument(
        "--refetch_not_found",
        action="store_true",
        help="If set, re-fetch only entries previously marked not_found=true",
    )
    ap.add_argument(
        "--sleep",
        type=float,
        default=0.12,
        help="Sleep (seconds) between requests (avoid rate limits). Default 0.12 (~120ms).",
    )
    args = ap.parse_args()

    moves_raw, items_raw = extract_unique_moves_items(args.sets_dir)

    # Canonical slugs we actually want (with alias fixups)
    moves = {canonical_move_slug(m) for m in moves_raw if canonical_move_slug(m)}
    items = {canonical_item_slug(i) for i in items_raw if canonical_item_slug(i)}

    cache: Dict[str, Any] = {"meta": {}, "moves": {}, "items": {}}
    if os.path.exists(args.cache):
        loaded = load_json(args.cache)
        cache = ensure_nested_cache(loaded)

    moves_cache: Dict[str, Any] = cache.setdefault("moves", {})
    items_cache: Dict[str, Any] = cache.setdefault("items", {})

    def needs_fetch_move(slug: str) -> bool:
        e = moves_cache.get(slug)
        if not isinstance(e, dict):
            return True
        if args.refetch_not_found and e.get("not_found") is True:
            return True
        if e.get("type") in (None, ""):
            return True
        return False

    def needs_fetch_item(slug: str) -> bool:
        e = items_cache.get(slug)
        if not isinstance(e, dict):
            return True
        if args.refetch_not_found and e.get("not_found") is True:
            return True
        if e.get("sprite_url") in (None, ""):
            return True
        return False

    moves_to_fetch = sorted([m for m in moves if needs_fetch_move(m)])
    items_to_fetch = sorted([i for i in items if needs_fetch_item(i)])

    print(f"[+] Moves únicos necesarios: {len(moves)} (a consultar {len(moves_to_fetch)})")
    print(f"[+] Items únicos necesarios: {len(items)} (a consultar {len(items_to_fetch)})")

    # Fetch moves
    for idx, slug in enumerate(moves_to_fetch, start=1):
        t, nf = fetch_move_type(slug)
        moves_cache[slug] = {"name": slug, "type": t, "not_found": nf}
        if args.sleep:
            time.sleep(args.sleep)
        if idx % 50 == 0:
            print(f"  moves: {idx}/{len(moves_to_fetch)}")

    # Fetch items
    for idx, slug in enumerate(items_to_fetch, start=1):
        sprite, nf = fetch_item_sprite(slug)
        items_cache[slug] = {"name": slug, "sprite_url": sprite, "not_found": nf}
        if args.sleep:
            time.sleep(args.sleep)
        if idx % 50 == 0:
            print(f"  items: {idx}/{len(items_to_fetch)}")

    update_meta(cache, rate_limit_ms=int(args.sleep * 1000) if args.sleep else 0)
    save_json(args.cache, cache)
    print(f"[+] Guardado caché: {args.cache}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
