#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import json
import os
import re
from typing import Any, Dict, Optional, Tuple

NON_ALNUM = re.compile(r"[^a-z0-9]+")


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, obj: Any) -> None:
    out_dir = os.path.dirname(path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def compact_key(s: str) -> str:
    """
    'ancient-power' -> 'ancientpower'
    'king-s-rock'   -> 'kingsrock'
    """
    if not s:
        return ""
    s = s.strip().lower()
    return NON_ALNUM.sub("", s)


def is_move_entry(e: Any) -> bool:
    return isinstance(e, dict) and "type" in e


def is_item_entry(e: Any) -> bool:
    return isinstance(e, dict) and "sprite_url" in e


def is_good_move(e: Dict[str, Any]) -> bool:
    return e.get("not_found") is False and isinstance(e.get("type"), str) and bool(e.get("type"))


def is_bad_move(e: Dict[str, Any]) -> bool:
    return e.get("not_found") is True and e.get("type") in (None, "")


def is_good_item(e: Dict[str, Any]) -> bool:
    return e.get("not_found") is False and isinstance(e.get("sprite_url"), str) and bool(e.get("sprite_url"))


def is_bad_item(e: Dict[str, Any]) -> bool:
    return e.get("not_found") is True and e.get("sprite_url") in (None, "")


def pick_preferred_key(a: str, b: str) -> str:
    """
    Prefer keys that look like PokeAPI slugs:
    - more hyphens is usually better than none (ancient-power > ancientpower)
    - if tie, longer key is slightly preferred
    """
    a_score = (a.count("-"), len(a))
    b_score = (b.count("-"), len(b))
    return a if a_score >= b_score else b


def detect_cache_sections(cache: Any) -> Tuple[Dict[str, Dict[str, Any]], str]:
    """
    Returns (sections, mode):
      sections = {"moves": <dict>, "items": <dict>}
      mode is "nested" or "flat"

    Accepted schemas:
      1) Nested:
         {"moves": {...}, "items": {...}}
      2) Flat:
         {"ancientpower": {...}, "blackglasses": {...}}  (mixed move+item entries)
    """
    if isinstance(cache, dict) and isinstance(cache.get("moves"), dict) and isinstance(cache.get("items"), dict):
        return {"moves": cache["moves"], "items": cache["items"]}, "nested"

    # flat: split by entry shape
    if isinstance(cache, dict):
        moves = {}
        items = {}
        for k, v in cache.items():
            if is_move_entry(v):
                moves[k] = v
            elif is_item_entry(v):
                items[k] = v
        # still return both; could be empty if schema is unexpected
        return {"moves": moves, "items": items}, "flat"

    return {"moves": {}, "items": {}}, "unknown"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, help="Path to data/moves_items_cache.json")
    ap.add_argument("--write", action="store_true", help="Write changes (otherwise dry-run)")
    ap.add_argument(
        "--delete_orphans",
        action="store_true",
        help="Also delete not_found=true entries even if no good counterpart exists",
    )
    args = ap.parse_args()

    cache = load_json(args.cache)
    sections, mode = detect_cache_sections(cache)

    moves = sections["moves"]
    items = sections["items"]

    print(f"[i] cache schema: {mode}")
    print(f"[i] moves entries: {len(moves)} | items entries: {len(items)}")

    # Build "best good" map by compact key
    best_good_move_by_compact: Dict[str, str] = {}
    best_good_item_by_compact: Dict[str, str] = {}

    for k, e in moves.items():
        if isinstance(e, dict) and is_good_move(e):
            ck = compact_key(k)
            if not ck:
                continue
            prev = best_good_move_by_compact.get(ck)
            best_good_move_by_compact[ck] = k if prev is None else pick_preferred_key(prev, k)

    for k, e in items.items():
        if isinstance(e, dict) and is_good_item(e):
            ck = compact_key(k)
            if not ck:
                continue
            prev = best_good_item_by_compact.get(ck)
            best_good_item_by_compact[ck] = k if prev is None else pick_preferred_key(prev, k)

    # Collect deletions
    deletions = []  # (kind, bad_key, kept_key|None, reason)

    for k, e in moves.items():
        if not isinstance(e, dict):
            continue
        if is_bad_move(e):
            ck = compact_key(k)
            kept = best_good_move_by_compact.get(ck)
            if kept and kept != k:
                deletions.append(("move", k, kept, "has_good_compact_match"))
            elif args.delete_orphans:
                deletions.append(("move", k, None, "orphan_not_found"))

    for k, e in items.items():
        if not isinstance(e, dict):
            continue
        if is_bad_item(e):
            ck = compact_key(k)
            kept = best_good_item_by_compact.get(ck)
            if kept and kept != k:
                deletions.append(("item", k, kept, "has_good_compact_match"))
            elif args.delete_orphans:
                deletions.append(("item", k, None, "orphan_not_found"))

    if not deletions:
        # extra debug: count bads so we know what's happening
        bad_moves = sum(1 for e in moves.values() if isinstance(e, dict) and is_bad_move(e))
        bad_items = sum(1 for e in items.values() if isinstance(e, dict) and is_bad_item(e))
        print(f"[i] bad moves (not_found=true + missing type): {bad_moves}")
        print(f"[i] bad items (not_found=true + missing sprite): {bad_items}")
        print("[+] No bad entries to delete.")
        return 0

    print(f"[+] Found {len(deletions)} deletions:")
    for kind, bad_k, kept_k, reason in deletions[:150]:
        if kept_k:
            print(f"  - ({kind}) delete '{bad_k}' (keep '{kept_k}') [{reason}]")
        else:
            print(f"  - ({kind}) delete '{bad_k}' [{reason}]")
    if len(deletions) > 150:
        print(f"  ... and {len(deletions) - 150} more")

    if not args.write:
        print("[dry-run] Not writing. Re-run with --write to apply.")
        return 0

    # Apply deletions in the actual structure
    for kind, bad_k, _, _ in deletions:
        if kind == "move":
            moves.pop(bad_k, None)
        else:
            items.pop(bad_k, None)

    if mode == "nested":
        cache["moves"] = moves
        cache["items"] = items
    else:
        # flat: rebuild cache but preserve other unknown keys
        # remove bad keys from original cache
        for kind, bad_k, _, _ in deletions:
            cache.pop(bad_k, None)

    save_json(args.cache, cache)
    print(f"[+] Updated cache written: {args.cache}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
