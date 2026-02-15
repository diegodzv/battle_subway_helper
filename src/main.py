from __future__ import annotations

import json
import logging
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


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

        # New: Gen5 pokedex files
        self.POKEDEX_GEN5_FILE = self.DATA_DIR / "pokedex_gen5.json"
        self.POKEDEX_GEN5_INDEX_FILE = self.DATA_DIR / "pokedex_gen5_index.json"

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

    s = s.casefold()

    s_norm = unicodedata.normalize("NFKD", s)
    s_norm = "".join(ch for ch in s_norm if not unicodedata.combining(ch))

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
    name_es = t.get("name_es")
    if isinstance(name_es, str) and name_es.strip():
        return name_es.strip()
    return (t.get("name_en") or "").strip()


def require_file(path: Path, hint: str) -> None:
    if not path.exists():
        raise RuntimeError(f"Required file missing: {path}\nHint: {hint}")


def set_display_name(set_obj: dict) -> str:
    """
    Matches frontend logic:
      - if variant_index exists and is truthy => species-<variant_index>
      - else species
    """
    if not isinstance(set_obj, dict):
        return ""
    species = (set_obj.get("species") or "").strip()
    v = set_obj.get("variant_index")
    if isinstance(v, int) and v != 0:
        return f"{species}-{v}"
    return species


def clamp_int(x: int, lo: int, hi: int) -> int:
    try:
        n = int(x)
    except Exception:
        n = lo
    return max(lo, min(hi, n))


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


@lru_cache(maxsize=1)
def load_moves_items_cache() -> dict:
    path = settings.DATA_DIR / "moves_items_cache.json"
    require_file(path, "Run: python src/fetch_moves_items_pokeapi_cache.py")
    data = read_json(path)
    if not isinstance(data, dict):
        raise RuntimeError("Invalid moves_items_cache.json")
    return data


@lru_cache(maxsize=1)
def load_pokedex_gen5_index() -> dict:
    path = settings.POKEDEX_GEN5_INDEX_FILE
    require_file(path, "Run: python src/fetch_pokedex_gen5_pokeapi.py")
    data = read_json(path)
    if not isinstance(data, dict):
        raise RuntimeError("Invalid pokedex_gen5_index.json")
    return data


@lru_cache(maxsize=1)
def load_pokedex_gen5_full() -> dict:
    path = settings.POKEDEX_GEN5_FILE
    require_file(path, "Run: python src/fetch_pokedex_gen5_pokeapi.py")
    data = read_json(path)
    if not isinstance(data, dict):
        raise RuntimeError("Invalid pokedex_gen5.json")
    return data


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
    rows: List[dict] = []
    for t in load_trainers():
        name_en = t.get("name_en") or ""
        name_es = t.get("name_es") or ""

        aliases: List[str] = []

        n_en = normalize(name_en)
        if n_en:
            aliases.append(n_en)

        n_es = normalize(name_es) if isinstance(name_es, str) else ""
        if n_es:
            aliases.append(n_es)

        names_obj = t.get("names")
        if isinstance(names_obj, dict):
            for _, val in names_obj.items():
                if isinstance(val, str) and val.strip():
                    aliases.append(normalize(val))

        classes_obj = t.get("classes")
        if isinstance(classes_obj, dict):
            for _, val in classes_obj.items():
                if isinstance(val, str) and val.strip():
                    aliases.append(normalize(val))

        aliases = list(dict.fromkeys([a for a in aliases if a]))

        rows.append(
            {
                "trainer_id": t["trainer_id"],
                "name_en": name_en,
                "name_es": name_es,
                "display_name": display_name_from_trainer(t),
                "section": t["section"],
                "aliases": aliases,
            }
        )
    return rows


@lru_cache(maxsize=1)
def build_pokedex_gen5_search_rows() -> List[dict]:
    data = load_pokedex_gen5_index()
    arr = data.get("pokemon", [])
    if not isinstance(arr, list):
        raise RuntimeError("Invalid pokedex_gen5_index.json: pokemon must be a list")

    rows: List[dict] = []
    for p in arr:
        if not isinstance(p, dict):
            continue
        dex = p.get("dex")
        slug = p.get("slug") or ""
        name_en = p.get("name_en") or slug
        name_es = p.get("name_es")
        types = p.get("types") if isinstance(p.get("types"), list) else []

        aliases: List[str] = []
        if isinstance(slug, str) and slug.strip():
            aliases.append(normalize(slug))
        if isinstance(name_en, str) and name_en.strip():
            aliases.append(normalize(name_en))
        if isinstance(name_es, str) and name_es.strip():
            aliases.append(normalize(name_es))

        aliases = list(dict.fromkeys([a for a in aliases if a]))

        if isinstance(dex, int):
            rows.append(
                {
                    "dex": dex,
                    "slug": slug,
                    "name_en": name_en,
                    "name_es": name_es if isinstance(name_es, str) else None,
                    "types": types,
                    "aliases": aliases,
                }
            )
    return rows


@lru_cache(maxsize=2048)
def get_trainer_pool_ids(trainer_id: str) -> List[int]:
    pools_index = load_pools_index()
    trainer_to_pool = pools_index.get("trainer_to_pool", {})
    pool_id = trainer_to_pool.get(trainer_id)
    if not pool_id:
        raise KeyError("trainer_to_pool index missing this trainer")
    pool = load_pools().get(pool_id)
    if not pool:
        raise KeyError("pool_id not found in pools file")

    gids_raw = pool.get("pool_global_ids", [])
    if not isinstance(gids_raw, list):
        return []
    out: List[int] = []
    for x in gids_raw:
        try:
            out.append(int(x))
        except Exception:
            continue
    return out


@lru_cache(maxsize=2048)
def build_trainer_pool_search_rows(trainer_id: str) -> List[dict]:
    """
    Minimal searchable rows limited to a trainer pool.
    """
    gids = get_trainer_pool_ids(trainer_id)
    rows: List[dict] = []
    for gid in gids:
        try:
            s = load_set_by_global_id(gid)
        except Exception:
            continue
        disp = set_display_name(s)
        aliases = [normalize(disp), normalize(s.get("species") or "")]
        aliases = list(dict.fromkeys([a for a in aliases if a]))
        rows.append(
            {
                "global_id": gid,
                "display": disp,
                "species": (s.get("species") or "").strip(),
                "dex_number": s.get("dex_number"),
                "sprite_url_pokeapi": s.get("sprite_url_pokeapi"),
                "aliases": aliases,
            }
        )
    return rows


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
    names: Optional[Dict[str, Optional[str]]] = None
    classes: Optional[Dict[str, Optional[str]]] = None


class PokedexSearchResult(BaseModel):
    dex: int
    slug: str
    name_en: str
    name_es: Optional[str] = None
    types: List[str] = []


class TrainerPoolMon(BaseModel):
    global_id: int
    display: str
    species: str
    dex_number: Optional[int] = None
    sprite_url_pokeapi: Optional[str] = None


# ----------------------------
# Damage Calculator (Gen 5) - Backend Engine v1
# ----------------------------
STAT_KEYS = ("hp", "atk", "def", "spa", "spd", "spe")


class CalcStats(BaseModel):
    hp: int
    atk: int
    def_: int = Field(..., alias="def")
    spa: int
    spd: int
    spe: int

    def get(self, k: str) -> int:
        if k == "def":
            return int(self.def_)
        return int(getattr(self, k))


class CalcBoosts(BaseModel):
    atk: int = 0
    def_: int = Field(0, alias="def")
    spa: int = 0
    spd: int = 0
    spe: int = 0

    def get(self, k: str) -> int:
        if k == "def":
            return int(self.def_)
        return int(getattr(self, k))


class CalcPokemon(BaseModel):
    # Either provide explicit stats/types/item/ability, OR provide subway_global_id (enemy pick, etc).
    subway_global_id: Optional[int] = None

    name: Optional[str] = None
    level: int = 50  # fixed, but we accept it in payload and clamp anyway
    types: List[str] = []
    ability: Optional[str] = None
    item: Optional[str] = None

    stats: Optional[CalcStats] = None  # final stats at Lv50
    boosts: CalcBoosts = Field(default_factory=CalcBoosts)

    # Remaining HP: current / max. If omitted, we assume full.
    current_hp: Optional[int] = None

    def materialize_from_set(self) -> "CalcPokemon":
        if self.subway_global_id is None:
            return self

        try:
            s = load_set_by_global_id(int(self.subway_global_id))
        except KeyError:
            raise HTTPException(status_code=404, detail="subway_global_id not found")
        except Exception:
            raise HTTPException(status_code=500, detail="could not load subway_global_id")

        stats50 = s.get("stats_lv50") or {}
        # dataset uses HP/Atk/Def/SpA/SpD/Spe keys
        try:
            st = CalcStats(
                hp=int(stats50.get("HP", 0)),
                atk=int(stats50.get("Atk", 0)),
                **{"def": int(stats50.get("Def", 0))},
                spa=int(stats50.get("SpA", 0)),
                spd=int(stats50.get("SpD", 0)),
                spe=int(stats50.get("Spe", 0)),
            )
        except Exception:
            raise HTTPException(status_code=500, detail="invalid stats_lv50 in dataset")

        types = s.get("types") if isinstance(s.get("types"), list) else []
        ability = s.get("ability") or s.get("ability_name") or s.get("ability_en")
        item = s.get("item")

        name = set_display_name(s) or s.get("species") or str(self.subway_global_id)

        out = CalcPokemon(
            subway_global_id=int(self.subway_global_id),
            name=str(name),
            level=50,
            types=[str(t).lower() for t in types if isinstance(t, str)],
            ability=str(ability) if isinstance(ability, str) and ability.strip() else None,
            item=str(item) if isinstance(item, str) and item.strip() else None,
            stats=st,
            boosts=self.boosts,
            current_hp=self.current_hp,
        )
        return out


class CalcField(BaseModel):
    format: str = "singles"  # "singles" | "doubles"
    weather: str = "none"  # "none" | "sun" | "rain" | "sand" | "hail"
    wonder_room: bool = False
    gravity: bool = False


class CalcSideConditions(BaseModel):
    reflect: bool = False
    light_screen: bool = False
    helping_hand: bool = False  # doubles-only
    friend_guard: bool = False  # doubles-only


class DamageRequest(BaseModel):
    attacker: CalcPokemon
    defender: CalcPokemon
    move_slug: str
    is_crit: bool = False
    target_is_switching: bool = False  # for Pursuit
    field: CalcField = Field(default_factory=CalcField)
    atk_side: CalcSideConditions = Field(default_factory=CalcSideConditions)
    def_side: CalcSideConditions = Field(default_factory=CalcSideConditions)


class DamageResponse(BaseModel):
    move_slug: str
    category: str
    move_type: str
    power: int
    effectiveness: float
    stab: float
    min_damage: int
    max_damage: int
    min_percent_maxhp: float
    max_percent_maxhp: float
    rolls: List[int]
    guaranteed_ohko_on_remaining: bool
    possible_ohko_on_remaining: bool


# ---- Gen 5 type chart ----
# multipliers: 0, 0.5, 1, 2
TYPE_CHART: Dict[str, Dict[str, float]] = {
    "normal": {"rock": 0.5, "ghost": 0.0, "steel": 0.5},
    "fire": {"fire": 0.5, "water": 0.5, "grass": 2.0, "ice": 2.0, "bug": 2.0, "rock": 0.5, "dragon": 0.5, "steel": 2.0},
    "water": {"fire": 2.0, "water": 0.5, "grass": 0.5, "ground": 2.0, "rock": 2.0, "dragon": 0.5},
    "electric": {"water": 2.0, "electric": 0.5, "grass": 0.5, "ground": 0.0, "flying": 2.0, "dragon": 0.5},
    "grass": {"fire": 0.5, "water": 2.0, "grass": 0.5, "poison": 0.5, "ground": 2.0, "flying": 0.5, "bug": 0.5, "rock": 2.0, "dragon": 0.5, "steel": 0.5},
    "ice": {"fire": 0.5, "water": 0.5, "grass": 2.0, "ice": 0.5, "ground": 2.0, "flying": 2.0, "dragon": 2.0, "steel": 0.5},
    "fighting": {"normal": 2.0, "ice": 2.0, "rock": 2.0, "dark": 2.0, "steel": 2.0, "poison": 0.5, "flying": 0.5, "psychic": 0.5, "bug": 0.5, "ghost": 0.0, "fairy": 1.0},
    "poison": {"grass": 2.0, "poison": 0.5, "ground": 0.5, "rock": 0.5, "ghost": 0.5, "steel": 0.0},
    "ground": {"fire": 2.0, "electric": 2.0, "grass": 0.5, "poison": 2.0, "flying": 0.0, "bug": 0.5, "rock": 2.0, "steel": 2.0},
    "flying": {"electric": 0.5, "grass": 2.0, "fighting": 2.0, "bug": 2.0, "rock": 0.5, "steel": 0.5},
    "psychic": {"fighting": 2.0, "poison": 2.0, "psychic": 0.5, "dark": 0.0, "steel": 0.5},
    "bug": {"fire": 0.5, "grass": 2.0, "fighting": 0.5, "poison": 0.5, "flying": 0.5, "psychic": 2.0, "ghost": 0.5, "dark": 2.0, "steel": 0.5},
    "rock": {"fire": 2.0, "ice": 2.0, "fighting": 0.5, "ground": 0.5, "flying": 2.0, "bug": 2.0, "steel": 0.5},
    "ghost": {"normal": 0.0, "psychic": 2.0, "ghost": 2.0, "dark": 0.5, "steel": 0.5},
    "dragon": {"dragon": 2.0, "steel": 0.5},
    "dark": {"fighting": 0.5, "psychic": 2.0, "ghost": 2.0, "dark": 0.5, "steel": 0.5},
    "steel": {"fire": 0.5, "water": 0.5, "electric": 0.5, "ice": 2.0, "rock": 2.0, "fairy": 1.0, "steel": 0.5},
    "fairy": {},  # not in Gen 5; kept for safety (no effect)
}


def type_effectiveness(move_type: str, def_types: List[str]) -> float:
    mt = (move_type or "").lower()
    mult = 1.0
    row = TYPE_CHART.get(mt, {})
    for dt in def_types or []:
        d = (dt or "").lower()
        mult *= float(row.get(d, 1.0))
    return mult


def stage_multiplier(stage: int, is_attacker: bool) -> float:
    """
    Standard Gen 5 stage multipliers for stats (Atk/Def/SpA/SpD/Spe).
    stage in [-6..+6]
    """
    s = clamp_int(stage, -6, 6)
    if s == 0:
        return 1.0
    if s > 0:
        return (2.0 + s) / 2.0
    # negative
    return 2.0 / (2.0 + abs(s))


def apply_stages(stat: int, stage: int) -> int:
    return max(1, int(stat * stage_multiplier(stage, True)))


def is_spread_move(move_entry: dict) -> bool:
    # We don't have full targeting metadata in our cache; keep it conservative.
    # Frontend can later send an explicit flag if you want to refine it.
    # For now: common spread moves heuristic by slug.
    slug = (move_entry.get("slug") or "").lower()
    return slug in {
        "surf",
        "earthquake",
        "discharge",
        "heat-wave",
        "rock-slide",
        "blizzard",
        "icy-wind",
        "snarl",
        "muddy-water",
        "eruption",
        "lava-plume",
    }


def get_move_entry_or_404(slug: str) -> dict:
    cache = load_moves_items_cache()
    moves = cache.get("moves")
    if not isinstance(moves, dict):
        raise HTTPException(status_code=500, detail="moves cache missing 'moves' object")
    entry = moves.get(slug)
    if not isinstance(entry, dict):
        raise HTTPException(status_code=404, detail="move_slug not found in move cache")
    # attach slug for convenience
    entry = dict(entry)
    entry["slug"] = slug
    return entry


def gen5_base_damage(level: int, power: int, A: int, D: int) -> int:
    # floor(floor(floor((2L/5+2)*P*A/D)/50)+2)
    L = max(1, int(level))
    P = max(1, int(power))
    a = max(1, int(A))
    d = max(1, int(D))
    x = (2 * L) // 5 + 2
    x = (x * P * a) // d
    x = x // 50
    return x + 2


def item_attack_modifier(item: Optional[str], category: str) -> float:
    it = (item or "").strip().lower()
    if not it:
        return 1.0
    if it in {"choice band"} and category == "physical":
        return 1.5
    if it in {"choice specs"} and category == "special":
        return 1.5
    if it in {"muscle band"} and category == "physical":
        return 1.1
    if it in {"wise glasses"} and category == "special":
        return 1.1
    return 1.0


def item_final_modifier(item: Optional[str], effectiveness: float) -> float:
    it = (item or "").strip().lower()
    if not it:
        return 1.0
    if it == "life orb":
        return 1.3
    if it == "expert belt" and effectiveness > 1.0:
        return 1.2
    return 1.0


def ability_attack_modifier(ability: Optional[str], category: str, move_type: str, attacker_hp: int, attacker_max_hp: int, power: int) -> float:
    ab = (ability or "").strip().lower()
    if not ab:
        return 1.0

    # Huge Power / Pure Power
    if ab in {"huge power", "pure power"} and category == "physical":
        return 2.0

    # Technician
    if ab == "technician" and power <= 60:
        return 1.5

    # Starter "pinch" abilities (<= 1/3 HP)
    if attacker_max_hp > 0 and attacker_hp * 3 <= attacker_max_hp:
        if ab == "blaze" and move_type == "fire":
            return 1.5
        if ab == "torrent" and move_type == "water":
            return 1.5
        if ab == "overgrow" and move_type == "grass":
            return 1.5
        if ab == "swarm" and move_type == "bug":
            return 1.5

    return 1.0


def ability_defense_modifier(ability: Optional[str], defender_hp: int, defender_max_hp: int) -> float:
    ab = (ability or "").strip().lower()
    if not ab:
        return 1.0
    # Multiscale (Gen 5): halves damage at full HP
    if ab == "multiscale" and defender_hp >= defender_max_hp > 0:
        return 0.5
    return 1.0


def stab_modifier(ability: Optional[str], move_type: str, attacker_types: List[str]) -> float:
    mt = (move_type or "").lower()
    at = [str(x).lower() for x in (attacker_types or [])]
    if mt and mt in at:
        ab = (ability or "").strip().lower()
        if ab == "adaptability":
            return 2.0
        return 1.5
    return 1.0


def weather_modifier(weather: str, move_type: str) -> float:
    w = (weather or "none").lower()
    mt = (move_type or "").lower()
    if w == "sun":
        if mt == "fire":
            return 1.5
        if mt == "water":
            return 0.5
    if w == "rain":
        if mt == "water":
            return 1.5
        if mt == "fire":
            return 0.5
    return 1.0


def screen_modifier(is_crit: bool, category: str, reflect: bool, light_screen: bool, fmt: str) -> float:
    if is_crit:
        return 1.0  # crit ignores screens in Gen 5
    f = (fmt or "singles").lower()
    is_doubles = f == "doubles"
    if category == "physical" and reflect:
        return (2.0 / 3.0) if is_doubles else 0.5
    if category == "special" and light_screen:
        return (2.0 / 3.0) if is_doubles else 0.5
    return 1.0


def doubles_spread_modifier(fmt: str, is_spread: bool) -> float:
    if (fmt or "singles").lower() != "doubles":
        return 1.0
    return 0.75 if is_spread else 1.0


def helping_hand_modifier(fmt: str, helping_hand: bool) -> float:
    if (fmt or "singles").lower() != "doubles":
        return 1.0
    return 1.5 if helping_hand else 1.0


def friend_guard_modifier(fmt: str, friend_guard: bool) -> float:
    if (fmt or "singles").lower() != "doubles":
        return 1.0
    return 0.75 if friend_guard else 1.0


def apply_crit_stage_rules(is_crit: bool, atk_stage: int, def_stage: int) -> Tuple[int, int]:
    """
    Gen 5 crit behavior relevant to stages:
      - ignores negative attack stages (treat as 0 if attacker stage < 0)
      - ignores positive defense stages (treat as 0 if defender stage > 0)
    """
    if not is_crit:
        return atk_stage, def_stage
    a = max(0, atk_stage)
    d = min(0, def_stage)
    return a, d


def compute_damage(req: DamageRequest) -> DamageResponse:
    attacker = req.attacker.materialize_from_set()
    defender = req.defender.materialize_from_set()

    if attacker.stats is None or defender.stats is None:
        raise HTTPException(status_code=400, detail="attacker.stats and defender.stats required (or subway_global_id)")

    level = clamp_int(attacker.level, 50, 50)  # fixed Gen 5 Subway default
    fmt = (req.field.format or "singles").lower()

    move_slug = (req.move_slug or "").strip().lower()
    if not move_slug:
        raise HTTPException(status_code=400, detail="move_slug required")

    move = get_move_entry_or_404(move_slug)
    category = (move.get("damage_class") or "").lower()
    if category not in {"physical", "special"}:
        # status moves do no damage
        return DamageResponse(
            move_slug=move_slug,
            category=category or "status",
            move_type=str(move.get("type") or "unknown").lower(),
            power=0,
            effectiveness=1.0,
            stab=1.0,
            min_damage=0,
            max_damage=0,
            min_percent_maxhp=0.0,
            max_percent_maxhp=0.0,
            rolls=[0] * 16,
            guaranteed_ohko_on_remaining=False,
            possible_ohko_on_remaining=False,
        )

    move_type = str(move.get("type") or "unknown").lower()
    base_power = move.get("power")
    power = int(base_power) if isinstance(base_power, (int, float)) else 0
    if power <= 0:
        # treat as 0 damage (e.g. Counter/Mirror Coat not supported v1)
        return DamageResponse(
            move_slug=move_slug,
            category=category,
            move_type=move_type,
            power=0,
            effectiveness=1.0,
            stab=1.0,
            min_damage=0,
            max_damage=0,
            min_percent_maxhp=0.0,
            max_percent_maxhp=0.0,
            rolls=[0] * 16,
            guaranteed_ohko_on_remaining=False,
            possible_ohko_on_remaining=False,
        )

    # Pursuit switching doubles power
    if req.target_is_switching and move_slug == "pursuit":
        power *= 2

    # Choose relevant stats
    atk_stat_key = "atk" if category == "physical" else "spa"
    def_stat_key = "def" if category == "physical" else "spd"

    atk_stage = attacker.boosts.get(atk_stat_key)
    def_stage = defender.boosts.get(def_stat_key)

    atk_stage2, def_stage2 = apply_crit_stage_rules(req.is_crit, atk_stage, def_stage)

    A0 = attacker.stats.get(atk_stat_key)
    D0 = defender.stats.get(def_stat_key)

    A = apply_stages(A0, atk_stage2)
    D = apply_stages(D0, def_stage2)

    # attacker HP for ability pinch checks
    atk_max_hp = int(attacker.stats.hp)
    atk_cur_hp = int(attacker.current_hp) if attacker.current_hp is not None else atk_max_hp
    atk_cur_hp = clamp_int(atk_cur_hp, 0, atk_max_hp)

    def_max_hp = int(defender.stats.hp)
    def_cur_hp = int(defender.current_hp) if defender.current_hp is not None else def_max_hp
    def_cur_hp = clamp_int(def_cur_hp, 0, def_max_hp)

    # Base damage
    base = gen5_base_damage(level=level, power=power, A=A, D=D)

    # Modifiers
    eff = type_effectiveness(move_type, defender.types)
    stab = stab_modifier(attacker.ability, move_type, attacker.types)
    weather = weather_modifier(req.field.weather, move_type)
    crit = 2.0 if req.is_crit else 1.0

    # Item/ability v1
    atk_item_mod = item_attack_modifier(attacker.item, category)
    atk_ability_mod = ability_attack_modifier(
        attacker.ability, category, move_type, attacker_hp=atk_cur_hp, attacker_max_hp=atk_max_hp, power=power
    )
    def_ability_mod = ability_defense_modifier(defender.ability, defender_hp=def_cur_hp, defender_max_hp=def_max_hp)

    screens = screen_modifier(
        is_crit=req.is_crit,
        category=category,
        reflect=req.def_side.reflect,
        light_screen=req.def_side.light_screen,
        fmt=fmt,
    )

    spread = doubles_spread_modifier(fmt, is_spread_move(move))
    helping = helping_hand_modifier(fmt, req.atk_side.helping_hand)
    friendg = friend_guard_modifier(fmt, req.def_side.friend_guard)

    final_item_mod = item_final_modifier(attacker.item, eff)

    # Random rolls: 16 values 85..100 inclusive
    rolls = []
    for r in range(85, 101):
        mod = 1.0
        mod *= spread
        mod *= weather
        mod *= crit
        mod *= (r / 100.0)
        mod *= stab
        mod *= eff
        mod *= atk_item_mod
        mod *= atk_ability_mod
        mod *= final_item_mod
        mod *= screens
        mod *= friendg
        mod *= def_ability_mod
        mod *= helping

        dmg = int(base * mod)
        if dmg < 1:
            dmg = 1
        rolls.append(dmg)

    min_dmg = min(rolls) if rolls else 0
    max_dmg = max(rolls) if rolls else 0

    min_pct_max = round((min_dmg / def_max_hp) * 100.0, 1) if def_max_hp > 0 else 0.0
    max_pct_max = round((max_dmg / def_max_hp) * 100.0, 1) if def_max_hp > 0 else 0.0

    guaranteed_ohko = def_cur_hp > 0 and min_dmg >= def_cur_hp
    possible_ohko = def_cur_hp > 0 and max_dmg >= def_cur_hp

    return DamageResponse(
        move_slug=move_slug,
        category=category,
        move_type=move_type,
        power=power,
        effectiveness=float(eff),
        stab=float(stab),
        min_damage=min_dmg,
        max_damage=max_dmg,
        min_percent_maxhp=min_pct_max,
        max_percent_maxhp=max_pct_max,
        rolls=rolls,
        guaranteed_ohko_on_remaining=bool(guaranteed_ohko),
        possible_ohko_on_remaining=bool(possible_ohko),
    )


# ----------------------------
# App
# ----------------------------
app = FastAPI(title="Battle Subway Helper (B2/W2) - Super Set 4/5", version="1.1.0")

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


@app.get("/moves/cache")
def moves_cache():
    return load_moves_items_cache()


@app.get("/pokedex/gen5/index")
def pokedex_gen5_index():
    return load_pokedex_gen5_index()


@app.get("/pokedex/gen5/search", response_model=List[PokedexSearchResult])
def pokedex_gen5_search(q: str = Query(..., min_length=1), limit: int = 20):
    nq = normalize(q)
    rows = build_pokedex_gen5_search_rows()
    lim = max(1, min(limit, 50))

    prefix = [r for r in rows if any(a.startswith(nq) for a in r["aliases"])]
    prefix_ids = {r["dex"] for r in prefix}

    contains: List[dict] = []
    if len(prefix) < lim:
        for r in rows:
            if r["dex"] in prefix_ids:
                continue
            if any(nq in a for a in r["aliases"]):
                contains.append(r)

    matches = (prefix + contains)[:lim]
    return [
        PokedexSearchResult(
            dex=m["dex"],
            slug=m["slug"],
            name_en=m["name_en"],
            name_es=m.get("name_es"),
            types=m.get("types") or [],
        )
        for m in matches
    ]


@app.get("/pokedex/gen5/{dex}")
def pokedex_gen5_detail(dex: int):
    data = load_pokedex_gen5_full()
    pokemon = data.get("pokemon", {})
    if not isinstance(pokemon, dict):
        raise HTTPException(status_code=500, detail="Invalid pokedex_gen5.json structure")
    entry = pokemon.get(str(dex))
    if not isinstance(entry, dict) or entry.get("not_found") is True:
        raise HTTPException(status_code=404, detail="dex not found")
    return entry


@app.get("/trainers/search", response_model=List[SearchResult])
def trainers_search(q: str = Query(..., min_length=1), limit: int = 20):
    nq = normalize(q)
    rows = build_trainer_search_rows()
    lim = max(1, min(limit, 50))

    prefix: List[dict] = [r for r in rows if any(a.startswith(nq) for a in r["aliases"])]
    prefix_ids = {r["trainer_id"] for r in prefix}

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

    return TrainerDetail(
        trainer_id=t["trainer_id"],
        name_en=t["name_en"],
        name_es=t.get("name_es") if isinstance(t.get("name_es"), str) else None,
        display_name=display_name_from_trainer(t),
        section=t["section"],
        pool_id=pool_id,
        pool_size=len(pool.get("pool_global_ids", [])),
        sets=sets,
        names=t.get("names") if isinstance(t.get("names"), dict) else None,
        classes=t.get("classes") if isinstance(t.get("classes"), dict) else None,
    )


# ----------------------------
# Calculator-support endpoints (pool-limited enemy picking)
# ----------------------------
@app.get("/subway/trainer/{trainer_id}/pool", response_model=List[TrainerPoolMon])
def subway_trainer_pool(trainer_id: str):
    # minimal list for sprites row / autocomplete source
    try:
        rows = build_trainer_pool_search_rows(trainer_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="trainer_id not found in pool index")
    out: List[TrainerPoolMon] = []
    for r in rows:
        out.append(
            TrainerPoolMon(
                global_id=int(r["global_id"]),
                display=str(r["display"]),
                species=str(r["species"]),
                dex_number=r.get("dex_number") if isinstance(r.get("dex_number"), int) else None,
                sprite_url_pokeapi=r.get("sprite_url_pokeapi") if isinstance(r.get("sprite_url_pokeapi"), str) else None,
            )
        )
    return out


@app.get("/subway/trainer/{trainer_id}/pool/search", response_model=List[TrainerPoolMon])
def subway_trainer_pool_search(trainer_id: str, q: str = Query(..., min_length=1), limit: int = 20):
    nq = normalize(q)
    lim = max(1, min(limit, 50))

    try:
        rows = build_trainer_pool_search_rows(trainer_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="trainer_id not found in pool index")

    prefix = [r for r in rows if any(a.startswith(nq) for a in r["aliases"])]
    prefix_ids = {r["global_id"] for r in prefix}

    contains: List[dict] = []
    if len(prefix) < lim:
        for r in rows:
            if r["global_id"] in prefix_ids:
                continue
            if any(nq in a for a in r["aliases"]):
                contains.append(r)

    matches = (prefix + contains)[:lim]
    return [
        TrainerPoolMon(
            global_id=int(m["global_id"]),
            display=str(m["display"]),
            species=str(m["species"]),
            dex_number=m.get("dex_number") if isinstance(m.get("dex_number"), int) else None,
            sprite_url_pokeapi=m.get("sprite_url_pokeapi") if isinstance(m.get("sprite_url_pokeapi"), str) else None,
        )
        for m in matches
    ]


@app.get("/subway/set/{global_id}")
def subway_set_detail(global_id: int):
    try:
        return load_set_by_global_id(int(global_id))
    except KeyError:
        raise HTTPException(status_code=404, detail="global_id not found")
    except Exception:
        raise HTTPException(status_code=500, detail="could not load set")


# ----------------------------
# Damage endpoint
# ----------------------------
@app.post("/calc/damage", response_model=DamageResponse)
def calc_damage(req: DamageRequest):
    return compute_damage(req)


if __name__ == "__main__":
    import argparse
    import uvicorn

    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--reload", action="store_true")
    args = ap.parse_args()

    current_dir = Path.cwd().name
    app_string = "main:app" if current_dir == "src" else "src.main:app"

    uvicorn.run(app_string, host=args.host, port=args.port, reload=args.reload)
