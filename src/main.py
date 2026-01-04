from __future__ import annotations

import itertools
import json
import logging
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


# ----------------------------
# Logging
# ----------------------------
LOG_LEVEL = os.environ.get("MB_LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("mb.api")


# ----------------------------
# Settings
# ----------------------------
class Settings:
    """
    Paths are relative to project root by default.
    You can override the base data dir with MB_DATA_DIR.
    """

    def __init__(self) -> None:
        data_dir = os.environ.get("MB_DATA_DIR", "data")
        self.DATA_DIR = Path(data_dir)

        self.SETS_DIR = self.DATA_DIR / "subway_pokemon"
        self.TRAINERS_FILE = self.DATA_DIR / "subway_trainers_set45.json"
        self.POOLS_FILE = self.DATA_DIR / "subway_pools_set45.json"
        self.POOLS_INDEX_FILE = self.DATA_DIR / "subway_pools_index_set45.json"

        # CORS (frontend dev)
        # Example: MB_CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
        cors = os.environ.get("MB_CORS_ORIGINS", "")
        self.CORS_ORIGINS = [x.strip() for x in cors.split(",") if x.strip()]


settings = Settings()


# ----------------------------
# Utils
# ----------------------------
def normalize(s: str) -> str:
    """
    Unicode-friendly normalization:
      - casefold for latin scripts
      - remove diacritics (á -> a) while keeping non-latin scripts intact
      - keep unicode word chars (Japanese/Korean included) and spaces
      - collapse whitespace
    """
    import unicodedata

    s = (s or "").strip()
    if not s:
        return ""

    # casefold works well for latin; harmless for most scripts
    s = s.casefold()

    # Remove diacritics but keep base characters
    s_norm = unicodedata.normalize("NFKD", s)
    s_norm = "".join(ch for ch in s_norm if not unicodedata.combining(ch))

    # Remove punctuation/symbols, keep unicode letters/digits/underscore and spaces
    s_norm = re.sub(r"[^\w\s]+", " ", s_norm, flags=re.UNICODE)
    s_norm = re.sub(r"\s+", " ", s_norm, flags=re.UNICODE).strip()
    return s_norm


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise RuntimeError(f"Missing file: {path}")
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Invalid JSON in {path}: {e}")


def display_name_from_trainer(t: dict) -> str:
    # Prefer Spanish full display name if present; otherwise English full.
    name_es = t.get("name_es")
    if isinstance(name_es, str) and name_es.strip():
        return name_es.strip()
    return (t.get("name_en") or "").strip()


def require_file(path: Path, hint: str) -> None:
    if not path.exists():
        raise RuntimeError(f"Required file missing: {path}\nHint: {hint}")


# ----------------------------
# Data loaders (cached)
# ----------------------------
@lru_cache(maxsize=1)
def load_trainers() -> List[dict]:
    require_file(settings.TRAINERS_FILE, "Run: python src/fetch_subway_trainers_smogon.py")
    data = read_json(settings.TRAINERS_FILE)
    trainers = data.get("trainers", [])
    if not isinstance(trainers, list):
        raise RuntimeError("Invalid trainers JSON: 'trainers' must be a list")
    return trainers


@lru_cache(maxsize=1)
def load_pools() -> Dict[str, dict]:
    require_file(settings.POOLS_FILE, "Run: python src/dedupe_trainer_pools.py")
    data = read_json(settings.POOLS_FILE)
    pools = data.get("pools", [])
    if not isinstance(pools, list):
        raise RuntimeError("Invalid pools JSON: 'pools' must be a list")
    out: Dict[str, dict] = {}
    for p in pools:
        pid = p.get("pool_id")
        if isinstance(pid, str) and pid:
            out[pid] = p
    return out


@lru_cache(maxsize=1)
def load_pools_index() -> dict:
    require_file(settings.POOLS_INDEX_FILE, "Run: python src/build_pools_index.py")
    data = read_json(settings.POOLS_INDEX_FILE)
    if not isinstance(data, dict):
        raise RuntimeError("Invalid pools index JSON: must be an object")
    return data


@lru_cache(maxsize=1)
def load_sets_index_global() -> Dict[str, str]:
    idx = load_pools_index().get("global_id_to_setfile", {})
    if not isinstance(idx, dict):
        raise RuntimeError("Invalid pools index: global_id_to_setfile must be an object")
    return {str(k): str(v) for k, v in idx.items()}


@lru_cache(maxsize=4096)
def load_set_by_global_id(global_id: int) -> dict:
    gid = str(global_id)
    idx = load_sets_index_global()
    fn = idx.get(gid)
    if not fn:
        raise KeyError(f"global_id {global_id} not found in sets index")

    path = settings.SETS_DIR / fn
    return read_json(path)


@lru_cache(maxsize=1)
def build_trainer_search_rows() -> List[dict]:
    """
    Search aliases include:
      - full EN (name_en)
      - full ES (name_es) if present
      - name-only multilingual (trainer["names"][lang]) if present
      - (optional) classes multilingual (trainer["classes"][lang]) if present
    """
    rows: List[dict] = []
    for t in load_trainers():
        name_en = t.get("name_en") or ""
        name_es = t.get("name_es") or ""

        aliases: List[str] = []

        # Full names
        n_en = normalize(name_en)
        if n_en:
            aliases.append(n_en)

        n_es = normalize(name_es) if isinstance(name_es, str) else ""
        if n_es:
            aliases.append(n_es)

        # Name-only in multiple languages
        names_obj = t.get("names")
        if isinstance(names_obj, dict):
            for _, val in names_obj.items():
                if isinstance(val, str) and val.strip():
                    aliases.append(normalize(val))

        # Optional: allow searching by trainer class strings too
        classes_obj = t.get("classes")
        if isinstance(classes_obj, dict):
            for _, val in classes_obj.items():
                if isinstance(val, str) and val.strip():
                    aliases.append(normalize(val))

        # Dedup and remove empties
        aliases = list(dict.fromkeys([a for a in aliases if a]))

        rows.append(
            {
                "trainer_id": t["trainer_id"],
                "name_en": name_en,
                "name_es": name_es if isinstance(name_es, str) else None,
                "display_name": display_name_from_trainer(t),
                "section": t["section"],
                "aliases": aliases,
            }
        )
    return rows


def combos_remaining(pool_ids: List[int], seen: Set[int], team_size: int = 4) -> Tuple[int, Set[int]]:
    pool_sorted = sorted(pool_ids)

    if len(seen) > team_size:
        return 0, set()

    pool_set = set(pool_sorted)
    if not seen.issubset(pool_set):
        return 0, set()

    if len(pool_sorted) < team_size:
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
    name_es: Optional[str] = None
    display_name: str
    section: str


class TrainerDetail(BaseModel):
    trainer_id: str
    name_en: str
    name_es: Optional[str] = None
    display_name: str
    section: str
    pool_id: str
    pool_size: int
    sets: List[dict]

    # Optional extra fields (won't break older clients)
    names: Optional[Dict[str, Optional[str]]] = None
    classes: Optional[Dict[str, Optional[str]]] = None


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
app = FastAPI(title="Battle Subway Helper (B2/W2) - Super Set 4/5", version="1.0.0")

if settings.CORS_ORIGINS:
    logger.info("CORS enabled for: %s", settings.CORS_ORIGINS)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/trainers/search", response_model=List[SearchResult])
def trainers_search(q: str = Query(..., min_length=1), limit: int = 20):
    nq = normalize(q)
    rows = build_trainer_search_rows()
    lim = max(1, min(limit, 50))

    # 1) Prefix matches
    prefix: List[dict] = [r for r in rows if any(a.startswith(nq) for a in r["aliases"])]
    prefix_ids = {r["trainer_id"] for r in prefix}

    # 2) Contains matches (without duplicates)
    contains: List[dict] = []
    if len(prefix) < lim:
        for r in rows:
            if r["trainer_id"] in prefix_ids:
                continue
            if any(nq in a for a in r["aliases"]):
                contains.append(r)

    matches = (prefix + contains)[:lim]
    return [
        SearchResult(
            trainer_id=m["trainer_id"],
            name_en=m["name_en"],
            name_es=m.get("name_es"),
            display_name=m["display_name"],
            section=m["section"],
        )
        for m in matches
    ]


@app.get("/trainers/{trainer_id}", response_model=TrainerDetail)
def trainer_detail(trainer_id: str):
    trainers = load_trainers()
    t = next((x for x in trainers if x.get("trainer_id") == trainer_id), None)
    if not t:
        raise HTTPException(status_code=404, detail="trainer_id not found")

    pools_index = load_pools_index()
    trainer_to_pool = pools_index.get("trainer_to_pool", {})
    pool_id = trainer_to_pool.get(trainer_id)
    if not pool_id:
        raise HTTPException(status_code=500, detail="trainer_to_pool index missing this trainer")

    pool = load_pools().get(pool_id)
    if not pool:
        raise HTTPException(status_code=500, detail="pool_id not found in pools file")

    sets: List[dict] = []
    for gid in pool.get("pool_global_ids", []):
        try:
            sets.append(load_set_by_global_id(int(gid)))
        except KeyError:
            continue

    name_es = t.get("name_es") if isinstance(t.get("name_es"), str) else None
    names = t.get("names") if isinstance(t.get("names"), dict) else None
    classes = t.get("classes") if isinstance(t.get("classes"), dict) else None

    return TrainerDetail(
        trainer_id=t["trainer_id"],
        name_en=t["name_en"],
        name_es=name_es,
        display_name=display_name_from_trainer(t),
        section=t["section"],
        pool_id=pool_id,
        pool_size=len(pool.get("pool_global_ids", [])),
        sets=sets,
        names=names,
        classes=classes,
    )


@app.post("/pools/{pool_id}/filter", response_model=FilterResponse)
def pool_filter(pool_id: str, req: FilterRequest):
    pool = load_pools().get(pool_id)
    if not pool:
        raise HTTPException(status_code=404, detail="pool_id not found")

    pool_ids = [int(x) for x in pool.get("pool_global_ids", [])]
    seen = set(int(x) for x in req.seen_global_ids)

    num, union = combos_remaining(pool_ids, seen, team_size=4)
    remaining = [] if num == 0 else sorted(list(union - seen))
    remaining_sets = [load_set_by_global_id(gid) for gid in remaining]

    return FilterResponse(
        pool_id=pool_id,
        seen_global_ids=sorted(list(seen)),
        num_possible_teams=num,
        possible_remaining_global_ids=remaining,
        possible_remaining_sets=remaining_sets,
    )


# Optional: run via `python -m src.main`
if __name__ == "__main__":
    import argparse
    import uvicorn

    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--reload", action="store_true")
    args = ap.parse_args()

    uvicorn.run("src.main:app", host=args.host, port=args.port, reload=args.reload)
