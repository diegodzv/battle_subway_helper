# 🚇 Battle Subway Helper (Pokémon B2/W2 – Super Sets 4/5)

An interactive tool to **analyze Battle Subway trainers** (Pokémon Black 2 / White 2),
allowing you to **deduce the opponent’s team in real time** based on revealed Pokémon,
their possible sets, and competitive constraints such as **Item Clause**.

The application is designed for **practical, in-battle use**, especially in **Double Battles**,
and displays **all possible Pokémon sets**, allowing you to manually discard or confirm options
as the battle progresses.

---

## ✨ Main Features

- 🔍 Trainer search in **English and Spanish**
- 🧩 Full visualization of each trainer’s **possible Pokémon sets**
- 👀 Manual marking of **seen / confirmed Pokémon**
- ❌ Manual discarding of impossible sets
- 🎒 Automatic enforcement of **Item Clause**
- 📊 Real, Gen 5–accurate **Level 50 stats**
- 🧠 Live calculation of remaining possible teams
- 🎮 UI inspired by **Serebii**, redesigned for competitive play

## 🗂️ Project Structure

```text
battle_subway_helper/
│
├── data/                         # Pre-generated datasets (included in the repo)
│   ├── subway_pokemon/           # One JSON per Pokémon set (core dataset)
│   ├── subway_trainers_set45.json
│   ├── subway_pools_set45.json
│   ├── subway_pools_index_set45.json
│   ├── base_stats.json
│   └── moves_items_cache.json
│
├── src/                          # Backend & data-processing scripts
│   ├── main.py                   # FastAPI backend (REST API)
│   ├── build_pools_index.py
│   ├── cleanup_moves_items_cache.py
│   ├── dedupe_trainer_pools.py
│   ├── download_subway_pokemon.py
│   ├── enrich_subway_sets_with_dex_number.py
│   ├── enrich_subway_sets_with_move_types_and_item_icons.py
│   ├── enrich_subway_sets_with_stats.py
│   ├── fetch_base_stats_pokeapi.py
│   ├── fetch_moves_items_pokeapi_cache.py
│   └── fetch_subway_trainers_smogon.py
│
├── frontend/                     # Frontend (Vite + React)
│   ├── src/
│   ├── index.html
│   └── package.json
│
└── README.md
```

## 🔄 Data Pipeline (Optional – for contributors)

⚠️ IMPORTANT  
The `data/` directory is already included in the repository and fully populated.  
**You do NOT need to run any of these scripts to use the application.**

This section is only for:
- Contributors
- Developers
- People who want to update or regenerate the datasets in the future

---

### 1️⃣ Download Pokémon sets (from Smogon)

Downloads all Battle Subway Pokémon sets (BW / B2W2) and stores them as individual JSON files.

```python
python src/download_subway_pokemon.py --out data/subway_pokemon
```

---

### 2️⃣ Fetch trainers (Set 4/5)

Downloads and parses Battle Subway trainers from Smogon.

```python
python src/fetch_subway_trainers_smogon.py
```

---

### 3️⃣ Deduplicate trainer pools

Groups trainers that share identical Pokémon pools.

```python
python src/dedupe_trainer_pools.py \
  --in data/subway_trainers_set45.json \
  --out data/subway_pools_set45.json
```

---

### 4️⃣ Build pool indices

Creates fast lookup indices used by the backend.

```python
python src/build_pools_index.py \
  --pools data/subway_pools_set45.json \
  --sets_dir data/subway_pokemon \
  --out data/subway_pools_index_set45.json
```

---

### 5️⃣ Fetch base stats from PokéAPI

Downloads base stats, abilities and sprites for all Pokémon species.

```python
python src/fetch_base_stats_pokeapi.py
```

---

### 6️⃣ Enrich sets with stats (Gen 5, Level 50)

Adds EVs, IVs, calculated stats and sprite URLs.

```python
python src/enrich_subway_sets_with_stats.py --write_in_place
```

---

### 7️⃣ Fetch moves & items cache

Fetches move types and item sprites from PokéAPI
and stores them in a reusable cache.

```python
python src/fetch_moves_items_pokeapi_cache.py \
  --sets_dir data/subway_pokemon \
  --cache data/moves_items_cache.json
```

---

### 8️⃣ Clean move & item cache

Removes invalid, duplicated or aliased entries.

```python
python src/cleanup_moves_items_cache.py \
  --cache data/moves_items_cache.json \
  --write
```

---

### 9️⃣ Enrich sets with move types & item icons

Adds:
- Move slugs
- Move types
- Item slugs
- Item sprite URLs

```python
python src/enrich_subway_sets_with_move_types_and_item_icons.py \
  --write_in_place
```

---

### 🔟 Add Pokédex numbers

Extracts and adds Pokédex numbers using sprite URLs.

```python
python src/enrich_subway_sets_with_dex_number.py \
  --write_in_place
```

## 🚀 Running the Application

The project consists of **two separate services**:
- Backend (FastAPI)
- Frontend (Vite + React)

Both must be running at the same time.

---

### ▶️ Backend (API)

From the **project root**:

```python
uvicorn src.main:app --reload --port 8000
```

The API will be available at:

http://localhost:8000

Health check:

http://localhost:8000/health

---

### ▶️ Frontend (UI)

From the **frontend/** directory:

```python
npm install
npm run dev
```

The UI will be available at:

http://localhost:5173

---

### 🔁 Running everything (recommended workflow)

Open **two terminals**:

Terminal 1 (backend):
uvicorn src.main:app --reload --port 8000

Terminal 2 (frontend):
cd frontend
npm run dev

---

## 🧠 Design Notes

- All Pokémon data is **precomputed**
- No runtime PokéAPI calls
- All filtering logic happens server-side
- Frontend is purely reactive and stateless
- Item Clause is enforced client-side for usability

This makes the app:
- Fast
- Offline-friendly
- Deterministic
- Tournament-safe

---

## 🎮 About Battle Subway

This tool is designed for:
- Pokémon Black / White & Pokémon Black 2 / White 2
- Super Subway Doubles planning
- Set 4 / Set 5

Inspired by:
- Smogon data
- Serebii presentation
- Competitive play needs

---

## 🤝 Contributing

Contributions are welcome!

Ideas:
- Better UX for doubles
- Automatic set elimination rules
- Damage calculator integration
- Localization support

---

## 📜 License

This project is shared for the Pokémon community.

Pokémon data belongs to:
- Nintendo
- Game Freak
- Creatures Inc.

This project is non-commercial and educational.



