#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
import json
import os
import re
import time
from typing import Dict, Set, Tuple, Optional

import requests

POKEAPI_BASE = "https://pokeapi.co/api/v2"


# ---------- Utils ----------

def read_json(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: str, data):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ---------- Slug logic ----------

def split_camel_case(s: str) -> str:
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", s)
    s = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", " ", s)
    return s


def canonical_move_slug(name: str) -> str:
    s = name.strip().replace("’", "'")
    s = split_camel_case(s).lower()
    s = s.replace("'", "")
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^a-z0-9\-]", "", s)
    s = re.sub(r"-+", "-", s).strip("-")

    # Casos especiales conocidos
    SPECIAL = {
        "doubleslap": "double-slap",
        "dynamicpunch": "dynamic-punch",
        "ancientpower": "ancient-power",
    }
    return SPECIAL.get(s, s)


def canonical_item_slug(name: str) -> str:
    s = name.strip().lower()
    s = s.replace("’", "")
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^a-z0-9\-]", "", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


# ---------- Collect from sets ----------

def collect_needed_from_sets(sets_dir: str) -> Tuple[Set[str], Set[str]]:
    moves, items = set(), set()

    for fn in os.listdir(sets_dir):
        if not fn.endswith(".json") or fn.startswith("_"):
            continue
        data = read_json(os.path.join(sets_dir, fn))

        if isinstance(data.get("item"), str):
            items.add(canonical_item_slug(data["item"]))

        for m in data.get("moves", []):
            if isinstance(m, str):
                moves.add(canonical_move_slug(m))

    return moves, items


# ---------- Fetch ----------

def fetch_json(url: str, session: requests.Session) -> Optional[dict]:
    r = session.get(url, timeout=20)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sets_dir", default="data/subway_pokemon")
    ap.add_argument("--cache", default="data/moves_items_cache.json")
    ap.add_argument("--rate_limit_ms", type=int, default=120)
    args = ap.parse_args()

    cache = {"moves": {}, "items": {}}
    if os.path.exists(args.cache):
        cache = read_json(args.cache)

    needed_moves, needed_items = collect_needed_from_sets(args.sets_dir)

    session = requests.Session()
    session.headers["User-Agent"] = "BattleSubwayHelper/1.0"

    delay = args.rate_limit_ms / 1000

    # ---- MOVES ----
    for slug in sorted(needed_moves):
        if slug in cache["moves"] and not cache["moves"][slug].get("not_found"):
            continue

        data = fetch_json(f"{POKEAPI_BASE}/move/{slug}/", session)
        if data is None:
            cache["moves"][slug] = {"type": None, "not_found": True}
        else:
            cache["moves"][slug] = {
                "type": data["type"]["name"],
                "not_found": False,
            }
        time.sleep(delay)

    # ---- ITEMS ----
    for slug in sorted(needed_items):
        if slug in cache["items"] and not cache["items"][slug].get("not_found"):
            continue

        data = fetch_json(f"{POKEAPI_BASE}/item/{slug}/", session)
        if data is None:
            cache["items"][slug] = {"sprite_url": None, "not_found": True}
        else:
            cache["items"][slug] = {
                "sprite_url": data["sprites"]["default"],
                "not_found": False,
            }
        time.sleep(delay)

    write_json(args.cache, cache)
    print(f"[+] Caché consolidada guardada: {args.cache}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
