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
import os
import re
import sys
import time
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional, Tuple

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

    # "unidecode" no es stdlib; hacemos una transliteración mínima con normalize
    try:
        import unicodedata

        name = unicodedata.normalize("NFKD", name)
        name = "".join(ch for ch in name if not unicodedata.combining(ch))
    except Exception:
        pass

    # Quitar caracteres no alfanuméricos
    name = re.sub(r"[^a-z0-9]+", "", name)
    return name


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def write_json(path: str, payload: Any) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


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
        "User-Agent": "SubwaySetsDownloader/1.0 (personal project; contact: none)",
        "Accept-Language": "en",
    }
    r = requests.get(url, headers=headers, timeout=timeout)
    r.raise_for_status()
    return r.text


def try_parse_from_table(soup: BeautifulSoup) -> List[Dict[str, str]]:
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

        # Detectar header
        header_cells = [c.get_text(" ", strip=True) for c in rows[0].find_all(["th", "td"])]
        header_text = " ".join(header_cells).lower()

        # Buscamos señales claras
        if not ("pokemon" in header_text and "nature" in header_text and "move" in header_text):
            continue

        parsed: List[Dict[str, str]] = []
        for tr in rows[1:]:
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
            # Esperado: 8 o 9 columnas (id + pokemon + nature + item + 4 moves + evs)
            if len(cells) < 8:
                continue

            # A veces hay columnas extra; buscamos el patrón empezando por un id numérico.
            # Intento 1: id al principio
            if cells and re.fullmatch(r"\d+", cells[0]):
                gid = cells[0]
                # El resto idealmente: species, nature, item, m1, m2, m3, m4, evs
                if len(cells) >= 9:
                    species = cells[1]
                    nature = cells[2]
                    item = cells[3]
                    moves = cells[4:8]
                    evs = cells[8] if len(cells) > 8 else ""
                    parsed.append(
                        {
                            "global_id": gid,
                            "species": species,
                            "nature": nature,
                            "item": item,
                            "move1": moves[0],
                            "move2": moves[1],
                            "move3": moves[2],
                            "move4": moves[3],
                            "evs": evs,
                        }
                    )
                    continue

            # Intento 2: buscar el primer token numérico como id
            first_num_idx = None
            for i, c in enumerate(cells[:3]):
                if re.fullmatch(r"\d+", c):
                    first_num_idx = i
                    break
            if first_num_idx is None:
                continue

            # Reindexar desde ahí
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

        # Si esta tabla dio suficientes filas, la aceptamos
        if len(parsed) >= 200:  # umbral para evitar tablas irrelevantes
            return parsed

    return []


def parse_fallback_from_text(soup: BeautifulSoup) -> List[Dict[str, str]]:
    """
    Fallback: parsea líneas tipo:
      84 Minccino Adamant King's Rock Tail Slap Dig U-turn Captivate Atk/Spe

    OJO: este fallback NO es perfecto con items/moves multi-palabra, pero suele funcionar.
    Si te encontrases casos raros, lo ideal es que la tabla HTML exista y se use try_parse_from_table.
    """
    text = soup.get_text("\n")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    # Localiza el bloque que empieza tras el header "Pokemon Nature Item Move 1 ..."
    start_idx = None
    header_re = re.compile(r"^pokemon\s+nature\s+item\s+move\s+1", re.IGNORECASE)
    for i, ln in enumerate(lines):
        if header_re.search(ln):
            start_idx = i + 1
            break
    if start_idx is None:
        # Último recurso: cualquier línea que empiece por número y tenga suficientes tokens
        start_idx = 0

    out: List[Dict[str, str]] = []
    line_re = re.compile(r"^(?P<id>\d+)\s+(?P<rest>.+)$")

    # EVs suelen tener / y stats abreviados
    ev_re = re.compile(r"^(HP|Atk|Def|SpA|SpD|Spe)(/(HP|Atk|Def|SpA|SpD|Spe))*$")

    for ln in lines[start_idx:]:
        m = line_re.match(ln)
        if not m:
            continue
        gid = m.group("id")
        rest = m.group("rest")

        parts = rest.split()
        if len(parts) < 7:
            continue

        species = parts[0]
        nature = parts[1]

        # EVs: último token si parece EVs
        evs = parts[-1] if ev_re.match(parts[-1]) else ""
        core = parts[:-1] if evs else parts[:]

        # Core esperado: species, nature, item..., moves...
        # Aproximación: últimos 4 "moves" (token a token) => NO perfecto si hay moves de 2 palabras.
        # Pero la mayoría aquí son de 1 token o con guiones.
        if len(core) < 1 + 1 + 1 + 4:
            continue

        # En este fallback asumimos moves = últimos 4 tokens
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

    # Contador por especie para generar gengar1..gengarN
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
    parser = argparse.ArgumentParser(description="Descarga sets del Battle Subway y los guarda como JSON (uno por set).")
    parser.add_argument("--url", default=DEFAULT_URL, help=f"URL origen (por defecto: {DEFAULT_URL})")
    parser.add_argument("--out", default="data/subway_pokemon", help="Directorio de salida (por defecto: data/subway_pokemon)")
    parser.add_argument("--sleep", type=float, default=0.0, help="Segundos a esperar tras descargar (por defecto: 0.0)")
    parser.add_argument("--timeout", type=int, default=30, help="Timeout HTTP en segundos (por defecto: 30)")
    args = parser.parse_args()

    out_dir = args.out
    ensure_dir(out_dir)

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

    # Guardar cada set en su fichero
    for s in sets:
        base = slugify(s.species)
        filename = f"{base}{s.variant_index}.json"
        path = os.path.join(out_dir, filename)

        payload = asdict(s)
        payload["filename"] = filename

        write_json(path, payload)

        index["by_global_id"][str(s.global_id)] = filename
        index["by_species"].setdefault(s.species, []).append(filename)

    write_json(os.path.join(out_dir, "_index.json"), index)

    print(f"[+] Guardados {len(sets)} ficheros + _index.json en: {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
