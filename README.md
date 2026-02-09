# 🚇 Gen 5 Battle Subway Helper

An interactive tool to **analyze Battle Subway trainers** (Pokémon Black 2 / White 2),
allowing you to **deduce the opponent’s team in real time** based on revealed Pokémon,
their possible sets, and competitive constraints such as **Item Clause**.

The application is designed for **practical, in-battle use**, especially in **Double Battles**,
and displays **all possible Pokémon sets**, allowing you to manually discard or confirm options
as the battle progresses.

---

## ✨ Main Features

- 🔍 **Multilingual** trainer search
- 🧩 Full visualization of each trainer’s **possible Pokémon sets**
- 👀 Manual marking of **seen / confirmed Pokémon**
- ❌ Manual discarding of impossible sets
- 🎒 Automatic enforcement of **Item Clause**
- 📊 Real, Gen 5–accurate **Level 50 stats**
- 🎮 UI inspired by **Serebii**, redesigned for competitive play

---

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

```cmd
uvicorn src.main:app --reload --port 8000
```

Terminal 2 (frontend):

```cmd
cd frontend
npm run dev
```

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
