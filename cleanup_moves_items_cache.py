#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
cleanup_moves_items_cache.py

Limpia el cache data/moves_items_cache.json.

Soporta:
- Esquema NESTED: {"meta":..., "moves":{...}, "items":{...}}
- Esquema FLAT (legacy): {"move_key":{...}, "item_key":{...}}  (no recomendado)

Hace:
1) En nested: elimina "basura" del root (claves fuera de meta/moves/items).
2) Elimina entradas not_found:true que tienen un "equivalente bueno":
   - por compact match (quitar guiones/espacios/puntuación)
   - por alias map explícito (casos irregulares: feint-attack, high-jump-kick, etc.)
3) Opcionalmente escribe el JSON actualizado con --write.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Tuple


ROOT_ALLOWED_KEYS = {"meta", "moves", "items"}


# Casos irregulares (no arreglables con compact-match)
MOVE_ALIAS_MAP = {
    # dataset -> pokeapi
    "faint-attack": "feint-attack",
    "hi-jump-kick": "high-jump-kick",
    "softboiled": "soft-boiled",
    "smellingsalt": "smelling-salts",  # ojo: plural en PokeAPI
}

ITEM_ALIAS_MAP = {
    "king-s-rock": "kings-rock",
}


def compact_key(s: str) -> str:
    """Normaliza una key para comparación flexible."""
    s = s.strip().lower()
    # deja solo letras/números para comparar
    return re.sub(r"[^a-z0-9]+", "", s)


def is_not_found(entry: Any) -> bool:
    return isinstance(entry, dict) and entry.get("not_found") is True


def is_good(entry: Any) -> bool:
    # "good" = existe dict, y not_found no es True
    return isinstance(entry, dict) and entry.get("not_found") is not True


@dataclass(frozen=True)
class Deletion:
    kind: str  # "move" | "item" | "root"
    key: str
    reason: str


def detect_schema(data: Dict[str, Any]) -> str:
    if isinstance(data.get("moves"), dict) and isinstance(data.get("items"), dict):
        return "nested"
    return "flat"


def root_junk_keys(data: Dict[str, Any]) -> List[str]:
    return [k for k in data.keys() if k not in ROOT_ALLOWED_KEYS]


def build_compact_index(d: Dict[str, Any]) -> Dict[str, List[str]]:
    """
    compact_value -> list of keys that share that compact form
    """
    idx: Dict[str, List[str]] = {}
    for k in d.keys():
        ck = compact_key(k)
        idx.setdefault(ck, []).append(k)
    return idx


def find_compact_good_match(bad_key: str, table: Dict[str, Any]) -> str | None:
    """
    Si bad_key (not_found) tiene otro key en table con mismo compact_key y "good", lo devuelve.
    Si hay varios, preferimos uno "good". Si no hay ninguno good, None.
    """
    target = compact_key(bad_key)
    # buscar candidatos
    candidates = [k for k in table.keys() if compact_key(k) == target and k != bad_key]
    good = [k for k in candidates if is_good(table.get(k))]
    return good[0] if good else None


def apply_alias_deletions(
    kind: str, table: Dict[str, Any], alias_map: Dict[str, str]
) -> List[Deletion]:
    deletions: List[Deletion] = []

    for bad, good in alias_map.items():
        if bad in table and is_not_found(table.get(bad)) and good in table and is_good(table.get(good)):
            deletions.append(Deletion(kind=kind, key=bad, reason=f"alias_map keep '{good}'"))
    return deletions


def apply_compact_deletions(kind: str, table: Dict[str, Any]) -> List[Deletion]:
    deletions: List[Deletion] = []
    for k, v in table.items():
        if not is_not_found(v):
            continue
        keep = find_compact_good_match(k, table)
        if keep:
            deletions.append(Deletion(kind=kind, key=k, reason=f"has_good_compact_match keep '{keep}'"))
    return deletions


def apply_root_cleanup(data: Dict[str, Any]) -> List[Deletion]:
    deletions: List[Deletion] = []
    for k in root_junk_keys(data):
        deletions.append(Deletion(kind="root", key=k, reason="remove junk root key (legacy flat dump)"))
    return deletions


def delete_keys(table: Dict[str, Any], keys: List[str]) -> None:
    for k in keys:
        table.pop(k, None)


def recalc_meta(data: Dict[str, Any]) -> None:
    meta = data.get("meta")
    if not isinstance(meta, dict):
        return
    moves = data.get("moves")
    items = data.get("items")
    if isinstance(moves, dict):
        meta["moves_total"] = len(moves)
    if isinstance(items, dict):
        meta["items_total"] = len(items)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, help="Path to moves_items_cache.json")
    ap.add_argument("--write", action="store_true", help="Write changes in place")
    args = ap.parse_args()

    path = Path(args.cache)
    data = json.loads(path.read_text(encoding="utf-8"))

    schema = detect_schema(data)
    print(f"[i] cache schema: {schema}")

    deletions: List[Deletion] = []

    if schema == "nested":
        moves = data.get("moves", {})
        items = data.get("items", {})

        if not isinstance(moves, dict) or not isinstance(items, dict):
            raise SystemExit("[!] Invalid nested schema: moves/items must be objects")

        print(f"[i] moves entries: {len(moves)} | items entries: {len(items)}")

        # 1) root cleanup (elimina la “segunda capa” plana)
        deletions.extend(apply_root_cleanup(data))

        # 2) alias map explicit
        deletions.extend(apply_alias_deletions("move", moves, MOVE_ALIAS_MAP))
        deletions.extend(apply_alias_deletions("item", items, ITEM_ALIAS_MAP))

        # 3) compact-match deletions (guiones/espacios etc.)
        deletions.extend(apply_compact_deletions("move", moves))
        deletions.extend(apply_compact_deletions("item", items))

        # aplicar
        if deletions:
            # root junk
            root_keys = [d.key for d in deletions if d.kind == "root"]
            for k in root_keys:
                data.pop(k, None)

            # moves/items
            move_keys = [d.key for d in deletions if d.kind == "move"]
            item_keys = [d.key for d in deletions if d.kind == "item"]
            delete_keys(moves, move_keys)
            delete_keys(items, item_keys)

        # Recalcular meta
        recalc_meta(data)

    else:
        # Si te interesa, aquí podríamos migrar flat->nested, pero en tu caso ya es nested.
        print("[!] Flat schema detected. This script is mainly intended for nested schema.")
        print("[!] Consider regenerating cache in nested form.")
        return 2

    if not deletions:
        print("[+] No bad entries to delete.")
        return 0

    # mostrar resumen
    print(f"[+] Found {len(deletions)} deletions:")
    for d in deletions:
        print(f"  - ({d.kind}) delete '{d.key}' [{d.reason}]")

    if not args.write:
        print("[dry-run] Not writing. Re-run with --write to apply.")
        return 0

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[+] Updated cache written: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
