#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Parser robusto para https://www.smogon.com/ingame/bc/bw_subway_trainers
porque BeautifulSoup puede tokenizar así:
  Name
  1
  ,
  2
  ,
  3
  ...

Este script:
- extrae tokens (strings) del texto visible
- detecta "Super Subway Trainers" y luego "Set 1..5 / Special"
- para cada trainer en ese set, consume una lista de ids (int) hasta que llega otro trainer/header
- filtra a Set 4/5 por defecto
"""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional, Set, Tuple

import requests
from bs4 import BeautifulSoup


DEFAULT_URL = "https://www.smogon.com/ingame/bc/bw_subway_trainers"


@dataclass
class TrainerEntry:
    trainer_id: str
    name_en: str
    section: str
    pool_global_ids: List[int]
    source_url: str = DEFAULT_URL


def ensure_dir(path: str) -> None:
    os.makedirs(path or ".", exist_ok=True)


def write_json(path: str, payload) -> None:
    ensure_dir(os.path.dirname(path))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def fetch_html(url: str, timeout: int = 30) -> str:
    r = requests.get(url, timeout=timeout, headers={"User-Agent": "MetroBatallaTrainers/4.0"})
    r.raise_for_status()
    return r.text


def slugify(s: str) -> str:
    s = s.strip().lower()
    try:
        import unicodedata
        s = unicodedata.normalize("NFKD", s)
        s = "".join(ch for ch in s if not unicodedata.combining(ch))
    except Exception:
        pass
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def extract_tokens(html: str) -> List[str]:
    """
    Extrae tokens “visibles” en orden.
    Usamos get_text con separador \n, y luego convertimos en tokens (líneas) quitando vacías.
    """
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text("\n")
    raw_lines = [ln.strip() for ln in text.splitlines()]
    # quitamos vacías
    return [ln for ln in raw_lines if ln]


def normalize_section_token(token: str) -> Optional[str]:
    t = token.strip().lower()
    if re.fullmatch(r"set\s*[1-5]", t):
        n = re.sub(r"\D", "", t)
        return f"Super Set {n}"
    if t == "special":
        return "Super Special"
    return None


def is_int_token(tok: str) -> bool:
    return tok.isdigit()


def is_comma_token(tok: str) -> bool:
    return tok == ","


def looks_like_trainer_name(tok: str) -> bool:
    """
    Heurística: nombres de trainer suelen tener letras y espacios, no ser headings obvios.
    """
    low = tok.lower()
    if low in {"table of contents", "introduction", "normal subway trainers", "super subway trainers"}:
        return False
    if normalize_section_token(tok) is not None:
        return False
    if is_int_token(tok) or is_comma_token(tok):
        return False
    # Evitar líneas de explicación largas
    if len(tok) > 80:
        return False
    # Debe contener al menos una letra
    return any(ch.isalpha() for ch in tok)


def consume_pool(tokens: List[str], start: int) -> Tuple[List[int], int]:
    """
    Consume tokens desde start asumiendo patrón:
      <int> (, <int>)*

    Devuelve (nums, next_index)
    """
    nums: List[int] = []
    i = start

    # Primer int
    if i < len(tokens) and is_int_token(tokens[i]):
        nums.append(int(tokens[i]))
        i += 1
    else:
        return [], start

    # Repite: ',' int
    while i + 1 < len(tokens) and is_comma_token(tokens[i]) and is_int_token(tokens[i + 1]):
        nums.append(int(tokens[i + 1]))
        i += 2

    return nums, i


def parse_trainers(tokens: List[str], wanted_sections: Set[str], debug: bool = False) -> List[TrainerEntry]:
    entries: List[TrainerEntry] = []

    # 1) ir hasta "Super Subway Trainers" (ojo: aparece en TOC y luego como header real;
    # nos vale el primero, pero después exigimos ver "Set 1" y empezar a parsear pools)
    try:
        super_idx = next(i for i, t in enumerate(tokens) if t.strip().lower() == "super subway trainers")
    except StopIteration:
        return []

    i = super_idx + 1
    current_section: Optional[str] = None

    # 2) avanzamos hasta encontrar un "Set 1" real; a partir de ahí parseamos
    while i < len(tokens):
        sec = normalize_section_token(tokens[i])
        if sec:
            current_section = sec
            i += 1
            break
        i += 1

    if current_section is None:
        return []

    # 3) parseo principal
    while i < len(tokens):
        tok = tokens[i]

        sec = normalize_section_token(tok)
        if sec:
            current_section = sec
            i += 1
            continue

        if current_section not in wanted_sections:
            # saltamos hasta siguiente sección o algo que parezca sección
            i += 1
            continue

        # candidato a trainer name
        if looks_like_trainer_name(tok):
            name = tok
            # intentamos consumir pool inmediatamente después
            if i + 1 < len(tokens) and is_int_token(tokens[i + 1]):
                nums, j = consume_pool(tokens, i + 1)
                if nums:
                    tid = slugify(f"{current_section}-{name}")
                    entries.append(
                        TrainerEntry(
                            trainer_id=tid,
                            name_en=name,
                            section=current_section,
                            pool_global_ids=nums,
                        )
                    )
                    i = j
                    continue

        i += 1

    # Dedup
    uniq: Dict[str, TrainerEntry] = {}
    for e in entries:
        uniq[e.trainer_id] = e

    if debug:
        print(f"[debug] parsed trainers={len(uniq)}")

    return list(uniq.values())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--out", default="data/subway_trainers_set45.json")
    ap.add_argument("--timeout", type=int, default=30)
    ap.add_argument("--sections", default="set4,set5", help="set4,set5 por defecto; también set1,set2,set3,special")
    ap.add_argument("--debug_dump", action="store_true", help="Imprime tokens alrededor de 'Youngster Joshua'")
    ap.add_argument("--debug", action="store_true", help="Debug extra")
    args = ap.parse_args()

    section_map = {
        "set1": "Super Set 1",
        "set2": "Super Set 2",
        "set3": "Super Set 3",
        "set4": "Super Set 4",
        "set5": "Super Set 5",
        "special": "Super Special",
    }
    wanted: Set[str] = set()
    for token in [t.strip().lower() for t in args.sections.split(",") if t.strip()]:
        if token not in section_map:
            raise SystemExit(f"Sección desconocida: {token}. Usa: {', '.join(section_map.keys())}")
        wanted.add(section_map[token])

    print(f"[+] Descargando: {args.url}")
    html = fetch_html(args.url, timeout=args.timeout)
    tokens = extract_tokens(html)

    if args.debug_dump:
        # Busca "Youngster Joshua" y dumpea tokens alrededor
        try:
            idx = next(i for i, t in enumerate(tokens) if t == "Youngster Joshua")
            lo = max(0, idx - 5)
            hi = min(len(tokens), idx + 30)
            print("[debug] Dump tokens alrededor de 'Youngster Joshua':")
            for j in range(lo, hi):
                print(f"{j:05d}: {tokens[j]}")
        except StopIteration:
            print("[debug] No encuentro 'Youngster Joshua' en tokens.")

    print(f"[+] Parseando entrenadores ({sorted(wanted)})...")
    trainers = parse_trainers(tokens, wanted_sections=wanted, debug=args.debug)
    trainers = sorted(trainers, key=lambda t: (t.section, t.name_en))

    payload = {
        "meta": {
            "source": args.url,
            "trainer_count": len(trainers),
            "sections": sorted(wanted),
        },
        "trainers": [asdict(t) for t in trainers],
    }

    write_json(args.out, payload)
    print(f"[+] Guardado: {args.out} (trainers={len(trainers)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
