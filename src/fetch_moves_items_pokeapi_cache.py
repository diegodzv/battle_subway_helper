#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
import json
import re
import time
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, Optional, Set, Tuple

import requests

# Configuración de logging
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s: %(message)s"
)

logger = logging.getLogger(__name__)

POKEAPI_BASE = "https://pokeapi.co/api/v2"

_CAMEL_SPLIT = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")
_NON_ALNUM = re.compile(r"[^a-zA-Z0-9]+")

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
    if not name:
        return ""
    s = name.strip().replace("_", " ").strip()

    if " " not in s and "-" not in s:
        s = _CAMEL_SPLIT.sub("-", s)

    s = _NON_ALNUM.sub("-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-").lower()
    return s


def canonical_move_slug(raw: str) -> str:
    base = canonical_slug(raw)
    return MOVE_ALIAS_MAP.get(base, base)


def canonical_item_slug(raw: str) -> str:
    base = canonical_slug(raw)
    return ITEM_ALIAS_MAP.get(base, base)


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


def fetch_move_type(move_slug: str) -> Tuple[Optional[str], bool, Dict[str, Any]]:
    url = f"{POKEAPI_BASE}/move/{move_slug}/"
    res = http_get_json(url)
    if not res.ok:
        return None, True, res.payload
    t = res.payload.get("type", {}).get("name")
    return (t if isinstance(t, str) else None), False, {"status": 200}


def fetch_item_sprite(item_slug: str) -> Tuple[Optional[str], bool, Dict[str, Any]]:
    url = f"{POKEAPI_BASE}/item/{item_slug}/"
    res = http_get_json(url)
    if not res.ok:
        return None, True, res.payload
    sprite = res.payload.get("sprites", {}).get("default")
    return (sprite if isinstance(sprite, str) else None), False, {"status": 200}


def iter_set_files(sets_dir: Path) -> Iterable[Path]:
    for p in sets_dir.iterdir():
        if not p.is_file():
            continue
        if p.suffix != ".json":
            continue
        if p.name.startswith("_"):
            continue
        yield p


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def extract_unique_moves_items(sets_dir: Path) -> Tuple[Set[str], Set[str]]:
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


def ensure_nested_cache(cache_obj: Any) -> Dict[str, Any]:
    if (
        isinstance(cache_obj, dict)
        and isinstance(cache_obj.get("moves"), dict)
        and isinstance(cache_obj.get("items"), dict)
    ):
        cache_obj.setdefault("meta", {})
        return cache_obj

    nested: Dict[str, Any] = {"meta": {}, "moves": {}, "items": {}}
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sets_dir", required=True, help="Directory with per-set JSON files")
    ap.add_argument("--cache", required=True, help="Path to cache JSON")
    ap.add_argument(
        "--refetch_not_found",
        action="store_true",
        help="Re-fetch entries previously marked not_found=true",
    )
    ap.add_argument(
        "--sleep",
        type=float,
        default=0.12,
        help="Sleep between requests. Default 0.12.",
    )
    args = ap.parse_args()

    sets_dir = Path(args.sets_dir)
    cache_path = Path(args.cache)

    if not sets_dir.exists():
        logger.error(f"Directory not found: {sets_dir}")
        return 1

    moves_raw, items_raw = extract_unique_moves_items(sets_dir)

    moves = {canonical_move_slug(m) for m in moves_raw if canonical_move_slug(m)}
    items = {canonical_item_slug(i) for i in items_raw if canonical_item_slug(i)}

    cache: Dict[str, Any] = {"meta": {}, "moves": {}, "items": {}}
    if cache_path.exists():
        cache = ensure_nested_cache(load_json(cache_path))

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

    logger.info(f"Moves: {len(moves)} unique, {len(moves_to_fetch)} to fetch.")
    logger.info(f"Items: {len(items)} unique, {len(items_to_fetch)} to fetch.")

    for idx, slug in enumerate(moves_to_fetch, start=1):
        try:
            t, nf, meta_info = fetch_move_type(slug)
            moves_cache[slug] = {"name": slug, "type": t, "not_found": nf, **meta_info}
            if idx % 50 == 0:
                logger.info(f"  moves progress: {idx}/{len(moves_to_fetch)}")
        except Exception as e:
            logger.error(f"Failed to fetch move {slug}: {e}")
        
        if args.sleep:
            time.sleep(args.sleep)

    for idx, slug in enumerate(items_to_fetch, start=1):
        try:
            sprite, nf, meta_info = fetch_item_sprite(slug)
            items_cache[slug] = {"name": slug, "sprite_url": sprite, "not_found": nf, **meta_info}
            if idx % 50 == 0:
                logger.info(f"  items progress: {idx}/{len(items_to_fetch)}")
        except Exception as e:
            logger.error(f"Failed to fetch item {slug}: {e}")

        if args.sleep:
            time.sleep(args.sleep)

    update_meta(cache, rate_limit_ms=int(args.sleep * 1000) if args.sleep else 0)
    save_json(cache_path, cache)
    logger.info(f"Cache saved to: {cache_path}")
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
