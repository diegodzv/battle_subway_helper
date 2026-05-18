import { useEffect, useMemo, useState } from "react";
import "./styles/index.css";

import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { loadStaticJson } from "./api/client";

import { TrainerNamesLine } from "./components/trainer/TrainerNamesLine";
import { MyTeamTab } from "./components/myteam/MyTeamTab";
import { EnemyTrainerTab } from "./components/enemy/EnemyTrainerTab";
import { CalculatorTab } from "./components/calculator/CalculatorTab";
import { setDisplayName } from "./utils/poke";

export default function App() {
  const [activeTab, setActiveTab] = useState("enemy");
  const [myTeam, setMyTeam] = useState([null, null, null, null]);

  const [dataReady, setDataReady] = useState(false);
  const [setsIndex, setSetsIndex] = useState(null);
  const [trainersList, setTrainersList] = useState(null);
  const [pokedexIndex, setPokedexIndex] = useState(null);

  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 150);
  const [suggestions, setSuggestions] = useState([]);

  const [trainer, setTrainer] = useState(null);

  const [confirmed, setConfirmed] = useState([]);
  const [discarded, setDiscarded] = useState(() => new Set());
  const [showDiscarded, setShowDiscarded] = useState(false);

  const [showStatsInPool, setShowStatsInPool] = useState(false);

  const [pokemonFilter, setPokemonFilter] = useState("");
  const debouncedPokemonFilter = useDebouncedValue(pokemonFilter, 80);

  const [moveDex, setMoveDex] = useState(null);

  // Load all static data on startup
  useEffect(() => {
    let cancelled = false;

    Promise.all([
      loadStaticJson("subway_trainers_set45.json"),
      loadStaticJson("all_pokemon_sets.json"),
      loadStaticJson("moves_items_cache.json"),
      loadStaticJson("pokedex_gen5_index.json"),
    ]).then(([trainersData, setsData, movesData, pdexIndexData]) => {
      if (cancelled) return;

      setTrainersList(trainersData.trainers ?? []);

      const idx = new Map();
      for (const set of Object.values(setsData)) {
        if (typeof set.global_id === "number") idx.set(set.global_id, set);
      }
      setSetsIndex(idx);
      setMoveDex(movesData.moves ?? {});
      setPokedexIndex(pdexIndexData.pokemon ?? []);
      setDataReady(true);
    }).catch((e) => {
      console.error("Failed to load static data:", e);
      if (!cancelled) {
        setTrainersList([]);
        setSetsIndex(new Map());
        setMoveDex({});
        setPokedexIndex([]);
        setDataReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const poolSets = trainer?.sets ?? [];

  const setById = useMemo(() => {
    const m = new Map();
    for (const s of poolSets) m.set(s.global_id, s);
    return m;
  }, [poolSets]);

  const poolSortedDex = useMemo(() => {
    const copy = [...poolSets];
    copy.sort((a, b) => {
      const da = typeof a.dex_number === "number" ? a.dex_number : 999999;
      const db = typeof b.dex_number === "number" ? b.dex_number : 999999;
      if (da !== db) return da - db;
      return (a.global_id ?? 0) - (b.global_id ?? 0);
    });
    return copy;
  }, [poolSets]);

  const visiblePoolBase = useMemo(() => {
    const confirmedSet = new Set(confirmed);
    return poolSortedDex.filter((s) => {
      if (confirmedSet.has(s.global_id)) return false;
      const isDisc = discarded.has(s.global_id);
      if (isDisc && !showDiscarded) return false;
      return true;
    });
  }, [poolSortedDex, confirmed, discarded, showDiscarded]);

  const visiblePool = useMemo(() => {
    const nq = debouncedPokemonFilter.trim().toLowerCase();
    if (!nq) return visiblePoolBase;

    return visiblePoolBase.filter((s) => {
      const display = setDisplayName(s).toLowerCase();
      const species = (s.species ?? "").toLowerCase();
      return display.includes(nq) || species.includes(nq);
    });
  }, [visiblePoolBase, debouncedPokemonFilter]);

  const confirmedSets = useMemo(() => {
    const slots = [null, null, null, null];
    for (let i = 0; i < Math.min(4, confirmed.length); i++) {
      slots[i] = setById.get(confirmed[i]) ?? null;
    }
    return slots;
  }, [confirmed, setById]);

  // Trainer search autocomplete (client-side)
  useEffect(() => {
    const nq = debouncedQ.trim().toLowerCase();
    if (!nq || !trainersList) {
      setSuggestions([]);
      return;
    }
    setSuggestions(
      trainersList
        .filter((t) => {
          const en = (t.name_en ?? "").toLowerCase();
          const es = (t.name_es ?? "").toLowerCase();
          return en.includes(nq) || es.includes(nq);
        })
        .slice(0, 20)
    );
  }, [debouncedQ, trainersList]);

  function loadTrainer(trainerId) {
    if (!setsIndex || !trainersList) return;

    const trainerData = trainersList.find((t) => t.trainer_id === trainerId);
    if (!trainerData) return;

    const sets = (trainerData.pool_global_ids ?? [])
      .map((id) => setsIndex.get(id))
      .filter(Boolean);

    setTrainer({ ...trainerData, sets });
    setConfirmed([]);
    setDiscarded(new Set());
    setShowDiscarded(false);
    setShowStatsInPool(false);
    setPokemonFilter("");
  }

  function resetAll() {
    setTrainer(null);
    setConfirmed([]);
    setDiscarded(new Set());
    setShowDiscarded(false);
    setShowStatsInPool(false);
    setPokemonFilter("");
    setQ("");
    setSuggestions([]);
  }

  function toggleDiscard(globalId) {
    setDiscarded((prev) => {
      const next = new Set(prev);
      if (next.has(globalId)) next.delete(globalId);
      else next.add(globalId);
      return next;
    });
  }

  function confirmSet(set) {
    if (!set) return;
    if (confirmed.length >= 4) return;
    if (discarded.has(set.global_id)) return;

    setPokemonFilter("");
    setConfirmed((prev) => [...prev, set.global_id]);

    setDiscarded((prev) => {
      const next = new Set(prev);
      const confirmedSpecies = set.species;
      const confirmedItem = (set.item ?? "").trim();

      for (const s of poolSets) {
        if (s.global_id === set.global_id) continue;

        if (s.species === confirmedSpecies) {
          next.add(s.global_id);
          continue;
        }

        const item = (s.item ?? "").trim();
        if (confirmedItem && item && item === confirmedItem) {
          next.add(s.global_id);
        }
      }

      return next;
    });
  }

  function removeConfirmed(globalId) {
    setConfirmed((prev) => prev.filter((x) => x !== globalId));
  }

  const trainerTitle = trainer?.display_name ?? trainer?.name_en ?? "";

  return (
    <div className="page">
      <header className={`header ${trainer && activeTab === "enemy" ? "headerWithTrainer" : ""}`}>
        <div className="brand">
          <div className="brandTitle">Battle Subway Helper (B2/W2)</div>
          <div className="muted">
            By{" "}
            <a href="https://github.com/diegodzv" target="_blank" rel="noopener noreferrer" className="authorLink">
              @diegodzv
            </a>
          </div>
        </div>

        <div className="tabsBar" role="tablist" aria-label="App tabs">
          <button
            className={`tabBtn ${activeTab === "myteam" ? "tabBtnActive" : ""}`}
            onClick={() => setActiveTab("myteam")}
            role="tab"
            aria-selected={activeTab === "myteam"}
          >
            My Team
          </button>

          <button
            className={`tabBtn ${activeTab === "enemy" ? "tabBtnActive" : ""}`}
            onClick={() => setActiveTab("enemy")}
            role="tab"
            aria-selected={activeTab === "enemy"}
          >
            Enemy Trainer
          </button>

          <button
            className={`tabBtn ${activeTab === "calc" ? "tabBtnActive" : ""}`}
            onClick={() => setActiveTab("calc")}
            role="tab"
            aria-selected={activeTab === "calc"}
          >
            Calculator
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
          <button className="ghostBtn" onClick={resetAll} title="Reset enemy trainer state">
            Reset Enemy
          </button>
        </div>

        {activeTab === "calc" ? (
          <div className="searchBox" style={{ gridColumn: "1 / -1" }}>
            <input
              className="searchInput"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search trainer / Buscar entrenador (e.g. clerk, oficinista)..."
            />
            {!dataReady ? <div className="spinner" title="Loading data..." /> : null}

            {suggestions.length > 0 ? (
              <div className="dropdown dropdownAbove">
                {suggestions.map((s) => (
                  <button
                    key={s.trainer_id}
                    className="dropdownItem"
                    onClick={() => {
                      loadTrainer(s.trainer_id);
                      setSuggestions([]);
                    }}
                  >
                    <div className="dropdownName">{s.display_name ?? s.name_en}</div>
                    <div className="dropdownMeta muted">
                      {s.name_es ? (
                        <>
                          <span className="mono">{s.name_en}</span> · {s.section}
                        </>
                      ) : (
                        <>{s.section}</>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {trainer && activeTab === "enemy" ? (
          <div className="trainerBar">
            <div className="trainerBarLeft">
              <div className="h1">{trainerTitle}</div>
              <TrainerNamesLine trainer={trainer} />
            </div>

            <div className="trainerBarRight">
              <div className="togglesRow">
                <label className="toggle" title="Show / hide discarded sets">
                  <input type="checkbox" checked={showDiscarded} onChange={(e) => setShowDiscarded(e.target.checked)} />
                  <span>Show discarded</span>
                </label>

                <label className="toggle" title="Show / hide stats inside pool tiles">
                  <input
                    type="checkbox"
                    checked={showStatsInPool}
                    onChange={(e) => setShowStatsInPool(e.target.checked)}
                  />
                  <span>Show stats in pool</span>
                </label>
              </div>

              <div className="counts muted">
                shown <span className="mono">{visiblePool.length}</span> · confirmed{" "}
                <span className="mono">{confirmed.length}</span> · discarded{" "}
                <span className="mono">{discarded.size}</span> · total <span className="mono">{poolSets.length}</span>
              </div>
            </div>

            <div className="searchBox" style={{ gridColumn: "1 / -1", marginTop: 4 }}>
              <input
                className="searchInput"
                value={pokemonFilter}
                onChange={(e) => setPokemonFilter(e.target.value)}
                placeholder="Filter Pokémon in pool..."
              />
              {pokemonFilter ? (
                <button
                  className="ghostBtn"
                  onClick={() => setPokemonFilter("")}
                  style={{ position: "absolute", right: 6, top: 6, padding: "4px 8px" }}
                >
                  ✕
                </button>
              ) : null}
            </div>
          </div>
        ) : trainer && activeTab === "calc" ? (
          <div className="trainerBar">
            <div className="trainerBarLeft">
              <div className="h1">{trainerTitle}</div>
              <TrainerNamesLine trainer={trainer} />
            </div>
            <div className="trainerBarRight">
              <div className="muted" style={{ textAlign: "right" }}>
                Calculator uses this trainer’s pool only.
              </div>
            </div>
          </div>
        ) : null}
      </header>

      {activeTab === "myteam" ? (
        <main className="content">
          <MyTeamTab myTeam={myTeam} setMyTeam={setMyTeam} moveDex={moveDex} pokedexIndex={pokedexIndex} />
        </main>
      ) : activeTab === "enemy" ? (
        <EnemyTrainerTab
          searchProps={{ q, setQ, suggestions, setSuggestions, loadTrainer, dataReady }}
          trainer={trainer}
          confirmed={confirmed}
          discarded={discarded}
          showDiscarded={showDiscarded}
          setShowDiscarded={setShowDiscarded}
          showStatsInPool={showStatsInPool}
          setShowStatsInPool={setShowStatsInPool}
          pokemonFilter={pokemonFilter}
          setPokemonFilter={setPokemonFilter}
          debouncedPokemonFilter={debouncedPokemonFilter}
          moveDex={moveDex}
          poolSets={poolSets}
          visiblePool={visiblePool}
          confirmedSets={confirmedSets}
          toggleDiscard={toggleDiscard}
          confirmSet={confirmSet}
          removeConfirmed={removeConfirmed}
        />
      ) : (
        <main className="content">
          <CalculatorTab trainer={trainer} confirmedSets={confirmedSets} myTeam={myTeam} moveDex={moveDex} />
        </main>
      )}
    </div>
  );
}
