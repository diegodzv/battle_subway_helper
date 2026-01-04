#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
import json
import os
from typing import Dict, List


def read_nonempty_lines(path: str) -> List[str]:
    with open(path, "r", encoding="utf-8") as f:
        lines = [ln.strip() for ln in f.read().splitlines()]
    return [ln for ln in lines if ln]


def write_json(path: str, obj) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--en", required=True, help="names_en.txt")
    ap.add_argument("--es", required=True, help="names_es.txt")
    ap.add_argument("--de", required=True, help="names_de.txt")
    ap.add_argument("--fr", required=True, help="names_fr.txt")
    ap.add_argument("--it", required=True, help="names_it.txt")
    ap.add_argument("--ja", required=True, help="names_ja.txt")
    ap.add_argument("--ko", required=True, help="names_ko.txt")
    ap.add_argument("--out", default="data/trainer_names_multilang_raw.json")
    args = ap.parse_args()

    lang_files = {
        "en": args.en,
        "es": args.es,
        "de": args.de,
        "fr": args.fr,
        "it": args.it,
        "ja": args.ja,
        "ko": args.ko,
    }

    lang_to_lines: Dict[str, List[str]] = {lang: read_nonempty_lines(p) for lang, p in lang_files.items()}
    lens = {lang: len(v) for lang, v in lang_to_lines.items()}
    uniq = sorted(set(lens.values()))
    if len(uniq) != 1:
        raise SystemExit(f"Input files have different non-empty line counts: {lens}")

    n = uniq[0]
    rows = []
    for i in range(n):
        rows.append(
            {
                "index": i + 1,
                "names": {lang: lang_to_lines[lang][i] for lang in ["en", "es", "de", "fr", "it", "ja", "ko"]},
            }
        )

    payload = {"meta": {"row_count": n, "languages": ["en", "es", "de", "fr", "it", "ja", "ko"]}, "rows": rows}
    write_json(args.out, payload)
    print(f"[+] Wrote: {args.out} (rows={n})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
