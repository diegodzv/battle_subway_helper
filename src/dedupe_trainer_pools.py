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
from typing import Any, Dict, List


def read_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: str, payload: Any) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def pool_key(ids: List[int]) -> List[int]:
    return sorted(ids)


def stable_pool_id(sorted_ids: List[int]) -> str:
    """
    ID estable basado en el contenido del pool.
    """
    s = ",".join(str(x) for x in sorted_ids).encode("utf-8")
    h = hashlib.sha1(s).hexdigest()[:10]
    return f"pool_{h}"


def trainer_sort_key(t: Dict[str, Any]) -> tuple:
    # Orden por sección, luego por nombre “humano” (es si existe), y como fallback name_en
    section = t.get("section") or ""
    name_es = t.get("name_es") or ""
    name_en = t.get("name_en") or ""
    display = name_es if name_es else name_en
    return (section, display.lower(), name_en.lower())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="data/subway_trainers_set45.json")
    ap.add_argument("--out", default="data/subway_pools_set45.json")
    args = ap.parse_args()

    data = read_json(args.inp)
    trainers = data.get("trainers", [])
    if not isinstance(trainers, list) or not trainers:
        print("[!] No hay trainers en el input.")
        return 1

    groups: Dict[str, Dict[str, Any]] = {}

    for t in trainers:
        pool_ids = t.get("pool_global_ids")
        if not isinstance(pool_ids, list) or not pool_ids:
            # si hubiese un trainer malformado, lo saltamos
            continue

        sorted_ids = pool_key([int(x) for x in pool_ids])
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
                "trainer_id": t.get("trainer_id"),
                "name_en": t.get("name_en"),
                # opcional, útil para inspección (no rompe consumidores)
                "name_es": t.get("name_es"),
                "section": t.get("section"),
            }
        )
        groups[pid]["sections"].add(t.get("section"))

    pools: List[dict] = []
    for _, g in groups.items():
        g["trainers"] = sorted(g["trainers"], key=trainer_sort_key)
        g["sections"] = sorted([s for s in g["sections"] if s])

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
