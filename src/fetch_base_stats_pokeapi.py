#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Crea data/base_stats.json consultando PokéAPI SOLO para las especies presentes en data/subway_pokemon.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any, Dict, List, Set

import requests

POKEAPI_POKEMON = "https://pokeapi.co/api/v2/pokemon/{name}"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def list_set_files(dir_path: Path) -> List[Path]:
    return sorted(
        [p for p in dir_path.iterdir() if p.is_file() and p.suffix == ".json" and not p.name.startswith("_")]
    )


def normalize_species_for_pokeapi(species: str) -> str:
    """
    PokéAPI usa nombres estilo 'mr-mime', 'farfetchd', etc.
    Para Gen 1-5 casi siempre coincide, pero hay excepciones.
    """
    s = (species or "").strip()

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

    if s in special:
        return special[s]

    # default: minúsculas y espacios->guiones
    out = s.lower()
    out = out.replace(" ", "-")
    out = out.replace(".", "")
    out = out.replace("’", "")
    out = out.replace("'", "")
    out = out.replace("♀", "-f")
    out = out.replace("♂", "-m")
    return out


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

    sets_dir = Path(args.sets_dir)
    out_path = Path(args.out)

    files = list_set_files(sets_dir)
    if not files:
        print(f"[!] No encuentro sets en {sets_dir}")
        return 1

    species: Set[str] = set()
    for p in files:
        data = read_json(p)
        sp = data.get("species")
        if isinstance(sp, str) and sp.strip():
            species.add(sp.strip())

    print(f"[+] Especies únicas: {len(species)}")

    out: Dict[str, dict] = {}
    errors: List[str] = []

    for sp in sorted(species):
        api_name = normalize_species_for_pokeapi(sp)
        try:
            payload = fetch_pokemon(api_name, timeout=args.timeout)
            stats = {s["stat"]["name"]: s["base_stat"] for s in payload["stats"]}

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

    write_json(out_path, result)
    print(f"[+] Guardado: {out_path}")
    if errors:
        print("[!] Hay errores. Normalmente son nombres raros; los añadimos al mapeo y listo.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
