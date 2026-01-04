#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
import json
import os
from typing import Any, Dict, List, Tuple


LANGS = ["en", "es", "de", "fr", "it", "ja", "ko"]


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, obj: Any) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def parse_mapping_file_eq(text: str) -> Dict[str, str]:
    """
    Parses lines like:
      X = Y;
    into { "X": "Y" }
    """
    out: Dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or "=" not in line:
            continue
        left, right = line.split("=", 1)
        left = left.strip().rstrip(";").strip()
        right = right.strip().rstrip(";").strip()
        if left and right:
            out[left] = right
    return out


def parse_class_mapping(text: str) -> Dict[str, Dict[str, str]]:
    """
    Parses lines like:
    Ace Trainer (M) = Entrenador Guay = Ass-Trainer = Topdresseur = Fantallen = エリートトレーナー = 엘리트 트레이너;

    Returns:
      {
        "Ace Trainer (M)": {"es": "...", "de": "...", "fr": "...", "it": "...", "ja": "...", "ko": "..."}
      }
    """
    out: Dict[str, Dict[str, str]] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or "=" not in line:
            continue
        if line.endswith(";"):
            line = line[:-1].strip()

        parts = [p.strip() for p in line.split("=")]
        if len(parts) != 7:
            # EN + 6 langs
            continue

        en = parts[0]
        out[en] = {
            "es": parts[1],
            "de": parts[2],
            "fr": parts[3],
            "it": parts[4],
            "ja": parts[5],
            "ko": parts[6],
        }
    return out


def extract_name_key_en(name_en_full: str) -> str:
    """
    Uses last token as the name key:
      'Pokemon Ranger (F) Ivy' -> 'Ivy'
      'Parasol Lady Hilary' -> 'Hilary'
    """
    toks = [t for t in (name_en_full or "").strip().split(" ") if t]
    return toks[-1] if toks else ""


def extract_class_en(name_en_full: str) -> str:
    """
    Everything except the last token:
      'Pokemon Ranger (F) Ivy' -> 'Pokemon Ranger (F)'
      'Parasol Lady Hilary' -> 'Parasol Lady'
    """
    toks = [t for t in (name_en_full or "").strip().split(" ") if t]
    if len(toks) < 2:
        return ""
    return " ".join(toks[:-1])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--trainers", required=True, help="data/subway_trainers_set45.json")
    ap.add_argument("--conocidos", required=True, help="conocidos.txt (EN full = ES full;)")
    ap.add_argument("--names_raw", required=True, help="data/trainer_names_multilang_raw.json")
    ap.add_argument("--classes", required=True, help="entrenadores.txt (class EN = class ES = ...;)")
    ap.add_argument("--write", action="store_true", help="Write in place")
    args = ap.parse_args()

    data = load_json(args.trainers)
    trainers: List[dict] = data.get("trainers", [])
    if not isinstance(trainers, list):
        raise SystemExit("Invalid trainers JSON: 'trainers' is not a list")

    # conocidos: EN full -> ES full
    conocidos_text = open(args.conocidos, "r", encoding="utf-8").read()
    conocidos = parse_mapping_file_eq(conocidos_text)

    # names raw rows: build index en_name_only -> list of rows
    raw = load_json(args.names_raw)
    rows = raw.get("rows", [])
    if not isinstance(rows, list):
        raise SystemExit("Invalid names_raw: 'rows' must be a list")

    by_en: Dict[str, List[dict]] = {}
    for r in rows:
        names = r.get("names", {})
        if not isinstance(names, dict):
            continue
        en = names.get("en")
        if isinstance(en, str) and en.strip():
            by_en.setdefault(en.strip(), []).append(r)

    # classes map
    classes_text = open(args.classes, "r", encoding="utf-8").read()
    class_map = parse_class_mapping(classes_text)

    updated = 0
    missing_es_full = []
    missing_name_key = []
    ambiguous_name_key = []
    missing_class = []

    for t in trainers:
        name_en_full = (t.get("name_en") or "").strip()
        if not name_en_full:
            continue

        # attach ES full from conocidos (optional but you have it)
        es_full = conocidos.get(name_en_full)
        if not es_full:
            missing_es_full.append(name_en_full)
        else:
            # keep backwards compatibility: name_es field
            t["name_es"] = es_full

        name_key = extract_name_key_en(name_en_full)
        if not name_key:
            missing_name_key.append(name_en_full)
            continue

        candidates = by_en.get(name_key, [])
        if len(candidates) == 0:
            missing_name_key.append(name_en_full)
            continue
        if len(candidates) > 1:
            # name collision in the global list; needs disambiguation rule
            ambiguous_name_key.append(f"{name_en_full} -> {name_key} (candidates={len(candidates)})")
            continue

        row = candidates[0]
        names = row.get("names", {})
        if not isinstance(names, dict):
            continue

        # classes (per language)
        class_en = extract_class_en(name_en_full)
        cls = class_map.get(class_en)
        if not cls:
            missing_class.append(class_en)
            # still attach names; classes can be fixed later
            classes_obj = {"en": class_en}
        else:
            classes_obj = {"en": class_en, **cls}

        # ensure names dict has all langs
        names_obj = {lang: (names.get(lang) if isinstance(names.get(lang), str) else None) for lang in LANGS}

        t["names"] = names_obj
        t["classes"] = classes_obj

        updated += 1

    # Dedup missing_class list
    missing_class = sorted({x for x in missing_class if x})

    print(f"[+] trainers processed: {len(trainers)}")
    print(f"[+] updated trainers with names/classes: {updated}")
    if missing_es_full:
        print(f"[!] conocidos missing for {len(missing_es_full)} trainers (EN full not found). First 10:")
        for x in missing_es_full[:10]:
            print(f"    - {x}")
    if missing_name_key:
        print(f"[!] names_raw missing for {len(missing_name_key)} trainers (name key not found). First 10:")
        for x in missing_name_key[:10]:
            print(f"    - {x}")
    if ambiguous_name_key:
        print(f"[!] ambiguous name keys: {len(ambiguous_name_key)} (needs disambiguation). First 10:")
        for x in ambiguous_name_key[:10]:
            print(f"    - {x}")
    if missing_class:
        print(f"[!] missing class mappings: {len(missing_class)} (class_en not in entrenadores.txt).")
        for x in missing_class[:30]:
            print(f"    - {x}")

    if args.write:
        save_json(args.trainers, data)
        print(f"[+] wrote: {args.trainers}")
    else:
        print("[dry-run] Not writing. Re-run with --write to apply.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
