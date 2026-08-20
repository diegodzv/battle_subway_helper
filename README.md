# 🚇 Battle Subway Helper (B2/W2)

A web tool to **track Battle Subway trainers** in Pokémon Black 2 / White 2 and
**deduce the opponent's team in real time**.

Each Subway trainer has a pool of possible Pokémon (with multiple possible sets
per species — movesets, items, natures) from which they pick 3 or 4 for battle.
This tool shows you that full pool and lets you narrow it down as the trainer
reveals Pokémon: confirming a set automatically discards every other set that
can't coexist with it under **Species Clause** and **Item Clause**.

Live at: **https://diegodzv.github.io/battle_subway_helper/**

---

## ✨ Features

- 🔍 Trainer search in English or Spanish, autocompleted
- 🧩 Full visualization of each trainer's possible Pokémon sets (moves, item, nature, Lv 50 stats)
- 👀 Confirm sets as they're revealed in battle, filling 4 "Seen" slots
- ❌ Discard sets manually, or automatically via Species Clause + Item Clause
- 🔎 Per-slot filter boxes to quickly narrow the pool while looking for a specific Pokémon
- ⚡ Switch trainers directly from the header, no reset step needed

---

## 🚀 Running the Application

This is a **static, frontend-only** app — no backend, no database. All Pokémon
and trainer data is pre-generated JSON served as static files.

```bash
cd frontend
npm install
npm run dev
```

The UI will be available at http://localhost:5173

Other commands (run from `frontend/`):

```bash
npm run build   # production build -> frontend/dist/
npm run lint    # eslint
```

There is no automated test suite — verify changes manually in the browser.

---

## 🧠 Design Notes

- All Pokémon and trainer data is precomputed and loaded as static JSON at startup
- No runtime PokéAPI calls, no server round-trips
- Species Clause and Item Clause are enforced client-side for usability
- Fast, offline-friendly, deterministic

---

## 🎮 About Battle Subway

This tool is designed for the Battle Subway in Pokémon Black 2 / White 2.

---

## 🛠️ Deployment

Push to `main` — GitHub Actions (`.github/workflows/deploy.yml`) builds the
frontend and deploys `frontend/dist/` to the `gh-pages` branch, which GitHub
Pages serves automatically.

---

## 📜 License

This project is shared for the Pokémon community.

Pokémon data belongs to Nintendo, Game Freak, and Creatures Inc.
This project is non-commercial and educational.
