# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev server (http://localhost:5173/)
cd frontend && npm run dev

# Production build
cd frontend && npm run build

# Lint
cd frontend && npm run lint

# Deploy: just push to main — CI handles the rest
```

No test suite. Verify changes manually in the browser.

---

## What This Is

A web tool for Pokémon Black 2 / White 2 Battle Subway. It helps players:
1. **Enemy Trainer tab** — search trainers by name (EN/ES), see their full Pokémon pool, confirm/discard sets as they reveal themselves in battle.
2. **My Team tab** — build a Gen 5 team with real PokéDex data, picking Pokémon, moves, EVs, nature, item.
3. **Calculator tab** — Gen 5 damage calculator: pick one Pokémon from each side, see move damage ranges with field conditions.

Live at: `https://diegodzv.github.io/battle_subway_helper/`

---

## Tech Stack

- **React 19 + Vite 7** (frontend only, no backend)
- **No server** — fully static, hosted on GitHub Pages
- **No test suite** — manual testing in browser
- `frontend/` is the Vite project root. All source code is in `frontend/src/`.
- Build output: `frontend/dist/` → deployed to `gh-pages` branch via GitHub Actions

**Dev server:** `cd frontend && npm run dev` → `http://localhost:5173/`
**Build:** `cd frontend && npm run build`
**Deploy:** push to `main` → `.github/workflows/deploy.yml` builds and pushes `dist/` to `gh-pages` branch automatically.

---

## Project Structure

```
battle_subway_helper/
├── .github/workflows/deploy.yml   # CI deploy to GitHub Pages (triggers on push to main)
├── CLAUDE.md                      # This file
├── frontend/
│   ├── vite.config.js             # base: '/battle_subway_helper/'
│   ├── public/data/               # All static JSON data files (served as-is)
│   └── src/
│       ├── App.jsx                # Root: state, data loading, routing between tabs
│       ├── api/client.js          # loadStaticJson(filename) — sole data-fetch utility
│       ├── utils/
│       │   ├── damageCalc.js      # Gen 5 damage formula engine
│       │   ├── poke.js            # Utility fns: setDisplayName, formatBPAcc, etc.
│       │   └── text.js            # normalize() — lowercase + strip accents
│       ├── hooks/
│       │   └── useDebouncedValue.js
│       ├── styles/
│       │   ├── index.css          # Imports all partials
│       │   ├── tokens.css         # CSS custom properties (colors, radii, etc.)
│       │   ├── base.css           # html/body, .muted, .mono, .h1/.h2/.h3
│       │   ├── layout.css         # .page, .content, .layoutNew, .panel, .footer
│       │   ├── header.css         # .header, .brand, .tabsBar, .trainerBar
│       │   ├── components.css     # .dropdown, .sprite, .chip, .typeBadge, .moveRow, .statTable
│       │   ├── enemy.css          # .seenGrid, .seenSlot, .poolGrid, .setTile
│       │   ├── myteam.css         # .myField, .mySelect, .myInput, .tileBtn
│       │   └── calculator.css     # .calcGrid3, .calcSpriteGrid4, .calcEmptyCell
│       └── components/
│           ├── common/            # Sprite, ItemIcon, TypeBadge, StatRow
│           ├── trainer/           # TrainerNamesLine (shows all language names)
│           ├── enemy/             # EnemyTrainerTab, SetTile
│           ├── myteam/            # MyTeamTab, MoveAutocompleteInput, stats.jsx
│           └── calculator/        # CalculatorTab.jsx (active); MoveDamageRow.jsx + StatsWithControls.jsx are unused dead files — all logic is defined inline in CalculatorTab.jsx
```

---

## Data Architecture

All data is pre-generated JSON in `frontend/public/data/`. The app loads everything at startup.

### Static JSON Files

| File | Size | Contents |
|------|------|----------|
| `subway_trainers_set45.json` | ~300 KB | All trainers: `{trainers: [{trainer_id, name_en, name_es, section, pool_global_ids, names: {en,es,de,fr,it,ja,ko}, classes: {en,...}}]}` |
| `all_pokemon_sets.json` | ~1 MB | All Pokémon sets keyed by slug: `{global_id, species, nature, item, moves, evs, variant_index, stats_lv50, sprite_url_pokeapi, dex_number, item_sprite_url, moves_meta: [{name,slug,type}]}` |
| `moves_items_cache.json` | ~200 KB | `{moves: {"slug": {name, type, damage_class, power, accuracy, pp}}}` |
| `pokedex_gen5_index.json` | ~50 KB | `{pokemon: [{dex, slug, name_en, name_es, types}]}` — for search |
| `pokedex_gen5.json` | ~1.7 MB | `{pokemon: {"1": {dex, slug, name_en, name_es, types, abilities, base_stats, sprite_url, move_slugs}}}` — loaded lazily |

### Data Loading Pattern (App.jsx)

```
Startup (parallel):
  subway_trainers_set45.json → trainersList (array)
  all_pokemon_sets.json       → setsIndex (Map<global_id, set>)
  moves_items_cache.json      → moveDex ({slug: entry})
  pokedex_gen5_index.json     → pokedexIndex (array, for My Team search)

On first My Team Pokémon pick (lazy):
  pokedex_gen5.json           → cached at module level in MyTeamTab.jsx
```

### Trainer Loading (synchronous after startup)

`loadTrainer(trainerId)` in App.jsx:
1. Finds trainer in `trainersList`
2. Resolves `pool_global_ids` → array of set objects via `setsIndex.get(id)`
3. Sets `trainer = { ...trainerData, sets }`

---

## Component Notes

### App.jsx

Central state hub. Key states:
- `trainer` — currently selected trainer (with `.sets` array attached)
- `confirmed` — array of `global_id`s confirmed as seen
- `discarded` — `Set<global_id>` of discarded sets
- `visiblePool` — memoized: pool sorted by dex number, filtered by confirmed/discarded/pokemonFilter
- `confirmedSets` — array of 4 slots (null if empty), resolved from `setById` (a per-trainer `Map<global_id, set>` built from `poolSets`)

### EnemyTrainerTab.jsx

Two states:
1. **No trainer selected** → shows centered search box (the "Enter Trainer Name" landing page). The search box autocompletes from `trainersList`.
2. **Trainer selected** → two-panel layout: `Seen` grid (4 confirmed slots) + `Pool` grid (SetTile components).

The pool filter input lives in the header's `trainerBar` (sticky by default because `.header` uses `position: sticky`).

### SetTile (enemy/SetTile.jsx)

Compact card per pool set. Has ✕ (discard) and ✓ (confirm) buttons. Shows sprite, name, item, moves. Dimmed when discarded.

### CalculatorTab.jsx

3-column layout: My side | Field | Enemy side.

Top panel shows damage ranges for all 8 moves (4 each side) once both Pokémon are selected.

Enemy Pokémon can be selected from `confirmedSets` (the 4 seen slots) OR searched from the trainer's full pool.

### damageCalc.js

See "Damage Calc Engine" section below.

---

## Damage Calc Engine (damageCalc.js)

### Gen 5 Formula

```
Base = floor(floor(floor(2*50/5 + 2) * BP * A / D) / 50) + 2
     = floor(floor(22 * BP * A / D) / 50) + 2

Then for each roll r in [85..100]:
  dmg = floor(Base * r/100)
  dmg = floor(dmg * STAB)          // 1.5 or 2.0 (Adaptability)
  dmg = floor(dmg * type_eff)      // 0/0.25/0.5/1/2/4
  dmg = floor(dmg * crit)          // ×2 in Gen 5
  dmg = floor(dmg * weather)       // ×1.5 or ×0.5
  dmg = max(1, dmg)
```

**Current implementation order (per roll):** roll → STAB → type effectiveness → crit (×2) → weather → burn (×0.5 physical, skipped with Guts) → screens (×0.5, bypassed by crit). This approximates Gen 5 closely enough for practical use; the correct Gen 5 order applies crit before the roll, but the result is numerically equivalent.

### Known Missing / Incorrect in damageCalc.js

1. **Item modifiers** (all missing):
   - Life Orb → ×1.3 (applied in final modifier)
   - Choice Band (physical) / Choice Specs (special) → ×1.5 (applied as stat multiplier to A)
   - Muscle Band (physical) / Wise Glasses (special) → ×1.1 (applied in final modifier)
   - Type Gems → ×1.5 for matching type (consumed after 1 use — offer as checkbox in UI)
2. **Reflect / Light Screen** — Applied as ×0.5 inside each roll, correctly bypassed by crits. In doubles with two live targets the divisor should be ×0.66 (not ×0.5), but that's not modeled.
3. **Ability modifiers** — Only Adaptability is implemented. Notable missing:
   - Hustle (×1.5 Atk physical, ×0.8 accuracy)
   - Thick Fat (×0.5 for fire/ice attacks on defender)
   - Flash Fire (×1.5 fire when triggered)
   - Heatproof (×0.5 fire on defender)
   - Dry Skin (×1.25 fire on defender)
   - Huge Power / Pure Power (×2 Atk)
   - Solar Power (×1.5 SpA in sun, costs HP)
   - Swift Swim / Chlorophyll / Sand Rush / Slush Rush (Spe, not damage)
4. **Multi-target penalty in doubles** — If a move hits all opponents, it should be ×0.75. Currently not applied (Friend Guard gives ×0.75 to allies but that's a different thing).
5. **Aurora Veil** — Gen 7+ only. Do NOT add this.
6. **Sand / Hail damage boosts** — Sand boosts Rock-type SpD by ×1.5; Hail boosts Ice-type SpD by ×1.5. These are not modifier bugs but affect "effective SpD" indirectly.

### calcDamageFromRequest (the public API)

Takes `{ attacker, defender, move_slug, is_crit, field, atk_side, def_side }`. Returns `{ min_damage, max_damage, min_percent_maxhp, max_percent_maxhp, guaranteed_ohko_on_remaining, possible_ohko_on_remaining }`.

Key fields:
- `atk_side.burned` — burn status on the attacker (halves physical output, negated by Guts)
- `atk_side.helping_hand` — doubles boost (×1.5, applied post-roll)
- `def_side.reflect` / `def_side.light_screen` — screens on the defender's side (handled inside each roll, bypassed by crit)
- `def_side.friend_guard` — doubles only (×0.75, applied post-roll)
- `field.wonder_room` — swaps Def/SpD on both sides before calc
- `field.weather` — `"sun" | "rain" | "sand" | "hail" | "none"`
- `field.format` — `"singles" | "doubles"` (gates friend_guard / helping_hand)

---

## Commit Style Guide

Diego writes commits in lowercase, short imperative form, with a type prefix:

```
feat(enemy): move search box to empty state
fix: correct Wonder Room stat swap
ui(calc): remove stat bars from StatsBoxWithControls
refactor(data): use setsIndex Map for O(1) set lookup
```

Common prefixes: `feat`, `fix`, `ui`, `refactor`, `ci`, `data`, `chore`

Always review git log before writing a commit message: `git log --oneline -10`

---

## Deployment

1. Push to `main` branch
2. GitHub Actions (`.github/workflows/deploy.yml`) runs `npm run build` then deploys `dist/` to `gh-pages` branch
3. GitHub Pages serves from `gh-pages` branch at root `/`
4. Vite is configured with `base: '/battle_subway_helper/'` so all assets resolve correctly

**Windows SSL note:** If `git push` fails with SSL certificate error, run:
```
git config --global http.sslBackend schannel
```

---

## esbuild / JSX Quirk

esbuild's JSX parser rejects single-quoted attribute values that contain double-quote characters:
```jsx
// BREAKS:
<input placeholder='Search (e.g. "clerk")' />

// WORKS:
<input placeholder="Search (e.g. clerk)" />
// or:
<input placeholder={"Search (e.g. \"clerk\")"} />
```

---

## Stat Key Naming Convention

Enemy sets store pre-computed Lv 50 stats under **capitalized** keys:
```js
set.stats_lv50 = { HP, Atk, Def, SpA, SpD, Spe }
```

Everywhere else (my team, `computeDamage`, `calcFinalStatsLv50`) uses **lowercase** keys:
```js
{ hp, atk, def, spa, spd, spe }
```

`buildCalcPokemonFromEnemySet` in `CalculatorTab.jsx` does the translation. Don't mix the two.

### My Team slot shape

A filled slot in `myTeam` (after picking from `pokedex_gen5.json`) has:
```js
{ dex, slug, name_en, name_es, types, abilities, base_stats, sprite_url,
  // user-set fields (defaulted on pick, editable in MyTeamTab):
  nature, evs: {hp,atk,def,spa,spd,spe}, ivs: {hp,...}, ability, item,
  moves: [string, ...],     // free-text, may not match a slug
  move_slugs: [slug, ...]   // resolved slugs (preferred for calc)
}
```

`setDisplayName(set)` returns `"Species-N"` if `variant_index` is set, else `"Species"`.

---

## CSS Architecture

Dark theme. All CSS custom properties are in `tokens.css` (though most colors are used inline as `rgba(...)` literals throughout the codebase).

The `.header` div has `position: sticky; top: 0; z-index: 100` (in `header.css`). The `trainerBar` lives inside `.header`, making the pool filter input automatically sticky without extra CSS.

Key layout classes:
- `.layoutNew` — 2-column grid (Seen panel + Pool panel) for enemy tab
- `.calcGrid3` — 3-column `1fr 360px 1fr` defined in `calculator.css` but currently unused; `CalculatorTab.jsx` uses equivalent inline styles instead
- `.panel` — frosted card: dark bg, border, border-radius 18px, padding 14px
- `.miniBox` — smaller inner card: lighter bg, border, border-radius 14px, padding 10px

---

## Gen 5 Battle Subway Context

- **Format:** Singles (Battle Tower), Doubles (Battle Factory), Multi (Multi Train)
- **Rules:** Species Clause, Item Clause (same item can't appear twice on enemy team)
- **Levels:** All Pokémon normalized to Lv 50
- **Enemy team size:** The enemy trainer has a pool of possible sets; they bring 3 (singles) or 4 (doubles) to battle
- **Confirmed sets:** When a set is confirmed, all other sets of the same species are auto-discarded (Species Clause), and all sets with the same held item are also auto-discarded (Item Clause)
