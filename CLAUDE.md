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

`npm run lint` currently reports a handful of pre-existing errors (unused props in
`EnemyTrainerTab.jsx`/`SetTile.jsx`, `set-state-in-effect` in `App.jsx`); CI only runs the build.

---

## What This Is

A web tool for the Pokémon Black 2 / White 2 Battle Subway. It helps players deduce an
opponent trainer's team in real time: search a trainer by name (EN/ES), see their full
pool of possible Pokémon sets, and confirm/discard sets as they reveal themselves in
battle. Confirming a set auto-discards every other set that can't coexist with it under
Species Clause and Item Clause.

This is the app's only feature. Earlier iterations also had a "My Team" builder, a Gen 5
damage calculator, and an OCR-based auto-capture companion for reading the emulator screen
— all three were removed as unfinished/overly complex. Don't reintroduce them unless
explicitly asked.

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
│   ├── public/data/subway_data.json  # The only data file (served as-is)
│   └── src/
│       ├── App.jsx                # Root: state, data loading, header, trainer search
│       ├── api/client.js          # loadSubwayData() — fetches subway_data.json and expands it
│       ├── utils/
│       │   ├── poke.js            # Utility fns: setDisplayName, formatBPAcc, etc.
│       │   └── text.js            # normalize() — lowercase + strip accents
│       ├── hooks/
│       │   └── useDebouncedValue.js
│       ├── styles/
│       │   ├── index.css          # Imports all partials
│       │   ├── tokens.css         # CSS custom properties (colors, radii, etc.)
│       │   ├── base.css           # html/body, .muted, .mono, .h1/.h2/.h3
│       │   ├── layout.css         # .page, .content, .layoutNew, .panel, .footer
│       │   ├── header.css         # .header, .brand, .trainerBar
│       │   ├── components.css     # .dropdown, .sprite, .chip, .typeBadge, .moveRow, .statTable, .slotSearchInput
│       │   └── enemy.css          # .seenGrid, .seenSlot, .poolGrid, .setTile
│       └── components/
│           ├── common/            # Sprite, ItemIcon, TypeBadge, StatRow
│           ├── trainer/           # TrainerNamesLine (shows all language names)
│           └── enemy/             # EnemyTrainerTab, SetTile
```

---

## Data Architecture

All data lives in a single pre-generated file, `frontend/public/data/subway_data.json`
(~220 KB, ~47 KB gzipped), loaded once at startup. It is hand-maintained (there is no
generator script) and written one record per line so diffs stay readable. It only
contains what the app renders: the 100 Super Set 4/5 trainers and the 780 sets that
appear in their pools — don't add sets, moves or fields nothing uses.

### subway_data.json (compact, on disk)

| Key | Contents |
|-----|----------|
| `moves` | `{"slug": {type, damage_class, power?, accuracy?}}` — `power`/`accuracy` omitted when null |
| `items` | `{"Item Name": "pokeapi-item-slug"}` — only used to build item sprite URLs |
| `sets` | `[{id, species, variant, dex, nature, item, moves: [slug], evs: ["HP","Def"], stats: [HP,Atk,Def,SpA,SpD,Spe]}]` |
| `pools` | `[[set id, ...]]` — the 33 distinct pools; many trainers share one |
| `trainers` | `[{trainer_id, name_en, name_es, section, pool: <index into pools>, names: {en,es,de,fr,it,ja,ko}}]` |

### Expanded shape (in memory)

`loadSubwayData()` in `api/client.js` expands the compact records into the shape every
component consumes, and returns `{trainersList, setsIndex, moveDex}`:

- set: `{global_id, species, variant_index, dex_number, nature, item, moves_meta: [{slug, type}], evs_numeric: {HP,...}, stats_lv50: {HP,...}, sprite_url_pokeapi, item_sprite_url}`
  - sprite URLs are derived (PokeAPI sprites repo, by dex number / item slug), not stored
  - `evs_numeric` is derived from `evs`: 510 split evenly across the listed stats, capped at 255
  - move display names are derived from the slug (`prettyMoveNameFromSlug`)
- trainer: the stored record plus `pool_global_ids` (resolved from `pools[pool]`)
- `setsIndex` is a `Map<global_id, set>`; `moveDex` is the `moves` object as-is

### Gen 5 accuracy

Everything must be **Gen 5 (B2W2)** data, not current-gen: base stats (e.g. Alakazam
SpD 85, Cresselia 120/130 defenses), move power/accuracy (Sucker Punch 80, Tackle 50),
and no Fairy type (Charm/Moonlight/Sweet Kiss are Normal). PokeAPI returns current-gen
values by default, which is how wrong data got in before. To audit, compare against
Pokémon Showdown's Gen 5 dex (`@pkmn/dex`, `Dex.forGen(5)`). `stats` are precomputed at
Lv 50 assuming 31 IVs, the EV rule above and the set's nature.

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
- `pokemonFilter` — free-text filter applied on top of the pool; edited from the empty "Seen" slots, not from the header
- `visiblePool` — memoized: pool sorted by dex number, filtered by confirmed/discarded/pokemonFilter
- `confirmedSets` — array of 4 slots (null if empty), resolved from `setById` (a per-trainer `Map<global_id, set>` built from `poolSets`)

The header shows only the brand when no trainer is loaded. Once a trainer is loaded, a
"switch trainer" search box appears in the header (reusing the same `q`/`suggestions`
autocomplete state as the landing search) so the user can jump straight to another
trainer — there's no separate reset button; `loadTrainer` already resets `confirmed`,
`discarded`, and `pokemonFilter` each time it runs.

### EnemyTrainerTab.jsx

Two states:
1. **No trainer selected** → shows centered search box (the "Enter Trainer Name" landing page). The search box autocompletes from `trainersList`.
2. **Trainer selected** → two-panel layout: `Seen` grid (4 confirmed slots) + `Pool` grid (SetTile components).

There is no standalone pool-filter textbox. Instead, each empty "Seen" slot
(`SeenSlotEmpty`) renders a filter input wired to the shared `pokemonFilter` state —
typing in any empty slot filters the Pool panel below. Confirming a set clears the filter.

### SetTile (enemy/SetTile.jsx)

Compact card per pool set. Has ✕ (discard) and ✓ (confirm) buttons. Shows sprite, name, item, moves. Dimmed when discarded.

---

## Commit Style Guide

Diego writes commits in lowercase, short imperative form, with a type prefix:

```
feat(enemy): move search box to empty state
fix: correct Wonder Room stat swap
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

Expanded enemy sets expose pre-computed Lv 50 stats under **capitalized** keys (stored on disk as a `stats` array in the same order):
```js
set.stats_lv50 = { HP, Atk, Def, SpA, SpD, Spe }
```

`setDisplayName(set)` returns `"Species-N"` if `variant_index` is set, else `"Species"`.

---

## CSS Architecture

Dark theme. All CSS custom properties are in `tokens.css` (though most colors are used inline as `rgba(...)` literals throughout the codebase).

The `.header` div has `position: sticky; top: 0; z-index: 10` (in `header.css`). The `trainerBar` lives inside `.header`, making the toggles/counts row automatically sticky without extra CSS.

Key layout classes:
- `.layoutNew` — 2-column grid (Seen panel + Pool panel) for enemy tab
- `.panel` — frosted card: dark bg, border, border-radius 18px, padding 14px
- `.miniBox` — smaller inner card: lighter bg, border, border-radius 14px, padding 10px
- `.slotSearchInput` / `.slotSearchHeader` / `.slotClearBtn` (in `components.css`) — the per-slot pool filter inputs rendered by `SeenSlotEmpty`

---

## Gen 5 Battle Subway Context

- **Format:** Singles (Battle Tower), Doubles (Battle Factory), Multi (Multi Train)
- **Rules:** Species Clause, Item Clause (same item can't appear twice on enemy team)
- **Levels:** All Pokémon normalized to Lv 50
- **Enemy team size:** The enemy trainer has a pool of possible sets; they bring 3 (singles) or 4 (doubles) to battle
- **Confirmed sets:** When a set is confirmed, all other sets of the same species are auto-discarded (Species Clause), and all sets with the same held item are also auto-discarded (Item Clause)
