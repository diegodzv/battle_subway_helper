from __future__ import annotations

import itertools
import json
import os
import re
from functools import lru_cache
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel


# ----------------------------
# Config
# ----------------------------
DATA_DIR = os.environ.get("MB_DATA_DIR", "data")
SETS_DIR = os.path.join(DATA_DIR, "subway_pokemon")
TRAINERS_FILE = os.path.join(DATA_DIR, "subway_trainers_set45.json")
POOLS_FILE = os.path.join(DATA_DIR, "subway_pools_set45.json")
POOLS_INDEX_FILE = os.path.join(DATA_DIR, "subway_pools_index_set45.json")


# ----------------------------
# Utils
# ----------------------------
def normalize(s: str) -> str:
    s = s.strip().lower()
    try:
        import unicodedata

        s = unicodedata.normalize("NFKD", s)
        s = "".join(ch for ch in s if not unicodedata.combining(ch))
    except Exception:
        pass
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def read_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_trainers() -> List[dict]:
    data = read_json(TRAINERS_FILE)
    return data.get("trainers", [])


@lru_cache(maxsize=1)
def load_pools() -> Dict[str, dict]:
    data = read_json(POOLS_FILE)
    pools = data.get("pools", [])
    return {p["pool_id"]: p for p in pools}


@lru_cache(maxsize=1)
def load_pools_index() -> dict:
    return read_json(POOLS_INDEX_FILE)


@lru_cache(maxsize=1)
def load_sets_index_global() -> Dict[str, str]:
    # global_id -> filename
    idx = load_pools_index().get("global_id_to_setfile", {})
    return {str(k): v for k, v in idx.items()}


@lru_cache(maxsize=1)
def load_set_by_global_id(global_id: int) -> dict:
    gid = str(global_id)
    idx = load_sets_index_global()
    if gid not in idx:
        raise KeyError(f"global_id {global_id} not found in sets index")
    fn = idx[gid]
    path = os.path.join(SETS_DIR, fn)
    return read_json(path)


@lru_cache(maxsize=1)
def build_trainer_search_rows() -> List[dict]:
    """
    Crea una lista ligera para buscar:
      trainer_id, name_en, section, alias_en
    Luego añadiremos alias_es cuando tengas el mapping.
    """
    rows = []
    for t in load_trainers():
        rows.append(
            {
                "trainer_id": t["trainer_id"],
                "name_en": t["name_en"],
                "section": t["section"],
                "alias": normalize(t["name_en"]),
            }
        )
    return rows


def combos_remaining(pool_ids: List[int], seen: Set[int], team_size: int = 4) -> Tuple[int, Set[int]]:
    """
    Dado un pool (lista de global_ids) y un conjunto 'seen',
    calcula:
      - num_combos compatibles (equipos posibles de tamaño team_size)
      - possible_union: unión de ids que aparecen en al menos un combo compatible
    """
    pool_sorted = sorted(pool_ids)
    if len(seen) > team_size:
        return 0, set()

    # Si algún visto no está en el pool, no hay combos
    if not seen.issubset(set(pool_sorted)):
        return 0, set()

    # Pequeñas optimizaciones:
    # - Si pool muy grande (80-90), C(90,4)=2.5M => todavía manejable en Python si no lo haces 100 veces/seg.
    # - Aun así, filtramos rápido: si seen no vacío, sólo iteramos combinaciones que lo incluyan
    #   (pero generar combinaciones con inclusión directa es más complejo; lo hacemos con filtro, que suele ir bien
    #    porque en uso real seen crece rápido).
    n = len(pool_sorted)
    if n < team_size:
        return 0, set()

    count = 0
    union: Set[int] = set()

    for comb in itertools.combinations(pool_sorted, team_size):
        if seen and not seen.issubset(comb):
            continue
        count += 1
        union.update(comb)

    return count, union


# ----------------------------
# API Models
# ----------------------------
class SearchResult(BaseModel):
    trainer_id: str
    name_en: str
    section: str


class TrainerDetail(BaseModel):
    trainer_id: str
    name_en: str
    section: str
    pool_id: str
    pool_size: int
    # devolvemos los sets completos del pool (para pintar sprites y detalles)
    sets: List[dict]


class FilterRequest(BaseModel):
    seen_global_ids: List[int]


class FilterResponse(BaseModel):
    pool_id: str
    seen_global_ids: List[int]
    num_possible_teams: int
    possible_remaining_global_ids: List[int]
    possible_remaining_sets: List[dict]


# ----------------------------
# App
# ----------------------------
app = FastAPI(title="Metro Batalla BW2 - Set 4/5", version="0.1.0")


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/trainers/search", response_model=List[SearchResult])
def trainers_search(q: str = Query(..., min_length=1), limit: int = 20):
    nq = normalize(q)
    rows = build_trainer_search_rows()

    # prefijo + contains (simple, rápido)
    matches = [r for r in rows if r["alias"].startswith(nq)]
    if len(matches) < limit:
        extra = [r for r in rows if nq in r["alias"] and r not in matches]
        matches.extend(extra)

    matches = matches[: max(1, min(limit, 50))]
    return [SearchResult(trainer_id=m["trainer_id"], name_en=m["name_en"], section=m["section"]) for m in matches]


@app.get("/trainers/{trainer_id}", response_model=TrainerDetail)
def trainer_detail(trainer_id: str):
    trainers = load_trainers()
    t = next((x for x in trainers if x["trainer_id"] == trainer_id), None)
    if not t:
        raise HTTPException(status_code=404, detail="trainer_id not found")

    pools_index = load_pools_index()
    trainer_to_pool = pools_index.get("trainer_to_pool", {})
    pool_id = trainer_to_pool.get(trainer_id)
    if not pool_id:
        raise HTTPException(status_code=500, detail="trainer_to_pool index missing this trainer")

    pools = load_pools()
    pool = pools.get(pool_id)
    if not pool:
        raise HTTPException(status_code=500, detail="pool_id not found in pools file")

    # Cargar sets del pool
    sets = []
    for gid in pool["pool_global_ids"]:
        try:
            sets.append(load_set_by_global_id(int(gid)))
        except KeyError:
            # si faltase algún set (no debería)
            continue

    return TrainerDetail(
        trainer_id=t["trainer_id"],
        name_en=t["name_en"],
        section=t["section"],
        pool_id=pool_id,
        pool_size=len(pool["pool_global_ids"]),
        sets=sets,
    )


@app.post("/pools/{pool_id}/filter", response_model=FilterResponse)
def pool_filter(pool_id: str, req: FilterRequest):
    pools = load_pools()
    pool = pools.get(pool_id)
    if not pool:
        raise HTTPException(status_code=404, detail="pool_id not found")

    pool_ids = [int(x) for x in pool["pool_global_ids"]]
    seen = set(int(x) for x in req.seen_global_ids)

    num, union = combos_remaining(pool_ids, seen, team_size=4)
    if num == 0:
        remaining = []
    else:
        remaining = sorted(list(union - seen))

    # sets restantes completos para UI
    remaining_sets = []
    for gid in remaining:
        remaining_sets.append(load_set_by_global_id(gid))

    return FilterResponse(
        pool_id=pool_id,
        seen_global_ids=sorted(list(seen)),
        num_possible_teams=num,
        possible_remaining_global_ids=remaining,
        possible_remaining_sets=remaining_sets,
    )
