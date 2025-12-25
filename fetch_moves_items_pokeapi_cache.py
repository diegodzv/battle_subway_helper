#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
import json
import os
import re
import time
from typing import Any, Dict, Set, Tuple, Optional

import requests


POKEAPI_BASE = "https://pokeapi.co/api/v2"


def read_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: str, payload: Any) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def load_cache(path: str) -> dict:
    if not os.path.exists(path):
        return {"meta": {"source": "pokeapi"}, "moves": {}, "items": {}}
    data = read_json(path)
    data.setdefault("moves", {})
    data.setdefault("items", {})
    data.setdefault("meta", {"source": "pokeapi"})
    return data


def slugify_pokeapi(name: str) -> str:
    """
    Convierte nombres tipo:
      - "Will-O-Wisp" -> "will-o-wisp"
      - "King's Rock" -> "kings-rock"
      - "Frost Breath" -> "frost-breath"
    """
    s = name.strip().lower()
    s = s.replace("’", "'")
    # casos típicos
    if s.startswith("hidden power"):
        return "hidden-power"
    # quita apóstrofes
    s = s.replace("'", "")
    # espacios -> -
    s = re.sub(r"\s+", "-", s)
    # quita caracteres raros excepto -
    s = re.sub(r"[^a-z0-9\-]+", "", s)
    s = re.sub(r"\-+", "-", s).strip("-")
    return s


def collect_needed_from_sets(sets_dir: str) -> Tuple[Set[str], Set[str]]:
    moves: Set[str] = set()
    items: Set[str] = set()

    for fn in os.listdir(sets_dir):
        if not fn.endswith(".json") or fn.startswith("_"):
            continue
        path = os.path.join(sets_dir, fn)
        data = read_json(path)

        item = data.get("item")
        if isinstance(item, str) and item.strip():
            items.add(slugify_pokeapi(item))

        mv = data.get("moves")
        if isinstance(mv, list):
            for m in mv:
                if isinstance(m, str) and m.strip():
                    moves.add(slugify_pokeapi(m))

    return moves, items


def get_json_with_retries(url: str, session: requests.Session, retries: int = 3, sleep_s: float = 0.5) -> Optional[dict]:
    last_err = None
    for i in range(retries):
        try:
            r = session.get(url, timeout=20)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.json()
        except Exception as e:
            last_err = e
            time.sleep(sleep_s * (i + 1))
    print(f"[!] ERROR GET {url}: {last_err}")
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sets_dir", default="data/subway_pokemon")
    ap.add_argument("--cache", default="data/moves_items_cache.json")
    ap.add_argument("--rate_limit_ms", type=int, default=120, help="espera entre requests")
    args = ap.parse_args()

    cache = load_cache(args.cache)
    cached_moves: Dict[str, dict] = cache["moves"]
    cached_items: Dict[str, dict] = cache["items"]

    needed_moves, needed_items = collect_needed_from_sets(args.sets_dir)

    to_fetch_moves = sorted([m for m in needed_moves if m not in cached_moves])
    to_fetch_items = sorted([it for it in needed_items if it not in cached_items])

    print(f"[+] Moves únicos necesarios: {len(needed_moves)} (faltan {len(to_fetch_moves)})")
    print(f"[+] Items únicos necesarios: {len(needed_items)} (faltan {len(to_fetch_items)})")

    session = requests.Session()
    session.headers.update({"User-Agent": "MetroBatallaPokeAPI/1.0"})

    delay = max(0, args.rate_limit_ms) / 1000.0

    # Fetch moves
    for i, slug in enumerate(to_fetch_moves, 1):
        url = f"{POKEAPI_BASE}/move/{slug}/"
        data = get_json_with_retries(url, session)
        if data is None:
            cached_moves[slug] = {"name": slug, "type": None, "not_found": True}
        else:
            mtype = data.get("type", {}).get("name")
            cached_moves[slug] = {"name": slug, "type": mtype}
        if i % 50 == 0:
            print(f"  moves: {i}/{len(to_fetch_moves)}")
            write_json(args.cache, cache)
        time.sleep(delay)

    # Fetch items
    for i, slug in enumerate(to_fetch_items, 1):
        url = f"{POKEAPI_BASE}/item/{slug}/"
        data = get_json_with_retries(url, session)
        if data is None:
            cached_items[slug] = {"name": slug, "sprite_url": None, "not_found": True}
        else:
            sprite = None
            sprites = data.get("sprites")
            if isinstance(sprites, dict):
                sprite = sprites.get("default")
            cached_items[slug] = {"name": slug, "sprite_url": sprite}
        if i % 50 == 0:
            print(f"  items: {i}/{len(to_fetch_items)}")
            write_json(args.cache, cache)
        time.sleep(delay)

    cache["meta"] = {
        "source": "pokeapi",
        "moves_total": len(cached_moves),
        "items_total": len(cached_items),
        "rate_limit_ms": args.rate_limit_ms,
        "updated_at_unix": int(time.time()),
    }

    write_json(args.cache, cache)
    print(f"[+] Guardado caché: {args.cache}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
