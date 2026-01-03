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

    Ignora ficheros que:
      - no acaben en .json
      - empiecen por "_" (reservados)
    """
    if not os.path.isdir(sets_dir):
        raise FileNotFoundError(f"sets_dir not found or not a directory: {sets_dir}")

    out: Dict[str, str] = {}
    for fn in os.listdir(sets_dir):
        if not fn.endswith(".json") or fn.startswith("_"):
            continue

        path = os.path.join(sets_dir, fn)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            raise RuntimeError(f"Failed reading JSON: {path}. Error: {e}") from e

        if "global_id" not in data:
            raise KeyError(f"Missing 'global_id' in set file: {path}")

        gid = str(data["global_id"])
        if gid in out and out[gid] != fn:
            print(f"[!] WARNING: duplicate global_id {gid}: {out[gid]} and {fn}. Keeping {fn}.")
        out[gid] = fn

    if not out:
        print(f"[!] WARNING: no set JSON files found in {sets_dir}")

    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pools", default="data/subway_pools_set45.json")
    ap.add_argument("--sets_dir", default="data/subway_pokemon")
    ap.add_argument("--out", default="data/subway_pools_index_set45.json")
    args = ap.parse_args()

    pools_data = read_json(args.pools)
    pools = pools_data.get("pools", [])
    if not isinstance(pools, list) or not pools:
        print("[!] No hay pools en el input (o 'pools' no es una lista).")
        return 1

    trainer_to_pool: Dict[str, str] = {}
    pool_to_trainers: Dict[str, List[dict]] = {}

    for p in pools:
        pid = p.get("pool_id")
        trainers = p.get("trainers")

        if not pid or not isinstance(pid, str):
            raise ValueError("Invalid pool entry: missing/invalid 'pool_id'")
        if not isinstance(trainers, list):
            raise ValueError(f"Invalid pool entry {pid}: 'trainers' is not a list")

        pool_to_trainers[pid] = trainers
        for t in trainers:
            tid = t.get("trainer_id")
            if not tid or not isinstance(tid, str):
                raise ValueError(f"Invalid trainer entry in pool {pid}: missing/invalid 'trainer_id'")
            trainer_to_pool[tid] = pid

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
