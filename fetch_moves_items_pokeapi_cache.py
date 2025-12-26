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


def canonical_slug(name: str) -> str:
    """
    Convert Smogon-ish names like:
      - "BrightPowder" -> "bright-powder"
      - "BlackGlasses" -> "black-glasses"
      - "BubbleBeam"   -> "bubble-beam"
      - "Will-O-Wisp"  -> "will-o-wisp"
      - "DoubleSlap"   -> "double-slap"
    into a PokeAPI-friendly kebab-case slug.

    NOTE: This is not perfect for every edge case in Pokémon naming,
    but works for the known Battle Subway data patterns.
    """
    if not name:
        return ""

    s = name.strip()

    # If it has spaces/underscores already, normalize separators.
    s = s.replace("_", " ").strip()

    # Split camelCase/PascalCase boundaries if it looks like "BrightPowder"
    if " " not in s and "-" not in s:
        s = _CAMEL_SPLIT.sub("-", s)

    # Replace any remaining punctuation with hyphen
    s = _NON_ALNUM.sub("-", s)

    # collapse hyphens
    s = re.sub(r"-{2,}", "-", s).strip("-").lower()
    return s


def slug_candidates(raw: str) -> List[str]:
    """
    Return likely keys that might exist in cache / might work in PokeAPI.
    Prefer canonical kebab-case first.
    """
    c = canonical_slug(raw)
    if not c:
        return []

    candidates = [c]

    # Some older cache keys might have no hyphens
    nohy = c.replace("-", "")
    if nohy != c:
        candidates.append(nohy)

    # Some might have spaces normalized differently (rare)
    # (kept for completeness)
    return list(dict.fromkeys(candidates))


# ----------------------------
# HTTP
# ----------------------------

@dataclass
class FetchResult:
    ok: bool
    payload: Dict[str, Any]


def http_get_json(url: str, timeout: float = 15.0) -> FetchResult:
    try:
        r = requests.get(url, timeout=timeout, headers={"User-Agent": "battle-subway-helper/1.0"})
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


def migrate_cache_in_place(cache: Dict[str, Any]) -> None:
    """
    Ensure that if we already have a good entry under e.g. "bright-powder",
    we also have the same good data under the canonical key, and that
    canonical key is what enrichment will look for.

    We keep old keys as-is (non-breaking), but we "promote" good data
    to canonical keys.
    """
    # Move-like entries contain "type"
    # Item-like entries contain "sprite_url"
    keys = list(cache.keys())

    for k in keys:
        entry = cache.get(k)
        if not isinstance(entry, dict):
            continue

        # Item-like
        if "sprite_url" in entry:
            raw_name = entry.get("name") or k
            canon = canonical_slug(raw_name)
            if not canon:
                continue

            # If this key is a non-canonical alias, and canonical has no data or is not_found,
            # but alias has good sprite, copy to canonical.
            alias_is_bad = entry.get("not_found") is True or entry.get("sprite_url") in (None, "")
            if k != canon:
                canon_entry = cache.get(canon)
                if isinstance(canon_entry, dict):
                    canon_bad = canon_entry.get("not_found") is True or canon_entry.get("sprite_url") in (None, "")
                else:
                    canon_bad = True

                if not alias_is_bad and canon_bad:
                    cache[canon] = {
                        "name": canon,
                        "sprite_url": entry.get("sprite_url"),
                        "not_found": False,
                    }

        # Move-like
        if "type" in entry:
            raw_name = entry.get("name") or k
            canon = canonical_slug(raw_name)
            if not canon:
                continue

            alias_is_bad = entry.get("not_found") is True or entry.get("type") in (None, "")
            if k != canon:
                canon_entry = cache.get(canon)
                if isinstance(canon_entry, dict):
                    canon_bad = canon_entry.get("not_found") is True or canon_entry.get("type") in (None, "")
                else:
                    canon_bad = True

                if not alias_is_bad and canon_bad:
                    cache[canon] = {
                        "name": canon,
                        "type": entry.get("type"),
                        "not_found": False,
                    }


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
        default=0.0,
        help="Optional sleep (seconds) between requests (avoid rate limits)",
    )
    args = ap.parse_args()

    moves_raw, items_raw = extract_unique_moves_items(args.sets_dir)

    # Canonical slugs we actually want
    moves = {canonical_slug(m) for m in moves_raw if canonical_slug(m)}
    items = {canonical_slug(i) for i in items_raw if canonical_slug(i)}

    cache: Dict[str, Any] = {}
    if os.path.exists(args.cache):
        cache = load_json(args.cache)
        if not isinstance(cache, dict):
            cache = {}

    # Migrate/promote existing good data to canonical keys
    migrate_cache_in_place(cache)

    # Determine what we need to query
    def needs_fetch_move(slug: str) -> bool:
        e = cache.get(slug)
        if not isinstance(e, dict):
            return True
        if args.refetch_not_found and e.get("not_found") is True:
            return True
        if e.get("type") in (None, ""):
            # If it is missing type, refetch
            return True
        return False

    def needs_fetch_item(slug: str) -> bool:
        e = cache.get(slug)
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
        cache[slug] = {"name": slug, "type": t, "not_found": nf}
        if args.sleep:
            time.sleep(args.sleep)
        if idx % 50 == 0:
            print(f"  moves: {idx}/{len(moves_to_fetch)}")

    # Fetch items
    for idx, slug in enumerate(items_to_fetch, start=1):
        sprite, nf = fetch_item_sprite(slug)
        cache[slug] = {"name": slug, "sprite_url": sprite, "not_found": nf}
        if args.sleep:
            time.sleep(args.sleep)
        if idx % 50 == 0:
            print(f"  items: {idx}/{len(items_to_fetch)}")

    # Promote again after fetch (covers the case where old bad keys exist)
    migrate_cache_in_place(cache)

    save_json(args.cache, cache)
    print(f"[+] Guardado caché: {args.cache}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
