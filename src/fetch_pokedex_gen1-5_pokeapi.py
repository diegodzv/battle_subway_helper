#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
import json
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

POKEAPI_BASE = "https://pokeapi.co/api/v2"

logging.basicConfig(
    level=os.environ.get("MB_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger("mb.fetch_pokedex_gen5")


@dataclass
class FetchResult:
    ok: bool
    payload: Dict[str, Any]


def http_get_json(url: str, timeout: float = 20.0, retries: int = 3, sleep_s: float = 0.4) -> FetchResult:
    last_err: Optional[str] = None
    for attempt in range(1, retries + 1):
        try:
            r = requests.get(url, timeout=timeout, headers={"User-Agent": "battle-subway-helper/1.0"})
            if r.status_code != 200:
                last_err = f"status={r.status_code}"
                # 429/5xx: retry
                if r.status_code in (429, 500, 502, 503, 504):
                    time.sleep(sleep_s * attempt)
                    continue
                return FetchResult(False, {"status": r.status_code})
            return FetchResult(True, r.json())
        except Exception as e:
            last_err = str(e)
            time.sleep(sleep_s * attempt)
            continue
    return FetchResult(False, {"error": last_err or "unknown"})


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def extract_lang_name(names_list: Any, lang: str) -> Optional[str]:
    if not isinstance(names_list, list):
        return None
    for entry in names_list:
        try:
            if entry.get("language", {}).get("name") == lang:
                v = entry.get("name")
                if isinstance(v, str) and v.strip():
                    return v.strip()
        except Exception:
            continue
    return None


def pick_default_pokemon_url(species_payload: Dict[str, Any]) -> Optional[str]:
    # species -> varieties -> pick is_default=true if possible
    varieties = species_payload.get("varieties")
    if not isinstance(varieties, list):
        return None
    for v in varieties:
        if isinstance(v, dict) and v.get("is_default") is True:
            url = v.get("pokemon", {}).get("url")
            if isinstance(url, str) and url.startswith("http"):
                return url
    # fallback: first variety
    if varieties:
        url = varieties[0].get("pokemon", {}).get("url")
        if isinstance(url, str) and url.startswith("http"):
            return url
    return None


def parse_pokemon_id_from_url(url: str) -> Optional[int]:
    # .../pokemon/25/
    try:
        s = url.rstrip("/").split("/")[-1]
        return int(s)
    except Exception:
        return None


def build_index_entry(p: Dict[str, Any]) -> Dict[str, Any]:
    # Minimal fields for autocomplete
    return {
        "dex": p.get("dex"),
        "slug": p.get("slug"),
        "name_en": p.get("name_en"),
        "name_es": p.get("name_es"),
        "types": p.get("types"),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Fetch Gen5 pokedex (1..649) from PokeAPI and store locally.")
    ap.add_argument("--out", default="data/pokedex_gen5.json", help="Output JSON path")
    ap.add_argument("--out_index", default="data/pokedex_gen5_index.json", help="Output index JSON path")
    ap.add_argument("--max_id", type=int, default=649, help="Max National Dex ID (default 649)")
    ap.add_argument("--sleep", type=float, default=0.12, help="Sleep between requests (seconds)")
    ap.add_argument("--timeout", type=float, default=20.0, help="HTTP timeout")
    ap.add_argument("--retries", type=int, default=3, help="Retries for transient errors")
    ap.add_argument("--resume", action="store_true", help="Resume from existing output (skip already fetched dex)")
    args = ap.parse_args()

    out_path = Path(args.out)
    out_index_path = Path(args.out_index)

    existing: Dict[str, Any] = {}
    pokedex: Dict[int, Dict[str, Any]] = {}
    done_ids: set[int] = set()

    if args.resume and out_path.exists():
        try:
            existing = read_json(out_path)
            if isinstance(existing, dict) and isinstance(existing.get("pokemon"), dict):
                for k, v in existing["pokemon"].items():
                    try:
                        dex = int(k)
                        if isinstance(v, dict):
                            pokedex[dex] = v
                            done_ids.add(dex)
                    except Exception:
                        continue
                logger.info("Resume enabled: loaded %d already-fetched Pokémon.", len(done_ids))
        except Exception as e:
            logger.warning("Could not resume from %s: %s", out_path, e)

    meta = {
        "source": "pokeapi",
        "max_id": int(args.max_id),
        "sleep_s": float(args.sleep),
        "updated_at_unix": int(time.time()),
        "notes": "Gen5 local pokedex for teambuilder (dex 1..649).",
    }

    for dex in range(1, int(args.max_id) + 1):
        if dex in done_ids:
            continue

        species_url = f"{POKEAPI_BASE}/pokemon-species/{dex}/"
        sp = http_get_json(species_url, timeout=args.timeout, retries=args.retries)
        if not sp.ok:
            logger.error("Species fetch failed #%d: %s", dex, sp.payload)
            # still record as not_found for stability
            pokedex[dex] = {"dex": dex, "not_found": True, "where": "species", "error": sp.payload}
            if args.sleep:
                time.sleep(args.sleep)
            continue

        slug = sp.payload.get("name")
        if not isinstance(slug, str) or not slug.strip():
            slug = f"unknown-{dex}"

        name_en = extract_lang_name(sp.payload.get("names"), "en") or slug
        name_es = extract_lang_name(sp.payload.get("names"), "es")

        default_pokemon_url = pick_default_pokemon_url(sp.payload)
        if not default_pokemon_url:
            logger.error("No default pokemon URL for species #%d (%s).", dex, slug)
            pokedex[dex] = {"dex": dex, "slug": slug, "name_en": name_en, "name_es": name_es, "not_found": True}
            if args.sleep:
                time.sleep(args.sleep)
            continue

        pokemon_id = parse_pokemon_id_from_url(default_pokemon_url) or dex
        pk = http_get_json(default_pokemon_url, timeout=args.timeout, retries=args.retries)
        if not pk.ok:
            logger.error("Pokemon fetch failed #%d (%s): %s", dex, slug, pk.payload)
            pokedex[dex] = {
                "dex": dex,
                "slug": slug,
                "name_en": name_en,
                "name_es": name_es,
                "pokemon_id": pokemon_id,
                "not_found": True,
                "where": "pokemon",
                "error": pk.payload,
            }
            if args.sleep:
                time.sleep(args.sleep)
            continue

        # Types (order by slot)
        types: List[str] = []
        raw_types = pk.payload.get("types")
        if isinstance(raw_types, list):
            raw_types_sorted = sorted(
                [t for t in raw_types if isinstance(t, dict)],
                key=lambda x: x.get("slot", 999),
            )
            for t in raw_types_sorted:
                tn = t.get("type", {}).get("name")
                if isinstance(tn, str) and tn:
                    types.append(tn)

        # Abilities (keep order, mark hidden)
        abilities: List[Dict[str, Any]] = []
        raw_abilities = pk.payload.get("abilities")
        if isinstance(raw_abilities, list):
            raw_abilities_sorted = sorted(
                [a for a in raw_abilities if isinstance(a, dict)],
                key=lambda x: x.get("slot", 999),
            )
            for a in raw_abilities_sorted:
                an = a.get("ability", {}).get("name")
                if isinstance(an, str) and an:
                    abilities.append(
                        {
                            "name": an,
                            "is_hidden": bool(a.get("is_hidden")),
                            "slot": a.get("slot"),
                        }
                    )

        # Base stats (HP/Atk/Def/SpA/SpD/Spe)
        stats_map: Dict[str, int] = {}
        raw_stats = pk.payload.get("stats")
        if isinstance(raw_stats, list):
            for st in raw_stats:
                if not isinstance(st, dict):
                    continue
                key = st.get("stat", {}).get("name")
                val = st.get("base_stat")
                if isinstance(key, str) and isinstance(val, int):
                    stats_map[key] = val

        # Sprite (prefer official artwork if present, else front_default)
        sprite_url = None
        sprites = pk.payload.get("sprites") if isinstance(pk.payload.get("sprites"), dict) else {}
        try:
            oa = sprites.get("other", {}).get("official-artwork", {}).get("front_default")
            if isinstance(oa, str) and oa:
                sprite_url = oa
        except Exception:
            pass
        if not sprite_url:
            fd = sprites.get("front_default")
            if isinstance(fd, str) and fd:
                sprite_url = fd

        # Moves list: HUGE. For now, store only slugs (dedup) so you can later validate or suggest.
        # (If you prefer, we can disable this entirely to make the file much smaller.)
        move_slugs: List[str] = []
        raw_moves = pk.payload.get("moves")
        if isinstance(raw_moves, list):
            seen = set()
            for m in raw_moves:
                if not isinstance(m, dict):
                    continue
                mn = m.get("move", {}).get("name")
                if isinstance(mn, str) and mn and mn not in seen:
                    seen.add(mn)
            move_slugs = sorted(seen)

        pokedex[dex] = {
            "dex": dex,
            "slug": slug,
            "name_en": name_en,
            "name_es": name_es,
            "pokemon_id": pokemon_id,
            "types": types,
            "abilities": abilities,
            "base_stats": {
                "hp": stats_map.get("hp"),
                "atk": stats_map.get("attack"),
                "def": stats_map.get("defense"),
                "spa": stats_map.get("special-attack"),
                "spd": stats_map.get("special-defense"),
                "spe": stats_map.get("speed"),
            },
            "sprite_url": sprite_url,
            "move_slugs": move_slugs,
            "not_found": False,
        }

        if dex % 25 == 0:
            logger.info("Progress: %d/%d", dex, args.max_id)

        if args.sleep:
            time.sleep(args.sleep)

    # Build final object
    final = {
        "meta": {**meta, "updated_at_unix": int(time.time()), "count": len(pokedex)},
        "pokemon": {str(k): pokedex[k] for k in sorted(pokedex.keys())},
    }

    index = {
        "meta": {
            "source": "pokedex_gen5.json",
            "updated_at_unix": int(time.time()),
            "count": len(pokedex),
            "max_id": int(args.max_id),
        },
        "pokemon": [build_index_entry(pokedex[k]) for k in sorted(pokedex.keys()) if isinstance(pokedex[k], dict)],
    }

    save_json(out_path, final)
    save_json(out_index_path, index)

    logger.info("Saved: %s", out_path)
    logger.info("Saved index: %s", out_index_path)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
