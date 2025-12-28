#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import json
from typing import Any, Dict, List, Tuple


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, obj: Any) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def parse_mapping_text(text: str) -> Dict[str, str]:
    """
    Parses lines like:
      X = Y;
    into { "X": "Y" }

    Ignores empty lines and lines without '='.
    Strips trailing ';'.
    """
    out: Dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if "=" not in line:
            continue
        left, right = line.split("=", 1)
        left = left.strip().rstrip(";").strip()
        right = right.strip().rstrip(";").strip()
        if left and right:
            out[left] = right
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--trainers", required=True, help="Path to data/subway_trainers_set45.json")
    ap.add_argument("--mapping_file", required=True, help="Text file with 'name_en = name_es;' lines")
    ap.add_argument("--write", action="store_true", help="Write changes in place")
    args = ap.parse_args()

    data = load_json(args.trainers)
    trainers: List[dict] = data.get("trainers", [])
    if not isinstance(trainers, list):
        raise SystemExit("Invalid trainers JSON: 'trainers' is not a list")

    mapping_text = open(args.mapping_file, "r", encoding="utf-8").read()
    mapping = parse_mapping_text(mapping_text)

    # Build index by exact name_en
    by_name_en: Dict[str, dict] = {}
    for t in trainers:
        name_en = t.get("name_en")
        if isinstance(name_en, str) and name_en.strip():
            by_name_en[name_en.strip()] = t

    updated = 0
    missing: List[str] = []
    for name_en, name_es in mapping.items():
        t = by_name_en.get(name_en)
        if not t:
            missing.append(name_en)
            continue
        old = t.get("name_es")
        if old != name_es:
            t["name_es"] = name_es
            updated += 1

    print(f"[+] mapping entries: {len(mapping)}")
    print(f"[+] updated trainers: {updated}")
    if missing:
        print(f"[!] missing exact name_en matches: {len(missing)}")
        for m in missing[:20]:
            print(f"    - {m}")
        if len(missing) > 20:
            print("    ...")

    if args.write:
        save_json(args.trainers, data)
        print(f"[+] wrote: {args.trainers}")
    else:
        print("[dry-run] Not writing. Re-run with --write to apply.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
