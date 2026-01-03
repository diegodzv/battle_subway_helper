#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Descarga y parsea los sets del Battle Subway (BW/B2W2) desde Smogon
y los guarda como JSON (un fichero por set) con nombres tipo gengar1.json, gengar2.json, etc.

Fuente: https://www.smogon.com/ingame/bc/bw_subway_pokemon
"""

from __future__ import annotations

import argparse
import json
import re
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Tuple

import requests
from bs4 import BeautifulSoup

DEFAULT_URL = "https://www.smogon.com/ingame/bc/bw_subway_pokemon"


# ----------------------------
# Helpers
# ----------------------------
def slugify(name: str) -> str:
    """
    Convierte un nombre a slug seguro para fichero:
    - lower
    - elimina acentos (si los hubiera)
    - quita todo lo que no sea alfanumérico
    """
    name = name.strip().lower()
    try:
        import unicodedata

        name = unicodedata.normalize("NFKD", name)
        name = "".join(ch for ch in name if not unicodedata.combining(ch))
    except Exception:
        pass
    name = re.sub(r"[^a-z0-9]+", "", name)
    return name


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# ----------------------------
# Data model
# ----------------------------
@dataclass(frozen=True)
class SubwaySet:
    global_id: int
    species: str
    nature: str
    item: str
    moves: List[str]
    evs: str  # Smogon lo da como "Atk/Spe", etc. (no siempre incluye valores)
    variant_index: int  # 1..N para esa especie (gengar1, gengar2...)
    source_url: str = DEFAULT_URL


# ----------------------------
# Parsing
# ----------------------------
def fetch_html(url: str, timeout: int = 30) -> str:
    headers = {
        "User-Agent": "SubwaySetsDownloader/1.1 (personal project; contact: none)",
        "Accept-Language": "en",
    }
    r = requests.get(url, headers=headers, timeout=timeout)
    r.raise_for_status()
    return r.text


def try_parse_from_table(soup: BeautifulSoup, min_rows: int = 200) -> List[Dict[str, str]]:
    """
    Intenta encontrar una tabla con columnas:
    Pokemon, Nature, Item, Move 1..4, EVs (+ el id en primera columna).
    Devuelve una lista de dicts con claves:
      global_id, species, nature, item, move1..4, evs
    """
    tables = soup.find_all("table")
    for table in tables:
        rows = table.find_all("tr")
        if not rows:
            continue

        header_cells = [c.get_text(" ", strip=True) for c in rows[0].find_all(["th", "td"])]
        header_text = " ".join(header_cells).lower()

        if not ("pokemon" in header_text and "nature" in header_text and "move" in header_text):
            continue

        parsed: List[Dict[str, str]] = []
        for tr in rows[1:]:
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
            if len(cells) < 8:
                continue

            # Intento 1: id al principio
            if cells and re.fullmatch(r"\d+", cells[0]):
                if len(cells) >= 9:
                    parsed.append(
                        {
                            "global_id": cells[0],
                            "species": cells[1],
                            "nature": cells[2],
                            "item": cells[3],
                            "move1": cells[4],
                            "move2": cells[5],
                            "move3": cells[6],
                            "move4": cells[7],
                            "evs": cells[8] if len(cells) > 8 else "",
                        }
                    )
                continue

            # Intento 2: buscar un id numérico en las primeras celdas
            first_num_idx = None
            for i, c in enumerate(cells[:3]):
                if re.fullmatch(r"\d+", c):
                    first_num_idx = i
                    break
            if first_num_idx is None:
                continue

            cells2 = cells[first_num_idx:]
            if len(cells2) >= 9 and re.fullmatch(r"\d+", cells2[0]):
                parsed.append(
                    {
                        "global_id": cells2[0],
                        "species": cells2[1],
                        "nature": cells2[2],
                        "item": cells2[3],
                        "move1": cells2[4],
                        "move2": cells2[5],
                        "move3": cells2[6],
                        "move4": cells2[7],
                        "evs": cells2[8],
                    }
                )

        if len(parsed) >= min_rows:
            return parsed

    return []


def parse_fallback_from_text(soup: BeautifulSoup) -> List[Dict[str, str]]:
    """
    Fallback: parsea líneas tipo:
      84 Minccino Adamant King's Rock Tail Slap Dig U-turn Captivate Atk/Spe

    OJO: este fallback NO es perfecto con items/moves multi-palabra.
    """
    text = soup.get_text("\n")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    start_idx = 0
    header_re = re.compile(r"^pokemon\s+nature\s+item\s+move\s+1", re.IGNORECASE)
    for i, ln in enumerate(lines):
        if header_re.search(ln):
            start_idx = i + 1
            break

    out: List[Dict[str, str]] = []
    line_re = re.compile(r"^(?P<id>\d+)\s+(?P<rest>.+)$")
    ev_re = re.compile(r"^(HP|Atk|Def|SpA|SpD|Spe)(/(HP|Atk|Def|SpA|SpD|Spe))*$")

    for ln in lines[start_idx:]:
        m = line_re.match(ln)
        if not m:
            continue
        gid = m.group("id")
        parts = m.group("rest").split()
        if len(parts) < 7:
            continue

        species = parts[0]
        nature = parts[1]

        evs = parts[-1] if ev_re.match(parts[-1]) else ""
        core = parts[:-1] if evs else parts[:]

        if len(core) < 1 + 1 + 1 + 4:
            continue

        move_tokens = core[-4:]
        item_tokens = core[2:-4]
        item = " ".join(item_tokens).strip() if item_tokens else ""

        out.append(
            {
                "global_id": gid,
                "species": species,
                "nature": nature,
                "item": item,
                "move1": move_tokens[0],
                "move2": move_tokens[1],
                "move3": move_tokens[2],
                "move4": move_tokens[3],
                "evs": evs,
            }
        )

    return out


def parse_sets(html: str) -> Tuple[List[SubwaySet], Dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")

    rows = try_parse_from_table(soup)
    parse_mode = "table"
    if not rows:
        rows = parse_fallback_from_text(soup)
        parse_mode = "fallback_text"

    if not rows:
        raise RuntimeError("No he podido parsear ningún set. Puede haber cambiado el formato de la página.")

    per_species_count: Dict[str, int] = {}
    sets: List[SubwaySet] = []

    for r in rows:
        species = r["species"].strip()
        per_species_count[species] = per_species_count.get(species, 0) + 1
        variant_index = per_species_count[species]

        moves = [r["move1"], r["move2"], r["move3"], r["move4"]]
        moves = [m.strip() for m in moves if m.strip()]

        sets.append(
            SubwaySet(
                global_id=int(r["global_id"]),
                species=species,
                nature=r["nature"].strip(),
                item=r["item"].strip(),
                moves=moves,
                evs=r.get("evs", "").strip(),
                variant_index=variant_index,
            )
        )

    meta = {
        "parse_mode": parse_mode,
        "total_sets": len(sets),
        "total_species": len(per_species_count),
    }
    return sets, meta


# ----------------------------
# Main
# ----------------------------
def main() -> int:
    parser = argparse.ArgumentParser(
        description="Descarga sets del Battle Subway y los guarda como JSON (uno por set)."
    )
    parser.add_argument("--url", default=DEFAULT_URL, help=f"URL origen (por defecto: {DEFAULT_URL})")
    parser.add_argument("--out", default="data/subway_pokemon", help="Directorio de salida (por defecto: data/subway_pokemon)")
    parser.add_argument("--sleep", type=float, default=0.0, help="Segundos a esperar tras descargar (por defecto: 0.0)")
    parser.add_argument("--timeout", type=int, default=30, help="Timeout HTTP en segundos (por defecto: 30)")
    parser.add_argument("--overwrite", action="store_true", help="Sobrescribir ficheros existentes")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[+] Descargando: {args.url}")
    html = fetch_html(args.url, timeout=args.timeout)

    if args.sleep > 0:
        time.sleep(args.sleep)

    print("[+] Parseando sets...")
    sets, meta = parse_sets(html)
    print(f"[+] OK: {meta}")

    index: Dict[str, Any] = {
        "meta": meta,
        "by_species": {},
        "by_global_id": {},
    }

    for s in sets:
        base = slugify(s.species)
        filename = f"{base}{s.variant_index}.json"
        path = out_dir / filename

        if path.exists() and not args.overwrite:
            # no tocamos index si no escribimos el set
            index["by_global_id"][str(s.global_id)] = filename
            index["by_species"].setdefault(s.species, []).append(filename)
            continue

        payload = asdict(s)
        payload["filename"] = filename
        write_json(path, payload)

        index["by_global_id"][str(s.global_id)] = filename
        index["by_species"].setdefault(s.species, []).append(filename)

    write_json(out_dir / "_index.json", index)

    print(f"[+] Guardados {len(sets)} ficheros + _index.json en: {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
