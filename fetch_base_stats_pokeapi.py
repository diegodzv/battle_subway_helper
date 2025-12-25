#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Crea data/base_stats.json consultando PokéAPI SOLO para las especies presentes en data/subway_pokemon.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from typing import Dict, List, Set

import requests


POKEAPI_POKEMON = "https://pokeapi.co/api/v2/pokemon/{name}"


def read_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: str, payload: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def list_set_files(dir_path: str) -> List[str]:
    return [
        os.path.join(dir_path, fn)
        for fn in os.listdir(dir_path)
        if fn.endswith(".json") and not fn.startswith("_")
    ]


def normalize_species_for_pokeapi(species: str) -> str:
    """
    PokéAPI usa nombres estilo 'mr-mime', 'farfetchd', etc.
    Para Gen 1-5 casi siempre coincide, pero hay excepciones.
    Este mapeo pequeño cubre las típicas.
    """
    s = species.strip().lower()

    special = {
        "Mr. Mime": "mr-mime",
        "Mime Jr.": "mime-jr",
        "Farfetch'd": "farfetchd",
        "Nidoran♀": "nidoran-f",
        "Nidoran♂": "nidoran-m",
        "Deoxys": "deoxys-normal",
        "Wormadam": "wormadam-plant",
        "Giratina": "giratina-altered",
        "Shaymin": "shaymin-land",
        "Rotom": "rotom",
        "Basculin": "basculin-red-striped",
        "Darmanitan": "darmanitan-standard",
        "Tornadus": "tornadus-incarnate",
        "Thundurus": "thundurus-incarnate",
        "Landorus": "landorus-incarnate",
        "Keldeo": "keldeo-ordinary",
        "Meloetta": "meloetta-aria",
    }
    if species in special:
        return special[species]

    # default: minúsculas y espacios->guiones
    s = s.replace(" ", "-")
    s = s.replace(".", "")
    s = s.replace("’", "")
    s = s.replace("'", "")
    s = s.replace("♀", "-f")
    s = s.replace("♂", "-m")
    return s


def fetch_pokemon(name: str, timeout: int = 30) -> dict:
    url = POKEAPI_POKEMON.format(name=name)
    r = requests.get(url, timeout=timeout, headers={"User-Agent": "MetroBatallaStats/1.0"})
    r.raise_for_status()
    return r.json()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sets_dir", default="data/subway_pokemon", help="Directorio con JSONs de sets")
    parser.add_argument("--out", default="data/base_stats.json", help="Salida base stats JSON")
    parser.add_argument("--sleep", type=float, default=0.2, help="Delay entre requests (respeta rate limits)")
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args()

    files = list_set_files(args.sets_dir)
    if not files:
        print(f"[!] No encuentro sets en {args.sets_dir}")
        return 1

    species: Set[str] = set()
    for p in files:
        data = read_json(p)
        species.add(data["species"])

    print(f"[+] Especies únicas: {len(species)}")

    out: Dict[str, dict] = {}
    errors: List[str] = []

    for sp in sorted(species):
        api_name = normalize_species_for_pokeapi(sp)
        try:
            payload = fetch_pokemon(api_name, timeout=args.timeout)
            stats = {s["stat"]["name"]: s["base_stat"] for s in payload["stats"]}

            # Map a tus keys
            out[sp] = {
                "pokeapi_name": api_name,
                "base_stats": {
                    "HP": stats["hp"],
                    "Atk": stats["attack"],
                    "Def": stats["defense"],
                    "SpA": stats["special-attack"],
                    "SpD": stats["special-defense"],
                    "Spe": stats["speed"],
                },
                "abilities": [a["ability"]["name"] for a in payload.get("abilities", [])],
                "sprites": payload.get("sprites", {}),
            }
            print(f"[+] {sp} -> OK")
        except Exception as e:
            msg = f"{sp} ({api_name}): {e}"
            print(f"[!] ERROR: {msg}")
            errors.append(msg)

        time.sleep(args.sleep)

    result = {
        "meta": {
            "species_count": len(species),
            "ok": len(out),
            "errors": len(errors),
        },
        "errors": errors,
        "data": out,
    }

    write_json(args.out, result)
    print(f"[+] Guardado: {args.out}")
    if errors:
        print("[!] Hay errores. Normalmente son nombres raros; los añadimos al mapeo y listo.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
