#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
from typing import Dict


def read_json(p):
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(p, d):
    with open(p, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)


def canonical_move_slug(name: str) -> str:
    import re
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", name)
    s = s.lower()
    s = s.replace("'", "")
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^a-z0-9\-]", "", s)
    s = re.sub(r"-+", "-", s).strip("-")

    FIX = {
        "doubleslap": "double-slap",
        "dynamicpunch": "dynamic-punch",
        "ancientpower": "ancient-power",
    }
    return FIX.get(s, s)


def main():
    sets_dir = "data/subway_pokemon"
    cache = read_json("data/moves_items_cache.json")

    updated = 0

    for fn in os.listdir(sets_dir):
        if not fn.endswith(".json"):
            continue

        path = os.path.join(sets_dir, fn)
        data = read_json(path)

        new_moves_meta = []
        changed = False

        for move in data.get("moves", []):
            slug = canonical_move_slug(move)
            meta = cache["moves"].get(slug, {})
            mtype = meta.get("type")

            new_moves_meta.append({
                "name": move,
                "type": mtype
            })

            if mtype is not None:
                changed = True

        if changed:
            data["moves_meta"] = new_moves_meta
            updated += 1
            write_json(path, data)

    print(f"[+] Re-enriched sets corregidos: {updated}")


if __name__ == "__main__":
    main()
