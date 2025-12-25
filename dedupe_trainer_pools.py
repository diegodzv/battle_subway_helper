#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Agrupa entrenadores por pool_global_ids idéntico (equipos equivalentes).
Genera pool_id estable (hash corto del pool ordenado).

Input:  data/subway_trainers_set45.json
Output: data/subway_pools_set45.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from typing import Dict, List, Any


def read_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: str, payload: Any) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def pool_key(ids: List[int]) -> List[int]:
    return sorted(ids)


def stable_pool_id(sorted_ids: List[int]) -> str:
    """
    ID estable basado en el contenido del pool.
    """
    s = ",".join(str(x) for x in sorted_ids).encode("utf-8")
    h = hashlib.sha1(s).hexdigest()[:10]
    return f"pool_{h}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="data/subway_trainers_set45.json")
    ap.add_argument("--out", default="data/subway_pools_set45.json")
    args = ap.parse_args()

    data = read_json(args.inp)
    trainers = data.get("trainers", [])
    if not trainers:
        print("[!] No hay trainers en el input.")
        return 1

    groups: Dict[str, Dict[str, Any]] = {}

    for t in trainers:
        sorted_ids = pool_key(t["pool_global_ids"])
        pid = stable_pool_id(sorted_ids)

        if pid not in groups:
            groups[pid] = {
                "pool_id": pid,
                "pool_global_ids": sorted_ids,
                "trainers": [],
                "sections": set(),
            }

        groups[pid]["trainers"].append(
            {
                "trainer_id": t["trainer_id"],
                "name_en": t["name_en"],
                "section": t["section"],
            }
        )
        groups[pid]["sections"].add(t["section"])

    pools = []
    for pid, g in groups.items():
        g["trainers"] = sorted(g["trainers"], key=lambda x: (x["section"], x["name_en"]))
        g["sections"] = sorted(list(g["sections"]))
        pools.append(
            {
                "pool_id": g["pool_id"],
                "pool_global_ids": g["pool_global_ids"],
                "pool_size": len(g["pool_global_ids"]),
                "trainer_count": len(g["trainers"]),
                "sections": g["sections"],
                "trainers": g["trainers"],
            }
        )

    # Orden útil: primero pools más frecuentes, luego por pool_size, luego pool_id
    pools = sorted(pools, key=lambda p: (-p["trainer_count"], p["pool_size"], p["pool_id"]))

    out = {
        "meta": {
            "source_trainers_file": args.inp,
            "total_trainers": len(trainers),
            "unique_pools": len(pools),
        },
        "pools": pools,
    }

    write_json(args.out, out)
    print(f"[+] Guardado: {args.out} (unique_pools={len(pools)})")
    # Vista rápida
    top = pools[:10]
    print("[+] Top pools por frecuencia:")
    for p in top:
        print(f"  - {p['pool_id']} trainers={p['trainer_count']} pool_size={p['pool_size']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
