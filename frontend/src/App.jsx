import { useEffect, useMemo, useState } from "react";
import "./App.css";

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function StatRow({ label, value }) {
  return (
    <div className="statRow">
      <span className="muted">{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}

function Sprite({ url, alt }) {
  if (!url) return <div className="spriteFallback">?</div>;
  return <img className="sprite" src={url} alt={alt} loading="lazy" />;
}

function SetCard({ set, onClick, selected, tag }) {
  const spe = set?.stats_lv50?.Spe ?? "-";
  return (
    <button
      className={`card ${selected ? "cardSelected" : ""}`}
      onClick={onClick}
      title={`${set.species} (#${set.global_id})`}
    >
      <div className="cardTop">
        <Sprite url={set.sprite_url_pokeapi} alt={set.species} />
        <div className="cardTitle">
          <div className="name">{set.species}</div>
          <div className="meta muted">
            <span className="mono">#{set.global_id}</span> · Spe{" "}
            <span className="mono">{spe}</span>
          </div>
        </div>
      </div>

      {tag ? <div className="tag">{tag}</div> : null}
    </button>
  );
}

export default function App() {
  // Search
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 150);
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Selected trainer
  const [trainer, setTrainer] = useState(null);
  const [selectedSet, setSelectedSet] = useState(null);

  // Filtering
  const [seen, setSeen] = useState([]);
  const [filterInfo, setFilterInfo] = useState(null);
  const [isFiltering, setIsFiltering] = useState(false);

  const poolId = trainer?.pool_id ?? null;

  // Search suggestions
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const nq = debouncedQ.trim();
      if (!nq) {
        setSuggestions([]);
        return;
      }
      setIsSearching(true);
      try {
        const res = await fetch(`/trainers/search?q=${encodeURIComponent(nq)}&limit=20`);
        if (!res.ok) throw new Error(`search failed: ${res.status}`);
        const data = await res.json();
        if (!cancelled) setSuggestions(data);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [debouncedQ]);

  async function loadTrainer(trainerId) {
    setTrainer(null);
    setSelectedSet(null);
    setSeen([]);
    setFilterInfo(null);

    const res = await fetch(`/trainers/${trainerId}`);
    if (!res.ok) {
      alert("No pude cargar el entrenador.");
      return;
    }
    const data = await res.json();
    setTrainer(data);
  }

  // Filtering whenever seen changes
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!poolId) return;
      setIsFiltering(true);
      try {
        const res = await fetch(`/pools/${poolId}/filter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seen_global_ids: seen }),
        });
        if (!res.ok) throw new Error(`filter failed: ${res.status}`);
        const data = await res.json();
        if (!cancelled) setFilterInfo(data);
      } catch {
        if (!cancelled) setFilterInfo(null);
      } finally {
        if (!cancelled) setIsFiltering(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [poolId, seen]);

  const seenSet = useMemo(() => new Set(seen), [seen]);

  const poolSets = trainer?.sets ?? [];
  const remainingSets = filterInfo?.possible_remaining_sets ?? [];

  function markSeen(globalId) {
    if (seenSet.has(globalId)) return;
    if (seen.length >= 4) return; // 4v4
    setSeen((prev) => [...prev, globalId]);
  }

  function unmarkSeen(globalId) {
    setSeen((prev) => prev.filter((x) => x !== globalId));
  }

  function resetAll() {
    setTrainer(null);
    setSelectedSet(null);
    setSeen([]);
    setFilterInfo(null);
    setQ("");
    setSuggestions([]);
  }

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <div className="brandTitle">Metro Batalla (B2/W2)</div>
          <div className="muted">Set 4/5 · selector + filtro 4v4</div>
        </div>

        <div className="searchBox">
          <input
            className="searchInput"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Busca entrenador (ej: "battle girl", "scientist")...'
          />
          {isSearching ? <div className="spinner" title="Buscando..." /> : null}

          {suggestions.length > 0 ? (
            <div className="dropdown">
              {suggestions.map((s) => (
                <button
                  key={s.trainer_id}
                  className="dropdownItem"
                  onClick={() => {
                    loadTrainer(s.trainer_id);
                    setSuggestions([]);
                  }}
                >
                  <div className="dropdownName">{s.name_en}</div>
                  <div className="dropdownMeta muted">{s.section}</div>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button className="ghostBtn" onClick={resetAll}>
          Reset
        </button>
      </header>

      <main className="content">
        {!trainer ? (
          <div className="empty">
            <div className="emptyTitle">Selecciona un entrenador</div>
            <div className="muted">
              Escribe arriba para autocompletar y elige uno. Luego marca Pokémon según te
              los enseñe.
            </div>
          </div>
        ) : (
          <div className="grid">
            <section className="panel">
              <div className="panelTitle">
                <div>
                  <div className="h1">{trainer.name_en}</div>
                  <div className="muted">
                    {trainer.section} · pool <span className="mono">{trainer.pool_id}</span> ·{" "}
                    <span className="mono">{trainer.pool_size}</span> sets
                  </div>
                </div>
              </div>

              <div className="subTitle">Pool completo</div>
              <div className="cards">
                {poolSets.map((s) => (
                  <SetCard
                    key={s.global_id}
                    set={s}
                    selected={selectedSet?.global_id === s.global_id}
                    tag={seenSet.has(s.global_id) ? "Visto" : ""}
                    onClick={() => setSelectedSet(s)}
                  />
                ))}
              </div>
            </section>

            <aside className="side">
              <section className="panel">
                <div className="panelTitle">
                  <div className="h2">Vistos ({seen.length}/4)</div>
                  {isFiltering ? <div className="muted">calculando…</div> : null}
                </div>

                {seen.length === 0 ? (
                  <div className="muted">Marca los Pokémon que vaya sacando el rival.</div>
                ) : (
                  <div className="seenChips">
                    {seen.map((gid) => (
                      <button
                        key={gid}
                        className="chip"
                        onClick={() => unmarkSeen(gid)}
                        title="Quitar"
                      >
                        <span className="mono">#{gid}</span> ✕
                      </button>
                    ))}
                  </div>
                )}

                {filterInfo ? (
                  <div className="box">
                    <div className="statRow">
                      <span className="muted">Equipos posibles</span>
                      <span className="mono">{filterInfo.num_possible_teams}</span>
                    </div>
                    <div className="statRow">
                      <span className="muted">Restantes posibles</span>
                      <span className="mono">
                        {filterInfo.possible_remaining_global_ids.length}
                      </span>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="panel">
                <div className="panelTitle">
                  <div className="h2">Detalle</div>
                  {selectedSet ? (
                    <button
                      className="primaryBtn"
                      onClick={() => markSeen(selectedSet.global_id)}
                      disabled={seenSet.has(selectedSet.global_id) || seen.length >= 4}
                    >
                      Marcar visto
                    </button>
                  ) : null}
                </div>

                {!selectedSet ? (
                  <div className="muted">Haz click en un Pokémon para ver su set.</div>
                ) : (
                  <div className="detail">
                    <div className="detailTop">
                      <Sprite url={selectedSet.sprite_url_pokeapi} alt={selectedSet.species} />
                      <div>
                        <div className="h2">{selectedSet.species}</div>
                        <div className="muted">
                          <span className="mono">#{selectedSet.global_id}</span> ·{" "}
                          {selectedSet.nature} · {selectedSet.item}
                        </div>
                      </div>
                    </div>

                    <div className="box">
                      <div className="h3">Stats (Lv 50)</div>
                      <StatRow label="HP" value={selectedSet.stats_lv50?.HP ?? "-"} />
                      <StatRow label="Atk" value={selectedSet.stats_lv50?.Atk ?? "-"} />
                      <StatRow label="Def" value={selectedSet.stats_lv50?.Def ?? "-"} />
                      <StatRow label="SpA" value={selectedSet.stats_lv50?.SpA ?? "-"} />
                      <StatRow label="SpD" value={selectedSet.stats_lv50?.SpD ?? "-"} />
                      <StatRow label="Spe" value={selectedSet.stats_lv50?.Spe ?? "-"} />
                    </div>

                    <div className="box">
                      <div className="h3">Movimientos</div>
                      <ul className="moves">
                        {(selectedSet.moves ?? []).map((m) => (
                          <li key={m} className="mono">
                            {m}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="box">
                      <div className="h3">EVs</div>
                      <div className="mono">{selectedSet.evs}</div>
                    </div>
                  </div>
                )}
              </section>

              <section className="panel">
                <div className="panelTitle">
                  <div className="h2">Posibles restantes</div>
                </div>

                {!filterInfo ? (
                  <div className="muted">Selecciona un entrenador para empezar.</div>
                ) : remainingSets.length === 0 && seen.length > 0 ? (
                  <div className="muted">
                    No quedan posibilidades (¿marcaste un ID que no está en el pool?).
                  </div>
                ) : (
                  <div className="cards compact">
                    {remainingSets.map((s) => (
                      <SetCard
                        key={s.global_id}
                        set={s}
                        selected={selectedSet?.global_id === s.global_id}
                        onClick={() => setSelectedSet(s)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </aside>
          </div>
        )}
      </main>

      <footer className="footer muted">
        Tip: puedes quitar “vistos” haciendo click en los chips.
      </footer>
    </div>
  );
}
