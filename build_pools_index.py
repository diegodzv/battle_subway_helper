#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
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


def build_global_id_index(sets_dir: str) -> Dict[str, str]:
    """
    Lee todos los JSON de sets y crea:
      global_id (str) -> filename
    """
    out: Dict[str, str] = {}
    for fn in os.listdir(sets_dir):
        if not fn.endswith(".json") or fn.startswith("_"):
            continue
        path = os.path.join(sets_dir, fn)
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        gid = str(data["global_id"])
        out[gid] = fn
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pools", default="data/subway_pools_set45.json")
    ap.add_argument("--sets_dir", default="data/subway_pokemon")
    ap.add_argument("--out", default="data/subway_pools_index_set45.json")
    args = ap.parse_args()

    pools_data = read_json(args.pools)
    pools = pools_data.get("pools", [])
    if not pools:
        print("[!] No hay pools en el input.")
        return 1

    trainer_to_pool: Dict[str, str] = {}
    pool_to_trainers: Dict[str, List[dict]] = {}

    for p in pools:
        pid = p["pool_id"]
        pool_to_trainers[pid] = p["trainers"]
        for t in p["trainers"]:
            trainer_to_pool[t["trainer_id"]] = pid

    global_id_to_setfile = build_global_id_index(args.sets_dir)

    out = {
        "meta": {
            "pools_file": args.pools,
            "sets_dir": args.sets_dir,
            "unique_pools": len(pools),
        },
        "trainer_to_pool": trainer_to_pool,
        "pool_to_trainers": pool_to_trainers,
        "global_id_to_setfile": global_id_to_setfile,
    }

    write_json(args.out, out)
    print(f"[+] Guardado: {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
